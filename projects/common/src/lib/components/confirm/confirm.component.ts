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
  onYes: ((() => Promise<void>) | (() => void)) | undefined;
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

  show(message: string, onYes: (() => Promise<void>) | (() => void)): void {
    this.title = 'Please confirm';
    this.yesLabel = 'Yes';
    this.showNo = true;
    this.message = message;
    this.onYes = onYes;
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
    this.message = message;
    this.onYes = onOk;
    this.modal?.show();
  }
}
