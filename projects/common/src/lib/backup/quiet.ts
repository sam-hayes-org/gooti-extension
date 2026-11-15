import { describeChanges, ChangeReport } from './changes';
import { SharedDocument } from './document';
import { fetchRemoteBackup, publishSharedDocument, BackupRelayIO } from './manual';
import { mergeSharedDocuments } from './merge';
import { BackupKeys } from './phrase';
import { canonicalSharedDocument } from './state';

/**
 * One quiet backup at a time. A request during a run schedules one more run.
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
 * The next full backup merges it and then sends this browser's change.
 */
export function localPublishPlan(
  local: SharedDocument,
  remote: SharedDocument | null,
): { publish: boolean } {
  const merged = remote ? mergeSharedDocuments(local, remote) : local;
  if (canonicalSharedDocument(merged) !== canonicalSharedDocument(local)) {
    return { publish: false };
  }
  if (remote !== null && canonicalSharedDocument(remote) === canonicalSharedDocument(local)) {
    return { publish: false };
  }
  return { publish: true };
}

const emptyReport = (): ChangeReport => ({ took: [], sent: [] });

/**
 * Reads the remote blob, then publishes when `localPublishPlan` says this browser is ahead.
 * The report names what was sent. This path does not apply a remote row, so `took` stays empty.
 */
export async function publishIfLocalWins(
  local: SharedDocument,
  keys: BackupKeys,
  relays: readonly string[],
  io: BackupRelayIO,
): Promise<{ published: boolean; report: ChangeReport }> {
  const { document: remote, createdAt } = await fetchRemoteBackup(keys, relays, io);
  if (!localPublishPlan(local, remote).publish) {
    return { published: false, report: emptyReport() };
  }
  await publishSharedDocument(local, keys, relays, io, createdAt);
  return { published: true, report: describeChanges(local, remote, local, true) };
}
