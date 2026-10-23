import { getPublicKey } from 'nostr-tools';
import { colorForPubkey } from '../identity/appearance';
import { Nip07Method, Nip07MethodPolicy } from '../models/nostr';
import {
  emptySyncDocument,
  SyncBunker,
  SyncDocument,
  SyncIdentity,
  SyncPermission,
  SyncSite,
  assertSyncDocument,
} from './document';
import { SyncKeys } from './phrase';

export const DEFAULT_SYNC_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
] as const;

/** Sealed inside the v3 vault. The published blob does not contain this object. */
export interface NostrSyncState {
  signingKeyHex: string;
  encryptionKeyHex: string;
  relays: string[];
  /** Active rows and tombstones. Live vault fields overlay the active rows at publish time. */
  document: SyncDocument;
  /** This browser only. Absent means automatic sync is off. Not part of the published blob. */
  autoSync?: boolean;
}

export interface SyncLiveIdentity {
  pubkey: string;
  privkey?: string;
  nick: string;
  createdAt: string;
  color?: string;
  bunker?: SyncBunker;
}

export interface SyncLivePermission {
  identityPubkey: string;
  host: string;
  method: Nip07Method;
  methodPolicy: Nip07MethodPolicy;
  kind?: number;
}

export interface SyncLiveSite {
  host: string;
  identityPubkey: string;
}

export interface SyncLiveVault {
  identities: SyncLiveIdentity[];
  permissions: SyncLivePermission[];
  sites?: SyncLiveSite[];
}

export interface LocalBunker extends SyncBunker {
  /** Hex key used only to talk to the bunker. Stays on this browser. */
  clientSecretKey?: string;
}

export interface LocalIdentity {
  id: string;
  pubkey: string;
  privkey?: string;
  nick: string;
  createdAt: string;
  color?: string;
  bunker?: LocalBunker;
}

export interface LocalPermission {
  id: string;
  identityId: string;
  host: string;
  method: Nip07Method;
  methodPolicy: Nip07MethodPolicy;
  kind?: number;
}

export interface LocalSite {
  id: string;
  identityId: string;
  host: string;
}

export interface LocalVault {
  identities: LocalIdentity[];
  permissions: LocalPermission[];
  selectedIdentityId: string | null;
  sites?: LocalSite[];
}

const HEX_KEY = /^[0-9a-f]{64}$/;
const RELAY_URL = /^wss:\/\/\S+$/i;

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const normalized = hex.toLowerCase();
  if (!HEX_KEY.test(normalized)) {
    throw new Error('Invalid sync state.');
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function createNostrSyncState(keys: SyncKeys, relays: readonly string[]): NostrSyncState {
  return {
    signingKeyHex: bytesToHex(keys.signingKey),
    encryptionKeyHex: bytesToHex(keys.encryptionKey),
    relays: [...relays],
    document: emptySyncDocument(),
  };
}

export function parseNostrSyncState(json: string): NostrSyncState {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Invalid sync state.');
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error('Invalid sync state.');
  }
  const record = value as Record<string, unknown>;
  if (typeof record['signingKeyHex'] !== 'string' || typeof record['encryptionKeyHex'] !== 'string') {
    throw new Error('Invalid sync state.');
  }
  hexToBytes(record['signingKeyHex']);
  hexToBytes(record['encryptionKeyHex']);
  if (!Array.isArray(record['relays']) || record['relays'].some((relay) => typeof relay !== 'string')) {
    throw new Error('Invalid sync state.');
  }
  const autoSync = record['autoSync'] === true;
  return {
    signingKeyHex: record['signingKeyHex'].toLowerCase(),
    encryptionKeyHex: record['encryptionKeyHex'].toLowerCase(),
    relays: [...record['relays']],
    document: readStoredDocument(record['document']),
    ...(autoSync ? { autoSync: true } : {}),
  };
}

/**
 * A document from the previous format is dropped. The live vault is projected
 * again on the next sync. Anything that existed only in that old document is left behind.
 */
