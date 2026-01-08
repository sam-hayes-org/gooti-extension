import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfirmComponent, StartupService, StorageService } from '@common';
import { getNewStorageServiceConfig } from '../../common/data/get-new-storage-service-config';

@Component({
  selector: 'app-vault-login',
  templateUrl: './vault-login.component.html',
  styleUrl: './vault-login.component.scss',
  imports: [FormsModule, ConfirmComponent],
})
export class VaultLoginComponent {
  loginPassword = '';
  showInvalidPasswordAlert = false;

  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);
  readonly #startup = inject(StartupService);

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  async loginVault(password: string | undefined = undefined) {
    if (!this.loginPassword && !password) {
      return;
    }

    try {
      await this.#storage.unlockVault(password ?? this.loginPassword);
      this.#router.navigateByUrl('/home/identities');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      this.showInvalidPasswordAlert = true;
      window.setTimeout(() => {
        this.showInvalidPasswordAlert = false;
      }, 2000);
    }
  }

  async onClickResetExtension() {
    try {
      await this.#storage.resetExtension();
      this.#startup.startOver(getNewStorageServiceConfig());
    } catch (error) {
      console.log(error);
      // TODO
    }
  }
}
