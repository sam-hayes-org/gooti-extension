import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  viewChild,
} from '@angular/core';
import {
  Identity_DECRYPTED,
  IdentityRowComponent,
  identityForSite,
  StartupService,
  StorageService,
  ToastComponent,
} from '@common';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-choose-identity',
  imports: [IdentityRowComponent, ToastComponent],
  templateUrl: './choose-identity.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './choose-identity.component.scss',
})
export class ChooseIdentityComponent implements OnInit {
  readonly storage = inject(StorageService);

  readonly #startup = inject(StartupService);
  private readonly toast = viewChild<ToastComponent>('toast');

  host: string | null = null;

  get siteIdentity(): Identity_DECRYPTED | undefined {
    return identityForSite(
      this.storage.getBrowserSessionHandler().browserSessionData,
      this.host,
    );
  }

  ngOnInit(): void {
    this.host = this.#startup.startupDetails.host ?? null;
    if (this.siteIdentity) {
      window.close();
    }
  }

  onChoose(identity: Identity_DECRYPTED): void {
    void this.#bind(identity.id);
  }

  async #bind(identityId: string): Promise<void> {
    if (!this.host) {
      return;
    }
    try {
      await browser.runtime.sendMessage({
        type: 'bind-site',
        host: this.host,
        identityId,
      });
      await this.storage.loadBrowserSessionData();
      window.close();
    } catch (error) {
      console.error(error);
      this.toast()?.show('Could not select this identity');
    }
  }
}