function readStoredDocument(value: unknown): SyncDocument {
  if (isOldDocument(value)) {
    return emptySyncDocument();
  }
  try {
    assertSyncDocument(value);
  } catch {
    throw new Error('Invalid sync state.');
  }
  return value;
}

function isOldDocument(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { v?: unknown }).v !== 2;
}

export function syncKeysFromState(state: NostrSyncState): SyncKeys {
  const signingKey = hexToBytes(state.signingKeyHex);
  const encryptionKey = hexToBytes(state.encryptionKeyHex);
  try {
    return { signingKey, encryptionKey, pubkey: getPublicKey(signingKey) };
  } catch {
    throw new Error('Invalid sync state.');
  }
}

export function parseSyncRelays(text: string): string[] {
  return normalizeSyncRelays(text.split(/\n/));
}

export function normalizeSyncRelays(relays: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const relay of relays) {
    const url = relay.trim();
    if (url.length === 0) {
      continue;
    }
    if (!RELAY_URL.test(url)) {
      throw new Error('Sync relays must be wss:// URLs.');
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    normalized.push(url);
  }
  return normalized;
}

/** Stable JSON so two equal vaults compare equal regardless of row order or key order. */
export function canonicalSyncDocument(document: SyncDocument): string {
  const identities = [...document.identities]
    .sort((a, b) => a.pubkey.localeCompare(b.pubkey))
    .map((identity) => ({
      pubkey: identity.pubkey,
      ...(identity.privkey !== undefined ? { privkey: identity.privkey } : {}),
      nick: identity.nick,
      ...(identity.color !== undefined ? { color: identity.color } : {}),
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
      ...(identity.deletedAt !== undefined ? { deletedAt: identity.deletedAt } : {}),
      ...(identity.bunker !== undefined ? { bunker: publishedBunker(identity.bunker) } : {}),
    }));
  const permissions = [...document.permissions]
    .sort((a, b) => permissionKey(a).localeCompare(permissionKey(b)))
    .map((permission) => ({
      identityPubkey: permission.identityPubkey,
      host: permission.host,
      method: permission.method,
      methodPolicy: permission.methodPolicy,
      ...(permission.kind !== undefined ? { kind: permission.kind } : {}),
      updatedAt: permission.updatedAt,
      ...(permission.deletedAt !== undefined ? { deletedAt: permission.deletedAt } : {}),
    }));
  const relays = [...document.relays]
    .sort((a, b) => relayKey(a).localeCompare(relayKey(b)))
    .map((relay) => ({
      identityPubkey: relay.identityPubkey,
      url: relay.url,
      read: relay.read,
      write: relay.write,
      updatedAt: relay.updatedAt,
      ...(relay.deletedAt !== undefined ? { deletedAt: relay.deletedAt } : {}),
    }));
  const sites = [...(document.sites ?? [])]
    .sort((a, b) => a.host.localeCompare(b.host))
    .map((site) => ({
      host: site.host,
      identityPubkey: site.identityPubkey,
      updatedAt: site.updatedAt,
      ...(site.deletedAt !== undefined ? { deletedAt: site.deletedAt } : {}),
    }));
  return JSON.stringify({ v: 2, identities, permissions, relays, sites });
}

/**
 * Builds the document to publish from the live vault plus stored stamps.
 * A missing identity stamp is Date.parse(createdAt), once. Later calls keep that stamp.
 */
export function projectSyncDocument(
  state: NostrSyncState,
  live: SyncLiveVault,
  now: number,
): { state: NostrSyncState; document: SyncDocument; changed: boolean } {
  const identities = projectIdentities(state.document.identities, live.identities, now);
  const permissions = projectPermissions(state.document.permissions, live.permissions, now);
  const sites = projectSites(state.document.sites ?? [], live.sites ?? [], now);
  const document: SyncDocument = { v: 2, identities, permissions, relays: [], sites };
  const changed = canonicalSyncDocument(document) !== canonicalSyncDocument(state.document);
  return {
    state: changed ? { ...state, document } : state,
    document,
    changed,
  };
}

