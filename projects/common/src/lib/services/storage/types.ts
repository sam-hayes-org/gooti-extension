import { Nip07Method, Nip07MethodPolicy } from '@common';
import type { SyncBunker } from '../../sync/document';
import type { NostrSyncState } from '../../sync/state';

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

/** The identity a site connected as. One row per host. */
export interface Site_DECRYPTED {
  id: string;
  identityId: string;
  host: string;
}

export interface Site_ENCRYPTED {
  id: string;
  identityId: string;
  host: string;
}

export interface IdentityBunker extends SyncBunker {
  /** Hex key used only to talk to the bunker. Stays on this browser. */
  clientSecretKey?: string;
}

export interface Identity_DECRYPTED {
  id: string;
  createdAt: string;
  nick: string;
  pubkey: string;
  /** Absent when this identity is a remote bunker. */
  privkey?: string;
  /** Optional `#rrggbb`. The list derives one from the pubkey when this is absent. */
  color?: string;
  bunker?: IdentityBunker;
}

export interface Identity_ENCRYPTED {
  id: string;
  createdAt: string;
  nick: string;
  /** Absent on a vault written before public keys were stored. Derived from privkey on open. */
  pubkey?: string;
  privkey?: string;
  color?: string;
  /** Sealed JSON. Includes this browser's conversation key when connected. */
  bunker?: string;
}

/** Leftover rows from a vault that stored a per-identity publish list. Not written anymore. */
export interface Relay_ENCRYPTED {
  id: string;
  identityId: string;
  url: string;
  read: string;
  write: string;
}

export interface BrowserSyncData_PART_Unencrypted {
  version: number;
  /** Shared IV for vault formats v1 and v2. Absent in v3. */
  iv?: string;
  /** Unsalted password hash for vault formats v1 and v2. Absent in v3. */
  vaultHash?: string;
  /** Base64 PBKDF2 salt. Present in v3. */
  salt?: string;
  /** Sealed canary. Present in v3. */
  canary?: string;
  /** Sealed Nostr sync state. Absent until sync is turned on. */
  nostrSync?: string;
}

export type BrowserSyncData_PART_Encrypted = {
  selectedIdentityId: string | null;
  permissions: string[];
  identities: string[];
  /** Absent after unlock. Older vaults may still contain a publish-relay list. */
  relays?: Relay_ENCRYPTED[];
  /** Ciphertext ids of site bindings. Absent on a vault written before site bindings. */
  sites?: string[];
} & Partial<Record<`permission_${string}`, Permission_ENCRYPTED>> & // Optional to allow empty/missing
  Partial<Record<`site_${string}`, Site_ENCRYPTED>> &
  Partial<Record<`identity_${string}`, Identity_ENCRYPTED>>;

export type BrowserSyncData = BrowserSyncData_PART_Unencrypted &
  BrowserSyncData_PART_Encrypted;

export type BrowserSessionData = {
  // The following properties purely come from the browser session storage
  // and will never be going into the browser sync storage.
  vaultPassword?: string;

  // The following properties initially come from the browser sync storage.
  /** Empty for a v3 vault. v3 keeps the key salt instead of a shared IV. */
  iv: string;
  /** Base64 PBKDF2 salt while a v3 vault is unlocked. */
  salt?: string;
  permissions: string[];
  identities: string[];
  selectedIdentityId: string | null;
  /** Plaintext ids of site bindings. Absent until a site connects. */
  sites?: string[];
  /** Plain sync state while the vault is unlocked. Absent until sync is turned on. */
  nostrSync?: NostrSyncState;
  /** Passphrase shown until the user applies or cancels. Not part of the sealed vault. */
  pendingSyncPhrase?: string;
} & Partial<Record<`permission_${string}`, Permission_DECRYPTED>> & // Optional to allow empty/missing
  Partial<Record<`site_${string}`, Site_DECRYPTED>> &
  Partial<Record<`identity_${string}`, Identity_DECRYPTED>>;

export interface GootiMetaData_VaultSnapshot {
  fileName: string;
  data: BrowserSyncData;
}

export const GOOTI_META_DATA_KEY = {
  vaultSnapshots: 'vaultSnapshots',
  syncRetired: 'syncRetired',
  /** Leftover key from removed browser-account sync. Kept so it stays out of the vault record. */
  syncFlow: 'syncFlow',
  /** This browser's request log. Not part of the vault or the synced document. */
  activity: 'activity',
} as const;

export const GOOTI_META_PROPERTIES = [
  GOOTI_META_DATA_KEY.syncFlow,
  GOOTI_META_DATA_KEY.syncRetired,
  GOOTI_META_DATA_KEY.vaultSnapshots,
  GOOTI_META_DATA_KEY.activity,
] as const;

export interface GootiMetaData {
  /** True after the one-time copy out of browser-account sync. */
  syncRetired?: boolean;
  /** @deprecated Browser-account sync was removed. Ignored. */
  syncFlow?: number;
  vaultSnapshots?: GootiMetaData_VaultSnapshot[];
}
