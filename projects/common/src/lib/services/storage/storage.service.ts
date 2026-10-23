/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { VaultHandler } from './vault-handler';
import { BrowserSessionHandler } from './browser-session-handler';
import {
  BrowserSessionData,
  BrowserSyncData,
  GOOTI_META_PROPERTIES,
  GootiMetaData,
} from './types';
import { GootiMetaHandler } from './gooti-meta-handler';
import { CryptoHelper } from '@common';
import {
  addBunkerIdentity,
  addIdentity,
  deleteIdentity,
  disconnectBunker,
  editNick,
  saveBunkerAskSite,
  saveBunkerSession,
  switchIdentity,
} from './related/identity';
import type { ConnectedBunker } from '../../nip46/client';
import { deletePermission } from './related/permission';
import {
  createNewVault,
  deleteVault,
  dropIdentityRelayRows,
  keysAbsentFrom,
  persistVaultV3 as writeVaultV3,
  retiredVaultStorageKeys,
  unlockVault,
} from './related/vault';
import {
  clearPendingSyncPhrase,
  enableNostrSync,
  holdPendingSyncPhrase,
  joinNostrSync,
  restoreNewVault,
  saveNostrSyncRelays,
  setNostrAutoSync as saveNostrAutoSync,
  syncNostrNow as runSyncNow,
} from './related/nostr-sync';
import type { SyncProgressStep, SyncRelayIO } from '../../sync/manual';
import { defaultNostrSyncRelayIO } from '../../sync/pool';
import { noteSyncActivity, syncFailureReason } from '../../activity/log';
import { createQuietQueue } from '../../sync/quiet';
import { migrateFromV1ToV2 } from './migrations/migrate-from-v1-to-v2';

export interface StorageServiceConfig {
  browserSessionHandler: BrowserSessionHandler;
  vaultHandler: VaultHandler;
  gootiMetaHandler: GootiMetaHandler;
  /**
   * Allows quiet sync after the user turns it on.
   * Unit tests leave this off so they do not open relays.
   * The checkbox itself defaults to off.
   */
  autoSync?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  readonly latestVersion = 3;
  isInitialized = false;

  #browserSessionHandler!: BrowserSessionHandler;
  #vaultHandler!: VaultHandler;
  #gootiMetaHandler!: GootiMetaHandler;
  #vaultKeyPromise?: Promise<CryptoKey>;
  #vaultKeySalt?: string;
  #autoSync = false;
  #syncTail: Promise<void> = Promise.resolve();
  readonly #kickQuiet = createQuietQueue(() => this.#quietSync());

  initialize(config: StorageServiceConfig): void {
    if (this.isInitialized) {
      return;
    }
    this.#browserSessionHandler = config.browserSessionHandler;
    this.#vaultHandler = config.vaultHandler;
    this.#gootiMetaHandler = config.gootiMetaHandler;
    this.#autoSync = config.autoSync === true;
    this.isInitialized = true;
  }

  async loadGootiMetaData(): Promise<GootiMetaData | undefined> {
    this.assureIsInitialized();

    const data = await this.#gootiMetaHandler.loadFullData();
    if (Object.keys(data).length === 0) {
      // No data available yet.
      return undefined;
    }

    this.#gootiMetaHandler.setFullData(data as GootiMetaData);
    return data as GootiMetaData;
  }

  async loadBrowserSessionData(): Promise<BrowserSessionData | undefined> {
    this.assureIsInitialized();

    const data = await this.#browserSessionHandler.loadFullData();
    if (Object.keys(data).length === 0) {
      // No data available yet (e.g. because the vault was not unlocked).
      return undefined;
    }

    const session = data as BrowserSessionData;
    const removed = dropIdentityRelayRows(session);
    this.#browserSessionHandler.setFullData(session);
    if (removed.length > 0) {
      await this.#browserSessionHandler.saveFullData(session);
      await this.#browserSessionHandler.removeKeys(removed);
    }
    return session;
  }

