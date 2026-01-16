/* eslint-disable @typescript-eslint/consistent-type-definitions */
export type BrowserSyncDataVersion1 = {
  /** Unencrypted */
  version: number;

  /** Unencrypted */
  iv: string;

  /** Unencrypted */
  vaultHash: string;

  /** Encrypted */
  selectedIdentityId: string | null;

  /** Encrypted */
  permissions: {
    id: string;
    identityId: string;
    host: string;
    method: string;
    methodPolicy: string;
    kind?: string;
  }[];

  /** Encrypted */
  identities: {
    id: string;
    createdAt: string;
    nick: string;
    privkey: string;
  }[];

  /** Encrypted */
  relays: {
    id: string;
    identityId: string;
    url: string;
    read: string; // decrypts to boolean
    write: string; // decrypts to boolean
  }[];
};

export type BrowserSyncDataVersion2 = {
  /** Unencrypted */
  version: number;

  /** Unencrypted */
  iv: string;

  /** Unencrypted */
  vaultHash: string;

  /** Encrypted */
  selectedIdentityId: string | null;

  /** Encrypted */
  permissions: string[];

  /** Encrypted */
  identities: string[];

  /** Encrypted */
  relays: {
    id: string;
    identityId: string;
    url: string;
    read: string; // decrypts to boolean
    write: string; // decrypts to boolean
  }[];
} & Partial<
  Record<
    `permission_${string}`,
    {
      id: string;
      identityId: string;
      host: string;
      method: string;
      methodPolicy: string;
      kind?: string;
    }
  >
> & // Optional to allow empty/missing
  Partial<
    Record<
      `identity_${string}`,
      {
        id: string;
        createdAt: string;
        nick: string;
        privkey: string;
      }
    >
  >;
