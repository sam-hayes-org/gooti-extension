import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavComponent, StorageService } from '@common';

@Component({
  selector: 'app-new',
  imports: [FormsModule],
  templateUrl: './new.component.html',
  styleUrl: './new.component.scss',
})
export class NewComponent extends NavComponent {
  readonly #router = inject(Router);
  readonly #storage = inject(StorageService);
  protected password = '';
  protected minPasswordLength = 4;

  toggleType(element: HTMLInputElement) {
    if (element.type === 'password') {
      element.type = 'text';
    } else {
      element.type = 'password';
    }
  }

  async createVault(password: string) {
    if (!password || password.length < this.minPasswordLength) {
      return;
    }

    await this.#storage.createNewVault(this.password);
    this.#router.navigateByUrl('/home/identities');
  }
}
