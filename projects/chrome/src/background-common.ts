/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BackgroundCommon,
  BrowserSessionData,
  BrowserSyncData,
  GOOTI_META_PROPERTIES,
  Identity_DECRYPTED,
  Nip07Method,
  Nip07MethodPolicy,
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
  recordHasVault,
  fitPopupBounds,
  WindowRect,
} from '@common';
import { ChromeVaultHandler } from './app/common/data/chrome-vault-handler';

export class ChromeBackgroundCommon extends BackgroundCommon {
  async getBrowserSessionData(): Promise<BrowserSessionData | undefined> {
    const browserSessionData = await chrome.storage.session.get(null);
    if (Object.keys(browserSessionData).length === 0) {
      return undefined;
    }

    return browserSessionData as BrowserSessionData;
  }

  async getBrowserSyncData(): Promise<BrowserSyncData | undefined> {
    await new ChromeVaultHandler().retireAccountSync();

    const data = await chrome.storage.local.get(null);
    for (const key of GOOTI_META_PROPERTIES) {
      delete data[key];
    }

    if (!recordHasVault(data)) {
      return undefined;
    }

    return data as BrowserSyncData;
  }

  async savePermissionsToBrowserSyncStorage(
    newPermissions: string[],
    newPermission: Permission_ENCRYPTED,
  ): Promise<void> {
    const data: Record<string, any> = {};
    data['permissions'] = newPermissions;
    data[`permission_${newPermission.id}`] = newPermission;
    await chrome.storage.local.set(data);
  }

  async storePermission(
    browserSessionData: BrowserSessionData,
    identity: Identity_DECRYPTED,
    host: string,
    method: Nip07Method,
    methodPolicy: Nip07MethodPolicy,
    kind?: number,
  ) {
    const browserSyncData = await this.getBrowserSyncData();
    if (!browserSyncData) {
      throw new Error(`Could not retrieve sync data`);
    }

    const permission: Permission_DECRYPTED = {
      id: crypto.randomUUID(),
      identityId: identity.id,
      host,
      method,
      methodPolicy,
      kind,
    };

    // Keep the id on this object so the next permission on the same card is kept.
    browserSessionData.permissions = [
      ...browserSessionData.permissions,
      permission.id,
    ];
    await chrome.storage.session.set({
      permissions: browserSessionData.permissions,
    });
    await chrome.storage.session.set({
      [`permission_${permission.id}`]: permission,
    });

    if (!browserSessionData.salt || !browserSessionData.vaultPassword) {
      throw new Error('Vault key material is missing.');
    }
    const encryptedPermission = await this.encryptPermission(
      permission,
      browserSessionData.vaultPassword,
      browserSessionData.salt,
    );

    await this.savePermissionsToBrowserSyncStorage(
      [...browserSyncData.permissions, encryptedPermission.id],
      encryptedPermission,
    );

    const sealedSync = await this.stampStoredPermission(browserSessionData, identity, {
      host,
      method,
      methodPolicy,
      kind,
    });
    if (sealedSync) {
      await chrome.storage.session.set({ nostrSync: browserSessionData.nostrSync });
      await chrome.storage.local.set({ nostrSync: sealedSync });
      if (browserSessionData.nostrSync?.autoSync) {
        this.scheduleQuietSync();
      }
    }
  }

  async getPosition(width: number, height: number) {
    let anchor: WindowRect | undefined;

    try {
      const lastFocused = await chrome.windows.getLastFocused();

      if (
        lastFocused &&
        lastFocused.top !== undefined &&
        lastFocused.left !== undefined &&
        lastFocused.width !== undefined &&
        lastFocused.height !== undefined
      ) {
        anchor = {
          left: lastFocused.left,
          top: lastFocused.top,
          width: lastFocused.width,
          height: lastFocused.height,
        };
      } else {
        console.error('Last focused window properties are undefined.');
      }
    } catch (error) {
      console.error('Error getting window position:', error);
    }

    return fitPopupBounds(width, height, anchor, await readWorkAreas());
  }
}

async function readWorkAreas(): Promise<WindowRect[]> {
  try {
    const displays = await chrome.system.display.getInfo();
    return displays.flatMap((display) => {
      const area =
        display.workArea.width > 0 ? display.workArea : display.bounds;
      if (area.width <= 0 || area.height <= 0) {
        return [];
      }
      return [
        {
          left: area.left,
          top: area.top,
          width: area.width,
          height: area.height,
        },
      ];
    });
  } catch (error) {
    console.error('Error reading screen work areas:', error);
    return [];
  }
}
