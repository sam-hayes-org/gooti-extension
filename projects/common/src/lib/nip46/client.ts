import {
  EventTemplate,
  VerifiedEvent,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
} from 'nostr-tools';
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import { BunkerPointer, BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { AbstractSimplePool, SimplePool, SubCloser } from 'nostr-tools/pool';
import { SharedBunker } from '../backup/document';
import { bytesToHex, hexToBytes } from '../backup/state';

export const BUNKER_DID_NOT_ANSWER = 'Your bunker did not answer. Check that its app is open.';
export const DESKTOP_DID_NOT_ANSWER = 'Gooti Desktop did not answer. Open it and unlock it.';
export const DESKTOP_BAD_SIGNATURE = 'Gooti Desktop sent an event that is not signed correctly.';
export const BUNKER_NOT_CONNECTED = 'Paste a new bunker link on this browser first.';
export const INVALID_BUNKER_LINK = 'Invalid bunker link.';
export const BUNKER_SENT_NO_RELAYS = 'The bunker sent no relays.';
export const BUNKER_NEEDS_WSS = 'The bunker needs a wss:// relay. Backup and Gooti Desktop accept only those.';
/** Gooti Desktop's answer to a browser it disconnected or denied. A new key asks again. */
export const DESKTOP_DISCONNECTED = 'Gooti Desktop disconnected this browser.';
/**
 * Gooti Desktop's answer to the shared key that older backups carry: it no longer accepts it. This
 * browser shows `DESKTOP_NOT_ALLOWED` instead, and asks with its own key when the popup opens.
 */
export const DESKTOP_RETIRED_KEY = 'Update Gooti in this browser to sign through Gooti Desktop.';
/** A browser with its own key that Gooti Desktop has not allowed yet. */
export const DESKTOP_NOT_ALLOWED = 'Allow this browser in Gooti Desktop first. Open Gooti and look for the request.';
export const BUNKER_TIMEOUT_MS = 60_000;
/** Gooti Desktop gives you 5 minutes to approve, then answers itself. A little longer here. */
export const DESKTOP_TIMEOUT_MS = 330_000;
/** A ping tells quickly whether Gooti Desktop is there before a request may wait 5 minutes. */
export const DESKTOP_PING_MS = 8_000;
/** No ping when Gooti Desktop answered this recently. */
export const DESKTOP_RECENT_MS = 120_000;

/** The bunker kept its relays, or returned a different list to save. */
export type BunkerRelayRefresh = { changed: false } | { changed: true; relays: string[] };

export interface ConnectedBunker {
  pubkey: string;
  clientSecretKeyHex: string;
  bunker: SharedBunker;
  /** The link came from Gooti Desktop (`gooti=1`). */
  gootiDesktop?: true;
}

export interface BunkerCallOptions {
  pool?: AbstractSimplePool;
  timeoutMs?: number;
  /**
   * The identity's key is held by Gooti Desktop (a shared pointer with custodyAt).
   * The request names the site, waits for the desktop's own approval time, and pings first.
   */
  desktop?: DesktopCall;
}

export interface DesktopCall {
  /** The site's host. Gooti Desktop shows it in its approval window and Activity. */
  site?: string;
  /** No ping first: a browser that is not connected yet gets no pong. */
  noPing?: true;
}

/** When each Gooti Desktop signer key last answered, in this worker's lifetime. */
const desktopAnswers = new Map<string, number>();

/** For tests. */
export function forgetDesktopAnswers(): void {
  desktopAnswers.clear();
}

/**
 * Gooti Desktop reads an extra last parameter `{"site": host}`. Other bunkers never get it.
 * NIP-46 has no field for this; a bunker ignores parameters it does not expect.
 */
function siteParams(options: BunkerCallOptions | undefined): string[] {
  const site = options?.desktop?.site;
  return site ? [JSON.stringify({ site })] : [];
}

/** Paste a bunker:// link, wait for the phone to approve, and return the session. */
export async function connectBunker(
  link: string,
  options?: BunkerCallOptions,
): Promise<ConnectedBunker> {
  const pointer = await pointerFromLink(link);
  const connected = await connectPointer(pointer, options);
  return fromGootiDesktop(link) ? { ...connected, gootiDesktop: true } : connected;
}

/**
 * Gooti Desktop adds `gooti=1` to the bunker links it hands out. Other bunker apps ignore a
 * parameter they do not know, so a link without it is any other bunker.
 */
export function fromGootiDesktop(link: string): boolean {
  const query = link.trim().split('?')[1];
  return query !== undefined && new URLSearchParams(query).get('gooti') === '1';
}

export async function bunkerSignEvent(
  clientSecretKeyHex: string,
  bunker: SharedBunker,
  event: EventTemplate,
  options?: BunkerCallOptions,
): Promise<VerifiedEvent> {
  return withSigner(clientSecretKeyHex, bunker, options, async (signer) => {
    if (!options?.desktop) {
      return signer.signEvent(event);
    }
    const signed = JSON.parse(
      await signer.sendRequest('sign_event', [JSON.stringify(event), ...siteParams(options)]),
    ) as VerifiedEvent;
    if (!verifyEvent(signed)) {
      throw new Error(DESKTOP_BAD_SIGNATURE);
    }
    return signed;
  });
}

export async function bunkerNip04Encrypt(
  clientSecretKeyHex: string,
  bunker: SharedBunker,
  peerPubkey: string,
  plaintext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    options?.desktop
      ? signer.sendRequest('nip04_encrypt', [peerPubkey, plaintext, ...siteParams(options)])
      : signer.nip04Encrypt(peerPubkey, plaintext),
  );
}

