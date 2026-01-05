/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSyncData,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
  BrowserSyncHandler,
  Relay_ENCRYPTED,
  BrowserSyncUtilization,
} from '@common';
import browser from 'webextension-polyfill';

/**
 * Handles the browser sync operations when the browser sync is enabled.
 * If it's not enabled, it behaves like the local extension storage (which is fine).
 */
export class FirefoxSyncYesHandler extends BrowserSyncHandler {
  async loadUnmigratedData(): Promise<Partial<Record<string, any>>> {
    return await browser.storage.sync.get(null);
  }

  async saveAndSetFullData(data: BrowserSyncData): Promise<void> {
    await browser.storage.sync.set(data as Record<string, any>);
    this.setFullData(data);
  }

  async saveAndSetPartialData_Permissions(data: {
    permissions: Permission_ENCRYPTED[];
  }): Promise<void> {
    await browser.storage.sync.set(data);
    this.setPartialData_Permissions(data);
  }

  async saveAndSetPartialData_Identities(data: {
    identities: Identity_ENCRYPTED[];
  }): Promise<void> {
    await browser.storage.sync.set(data);
    this.setPartialData_Identities(data);
  }

  async saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void> {
    await browser.storage.sync.set(data);
    this.setPartialData_SelectedIdentityId(data);
  }

  async saveAndSetPartialData_Relays(data: {
    relays: Relay_ENCRYPTED[];
  }): Promise<void> {
    await browser.storage.sync.set(data);
    this.setPartialData_Relays(data);
  }

  async clearData(): Promise<void> {
    await browser.storage.sync.clear();
  }

  override async getUtilization(): Promise<BrowserSyncUtilization> {
    const bytesInUse = await browser.storage.sync.getBytesInUse(null);
    return {
      bytesInUse,
      quotaBytes: 102400, // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync
      quotaBytesPerItem: 8192, // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync
      quotaItems: 512, // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/sync
    };
  }
}
