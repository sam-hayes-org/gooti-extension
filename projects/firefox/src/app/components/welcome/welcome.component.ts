import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BrowserSyncFlow, StorageService } from '@common';

@Component({
  selector: 'app-welcome',
  imports: [],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
})
export class WelcomeComponent {
  readonly router = inject(Router);
  readonly #storage = inject(StorageService);

  async onClickSync(enabled: boolean) {
    const flow: BrowserSyncFlow = enabled
      ? BrowserSyncFlow.BROWSER_SYNC
      : BrowserSyncFlow.NO_SYNC;

    await this.#storage.enableBrowserSyncFlow(flow);

    // In case the user has selected the BROWSER_SYNC flow,
    // we have to check if there is sync data available (e.g. from
    // another browser instance).
    // If so, navigate to /vault-login, otherwise to /vault-create/home.
    if (flow === BrowserSyncFlow.BROWSER_SYNC) {
      const browserSyncData =
        await this.#storage.loadAndMigrateBrowserSyncData();

      if (
        typeof browserSyncData !== 'undefined' &&
        Object.keys(browserSyncData).length > 0
      ) {
        await this.router.navigateByUrl('/vault-login');
        return;
      }
    }

    await this.router.navigateByUrl('/vault-create/home');
  }
}
