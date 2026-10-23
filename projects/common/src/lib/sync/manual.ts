import { Event } from 'nostr-tools';
import { openSyncDocument, sealSyncDocument } from './blob';
import { SyncDocument } from './document';
import { buildSyncEvent, readSyncPayload } from './event';
import { mergeSyncDocuments } from './merge';
import { SyncKeys } from './phrase';
import { canonicalSyncDocument } from './state';

export interface SyncRelayIO {
  /** Resolves with the relay URLs that accepted the event. */
  publish(relays: readonly string[], event: Event): Promise<readonly string[]>;
  /** Newest matching event, or null when a relay answered and had none. */
  fetchNewest(relays: readonly string[], pubkey: string): Promise<Event | null>;
}

export interface ManualSyncResult {
  document: SyncDocument;
  published: boolean;
}

/** Steps that wait on the relays or the merge. Saving the vault is reported by the caller. */
export type SyncProgressStep = 'read' | 'merge' | 'send';

/**
 * Reads the replaceable kind 30078 event before publishing.
 * Publishing first would overwrite the remote blob before this device could merge it.
 */
export async function manualSync(
  local: SyncDocument,
  keys: SyncKeys,
  relays: readonly string[],
  io: SyncRelayIO,
  onStep?: (step: SyncProgressStep) => void,
): Promise<ManualSyncResult> {
  onStep?.('read');
  const remote = await fetchRemoteDocument(keys, relays, io);
  onStep?.('merge');
  const merged = remote ? mergeSyncDocuments(local, remote) : local;
  const published =
    remote === null || canonicalSyncDocument(merged) !== canonicalSyncDocument(remote);
  if (published) {
    onStep?.('send');
    await publishSyncDocument(merged, keys, relays, io);
  }
  return { document: merged, published };
}

export async function fetchRemoteDocument(
  keys: SyncKeys,
  relays: readonly string[],
  io: SyncRelayIO,
): Promise<SyncDocument | null> {
  if (relays.length === 0) {
    throw new Error('Add a sync relay first.');
  }
  const event = await io.fetchNewest(relays, keys.pubkey);
  if (!event) {
    return null;
  }
  try {
    return await openSyncDocument(readSyncPayload(event), keys.encryptionKey);
  } catch {
    throw new Error('The relay returned a vault this phrase cannot open.');
  }
}

export async function publishSyncDocument(
  document: SyncDocument,
  keys: SyncKeys,
  relays: readonly string[],
  io: SyncRelayIO,
): Promise<void> {
  if (relays.length === 0) {
    throw new Error('Add a sync relay first.');
  }
  const payload = await sealSyncDocument(document, keys.encryptionKey);
  await io.publish(relays, buildSyncEvent(keys.signingKey, payload));
}
