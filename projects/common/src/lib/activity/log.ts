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

export const BACKUP_ACTIVITY_MODES = ['now', 'auto'] as const;
export const BACKUP_ACTIVITY_RESULTS = ['backedUp', 'updated', 'current', 'failed'] as const;

export type BackupActivityMode = (typeof BACKUP_ACTIVITY_MODES)[number];
export type BackupActivityResult = (typeof BACKUP_ACTIVITY_RESULTS)[number];

export interface ActivityEntry {
  at: number;
  host: string;
  identity?: string;
  method: string;
  kind?: number;
  outcome: ActivityOutcome;
  /** Short failure summary, such as "Gooti Desktop did not answer. …". Only on failed. */
  reason?: string;
}

/**
 * A backup. Lines are the same text as the backup panel: nicks and hosts.
 * No passphrase, private key, or bunker secret.
 */
export interface BackupActivityEntry {
  at: number;
  backup: BackupActivityMode;
  result: BackupActivityResult;
  /** Short failure summary. Absent unless the backup failed. */
  reason?: string;
  /** Rows this browser took from the relay. */
  took?: string[];
  /** Rows this browser sent. */
  sent?: string[];
}

export type ActivityRow = ActivityEntry | BackupActivityEntry;

export type ActivityDraft = Omit<ActivityEntry, 'at'>;
export type BackupActivityDraft = Omit<BackupActivityEntry, 'at'>;

export interface ActivityStore {
  get(): Promise<unknown>;
  set(entries: ActivityRow[]): Promise<void>;
}

let writeChain: Promise<void> = Promise.resolve();

/** The error a request gets when the user closes the unlock window. Activity shows it as dismissed. */
export const UNLOCK_DISMISSED = 'Gooti was not unlocked.';

export function activityOutcome(error: unknown): ActivityOutcome {
  const message = error instanceof Error ? error.message : '';
  if (message === UNLOCK_DISMISSED) {
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

export async function recordBackupActivity(
  store: ActivityStore,
  draft: BackupActivityDraft,
  at = Date.now(),
): Promise<void> {
  const entry: BackupActivityEntry = {
    at,
    backup: draft.backup,
    result: draft.result,
  };
  if (draft.result === 'failed' && draft.reason) {
    const reason = draft.reason.trim();
    if (reason.length > 0) {
      entry.reason = reason;
    }
  }
  const took = cleanLines(draft.took);
  const sent = cleanLines(draft.sent);
  if (took) {
    entry.took = took;
  }
  if (sent) {
    entry.sent = sent;
  }
  await enqueueWrite(async () => {
    const entries = parseActivity(await store.get());
    await store.set(appendActivity(entries, entry));
  });
}

/** One short line for the activity row. The per-relay list stays in the backup dialog. */
export function backupFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  const text = message || 'Backup failed.';
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}

/**
 * Writes a backup row with this browser's local activity storage.
 * A missing store or a failed write does not fail the backup.
 */
export async function noteBackupActivity(draft: BackupActivityDraft): Promise<void> {
  const store = localActivityStore();
  if (!store) {
    return;
  }
  try {
    await recordBackupActivity(store, draft);
  } catch {
    // The activity list is optional. The backup result still stands.
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
  // Entries written before 2026-11-12 say `sync` and `synced`.
  if ('backup' in record || 'sync' in record) {
    return parseBackupEntry(record);
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
  if (
    entry.outcome === 'failed' &&
    typeof record['reason'] === 'string' &&
    record['reason'].trim().length > 0
  ) {
    entry.reason = record['reason'].trim().slice(0, 180);
  }
  return entry;
}

function parseBackupEntry(record: Record<string, unknown>): BackupActivityEntry | null {
  const mode = record['backup'] ?? record['sync'];
  const result = record['result'] === 'synced' ? 'backedUp' : record['result'];
  if (
    typeof record['at'] !== 'number' ||
    !Number.isFinite(record['at']) ||
    !isBackupMode(mode) ||
    !isBackupResult(result)
  ) {
    return null;
  }
  const entry: BackupActivityEntry = {
    at: record['at'],
    backup: mode,
    result,
  };
  if (
    entry.result === 'failed' &&
    typeof record['reason'] === 'string' &&
    record['reason'].trim().length > 0
  ) {
    entry.reason = record['reason'].trim();
  }
  const took = cleanLines(record['took']);
  const sent = cleanLines(record['sent']);
  if (took) {
    entry.took = took;
  }
  if (sent) {
    entry.sent = sent;
  }
  return entry;
}

const BACKUP_LINE_LIMIT = 80;

function cleanLines(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const lines: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const line = item.trim();
    if (line.length === 0) {
      continue;
    }
    lines.push(line);
    if (lines.length === BACKUP_LINE_LIMIT) {
      break;
    }
  }
  return lines.length > 0 ? lines : undefined;
}

function isOutcome(value: unknown): value is ActivityOutcome {
  return typeof value === 'string' && (ACTIVITY_OUTCOMES as readonly string[]).includes(value);
}

function isBackupMode(value: unknown): value is BackupActivityMode {
  return typeof value === 'string' && (BACKUP_ACTIVITY_MODES as readonly string[]).includes(value);
}

function isBackupResult(value: unknown): value is BackupActivityResult {
  return typeof value === 'string' && (BACKUP_ACTIVITY_RESULTS as readonly string[]).includes(value);
}
