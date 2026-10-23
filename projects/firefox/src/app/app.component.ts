import {
  Component,
  DOCUMENT,
  HostListener,
  inject,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  IndexPromptResponseMessage,
  LoggerService,
  identityForSite,
  StartupDetails,
  StartupService,
  StorageService,
  BackupNoticeComponent,
} from '@common';
import { getNewStorageServiceConfig } from './common/data/get-new-storage-service-config';
import { Router, RouterOutlet } from '@angular/router';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BackupNoticeComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  readonly #startup = inject(StartupService);
  readonly #logger = inject(LoggerService);
  readonly #storage = inject(StorageService);
  readonly #document = inject(DOCUMENT);
  readonly #router = inject(Router);

  protected message: string | undefined;

  /** The password screen and the chooser carry their own lines. */
  protected get showCloseWarning(): boolean {
    const url = this.#router.url;
    return (
      !!this.message &&
      !url.startsWith('/choose-identity') &&
      !url.startsWith('/vault-login')
    );
  }

  @HostListener('window:beforeunload', ['$event'])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBeforeUnload(event: BeforeUnloadEvent) {
    // The toolbar popup must not answer a site. Only the window opened for a
    // site does, and only after that site already has an identity.
    this.#logger.log('AppComponent detected window beforeunload event.');

    if (this.#startup.startupDetails.source !== 'background') {
      return;
    }
    const session = this.#storage.getBrowserSessionHandler().browserSessionData;
    const bound = identityForSite(session, this.#startup.startupDetails.host);
    const message: IndexPromptResponseMessage = {
      id: this.#startup.startupDetails.id ?? 'na',
      response: bound ? 'unlocked' : 'locked',
    };
    browser.runtime.sendMessage(message);

    // Optionally, return a string to prompt the user (e.g., for unsaved changes), but avoid if not needed
    // event.returnValue = 'Are you sure?'; // This shows a confirmation dialog
  }

  ngOnInit(): void {
    this.#logger.initialize(`Gooti Firefox Extension}`);

    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source'); // e.g., 'background'
    const id = urlParams.get('id'); // e.g., your id value
    const host = urlParams.get('host');

    this.#logger.log(
      `AppComponent initialized with URLSearchParams: source=${source}, id=${id}, host=${host}`,
    );

    const startupDetails: StartupDetails = {
      source: source === 'background' ? 'background' : 'click',
      id: source === 'background' ? (id ?? 'na') : undefined,
      host: source === 'background' && host ? host : undefined,
    };

    if (startupDetails.source === 'background') {
      // The window manager can tile this popup larger than the size passed
      // to windows.create. Fill that window, the way prompt.html does.
      // 100vw on the toolbar popup would size it to the browser window, so
      // the click branch stays a fixed size.
      const root = this.#document.documentElement;
      root.style.width = '100%';
      root.style.height = '100%';
      root.style.overflow = 'hidden';
      this.#document.body.style.width = '100%';
      this.#document.body.style.height = '100%';
      this.message =
        'Unlock Gooti and select an identity before closing this window!';
    } else {
      this.#document.body.style.width = '375px';
      this.#document.body.style.height = '600px';
    }

    this.#startup.startOver(getNewStorageServiceConfig(), startupDetails);
  }
}
