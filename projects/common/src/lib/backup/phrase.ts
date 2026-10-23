import { mnemonicToSeedSync } from '@scure/bip39';
import { getPublicKey } from 'nostr-tools';
import { generateSeedWords, validateWords } from 'nostr-tools/nip06';

/** HKDF salt. The phrase seed is already high entropy; this only domains the two keys. */
const HKDF_SALT = 'gooti-backup-v1';

export const SHARED_SIGN_INFO = 'gooti-shared-sign-v1';
export const SHARED_ENCRYPT_INFO = 'gooti-shared-encrypt-v1';

export interface BackupKeys {
  /** secp256k1 secret for the kind 30078 event. Not an identity key. */
  signingKey: Uint8Array;
  /** AES-256-GCM key for the vault blob. */
  encryptionKey: Uint8Array;
  /** Hex pubkey of signingKey. */
  pubkey: string;
}

export function generatePassphrase(): string {
  return generateSeedWords();
}

export function normalizePassphrase(phrase: string): string {
  return phrase.normalize('NFKD').trim().split(/\s+/).join(' ');
}

export function isPassphrase(phrase: string): boolean {
  return validateWords(normalizePassphrase(phrase));
}

/**
 * Derives the backup signing key and the blob key from a BIP-39 phrase.
 * The signing key is HKDF, not NIP-06 account 0, so it is never an identity.
 */
export async function deriveSharedKeys(phrase: string): Promise<BackupKeys> {
  const normalized = normalizePassphrase(phrase);
  if (!validateWords(normalized)) {
    throw new Error('That passphrase is not valid. Check your 12 words.');
  }

  const seed = copyBytes(mnemonicToSeedSync(normalized));
  const encryptionKey = await hkdf(seed, SHARED_ENCRYPT_INFO);

  let signingKey: Uint8Array | undefined;
  let pubkey: string | undefined;
  for (let attempt = 0; attempt < 8; attempt++) {
    const info = attempt === 0 ? SHARED_SIGN_INFO : `${SHARED_SIGN_INFO}:${attempt}`;
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
    throw new Error('Could not set up backup from this passphrase.');
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
