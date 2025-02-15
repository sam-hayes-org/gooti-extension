/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BrowserSessionData,
  BrowserSyncData,
  BrowserSyncFlow,
  CryptoHelper,
  GootiMetaData,
  Identity_DECRYPTED,
  Nip07Method,
  Nip07MethodPolicy,
  NostrHelper,
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
} from '@common';
import { Event, EventTemplate, finalizeEvent, nip04, nip44 } from 'nostr-tools';
import { FirefoxMetaHandler } from './app/common/data/firefox-meta-handler';
import browser from 'webextension-polyfill';

export const debug = function (message: any) {
  const dateString = new Date().toISOString();
  console.log(`[Gooti - ${dateString}]: ${JSON.stringify(message)}`);
};

export type PromptResponse =
  | 'reject'
  | 'reject-once'
  | 'approve'
  | 'approve-once';

export interface PromptResponseMessage {
  id: string;
  response: PromptResponse;
}

export interface BackgroundRequestMessage {
  method: Nip07Method;
  params: any;
  host: string;
}

export const getBrowserSessionData = async function (): Promise<
  BrowserSessionData | undefined
> {
  const browserSessionData = await browser.storage.session.get(null);
  if (Object.keys(browserSessionData).length === 0) {
    return undefined;
  }

  return browserSessionData as unknown as BrowserSessionData;
};

export const getBrowserSyncData = async function (): Promise<
  BrowserSyncData | undefined
> {
  const gootiMetaHandler = new FirefoxMetaHandler();
  const gootiMetaData =
    (await gootiMetaHandler.loadFullData()) as GootiMetaData;

  let browserSyncData: BrowserSyncData | undefined;

  if (gootiMetaData.syncFlow === BrowserSyncFlow.NO_SYNC) {
    browserSyncData = (await browser.storage.local.get(
      null
    )) as unknown as BrowserSyncData;
  } else if (gootiMetaData.syncFlow === BrowserSyncFlow.BROWSER_SYNC) {
    browserSyncData = (await browser.storage.sync.get(
      null
    )) as unknown as BrowserSyncData;
  }

  return browserSyncData;
};

export const savePermissionsToBrowserSyncStorage = async function (
  permissions: Permission_ENCRYPTED[]
): Promise<void> {
  const gootiMetaHandler = new FirefoxMetaHandler();
  const gootiMetaData =
    (await gootiMetaHandler.loadFullData()) as GootiMetaData;

  if (gootiMetaData.syncFlow === BrowserSyncFlow.NO_SYNC) {
    await browser.storage.local.set({ permissions });
  } else if (gootiMetaData.syncFlow === BrowserSyncFlow.BROWSER_SYNC) {
    await browser.storage.sync.set({ permissions });
  }
};

export const checkPermissions = function (
  browserSessionData: BrowserSessionData,
  identity: Identity_DECRYPTED,
  host: string,
  method: Nip07Method,
  params: any
): boolean | undefined {
  const permissions = browserSessionData.permissions.filter(
    (x) =>
      x.identityId === identity.id && x.host === host && x.method === method
  );

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
        (x) => x.methodPolicy === 'allow' && typeof x.kind === 'undefined'
      )
    ) {
      return true;
    }

    if (
      permissions.some(
        (x) => x.methodPolicy === 'allow' && x.kind === eventTemplate.kind
      )
    ) {
      return true;
    }

    if (
      permissions.some(
        (x) => x.methodPolicy === 'deny' && x.kind === eventTemplate.kind
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
};

export const storePermission = async function (
  browserSessionData: BrowserSessionData,
  identity: Identity_DECRYPTED,
  host: string,
  method: Nip07Method,
  methodPolicy: Nip07MethodPolicy,
  kind?: number
) {
  const browserSyncData = await getBrowserSyncData();
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
    permissions: [...browserSessionData.permissions, permission],
  });

  // Encrypt permission to store in sync storage (depending on sync flow).
  const encryptedPermission = await encryptPermission(
    permission,
    browserSessionData.iv,
    browserSessionData.vaultPassword as string
  );

  await savePermissionsToBrowserSyncStorage([
    ...browserSyncData.permissions,
    encryptedPermission,
  ]);
};

export const getPosition = async function (width: number, height: number) {
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
};

export const signEvent = function (
  eventTemplate: EventTemplate,
  privkey: string
): Event {
  return finalizeEvent(eventTemplate, NostrHelper.hex2bytes(privkey));
};

export const nip04Encrypt = async function (
  privkey: string,
  peerPubkey: string,
  plaintext: string
): Promise<string> {
  return await nip04.encrypt(
    NostrHelper.hex2bytes(privkey),
    peerPubkey,
    plaintext
  );
};

export const nip44Encrypt = async function (
  privkey: string,
  peerPubkey: string,
  plaintext: string
): Promise<string> {
  const key = nip44.v2.utils.getConversationKey(
    NostrHelper.hex2bytes(privkey),
    peerPubkey
  );
  return nip44.v2.encrypt(plaintext, key);
};

export const nip04Decrypt = async function (
  privkey: string,
  peerPubkey: string,
  ciphertext: string
): Promise<string> {
  return await nip04.decrypt(
    NostrHelper.hex2bytes(privkey),
    peerPubkey,
    ciphertext
  );
};

export const nip44Decrypt = async function (
  privkey: string,
  peerPubkey: string,
  ciphertext: string
): Promise<string> {
  const key = nip44.v2.utils.getConversationKey(
    NostrHelper.hex2bytes(privkey),
    peerPubkey
  );

  return nip44.v2.decrypt(ciphertext, key);
};

const encryptPermission = async function (
  permission: Permission_DECRYPTED,
  iv: string,
  password: string
): Promise<Permission_ENCRYPTED> {
  const encryptedPermission: Permission_ENCRYPTED = {
    id: await encrypt(permission.id, iv, password),
    identityId: await encrypt(permission.identityId, iv, password),
    host: await encrypt(permission.host, iv, password),
    method: await encrypt(permission.method, iv, password),
    methodPolicy: await encrypt(permission.methodPolicy, iv, password),
  };

  if (typeof permission.kind !== 'undefined') {
    encryptedPermission.kind = await encrypt(
      permission.kind.toString(),
      iv,
      password
    );
  }

  return encryptedPermission;
};

const encrypt = async function (
  value: string,
  iv: string,
  password: string
): Promise<string> {
  return await CryptoHelper.encrypt(value, iv, password);
};
