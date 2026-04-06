/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventTemplate, finalizeEvent, nip04, nip44, Event } from 'nostr-tools';
import { Nip07Method, Nip07MethodPolicy } from '../models/nostr';
import { NostrHelper } from '../helpers/nostr-helper';
import {
  CryptoHelper,
  KDF_SALT_V1,
  KDF_ITERATIONS_V1,
  KDF_ITERATIONS_V2,
  KDF_VERSION_CURRENT,
} from '../helpers/crypto-helper';
import {
  BrowserSessionData,
  BrowserSyncData,
  Permission_ENCRYPTED,
  Identity_DECRYPTED,
  Permission_DECRYPTED,
} from '../services/storage/types';

export type PromptResponse =
  | 'reject'
  | 'reject-once'
  | 'approve'
  | 'approve-once';

export interface PromptResponseMessage {
  id: string;
  response: PromptResponse;
}

export type IndexPromptResponse = 'unlocked' | 'locked';
export interface IndexPromptResponseMessage {
  id: string;
  response: IndexPromptResponse;
}

export interface BackgroundRequestMessage {
  method: Nip07Method;
  params: any;
  host: string;
}

export type AutoLockTimeout = 0 | 5 | 15 | 30 | 60;

export interface AutoLockConfig {
  timeoutMinutes: AutoLockTimeout;
}

export abstract class BackgroundCommon {
  abstract getBrowserSessionData(): Promise<BrowserSessionData | undefined>;
  abstract getBrowserSyncData(): Promise<BrowserSyncData | undefined>;
  abstract savePermissionsToBrowserSyncStorage(
    newPermissions: string[],
    newPermission: Permission_ENCRYPTED,
  ): Promise<void>;
  abstract storePermission(
    browserSessionData: BrowserSessionData,
    identity: Identity_DECRYPTED,
    host: string,
    method: Nip07Method,
    methodPolicy: Nip07MethodPolicy,
    kind?: number,
  ): Promise<void>;
  abstract getPosition(
    width: number,
    height: number,
  ): Promise<{
    left: number;
    top: number;
  }>;
  abstract clearSessionData(): Promise<void>;

  #autoLockTimerId: ReturnType<typeof setTimeout> | null = null;
  #autoLockConfig: AutoLockConfig = { timeoutMinutes: 15 };
  readonly autoLockTimeoutOptions: AutoLockTimeout[] = [0, 5, 15, 30, 60];
  readonly AUTO_LOCK_CONFIG_KEY = 'gooti_autoLockConfig';

  async loadAutoLockConfig(): Promise<void> {
    try {
      const stored = await this.getAutoLockConfigFromStorage();
      if (
        stored &&
        this.autoLockTimeoutOptions.includes(stored.timeoutMinutes)
      ) {
        this.#autoLockConfig = stored;
      }
    } catch {
      // Use default config
    }
  }

