import {
  AfterViewInit,
  Component,
  EventEmitter,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import * as bootstrap from 'bootstrap';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-confirm',
  imports: [],
  templateUrl: './confirm.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './confirm.component.scss',
})
export class ConfirmComponent implements AfterViewInit {
  @Output() yes = new EventEmitter<void>();
  @Output() no = new EventEmitter<void>();

  message: string | undefined;
  title = 'Please confirm';
  yesLabel = 'Yes';
  showNo = true;
  /** A second answer next to Yes (see `choose`). The close button cancels both. */
  altLabel: string | undefined;
  yesDanger = false;
  onYes: ((() => Promise<void>) | (() => void)) | undefined;
  onAlt: ((() => Promise<void>) | (() => void)) | undefined;
  modal: bootstrap.Modal | undefined;

  readonly idString = crypto.randomUUID();

  ngAfterViewInit(): void {
    const myModalEl = document.getElementById(this.idString);
    if (!myModalEl) {
      return;
    }

    this.modal = new bootstrap.Modal(myModalEl);
  }

  onClickYes() {
    this.modal?.hide();
    if (typeof this.onYes !== 'undefined') {
      this.onYes();
    }
  }

  onClickAlt() {
    this.modal?.hide();
    if (typeof this.onAlt !== 'undefined') {
      this.onAlt();
    }
  }

  show(message: string, onYes: (() => Promise<void>) | (() => void)): void {
    this.title = 'Please confirm';
    this.yesLabel = 'Yes';
    this.showNo = true;
    this.altLabel = undefined;
    this.yesDanger = false;
    this.message = message;
    this.onYes = onYes;
    this.onAlt = undefined;
    this.modal?.show();
  }

  /** Two answers, such as "Keep it" and "Delete it". The close button answers neither. */
  choose(
    message: string,
    alt: { label: string; run: (() => Promise<void>) | (() => void) },
    yes: { label: string; run: (() => Promise<void>) | (() => void); danger?: boolean },
  ): void {
    this.title = 'Please confirm';
    this.showNo = false;
    this.message = message;
    this.altLabel = alt.label;
    this.onAlt = alt.run;
    this.yesLabel = yes.label;
    this.yesDanger = yes.danger === true;
    this.onYes = yes.run;
    this.modal?.show();
  }

  inform(
    message: string,
    onOk: (() => Promise<void>) | (() => void),
    title = 'Info',
  ): void {
    this.title = title;
    this.yesLabel = 'OK';
    this.showNo = false;
    this.altLabel = undefined;
    this.yesDanger = false;
    this.onAlt = undefined;
    this.message = message;
    this.onYes = onOk;
    this.modal?.show();
  }
}
