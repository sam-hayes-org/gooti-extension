import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  IconButtonComponent,
  NavComponent,
  NostrHelper,
  StorageService,
  ToastComponent,
} from '@common';

interface CustomIdentity {
  id: string;
  nick: string;
  privkeyNsec: string;
  privkeyHex: string;
  pubkeyNpub: string;
  pubkeyHex: string;
}

@Component({
  selector: 'app-keys',
  imports: [IconButtonComponent, FormsModule, ToastComponent],
  templateUrl: './keys.component.html',
  styleUrl: './keys.component.scss',
})
export class KeysComponent extends NavComponent implements OnInit {
  identity?: CustomIdentity;

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
    const identity = this.#storage
      .getBrowserSessionHandler()
      .browserSessionData?.identities.find((x) => x.id === identityId);

    if (!identity) {
      return;
    }

    const pubkey = NostrHelper.pubkeyFromPrivkey(identity.privkey);

    this.identity = {
      id: identity.id,
      nick: identity.nick,
      privkeyHex: identity.privkey,
      privkeyNsec: NostrHelper.privkey2nsec(identity.privkey),
      pubkeyHex: pubkey,
      pubkeyNpub: NostrHelper.pubkey2npub(pubkey),
    };
  }
}
