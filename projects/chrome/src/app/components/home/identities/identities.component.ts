import {
  Component,
  inject,
  OnInit,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  activeTabHost,
  Identity_DECRYPTED,
  IdentityCurrentComponent,
  IdentityRowComponent,
  identityForSite,
  SITE_CLEARED_HINT,
  SITE_RELOAD_HINT,
  StartupService,
  StorageService,
  ToastComponent,
} from '@common';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-identities',
  templateUrl: './identities.component.html',
  styleUrl: './identities.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [IdentityCurrentComponent, IdentityRowComponent, ToastComponent],
})
export class IdentitiesComponent implements OnInit {
  readonly storage = inject(StorageService);

  readonly #router = inject(Router);
  readonly #startup = inject(StartupService);
  private readonly toast = viewChild<ToastComponent>('toast');

  host: string | null = null;
  hostReady = false;

  get fromBackground(): boolean {
    return this.#startup.startupDetails.source === 'background';
  }

  get siteIdentity(): Identity_DECRYPTED | undefined {
    return identityForSite(
      this.storage.getBrowserSessionHandler().browserSessionData,
      this.host,
    );
  }

  async ngOnInit(): Promise<void> {
    if (this.fromBackground) {
      this.host = this.#startup.startupDetails.host ?? null;
      this.hostReady = true;
      if (this.siteIdentity) {
        window.close();
      }
      return;
    }
    this.host = await activeTabHost();
    this.hostReady = true;
  }

  onClickNewIdentity() {
    this.#router.navigateByUrl('/new-identity');
  }

  onClickSiteIdentity(identity: Identity_DECRYPTED) {
    if (this.fromBackground) {
      window.close();
      return;
    }
    this.#router.navigateByUrl(`/edit-identity/${identity.id}/home`);
  }

  onClickEditIdentity(identity: Identity_DECRYPTED) {
    if (this.fromBackground) {
      void this.#bind(identity.id);
      return;
    }
    this.#router.navigateByUrl(`/edit-identity/${identity.id}/home`);
  }

  onClickUse(identityId: string, event: MouseEvent) {
    event.stopPropagation();
    void this.#bind(identityId);
  }

  onClickClear(event: MouseEvent) {
    event.stopPropagation();
    void this.#clear();
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
      if (this.fromBackground) {
        window.close();
        return;
      }
      this.toast()?.show(SITE_RELOAD_HINT);
    } catch (error) {
      console.error(error);
      this.toast()?.show('Could not select this identity');
    }
  }

  async #clear(): Promise<void> {
    if (!this.host || this.fromBackground) {
      return;
    }
    try {
      await browser.runtime.sendMessage({
        type: 'clear-site',
        host: this.host,
      });
      await this.storage.loadBrowserSessionData();
      this.toast()?.show(SITE_CLEARED_HINT);
    } catch (error) {
      console.error(error);
      this.toast()?.show('Could not clear this site');
    }
  }
}
