import { Nip07Method, Nip07MethodPolicy } from '@common';
import type { SharedBunker } from '../../backup/document';
import type { BackupState } from '../../backup/state';

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

export interface IdentityBunker extends SharedBunker {
  /** Hex key for the approved bunker session. Comes from this browser or from the backup. */
  clientSecretKey?: string;
  /** This browser disconnected. A key from the backup does not link it again. Not published. */
  unlinked?: true;
  /**
   * Gooti Desktop holds the key: the bunker link said `gooti=1`, or backup brought the pointer with
   * a custody time. Gooti Desktop asks itself, so this browser never does. Not published.
   */
  gootiDesktop?: true;
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
  /** Sealed Nostr backup state. Absent until backup is turned on. */
  backupState?: string;
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
  /** Plain backup state while the vault is unlocked. Absent until backup is turned on. */
  backupState?: BackupState;
  /** Passphrase shown until the user applies or cancels. Not part of the sealed vault. */
  pendingPassphrase?: string;
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
  backupFlow: 'backupFlow',
  /** This browser's request log. Not part of the vault or the shared record. */
  activity: 'activity',
} as const;

export const GOOTI_META_PROPERTIES = [
  GOOTI_META_DATA_KEY.backupFlow,
  GOOTI_META_DATA_KEY.syncRetired,
  GOOTI_META_DATA_KEY.vaultSnapshots,
  GOOTI_META_DATA_KEY.activity,
] as const;

export interface GootiMetaData {
  /** True after the one-time copy out of browser-account sync. */
  syncRetired?: boolean;
  /** @deprecated Browser-account sync was removed. Ignored. */
  backupFlow?: number;
  vaultSnapshots?: GootiMetaData_VaultSnapshot[];
}
