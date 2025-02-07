/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSyncData,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
  BrowserSyncHandler,
  Relay_ENCRYPTED,
} from '@common';
import browser from 'webextension-polyfill';

/**
 * Handles the browser sync operations when the browser sync is enabled.
 * If it's not enabled, it behaves like the local extension storage (which is fine).
 */
export class FirefoxSyncNoHandler extends BrowserSyncHandler {
  async loadUnmigratedData(): Promise<Partial<Record<string, any>>> {
    const data = await browser.storage.local.get(null);

    // Remove any available "ignore properties".
    this.ignoreProperties.forEach((property) => {
      delete data[property];
    });
    return data;
  }

  async saveAndSetFullData(data: BrowserSyncData): Promise<void> {
    await browser.storage.local.set(data as Record<string, any>);
    this.setFullData(data);
  }

  async saveAndSetPartialData_Permissions(data: {
    permissions: Permission_ENCRYPTED[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Permissions(data);
  }

  async saveAndSetPartialData_Identities(data: {
    identities: Identity_ENCRYPTED[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Identities(data);
  }

  async saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_SelectedIdentityId(data);
  }

  async saveAndSetPartialData_Relays(data: {
    relays: Relay_ENCRYPTED[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Relays(data);
  }

  async clearData(): Promise<void> {
    const props = Object.keys(await this.loadUnmigratedData());
    await browser.storage.local.remove(props);
  }
}
