import { Event, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { SHARED_D_TAG, BACKUP_KIND } from './event';
import { BackupRelayIO } from './manual';

const MAX_WAIT_MS = 8_000;

export interface BackupRelayFailure {
  url: string;
  reason: string;
}

/** Every relay failed. `failures` keeps each relay's own reason. */
export class BackupRelayFailureError extends Error {
  readonly failures: readonly BackupRelayFailure[];

  constructor(message: string, failures: readonly BackupRelayFailure[]) {
    super(message);
    this.name = 'BackupRelayFailureError';
    this.failures = failures;
  }
}

export interface BackupRelayConnection {
  publish(event: Event): Promise<string>;
  subscribe(
    filters: Filter[],
    params: {
      onevent: (event: Event) => void;
      oneose: () => void;
      onclose: (reason: string) => void;
      eoseTimeout?: number;
    },
  ): { close: (reason?: string) => void };
}

export interface BackupPool {
  ensureRelay(url: string, params?: { connectionTimeout?: number }): Promise<BackupRelayConnection>;
  close(relays: string[]): void;
}

/**
 * One failed relay does not fail the call when another relay accepts the event
 * or returns a blob. Every relay failing is an error.
 */
export function backupRelayIO(pool: BackupPool): BackupRelayIO {
  return {
    async publish(relays, event) {
      const urls = [...relays];
      try {
        const settled = await Promise.allSettled(
          urls.map(async (url) => {
            const relay = await pool.ensureRelay(url, { connectionTimeout: MAX_WAIT_MS });
            await relay.publish(event);
            return url;
          }),
        );
        const accepted = settled.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        );
        if (accepted.length === 0) {
          throw new BackupRelayFailureError(
            'No relay accepted your backup.',
            failuresFrom(urls, settled),
          );
        }
        return accepted;
      } finally {
        pool.close(urls);
      }
    },

    async fetchNewest(relays, pubkey) {
      const urls = [...relays];
      const filter: Filter = {
        kinds: [BACKUP_KIND],
        authors: [pubkey],
        '#d': [SHARED_D_TAG],
      };
      try {
        const settled = await Promise.allSettled(
          urls.map(async (url) => {
            const relay = await pool.ensureRelay(url, { connectionTimeout: MAX_WAIT_MS });
            return collectUntilEose(relay, filter);
          }),
        );
        const reached = settled.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        );
        if (reached.length === 0) {
          throw new BackupRelayFailureError(
            'No relay could be reached.',
            failuresFrom(urls, settled),
          );
        }
        const events = reached.flat();
        if (events.length === 0) {
          return null;
        }
        return events.reduce((newest, event) =>
          event.created_at > newest.created_at ? event : newest,
        );
      } finally {
        pool.close(urls);
      }
    },
  };
}

export function defaultBackupRelayIO(): BackupRelayIO {
  const pool = new SimplePool();
  return backupRelayIO({
    ensureRelay: (url, params) => pool.ensureRelay(url, params) as Promise<BackupRelayConnection>,
    close: (relays) => pool.close(relays),
  });
}

function failuresFrom(
  urls: readonly string[],
  settled: readonly PromiseSettledResult<unknown>[],
): BackupRelayFailure[] {
  return urls.flatMap((url, index) => {
    const result = settled[index];
    if (!result || result.status === 'fulfilled') {
      return [];
    }
    return [{ url, reason: failureReason(result.reason) }];
  });
}

function failureReason(reason: unknown): string {
  const message =
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
  const trimmed = message.trim();
  return trimmed || 'No reason.';
}

function collectUntilEose(relay: BackupRelayConnection, filter: Filter): Promise<Event[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const events: Event[] = [];
    let subscription: { close: (reason?: string) => void } | undefined;
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      settle();
      queueMicrotask(() => subscription?.close());
    };
    subscription = relay.subscribe([filter], {
      eoseTimeout: MAX_WAIT_MS,
      onevent: (event) => events.push(event),
      oneose: () => finish(() => resolve(events)),
      onclose: (reason) => finish(() => reject(new Error(reason || 'The relay closed the connection.'))),
    });
  });
}