  getAutoLockConfig(): AutoLockConfig {
    return { ...this.#autoLockConfig };
  }

  async setAutoLockTimeout(minutes: AutoLockTimeout): Promise<void> {
    this.#autoLockConfig.timeoutMinutes = minutes;
    await this.saveAutoLockConfigToStorage(this.#autoLockConfig);
    this.restartAutoLockTimer();
  }

  resetAutoLockTimer(): void {
    if (this.#autoLockConfig.timeoutMinutes === 0) {
      return;
    }
    this.restartAutoLockTimer();
  }

  stopAutoLockTimer(): void {
    if (this.#autoLockTimerId) {
      clearTimeout(this.#autoLockTimerId);
      this.#autoLockTimerId = null;
    }
  }

  private restartAutoLockTimer(): void {
    this.stopAutoLockTimer();

    if (this.#autoLockConfig.timeoutMinutes === 0) {
      return;
    }

    this.#autoLockTimerId = setTimeout(
      async () => {
        await this.handleAutoLock();
      },
      this.#autoLockConfig.timeoutMinutes * 60 * 1000,
    );
  }

  private async handleAutoLock(): Promise<void> {
    this.debug('Auto-lock triggered, clearing session data');
    await this.clearSessionData();
  }

  protected abstract getAutoLockConfigFromStorage(): Promise<AutoLockConfig | null>;
  protected abstract saveAutoLockConfigToStorage(
    config: AutoLockConfig,
  ): Promise<void>;

  debug(message: any, type: 'log' | 'error' = 'log') {
    const dateString = new Date().toISOString();

    if (type === 'error') {
      console.error(`[Gooti - ${dateString}]: ${JSON.stringify(message)}`);
    } else {
      console.log(`[Gooti - ${dateString}]: ${JSON.stringify(message)}`);
    }
  }

  checkPermissions(
    browserSessionData: BrowserSessionData,
    identity: Identity_DECRYPTED,
    host: string,
    method: Nip07Method,
    params: any,
  ): boolean | undefined {
    const permissionIds = browserSessionData.permissions;
    const permissions: Permission_DECRYPTED[] = [];
    for (const permissionId of permissionIds) {
      const permission = browserSessionData[`permission_${permissionId}`];
      if (!permission) {
        continue;
      }

      if (
        permission.identityId === identity.id &&
        permission.host === host &&
        permission.method === method
      ) {
        permissions.push(permission);
      }
    }

    if (permissions.length === 0) {
      return undefined;
    }

    if (method === 'getPublicKey') {
      // No evaluation of params required.
      return permissions.every((x) => x.methodPolicy === 'allow');
    }

    if (method === 'getRelays') {
      // No evaluation of params required.
      return permissions.every((x) => x.methodPolicy === 'allow');
    }

    if (method === 'signEvent') {
      // Evaluate params.
      const eventTemplate = params as EventTemplate;
      if (
        permissions.find(
          (x) => x.methodPolicy === 'allow' && typeof x.kind === 'undefined',
        )
      ) {
        return true;
      }

      if (
        permissions.some(
          (x) => x.methodPolicy === 'allow' && x.kind === eventTemplate.kind,
        )
      ) {
        return true;
      }

      if (
        permissions.some(
          (x) => x.methodPolicy === 'deny' && x.kind === eventTemplate.kind,
        )
      ) {
        return false;
      }

      return undefined;
    }

    if (method === 'nip04.encrypt') {
      // No evaluation of params required.
      return permissions.every((x) => x.methodPolicy === 'allow');
    }

    if (method === 'nip44.encrypt') {
      // No evaluation of params required.
      return permissions.every((x) => x.methodPolicy === 'allow');
    }

    if (method === 'nip04.decrypt') {
      // No evaluation of params required.
      return permissions.every((x) => x.methodPolicy === 'allow');
    }

    if (method === 'nip44.decrypt') {
      // No evaluation of params required.
      return permissions.every((x) => x.methodPolicy === 'allow');
    }

    return undefined;
  }

  signEvent(eventTemplate: EventTemplate, privkey: string): Event {
    return finalizeEvent(eventTemplate, NostrHelper.hex2bytes(privkey));
  }

  async nip04Encrypt(
    privkey: string,
    peerPubkey: string,
    plaintext: string,
  ): Promise<string> {
    return await nip04.encrypt(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
      plaintext,
    );
  }

  async nip44Encrypt(
    privkey: string,
    peerPubkey: string,
    plaintext: string,
  ): Promise<string> {
    const key = nip44.v2.utils.getConversationKey(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
    );
    return nip44.v2.encrypt(plaintext, key);
  }

  async nip04Decrypt(
    privkey: string,
    peerPubkey: string,
    ciphertext: string,
  ): Promise<string> {
    return await nip04.decrypt(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
      ciphertext,
    );
  }

  async nip44Decrypt(
    privkey: string,
    peerPubkey: string,
    ciphertext: string,
  ): Promise<string> {
    const key = nip44.v2.utils.getConversationKey(
      NostrHelper.hex2bytes(privkey),
      peerPubkey,
    );

    return nip44.v2.decrypt(ciphertext, key);
  }

  async encryptPermission(
    permission: Permission_DECRYPTED,
    iv: string,
    password: string,
    kdfSalt: string = KDF_SALT_V1,
    kdfIterations: number = KDF_ITERATIONS_V1,
  ): Promise<Permission_ENCRYPTED> {
    const encryptedPermission: Permission_ENCRYPTED = {
      id: await this.encrypt(
        permission.id,
        iv,
        password,
        kdfSalt,
        kdfIterations,
      ),
      identityId: await this.encrypt(
        permission.identityId,
        iv,
        password,
        kdfSalt,
        kdfIterations,
      ),
      host: await this.encrypt(
        permission.host,
        iv,
        password,
        kdfSalt,
        kdfIterations,
      ),
      method: await this.encrypt(
        permission.method,
        iv,
        password,
        kdfSalt,
        kdfIterations,
      ),
      methodPolicy: await this.encrypt(
        permission.methodPolicy,
        iv,
        password,
        kdfSalt,
        kdfIterations,
      ),
    };

    if (typeof permission.kind !== 'undefined') {
      encryptedPermission.kind = await this.encrypt(
        permission.kind.toString(),
        iv,
        password,
        kdfSalt,
        kdfIterations,
      );
    }

    return encryptedPermission;
  }

  async encrypt(
    value: string,
    iv: string,
    password: string,
    kdfSalt: string = KDF_SALT_V1,
    kdfIterations: number = KDF_ITERATIONS_V1,
  ): Promise<string> {
    return await CryptoHelper.encrypt(
      value,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    );
  }

  getKdfParams(browserSyncData: BrowserSyncData | undefined): {
    salt: string;
    iterations: number;
  } {
    if (
      browserSyncData?.kdfVersion === KDF_VERSION_CURRENT &&
      browserSyncData.kdfSalt
    ) {
      return {
        salt: browserSyncData.kdfSalt,
        iterations: KDF_ITERATIONS_V2,
      };
    }
    return {
      salt: KDF_SALT_V1,
      iterations: KDF_ITERATIONS_V1,
    };
  }
}
