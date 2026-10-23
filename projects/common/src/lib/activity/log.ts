import { GOOTI_META_DATA_KEY } from '../services/storage/types';

export const ACTIVITY_KEY = GOOTI_META_DATA_KEY.activity;
export const ACTIVITY_LIMIT = 200;

export const ACTIVITY_OUTCOMES = [
  'allowed',
  'once',
  'denied',
  'dismissed',
  'failed',
] as const;

export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const SYNC_ACTIVITY_MODES = ['now', 'auto'] as const;
export const SYNC_ACTIVITY_RESULTS = ['synced', 'current', 'failed'] as const;

export type SyncActivityMode = (typeof SYNC_ACTIVITY_MODES)[number];
export type SyncActivityResult = (typeof SYNC_ACTIVITY_RESULTS)[number];

export interface ActivityEntry {
  at: number;
  host: string;
  identity?: string;
  method: string;
  kind?: number;
  outcome: ActivityOutcome;
}

/** A vault sync. No site, identity, or vault contents. */
export interface SyncActivityEntry {
  at: number;
  sync: SyncActivityMode;
  result: SyncActivityResult;
  /** Short failure summary. Absent unless the sync failed. */
  reason?: string;
}

export type ActivityRow = ActivityEntry | SyncActivityEntry;

export type ActivityDraft = Omit<ActivityEntry, 'at'>;
export type SyncActivityDraft = Omit<SyncActivityEntry, 'at'>;

export interface ActivityStore {
  get(): Promise<unknown>;
  set(entries: ActivityRow[]): Promise<void>;
}

let writeChain: Promise<void> = Promise.resolve();

export function activityOutcome(error: unknown): ActivityOutcome {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Vault unlock was dismissed.') {
    return 'dismissed';
  }
  if (message === 'Permission denied') {
    return 'denied';
  }
  return 'failed';
}

/** Newest first. Entries past the limit are dropped. */
export function appendActivity(
  entries: readonly ActivityRow[],
  entry: ActivityRow,
): ActivityRow[] {
  return [entry, ...entries].slice(0, ACTIVITY_LIMIT);
}

export function parseActivity(value: unknown): ActivityRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ActivityRow[] = [];
  for (const item of value) {
    const entry = parseEntry(item);
    if (entry) {
      entries.push(entry);
    }
    if (entries.length === ACTIVITY_LIMIT) {
      break;
    }
  }
  return entries;
}

export async function recordActivity(
  store: ActivityStore,
  draft: ActivityDraft,
  at = Date.now(),
): Promise<void> {
  await enqueueWrite(async () => {
    const entries = parseActivity(await store.get());
    await store.set(appendActivity(entries, { ...draft, at }));
  });
}

export async function recordSyncActivity(
  store: ActivityStore,
  draft: SyncActivityDraft,
  at = Date.now(),
): Promise<void> {
  const entry: SyncActivityEntry = {
    at,
    sync: draft.sync,
    result: draft.result,
  };
  if (draft.result === 'failed' && draft.reason) {
    const reason = draft.reason.trim();
    if (reason.length > 0) {
      entry.reason = reason;
    }
  }
  await enqueueWrite(async () => {
    const entries = parseActivity(await store.get());
    await store.set(appendActivity(entries, entry));
  });
}

/** One short line for the activity row. The per-relay list stays in the sync dialog. */
export function syncFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  const text = message || 'Sync failed.';
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}

/**
 * Writes a sync row with this browser's local activity storage.
 * A missing store or a failed write does not fail the sync.
 */
export async function noteSyncActivity(draft: SyncActivityDraft): Promise<void> {
  const store = localActivityStore();
  if (!store) {
    return;
  }
  try {
    await recordSyncActivity(store, draft);
  } catch {
    // The activity list is optional. The sync result still stands.
  }
}

export function localActivityStore(): ActivityStore | undefined {
  const local = (globalThis as { chrome?: { storage?: { local?: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  } } } }).chrome?.storage?.local;
  if (!local) {
    return undefined;
  }
  return {
    async get() {
      const stored = await local.get(ACTIVITY_KEY);
      return stored[ACTIVITY_KEY];
    },
    async set(entries) {
      await local.set({ [ACTIVITY_KEY]: entries });
    },
  };
}

function enqueueWrite(work: () => Promise<void>): Promise<void> {
  const run = writeChain.then(work, work);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function formatActivityTime(at: number, now = Date.now()): string {
  const date = new Date(at);
  const current = new Date(now);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === current.toDateString()) {
    return time;
  }
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseEntry(value: unknown): ActivityRow | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if ('sync' in record) {
    return parseSyncEntry(record);
  }
  if (
    typeof record['at'] !== 'number' ||
    !Number.isFinite(record['at']) ||
    typeof record['host'] !== 'string' ||
    record['host'].length === 0 ||
    typeof record['method'] !== 'string' ||
    record['method'].length === 0 ||
    !isOutcome(record['outcome'])
  ) {
    return null;
  }
  const entry: ActivityEntry = {
    at: record['at'],
    host: record['host'],
    method: record['method'],
    outcome: record['outcome'],
  };
  if (typeof record['identity'] === 'string' && record['identity'].length > 0) {
    entry.identity = record['identity'];
  }
  if (typeof record['kind'] === 'number' && Number.isFinite(record['kind'])) {
    entry.kind = record['kind'];
  }
  return entry;
}

function parseSyncEntry(record: Record<string, unknown>): SyncActivityEntry | null {
  if (
    typeof record['at'] !== 'number' ||
    !Number.isFinite(record['at']) ||
    !isSyncMode(record['sync']) ||
    !isSyncResult(record['result'])
  ) {
    return null;
  }
  const entry: SyncActivityEntry = {
    at: record['at'],
    sync: record['sync'],
    result: record['result'],
  };
  if (
    entry.result === 'failed' &&
    typeof record['reason'] === 'string' &&
    record['reason'].trim().length > 0
  ) {
    entry.reason = record['reason'].trim();
  }
  return entry;
}

function isOutcome(value: unknown): value is ActivityOutcome {
  return typeof value === 'string' && (ACTIVITY_OUTCOMES as readonly string[]).includes(value);
}

function isSyncMode(value: unknown): value is SyncActivityMode {
  return typeof value === 'string' && (SYNC_ACTIVITY_MODES as readonly string[]).includes(value);
}

function isSyncResult(value: unknown): value is SyncActivityResult {
  return typeof value === 'string' && (SYNC_ACTIVITY_RESULTS as readonly string[]).includes(value);
}
