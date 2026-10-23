import { CryptoHelper } from '../../../helpers/crypto-helper';
import type { StorageService } from '../storage.service';
import {
  BrowserSessionData,
  Identity_DECRYPTED,
  Permission_DECRYPTED,
  Site_DECRYPTED,
} from '../types';
import {
  fetchRemoteDocument,
  manualSync,
  publishSyncDocument,
  SyncProgressStep,
  SyncRelayIO,
} from '../../../sync/manual';
import { mergeSyncDocuments } from '../../../sync/merge';
import { deriveSyncKeys } from '../../../sync/phrase';
import { liveVaultFromSession } from '../../../sync/session-live';
import {
  applySyncDocument,
  canonicalSyncDocument,
  createNostrSyncState,
  LocalVault,
  parseSyncRelays,
  projectSyncDocument,
  syncKeysFromState,
} from '../../../sync/state';
import { persistNostrSyncSeal } from './seal-nostr-sync';
import { absorbUntrackedSites, persistVaultV3 } from './vault';

export const enableNostrSync = async function (
  this: StorageService,
  phrase: string,
  relayText: string,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (session.nostrSync) {
    throw new Error('Sync is already on.');
  }
  const relays = requireRelays(relayText);
  const keys = await deriveSyncKeys(phrase);
  await absorbUntrackedSites.call(this, session);
  const projected = projectSyncDocument(
    createNostrSyncState(keys, relays),
    liveVaultFromSession(session),
    Date.now(),
  );
  session.nostrSync = projected.state;
  delete session.pendingSyncPhrase;
  await persistVaultV3.call(this);
  await this.getBrowserSessionHandler().removeKeys(['pendingSyncPhrase']);
  this.queueQuietSync();
};

/** Keep the new passphrase on this browser until the user applies or cancels. */
export const holdPendingSyncPhrase = async function (
  this: StorageService,
  phrase: string,
): Promise<void> {
  const session = unlockedSession.call(this);
  session.pendingSyncPhrase = phrase;
  await this.getBrowserSessionHandler().saveFullData(session);
};

export const clearPendingSyncPhrase = async function (this: StorageService): Promise<void> {
  const session = this.getBrowserSessionHandler().browserSessionData;
  if (session) {
    delete session.pendingSyncPhrase;
  }
  await this.getBrowserSessionHandler().removeKeys(['pendingSyncPhrase']);
};

export const joinNostrSync = async function (
  this: StorageService,
  phrase: string,
  relayText: string,
  io: SyncRelayIO,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (session.nostrSync) {
    throw new Error('Sync is already on.');
  }
  const relays = requireRelays(relayText);
  const keys = await deriveSyncKeys(phrase);
  await absorbUntrackedSites.call(this, session);
  const remote = await fetchRemoteDocument(keys, relays, io);
  if (!remote) {
    throw new Error('No vault found for this phrase.');
  }
  const local = projectSyncDocument(
    createNostrSyncState(keys, relays),
    liveVaultFromSession(session),
    Date.now(),
  );
  const merged = mergeSyncDocuments(local.document, remote);
  if (canonicalSyncDocument(merged) !== canonicalSyncDocument(remote)) {
    await publishSyncDocument(merged, keys, relays, io);
  }
  const droppedSites = writeSnapshot(
    session,
    applySyncDocument(localFromSession(session), merged, () => CryptoHelper.v4()),
  );
  session.nostrSync = { ...local.state, relays, document: merged };
  await persistVaultV3.call(this);
  if (droppedSites.length > 0) {
    await this.getBrowserSessionHandler().removeKeys(droppedSites);
  }
};

/**
 * Creates this browser's vault from a passphrase.
 * The relays are read before anything is stored. A missing vault leaves this browser empty.
 */
export const restoreNewVault = async function (
  this: StorageService,
  password: string,
  phrase: string,
  relayText: string,
  io: SyncRelayIO,
): Promise<void> {
  this.assureIsInitialized();
  if (
    this.getVaultHandler().browserSyncData ||
    this.getBrowserSessionHandler().browserSessionData
  ) {
    throw new Error('A vault already exists on this browser.');
  }
  const relays = requireRelays(relayText);
  const keys = await deriveSyncKeys(phrase);
  const remote = await fetchRemoteDocument(keys, relays, io);
  if (!remote) {
    throw new Error('No vault found for this phrase.');
  }
  const local = projectSyncDocument(
    createNostrSyncState(keys, relays),
    { identities: [], permissions: [], sites: [] },
    Date.now(),
  );
  const merged = mergeSyncDocuments(local.document, remote);
  if (canonicalSyncDocument(merged) !== canonicalSyncDocument(remote)) {
    await publishSyncDocument(merged, keys, relays, io);
  }

  const session: BrowserSessionData = {
    iv: '',
    vaultPassword: password,
    identities: [],
    permissions: [],
    sites: [],
    selectedIdentityId: null,
  };
  writeSnapshot(
    session,
    applySyncDocument(
      { identities: [], permissions: [], sites: [], selectedIdentityId: null },
      merged,
      () => CryptoHelper.v4(),
    ),
  );
  session.nostrSync = { ...local.state, relays, document: merged };
  this.getBrowserSessionHandler().setFullData(session);
  await persistVaultV3.call(this);
};

