import { getPublicKey } from 'nostr-tools';
import { readIdentityColor } from '../identity/appearance';
import { NIP07_METHODS, Nip07Method, Nip07MethodPolicy } from '../models/nostr';

/** Plaintext carried inside one backup blob. The vault password is not in here. */
export interface SharedDocument {
  v: 2;
  identities: SharedIdentity[];
  permissions: SharedPermission[];
  relays: SharedRelay[];
  /**
   * Which identity a site connected as. Absent on a document written before
   * this list existed. One live row per host.
   */
  sites?: SharedSite[];
}

/**
 * An identity is recognized by its public key.
 * A local identity includes its private key. A bunker identity includes the
 * bunker pointer and, once this bunker is linked, the conversation key.
 */
export interface SharedIdentity {
  pubkey: string;
  privkey?: string;
  nick: string;
  /** Optional `#rrggbb`. Missing colors are derived from the pubkey. */
  color?: string;
  createdAt: string;
  updatedAt: number;
  deletedAt?: number;
  bunker?: SharedBunker;
  /**
   * When the private key last moved to a Gooti Desktop or back to the browsers. Absent until it
   * first moves. When one row holds the key and the other is a bunker pointer, the later
   * custodyAt wins, so an older copy of the key cannot undo a move.
   */
  custodyAt?: number;
}

/** Relays and secret from a bunker:// link. Not the relays where notes are published. */
export interface SharedBunker {
  pubkey: string;
  relays: string[];
  secret: string | null;
  /**
   * No longer used since 2.1: requests always go straight to the bunker, and the browser asks
   * only before a deletion or an erase. Kept and passed on unchanged, so older versions that
   * still read it do not see a change.
   */
  askSite?: boolean;
  /**
   * Hex key for the approved bunker session.
   * A browser that already has its own key keeps that key.
   */
  clientSecretKey?: string;
}

/** The old choice as older versions read it: missing asks which site, false goes straight. */
export function bunkerAsksSite(bunker: { askSite?: boolean } | undefined): boolean {
  return bunker?.askSite !== false;
}

