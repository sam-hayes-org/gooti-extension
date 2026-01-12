import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ConfirmComponent,
  Identity_DECRYPTED,
  NavItemComponent,
  StorageService,
} from '@common';

@Component({
  selector: 'app-home',
  imports: [NavItemComponent, ConfirmComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  identity?: Identity_DECRYPTED;

  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  ngOnInit(): void {
    const identityId = this.#activatedRoute.parent?.snapshot.params['id'];
    if (!identityId) {
      return;
    }

    this.#initialize(identityId);
  }

  onClickNavigateTo(destination: 'keys' | 'permissions' | 'relays') {
    this.#router.navigateByUrl(
      `/edit-identity/${this.identity?.id}/${destination}`,
    );
  }

  async onConfirmDeletion() {
    await this.#storage.deleteIdentity(this.identity?.id);
    await this.#router.navigateByUrl('/home/identities');
  }

  #initialize(selectedIdentityId: string) {
    this.identity =
      this.#storage.getBrowserSessionHandler().browserSessionData?.[
        `identity_${selectedIdentityId}`
      ];
  }
}
