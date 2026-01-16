/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BackgroundCommon,
  BrowserSessionData,
  BrowserSyncData,
  BrowserSyncFlow,
  GootiMetaData,
  Identity_DECRYPTED,
  Nip07Method,
  Nip07MethodPolicy,
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
} from '@common';
import { FirefoxMetaHandler } from './app/common/data/firefox-meta-handler';
import browser from 'webextension-polyfill';

export class FirefoxBackgroundCommon extends BackgroundCommon {
  async getBrowserSessionData(): Promise<BrowserSessionData | undefined> {
    const browserSessionData = await browser.storage.session.get(null);
    if (Object.keys(browserSessionData).length === 0) {
      return undefined;
    }

    return browserSessionData as unknown as BrowserSessionData;
  }

  async getBrowserSyncData(): Promise<BrowserSyncData | undefined> {
    const gootiMetaHandler = new FirefoxMetaHandler();
    const gootiMetaData =
      (await gootiMetaHandler.loadFullData()) as GootiMetaData;

    let browserSyncData: BrowserSyncData | undefined;

    if (gootiMetaData.syncFlow === BrowserSyncFlow.NO_SYNC) {
      browserSyncData = (await browser.storage.local.get(
        null,
      )) as unknown as BrowserSyncData;
    } else if (gootiMetaData.syncFlow === BrowserSyncFlow.BROWSER_SYNC) {
      browserSyncData = (await browser.storage.sync.get(
        null,
      )) as unknown as BrowserSyncData;
    }

    return browserSyncData;
  }

  async savePermissionsToBrowserSyncStorage(
    newPermissions: string[],
    newPermission: Permission_ENCRYPTED,
  ): Promise<void> {
    const gootiMetaHandler = new FirefoxMetaHandler();
    const gootiMetaData =
      (await gootiMetaHandler.loadFullData()) as GootiMetaData;

    const data: Record<string, any> = {};
    data['permissions'] = newPermissions;
    data[`permission_${newPermission.id}`] = newPermission;

    if (gootiMetaData.syncFlow === BrowserSyncFlow.NO_SYNC) {
      await browser.storage.local.set(data);
    } else if (gootiMetaData.syncFlow === BrowserSyncFlow.BROWSER_SYNC) {
      await browser.storage.sync.set(data);
    }
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

    // Store session data
    await browser.storage.session.set({
      permissions: [...browserSessionData.permissions, permission.id],
    });
    await browser.storage.session.set({
      [`permission_${permission.id}`]: permission,
    });

    // Encrypt permission to store in sync storage (depending on sync flow).
    const encryptedPermission = await this.encryptPermission(
      permission,
      browserSessionData.iv,
      browserSessionData.vaultPassword as string,
    );

    await this.savePermissionsToBrowserSyncStorage(
      [...browserSyncData.permissions, encryptedPermission.id],
      encryptedPermission,
    );
  }

  async getPosition(width: number, height: number) {
    let left = 0;
    let top = 0;

    try {
      const lastFocused = await browser.windows.getLastFocused();

      if (
        lastFocused &&
        lastFocused.top !== undefined &&
        lastFocused.left !== undefined &&
        lastFocused.width !== undefined &&
        lastFocused.height !== undefined
      ) {
        // Position window in the center of the lastFocused window
        top = Math.round(lastFocused.top + (lastFocused.height - height) / 2);
        left = Math.round(lastFocused.left + (lastFocused.width - width) / 2);
      } else {
        console.error('Last focused window properties are undefined.');
      }
    } catch (error) {
      console.error('Error getting window position:', error);
    }

    return {
      top,
      left,
    };
  }
}
