import { EventTemplate, VerifiedEvent, generateSecretKey } from 'nostr-tools';
import { BunkerPointer, BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { AbstractSimplePool, SimplePool } from 'nostr-tools/pool';
import { SyncBunker } from '../sync/document';
import { bytesToHex, hexToBytes } from '../sync/state';

export const BUNKER_DID_NOT_ANSWER = 'Your bunker did not answer.';
export const BUNKER_NOT_CONNECTED = 'Paste a new bunker link on this browser first.';
export const INVALID_BUNKER_LINK = 'Invalid bunker link.';
export const BUNKER_TIMEOUT_MS = 60_000;

export interface ConnectedBunker {
  pubkey: string;
  clientSecretKeyHex: string;
  bunker: SyncBunker;
}

export interface BunkerCallOptions {
  pool?: AbstractSimplePool;
  timeoutMs?: number;
}

/** Paste a bunker:// link, wait for the phone to approve, and return the session. */
export async function connectBunker(
  link: string,
  options?: BunkerCallOptions,
): Promise<ConnectedBunker> {
  const pointer = await pointerFromLink(link);
  return connectPointer(pointer, options);
}

export async function bunkerSignEvent(
  clientSecretKeyHex: string,
  bunker: SyncBunker,
  event: EventTemplate,
  options?: BunkerCallOptions,
): Promise<VerifiedEvent> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) => signer.signEvent(event));
}

export async function bunkerNip04Encrypt(
  clientSecretKeyHex: string,
  bunker: SyncBunker,
  peerPubkey: string,
  plaintext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    signer.nip04Encrypt(peerPubkey, plaintext),
  );
}

export async function bunkerNip04Decrypt(
  clientSecretKeyHex: string,
  bunker: SyncBunker,
  peerPubkey: string,
  ciphertext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    signer.nip04Decrypt(peerPubkey, ciphertext),
  );
}

export async function bunkerNip44Encrypt(
  clientSecretKeyHex: string,
  bunker: SyncBunker,
  peerPubkey: string,
  plaintext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    signer.nip44Encrypt(peerPubkey, plaintext),
  );
}

export async function bunkerNip44Decrypt(
  clientSecretKeyHex: string,
  bunker: SyncBunker,
  peerPubkey: string,
  ciphertext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    signer.nip44Decrypt(peerPubkey, ciphertext),
  );
}

async function connectPointer(
  pointer: BunkerPointer,
  options: BunkerCallOptions | undefined,
): Promise<ConnectedBunker> {
  const clientSecretKey = generateSecretKey();
  const pubkey = await withSignerBytes(clientSecretKey, pointer, options, async (signer) => {
    await signer.connect();
    return signer.getPublicKey();
  });
  return {
    pubkey,
    clientSecretKeyHex: bytesToHex(clientSecretKey),
    bunker: {
      pubkey: pointer.pubkey,
      relays: [...pointer.relays],
      secret: pointer.secret,
    },
  };
}

async function pointerFromLink(link: string): Promise<BunkerPointer> {
  const trimmed = link.trim();
  const normalized = trimmed.replace(
    /^bunker:\/\/([0-9a-fA-F]{64})/i,
    (_match, pubkey: string) => `bunker://${pubkey.toLowerCase()}`,
  );
  const pointer = await parseBunkerInput(normalized);
  if (!pointer || pointer.relays.length === 0) {
    throw new Error(INVALID_BUNKER_LINK);
  }
  return pointer;
}

async function withSigner<T>(
  clientSecretKeyHex: string,
  bunker: SyncBunker,
  options: BunkerCallOptions | undefined,
  run: (signer: BunkerSigner) => Promise<T>,
): Promise<T> {
  return withSignerBytes(
    hexToBytes(clientSecretKeyHex),
    { pubkey: bunker.pubkey, relays: [...bunker.relays], secret: bunker.secret },
    options,
    run,
  );
}

async function withSignerBytes<T>(
  clientSecretKey: Uint8Array,
  pointer: BunkerPointer,
  options: BunkerCallOptions | undefined,
  run: (signer: BunkerSigner) => Promise<T>,
): Promise<T> {
  const pool = options?.pool ?? new SimplePool();
  const ownsPool = options?.pool === undefined;
  let rejectAuth: (error: Error) => void = () => undefined;
  const auth = new Promise<never>((_resolve, reject) => {
    rejectAuth = reject;
  });
  const signer = BunkerSigner.fromBunker(clientSecretKey, pointer, {
    pool,
    onauth: (url) => rejectAuth(new Error(`Approve the bunker at ${url}`)),
  });
  const timeoutMs = options?.timeoutMs ?? BUNKER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(signer),
      auth,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(BUNKER_DID_NOT_ANSWER)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    try {
      await signer.close();
    } catch {
      // The relay subscription may already be gone.
    }
    if (ownsPool) {
      pool.close(pointer.relays);
    }
  }
}
