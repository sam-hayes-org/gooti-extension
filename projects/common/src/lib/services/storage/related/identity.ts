import {
  CryptoHelper,
  Identity_DECRYPTED,
  Identity_ENCRYPTED,
  NostrHelper,
  StorageService,
} from '@common';
import { colorForPubkey, identityPubkey, readIdentityColor } from '../../../identity/appearance';
import { SyncLiveIdentity, stampIdentity, stampSiteDeleted, tombstoneIdentity } from '../../../sync/state';
import type { ConnectedBunker } from '../../../nip46/client';
import { persistNostrSyncSeal } from './seal-nostr-sync';

export const editNick = async function (
  this: StorageService,
  identityId: string,
  newNick: string,
) {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getVaultHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  const browserSessionDataIdentity =
    browserSessionData[`identity_${identityId}`];
  if (!browserSessionDataIdentity) {
    throw new Error('Identity not found in browser session data.');
  }
  browserSessionDataIdentity.nick = newNick;
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // v3 seals a new IV each time, so the stored id cannot be recomputed.
  const encryptedIdentityId = await this.matchEncryptedId(
    browserSyncData.identities,
    identityId,
  );
  const browserSyncDataIdentity = encryptedIdentityId
    ? browserSyncData[`identity_${encryptedIdentityId}`]
    : undefined;
  if (!browserSyncDataIdentity) {
    throw new Error('Identity not found in browser sync data.');
  }
  browserSyncDataIdentity.nick = await this.encrypt(newNick);
  await this.getVaultHandler().saveAndSetPartialData_Identity({
    identity: browserSyncDataIdentity,
  });

  if (browserSessionData.nostrSync) {
    browserSessionData.nostrSync = stampIdentity(
      browserSessionData.nostrSync,
      liveIdentity(browserSessionDataIdentity),
      Date.now(),
    );
    await persistNostrSyncSeal.call(this);
  }
};

export const addIdentity = async function (
  this: StorageService,
  data: {
    nick: string;
    privkeyString: string;
  },
): Promise<void> {
  this.assureIsInitialized();

  const privkey = NostrHelper.getNostrPrivkeyObject(
    data.privkeyString.toLowerCase(),
  ).hex;
  const pubkey = NostrHelper.pubkeyFromPrivkey(privkey);
  rejectDuplicatePubkey.call(this, pubkey, privkey);

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (!browserSessionData) {
    throw new Error('Browser session data is undefined.');
  }

  const decryptedIdentity: Identity_DECRYPTED = {
    id: CryptoHelper.v4(),
    nick: data.nick,
    pubkey,
    privkey,
    createdAt: new Date().toISOString(),
    color: colorForPubkey(pubkey),
  };

  // Add the new identity to the session data.
  browserSessionData.identities.push(decryptedIdentity.id);
  let isFirstIdentity = false;
  if (browserSessionData.identities.length === 1) {
    isFirstIdentity = true;
    browserSessionData.selectedIdentityId = decryptedIdentity.id;
  }
  browserSessionData[`identity_${decryptedIdentity.id}`] = decryptedIdentity;
  this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Encrypt the new identity and add it to the sync data.
  const encryptedIdentity = await encryptIdentity.call(this, decryptedIdentity);
  const encryptedIdentities = [
    ...(this.getVaultHandler().browserSyncData?.identities ?? []),
    encryptedIdentity.id,
  ];

  await this.getVaultHandler().saveAndSetPartialData_Identities({
    identities: encryptedIdentities,
  });
  await this.getVaultHandler().saveAndSetPartialData_Identity({
    identity: encryptedIdentity,
  });

  if (isFirstIdentity) {
    await this.getVaultHandler().saveAndSetPartialData_SelectedIdentityId(
      {
        selectedIdentityId: encryptedIdentity.id,
      },
    );
  }

  if (browserSessionData.nostrSync) {
    browserSessionData.nostrSync = stampIdentity(
      browserSessionData.nostrSync,
      liveIdentity(decryptedIdentity),
      Date.now(),
    );
    await persistNostrSyncSeal.call(this);
  }
};

