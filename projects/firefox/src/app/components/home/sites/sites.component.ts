import { Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  ConfirmComponent,
  IdentityRowComponent,
  SITE_CLEARED_HINT,
  SiteListEntry,
  siteList,
  StorageService,
  ToastComponent,
} from '@common';
import browser from 'webextension-polyfill';

/** Every site with an identity. Remove unlinks the site; its permissions stay on the identity. */
@Component({
  selector: 'app-sites',
  templateUrl: './sites.component.html',
  styleUrl: './sites.component.scss',
  imports: [ConfirmComponent, IdentityRowComponent, ToastComponent],
})
export class SitesComponent implements OnInit {
  readonly storage = inject(StorageService);

  readonly #router = inject(Router);
  private readonly confirm = viewChild<ConfirmComponent>('confirm');
  private readonly toast = viewChild<ToastComponent>('toast');

  readonly sites = signal<SiteListEntry[]>([]);

  ngOnInit(): void {
    this.sites.set(this.#list());
  }

  onClickSite(entry: SiteListEntry) {
    this.#router.navigateByUrl(`/edit-identity/${entry.identity.id}/home`);
  }

  onClickRemove(entry: SiteListEntry, event: MouseEvent) {
    event.stopPropagation();
    const host = entry.host;
    if (entry.identity.site !== host) {
      this.confirm()?.show(`Remove ${host}?`, () => this.#remove(host));
      return;
    }
    // A site-only identity made for this site: offer to throw it away with the site.
    this.confirm()?.choose(
      `Remove ${host}? Its site-only identity can go too.`,
      { label: 'Keep identity', run: () => this.#remove(host) },
      {
        label: 'Delete identity',
        danger: true,
        run: () => this.#removeWithIdentity(host, entry.identity.id),
      },
    );
  }

  async #remove(host: string): Promise<void> {
    try {
      await browser.runtime.sendMessage({ type: 'clear-site', host });
      await this.storage.loadBrowserSessionData();
      this.sites.set(this.#list());
      this.toast()?.show(SITE_CLEARED_HINT);
    } catch (error) {
      console.error(error);
      this.toast()?.show('Could not remove this site');
    }
  }

  /** Deleting the identity also removes every site that used it. */
  async #removeWithIdentity(host: string, identityId: string): Promise<void> {
    try {
      await this.storage.deleteIdentity(identityId);
      this.sites.set(this.#list());
      this.toast()?.show(SITE_CLEARED_HINT);
    } catch (error) {
      console.error(error);
      this.toast()?.show(`Could not remove ${host}`);
    }
  }

  #list(): SiteListEntry[] {
    return siteList(this.storage.getBrowserSessionHandler().browserSessionData);
  }
}
