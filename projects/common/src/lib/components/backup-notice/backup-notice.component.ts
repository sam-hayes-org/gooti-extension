import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { StartupService } from '../../services/startup/startup.service';
import { dismissBackupNotice, backupNoticeSnapshot, watchBackupNotice } from '../../backup/notice';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-backup-notice',
  templateUrl: './backup-notice.component.html',
  styleUrl: './backup-notice.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class BackupNoticeComponent implements OnInit, OnDestroy {
  readonly #startup = inject(StartupService);
  readonly #changes = inject(ChangeDetectorRef);
  #stop = (): void => undefined;
  running = false;
  took: readonly string[] = [];
  sent: readonly string[] = [];
  error = '';

  get toolbar(): boolean {
    return this.#startup.startupDetails.source !== 'background';
  }

  ngOnInit(): void {
    this.#read();
    this.#stop = watchBackupNotice(() => {
      this.#read();
      this.#changes.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.#stop();
  }

  dismiss(): void {
    dismissBackupNotice();
    this.#read();
  }

  #read(): void {
    const next = backupNoticeSnapshot();
    this.running = next.running;
    this.took = next.took;
    this.sent = next.sent;
    this.error = next.error;
  }
}