export interface SharedPermission {
  identityPubkey: string;
  host: string;
  method: Nip07Method;
  methodPolicy: Nip07MethodPolicy;
  kind?: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface SharedRelay {
  identityPubkey: string;
  url: string;
  read: boolean;
  write: boolean;
  updatedAt: number;
  deletedAt?: number;
}

/** The identity a host connected as. The key is the host. */
export interface SharedSite {
  host: string;
  identityPubkey: string;
  updatedAt: number;
  deletedAt?: number;
}

const PRIVKEY = /^[0-9a-f]{64}$/;
const RELAY_URL = /^wss:\/\/\S+$/i;

export function emptySharedDocument(): SharedDocument {
  return { v: 2, identities: [], permissions: [], relays: [], sites: [] };
}

export function assertSharedDocument(value: unknown): asserts value is SharedDocument {
  if (!isRecord(value) || value['v'] !== 2) {
    throw new Error('Invalid sync document.');
  }
  const identities = value['identities'];
  const permissions = value['permissions'];
  if (!Array.isArray(identities) || !Array.isArray(permissions)) {
    throw new Error('Invalid sync document.');
  }
  if (value['relays'] !== undefined && !Array.isArray(value['relays'])) {
    throw new Error('Invalid sync document.');
  }
  // Identity publish relays and getRelays permissions are no longer stored.
  value['relays'] = [];
  if (value['sites'] !== undefined && !Array.isArray(value['sites'])) {
    throw new Error('Invalid sync document.');
  }
  const sites = Array.isArray(value['sites']) ? value['sites'] : [];
  value['sites'] = sites;
  const keptPermissions = permissions.filter((item) => {
    return !isRecord(item) || item['method'] !== 'getRelays';
  });
  value['permissions'] = keptPermissions;
  for (const identity of identities) {
    assertIdentity(identity);
  }
  for (const permission of keptPermissions) {
    assertPermission(permission);
  }
  for (const site of sites) {
    assertSite(site);
  }
}

function assertIdentity(value: unknown): asserts value is SharedIdentity {
  if (!isRecord(value) || !isKey(value['pubkey']) || typeof value['nick'] !== 'string') {
    throw new Error('Invalid sync document.');
  }
  if (typeof value['createdAt'] !== 'string' || !isTime(value['updatedAt'])) {
    throw new Error('Invalid sync document.');
  }
  if (value['color'] !== undefined && readIdentityColor(value['color']) === undefined) {
    throw new Error('Invalid sync document.');
  }
  assertOptionalDelete(value['deletedAt']);
  if (value['custodyAt'] !== undefined && !isTime(value['custodyAt'])) {
    throw new Error('Invalid sync document.');
  }
  const hasPrivkey = value['privkey'] !== undefined;
  const hasBunker = value['bunker'] !== undefined;
  if (hasPrivkey === hasBunker) {
    throw new Error('Invalid sync document.');
  }
  if (hasPrivkey) {
    if (!isKey(value['privkey']) || pubkeyFromPrivkey(value['privkey']) !== value['pubkey']) {
      throw new Error('Invalid sync document.');
    }
  }
  if (hasBunker) {
    assertBunker(value['bunker']);
  }
}

function assertBunker(value: unknown): asserts value is SharedBunker {
  if (!isRecord(value) || !isKey(value['pubkey']) || !Array.isArray(value['relays'])) {
    throw new Error('Invalid sync document.');
  }
  if (value['relays'].length === 0 || value['relays'].some((relay) => typeof relay !== 'string' || !RELAY_URL.test(relay))) {
    throw new Error('Invalid sync document.');
  }
  if (value['secret'] !== null && typeof value['secret'] !== 'string') {
    throw new Error('Invalid sync document.');
  }
  if (value['askSite'] !== undefined && typeof value['askSite'] !== 'boolean') {
    throw new Error('Invalid sync document.');
  }
  if (value['clientSecretKey'] !== undefined && !isKey(value['clientSecretKey'])) {
    throw new Error('Invalid sync document.');
  }
}

function assertPermission(value: unknown): asserts value is SharedPermission {
  if (!isRecord(value) || !isKey(value['identityPubkey']) || typeof value['host'] !== 'string') {
    throw new Error('Invalid sync document.');
  }
  if (!isMethod(value['method']) || (value['methodPolicy'] !== 'allow' && value['methodPolicy'] !== 'deny')) {
    throw new Error('Invalid sync document.');
  }
  if (value['kind'] !== undefined && typeof value['kind'] !== 'number') {
    throw new Error('Invalid sync document.');
  }
  if (!isTime(value['updatedAt'])) {
    throw new Error('Invalid sync document.');
  }
  assertOptionalDelete(value['deletedAt']);
}

function assertSite(value: unknown): asserts value is SharedSite {
  if (!isRecord(value) || !isHost(value['host']) || !isKey(value['identityPubkey'])) {
    throw new Error('Invalid sync document.');
  }
  if (!isTime(value['updatedAt'])) {
    throw new Error('Invalid sync document.');
  }
  assertOptionalDelete(value['deletedAt']);
}

function assertOptionalDelete(value: unknown): void {
  if (value !== undefined && !isTime(value)) {
    throw new Error('Invalid sync document.');
  }
}

function pubkeyFromPrivkey(privkey: string): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(privkey.slice(i * 2, i * 2 + 2), 16);
  }
  try {
    return getPublicKey(bytes);
  } catch {
    throw new Error('Invalid sync document.');
  }
}

function isMethod(value: unknown): value is Nip07Method {
  return typeof value === 'string' && (NIP07_METHODS as readonly string[]).includes(value);
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && PRIVKEY.test(value);
}

/** `location.host`: a hostname, or a hostname and port. */
function isHost(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/\s/.test(value) && !value.includes('/');
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
