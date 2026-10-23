import {
  BrowserSessionData,
  BrowserSyncData,
  CryptoHelper,
  Identity_DECRYPTED,
  Identity_ENCRYPTED,
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
  Site_DECRYPTED,
  Site_ENCRYPTED,
  StorageService,
  VAULT_CANARY,
} from '@common';
import { parseBackupState } from '../../../backup/state';
import { assembleDecryptedIdentity, decryptIdentities, encryptIdentity } from './identity';
import { decryptPermissions, encryptPermission } from './permission';

export function keysAbsentFrom(storedKeys: string[], next: object): string[] {
  return storedKeys.filter((key) => !(key in next));
}

/**
 * Keys a v3 record no longer uses: the shared IV, the password hash,
 * and identity or permission items that are not in the id arrays.
 */
export function retiredVaultStorageKeys(
  stored: Record<string, unknown>,
  vault: BrowserSyncData,
): string[] {
  if (vault.version < 3) {
    return [];
  }

  const referenced = new Set<string>([
    ...vault.identities.map((id) => `identity_${id}`),
    ...vault.permissions.map((id) => `permission_${id}`),
    ...(vault.sites ?? []).map((id) => `site_${id}`),
  ]);

  return Object.keys(stored).filter((key) => {
    if (key === 'iv' || key === 'vaultHash') {
      return true;
    }
    if (key.startsWith('identity_') || key.startsWith('permission_') || key.startsWith('site_')) {
      return !referenced.has(key);
    }
    return false;
  });
}

export const createNewVault = async function (
  this: StorageService,
  password: string,
): Promise<void> {
  this.assureIsInitialized();

  const sessionData: BrowserSessionData = {
    iv: '',
    vaultPassword: password,
    identities: [],
    permissions: [],
    sites: [],
    selectedIdentityId: null,
  };

  await this.getBrowserSessionHandler().saveFullData(sessionData);
  this.getBrowserSessionHandler().setFullData(sessionData);
  await persistVaultV3.call(this);
};

export const unlockVault = async function (
  this: StorageService,
  password: string,
): Promise<void> {
  this.assureIsInitialized();

  if (this.getBrowserSessionHandler().browserSessionData) {
    throw new Error(
      'Browser session data is available. Should only happen when the vault is unlocked',
    );
  }

  const browserSyncData = this.getVaultHandler().browserSyncData;
  if (!browserSyncData) {
    throw new Error(
      'Browser sync data is not available. Should have been loaded before.',
    );
  }

  if (browserSyncData.version >= 3) {
    await unlockVaultV3.call(this, password, browserSyncData);
    return;
  }

  await unlockLegacyVault.call(this, password, browserSyncData);
  await persistVaultV3.call(this);
};