export async function bunkerNip04Decrypt(
  clientSecretKeyHex: string,
  bunker: SharedBunker,
  peerPubkey: string,
  ciphertext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    options?.desktop
      ? signer.sendRequest('nip04_decrypt', [peerPubkey, ciphertext, ...siteParams(options)])
      : signer.nip04Decrypt(peerPubkey, ciphertext),
  );
}

export async function bunkerNip44Encrypt(
  clientSecretKeyHex: string,
  bunker: SharedBunker,
  peerPubkey: string,
  plaintext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    options?.desktop
      ? signer.sendRequest('nip44_encrypt', [peerPubkey, plaintext, ...siteParams(options)])
      : signer.nip44Encrypt(peerPubkey, plaintext),
  );
}

/** Ask the bunker which relays to use. Null, or the same set, leaves the saved list alone. */
export async function bunkerSwitchRelays(
  clientSecretKeyHex: string,
  bunker: SharedBunker,
  options?: BunkerCallOptions,
): Promise<BunkerRelayRefresh> {
  const pool = options?.pool ?? new SimplePool();
  const ownsPool = options?.pool === undefined;
  try {
    return await withSigner(clientSecretKeyHex, bunker, { ...options, pool }, () =>
      requestSwitchRelays(pool, hexToBytes(clientSecretKeyHex), bunker),
    );
  } finally {
    if (ownsPool) {
      pool.close(bunker.relays);
    }
  }
}

export async function bunkerNip44Decrypt(
  clientSecretKeyHex: string,
  bunker: SharedBunker,
  peerPubkey: string,
  ciphertext: string,
  options?: BunkerCallOptions,
): Promise<string> {
  return withSigner(clientSecretKeyHex, bunker, options, (signer) =>
    options?.desktop
      ? signer.sendRequest('nip44_decrypt', [peerPubkey, ciphertext, ...siteParams(options)])
      : signer.nip44Decrypt(peerPubkey, ciphertext),
  );
}

/**
 * Asks Gooti Desktop to let this browser sign with its own key (`docs/DESIGN-browser-keys.md` in
 * gooti-desktop). Resolves once the desktop allowed it: at once when it did before, or after the
 * user presses Allow there. Rejects with `DESKTOP_DISCONNECTED` when it denied or disconnected the key.
 */
export async function connectGootiDesktop(
  browserKeyHex: string,
  bunker: SharedBunker,
  name: string,
  options?: { pool?: AbstractSimplePool; timeoutMs?: number },
): Promise<void> {
  await withSigner(
    browserKeyHex,
    { ...bunker, secret: null },
    { ...options, desktop: { noPing: true } },
    async (signer) => {
      // The secret comes with the pointer in the backup; Gooti Desktop asks about no browser
      // without it, so a stranger who sees its signer key on a relay cannot ask.
      await signer.sendRequest('connect', [
        bunker.pubkey,
        bunker.secret ?? '',
        '',
        JSON.stringify({ name, gooti: 'browser' }),
      ]);
    },
  );
}

/**
 * Whether Gooti Desktop still accepts this browser's own key: a ping, without a site and without
 * waiting long. Rejects with `DESKTOP_DISCONNECTED` when the desktop disconnected it, and with
 * `DESKTOP_DID_NOT_ANSWER` when it is not running.
 */
