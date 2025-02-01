/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSyncData,
  BrowserSyncHandler,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
  Relay_ENCRYPTED,
} from '@common';

/**
 * Handles the browser "sync data" when the user does not want to sync anything.
 * It uses the chrome.storage.local API to store the data. Since we also use this API
 * to store local Gooti system data (like the user's decision to not sync), we
 * have to exclude these properties from the sync data.
 */
export class ChromeSyncNoHandler extends BrowserSyncHandler {
  async loadUnmigratedData(): Promise<Partial<Record<string, any>>> {
    const data = await chrome.storage.local.get(null);

    // Remove any available "ignore properties".
    this.ignoreProperties.forEach((property) => {
      delete data[property];
    });
    return data;
  }

  async saveAndSetFullData(data: BrowserSyncData): Promise<void> {
    await chrome.storage.local.set(data);
    this.setFullData(data);
  }

  async saveAndSetPartialData_Permissions(data: {
    permissions: Permission_ENCRYPTED[];
  }): Promise<void> {
    await chrome.storage.local.set(data);
    this.setPartialData_Permissions(data);
  }

  async saveAndSetPartialData_Identities(data: {
    identities: Identity_ENCRYPTED[];
  }): Promise<void> {
    await chrome.storage.local.set(data);
    this.setPartialData_Identities(data);
  }

  async saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void> {
    await chrome.storage.local.set(data);
    this.setPartialData_SelectedIdentityId(data);
  }

  async saveAndSetPartialData_Relays(data: {
    relays: Relay_ENCRYPTED[];
  }): Promise<void> {
    await chrome.storage.local.set(data);
    this.setPartialData_Relays(data);
  }

  async clearData(): Promise<void> {
    const props = Object.keys(await this.loadUnmigratedData());
    await chrome.storage.local.remove(props);
  }
}
