import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import {
  IconButtonComponent,
  Identity_DECRYPTED,
  sleep,
  StorageService,
} from '@common';

@Component({
  selector: 'app-edit-identity',
  templateUrl: './edit-identity.component.html',
  styleUrl: './edit-identity.component.scss',
  imports: [RouterOutlet, IconButtonComponent, FormsModule],
})
export class EditIdentityComponent implements OnInit {
  identity?: Identity_DECRYPTED;
  previousRoute?: string;
  protected isEditingNick = false;

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

  async onClickEditNick() {
    this.isEditingNick = true;

    let waited = 0;
    do {
      const inputElement = document.getElementById('nick-edit-input');
      if (inputElement) {
        (inputElement as HTMLInputElement).focus();
        break;
      }
      await sleep(100);
      waited += 100;
    } while (waited < 2000);
  }

  async onNickEnter(element: HTMLInputElement) {
    if (!this.identity) {
      return;
    }

    const value = element.value.trim();
    if (!value) {
      return;
    }

    if (value !== this.identity.nick) {
      await this.#storage.editNick(this.identity.id, value);
    }
    this.isEditingNick = false;
  }

  onClickCancel() {
    if (!this.previousRoute) {
      return;
    }
    this.#router.navigateByUrl(this.previousRoute);
  }
}