export const deleteIdentity = async function (
  this: StorageService,
  identityId: string | undefined,
): Promise<void> {
  this.assureIsInitialized();

  if (!identityId) {
    return;
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getVaultHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  const removedIdentity = browserSessionData[`identity_${identityId}`];
  const removedSiteHosts: string[] = [];
  for (const siteId of browserSessionData.sites ?? []) {
    const site = browserSessionData[`site_${siteId}`];
    if (site?.identityId === identityId) {
      removedSiteHosts.push(site.host);
    }
  }
  if (removedIdentity && browserSessionData.nostrSync) {
    const permissions = browserSessionData.permissions.flatMap((permissionId) => {
      const permission = browserSessionData[`permission_${permissionId}`];
      if (!permission || permission.identityId !== identityId) {
        return [];
      }
      return [
        {
          identityPubkey: identityPubkey(removedIdentity),
          host: permission.host,
          method: permission.method,
          methodPolicy: permission.methodPolicy,
          ...(permission.kind !== undefined ? { kind: permission.kind } : {}),
        },
      ];
    });
    const now = Date.now();
    let next = tombstoneIdentity(
      browserSessionData.nostrSync,
      liveIdentity(removedIdentity),
      permissions,
      now,
    );
    const pubkey = identityPubkey(removedIdentity);
    for (const host of removedSiteHosts) {
      next = stampSiteDeleted(next, { host, identityPubkey: pubkey }, now);
    }
    browserSessionData.nostrSync = next;
    await persistNostrSyncSeal.call(this);
  }

  browserSessionData.identities = browserSessionData.identities.filter(
    (x) => x !== identityId,
  );

  // Find permissions to delete.
  const toBeDeletedPermissionIds: string[] = [];
  browserSessionData.permissions.forEach((permissionId) => {
    const permission = browserSessionData[`permission_${permissionId}`];
    if (permission?.identityId === identityId) {
      toBeDeletedPermissionIds.push(permissionId);
    }
  });

  browserSessionData.permissions = browserSessionData.permissions.filter(
    (x) => !toBeDeletedPermissionIds.includes(x),
  );
  toBeDeletedPermissionIds.forEach((permissionId) => {
    delete browserSessionData[`permission_${permissionId}`];
  });

  const removedSessionSiteIds: string[] = [];
  for (const siteId of browserSessionData.sites ?? []) {
    const site = browserSessionData[`site_${siteId}`];
    if (site?.identityId === identityId) {
      removedSessionSiteIds.push(siteId);
      delete browserSessionData[`site_${siteId}`];
    }
  }
  if (browserSessionData.sites) {
    browserSessionData.sites = browserSessionData.sites.filter(
      (siteId) => !removedSessionSiteIds.includes(siteId),
    );
  }

  if (browserSessionData.selectedIdentityId === identityId) {
    // Choose another identity to be selected or null if there is none.
    browserSessionData.selectedIdentityId =
      browserSessionData.identities.length > 0
        ? browserSessionData.identities[0]
        : null;
  }
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);
  if (removedSessionSiteIds.length > 0) {
    await this.getBrowserSessionHandler().removeKeys(
      removedSessionSiteIds.map((siteId) => `site_${siteId}`),
    );
  }

  // UPDATE Sync Data.

  // Handle the identity. Match by opening ids; v3 ciphertext is not stable.
  const encryptedIdentityId = await this.matchEncryptedId(
    browserSyncData.identities,
    identityId,
  );
  if (!encryptedIdentityId) {
    throw new Error('Identity not found in browser sync data.');
  }
  await this.getVaultHandler().saveAndSetPartialData_Identities({
    identities: browserSyncData.identities.filter(
      (x) => x !== encryptedIdentityId,
    ),
  });
  await this.getVaultHandler().deleteSaveAndUnsetPartialData_Identity({
    identityId: encryptedIdentityId,
  });

  // Handle the permissions
  const toBeDeletedEncryptedPermissionIds: string[] = [];
  for (const encryptedPermissionId of browserSyncData.permissions) {
    const encryptedPermission =
      browserSyncData[`permission_${encryptedPermissionId}`];
    if (
      encryptedPermission &&
      (await this.ciphertextMatches(encryptedPermission.identityId, identityId))
    ) {
      toBeDeletedEncryptedPermissionIds.push(encryptedPermissionId);
    }
  }
  await this.getVaultHandler().saveAndSetPartialData_Permissions({
    permissions: browserSyncData.permissions.filter(
      (x) => !toBeDeletedEncryptedPermissionIds.includes(x),
    ),
  });
  for (const encryptedPermissionId of toBeDeletedEncryptedPermissionIds) {
    await this.getVaultHandler().deleteSaveAndUnsetPartialData_Permission(
      {
        permissionId: encryptedPermissionId,
      },
    );
  }

  const removedVaultSiteKeys: string[] = [];
  const keptSiteIds: string[] = [];
  for (const encryptedSiteId of browserSyncData.sites ?? []) {
    const encryptedSite = browserSyncData[`site_${encryptedSiteId}`];
    if (
      encryptedSite &&
      (await this.ciphertextMatches(encryptedSite.identityId, identityId))
    ) {
      removedVaultSiteKeys.push(`site_${encryptedSiteId}`);
      delete browserSyncData[`site_${encryptedSiteId}`];
      continue;
    }
    keptSiteIds.push(encryptedSiteId);
  }
  if (removedVaultSiteKeys.length > 0) {
    browserSyncData.sites = keptSiteIds;
    await this.getVaultHandler().saveAndSetFullData(browserSyncData);
    await this.getVaultHandler().removeKeys(removedVaultSiteKeys);
  }

  // Handle the selected identity id
  await this.getVaultHandler().saveAndSetPartialData_SelectedIdentityId({
    selectedIdentityId:
      browserSessionData.selectedIdentityId === null
        ? null
        : await this.encrypt(browserSessionData.selectedIdentityId),
  });

};

