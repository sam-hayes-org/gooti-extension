import { mnemonicToSeedSync } from '@scure/bip39';
import { getPublicKey } from 'nostr-tools';
import { generateSeedWords, validateWords } from 'nostr-tools/nip06';

/** HKDF salt. The phrase seed is already high entropy; this only domains the two keys. */
const HKDF_SALT = 'gooti-sync-v1';

export const SYNC_SIGN_INFO = 'gooti-sync-sign-v1';
export const SYNC_ENCRYPT_INFO = 'gooti-sync-encrypt-v1';

export interface SyncKeys {
  /** secp256k1 secret for the kind 30078 event. Not an identity key. */
  signingKey: Uint8Array;
  /** AES-256-GCM key for the vault blob. */
  encryptionKey: Uint8Array;
  /** Hex pubkey of signingKey. */
  pubkey: string;
}

export function generateSyncPhrase(): string {
  return generateSeedWords();
}

export function normalizeSyncPhrase(phrase: string): string {
  return phrase.normalize('NFKD').trim().split(/\s+/).join(' ');
}

export function isSyncPhrase(phrase: string): boolean {
  return validateWords(normalizeSyncPhrase(phrase));
}

/**
 * Derives the sync signing key and the blob key from a BIP-39 phrase.
 * The signing key is HKDF, not NIP-06 account 0, so it is never an identity.
 */
export async function deriveSyncKeys(phrase: string): Promise<SyncKeys> {
  const normalized = normalizeSyncPhrase(phrase);
  if (!validateWords(normalized)) {
    throw new Error('Invalid recovery phrase.');
  }

  const seed = copyBytes(mnemonicToSeedSync(normalized));
  const encryptionKey = await hkdf(seed, SYNC_ENCRYPT_INFO);

  let signingKey: Uint8Array | undefined;
  let pubkey: string | undefined;
  for (let attempt = 0; attempt < 8; attempt++) {
    const info = attempt === 0 ? SYNC_SIGN_INFO : `${SYNC_SIGN_INFO}:${attempt}`;
    const candidate = copyBytes(await hkdf(seed, info));
    try {
      pubkey = getPublicKey(candidate);
      signingKey = candidate;
      break;
    } catch {
      // A 32-byte string is not a secp256k1 scalar. Try the next label.
    }
  }
  if (!signingKey || !pubkey) {
    throw new Error('Could not derive a sync signing key.');
  }

  return { signingKey, encryptionKey, pubkey };
}

function copyBytes(source: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

async function hkdf(seed: Uint8Array<ArrayBuffer>, info: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', seed, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(HKDF_SALT),
      info: new TextEncoder().encode(info),
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}
