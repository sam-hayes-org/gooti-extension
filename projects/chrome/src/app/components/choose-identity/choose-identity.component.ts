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
  splitIdentities,
  StartupService,
  StorageService,
  ToastComponent,
} from '@common';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-choose-identity',
  templateUrl: './choose-identity.component.html',
  styleUrl: './choose-identity.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IdentityRowComponent, ToastComponent],
})
export class ChooseIdentityComponent implements OnInit {
  readonly storage = inject(StorageService);

  readonly #startup = inject(StartupService);
  private readonly toast = viewChild<ToastComponent>('toast');

  host: string | null = null;
  busy = false;

  /**
   * The regular identities, and first the site-only identity made for this site, if there is one.
   * Site-only identities of other sites are left out.
   */
  get regularIdentities(): Identity_DECRYPTED[] {
    const groups = splitIdentities(this.storage.getBrowserSessionHandler().browserSessionData);
    const own = this.host ? groups.site.filter((identity) => identity.site === this.host) : [];
    return [...own, ...groups.regular];
  }

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

  async onNewSiteIdentity(): Promise<void> {
    if (!this.host || this.busy) {
      return;
    }
    this.busy = true;
    try {
      const identity = await this.storage.addSiteIdentity(this.host);
      await this.#bind(identity.id);
    } catch (error) {
      console.error(error);
      this.toast()?.show('Could not create an identity');
    } finally {
      this.busy = false;
    }
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
