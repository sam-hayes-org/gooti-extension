import { Nip07Method, Nip07MethodPolicy } from '@common';

export interface Permission_DECRYPTED {
  id: string;
  identityId: string;
  host: string;
  method: Nip07Method;
  methodPolicy: Nip07MethodPolicy;
  kind?: number;
}

export interface Permission_ENCRYPTED {
  id: string;
  identityId: string;
  host: string;
  method: string;
  methodPolicy: string;
  kind?: string;
}

export interface Identity_DECRYPTED {
  id: string;
  createdAt: string;
  nick: string;
  privkey: string;
}

export type Identity_ENCRYPTED = Identity_DECRYPTED;

export interface Relay_DECRYPTED {
  id: string;
  identityId: string;
  url: string;
  read: boolean;
  write: boolean;
}

export interface Relay_ENCRYPTED {
  id: string;
  identityId: string;
  url: string;
  read: string;
  write: string;
}

export interface BrowserSyncData_PART_Unencrypted {
  version: number;
  iv: string;
  vaultHash: string;
}

export interface BrowserSyncData_PART_Encrypted {
  selectedIdentityId: string | null;
  permissions: Permission_ENCRYPTED[];
  identities: Identity_ENCRYPTED[];
  relays: Relay_ENCRYPTED[];
}

export type BrowserSyncData = BrowserSyncData_PART_Unencrypted &
  BrowserSyncData_PART_Encrypted;

export enum BrowserSyncFlow {
  NO_SYNC = 0,
  BROWSER_SYNC = 1,
  GOOTI_SYNC = 2,
  CUSTOM_SYNC = 3,
}

export interface BrowserSyncUtilization {
  bytesInUse: number;
  quotaBytes: number;
  quotaBytesPerItem: number;
  quotaItems: number;
}

export interface BrowserSessionData {
  // The following properties purely come from the browser session storage
  // and will never be going into the browser sync storage.
  vaultPassword?: string;

  // The following properties initially come from the browser sync storage.
  iv: string;
  permissions: Permission_DECRYPTED[];
  identities: Identity_DECRYPTED[];
  selectedIdentityId: string | null;
  relays: Relay_DECRYPTED[];
}

export interface GootiMetaData_VaultSnapshot {
  fileName: string;
  data: BrowserSyncData;
}

export const GOOTI_META_DATA_KEY = {
  vaultSnapshots: 'vaultSnapshots',
};

export interface GootiMetaData {
  syncFlow?: number; // 0 = no sync, 1 = browser sync, (future: 2 = Gooti sync, 3 = Custom sync (bring your own sync))

  vaultSnapshots?: GootiMetaData_VaultSnapshot[];
}
