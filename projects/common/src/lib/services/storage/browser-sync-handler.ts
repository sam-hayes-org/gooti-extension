/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSyncData,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
  Relay_ENCRYPTED,
} from './types';

/**
 * This class handles the data that is synced between browser instances.
 * In addition to the sensitive data that is encrypted, it also contains
 * some unencrypted properties (like, version and the vault hash).
 */
export abstract class BrowserSyncHandler {
  get browserSyncData(): BrowserSyncData | undefined {
    return this.#browserSyncData;
  }

  get ignoreProperties(): string[] {
    return this.#ignoreProperties;
  }

  #browserSyncData?: BrowserSyncData;
  #ignoreProperties: string[] = [];

  setIgnoreProperties(properties: string[]) {
    this.#ignoreProperties = properties;
  }

  /**
   * Load data from the sync data storage. This data might be
   * outdated (i.e. it is unmigrated), so check the unencrypted property "version" after loading.
   * Also make sure to handle the "ignore properties" (if available).
   */
  abstract loadUnmigratedData(): Promise<Partial<Record<string, any>>>;

  /**
   * Persist the full data to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setFullData(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetFullData(data: BrowserSyncData): Promise<void>;

  setFullData(data: BrowserSyncData) {
    this.#browserSyncData = JSON.parse(JSON.stringify(data));
  }

  /**
   * Persist the permissions to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Permissions(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Permissions(data: {
    permissions: Permission_ENCRYPTED[];
  }): Promise<void>;
  setPartialData_Permissions(data: { permissions: Permission_ENCRYPTED[] }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData.permissions = Array.from(data.permissions);
  }

  /**
   * Persist the identities to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Identities(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Identities(data: {
    identities: Identity_ENCRYPTED[];
  }): Promise<void>;

  setPartialData_Identities(data: { identities: Identity_ENCRYPTED[] }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData.identities = Array.from(data.identities);
  }

  /**
   * Persist the selected identity id to the sync data storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_SelectedIdentityId(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void>;

  setPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData.selectedIdentityId = data.selectedIdentityId;
  }

  abstract saveAndSetPartialData_Relays(data: {
    relays: Relay_ENCRYPTED[];
  }): Promise<void>;
  setPartialData_Relays(data: { relays: Relay_ENCRYPTED[] }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData.relays = Array.from(data.relays);
  }

  /**
   * Clear all data from the sync data storage.
   */
  abstract clearData(): Promise<void>;
}
