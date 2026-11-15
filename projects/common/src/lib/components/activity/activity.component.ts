import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import browser from 'webextension-polyfill';
import { ConfirmComponent } from '../confirm/confirm.component';
import {
  ACTIVITY_KEY,
  ActivityOutcome,
  ActivityRow,
  BackupActivityEntry,
  BackupActivityMode,
  BackupActivityResult,
  parseActivity,
  formatActivityTime,
} from '../../activity/log';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-activity',
  templateUrl: './activity.component.html',
  styleUrl: './activity.component.scss',
  imports: [ConfirmComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ActivityComponent implements OnInit, OnDestroy {
  readonly #changes = inject(ChangeDetectorRef);
  readonly outcomeLabel: Record<ActivityOutcome, string> = {
    allowed: 'Allowed',
    once: 'Only this time',
    denied: 'Denied',
    dismissed: 'Dismissed',
    failed: 'Failed',
  };
  readonly backupModeLabel: Record<BackupActivityMode, string> = {
    now: 'Manual',
    auto: 'Automatic',
  };
  readonly backupResultLabel: Record<BackupActivityResult, string> = {
    backedUp: 'Backed up',
    updated: 'Updated',
    current: 'Up to date',
    failed: 'Failed',
  };
  entries: ActivityRow[] = [];

  isBackup(entry: ActivityRow): entry is BackupActivityEntry {
    return 'backup' in entry;
  }

  readonly #onChanged = (
    changes: Record<string, browser.Storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'local' || !changes[ACTIVITY_KEY]) {
      return;
    }
    this.entries = parseActivity(changes[ACTIVITY_KEY].newValue);
    this.#changes.detectChanges();
  };

  ngOnInit(): void {
    browser.storage.onChanged.addListener(this.#onChanged);
    void this.#load();
  }

  ngOnDestroy(): void {
    browser.storage.onChanged.removeListener(this.#onChanged);
  }

  /** Deletes this browser's activity log. Other browsers keep theirs. */
  async onConfirmClear(): Promise<void> {
    await browser.storage.local.remove(ACTIVITY_KEY);
    this.entries = [];
    this.#changes.detectChanges();
  }

  time(at: number): string {
    return formatActivityTime(at);
  }

  async #load(): Promise<void> {
    const stored = await browser.storage.local.get(ACTIVITY_KEY);
    this.entries = parseActivity(stored[ACTIVITY_KEY]);
    this.#changes.detectChanges();
  }
}