async function unlockVaultV3(
  this: StorageService,
  password: string,
  browserSyncData: BrowserSyncData,
): Promise<void> {
  if (!browserSyncData.salt || !browserSyncData.canary) {
    throw new Error('Vault data is incomplete.');
  }

  const key = await CryptoHelper.v3Key(password, browserSyncData.salt);
  let opened: string;
  try {
    opened = await CryptoHelper.open(browserSyncData.canary, key);
  } catch {
    throw new Error('Invalid password.');
  }
  if (opened !== VAULT_CANARY) {
    throw new Error('Invalid password.');
  }

  const decryptedIdentities: Identity_DECRYPTED[] = [];
  for (const identityId of browserSyncData.identities) {
    const encryptedIdentity = browserSyncData[`identity_${identityId}`];
    if (!encryptedIdentity) {
      continue;
    }
    decryptedIdentities.push(await openIdentity(encryptedIdentity, key));
  }

  const decryptedPermissions: Permission_DECRYPTED[] = [];
  for (const permissionId of browserSyncData.permissions) {
    const encryptedPermission = browserSyncData[`permission_${permissionId}`];
    if (!encryptedPermission) {
      continue;
    }
    decryptedPermissions.push(await openPermission(encryptedPermission, key));
  }

  const decryptedSites: Site_DECRYPTED[] = [];
  for (const siteId of browserSyncData.sites ?? []) {
    const encryptedSite = browserSyncData[`site_${siteId}`];
    if (!encryptedSite) {
      continue;
    }
    decryptedSites.push(await openSite(encryptedSite, key));
  }

  const decryptedSelectedIdentityId =
    browserSyncData.selectedIdentityId === null
      ? null
      : await CryptoHelper.open(browserSyncData.selectedIdentityId, key);
  const backupState =
    typeof browserSyncData.backupState === 'string' && browserSyncData.backupState.length > 0
      ? openBackupState(await CryptoHelper.open(browserSyncData.backupState, key))
      : undefined;

  const kept = withoutGetRelays(decryptedPermissions);
  const browserSessionData: BrowserSessionData = {
    vaultPassword: password,
    salt: browserSyncData.salt,
    iv: '',
    permissions: kept.permissions.map((x) => x.id),
    identities: decryptedIdentities.map((x) => x.id),
    sites: decryptedSites.map((x) => x.id),
    selectedIdentityId: decryptedSelectedIdentityId,
    ...(backupState ? { backupState } : {}),
  };
  decryptedIdentities.forEach((x) => {
    browserSessionData[`identity_${x.id}`] = x;
  });
  kept.permissions.forEach((x) => {
    browserSessionData[`permission_${x.id}`] = x;
  });
  decryptedSites.forEach((x) => {
    browserSessionData[`site_${x.id}`] = x;
  });

  await this.getBrowserSessionHandler().saveFullData(browserSessionData);
  this.getBrowserSessionHandler().setFullData(browserSessionData);
  this.clearVaultKeyCache();

  const hadIdentityRelays =
    Array.isArray(browserSyncData.relays) && browserSyncData.relays.length > 0;
  if (hadIdentityRelays || kept.droppedKeys.length > 0) {
    await persistVaultV3.call(this);
  }
  await this.getBrowserSessionHandler().removeKeys(['relays', ...kept.droppedKeys]);
}

async function unlockLegacyVault(
  this: StorageService,
  password: string,
  browserSyncData: BrowserSyncData,
): Promise<void> {
  if (!browserSyncData.iv || !browserSyncData.vaultHash) {
    throw new Error('Vault data is incomplete.');
  }

  const passwordHash = await CryptoHelper.hash(password);
  if (passwordHash !== browserSyncData.vaultHash) {
    throw new Error('Invalid password.');
  }

  const withLockedVault = {
    iv: browserSyncData.iv,
    password,
  };

  const encryptedIdentities: Identity_ENCRYPTED[] = [];
  for (const identityId of browserSyncData.identities) {
    const encryptedIdentity = browserSyncData[`identity_${identityId}`];
    if (encryptedIdentity) {
      encryptedIdentities.push(encryptedIdentity);
    }
  }

  const decryptedIdentities = await decryptIdentities.call(
    this,
    encryptedIdentities,
    withLockedVault,
  );

  const encryptedPermissions: Permission_ENCRYPTED[] = [];
  for (const permissionId of browserSyncData.permissions) {
    const encryptedPermission = browserSyncData[`permission_${permissionId}`];
    if (encryptedPermission) {
      encryptedPermissions.push(encryptedPermission);
    }
  }

  const decryptedPermissions = await decryptPermissions.call(
    this,
    encryptedPermissions,
    withLockedVault,
  );
  const decryptedSelectedIdentityId =
    browserSyncData.selectedIdentityId === null
      ? null
      : await this.decryptWithLockedVault(
          browserSyncData.selectedIdentityId,
          'string',
          browserSyncData.iv,
          password,
        );

  const kept = withoutGetRelays(decryptedPermissions);
  const browserSessionData: BrowserSessionData = {
    vaultPassword: password,
    iv: browserSyncData.iv,
    permissions: kept.permissions.map((x) => x.id),
    identities: decryptedIdentities.map((x) => x.id),
    sites: [],
    selectedIdentityId: decryptedSelectedIdentityId,
  };
  decryptedIdentities.forEach((x) => {
    browserSessionData[`identity_${x.id}`] = x;
  });
  kept.permissions.forEach((x) => {
    browserSessionData[`permission_${x.id}`] = x;
  });

  await this.getBrowserSessionHandler().saveFullData(browserSessionData);
  this.getBrowserSessionHandler().setFullData(browserSessionData);
  await this.getBrowserSessionHandler().removeKeys(['relays', ...kept.droppedKeys]);
}

