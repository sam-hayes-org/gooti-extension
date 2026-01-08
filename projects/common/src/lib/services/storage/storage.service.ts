/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { BrowserSyncHandler } from './browser-sync-handler';
import { BrowserSessionHandler } from './browser-session-handler';
import {
  BrowserSessionData,
  BrowserSyncData,
  BrowserSyncFlow,
  GootiMetaData,
  Relay_DECRYPTED,
} from './types';
import { GootiMetaHandler } from './gooti-meta-handler';
import { CryptoHelper } from '@common';
import {
  addIdentity,
  deleteIdentity,
  editNick,
  switchIdentity,
} from './related/identity';
import { deletePermission } from './related/permission';
import { createNewVault, deleteVault, unlockVault } from './related/vault';
import { addRelay, deleteRelay, updateRelay } from './related/relay';

export interface StorageServiceConfig {
  browserSessionHandler: BrowserSessionHandler;
  browserSyncYesHandler: BrowserSyncHandler;
  browserSyncNoHandler: BrowserSyncHandler;
  gootiMetaHandler: GootiMetaHandler;
}

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  readonly latestVersion = 1;
  isInitialized = false;

  #browserSessionHandler!: BrowserSessionHandler;
  #browserSyncYesHandler!: BrowserSyncHandler;
  #browserSyncNoHandler!: BrowserSyncHandler;
  #gootiMetaHandler!: GootiMetaHandler;

  initialize(config: StorageServiceConfig): void {
    if (this.isInitialized) {
      return;
    }
    this.#browserSessionHandler = config.browserSessionHandler;
    this.#browserSyncYesHandler = config.browserSyncYesHandler;
    this.#browserSyncNoHandler = config.browserSyncNoHandler;
    this.#gootiMetaHandler = config.gootiMetaHandler;
    this.isInitialized = true;
  }

  async enableBrowserSyncFlow(flow: BrowserSyncFlow): Promise<void> {
    this.assureIsInitialized();

    this.#gootiMetaHandler.setBrowserSyncFlow(flow);
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

    // Set the existing data for in-memory usage.
    this.#browserSessionHandler.setFullData(data as BrowserSessionData);
    return data as BrowserSessionData;
  }

  /**
   * Load and migrate the browser sync data. If no data is available yet,
   * the returned object is undefined.
   */
  async loadAndMigrateBrowserSyncData(): Promise<BrowserSyncData | undefined> {
    this.assureIsInitialized();
    const unmigratedBrowserSyncData =
      await this.getBrowserSyncHandler().loadUnmigratedData();
    const { browserSyncData, migrationWasPerformed } =
      this.#migrateBrowserSyncData(unmigratedBrowserSyncData);

    if (!browserSyncData) {
      // Nothing to do at this point.
      return undefined;
    }

    // There is data. Check, if it was migrated.
    if (migrationWasPerformed) {
      // Persist the migrated data back to the browser sync storage.
      this.getBrowserSyncHandler().saveAndSetFullData(browserSyncData);
    } else {
      // Set the data for in-memory usage.
      this.getBrowserSyncHandler().setFullData(browserSyncData);
    }

    return browserSyncData;
  }

  async deleteVault(doNotSetIsInitializedToFalse = false) {
    await deleteVault.call(this, doNotSetIsInitializedToFalse);
  }

  async resetExtension() {
    this.assureIsInitialized();
    await this.getBrowserSyncHandler().clearData();
    await this.getBrowserSessionHandler().clearData();
    await this.getGootiMetaHandler().clearData([]);
    this.isInitialized = false;
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

  async deleteIdentity(identityId: string | undefined): Promise<void> {
    await deleteIdentity.call(this, identityId);
  }

  async switchIdentity(identityId: string | null): Promise<void> {
    await switchIdentity.call(this, identityId);
  }

  async deletePermission(permissionId: string) {
    await deletePermission.call(this, permissionId);
  }

  async addRelay(data: {
    identityId: string;
    url: string;
    write: boolean;
    read: boolean;
  }): Promise<void> {
    await addRelay.call(this, data);
  }

  async deleteRelay(relayId: string): Promise<void> {
    await deleteRelay.call(this, relayId);
  }

  async updateRelay(relayClone: Relay_DECRYPTED): Promise<void> {
    await updateRelay.call(this, relayClone);
  }

  exportVault(): string {
    this.assureIsInitialized();
    const vaultJson = JSON.stringify(
      this.getBrowserSyncHandler().browserSyncData,
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

    await this.getBrowserSyncHandler().saveAndSetFullData(
      allegedBrowserSyncData,
    );
  }

  getBrowserSyncHandler(): BrowserSyncHandler {
    this.assureIsInitialized();

    switch (this.#gootiMetaHandler.gootiMetaData?.syncFlow) {
      case BrowserSyncFlow.NO_SYNC:
        return this.#browserSyncNoHandler;

      case BrowserSyncFlow.BROWSER_SYNC:
      default:
        return this.#browserSyncYesHandler;
    }
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

  async encrypt(value: string): Promise<string> {
    const browserSessionData =
      this.getBrowserSessionHandler().browserSessionData;
    if (!browserSessionData || !browserSessionData.vaultPassword) {
      throw new Error('Browser session data is undefined.');
    }

    return CryptoHelper.encrypt(
      value,
      browserSessionData.iv,
      browserSessionData.vaultPassword,
    );
  }

  async decrypt(
    value: string,
    returnType: 'string' | 'number' | 'boolean',
  ): Promise<any> {
    const browserSessionData =
      this.getBrowserSessionHandler().browserSessionData;
    if (!browserSessionData || !browserSessionData.vaultPassword) {
      throw new Error('Browser session data is undefined.');
    }

    return this.decryptWithLockedVault(
      value,
      returnType,
      browserSessionData.iv,
      browserSessionData.vaultPassword,
    );
  }

  async decryptWithLockedVault(
    value: string,
    returnType: 'string' | 'number' | 'boolean',
    iv: string,
    password: string,
  ): Promise<any> {
    const decryptedValue = await CryptoHelper.decrypt(value, iv, password);

    switch (returnType) {
      case 'number':
        return parseInt(decryptedValue);

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

    // Will be implemented if migration is required.
    return {
      browserSyncData: browserSyncData as BrowserSyncData,
      migrationWasPerformed: false,
    };
  }

  #allegedBrowserSyncDataIsValid(data: BrowserSyncData): boolean {
    if (typeof data.iv === 'undefined') {
      return false;
    }

    if (typeof data.version !== 'number') {
      return false;
    }

    if (typeof data.vaultHash === 'undefined') {
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

    if (typeof data.relays === 'undefined' || !Array.isArray(data.relays)) {
      return false;
    }

    return true;
  }
}
