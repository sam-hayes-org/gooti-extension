import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { pathOnly } from '../services/startup/last-route';

export class NavComponent {
  readonly #router = inject(Router);

  navigateBack() {
    const path = pathOnly(this.#router.url);
    const edit = /^\/edit-identity\/([^/]+)\/(?:keys|permissions)$/.exec(path);
    if (edit) {
      void this.#router.navigateByUrl(`/edit-identity/${edit[1]}/home`);
      return;
    }
    if (path === '/new-identity') {
      void this.#router.navigateByUrl('/home/identities');
      return;
    }
    window.history.back();
  }

  navigate(path: string) {
    this.#router.navigate([path]);
  }
}