export function stampIdentity(
  state: NostrSyncState,
  identity: SyncLiveIdentity,
  now: number,
): NostrSyncState {
  const previous = state.document.identities.find((item) => item.pubkey === identity.pubkey);
  const identities = state.document.identities.filter((item) => item.pubkey !== identity.pubkey);
  identities.push(identityRecord(identity, now, previous));
  return { ...state, document: { ...state.document, identities } };
}

export function stampPermissionLive(
  state: NostrSyncState,
  permission: SyncLivePermission,
  now: number,
): NostrSyncState {
  const permissions = state.document.permissions.filter((item) => !samePermission(item, permission));
  permissions.push(permissionRecord(permission, now));
  return { ...state, document: { ...state.document, permissions } };
}

export function stampPermissionDeleted(
  state: NostrSyncState,
  permission: SyncLivePermission,
  now: number,
): NostrSyncState {
  const previous = state.document.permissions.find((item) => samePermission(item, permission));
  const permissions = state.document.permissions.filter((item) => !samePermission(item, permission));
  permissions.push({
    ...(previous ?? permissionRecord(permission, now)),
    ...permissionFields(permission),
    updatedAt: previous?.updatedAt ?? now,
    deletedAt: now,
  });
  return { ...state, document: { ...state.document, permissions } };
}

export function stampSite(
  state: NostrSyncState,
  site: SyncLiveSite,
  now: number,
): NostrSyncState {
  const sites = (state.document.sites ?? []).filter((item) => item.host !== site.host);
  sites.push({ host: site.host, identityPubkey: site.identityPubkey, updatedAt: now });
  return { ...state, document: { ...state.document, sites } };
}

export function stampSiteDeleted(
  state: NostrSyncState,
  site: SyncLiveSite,
  now: number,
): NostrSyncState {
  const previous = (state.document.sites ?? []).find((item) => item.host === site.host);
  const sites = (state.document.sites ?? []).filter((item) => item.host !== site.host);
  sites.push({
    host: site.host,
    identityPubkey: site.identityPubkey,
    updatedAt: previous?.updatedAt ?? now,
    deletedAt: now,
  });
  return { ...state, document: { ...state.document, sites } };
}

export function tombstoneIdentity(
  state: NostrSyncState,
  identity: SyncLiveIdentity,
  permissions: readonly SyncLivePermission[],
  now: number,
): NostrSyncState {
  const previous = state.document.identities.find((item) => item.pubkey === identity.pubkey);
  const identities = state.document.identities.filter((item) => item.pubkey !== identity.pubkey);
  identities.push({
    ...identityRecord(identity, previous?.updatedAt ?? now, previous),
    deletedAt: now,
  });
  let next: NostrSyncState = { ...state, document: { ...state.document, identities, relays: [] } };
  for (const permission of permissions) {
    next = stampPermissionDeleted(next, permission, now);
  }
  const siteHosts = (next.document.sites ?? [])
    .filter((site) => site.identityPubkey === identity.pubkey && site.deletedAt === undefined)
    .map((site) => site.host);
  for (const host of siteHosts) {
    next = stampSiteDeleted(next, { host, identityPubkey: identity.pubkey }, now);
  }
  return next;
}

/**
 * Rebuilds the local vault from a merged document.
 * Keeps the local UUID when the public key is already on this device.
 * Keeps this browser's bunker conversation key when the bunker pointer is unchanged.
 * The selected identity stays local. A deleted selection moves to another identity.
 * No selection and exactly one identity selects that identity.
 */
