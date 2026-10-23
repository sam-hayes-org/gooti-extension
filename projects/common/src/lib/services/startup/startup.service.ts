import { inject, Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { LoggerService } from '../logger/logger.service';
import {
  StorageService,
  StorageServiceConfig,
} from '../storage/storage.service';
import {
  isHomeRoute,
  isRestorableRoute,
  pathOnly,
  readLastRoute,
  resolveOpeningRoute,
  touchLastRoute,
  writeLastRoute,
} from './last-route';

export type StartupSource = 'background' | 'click';
export interface StartupDetails {
  source: StartupSource;
  id?: string;
  /** Website host. Set only for the window a site opened. */
  host?: string;
}

@Injectable({
  providedIn: 'root',
})
export class StartupService {
  readonly #logger = inject(LoggerService);
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);
  #startupDetails: StartupDetails = {
    source: 'click',
  };
  #listening = false;
  #rememberRoutes = false;
  #returnTo?: string;

  get startupDetails(): StartupDetails {
    return this.#startupDetails;
  }

  async startOver(storageConfig: StorageServiceConfig, details: StartupDetails) {
    this.#startupDetails = details;
    this.#rememberRoutes = details.source === 'click';
    this.#returnTo = readLastRoute()?.returnTo;
    this.#listenForRoutes();
    this.#storage.initialize(storageConfig);

    storageConfig.vaultHandler.setIgnoreProperties(
      storageConfig.gootiMetaHandler.metaProperties,
    );

    try {
      await storageConfig.vaultHandler.retireAccountSync();
    } catch (error) {
      this.#logger.log(`Could not retire browser account sync: ${error}`);
    }

    await this.#storage.loadGootiMetaData();

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

    // An upgrade while the vault is already unlocked never passes through the login screen.
    const vault = this.#storage.getVaultHandler().browserSyncData;
    let session = this.#storage.getBrowserSessionHandler().browserSessionData;
    if (vault && vault.version < 3 && session?.vaultPassword) {
      await this.#storage.persistVaultV3();
      session = this.#storage.getBrowserSessionHandler().browserSessionData;
    }

    // The website window only asks which identity that site should use.
    // The toolbar popup returns to the screen from the last five minutes.
    if (!this.#rememberRoutes) {
      await this.#router.navigateByUrl('/choose-identity');
      return;
    }
    const saved = readLastRoute();

    void this.#router.navigateByUrl(
      resolveOpeningRoute(saved, Date.now(), session?.identities ?? []),
    );
    this.#storage.queueQuietBackup();
  }

  #listenForRoutes(): void {
    if (this.#listening) {
      return;
    }
    this.#listening = true;
    this.#router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd) || !this.#rememberRoutes) {
        return;
      }
      const path = pathOnly(event.urlAfterRedirects);
      if (isHomeRoute(path)) {
        this.#returnTo = path;
      }
      if (isRestorableRoute(path)) {
        writeLastRoute(path, Date.now(), this.#returnTo);
      }
    });
    window.addEventListener('beforeunload', () => {
      if (this.#rememberRoutes) {
        touchLastRoute();
      }
    });
  }
}
