import { Buffer } from 'buffer';
import { SyncDocument, assertSyncDocument } from './document';

/** Decoded blob larger than this is rejected before decrypt. */
const MAX_PACKED_BYTES = 1_000_000;

const VERSION = 1;

/**
 * Packs the document as version || 12-byte IV || AES-256-GCM ciphertext,
 * then base64. The same document seals differently each call.
 */
export async function sealSyncDocument(
  document: SyncDocument,
  encryptionKey: Uint8Array,
): Promise<string> {
  assertSyncDocument(document);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      v: document.v,
      identities: document.identities,
      permissions: document.permissions,
      relays: document.relays,
    }),
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await aesKey(encryptionKey),
      plaintext,
    ),
  );
  const packed = new Uint8Array(1 + iv.length + ciphertext.length);
  packed[0] = VERSION;
  packed.set(iv, 1);
  packed.set(ciphertext, 1 + iv.length);
  return Buffer.from(packed).toString('base64');
}

/**
 * Throws when the key is wrong or the blob was edited.
 * Returns null when the plaintext is an older document. The caller publishes
 * the current document over it.
 */
export async function openSyncDocument(
  payload: string,
  encryptionKey: Uint8Array,
): Promise<SyncDocument | null> {
  let packed: Uint8Array;
  try {
    packed = new Uint8Array(Buffer.from(payload, 'base64'));
  } catch {
    throw new Error('Invalid sync blob.');
  }
  if (packed.length < 1 + 12 + 16 || packed.length > MAX_PACKED_BYTES || packed[0] !== VERSION) {
    throw new Error('Invalid sync blob.');
  }

  const iv = packed.slice(1, 13);
  const ciphertext = packed.slice(13);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      await aesKey(encryptionKey),
      ciphertext,
    );
  } catch {
    throw new Error('Invalid sync blob.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('Invalid sync blob.');
  }
  if (isOldDocument(parsed)) {
    return null;
  }
  assertSyncDocument(parsed);
  return parsed;
}

function isOldDocument(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { v?: unknown }).v !== 2;
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return crypto.subtle.importKey('raw', copy, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}
