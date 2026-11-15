import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Injectable,
  computed,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import * as bootstrap from 'bootstrap';
import { BackupProgressStep } from '../../backup/manual';
import { IconButtonComponent } from '../icon-button/icon-button.component';
import { ToastComponent } from '../toast/toast.component';
import { noteBackupActivity, backupFailureReason } from '../../activity/log';
import { beginBackupNotice, failBackupNotice, finishBackupNotice } from '../../backup/notice';
import { StorageService } from '../../services/storage/storage.service';
import { BackupRelayFailureError, defaultBackupRelayIO } from '../../backup/pool';
import { generatePassphrase } from '../../backup/phrase';
import { BACKUP_CONTENT_LIMIT, sharedContentChars } from '../../backup/blob';
import { liveVaultFromSession } from '../../backup/session-live';
import { DEFAULT_BACKUP_RELAYS, projectSharedDocument } from '../../backup/state';

/** Holds the passphrase currently shown on the phrase screen. */
@Injectable({ providedIn: 'root' })
export class BackupLeave {
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
  selector: 'lib-backup-panel',
  imports: [IconButtonComponent, ToastComponent],
  templateUrl: './backup-panel.component.html',
  styleUrl: './backup-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class BackupPanelComponent implements OnInit, AfterViewInit {
  readonly leave = inject(BackupLeave);
  readonly #storage = inject(StorageService);
  readonly #changes = inject(ChangeDetectorRef);
  readonly backupDialogId = crypto.randomUUID();
  readonly restoreDialogId = crypto.randomUUID();
  readonly phraseDialogId = crypto.randomUUID();
  readonly autoTipId = crypto.randomUUID();
  backupModal: bootstrap.Modal | undefined;
  restoreModal: bootstrap.Modal | undefined;
  phraseModal: bootstrap.Modal | undefined;
  backupLines: { text: string; active: boolean }[] = [];
  backupError = '';
  backupFailures: { url: string; reason: string }[] = [];
  backupDone = false;

  // A signal, so a parent that reads it (see canRestore) re-renders when it changes.
  readonly phase = signal<'locked' | 'offer' | 'phrase' | 'restore' | 'ready'>('locked');
  /** True while the vault has no backup yet, so restoring from a passphrase makes sense. */
  readonly canRestore = computed(() => {
    const phase = this.phase();
    return phase === 'offer' || phase === 'restore' || phase === 'phrase';
  });
  relays = DEFAULT_BACKUP_RELAYS.join('\n');
  phraseInput = '';
  savedWords = false;
  busy = false;
  autoBackup = false;
  error = '';
  vaultChars = 0;
  readonly vaultLimit = BACKUP_CONTENT_LIMIT;

  ngOnInit(): void {
    this.#refresh();
  }

  ngAfterViewInit(): void {
    const element = document.getElementById(this.backupDialogId);
    if (element) {
      this.backupModal = new bootstrap.Modal(element);
    }
    const restoreElement = document.getElementById(this.restoreDialogId);
    if (restoreElement) {
      this.restoreModal = new bootstrap.Modal(restoreElement);
    }
    const phraseElement = document.getElementById(this.phraseDialogId);
    if (phraseElement) {
      this.phraseModal = new bootstrap.Modal(phraseElement);
    }
    if (this.phase() === 'phrase') {
      this.phraseModal?.show();
    }
  }

  async onEnable(): Promise<void> {
    if (this.phase() === 'phrase' && this.leave.phrase) {
      this.phraseModal?.show();
      return;
    }
    this.error = '';
    this.savedWords = false;
    const phrase = generatePassphrase();
    this.leave.hold(phrase);
    this.phase.set('phrase');
    await this.#storage.holdPendingPassphrase(phrase);
    this.phraseModal?.show();
  }

  async onDiscardPhrase(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.leave.clear();
    this.savedWords = false;
    this.error = '';
    this.phase.set('offer');
    this.phraseModal?.hide();
    await this.#storage.clearPendingPassphrase();
  }

  onShowRestore(): void {
    if (this.phase() !== 'restore') {
      this.error = '';
      this.phraseInput = '';
      this.phase.set('restore');
    }
    this.restoreModal?.show();
  }