export function applySyncDocument(
  local: LocalVault,
  merged: SyncDocument,
  newId: () => string,
): LocalVault {
  const activeIdentities = merged.identities.filter((identity) => identity.deletedAt === undefined);
  const seen = new Set<string>();
  const identities: LocalIdentity[] = [];
  for (const existing of local.identities) {
    const winner = activeIdentities.find((identity) => identity.pubkey === existing.pubkey);
    if (!winner) {
      continue;
    }
    seen.add(existing.pubkey);
    identities.push(localIdentityFrom(existing.id, winner, existing));
  }
  for (const winner of activeIdentities) {
    if (seen.has(winner.pubkey)) {
      continue;
    }
    identities.push(localIdentityFrom(newId(), winner, undefined));
  }

  const idByPubkey = new Map(identities.map((identity) => [identity.pubkey, identity.id]));
  const pubkeyByOldId = new Map(local.identities.map((identity) => [identity.id, identity.pubkey]));

  const permissions = applyPermissions(local.permissions, merged.permissions, pubkeyByOldId, idByPubkey, newId);
  const sites = applySites(local.sites ?? [], merged.sites ?? [], idByPubkey, newId);

  let selectedIdentityId = local.selectedIdentityId;
  if (selectedIdentityId !== null && !identities.some((identity) => identity.id === selectedIdentityId)) {
    selectedIdentityId = identities[0]?.id ?? null;
  }
  if (selectedIdentityId === null && identities.length === 1) {
    selectedIdentityId = identities[0].id;
  }

  return { identities, permissions, selectedIdentityId, sites };
}

function projectIdentities(
  stamps: readonly SyncIdentity[],
  live: readonly SyncLiveIdentity[],
  now: number,
): SyncIdentity[] {
  const byPubkey = new Map(stamps.map((identity) => [identity.pubkey, identity]));
  const liveKeys = new Set(live.map((identity) => identity.pubkey));
  const projected: SyncIdentity[] = [];
  for (const identity of live) {
    const stamp = byPubkey.get(identity.pubkey);
    const created = Date.parse(identity.createdAt);
    const fallback = Number.isFinite(created) ? created : now;
    const resurrected = stamp?.deletedAt !== undefined;
    projected.push(identityRecord(identity, resurrected ? now : (stamp?.updatedAt ?? fallback), stamp));
  }
  for (const stamp of stamps) {
    if (!liveKeys.has(stamp.pubkey) && stamp.deletedAt !== undefined) {
      projected.push(stamp);
    }
  }
  return projected;
}

function projectPermissions(
  stamps: readonly SyncPermission[],
  live: readonly SyncLivePermission[],
  now: number,
): SyncPermission[] {
  const projected: SyncPermission[] = [];
  for (const permission of live) {
    const stamp = stamps.find((item) => samePermission(item, permission));
    const resurrected = stamp?.deletedAt !== undefined;
    projected.push({
      ...permissionFields(permission),
      updatedAt: resurrected ? now : (stamp?.updatedAt ?? now),
    });
  }
  for (const stamp of stamps) {
    if (stamp.deletedAt !== undefined && !live.some((item) => samePermission(stamp, item))) {
      projected.push(stamp);
    }
  }
  return projected;
}

function projectSites(
  stamps: readonly SyncSite[],
  live: readonly SyncLiveSite[],
  now: number,
): SyncSite[] {
  const projected: SyncSite[] = [];
  for (const site of live) {
    const stamp = stamps.find((item) => item.host === site.host);
    const resurrected = stamp?.deletedAt !== undefined;
    projected.push({
      host: site.host,
      identityPubkey: site.identityPubkey,
      updatedAt: resurrected ? now : (stamp?.updatedAt ?? now),
    });
  }
  for (const stamp of stamps) {
    if (stamp.deletedAt !== undefined && !live.some((item) => item.host === stamp.host)) {
      projected.push(stamp);
    }
  }
  return projected;
}

function applySites(
  local: readonly LocalSite[],
  merged: readonly SyncSite[],
  idByPubkey: ReadonlyMap<string, string>,
  newId: () => string,
): LocalSite[] {
  const localByHost = new Map(local.map((site) => [site.host, site]));
  const applied: LocalSite[] = [];
  for (const site of merged) {
    if (site.deletedAt !== undefined) {
      continue;
    }
    const identityId = idByPubkey.get(site.identityPubkey);
    if (!identityId) {
      continue;
    }
    const existing = localByHost.get(site.host);
    applied.push({
      id: existing?.id ?? newId(),
      identityId,
      host: site.host,
    });
  }
  return applied;
}