/** Publishes after reading the remote blob, then re-seals changed records with this vault's key. */
export const syncNostrNow = async function (
  this: StorageService,
  io: SyncRelayIO,
  onStep?: (step: SyncProgressStep | 'save') => void,
): Promise<boolean> {
  this.assureIsInitialized();
  await this.loadBrowserSessionData();
  await this.loadAndMigrateBrowserSyncData();
  const session = unlockedSession.call(this);
  if (!session.nostrSync) {
    throw new Error('Turn sync on first.');
  }
  const relays = requireRelays(session.nostrSync.relays.join('\n'));
  await absorbUntrackedSites.call(this, session);
  const projected = projectSyncDocument(session.nostrSync, liveVaultFromSession(session), Date.now());
  session.nostrSync = { ...projected.state, relays };
  const result = await manualSync(
    projected.document,
    syncKeysFromState(session.nostrSync),
    relays,
    io,
    onStep,
  );
  onStep?.('save');
  const droppedSites = writeSnapshot(
    session,
    applySyncDocument(localFromSession(session), result.document, () => CryptoHelper.v4()),
  );
  session.nostrSync = {
    ...session.nostrSync,
    relays,
    document: result.document,
  };
  await persistVaultV3.call(this);
  if (droppedSites.length > 0) {
    await this.getBrowserSessionHandler().removeKeys(droppedSites);
  }
  return result.published;
};

export const saveNostrSyncRelays = async function (
  this: StorageService,
  relayText: string,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (!session.nostrSync) {
    throw new Error('Turn sync on first.');
  }
  session.nostrSync = { ...session.nostrSync, relays: requireRelays(relayText) };
  await persistNostrSyncSeal.call(this, { sync: false });
};

/** Remembers automatic sync on this browser. Turning it on syncs once. */
export const setNostrAutoSync = async function (
  this: StorageService,
  autoSync: boolean,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (!session.nostrSync) {
    throw new Error('Turn sync on first.');
  }
  const next = { ...session.nostrSync };
  if (autoSync) {
    next.autoSync = true;
  } else {
    delete next.autoSync;
  }
  session.nostrSync = next;
  await persistNostrSyncSeal.call(this, { sync: false });
  if (autoSync) {
    this.queueQuietSync();
  }
};

function unlockedSession(this: StorageService): BrowserSessionData {
  this.assureIsInitialized();
  const session = this.getBrowserSessionHandler().browserSessionData;
  if (!session?.vaultPassword) {
    throw new Error('Unlock the vault before syncing.');
  }
  return session;
}

function requireRelays(relayText: string): string[] {
  const relays = parseSyncRelays(relayText);
  if (relays.length === 0) {
    throw new Error('Add a sync relay first.');
  }
  return relays;
}

function localFromSession(session: BrowserSessionData): LocalVault {
  return {
    identities: sessionIdentities(session),
    permissions: sessionPermissions(session),
    sites: sessionSites(session),
    selectedIdentityId: session.selectedIdentityId,
  };
}

function sessionIdentities(session: BrowserSessionData): Identity_DECRYPTED[] {
  return session.identities.flatMap((id) => {
    const identity = session[`identity_${id}`];
    return identity ? [identity] : [];
  });
}

function sessionPermissions(session: BrowserSessionData): Permission_DECRYPTED[] {
  return session.permissions.flatMap((id) => {
    const permission = session[`permission_${id}`];
    return permission ? [permission] : [];
  });
}

function sessionSites(session: BrowserSessionData): Site_DECRYPTED[] {
  return (session.sites ?? []).flatMap((id) => {
    const site = session[`site_${id}`];
    return site ? [site] : [];
  });
}

/** Returns session keys a merge-style set would otherwise keep. */
function writeSnapshot(session: BrowserSessionData, applied: LocalVault): string[] {
  for (const id of session.identities) {
    delete session[`identity_${id}`];
  }
  for (const id of session.permissions) {
    delete session[`permission_${id}`];
  }
  const nextSites = applied.sites ?? [];
  const nextSiteIds = new Set(nextSites.map((site) => site.id));
  const droppedSites: string[] = [];
  for (const id of session.sites ?? []) {
    if (nextSiteIds.has(id)) {
      continue;
    }
    delete session[`site_${id}`];
    droppedSites.push(`site_${id}`);
  }
  session.identities = applied.identities.map((identity) => identity.id);
  session.permissions = applied.permissions.map((permission) => permission.id);
  session.sites = nextSites.map((site) => site.id);
  session.selectedIdentityId = applied.selectedIdentityId;
  for (const identity of applied.identities) {
    session[`identity_${identity.id}`] = { ...identity };
  }
  for (const permission of applied.permissions) {
    session[`permission_${permission.id}`] = { ...permission };
  }
  for (const site of nextSites) {
    session[`site_${site.id}`] = { ...site };
  }
  return droppedSites;
}
