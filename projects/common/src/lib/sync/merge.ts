import { SyncDocument, SyncPermission, SyncSite } from './document';

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
export function mergeSyncDocuments(
  local: SyncDocument,
  remote: SyncDocument,
): SyncDocument {
  return {
    v: 2,
    identities: mergeByKey(
      local.identities,
      remote.identities,
      (identity) => identity.pubkey,
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
export function activeSyncDocument(document: SyncDocument): SyncDocument {
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
): T[] {
  const merged = new Map<string, T>();
  for (const record of local) {
    merged.set(keyOf(record), record);
  }
  for (const record of remote) {
    const key = keyOf(record);
    const existing = merged.get(key);
    merged.set(key, existing === undefined ? record : prefer(existing, record));
  }
  return [...merged.values()];
}

function prefer<T extends Revisioned>(local: T, remote: T): T {
  return revision(remote) > revision(local) ? remote : local;
}

function revision(record: Revisioned): number {
  return Math.max(record.updatedAt, record.deletedAt ?? 0);
}

function permissionKey(permission: SyncPermission): string {
  return [
    permission.identityPubkey,
    permission.host,
    permission.method,
    permission.kind ?? '',
  ].join('\n');
}

function siteKey(site: SyncSite): string {
  return site.host;
}