export const switchIdentity = async function (
  this: StorageService,
  identityId: string | null,
): Promise<void> {
  this.assureIsInitialized();

  // Check, if the identity really exists.
  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;

  if (!browserSessionData?.identities.find((x) => x === identityId)) {
    return;
  }

  browserSessionData.selectedIdentityId = identityId;
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  const encryptedIdentityId =
    identityId === null ? null : await this.encrypt(identityId);
  await this.getVaultHandler().saveAndSetPartialData_SelectedIdentityId({
    selectedIdentityId: encryptedIdentityId,
  });
};

export const encryptIdentity = async function (
  this: StorageService,
  identity: Identity_DECRYPTED,
): Promise<Identity_ENCRYPTED> {
  const encryptedIdentity: Identity_ENCRYPTED = {
    id: await this.encrypt(identity.id),
    nick: await this.encrypt(identity.nick),
    createdAt: await this.encrypt(identity.createdAt),
    pubkey: await this.encrypt(identity.pubkey),
    color: await this.encrypt(colorForPubkey(identity.pubkey, identity.color)),
  };
  if (identity.privkey) {
    encryptedIdentity.privkey = await this.encrypt(identity.privkey);
  }
  if (identity.bunker) {
    encryptedIdentity.bunker = await this.encrypt(JSON.stringify(identity.bunker));
  }

  return encryptedIdentity;
};

export const decryptIdentities = async function (
  this: StorageService,
  identities: Identity_ENCRYPTED[],
  withLockedVault: { iv: string; password: string } | undefined = undefined,
): Promise<Identity_DECRYPTED[]> {
  const decryptedIdentities: Identity_DECRYPTED[] = [];

  for (const identity of identities) {
    const decryptedIdentity = await decryptIdentity.call(
      this,
      identity,
      withLockedVault,
    );
    decryptedIdentities.push(decryptedIdentity);
  }

  return decryptedIdentities;
};

export const decryptIdentity = async function (
  this: StorageService,
  identity: Identity_ENCRYPTED,
  withLockedVault: { iv: string; password: string } | undefined = undefined,
): Promise<Identity_DECRYPTED> {
  const open = (value: string) =>
    withLockedVault === undefined
      ? this.decrypt(value, 'string')
      : this.decryptWithLockedVault(
          value,
          'string',
          withLockedVault.iv,
          withLockedVault.password,
        );
  const privkey = identity.privkey ? await open(identity.privkey) : undefined;
  const storedPubkey = identity.pubkey ? await open(identity.pubkey) : undefined;
  const bunkerJson = identity.bunker ? await open(identity.bunker) : undefined;
  const color = await openSealedColor(identity.color, open);
  return assembleDecryptedIdentity({
    id: await open(identity.id),
    nick: await open(identity.nick),
    createdAt: await open(identity.createdAt),
    ...(privkey ? { privkey } : {}),
    ...(storedPubkey ? { pubkey: storedPubkey } : {}),
    ...(color ? { color } : {}),
    ...(bunkerJson ? { bunkerJson } : {}),
  });
};

