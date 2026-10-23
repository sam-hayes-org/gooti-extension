import { CryptoHelper } from '../../../helpers/crypto-helper';
import type { StorageService } from '../storage.service';
import {
  BrowserSessionData,
  Identity_DECRYPTED,
  Permission_DECRYPTED,
  Site_DECRYPTED,
} from '../types';
import {
  fetchRemoteBackup,
  backUpShared,
  publishSharedDocument,
  BackupProgressStep,
  BackupRelayIO,
} from '../../../backup/manual';
import { mergeSharedDocuments } from '../../../backup/merge';
import { deriveSharedKeys } from '../../../backup/phrase';
import { liveVaultFromSession } from '../../../backup/session-live';
import {
  applySharedDocument,
  canonicalSharedDocument,
  createBackupState,
  LocalVault,
  parseBackupRelays,
  projectSharedDocument,
  backupKeysFromState,
} from '../../../backup/state';
import { persistBackupSeal } from './seal-backup';
import { absorbUntrackedSites, persistVaultV3 } from './vault';

export const enableBackup = async function (
  this: StorageService,
  phrase: string,
  relayText: string,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (session.backupState) {
    throw new Error('Backup is already on.');
  }
  const relays = requireRelays(relayText);
  const keys = await deriveSharedKeys(phrase);
  await absorbUntrackedSites.call(this, session);
  const projected = projectSharedDocument(
    createBackupState(keys, relays),
    liveVaultFromSession(session),
    Date.now(),
  );
  session.backupState = projected.state;
  delete session.pendingPassphrase;
  await persistVaultV3.call(this);
  await this.getBrowserSessionHandler().removeKeys(['pendingPassphrase']);
  this.queueQuietBackup();
};

/** Keep the new passphrase on this browser until the user applies or cancels. */
export const holdPendingPassphrase = async function (
  this: StorageService,
  phrase: string,
): Promise<void> {
  const session = unlockedSession.call(this);
  session.pendingPassphrase = phrase;
  await this.getBrowserSessionHandler().saveFullData(session);
};

export const clearPendingPassphrase = async function (this: StorageService): Promise<void> {
  const session = this.getBrowserSessionHandler().browserSessionData;
  if (session) {
    delete session.pendingPassphrase;
  }
  await this.getBrowserSessionHandler().removeKeys(['pendingPassphrase']);
};

export const joinBackup = async function (
  this: StorageService,
  phrase: string,
  relayText: string,
  io: BackupRelayIO,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (session.backupState) {
    throw new Error('Backup is already on.');
  }
  const relays = requireRelays(relayText);
  const keys = await deriveSharedKeys(phrase);
  await absorbUntrackedSites.call(this, session);
  const { document: remote, createdAt } = await fetchRemoteBackup(keys, relays, io);
  if (!remote) {
    throw new Error('No backup found for this passphrase on these relays.');
  }
  const local = projectSharedDocument(
    createBackupState(keys, relays),
    liveVaultFromSession(session),
    Date.now(),
  );
  const merged = mergeSharedDocuments(local.document, remote);
  if (canonicalSharedDocument(merged) !== canonicalSharedDocument(remote)) {
    await publishSharedDocument(merged, keys, relays, io, createdAt);
  }
  const droppedSites = writeSnapshot(
    session,
    applySharedDocument(localFromSession(session), merged, () => CryptoHelper.v4()),
  );
  session.backupState = { ...local.state, relays, document: merged };
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
  io: BackupRelayIO,
): Promise<void> {
  this.assureIsInitialized();
  if (
    this.getVaultHandler().browserSyncData ||
    this.getBrowserSessionHandler().browserSessionData
  ) {
    throw new Error('Gooti is already set up on this browser.');
  }
  const relays = requireRelays(relayText);
  const keys = await deriveSharedKeys(phrase);
  const { document: remote, createdAt } = await fetchRemoteBackup(keys, relays, io);
  if (!remote) {
    throw new Error('No backup found for this passphrase on these relays.');
  }
  const local = projectSharedDocument(
    createBackupState(keys, relays),
    { identities: [], permissions: [], sites: [] },
    Date.now(),
  );
  const merged = mergeSharedDocuments(local.document, remote);
  if (canonicalSharedDocument(merged) !== canonicalSharedDocument(remote)) {
    await publishSharedDocument(merged, keys, relays, io, createdAt);
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
    applySharedDocument(
      { identities: [], permissions: [], sites: [], selectedIdentityId: null },
      merged,
      () => CryptoHelper.v4(),
    ),
  );
  session.backupState = { ...local.state, relays, document: merged };
  this.getBrowserSessionHandler().setFullData(session);
  await persistVaultV3.call(this);
};

/** Publishes after reading the remote blob, then re-seals changed records with this vault's key. */
export const backUpNow = async function (
  this: StorageService,
  io: BackupRelayIO,
  onStep?: (step: BackupProgressStep | 'save') => void,
): Promise<{ published: boolean; changed: boolean; report: { took: string[]; sent: string[] } }> {
  this.assureIsInitialized();
  await this.loadBrowserSessionData();
  await this.loadAndMigrateBrowserSyncData();
  const session = unlockedSession.call(this);
  if (!session.backupState) {
    throw new Error('Turn on backup first.');
  }
  const relays = requireRelays(session.backupState.relays.join('\n'));
  await absorbUntrackedSites.call(this, session);
  const projected = projectSharedDocument(session.backupState, liveVaultFromSession(session), Date.now());
  session.backupState = { ...projected.state, relays };
  const result = await backUpShared(
    projected.document,
    backupKeysFromState(session.backupState),
    relays,
    io,
    onStep,
  );
  onStep?.('save');
  const droppedSites = writeSnapshot(
    session,
    applySharedDocument(localFromSession(session), result.document, () => CryptoHelper.v4()),
  );
  session.backupState = {
    ...session.backupState,
    relays,
    document: result.document,
  };
  await persistVaultV3.call(this);
  if (droppedSites.length > 0) {
    await this.getBrowserSessionHandler().removeKeys(droppedSites);
  }
  return { published: result.published, changed: result.changed, report: result.report };
};

export const saveBackupRelays = async function (
  this: StorageService,
  relayText: string,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (!session.backupState) {
    throw new Error('Turn on backup first.');
  }
  session.backupState = { ...session.backupState, relays: requireRelays(relayText) };
  await persistBackupSeal.call(this, { backUp: false });
};

/** Remembers automatic backup on this browser. Turning it on backups once. */
export const setAutoBackup = async function (
  this: StorageService,
  autoBackup: boolean,
): Promise<void> {
  const session = unlockedSession.call(this);
  if (!session.backupState) {
    throw new Error('Turn on backup first.');
  }
  const next = { ...session.backupState };
  if (autoBackup) {
    next.autoBackup = true;
  } else {
    delete next.autoBackup;
  }
  session.backupState = next;
  await persistBackupSeal.call(this, { backUp: false });
  if (autoBackup) {
    this.queueQuietBackup();
  }
};

function unlockedSession(this: StorageService): BrowserSessionData {
  this.assureIsInitialized();
  const session = this.getBrowserSessionHandler().browserSessionData;
  if (!session?.vaultPassword) {
    throw new Error('Unlock Gooti first.');
  }
  return session;
}

function requireRelays(relayText: string): string[] {
  const relays = parseBackupRelays(relayText);
  if (relays.length === 0) {
    throw new Error('Add a relay first.');
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
