import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { LoggerService } from '../logger/logger.service';
import {
  StorageService,
  StorageServiceConfig,
} from '../storage/storage.service';

@Injectable({
  providedIn: 'root',
})
export class StartupService {
  readonly #logger = inject(LoggerService);
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  async startOver(storageConfig: StorageServiceConfig) {
    this.#storage.initialize(storageConfig);

    // Step 0:
    storageConfig.browserSyncNoHandler.setIgnoreProperties(
      storageConfig.gootiMetaHandler.metaProperties
    );

    // Step 1: Load the gooti's user settings
    const gootiMetaData = await this.#storage.loadGootiMetaData();
    if (typeof gootiMetaData?.syncFlow === 'undefined') {
      // Very first run. The user has not set up Gooti yet.
      this.#router.navigateByUrl('/welcome');
      return;
    }
    this.#storage.enableBrowserSyncFlow(gootiMetaData.syncFlow);

    // Load the browser session data.
    const browserSessionData = await this.#storage.loadBrowserSessionData();

    if (!browserSessionData) {
      await this.#initializeFlow_A();
    } else {
      await this.#initializeFlow_B();
    }
  }

  async #initializeFlow_A() {
    // Starting with NO browser session data available.
    //
    // This could be because the browser sync data was
    // never loaded before OR it was attempted, but
    // there is no browser sync data.

    this.#logger.log('No browser session data available.');

    // Check if there is NO browser sync data.
    const browserSyncData = await this.#storage.loadAndMigrateBrowserSyncData();
    if (browserSyncData) {
      // There is browser sync data. Route to the VAULT LOGIN to enable the session.
      this.#router.navigateByUrl('/vault-login');
    } else {
      // There is NO browser sync data. Route to the VAULT CREATION to enable the session.
      this.#router.navigateByUrl('/vault-create/home');
    }
  }

  async #initializeFlow_B() {
    // Stating with browser session data available. The user has already unlocked the vault before.
    // Route to VAULT HOME.

    this.#logger.log('Browser session data is available.');

    // Also load the browser sync data. This is needed, if the user adds or deletes anything.
    await this.#storage.loadAndMigrateBrowserSyncData();

    const selectedIdentityId =
      this.#storage.getBrowserSessionHandler().browserSessionData
        ?.selectedIdentityId;

    this.#router.navigateByUrl(
      `/home/${selectedIdentityId ? 'identity' : 'identities'}`
    );
  }
}
