import {
  Component,
  DOCUMENT,
  HostListener,
  inject,
  OnInit,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  IndexPromptResponseMessage,
  LoggerService,
  StartupDetails,
  StartupService,
  StorageService,
} from '@common';
import { getNewStorageServiceConfig } from './common/data/get-new-storage-service-config';
import browser from 'webextension-polyfill';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  readonly #startup = inject(StartupService);
  readonly #logger = inject(LoggerService);
  readonly #storage = inject(StorageService);
  readonly #document = inject(DOCUMENT);

  protected message: string | undefined;

  @HostListener('window:beforeunload', ['$event'])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onBeforeUnload(event: BeforeUnloadEvent) {
    // This event is only fired when the app was started from the background
    // and NOT by clicking on the extension icon in the browser toolbar.

    this.#logger.log('AppComponent detected window beforeunload event.');

    if (
      this.#startup.startupDetails.source === 'background' &&
      this.#storage.getBrowserSessionHandler().browserSessionData
        ?.selectedIdentityId
    ) {
      const message: IndexPromptResponseMessage = {
        id: this.#startup.startupDetails.id ?? 'na',
        response: 'unlocked',
      };
      browser.runtime.sendMessage(message);
    } else {
      const message: IndexPromptResponseMessage = {
        id: this.#startup.startupDetails.id ?? 'na',
        response: 'locked',
      };
      browser.runtime.sendMessage(message);
    }

    // Optionally, return a string to prompt the user (e.g., for unsaved changes), but avoid if not needed
    // event.returnValue = 'Are you sure?'; // This shows a confirmation dialog
  }

  ngOnInit(): void {
    this.#logger.initialize(`Gooti Firefox Extension}`);

    const urlParams = new URLSearchParams(window.location.search);
    const source = urlParams.get('source'); // e.g., 'background'
    const id = urlParams.get('id'); // e.g., your id value

    this.#logger.log(
      `AppComponent initialized with URLSearchParams: source=${source}, id=${id}`,
    );

    const startupDetails: StartupDetails = {
      source: source === 'background' ? 'background' : 'click',
      id: source === 'background' ? (id ?? 'na') : undefined,
    };

    if (startupDetails.source === 'background') {
      this.#document.body.style.width = '475px';
      this.#document.body.style.height = '600px';
      this.message =
        'Unlock your vault and select an identity before closing this window!';
    } else {
      this.#document.body.style.width = '375px';
      this.#document.body.style.height = '600px';
    }

    this.#startup.startOver(getNewStorageServiceConfig(), startupDetails);
  }
}
