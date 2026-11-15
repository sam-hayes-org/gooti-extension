/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSyncData,
  decideAccountSyncRetirement,
  GOOTI_META_PROPERTIES,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
  recordHasVault,
  VaultHandler,
} from '@common';
import browser from 'webextension-polyfill';

/**
 * Vault stored in browser.storage.local.
 * Meta keys (syncRetired, snapshots) share that area and are ignored here.
 */
export class FirefoxVaultHandler extends VaultHandler {
  async retireAccountSync(): Promise<void> {
    const retiredFlag = await browser.storage.local.get('syncRetired');
    const localAll = await browser.storage.local.get(null);
    const localVault = { ...localAll };
    for (const key of GOOTI_META_PROPERTIES) {
      delete localVault[key];
    }

    const syncArea = browser.storage.sync
      ? await browser.storage.sync.get(null)
      : {};
    const decision = decideAccountSyncRetirement({
      syncRetired: retiredFlag['syncRetired'] === true,
      localHasVault: recordHasVault(localVault),
      syncHasVault: recordHasVault(syncArea),
    });

    if (!decision.copySyncToLocal && !decision.clearSync) {
      return;
    }

    if (decision.copySyncToLocal) {
      await browser.storage.local.set(syncArea);
    }

    if (decision.clearSync && browser.storage.sync) {
      await browser.storage.sync.clear();
    }

    await browser.storage.local.set({ syncRetired: true });
  }

  async loadUnmigratedData(): Promise<Partial<Record<string, any>>> {
    const data = await browser.storage.local.get(null);

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
    permissions: string[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Permissions(data);
  }

  async saveAndSetPartialData_Permission(data: {
    permission: Permission_ENCRYPTED;
  }): Promise<void> {
    await browser.storage.local.set({
      [`permission_${data.permission.id}`]: data.permission,
    });
    this.setPartialData_Permission(data);
  }

  async deleteSaveAndUnsetPartialData_Permission(data: {
    permissionId: string;
  }): Promise<void> {
    await browser.storage.local.remove(`permission_${data.permissionId}`);
    this.unsetPartialData_Permission(data);
  }

  async saveAndSetPartialData_Identities(data: {
    identities: string[];
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_Identities(data);
  }

  async saveAndSetPartialData_Identity(data: {
    identity: Identity_ENCRYPTED;
  }): Promise<void> {
    await browser.storage.local.set({
      [`identity_${data.identity.id}`]: data.identity,
    });
    this.setPartialData_Identity(data);
  }

  async deleteSaveAndUnsetPartialData_Identity(data: {
    identityId: string;
  }): Promise<void> {
    await browser.storage.local.remove(`identity_${data.identityId}`);
    this.unsetPartialData_Identity(data);
  }

  async saveAndSetPartialData_SelectedIdentityId(data: {
    selectedIdentityId: string | null;
  }): Promise<void> {
    await browser.storage.local.set(data);
    this.setPartialData_SelectedIdentityId(data);
  }

  async removeKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    await browser.storage.local.remove(keys);
  }

  async clearData(): Promise<void> {
    const props = Object.keys(await this.loadUnmigratedData());
    await browser.storage.local.remove(props);
  }
}