/**
 * Copies site rows into an unlocked session that has never tracked them.
 * An explicit empty list is the source of truth and is left alone.
 * storage.session.set merges, so a popup that reseals without this would drop
 * bindings the background wrote after the popup loaded.
 */
export async function absorbUntrackedSites(
  this: StorageService,
  session: BrowserSessionData,
): Promise<void> {
  if (session.sites !== undefined) {
    return;
  }
  const stored = await this.getBrowserSessionHandler().loadFullData();
  const storedIds = stored['sites'];
  if (!Array.isArray(storedIds)) {
    session.sites = [];
    return;
  }
  const ids = storedIds.filter((id): id is string => typeof id === 'string');
  session.sites = ids;
  for (const id of ids) {
    const row = stored[`site_${id}`];
    if (!row || typeof row !== 'object') {
      continue;
    }
    const record = row as Partial<Site_DECRYPTED>;
    if (
      typeof record.id !== 'string' ||
      typeof record.identityId !== 'string' ||
      typeof record.host !== 'string'
    ) {
      continue;
    }
    session[`site_${id}`] = {
      id: record.id,
      identityId: record.identityId,
      host: record.host,
    };
  }
}

/**
 * Re-encrypt the unlocked session as a v3 vault.
 * Derives the key once. Removes storage keys the new record does not use.
 */
export const persistVaultV3 = async function (this: StorageService): Promise<void> {
  this.assureIsInitialized();

  const session = this.getBrowserSessionHandler().browserSessionData;
  if (!session?.vaultPassword) {
    throw new Error('Vault password is not available.');
  }
  await absorbUntrackedSites.call(this, session);
  const snapshot = await this.getVaultHandler().loadUnmigratedData();
  const previousKeys = Object.keys(snapshot);
  const previousSalt = session.salt;
  const previousIv = session.iv;
  const salt = CryptoHelper.generateSalt();

  session.salt = salt;
  session.iv = '';
  this.clearVaultKeyCache();

  let vault: BrowserSyncData;
  try {
    const identities: Identity_ENCRYPTED[] = [];
    for (const id of session.identities) {
      const identity = session[`identity_${id}`];
      if (!identity) {
        continue;
      }
      identities.push(await encryptIdentity.call(this, identity));
    }

    const permissions: Permission_ENCRYPTED[] = [];
    for (const id of session.permissions) {
      const permission = session[`permission_${id}`];
      if (!permission) {
        continue;
      }
      permissions.push(await encryptPermission.call(this, permission));
    }

    const sites: Site_ENCRYPTED[] = [];
    for (const id of session.sites ?? []) {
      const site = session[`site_${id}`];
      if (!site) {
        continue;
      }
      sites.push({
        id: await this.encrypt(site.id),
        identityId: await this.encrypt(site.identityId),
        host: await this.encrypt(site.host),
      });
    }

    const selectedIdentityId =
      session.selectedIdentityId === null
        ? null
        : await this.encrypt(session.selectedIdentityId);
    const backupState = session.backupState
      ? await this.encrypt(JSON.stringify(session.backupState))
      : undefined;

    vault = {
      version: 3,
      salt,
      canary: await this.encrypt(VAULT_CANARY),
      identities: identities.map((x) => x.id),
      permissions: permissions.map((x) => x.id),
      sites: sites.map((x) => x.id),
      selectedIdentityId,
      ...(backupState ? { backupState } : {}),
    };
    for (const identity of identities) {
      vault[`identity_${identity.id}`] = identity;
    }
    for (const permission of permissions) {
      vault[`permission_${permission.id}`] = permission;
    }
    for (const site of sites) {
      vault[`site_${site.id}`] = site;
    }
  } catch (error) {
    session.salt = previousSalt;
    session.iv = previousIv;
    this.clearVaultKeyCache();
    throw error;
  }

  await this.getBrowserSessionHandler().saveFullData(session);
  await this.getVaultHandler().saveAndSetFullData(vault);

  const stale = keysAbsentFrom(previousKeys, vault);
  if (stale.length > 0) {
    await this.getVaultHandler().removeKeys(stale);
  }
  await this.getBrowserSessionHandler().removeKeys(['relays']);
};

