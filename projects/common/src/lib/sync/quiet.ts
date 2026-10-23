import { SyncDocument } from './document';
import { fetchRemoteDocument, publishSyncDocument, SyncRelayIO } from './manual';
import { mergeSyncDocuments } from './merge';
import { SyncKeys } from './phrase';
import { canonicalSyncDocument } from './state';

/**
 * One quiet sync at a time. A request during a run schedules one more run.
 * A thrown run is swallowed so a relay failure never fails the action that asked.
 */
export function createQuietQueue(run: () => Promise<void>): () => void {
  let again = false;
  let running = false;
  let tail: Promise<void> = Promise.resolve();

  const kick = (): void => {
    again = true;
    if (running) {
      return;
    }
    running = true;
    const job = tail.then(async () => {
      try {
        while (again) {
          again = false;
          try {
            await run();
          } catch {
            // The next open or change tries again.
          }
        }
      } finally {
        running = false;
        if (again) {
          kick();
        }
      }
    });
    tail = job.then(
      () => undefined,
      () => undefined,
    );
  };

  return kick;
}

/**
 * Publish only when this browser already holds every row the merge would keep.
 * A remote row this process has not applied yet stays on the relay.
 * The next full sync merges it and then sends this browser's change.
 */
export function localPublishPlan(
  local: SyncDocument,
  remote: SyncDocument | null,
): { publish: boolean } {
  const merged = remote ? mergeSyncDocuments(local, remote) : local;
  if (canonicalSyncDocument(merged) !== canonicalSyncDocument(local)) {
    return { publish: false };
  }
  if (remote !== null && canonicalSyncDocument(remote) === canonicalSyncDocument(local)) {
    return { publish: false };
  }
  return { publish: true };
}

/** Reads the remote blob, then publishes when `localPublishPlan` says this browser is ahead. */
export async function publishIfLocalWins(
  local: SyncDocument,
  keys: SyncKeys,
  relays: readonly string[],
  io: SyncRelayIO,
): Promise<boolean> {
  const remote = await fetchRemoteDocument(keys, relays, io);
  if (!localPublishPlan(local, remote).publish) {
    return false;
  }
  await publishSyncDocument(local, keys, relays, io);
  return true;
}
