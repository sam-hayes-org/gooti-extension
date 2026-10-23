/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSyncData,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
} from './types';

/**
 * Local vault storage.
 *
 * A later sync implementation (for example over Nostr) is another storage
 * port. It does not use the browser account sync area.
 */
export abstract class VaultHandler {
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
   * Copy a vault out of browser-account sync once, then clear that area.
   * If the copy fails, leave the sync area in place and do not mark the
   * retirement as done.
   */
  abstract retireAccountSync(): Promise<void>;

  /**
   * Load data from local storage. This data might be outdated
   * (unmigrated), so check the unencrypted property "version" after loading.
   * Also make sure to handle the "ignore properties" (if available).
   */
  abstract loadUnmigratedData(): Promise<Partial<Record<string, any>>>;

  /**
   * Persist the full data to local storage.
   *
   * ATTENTION: In your implementation, make sure to call "setFullData(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetFullData(data: BrowserSyncData): Promise<void>;

  setFullData(data: BrowserSyncData) {
    this.#browserSyncData = JSON.parse(JSON.stringify(data));
  }

  /**
   * Persist the permission to local storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Permission(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Permission(data: {
    permission: Permission_ENCRYPTED;
  }): Promise<void>;
  setPartialData_Permission(data: { permission: Permission_ENCRYPTED }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData[`permission_${data.permission.id}`] = data.permission;
  }

  /**
   * Persist the permissions to local storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Permissions(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Permissions(data: {
    permissions: string[];
  }): Promise<void>;

  setPartialData_Permissions(data: { permissions: string[] }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData.permissions = Array.from(data.permissions);
  }

  /**
   * Delete the permission from local storage.
   *
   * ATTENTION: In your implementation, make sure to call "unsetPartialData_Permission(..)" at the end to update the in-memory data.
   */
  abstract deleteSaveAndUnsetPartialData_Permission(data: {
    permissionId: string;
  }): Promise<void>;
  unsetPartialData_Permission(data: { permissionId: string }) {
    if (!this.#browserSyncData) {
      return;
    }
    delete this.#browserSyncData[`permission_${data.permissionId}`];
  }

  /**
   * Persist the identity to local storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Identity(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Identity(data: {
    identity: Identity_ENCRYPTED;
  }): Promise<void>;

  setPartialData_Identity(data: { identity: Identity_ENCRYPTED }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData[`identity_${data.identity.id}`] = data.identity;
  }

  /**
   * Persist the identities to local storage.
   *
   * ATTENTION: In your implementation, make sure to call "setPartialData_Identities(..)" at the end to update the in-memory data.
   */
  abstract saveAndSetPartialData_Identities(data: {
    identities: string[];
  }): Promise<void>;

  setPartialData_Identities(data: { identities: string[] }) {
    if (!this.#browserSyncData) {
      return;
    }
    this.#browserSyncData.identities = Array.from(data.identities);
  }

  /**
   * Delete the identity from local storage.
   *
   * ATTENTION: In your implementation, make sure to call "unsetPartialData_Identity(..)" at the end to update the in-memory data.
   */
  abstract deleteSaveAndUnsetPartialData_Identity(data: {
    identityId: string;
  }): Promise<void>;
  unsetPartialData_Identity(data: { identityId: string }) {
    if (!this.#browserSyncData) {
      return;
    }
    delete this.#browserSyncData[`identity_${data.identityId}`];
  }

  /**
   * Persist the selected identity id to local storage.
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

  /**
   * Delete storage keys left behind after a merge (old identity items, iv, vaultHash).
   * Does not change the in-memory vault. Callers update that themselves.
   */
  abstract removeKeys(keys: string[]): Promise<void>;

  /**
   * Clear vault data from local storage. Meta keys stay.
   */
  abstract clearData(): Promise<void>;
}
