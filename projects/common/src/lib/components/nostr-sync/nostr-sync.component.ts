import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Injectable,
  OnInit,
  inject,
} from '@angular/core';
import * as bootstrap from 'bootstrap';
import { SyncProgressStep } from '../../sync/manual';
import { IconButtonComponent } from '../icon-button/icon-button.component';
import { ToastComponent } from '../toast/toast.component';
import { noteSyncActivity, syncFailureReason } from '../../activity/log';
import { StorageService } from '../../services/storage/storage.service';
import { SyncRelayFailureError, defaultNostrSyncRelayIO } from '../../sync/pool';
import { generateSyncPhrase } from '../../sync/phrase';
import { DEFAULT_SYNC_RELAYS } from '../../sync/state';

/** Holds the passphrase currently shown on the phrase screen. */
@Injectable({ providedIn: 'root' })
export class NostrSyncLeave {
  phrase: string | null = null;

  hold(phrase: string): void {
    this.phrase = phrase;
  }

  clear(): void {
    this.phrase = null;
  }
}

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-nostr-sync',
  imports: [IconButtonComponent, ToastComponent],
  templateUrl: './nostr-sync.component.html',
  styleUrl: './nostr-sync.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class NostrSyncComponent implements OnInit, AfterViewInit {
  readonly leave = inject(NostrSyncLeave);
  readonly #storage = inject(StorageService);
  readonly #changes = inject(ChangeDetectorRef);
  readonly syncDialogId = crypto.randomUUID();
  readonly restoreDialogId = crypto.randomUUID();
  readonly phraseDialogId = crypto.randomUUID();
  syncModal: bootstrap.Modal | undefined;
  restoreModal: bootstrap.Modal | undefined;
  phraseModal: bootstrap.Modal | undefined;
  syncLines: { text: string; active: boolean }[] = [];
  syncError = '';
  syncFailures: { url: string; reason: string }[] = [];
  syncDone = false;

  phase: 'locked' | 'offer' | 'phrase' | 'restore' | 'ready' = 'locked';
  relays = DEFAULT_SYNC_RELAYS.join('\n');
  phraseInput = '';
  savedWords = false;
  busy = false;
  autoSync = false;
  error = '';

  ngOnInit(): void {
    this.#refresh();
  }

  ngAfterViewInit(): void {
    const element = document.getElementById(this.syncDialogId);
    if (element) {
      this.syncModal = new bootstrap.Modal(element);
    }
    const restoreElement = document.getElementById(this.restoreDialogId);
    if (restoreElement) {
      this.restoreModal = new bootstrap.Modal(restoreElement);
    }
    const phraseElement = document.getElementById(this.phraseDialogId);
    if (phraseElement) {
      this.phraseModal = new bootstrap.Modal(phraseElement);
    }
    if (this.phase === 'phrase') {
      this.phraseModal?.show();
    }
  }

  async onEnable(): Promise<void> {
    if (this.phase === 'phrase' && this.leave.phrase) {
      this.phraseModal?.show();
      return;
    }
    this.error = '';
    this.savedWords = false;
    const phrase = generateSyncPhrase();
    this.leave.hold(phrase);
    this.phase = 'phrase';
    await this.#storage.holdPendingSyncPhrase(phrase);
    this.phraseModal?.show();
  }

  async onDiscardPhrase(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.leave.clear();
    this.savedWords = false;
    this.error = '';
    this.phase = 'offer';
    this.phraseModal?.hide();
    await this.#storage.clearPendingSyncPhrase();
  }

  onShowRestore(): void {
    if (this.phase !== 'restore') {
      this.error = '';
      this.phraseInput = '';
      this.phase = 'restore';
    }
    this.restoreModal?.show();
  }

  onCancelRestore(): void {
    if (this.busy) {
      return;
    }
    this.phase = 'offer';
    this.error = '';
    this.restoreModal?.hide();
  }

  onSavedWords(event: Event): void {
    this.savedWords = (event.target as HTMLInputElement).checked;
  }

  copyPhrase(): void {
    const phrase = this.leave.phrase;
    if (!phrase) {
      return;
    }
    void navigator.clipboard.writeText(phrase);
  }

  async onSavePhrase(toast: ToastComponent): Promise<void> {
    const phrase = this.leave.phrase;
    if (!phrase || !this.savedWords) {
      return;
    }
    await this.#run(async () => {
      await this.#storage.enableNostrSync(phrase, this.relays);
      this.leave.clear();
      this.#refresh();
      this.phraseModal?.hide();
      toast.show('Sync is on.');
    });
  }

  async onRestore(toast: ToastComponent): Promise<void> {
    await this.#run(async () => {
      await this.#storage.joinNostrSync(
        this.phraseInput,
        this.relays,
        defaultNostrSyncRelayIO(),
      );
      this.#refresh();
      this.restoreModal?.hide();
      toast.show('Restored this vault from the phrase.');
    });
  }

  async onAutoSync(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
    await this.#run(async () => {
      await this.#storage.setNostrAutoSync(checked);
      this.#refresh();
    });
    input.checked = this.autoSync;
  }

  async onSaveRelays(toast: ToastComponent): Promise<void> {
    await this.#run(async () => {
      await this.#storage.saveNostrSyncRelays(this.relays);
      this.#refresh();
      toast.show('Updated the relays');
    });
  }

  async onSync(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.syncLines = [];
    this.syncError = '';
    this.syncFailures = [];
    this.syncDone = false;
    this.syncModal?.show();
    this.busy = true;
    this.#changes.detectChanges();
    try {
      await this.#storage.saveNostrSyncRelays(this.relays);
      const published = await this.#storage.syncNostrNow(defaultNostrSyncRelayIO(), (step) =>
        this.#mark(step),
      );
      this.#settle();
      this.syncLines = [
        ...this.syncLines,
        { text: published ? 'Synced' : 'Already up to date.', active: false },
      ];
      this.#refresh();
      await noteSyncActivity({
        sync: 'now',
        result: published ? 'synced' : 'current',
      });
    } catch (error) {
      this.#settle();
      this.syncError = error instanceof Error ? error.message : 'Sync failed.';
      this.syncFailures = error instanceof SyncRelayFailureError ? [...error.failures] : [];
      await noteSyncActivity({
        sync: 'now',
        result: 'failed',
        reason: syncFailureReason(error),
      });
    } finally {
      this.syncDone = true;
      this.busy = false;
      this.#changes.detectChanges();
    }
  }

  closeSync(): void {
    this.syncModal?.hide();
  }

  #mark(step: SyncProgressStep | 'save'): void {
    this.#settle();
    const text: Record<SyncProgressStep | 'save', string> = {
      read: 'Reading the vault from the relays.',
      merge: 'Merging it with this browser.',
      send: 'Sending it back.',
      save: 'Saving it on this browser.',
    };
    this.syncLines = [...this.syncLines, { text: text[step], active: true }];
    this.#changes.detectChanges();
  }

  #settle(): void {
    this.syncLines = this.syncLines.map((line) => ({ ...line, active: false }));
  }

  asText(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  async #run(action: () => Promise<void>): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await action();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Sync failed.';
    } finally {
      this.busy = false;
    }
  }

  #refresh(): void {
    const session = this.#storage.getBrowserSessionHandler().browserSessionData;
    if (!session?.vaultPassword) {
      this.phase = 'locked';
      return;
    }
    if (session.nostrSync) {
      this.phase = 'ready';
      this.relays = session.nostrSync.relays.join('\n');
      this.autoSync = session.nostrSync.autoSync === true;
      this.leave.clear();
      return;
    }
    this.autoSync = false;
    if (session.pendingSyncPhrase) {
      this.leave.hold(session.pendingSyncPhrase);
      this.phase = 'phrase';
      return;
    }
    if (this.phase === 'restore') {
      return;
    }
    this.phase = 'offer';
    this.relays = DEFAULT_SYNC_RELAYS.join('\n');
  }
}
