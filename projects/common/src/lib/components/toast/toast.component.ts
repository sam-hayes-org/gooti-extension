import { AfterViewInit, Component, HostBinding, Input } from '@angular/core';
import * as bootstrap from 'bootstrap';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-toast',
  imports: [],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
})
export class ToastComponent implements AfterViewInit {
  @Input() message: string | undefined;

  @Input()
  @HostBinding('style.bottom.px')
  bottom = 76;

  readonly idString = crypto.randomUUID();

  toast: bootstrap.Toast | undefined;

  ngAfterViewInit(): void {
    const myToastEl = document.getElementById(this.idString);
    if (!myToastEl) {
      return;
    }

    this.toast = new bootstrap.Toast(myToastEl, { delay: 2000 });
  }

  show(message?: string) {
    if (message) {
      this.message = message;
    }
    this.toast?.show();
  }
}
