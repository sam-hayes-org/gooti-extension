import { Event, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { SHARED_D_TAG, BACKUP_KIND } from './event';
import { BackupRelayIO } from './manual';
import { DeviceRelayIO } from './device';

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
export type FullRelayIO = Required<BackupRelayIO> & DeviceRelayIO;

export function backupRelayIO(pool: BackupPool): FullRelayIO {
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
      return (await newestAnd(pool, relays, pubkey, null)).newest;
    },

    async fetchNewestAlso(relays, pubkey, alsoD) {
      return newestAnd(pool, relays, pubkey, alsoD);
    },

    async fetchDeviceEvents(relays, pubkey) {
      const urls = [...relays];
      // Relays cannot filter a d tag by prefix: this also returns the shared record, which the
      // caller skips.
      const filter: Filter = { kinds: [BACKUP_KIND], authors: [pubkey] };
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
        return reached.flat();
      } finally {
        pool.close(urls);
      }
    },
  };
}

/** The newest shared record, and every event with the d tag `alsoD`, in one request per relay. */
async function newestAnd(
  pool: BackupPool,
  relays: readonly string[],
  pubkey: string,
  alsoD: string | null,
): Promise<{ newest: Event | null; also: Event[] }> {
  const urls = [...relays];
  const filter: Filter = {
    kinds: [BACKUP_KIND],
    authors: [pubkey],
    '#d': alsoD === null ? [SHARED_D_TAG] : [SHARED_D_TAG, alsoD],
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
      throw new BackupRelayFailureError('No relay could be reached.', failuresFrom(urls, settled));
    }
    const all = reached.flat();
    const also = alsoD === null ? [] : all.filter((event) => dTag(event) === alsoD);
    const events = alsoD === null ? all : all.filter((event) => dTag(event) !== alsoD);
    if (events.length === 0) {
      // A relay that did not answer may hold the backup. Only when every relay answered is there
      // none, and only then may the caller publish this browser's vault as the first.
      if (reached.length < urls.length) {
        throw new BackupRelayFailureError(
          'A relay could not be reached, and the others have no backup.',
          failuresFrom(urls, settled),
        );
      }
      return { newest: null, also };
    }
    const newest = events.reduce((newest, event) =>
      event.created_at > newest.created_at ? event : newest,
    );
    return { newest, also };
  } finally {
    pool.close(urls);
  }
}

function dTag(event: Event): string | undefined {
  return event.tags?.find((tag) => tag[0] === 'd')?.[1];
}

export function defaultBackupRelayIO(): FullRelayIO {
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
