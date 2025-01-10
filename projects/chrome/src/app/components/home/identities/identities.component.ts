import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IconButtonComponent,
  Identity_DECRYPTED,
  StorageService,
  ToastComponent,
} from '@common';

@Component({
  selector: 'app-identities',
  templateUrl: './identities.component.html',
  styleUrl: './identities.component.scss',
  imports: [IconButtonComponent, ToastComponent],
})
export class IdentitiesComponent {
  readonly storage = inject(StorageService);

  readonly #router = inject(Router);

  onClickNewIdentity() {
    this.#router.navigateByUrl('/new-identity');
  }

  onClickEditIdentity(identity: Identity_DECRYPTED) {
    this.#router.navigateByUrl(`/edit-identity/${identity.id}/home`);
  }

  async onClickSwitchIdentity(identityId: string, event: MouseEvent) {
    event.stopPropagation();
    await this.storage.switchIdentity(identityId);
  }
}
