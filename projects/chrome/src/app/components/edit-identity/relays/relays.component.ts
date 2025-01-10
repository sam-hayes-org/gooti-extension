import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  IconButtonComponent,
  Identity_DECRYPTED,
  NavComponent,
  Relay_DECRYPTED,
  RelayRwComponent,
  StorageService,
  VisualRelayPipe,
} from '@common';

interface NewRelay {
  url: string;
  read: boolean;
  write: boolean;
};

@Component({
  selector: 'app-relays',
  imports: [
    IconButtonComponent,
    FormsModule,
    RelayRwComponent,
    NgTemplateOutlet,
    VisualRelayPipe,
  ],
  templateUrl: './relays.component.html',
  styleUrl: './relays.component.scss',
})
export class RelaysComponent extends NavComponent implements OnInit {
  identity?: Identity_DECRYPTED;
  relays: Relay_DECRYPTED[] = [];
  addRelayInputHasFocus = false;
  newRelay: NewRelay = {
    url: '',
    read: true,
    write: true,
  };
  canAdd = false;

  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #storage = inject(StorageService);

  ngOnInit(): void {
    const selectedIdentityId =
      this.#activatedRoute.parent?.snapshot.params['id'];
    if (!selectedIdentityId) {
      return;
    }

    this.#loadData(selectedIdentityId);
  }

  evaluateCanAdd() {
    let canAdd = true;

    if (!this.newRelay.url) {
      canAdd = false;
    } else if (!this.newRelay.read && !this.newRelay.write) {
      canAdd = false;
    }

    this.canAdd = canAdd;
  }

  async onClickRemoveRelay(relay: Relay_DECRYPTED) {
    if (!this.identity) {
      return;
    }

    try {
      await this.#storage.deleteRelay(relay.id);
      this.#loadData(this.identity.id);
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  async onClickAddRelay() {
    if (!this.identity) {
      return;
    }

    try {
      await this.#storage.addRelay({
        identityId: this.identity.id,
        url: 'wss://' + this.newRelay.url.toLowerCase(),
        read: this.newRelay.read,
        write: this.newRelay.write,
      });

      this.newRelay = {
        url: '',
        read: true,
        write: true,
      };
      this.evaluateCanAdd();
      this.#loadData(this.identity.id);
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  async onRelayChanged(relay: Relay_DECRYPTED) {
    try {
      await this.#storage.updateRelay(relay);
    } catch (error) {
      console.log(error);
      // TODO
    }
  }

  #loadData(identityId: string) {
    this.identity = this.#storage
      .getBrowserSessionHandler()
      .browserSessionData?.identities.find((x) => x.id === identityId);

    const relays: Relay_DECRYPTED[] = [];
    (this.#storage.getBrowserSessionHandler().browserSessionData?.relays ?? [])
      .filter((x) => x.identityId === identityId)
      .forEach((x) => {
        relays.push(JSON.parse(JSON.stringify(x)));
      });
    this.relays = relays;
  }
}
