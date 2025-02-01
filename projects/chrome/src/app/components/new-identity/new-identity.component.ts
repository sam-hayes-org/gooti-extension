/* eslint-disable @typescript-eslint/no-explicit-any */
import { AfterViewInit, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavComponent, NostrHelper, StorageService } from '@common';
import { generateSecretKey } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';

@Component({
  selector: 'app-new-identity',
  templateUrl: './new-identity.component.html',
  styleUrl: './new-identity.component.scss',
  imports: [FormsModule],
})
export class NewIdentityComponent
  extends NavComponent
  implements AfterViewInit
{
  readonly identity = {
    nick: '',
    privkeyInput: '',
  };
  canSave = false;
  alertMessage: any | undefined;

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

  onClickGeneratePrivkey() {
    const sk = generateSecretKey();
    const privkey = bytesToHex(sk);

    this.identity.privkeyInput = NostrHelper.privkey2nsec(privkey);
    this.validateCanSave();
  }

  validateCanSave() {
    if (!this.identity.nick || !this.identity.privkeyInput) {
      this.canSave = false;
      return;
    }

    try {
      NostrHelper.getNostrPrivkeyObject(
        this.identity.privkeyInput.toLocaleLowerCase()
      );
      this.canSave = true;
    } catch (error) {
      console.log(error);
      this.canSave = false;
    }
  }

  async onClickSave() {
    if (!this.canSave) {
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
      this.alertMessage = error?.message;
      setTimeout(() => {
        this.alertMessage = undefined;
      }, 4500);
    }
  }
}
