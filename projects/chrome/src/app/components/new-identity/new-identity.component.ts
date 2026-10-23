/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AfterViewInit,
  Component,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  type ConnectedBunker,
  type Nip05Check,
  NavComponent,
  NostrHelper,
  StorageService,
  checkNip05,
  connectBunker,
} from '@common';
import { generateSecretKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';

@Component({
  selector: 'app-new-identity',
  templateUrl: './new-identity.component.html',
  styleUrl: './new-identity.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule],
})
export class NewIdentityComponent
  extends NavComponent
  implements AfterViewInit
{
  readonly identity = {
    nick: '',
    privkeyInput: '',
    bunkerLink: '',
    nostrAddress: '',
  };
  bunkerMode = false;
  busy = false;
  canSave = false;
  alertMessage: any | undefined;
  pendingBunker: ConnectedBunker | undefined;
  nip05Check: Nip05Check | undefined;
  checkedAddress = '';

  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  ngAfterViewInit(): void {
    document.getElementById('nickElement')?.focus();
  }

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  toggleBunker() {
    this.bunkerMode = !this.bunkerMode;
    this.pendingBunker = undefined;
    this.nip05Check = undefined;
    this.validateCanSave();
  }

  signingNpub(): string {
    return this.pendingBunker ? NostrHelper.pubkey2npub(this.pendingBunker.pubkey) : '';
  }

  onClickBack() {
    if (this.busy) {
      return;
    }
    this.pendingBunker = undefined;
    this.nip05Check = undefined;
  }

  onClickGeneratePrivkey() {
    const sk = generateSecretKey();
    const privkey = bytesToHex(sk);

    this.identity.privkeyInput = NostrHelper.privkey2nsec(privkey);
    this.validateCanSave();
  }

  validateCanSave() {
    if (!this.identity.nick) {
      this.canSave = false;
      return;
    }
    if (this.bunkerMode) {
      this.canSave = this.identity.bunkerLink.trim().length > 0;
      return;
    }

    try {
      NostrHelper.getNostrPrivkeyObject(
        this.identity.privkeyInput.toLocaleLowerCase(),
      );
      this.canSave = true;
    } catch (error) {
      console.log(error);
      this.canSave = false;
    }
  }

  async onClickSave() {
    if (!this.canSave || this.busy) {
      return;
    }

    if (this.bunkerMode) {
      await this.#saveBunker();
      return;
    }

    if (!this.identity.nick || !this.identity.privkeyInput) {
      return;
    }

    try {
      await this.#storage.addIdentity({
        nick: this.identity.nick,
        privkeyString: this.identity.privkeyInput,
      });
      this.#router.navigateByUrl('/home/identities');
    } catch (error: any) {
      this.#showAlert(error?.message);
    }
  }

  async onClickUseKey() {
    const connected = this.pendingBunker;
    if (!connected || this.busy || this.nip05Check === 'mismatch') {
      return;
    }
    this.busy = true;
    try {
      await this.#storage.addBunkerIdentity({
        nick: this.identity.nick,
        connected,
      });
      this.#router.navigateByUrl('/home/identities');
    } catch (error: any) {
      this.#showAlert(error?.message);
    } finally {
      this.busy = false;
    }
  }

  async #saveBunker() {
    this.busy = true;
    this.pendingBunker = undefined;
    this.nip05Check = undefined;
    try {
      const connected = await connectBunker(this.identity.bunkerLink);
      const address = this.identity.nostrAddress.trim();
      this.checkedAddress = address;
      this.nip05Check = address
        ? await checkNip05(address, connected.pubkey)
        : undefined;
      this.pendingBunker = connected;
    } catch (error: any) {
      this.#showAlert(error?.message);
    } finally {
      this.busy = false;
    }
  }

  #showAlert(message: string | undefined) {
    this.alertMessage = message;
    setTimeout(() => {
      this.alertMessage = undefined;
    }, 4500);
  }
}
