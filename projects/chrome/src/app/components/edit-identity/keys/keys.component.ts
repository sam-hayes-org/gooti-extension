import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  bunkerAsksSite,
  ConfirmComponent,
  connectBunker,
  Identity_DECRYPTED,
  NavComponent,
  NostrHelper,
  StorageService,
  ToastComponent,
} from '@common';
import { FormsModule } from '@angular/forms';

interface CustomIdentity {
  id: string;
  nick: string;
  privkeyNsec?: string;
  privkeyHex?: string;
  pubkeyNpub: string;
  pubkeyHex: string;
  isBunker: boolean;
  connected: boolean;
  askSite: boolean;
  bunkerNpub?: string;
  relays: string[];
}

@Component({
  selector: 'app-keys',
  imports: [ConfirmComponent, FormsModule, ToastComponent],
  templateUrl: './keys.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './keys.component.scss',
})
export class KeysComponent extends NavComponent implements OnInit {
  identity?: CustomIdentity;
  link = '';
  busy = false;
  waiting = false;
  alertMessage: string | undefined;

  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #storage = inject(StorageService);

  ngOnInit(): void {
    const identityId = this.#activatedRoute.parent?.snapshot.params['id'];
    if (!identityId) {
      return;
    }

    this.#initialize(identityId);
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  async #initialize(identityId: string) {
    const identity =
      this.#storage.getBrowserSessionHandler().browserSessionData?.[
        `identity_${identityId}`
      ];

    if (!identity) {
      return;
    }

    const pubkey = identity.pubkey;

    this.identity = {
      id: identity.id,
      nick: identity.nick,
      privkeyHex: identity.privkey,
      privkeyNsec: identity.privkey ? NostrHelper.privkey2nsec(identity.privkey) : undefined,
      pubkeyHex: pubkey,
      pubkeyNpub: NostrHelper.pubkey2npub(pubkey),
      isBunker: identity.bunker !== undefined,
      connected: !!identity.bunker?.clientSecretKey,
      askSite: bunkerAsksSite(identity.bunker),
      bunkerNpub: identity.bunker
        ? NostrHelper.pubkey2npub(identity.bunker.pubkey)
        : undefined,
      relays: identity.bunker?.relays ?? [],
    };
  }

  async replaceLink() {
    if (this.busy || this.waiting) {
      return;
    }
    this.waiting = true;
    try {
      await this.#run(async (identity) => {
        const connected = await connectBunker(this.link);
        await this.#storage.saveBunkerSession(identity.id, connected);
        this.link = '';
      });
    } finally {
      this.waiting = false;
    }
  }

  async disconnect() {
    await this.#run(async (identity) => {
      await this.#storage.disconnectBunker(identity.id);
    });
  }

  async setAskSite(askSite: boolean) {
    if (!this.identity || this.identity.askSite === askSite || this.busy || this.waiting) {
      return;
    }
    const previous = this.identity.askSite;
    this.identity = { ...this.identity, askSite };
    const saved = await this.#run(async (identity) => {
      await this.#storage.saveBunkerAskSite(identity.id, askSite);
    });
    if (!saved && this.identity) {
      this.identity = { ...this.identity, askSite: previous };
    }
  }

  async #run(action: (identity: Identity_DECRYPTED) => Promise<void>): Promise<boolean> {
    const identity = this.#stored();
    if (!identity || this.busy) {
      return false;
    }
    this.busy = true;
    this.alertMessage = undefined;
    try {
      await action(identity);
      await this.#initialize(identity.id);
      return true;
    } catch (error: unknown) {
      this.alertMessage = error instanceof Error ? error.message : 'The bunker did not connect.';
      return false;
    } finally {
      this.busy = false;
    }
  }

  #stored() {
    const identityId = this.identity?.id;
    if (!identityId) {
      return undefined;
    }
    return this.#storage.getBrowserSessionHandler().browserSessionData?.[`identity_${identityId}`];
  }
}
