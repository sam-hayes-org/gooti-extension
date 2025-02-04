import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { IconButtonComponent, Identity_DECRYPTED, StorageService } from '@common';

@Component({
  selector: 'app-edit-identity',
  templateUrl: './edit-identity.component.html',
  styleUrl: './edit-identity.component.scss',
  imports: [RouterOutlet, IconButtonComponent],
})
export class EditIdentityComponent implements OnInit {
  identity?: Identity_DECRYPTED;
  previousRoute?: string;

  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #storage = inject(StorageService);
  readonly #router = inject(Router);

  constructor() {
    // Must be called in the constructor and NOT in ngOnInit.
    this.previousRoute = this.#router
      .getCurrentNavigation()
      ?.previousNavigation?.extractedUrl.toString();
  }

  ngOnInit(): void {
    const selectedIdentityId = this.#activatedRoute.snapshot.params['id'];
    if (!selectedIdentityId) {
      return;
    }

    this.identity = this.#storage
      .getBrowserSessionHandler()
      .browserSessionData?.identities.find((x) => x.id === selectedIdentityId);
  }

  onClickCancel() {
    if (!this.previousRoute) {
      return;
    }
    this.#router.navigateByUrl(this.previousRoute);
  }
}
