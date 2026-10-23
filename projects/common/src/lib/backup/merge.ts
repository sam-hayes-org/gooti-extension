import { SharedDocument, SharedIdentity, SharedPermission, SharedSite } from './document';

interface Revisioned {
  updatedAt: number;
  deletedAt?: number;
}

/**
 * Combines two vault snapshots.
 * A higher revision wins. Revision is the later of updatedAt and deletedAt.
 * A record that exists on only one side is kept, including a tombstone.
 * Ties keep the local record.
 */
export function mergeSharedDocuments(
  local: SharedDocument,
  remote: SharedDocument,
): SharedDocument {
  return {
    v: 2,
    identities: mergeByKey(
      local.identities,
      remote.identities,
      (identity) => identity.pubkey,
      preferIdentity,
    ),
    permissions: mergeByKey(
      local.permissions,
      remote.permissions,
      permissionKey,
    ),
    relays: [],
    sites: mergeByKey(local.sites ?? [], remote.sites ?? [], siteKey),
  };
}

/** Records the local vault should keep. Tombstones stay in the merged document. */
export function activeSharedDocument(document: SharedDocument): SharedDocument {
  return {
    v: 2,
    identities: document.identities.filter((identity) => identity.deletedAt === undefined),
    permissions: document.permissions.filter(
      (permission) => permission.deletedAt === undefined,
    ),
    relays: [],
    sites: (document.sites ?? []).filter((site) => site.deletedAt === undefined),
  };
}

function mergeByKey<T extends Revisioned>(
  local: readonly T[],
  remote: readonly T[],
  keyOf: (record: T) => string,
  choose: (local: T, remote: T) => T = prefer,
): T[] {
  const merged = new Map<string, T>();
  for (const record of local) {
    merged.set(keyOf(record), record);
  }
  for (const record of remote) {
    const key = keyOf(record);
    const existing = merged.get(key);
    merged.set(key, existing === undefined ? record : choose(existing, record));
  }
  return [...merged.values()];
}

/**
 * A key against a bunker pointer: the later custodyAt wins (absent counts as 0), so a device
 * that still has the key cannot undo a move to Gooti Desktop by editing its copy.
 * Otherwise a higher revision wins. A tie keeps the local row, and fills a conversation key
 * the local row does not have.
 */
function preferIdentity(local: SharedIdentity, remote: SharedIdentity): SharedIdentity {
  if ((local.privkey !== undefined) !== (remote.privkey !== undefined)) {
    const localCustody = local.custodyAt ?? 0;
    const remoteCustody = remote.custodyAt ?? 0;
    if (localCustody !== remoteCustody) {
      return remoteCustody > localCustody ? remote : local;
    }
  }
  if (revision(remote) !== revision(local)) {
    return prefer(local, remote);
  }
  const bunker = local.bunker;
  const spare = remote.bunker?.clientSecretKey;
  if (!bunker || bunker.clientSecretKey || !spare || !remote.bunker) {
    return local;
  }
  if (bunker.pubkey !== remote.bunker.pubkey || bunker.secret !== remote.bunker.secret) {
    return local;
  }
  return { ...local, bunker: { ...bunker, clientSecretKey: spare } };
}

function prefer<T extends Revisioned>(local: T, remote: T): T {
  return revision(remote) > revision(local) ? remote : local;
}

function revision(record: Revisioned): number {
  return Math.max(record.updatedAt, record.deletedAt ?? 0);
}

function permissionKey(permission: SharedPermission): string {
  return [
    permission.identityPubkey,
    permission.host,
    permission.method,
    permission.kind ?? '',
  ].join('\n');
}

function siteKey(site: SharedSite): string {
  return site.host;
}
