import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  Identity_DECRYPTED,
  NostrHelper,
  PubkeyComponent,
  StorageService,
  ToastComponent,
  VisualNip05Pipe,
} from '@common';
import NDK, { NDKUserProfile } from '@nostr-dev-kit/ndk';

interface LoadedData {
  profile: NDKUserProfile | undefined;
  nip05: string | undefined;
  nip05isValidated: boolean | undefined;
  validating: boolean;
}

@Component({
  selector: 'app-identity',
  imports: [PubkeyComponent, VisualNip05Pipe, ToastComponent],
  templateUrl: './identity.component.html',
  styleUrl: './identity.component.scss',
})
export class IdentityComponent implements OnInit {
  selectedIdentity: Identity_DECRYPTED | undefined;
  selectedIdentityNpub: string | undefined;
  loadedData: LoadedData = {
    profile: undefined,
    nip05: undefined,
    nip05isValidated: undefined,
    validating: false,
  };

  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  ngOnInit(): void {
    this.#loadData();
  }

  copyToClipboard(pubkey: string | undefined) {
    if (!pubkey) {
      return;
    }
    navigator.clipboard.writeText(pubkey);
  }

  onClickShowDetails() {
    if (!this.selectedIdentity) {
      return;
    }

    this.#router.navigateByUrl(
      `/edit-identity/${this.selectedIdentity.id}/home`,
    );
  }

  async #loadData() {
    try {
      const selectedIdentityId =
        this.#storage.getBrowserSessionHandler().browserSessionData
          ?.selectedIdentityId ?? null;

      const identity =
        this.#storage.getBrowserSessionHandler().browserSessionData?.[
          `identity_${selectedIdentityId}`
        ];

      if (!identity) {
        return;
      }

      this.selectedIdentity = identity;
      const pubkey = NostrHelper.pubkeyFromPrivkey(identity.privkey);
      this.selectedIdentityNpub = NostrHelper.pubkey2npub(pubkey);

      // Determine the user's relays to check for his profile.
      const relays =
        this.#storage
          .getBrowserSessionHandler()
          .browserSessionData?.relays.filter(
            (x) => x.identityId === identity.id,
          ) ?? [];
      if (relays.length === 0) {
        return;
      }

      const relevantRelays = relays.filter((x) => x.write).map((x) => x.url);

      // Fetch the user's profile.
      const ndk = new NDK({
        explicitRelayUrls: relevantRelays,
      });

      await ndk.connect();

      const user = ndk.getUser({
        pubkey: NostrHelper.pubkeyFromPrivkey(identity.privkey),
        //relayUrls: relevantRelays,
      });
      this.loadedData.profile = (await user.fetchProfile()) ?? undefined;
      if (this.loadedData.profile?.nip05) {
        this.loadedData.validating = true;
        this.loadedData.nip05isValidated =
          (await user.validateNip05(this.loadedData.profile.nip05)) ??
          undefined;
        this.loadedData.validating = false;
      }
    } catch (error) {
      console.error(error);
      // TODO
    }
  }
}