  onCancelRestore(): void {
    if (this.busy) {
      return;
    }
    this.phase.set('offer');
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
      await this.#storage.enableBackup(phrase, this.relays);
      this.leave.clear();
      this.#refresh();
      this.phraseModal?.hide();
      toast.show('Backup is on.');
    });
  }

  async onRestore(toast: ToastComponent): Promise<void> {
    await this.#run(async () => {
      await this.#storage.joinBackup(
        this.phraseInput,
        this.relays,
        defaultBackupRelayIO(),
      );
      this.#refresh();
      this.restoreModal?.hide();
      toast.show('Merged the backup with this browser.');
    });
  }

  async onAutoBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
    await this.#run(async () => {
      await this.#storage.setAutoBackup(checked);
      this.#refresh();
    });
    input.checked = this.autoBackup;
  }

  async onSaveRelays(toast: ToastComponent): Promise<void> {
    await this.#run(async () => {
      await this.#storage.saveBackupRelays(this.relays);
      this.#refresh();
      toast.show('Updated the relays');
    });
  }

  async onBackUp(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.backupLines = [];
    this.backupError = '';
    this.backupFailures = [];
    this.backupDone = false;
    this.backupModal?.show();
    this.busy = true;
    this.#changes.detectChanges();
    beginBackupNotice();
    try {
      await this.#storage.saveBackupRelays(this.relays);
      const outcome = await this.#storage.backUpNow(defaultBackupRelayIO(), (step) =>
        this.#mark(step),
      );
      this.#settle();
      this.backupLines = [
        ...this.backupLines,
        {
          text: outcome.published ? 'Backed up' : outcome.changed ? 'Updated' : 'Already up to date.',
          active: false,
        },
      ];
      this.#refresh();
      await noteBackupActivity({
        backup: 'now',
        result: outcome.published ? 'backedUp' : outcome.changed ? 'updated' : 'current',
        took: outcome.report.took,
        sent: outcome.report.sent,
      });
      finishBackupNotice(outcome.report);
    } catch (error) {
      this.#settle();
      this.backupError = error instanceof Error ? error.message : 'Backup failed.';
      this.backupFailures = error instanceof BackupRelayFailureError ? [...error.failures] : [];
      const reason = backupFailureReason(error);
      failBackupNotice(reason);
      await noteBackupActivity({
        backup: 'now',
        result: 'failed',
        reason,
      });
    } finally {
      this.backupDone = true;
      this.busy = false;
      this.#changes.detectChanges();
    }
  }

  closeBackup(): void {
    this.backupModal?.hide();
  }

  #mark(step: BackupProgressStep | 'save'): void {
    this.#settle();
    const text: Record<BackupProgressStep | 'save', string> = {
      read: 'Reading the backup from the relays.',
      merge: 'Merging it with this browser.',
      send: 'Sending it back.',
      save: 'Saving it on this browser.',
    };
    this.backupLines = [...this.backupLines, { text: text[step], active: true }];
    this.#changes.detectChanges();
  }

  #settle(): void {
    this.backupLines = this.backupLines.map((line) => ({ ...line, active: false }));
  }

  asText(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  get vaultUsed(): string {
    return formatVaultSize(this.vaultChars);
  }

  get vaultPercent(): number {
    if (this.vaultChars <= 0) {
      return 0;
    }
    return Math.min(100, (this.vaultChars / this.vaultLimit) * 100);
  }

  get vaultOver(): boolean {
    return this.vaultChars > this.vaultLimit;
  }

  async #run(action: () => Promise<void>): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await action();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Backup failed.';
    } finally {
      this.busy = false;
    }
  }

  #refresh(): void {
    const session = this.#storage.getBrowserSessionHandler().browserSessionData;
    if (!session?.vaultPassword) {
      this.phase.set('locked');
      return;
    }
    if (session.backupState) {
      this.phase.set('ready');
      this.relays = session.backupState.relays.join('\n');
      this.autoBackup = session.backupState.autoBackup === true;
      this.vaultChars = sharedContentChars(
        projectSharedDocument(session.backupState, liveVaultFromSession(session), Date.now()).document,
      );
      this.leave.clear();
      return;
    }
    this.autoBackup = false;
    this.vaultChars = 0;
    if (session.pendingPassphrase) {
      this.leave.hold(session.pendingPassphrase);
      this.phase.set('phrase');
      return;
    }
    if (this.phase() === 'restore') {
      return;
    }
    this.phase.set('offer');
    this.relays = DEFAULT_BACKUP_RELAYS.join('\n');
  }
}

/** Decimal units, matching the relay's 1,000,000-character limit. */
function formatVaultSize(chars: number): string {
  if (chars < 1000) {
    return `${chars} B`;
  }
  if (chars < 10_000) {
    return `${(chars / 1000).toFixed(1)} KB`;
  }
  if (chars < 1_000_000) {
    return `${Math.round(chars / 1000)} KB`;
  }
  const mb = chars / 1_000_000;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