function applyPermissions(
  local: readonly LocalPermission[],
  merged: readonly SyncPermission[],
  pubkeyByOldId: ReadonlyMap<string, string>,
  idByPubkey: ReadonlyMap<string, string>,
  newId: () => string,
): LocalPermission[] {
  const active = merged.filter((permission) => permission.deletedAt === undefined);
  const localByKey = new Map<string, LocalPermission>();
  for (const permission of local) {
    const pubkey = pubkeyByOldId.get(permission.identityId);
    if (!pubkey) {
      continue;
    }
    localByKey.set(permissionKey({ ...permission, identityPubkey: pubkey }), permission);
  }
  const applied: LocalPermission[] = [];
  for (const permission of active) {
    const identityId = idByPubkey.get(permission.identityPubkey);
    if (!identityId) {
      continue;
    }
    const existing = localByKey.get(permissionKey(permission));
    const next: LocalPermission = {
      id: existing?.id ?? newId(),
      identityId,
      host: permission.host,
      method: permission.method,
      methodPolicy: permission.methodPolicy,
    };
    if (permission.kind !== undefined) {
      next.kind = permission.kind;
    }
    applied.push(next);
  }
  return applied;
}

function identityRecord(
  identity: SyncLiveIdentity,
  updatedAt: number,
  previous: SyncIdentity | undefined,
): SyncIdentity {
  const record: SyncIdentity = {
    pubkey: identity.pubkey,
    nick: identity.nick,
    createdAt: identity.createdAt,
    updatedAt,
    color: colorForPubkey(identity.pubkey, identity.color ?? previous?.color),
  };
  if (identity.privkey !== undefined) {
    record.privkey = identity.privkey;
  }
  const bunker = identity.bunker ?? (identity.privkey === undefined ? previous?.bunker : undefined);
  if (bunker) {
    record.bunker = publishedBunker(bunker);
  }
  return record;
}

function localIdentityFrom(
  id: string,
  winner: SyncIdentity,
  previous: LocalIdentity | undefined,
): LocalIdentity {
  const identity: LocalIdentity = {
    id,
    pubkey: winner.pubkey,
    nick: winner.nick,
    createdAt: winner.createdAt,
    color: colorForPubkey(winner.pubkey, winner.color),
  };
  if (winner.privkey !== undefined) {
    identity.privkey = winner.privkey;
  }
  if (winner.bunker) {
    identity.bunker = {
      ...publishedBunker(winner.bunker),
      ...(previous?.bunker?.clientSecretKey && sameBunker(previous.bunker, winner.bunker)
        ? { clientSecretKey: previous.bunker.clientSecretKey }
        : {}),
    };
  }
  return identity;
}

function publishedBunker(bunker: SyncBunker): SyncBunker {
  const published: SyncBunker = {
    pubkey: bunker.pubkey,
    relays: [...bunker.relays],
    secret: bunker.secret,
  };
  if (typeof bunker.askSite === 'boolean') {
    published.askSite = bunker.askSite;
  }
  return published;
}

function sameBunker(local: SyncBunker, remote: SyncBunker): boolean {
  return (
    local.pubkey === remote.pubkey &&
    local.secret === remote.secret &&
    local.relays.join('\n') === remote.relays.join('\n')
  );
}

function permissionFields(permission: SyncLivePermission): Omit<SyncPermission, 'updatedAt' | 'deletedAt'> {
  const record: Omit<SyncPermission, 'updatedAt' | 'deletedAt'> = {
    identityPubkey: permission.identityPubkey,
    host: permission.host,
    method: permission.method,
    methodPolicy: permission.methodPolicy,
  };
  if (permission.kind !== undefined) {
    record.kind = permission.kind;
  }
  return record;
}

function permissionRecord(permission: SyncLivePermission, updatedAt: number): SyncPermission {
  return { ...permissionFields(permission), updatedAt };
}

function samePermission(
  stamp: SyncPermission,
  permission: SyncLivePermission,
): boolean {
  return permissionKey(stamp) === permissionKey(permission);
}

function permissionKey(permission: {
  identityPubkey: string;
  host: string;
  method: string;
  kind?: number;
}): string {
  return [permission.identityPubkey, permission.host, permission.method, permission.kind ?? ''].join('\n');
}

function relayKey(relay: { identityPubkey: string; url: string }): string {
  return `${relay.identityPubkey}\n${relay.url}`;
}


