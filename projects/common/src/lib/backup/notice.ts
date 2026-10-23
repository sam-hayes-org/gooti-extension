import { ChangeReport } from './changes';

export interface BackupNoticeSnapshot {
  running: boolean;
  took: readonly string[];
  sent: readonly string[];
  error: string;
}

const emptyReport = (): ChangeReport => ({ took: [], sent: [] });

let depth = 0;
let pending = emptyReport();
let pendingError = '';
let snapshot: BackupNoticeSnapshot = { running: false, took: [], sent: [], error: '' };
const listeners = new Set<() => void>();

export function backupNoticeSnapshot(): BackupNoticeSnapshot {
  return snapshot;
}

export function watchBackupNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One backup started. A second backup keeps the bar up until both finish. */
export function beginBackupNotice(): void {
  depth += 1;
  snapshot = { running: true, took: [], sent: [], error: '' };
  emit();
}

/** The latest backup finished. The panel stays hidden while another backup is still running. */
export function finishBackupNotice(report: ChangeReport): void {
  depth = Math.max(0, depth - 1);
  pending = { took: [...report.took], sent: [...report.sent] };
  pendingError = '';
  publish();
}

export function failBackupNotice(message: string): void {
  depth = Math.max(0, depth - 1);
  pending = emptyReport();
  pendingError = message;
  publish();
}

export function dismissBackupNotice(): void {
  if (depth > 0) {
    return;
  }
  pending = emptyReport();
  pendingError = '';
  publish();
}

function publish(): void {
  const running = depth > 0;
  snapshot = running
    ? { running: true, took: [], sent: [], error: '' }
    : { running: false, took: pending.took, sent: pending.sent, error: pendingError };
  emit();
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}
