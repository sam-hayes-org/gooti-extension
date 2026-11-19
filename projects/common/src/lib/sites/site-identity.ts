import { ActivityRow, localActivityStore, parseActivity } from '../activity/log';
import { BrowserSessionData, Identity_DECRYPTED } from '../services/storage/types';

const DAY = 24 * 60 * 60 * 1000;

/** Regular identities first, then site-only identities, both in session order. */
export function splitIdentities(session: BrowserSessionData | undefined): {
  regular: Identity_DECRYPTED[];
  site: Identity_DECRYPTED[];
} {
  const regular: Identity_DECRYPTED[] = [];
  const site: Identity_DECRYPTED[] = [];
  for (const id of session?.identities ?? []) {
    const identity = session?.[`identity_${id}`];
    if (!identity) {
      continue;
    }
    (identity.site === undefined ? regular : site).push(identity);
  }
  return { regular, site };
}

/** The newest request time per host in this browser's Activity. */
export function lastUseByHost(activity: unknown): Map<string, number> {
  const rows: ActivityRow[] = parseActivity(activity);
  const last = new Map<string, number>();
  for (const row of rows) {
    if (!('host' in row)) {
      continue;
    }
    const known = last.get(row.host);
    if (known === undefined || row.at > known) {
      last.set(row.host, row.at);
    }
  }
  return last;
}

/** `lastUseByHost` for this browser's stored Activity. Empty when it cannot be read. */
export async function readLastUseByHost(): Promise<Map<string, number>> {
  try {
    return lastUseByHost(await localActivityStore()?.get());
  } catch {
    return new Map();
  }
}

/** "Used today", "Used yesterday", "Used 5 days ago". Nothing when Activity has no request. */
export function lastUsedNote(at: number | undefined, now = Date.now()): string | undefined {
  return at === undefined ? undefined : `Used ${daysAgo(at, now)}`;
}

/** "today", "yesterday", "5 days ago", by calendar day. */
export function daysAgo(at: number, now = Date.now()): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.ceil((today.getTime() - at) / DAY));
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  return `${days} days ago`;
}