export const deleteVault = async function (
  this: StorageService,
  doNotSetIsInitializedToFalse: boolean,
): Promise<void> {
  this.assureIsInitialized();

  await this.getVaultHandler().clearData();
  await this.getBrowserSessionHandler().clearData();

  if (!doNotSetIsInitializedToFalse) {
    this.isInitialized = false;
  }
};

function openBackupState(json: string) {
  try {
    return parseBackupState(json);
  } catch {
    throw new Error('Backup data could not be opened.');
  }
}

async function openIdentity(
  identity: Identity_ENCRYPTED,
  key: CryptoKey,
): Promise<Identity_DECRYPTED> {
  const privkey = identity.privkey ? await CryptoHelper.open(identity.privkey, key) : undefined;
  const pubkey = identity.pubkey ? await CryptoHelper.open(identity.pubkey, key) : undefined;
  const color = identity.color ? await CryptoHelper.open(identity.color, key) : undefined;
  const bunkerJson = identity.bunker ? await CryptoHelper.open(identity.bunker, key) : undefined;
  return assembleDecryptedIdentity({
    id: await CryptoHelper.open(identity.id, key),
    nick: await CryptoHelper.open(identity.nick, key),
    createdAt: await CryptoHelper.open(identity.createdAt, key),
    ...(privkey ? { privkey } : {}),
    ...(pubkey ? { pubkey } : {}),
    ...(color ? { color } : {}),
    ...(bunkerJson ? { bunkerJson } : {}),
  });
}

async function openSite(site: Site_ENCRYPTED, key: CryptoKey): Promise<Site_DECRYPTED> {
  return {
    id: await CryptoHelper.open(site.id, key),
    identityId: await CryptoHelper.open(site.identityId, key),
    host: await CryptoHelper.open(site.host, key),
  };
}

async function openPermission(
  permission: Permission_ENCRYPTED,
  key: CryptoKey,
): Promise<Permission_DECRYPTED> {
  const decrypted: Permission_DECRYPTED = {
    id: await CryptoHelper.open(permission.id, key),
    identityId: await CryptoHelper.open(permission.identityId, key),
    host: await CryptoHelper.open(permission.host, key),
    method: (await CryptoHelper.open(
      permission.method,
      key,
    )) as Permission_DECRYPTED['method'],
    methodPolicy: (await CryptoHelper.open(
      permission.methodPolicy,
      key,
    )) as Permission_DECRYPTED['methodPolicy'],
  };
  if (typeof permission.kind !== 'undefined') {
    decrypted.kind = parseInt(await CryptoHelper.open(permission.kind, key), 10);
  }
  return decrypted;
}

function withoutGetRelays(permissions: Permission_DECRYPTED[]): {
  permissions: Permission_DECRYPTED[];
  droppedKeys: string[];
} {
  const kept: Permission_DECRYPTED[] = [];
  const droppedKeys: string[] = [];
  for (const permission of permissions) {
    if ((permission.method as string) === 'getRelays') {
      droppedKeys.push(`permission_${permission.id}`);
      continue;
    }
    kept.push(permission);
  }
  return { permissions: kept, droppedKeys };
}

/**
 * Drops a stored publish-relay list and permissions for the removed getRelays call.
 * Returns storage keys the caller must remove, because session storage merges.
 */
export function dropIdentityRelayRows(session: BrowserSessionData): string[] {
  const removed: string[] = [];
  if ('relays' in session) {
    delete (session as { relays?: unknown }).relays;
    removed.push('relays');
  }
  const droppedIds: string[] = [];
  for (const id of session.permissions) {
    const permission = session[`permission_${id}`];
    if (permission && (permission.method as string) === 'getRelays') {
      droppedIds.push(id);
    }
  }
  if (droppedIds.length === 0) {
    return removed;
  }
  const drop = new Set(droppedIds);
  session.permissions = session.permissions.filter((id) => !drop.has(id));
  for (const id of droppedIds) {
    delete session[`permission_${id}`];
    removed.push(`permission_${id}`);
  }
  return removed;
}