export function assembleDecryptedIdentity(parts: {
  id: string;
  nick: string;
  createdAt: string;
  privkey?: string;
  pubkey?: string;
  color?: string;
  bunkerJson?: string;
}): Identity_DECRYPTED {
  const pubkey = /^[0-9a-f]{64}$/i.test(parts.pubkey ?? '')
    ? (parts.pubkey as string).toLowerCase()
    : parts.privkey
      ? NostrHelper.pubkeyFromPrivkey(parts.privkey)
      : '';
  if (!/^[0-9a-f]{64}$/.test(pubkey)) {
    throw new Error('Identity has no public key.');
  }
  const identity: Identity_DECRYPTED = {
    id: parts.id,
    nick: parts.nick,
    createdAt: parts.createdAt,
    pubkey,
    color: readIdentityColor(parts.color) ?? colorForPubkey(pubkey),
  };
  if (parts.privkey) {
    identity.privkey = parts.privkey;
  }
  const bunker = parts.bunkerJson ? parseStoredBunker(parts.bunkerJson) : undefined;
  if (bunker) {
    identity.bunker = bunker;
  }
  return identity;
}

export const addBunkerIdentity = async function (
  this: StorageService,
  data: { nick: string; connected: ConnectedBunker },
): Promise<void> {
  this.assureIsInitialized();
  const existing = findByPubkey.call(this, data.connected.pubkey);
  if (existing?.privkey) {
    throw new Error(`An identity with this public key already exists: ${existing.nick}`);
  }
  if (existing) {
    existing.nick = data.nick;
    existing.bunker = bunkerFromConnected(data.connected, existing.bunker);
    await writeExistingIdentity.call(this, existing, true);
    return;
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (!browserSessionData) {
    throw new Error('Browser session data is undefined.');
  }
  const decryptedIdentity: Identity_DECRYPTED = {
    id: CryptoHelper.v4(),
    nick: data.nick,
    pubkey: data.connected.pubkey,
    createdAt: new Date().toISOString(),
    color: colorForPubkey(data.connected.pubkey),
    bunker: bunkerFromConnected(data.connected),
  };
  browserSessionData.identities.push(decryptedIdentity.id);
  let isFirstIdentity = false;
  if (browserSessionData.identities.length === 1) {
    isFirstIdentity = true;
    browserSessionData.selectedIdentityId = decryptedIdentity.id;
  }
  browserSessionData[`identity_${decryptedIdentity.id}`] = decryptedIdentity;
  this.getBrowserSessionHandler().saveFullData(browserSessionData);

  const encryptedIdentity = await encryptIdentity.call(this, decryptedIdentity);
  await this.getVaultHandler().saveAndSetPartialData_Identities({
    identities: [
      ...(this.getVaultHandler().browserSyncData?.identities ?? []),
      encryptedIdentity.id,
    ],
  });
  await this.getVaultHandler().saveAndSetPartialData_Identity({ identity: encryptedIdentity });
  if (isFirstIdentity) {
    await this.getVaultHandler().saveAndSetPartialData_SelectedIdentityId({
      selectedIdentityId: encryptedIdentity.id,
    });
  }
  if (browserSessionData.nostrSync) {
    browserSessionData.nostrSync = stampIdentity(
      browserSessionData.nostrSync,
      liveIdentity(decryptedIdentity),
      Date.now(),
    );
    await persistNostrSyncSeal.call(this);
  }
};

export const saveBunkerSession = async function (
  this: StorageService,
  identityId: string,
  connected: ConnectedBunker,
): Promise<void> {
  this.assureIsInitialized();
  const identity = this.getBrowserSessionHandler().browserSessionData?.[`identity_${identityId}`];
  if (!identity) {
    throw new Error('Identity not found in browser session data.');
  }
  if (identity.privkey) {
    throw new Error('This identity already has a private key.');
  }
  if (identity.pubkey !== connected.pubkey) {
    throw new Error('This link is for a different public key.');
  }
  identity.bunker = bunkerFromConnected(connected, identity.bunker);
  await writeExistingIdentity.call(this, identity, true);
};

export const saveBunkerAskSite = async function (
  this: StorageService,
  identityId: string,
  askSite: boolean,
): Promise<void> {
  this.assureIsInitialized();
  const identity = this.getBrowserSessionHandler().browserSessionData?.[`identity_${identityId}`];
  if (!identity?.bunker) {
    throw new Error('This identity has no bunker.');
  }
  if (identity.privkey) {
    throw new Error('This identity already has a private key.');
  }
  if (identity.bunker.askSite === askSite) {
    return;
  }
  identity.bunker.askSite = askSite;
  await writeExistingIdentity.call(this, identity, true);
};

export const disconnectBunker = async function (
  this: StorageService,
  identityId: string,
): Promise<void> {
  this.assureIsInitialized();
  const identity = this.getBrowserSessionHandler().browserSessionData?.[`identity_${identityId}`];
  if (!identity?.bunker) {
    throw new Error('This identity has no bunker.');
  }
  delete identity.bunker.clientSecretKey;
  await writeExistingIdentity.call(this, identity, false);
};

function rejectDuplicatePubkey(this: StorageService, pubkey: string, privkey: string): void {
  const session = this.getBrowserSessionHandler().browserSessionData;
  for (const identityId of session?.identities ?? []) {
    const identity = session?.[`identity_${identityId}`];
    if (identity?.privkey === privkey || identity?.pubkey === pubkey) {
      throw new Error(`An identity with the same private key already exists: ${identity.nick}`);
    }
  }
}

function findByPubkey(this: StorageService, pubkey: string): Identity_DECRYPTED | undefined {
  const session = this.getBrowserSessionHandler().browserSessionData;
  for (const identityId of session?.identities ?? []) {
    const identity = session?.[`identity_${identityId}`];
    if (identity?.pubkey === pubkey) {
      return identity;
    }
  }
  return undefined;
}

function bunkerFromConnected(
  connected: ConnectedBunker,
  previous?: Identity_DECRYPTED['bunker'],
): NonNullable<Identity_DECRYPTED['bunker']> {
  const bunker: NonNullable<Identity_DECRYPTED['bunker']> = {
    pubkey: connected.bunker.pubkey,
    relays: [...connected.bunker.relays],
    secret: connected.bunker.secret,
    clientSecretKey: connected.clientSecretKeyHex,
  };
  if (typeof previous?.askSite === 'boolean') {
    bunker.askSite = previous.askSite;
  }
  return bunker;
}

function liveIdentity(identity: Identity_DECRYPTED): SyncLiveIdentity {
  return {
    pubkey: identity.pubkey,
    ...(identity.privkey ? { privkey: identity.privkey } : {}),
    nick: identity.nick,
    createdAt: identity.createdAt,
    ...(identity.color ? { color: identity.color } : {}),
    ...(identity.bunker
      ? {
          bunker: {
            pubkey: identity.bunker.pubkey,
            relays: [...identity.bunker.relays],
            secret: identity.bunker.secret,
            ...(typeof identity.bunker.askSite === 'boolean' ? { askSite: identity.bunker.askSite } : {}),
          },
        }
      : {}),
  };
}

async function writeExistingIdentity(
  this: StorageService,
  identity: Identity_DECRYPTED,
  stamp: boolean,
): Promise<void> {
  const session = this.getBrowserSessionHandler().browserSessionData;
  const vault = this.getVaultHandler().browserSyncData;
  if (!session || !vault) {
    throw new Error('Browser session or sync data is undefined.');
  }
  session[`identity_${identity.id}`] = identity;
  await this.getBrowserSessionHandler().saveFullData(session);
  const encryptedId = await this.matchEncryptedId(vault.identities, identity.id);
  const stored = encryptedId ? vault[`identity_${encryptedId}`] : undefined;
  if (!stored) {
    throw new Error('Identity not found in browser sync data.');
  }
  const sealed = await encryptIdentity.call(this, identity);
  sealed.id = stored.id;
  await this.getVaultHandler().saveAndSetPartialData_Identity({ identity: sealed });
  if (stamp && session.nostrSync) {
    session.nostrSync = stampIdentity(session.nostrSync, liveIdentity(identity), Date.now());
    await persistNostrSyncSeal.call(this);
  }
}

function parseStoredBunker(json: string): Identity_DECRYPTED['bunker'] | undefined {
  try {
    const value = JSON.parse(json) as {
      pubkey?: unknown;
      relays?: unknown;
      secret?: unknown;
      clientSecretKey?: unknown;
      askSite?: unknown;
    };
    if (typeof value.pubkey !== 'string' || !Array.isArray(value.relays)) {
      return undefined;
    }
    if (value.relays.some((relay) => typeof relay !== 'string')) {
      return undefined;
    }
    return {
      pubkey: value.pubkey,
      relays: value.relays as string[],
      secret: typeof value.secret === 'string' ? value.secret : null,
      ...(typeof value.clientSecretKey === 'string' ? { clientSecretKey: value.clientSecretKey } : {}),
      ...(value.askSite === true || value.askSite === false ? { askSite: value.askSite } : {}),
    };
  } catch {
    return undefined;
  }
}

async function openSealedColor(
  sealed: string | undefined,
  open: (value: string) => Promise<string>,
): Promise<string | undefined> {
  if (!sealed) {
    return undefined;
  }
  return readIdentityColor(await open(sealed));
}
