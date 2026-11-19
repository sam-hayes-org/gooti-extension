import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import browser from 'webextension-polyfill';
import { DESKTOP_PAIRING_KEY, DesktopPairing } from '../../background/background';
import { StorageService } from '../../services/storage/storage.service';

/** A wait longer than Gooti Desktop's own (5 minutes) means the request is gone. */
const STALE_MS = 6 * 60 * 1000;

/**
 * The note on Identities while this browser asks Gooti Desktop to allow its own key, with the
 * code the desktop shows too. Opening the popup is one of the two moments the browser asks. An
 * allowed browser checks then that the desktop still accepts it; after a Disconnect there, the
 * note says so and the browser asks again only on "Connect again".
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'lib-desktop-pairing',
  template: `
    @if (pairing(); as p) {
      @switch (p.state) {
        @case ('waiting') {
          <div class="note" role="status">
            <i class="bi bi-display"></i>
            <span>
              <strong>Allow this browser in Gooti Desktop.</strong>
              Code <span class="code">{{ p.code }}</span>. Gooti Desktop shows the same code.
            </span>
          </div>
        }
        @case ('refused') {
          <div class="note warn" role="status">
            <i class="bi bi-slash-circle"></i>
            <span>
              <strong>Gooti Desktop disconnected this browser.</strong>
              It no longer signs as your Desktop only identities here.
              <button type="button" class="again" [disabled]="busy()" (click)="connectAgain()">
                Connect again
              </button>
            </span>
          </div>
        }
        @case ('failed') {
          <div class="note warn" role="status">
            <i class="bi bi-exclamation-circle"></i>
            <span>{{ p.reason }} This browser asks again when you open Gooti.</span>
          </div>
        }
      }
    }
  `,
  styles: `
    .note {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(13, 110, 253, 0.14);
      color: #c5dbff;
      font-size: 13px;
      line-height: 1.4;

      &.warn {
        background: rgba(240, 195, 109, 0.12);
        color: #f0c36d;
      }

      strong {
        display: block;
        color: #e8edf5;
        font-weight: 600;
      }
    }

    .again {
      display: block;
      height: 28px;
      margin-top: 8px;
      padding: 0 10px;
      border: 0;
      border-radius: 8px;
      background: #2a3140;
      color: #e8edf5;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;

      &:hover:not(:disabled) {
        background: #343c4e;
      }

      &:disabled {
        opacity: 0.6;
        cursor: default;
      }
    }

    .code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #e8edf5;
      letter-spacing: 0.06em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesktopPairingComponent implements OnInit, OnDestroy {
  readonly #storage = inject(StorageService);
  readonly pairing = signal<DesktopPairing | null>(null);
  readonly busy = signal(false);
  #timer: ReturnType<typeof setInterval> | undefined;

  async ngOnInit(): Promise<void> {
    const last = await this.#read();
    try {
      if (last?.state === 'refused') {
        // Disconnected on the desktop: ask again only on "Connect again". Without an identity
        // that needs Gooti Desktop any more, the note goes.
        if ((await this.#storage.desktopIdentityHere()) === false) {
          await this.#clear();
        }
      } else {
        const done = await this.#storage.requestDesktopConnect(this.#send, false);
        if (done === 'allowed') {
          await this.#send({ type: 'check-desktop' });
        }
      }
    } catch {
      // No backup, or locked: nothing to connect.
    }
    await this.#refresh();
    this.#timer = setInterval(() => void this.#refresh(), 2000);
  }

  async connectAgain(): Promise<void> {
    this.busy.set(true);
    try {
      if ((await this.#storage.requestDesktopConnect(this.#send, true)) === 'none') {
        await this.#clear();
      }
    } catch {
      // Locked meanwhile: the note stays.
    } finally {
      this.busy.set(false);
    }
    await this.#refresh();
  }

  readonly #send = (message: unknown) => browser.runtime.sendMessage(message);

  async #clear(): Promise<void> {
    try {
      await browser.storage.local.remove(DESKTOP_PAIRING_KEY);
    } catch {
      // Only this note depends on it.
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.#timer);
  }

  async #refresh(): Promise<void> {
    const pairing = await this.#read();
    // A Disconnect stays shown until "Connect again"; a wait or a failure only for a while.
    const fresh =
      pairing && (pairing.state === 'refused' || Date.now() - pairing.at < STALE_MS) ? pairing : null;
    this.pairing.set(fresh);
  }

  async #read(): Promise<DesktopPairing | null> {
    try {
      const stored = await browser.storage.local.get(DESKTOP_PAIRING_KEY);
      return (stored[DESKTOP_PAIRING_KEY] as DesktopPairing | undefined) ?? null;
    } catch {
      return null;
    }
  }
}
