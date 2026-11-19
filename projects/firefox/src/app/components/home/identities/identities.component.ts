import {
  Component,
  inject,
  OnInit,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  activeTabHost,
  ConfirmComponent,
  DesktopPairingComponent,
  Identity_DECRYPTED,
  IdentityCurrentComponent,
  IdentityRowComponent,
  identityForSite,
  lastUsedNote,
  readLastUseByHost,
  SITE_CLEARED_HINT,
  SITE_RELOAD_HINT,
  splitIdentities,
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
  imports: [ConfirmComponent, DesktopPairingComponent, IdentityCurrentComponent, IdentityRowComponent, ToastComponent],
})
export class IdentitiesComponent implements OnInit {
  readonly storage = inject(StorageService);

  readonly #router = inject(Router);
  readonly #startup = inject(StartupService);
  private readonly confirm = viewChild<ConfirmComponent>('confirm');
  private readonly toast = viewChild<ToastComponent>('toast');

  host: string | null = null;
  hostReady = false;
  /** Both groups start open; each can be closed. */
  regularOpen = true;
  siteIdentitiesOpen = true;
  readonly siteTipId = crypto.randomUUID();
  readonly #lastUse = signal(new Map<string, number>());

  get fromBackground(): boolean {
    return this.#startup.startupDetails.source === 'background';
  }

  get siteIdentity(): Identity_DECRYPTED | undefined {
    return identityForSite(
      this.storage.getBrowserSessionHandler().browserSessionData,
      this.host,
    );
  }

  get identityGroups(): ReturnType<typeof splitIdentities> {
    return splitIdentities(this.storage.getBrowserSessionHandler().browserSessionData);
  }

  /**
   * The site's own identity sits on the card above. Without site-only identities the one list leaves
   * it out; with both groups it is listed in its group too, as "Used here", so it shows which it is.
   */
  byNotCurrent(currentId: string | undefined): (identity: Identity_DECRYPTED) => boolean {
    return (identity) => identity.id !== currentId;
  }

  /** When this browser last sent a request from the site the identity was made for. */
  lastUsed(identity: Identity_DECRYPTED): string | undefined {
    return identity.site ? lastUsedNote(this.#lastUse().get(identity.site)) : undefined;
  }

  async ngOnInit(): Promise<void> {
    void readLastUseByHost().then((lastUse) => this.#lastUse.set(lastUse));
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

  onClickRemove(event: MouseEvent) {
    event.stopPropagation();
    if (!this.host) {
      return;
    }
    this.confirm()?.show(`Remove ${this.host}?`, () => this.#remove());
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

  async #remove(): Promise<void> {
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
      this.toast()?.show('Could not remove this site');
    }
  }
}
