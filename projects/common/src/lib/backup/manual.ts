import { Event } from 'nostr-tools';
import { openSharedDocument, sealSharedDocument } from './blob';
import { SharedDocument } from './document';
import { buildBackupEvent, readBackupPayload } from './event';
import { mergeSharedDocuments } from './merge';
import { BackupKeys } from './phrase';
import { describeChanges, ChangeReport } from './changes';
import { canonicalSharedDocument } from './state';

export interface BackupRelayIO {
  /** Resolves with the relay URLs that accepted the event. */
  publish(relays: readonly string[], event: Event): Promise<readonly string[]>;
  /** Newest matching event, or null when a relay answered and had none. */
  fetchNewest(relays: readonly string[], pubkey: string): Promise<Event | null>;
}

export interface ManualSyncResult {
  document: SharedDocument;
  published: boolean;
  /** The merge differs from the document this browser held. */
  changed: boolean;
  report: ChangeReport;
}

/** Steps that wait on the relays or the merge. Saving the vault is reported by the caller. */
export type BackupProgressStep = 'read' | 'merge' | 'send';

/**
 * Reads the replaceable kind 30078 event before publishing.
 * Publishing first would overwrite the remote blob before this device could merge it.
 */
export async function backUpShared(
  local: SharedDocument,
  keys: BackupKeys,
  relays: readonly string[],
  io: BackupRelayIO,
  onStep?: (step: BackupProgressStep) => void,
): Promise<ManualSyncResult> {
  onStep?.('read');
  const { document: remote, createdAt } = await fetchRemoteBackup(keys, relays, io);
  onStep?.('merge');
  const merged = remote ? mergeSharedDocuments(local, remote) : local;
  const mergedCanonical = canonicalSharedDocument(merged);
  const published = remote === null || mergedCanonical !== canonicalSharedDocument(remote);
  const changed = mergedCanonical !== canonicalSharedDocument(local);
  if (published) {
    onStep?.('send');
    await publishSharedDocument(merged, keys, relays, io, createdAt);
  }
  return {
    document: merged,
    published,
    changed,
    report: describeChanges(local, remote, merged, published),
  };
}

export async function fetchSharedDocument(
  keys: BackupKeys,
  relays: readonly string[],
  io: BackupRelayIO,
): Promise<SharedDocument | null> {
  return (await fetchRemoteBackup(keys, relays, io)).document;
}

/** The relay vault, and the time of its event. Publish after it with `publishSharedDocument`. */
export interface RemoteBackup {
  document: SharedDocument | null;
  /** `created_at` of the newest event, also when its document is an older format. */
  createdAt: number | null;
}

export async function fetchRemoteBackup(
  keys: BackupKeys,
  relays: readonly string[],
  io: BackupRelayIO,
): Promise<RemoteBackup> {
  if (relays.length === 0) {
    throw new Error('Add a relay first.');
  }
  const event = await io.fetchNewest(relays, keys.pubkey);
  if (!event) {
    return { document: null, createdAt: null };
  }
  try {
    return {
      document: await openSharedDocument(readBackupPayload(event), keys.encryptionKey),
      createdAt: event.created_at,
    };
  } catch {
    throw new Error('This passphrase cannot open the backup on the relay.');
  }
}

/**
 * The vault event is replaceable. Of two events in the same second, a relay keeps one, and
 * not always the newer write. Pass the merged event's `created_at` as `after`, so the new event
 * is always later than the one it replaces.
 */
export async function publishSharedDocument(
  document: SharedDocument,
  keys: BackupKeys,
  relays: readonly string[],
  io: BackupRelayIO,
  after: number | null = null,
): Promise<void> {
  if (relays.length === 0) {
    throw new Error('Add a relay first.');
  }
  const payload = await sealSharedDocument(document, keys.encryptionKey);
  await io.publish(relays, buildBackupEvent(keys.signingKey, payload, publishTime(after)));
}

/** Now in seconds, and at least one second after `after`. */
export function publishTime(after: number | null, now = Math.floor(Date.now() / 1000)): number {
  return after === null ? now : Math.max(now, after + 1);
}
