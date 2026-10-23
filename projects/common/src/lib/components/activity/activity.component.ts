import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import browser from 'webextension-polyfill';
import {
  ACTIVITY_KEY,
  ActivityOutcome,
  ActivityRow,
  SyncActivityEntry,
  SyncActivityMode,
  SyncActivityResult,
  parseActivity,
  formatActivityTime,
} from '../../activity/log';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-activity',
  templateUrl: './activity.component.html',
  styleUrl: './activity.component.scss',
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
  readonly syncModeLabel: Record<SyncActivityMode, string> = {
    now: 'Sync now',
    auto: 'Automatic',
  };
  readonly syncResultLabel: Record<SyncActivityResult, string> = {
    synced: 'Synced',
    current: 'Up to date',
    failed: 'Failed',
  };
  entries: ActivityRow[] = [];

  isSync(entry: ActivityRow): entry is SyncActivityEntry {
    return 'sync' in entry;
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

  time(at: number): string {
    return formatActivityTime(at);
  }

  async #load(): Promise<void> {
    const stored = await browser.storage.local.get(ACTIVITY_KEY);
    this.entries = parseActivity(stored[ACTIVITY_KEY]);
    this.#changes.detectChanges();
  }
}