  /**
   * Load and migrate the browser sync data. If no data is available yet,
   * the returned object is undefined.
   */
  async loadAndMigrateBrowserSyncData(): Promise<BrowserSyncData | undefined> {
    this.assureIsInitialized();
    const unmigratedBrowserSyncData =
      await this.getVaultHandler().loadUnmigratedData();
    const migrated = this.#migrateBrowserSyncData(unmigratedBrowserSyncData);
    let browserSyncData = migrated.browserSyncData;

    if (!browserSyncData) {
      // Nothing to do at this point.
      return undefined;
    }

    // There is data. Check, if it was migrated.
    if (migrated.migrationWasPerformed) {
      await this.getVaultHandler().saveAndSetFullData(browserSyncData);
    } else {
      // Set the data for in-memory usage.
      this.getVaultHandler().setFullData(browserSyncData);
    }

    if (browserSyncData.version >= 3) {
      browserSyncData = await this.#dropRetiredVaultKeys(
        browserSyncData,
        unmigratedBrowserSyncData,
      );
    }

    return browserSyncData;
  }

  /**
   * Rewrite an unlocked vault to format v3. No-op for the caller to avoid
   * when the password is not in the session.
   */
  async persistVaultV3(): Promise<void> {
    await writeVaultV3.call(this);
  }

  async deleteVault(doNotSetIsInitializedToFalse = false) {
    await deleteVault.call(this, doNotSetIsInitializedToFalse);
    this.clearVaultKeyCache();
  }

  async resetExtension() {
    this.assureIsInitialized();
    await this.getVaultHandler().clearData();
    await this.getBrowserSessionHandler().clearData();
    await this.getGootiMetaHandler().clearData([]);
    this.clearVaultKeyCache();
    this.isInitialized = false;
  }

  /** Lock this browser. The sealed vault stays. */
  async signOut(): Promise<void> {
    this.assureIsInitialized();
    await this.getBrowserSessionHandler().clearData();
    this.getBrowserSessionHandler().forget();
    this.clearVaultKeyCache();
  }

  async unlockVault(password: string): Promise<void> {
    await unlockVault.call(this, password);
  }

  async createNewVault(password: string): Promise<void> {
    await createNewVault.call(this, password);
  }

  async editNick(
    decryptedIdentityId: string,
    decryptedNewNick: string,
  ): Promise<void> {
    await editNick.call(this, decryptedIdentityId, decryptedNewNick);
  }

  async addIdentity(data: {
    nick: string;
    privkeyString: string;
  }): Promise<void> {
    await addIdentity.call(this, data);
  }

  async addBunkerIdentity(data: { nick: string; connected: ConnectedBunker }): Promise<void> {
    await addBunkerIdentity.call(this, data);
  }

  async saveBunkerSession(identityId: string, connected: ConnectedBunker): Promise<void> {
    await saveBunkerSession.call(this, identityId, connected);
  }

  async disconnectBunker(identityId: string): Promise<void> {
    await disconnectBunker.call(this, identityId);
  }

  async saveBunkerAskSite(identityId: string, askSite: boolean): Promise<void> {
    await saveBunkerAskSite.call(this, identityId, askSite);
  }

  async deleteIdentity(identityId: string | undefined): Promise<void> {
    await deleteIdentity.call(this, identityId);
  }

  async switchIdentity(identityId: string | null): Promise<void> {
    await switchIdentity.call(this, identityId);
  }

  async deletePermission(permissionId: string) {
    await deletePermission.call(this, permissionId);
  }

  async enableNostrSync(phrase: string, relayText: string): Promise<void> {
    await enableNostrSync.call(this, phrase, relayText);
  }

  async holdPendingSyncPhrase(phrase: string): Promise<void> {
    await holdPendingSyncPhrase.call(this, phrase);
  }

  async clearPendingSyncPhrase(): Promise<void> {
    await clearPendingSyncPhrase.call(this);
  }

  async joinNostrSync(phrase: string, relayText: string, io: SyncRelayIO): Promise<void> {
    await joinNostrSync.call(this, phrase, relayText, io);
  }

  async restoreNewVault(
    password: string,
    phrase: string,
    relayText: string,
    io: SyncRelayIO,
  ): Promise<void> {
    await restoreNewVault.call(this, password, phrase, relayText, io);
  }

  /** Returns true when a new blob was published. */
  async syncNostrNow(
    io: SyncRelayIO,
    onStep?: (step: SyncProgressStep | 'save') => void,
  ): Promise<boolean> {
    return this.#exclusive(() => runSyncNow.call(this, io, onStep));
  }

  /**
   * Fetch, merge, and publish without a dialog.
   * No-op until this app allows it, the user turned it on, and sync is on.
   * A relay failure stays here. The next open or change tries again.
   */
  queueQuietSync(): void {
    if (!this.#autoSync || !this.isInitialized) {
      return;
    }
    const session = this.#browserSessionHandler.browserSessionData;
    if (!session?.nostrSync?.autoSync || !session.vaultPassword) {
      return;
    }
    this.#kickQuiet();
  }

  async setNostrAutoSync(autoSync: boolean): Promise<void> {
    await saveNostrAutoSync.call(this, autoSync);
  }

  async #quietSync(): Promise<void> {
    let published = false;
    let failed = false;
    let failure: unknown;
    try {
      published = await this.#exclusive(() => runSyncNow.call(this, defaultNostrSyncRelayIO()));
    } catch (error: unknown) {
      // The next open or change tries again.
      failed = true;
      failure = error;
    }
    if (failed) {
      await noteSyncActivity({
        sync: 'auto',
        result: 'failed',
        reason: syncFailureReason(failure),
      });
      return;
    }
    if (published) {
      await noteSyncActivity({ sync: 'auto', result: 'synced' });
    }
  }

  #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#syncTail.then(work, work);
    this.#syncTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async saveNostrSyncRelays(relayText: string): Promise<void> {
    await saveNostrSyncRelays.call(this, relayText);
  }

  exportVault(): string {
    this.assureIsInitialized();
    const vaultJson = JSON.stringify(
      this.getVaultHandler().browserSyncData,
      undefined,
      4,
    );
    return vaultJson;
  }

  async importVault(allegedBrowserSyncData: BrowserSyncData) {
    this.assureIsInitialized();

    const isValidData = this.#allegedBrowserSyncDataIsValid(
      allegedBrowserSyncData,
    );
    if (!isValidData) {
      throw new Error('The imported data is not valid.');
    }

    const previous = await this.getVaultHandler().loadUnmigratedData();
    await this.getVaultHandler().saveAndSetFullData(allegedBrowserSyncData);
    const meta = new Set<string>(GOOTI_META_PROPERTIES);
    const stale = keysAbsentFrom(Object.keys(previous), allegedBrowserSyncData).filter(
      (key) => !meta.has(key),
    );
    if (stale.length > 0) {
      await this.getVaultHandler().removeKeys(stale);
    }
  }

  getVaultHandler(): VaultHandler {
    this.assureIsInitialized();

    return this.#vaultHandler;
  }

  getBrowserSessionHandler(): BrowserSessionHandler {
    this.assureIsInitialized();

    return this.#browserSessionHandler;
  }

  getGootiMetaHandler(): GootiMetaHandler {
    this.assureIsInitialized();

    return this.#gootiMetaHandler;
  }

  /**
   * Throws an exception if the service is not initialized.
   */
  assureIsInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        'StorageService is not initialized. Please call "initialize(...)" before doing anything else.',
      );
    }
  }

  clearVaultKeyCache(): void {
    this.#vaultKeyPromise = undefined;
    this.#vaultKeySalt = undefined;
  }

  /**
   * Find the stored ciphertext of `plaintextId` inside `encryptedIds`.
   * v3 uses a new IV per value, so the ciphertext cannot be recomputed.
   */
  async matchEncryptedId(
    encryptedIds: string[],
    plaintextId: string,
  ): Promise<string | undefined> {
    for (const encryptedId of encryptedIds) {
      if ((await this.decrypt(encryptedId, 'string')) === plaintextId) {
        return encryptedId;
      }
    }
    return undefined;
  }

  async ciphertextMatches(
    ciphertext: string,
    plaintext: string,
  ): Promise<boolean> {
    return (await this.decrypt(ciphertext, 'string')) === plaintext;
  }

  async encrypt(value: string): Promise<string> {
    return CryptoHelper.seal(value, await this.#vaultKey());
  }

  async decrypt(
    value: string,
    returnType: 'string' | 'number' | 'boolean',
  ): Promise<any> {
    const decryptedValue = await CryptoHelper.open(value, await this.#vaultKey());
    return this.#coerce(decryptedValue, returnType);
  }

  async decryptWithLockedVault(
    value: string,
    returnType: 'string' | 'number' | 'boolean',
    iv: string,
    password: string,
  ): Promise<any> {
    const decryptedValue = await CryptoHelper.decrypt(value, iv, password);
    return this.#coerce(decryptedValue, returnType);
  }

  async #vaultKey(): Promise<CryptoKey> {
    const browserSessionData =
      this.getBrowserSessionHandler().browserSessionData;
    if (!browserSessionData?.vaultPassword || !browserSessionData.salt) {
      throw new Error('Vault key material is missing.');
    }

    if (
      this.#vaultKeyPromise &&
      this.#vaultKeySalt === browserSessionData.salt
    ) {
      return this.#vaultKeyPromise;
    }

    this.#vaultKeySalt = browserSessionData.salt;
    this.#vaultKeyPromise = CryptoHelper.v3Key(
      browserSessionData.vaultPassword,
      browserSessionData.salt,
    );
    return this.#vaultKeyPromise;
  }

  #coerce(
    decryptedValue: string,
    returnType: 'string' | 'number' | 'boolean',
  ): any {
    switch (returnType) {
      case 'number':
        return parseInt(decryptedValue, 10);

      case 'boolean':
        return decryptedValue === 'true';

      case 'string':
      default:
        return decryptedValue;
    }
  }

  /**
   * Migrate the browser sync data to the latest version.
   */
  #migrateBrowserSyncData(browserSyncData: Partial<Record<string, any>>): {
    browserSyncData?: BrowserSyncData;
    migrationWasPerformed: boolean;
  } {
    if (Object.keys(browserSyncData).length === 0) {
      // First run. There is no browser sync data yet.
      return {
        browserSyncData: undefined,
        migrationWasPerformed: false,
      };
    }

    // Determine, if migration is required.
    let workingData: any = browserSyncData;
    let migrationWasPerformed = false;
    const allegedVersion = browserSyncData['version'] as number;
    if (allegedVersion < this.latestVersion) {
      // Migration required.

      for (let v = allegedVersion + 1; v <= this.latestVersion; v++) {
        switch (v) {
          case 2:
            // Migration to version 2. Structural only: split identity and
            // permission items. Does not need the password.
            workingData = migrateFromV1ToV2(workingData);
            migrationWasPerformed = true;
            break;

          case 3:
            // v2 to v3 re-encrypts with the password. That runs at unlock,
            // and on startup when the session is already unlocked.
            break;
        }
      }
    }

    return {
      browserSyncData: workingData as BrowserSyncData,
      migrationWasPerformed,
    };
  }

  #allegedBrowserSyncDataIsValid(data: BrowserSyncData): boolean {
    if (typeof data.version !== 'number') {
      return false;
    }

    if (data.version >= 3) {
      if (typeof data.salt !== 'string' || typeof data.canary !== 'string') {
        return false;
      }
    } else if (
      typeof data.iv !== 'string' ||
      typeof data.vaultHash !== 'string'
    ) {
      return false;
    }

    if (typeof data.selectedIdentityId === 'undefined') {
      return false;
    }

    if (
      typeof data.identities === 'undefined' ||
      !Array.isArray(data.identities)
    ) {
      return false;
    }

    if (
      typeof data.permissions === 'undefined' ||
      !Array.isArray(data.permissions)
    ) {
      return false;
    }

    if (data.relays !== undefined && !Array.isArray(data.relays)) {
      return false;
    }

    if (data.sites !== undefined && !Array.isArray(data.sites)) {
      return false;
    }

    return true;
  }

  async #dropRetiredVaultKeys(
    vault: BrowserSyncData,
    stored: Partial<Record<string, any>>,
  ): Promise<BrowserSyncData> {
    const stale = retiredVaultStorageKeys(stored, vault);
    if (stale.length === 0) {
      return vault;
    }

    await this.getVaultHandler().removeKeys(stale);
    const cleaned: BrowserSyncData = { ...vault };
    for (const key of stale) {
      delete cleaned[key as keyof BrowserSyncData];
    }
    this.getVaultHandler().setFullData(cleaned);
    return cleaned;
  }
}