export async function checkGootiDesktop(
  browserKeyHex: string,
  bunker: SharedBunker,
  options?: { pool?: AbstractSimplePool },
): Promise<void> {
  await withSigner(
    browserKeyHex,
    { ...bunker, secret: null },
    { ...options, timeoutMs: DESKTOP_PING_MS, desktop: { noPing: true } },
    async (signer) => {
      await signer.ping();
    },
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

const SWITCH_RELAYS_KIND = 24133;

function requestSwitchRelays(
  pool: AbstractSimplePool,
  clientSecretKey: Uint8Array,
  bunker: SharedBunker,
): Promise<BunkerRelayRefresh> {
  const conversationKey = getConversationKey(clientSecretKey, bunker.pubkey);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const clientPubkey = getPublicKey(clientSecretKey);
  let closer: SubCloser | undefined;
  let settled = false;
  let sent = false;

  return new Promise((resolve, reject) => {
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        closer?.close();
      } catch {
        // The relay subscription may already be gone.
      }
      settle();
    };

    closer = pool.subscribe(
      bunker.relays,
      { kinds: [SWITCH_RELAYS_KIND], authors: [bunker.pubkey], '#p': [clientPubkey] },
      {
        onevent(event) {
          let payload: { id?: unknown; result?: unknown; error?: unknown };
          try {
            payload = JSON.parse(decrypt(event.content, conversationKey)) as {
              id?: unknown;
              result?: unknown;
              error?: unknown;
            };
          } catch {
            return;
          }
          if (payload.id !== id) {
            return;
          }
          const refused = payload.error;
          if (typeof refused === 'string' && refused.trim()) {
            finish(() => reject(new Error(refused.trim())));
            return;
          }
          try {
            const refresh = interpretSwitchRelays(bunker.relays, payload.result);
            finish(() => resolve(refresh));
          } catch (error) {
            finish(() => reject(error instanceof Error ? error : new Error(BUNKER_SENT_NO_RELAYS)));
          }
        },
        oneose() {
          if (sent || settled) {
            return;
          }
          sent = true;
          const event = finalizeEvent(
            {
              kind: SWITCH_RELAYS_KIND,
              created_at: Math.floor(Date.now() / 1000),
              tags: [['p', bunker.pubkey]],
              content: encrypt(
                JSON.stringify({ id, method: 'switch_relays', params: [] }),
                conversationKey,
              ),
            },
            clientSecretKey,
          );
          void Promise.any(pool.publish(bunker.relays, event)).catch((error: unknown) => {
            finish(() =>
              reject(error instanceof Error ? error : new Error(BUNKER_DID_NOT_ANSWER)),
            );
          });
        },
      },
    );
  });
}

/** A null answer, or the same relay set, does not replace the saved list. */
function interpretSwitchRelays(current: string[], result: unknown): BunkerRelayRefresh {
  if (result === null || result === undefined) {
    return { changed: false };
  }
  const parsed = parseRelayResult(result);
  if (!parsed) {
    throw new Error(BUNKER_SENT_NO_RELAYS);
  }
  const next = uniqueRelays(parsed);
  if (next.length === 0) {
    throw new Error(BUNKER_SENT_NO_RELAYS);
  }
  if (sameRelaySet(current, next)) {
    return { changed: false };
  }
  return { changed: true, relays: next };
}

function parseRelayResult(result: unknown): string[] | undefined {
  if (Array.isArray(result)) {
    return result.filter((item) => typeof item === 'string');
  }
  if (typeof result !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(result) as unknown;
    if (parsed === null) {
      return [];
    }
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === 'string');
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function uniqueRelays(urls: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const url of urls) {
    const normalized = normalizeRelay(url);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function sameRelaySet(current: string[], next: string[]): boolean {
  const saved = new Set(uniqueRelays(current));
  return saved.size === next.length && next.every((url) => saved.has(url));
}

function normalizeRelay(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim());
    // Only wss://: a backup carries these relays, and a backup document rejects any other scheme.
    if (parsed.protocol !== 'wss:') {
      return undefined;
    }
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
  } catch {
    return undefined;
  }
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
  const relays = uniqueRelays(pointer.relays);
  if (relays.length === 0) {
    throw new Error(BUNKER_NEEDS_WSS);
  }
  return { ...pointer, relays };
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const text = typeof error === 'string' ? error.trim() : '';
  return new Error(text || 'The bunker refused the request.');
}

async function withSigner<T>(
  clientSecretKeyHex: string,
  bunker: SharedBunker,
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
  const desktop = options?.desktop !== undefined;
  const silent = desktop ? DESKTOP_DID_NOT_ANSWER : BUNKER_DID_NOT_ANSWER;
  const timeoutMs = options?.timeoutMs ?? (desktop ? DESKTOP_TIMEOUT_MS : BUNKER_TIMEOUT_MS);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const timeout = (ms: number) =>
    new Promise<never>((_resolve, reject) => {
      timers.push(setTimeout(() => reject(new Error(silent)), ms));
    });
  try {
    if (desktop && !options?.desktop?.noPing) {
      const last = desktopAnswers.get(pointer.pubkey);
      if (last === undefined || Date.now() - last > DESKTOP_RECENT_MS) {
        await Promise.race([
          signer.ping().catch((error: unknown) => {
            throw asError(error);
          }),
          auth,
          timeout(Math.min(DESKTOP_PING_MS, timeoutMs)),
        ]);
        desktopAnswers.set(pointer.pubkey, Date.now());
      }
    }
    // nostr-tools rejects with the bunker's error text, not an Error: make it one, so callers can
    // compare messages such as DESKTOP_DISCONNECTED.
    const result = await Promise.race([
      run(signer).catch((error: unknown) => {
        throw asError(error);
      }),
      auth,
      timeout(timeoutMs),
    ]);
    if (desktop) {
      desktopAnswers.set(pointer.pubkey, Date.now());
    }
    return result;
  } finally {
    for (const timer of timers) {
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
