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

  onClickRemove(host: string, event: MouseEvent) {
    event.stopPropagation();
    this.confirm()?.show(`Remove ${host}?`, () => this.#remove(host));
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

  #list(): SiteListEntry[] {
    return siteList(this.storage.getBrowserSessionHandler().browserSessionData);
  }
}
