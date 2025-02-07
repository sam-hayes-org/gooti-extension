import { inject } from '@angular/core';
import { Router } from '@angular/router';

export class NavComponent {
  readonly #router = inject(Router);

  navigateBack() {
    window.history.back();
  }

  navigate(path: string) {
    this.#router.navigate([path]);
  }
}
