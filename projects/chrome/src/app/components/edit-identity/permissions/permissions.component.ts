import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  ConfirmComponent,
  IconButtonComponent,
  Identity_DECRYPTED,
  NavComponent,
  Permission_DECRYPTED,
  StorageService,
} from '@common';
import { ActivatedRoute } from '@angular/router';

interface HostPermissions {
  host: string;
  permissions: Permission_DECRYPTED[];
}

@Component({
  selector: 'app-permissions',
  imports: [ConfirmComponent, IconButtonComponent],
  templateUrl: './permissions.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './permissions.component.scss',
})
export class PermissionsComponent extends NavComponent implements OnInit {
  identity?: Identity_DECRYPTED;
  hostsPermissions: HostPermissions[] = [];

  readonly #activatedRoute = inject(ActivatedRoute);
  readonly #storage = inject(StorageService);

  ngOnInit(): void {
    const selectedIdentityId =
      this.#activatedRoute.parent?.snapshot.params['id'];
    if (!selectedIdentityId) {
      return;
    }

    this.#initialize(selectedIdentityId);
  }

  async onClickRevokePermission(permission: Permission_DECRYPTED) {
    await this.#storage.deletePermission(permission.id);
    this.#buildHostsPermissions(this.identity?.id);
  }

  onClickClearHost(host: string, confirm: ConfirmComponent): void {
    confirm.show(
      `Do you really want to clear permissions for ${host}?`,
      () => this.#clearHost(host),
    );
  }

  async #clearHost(host: string): Promise<void> {
    const ids =
      this.hostsPermissions
        .find((entry) => entry.host === host)
        ?.permissions.map((permission) => permission.id) ?? [];
    try {
      for (const id of ids) {
        await this.#storage.deletePermission(id);
      }
    } finally {
      this.#buildHostsPermissions(this.identity?.id);
    }
  }

  #initialize(identityId: string) {
    this.identity =
      this.#storage.getBrowserSessionHandler().browserSessionData?.[
        `identity_${identityId}`
      ];

    if (!this.identity) {
      return;
    }

    this.#buildHostsPermissions(identityId);
  }

  #buildHostsPermissions(identityId: string | undefined) {
    if (!identityId) {
      return;
    }

    this.hostsPermissions = [];
    const permissions: Permission_DECRYPTED[] = [];

    const permissionIds =
      this.#storage.getBrowserSessionHandler().browserSessionData
        ?.permissions ?? [];

    for (const permissionId of permissionIds) {
      const permission =
        this.#storage.getBrowserSessionHandler().browserSessionData?.[
          `permission_${permissionId}`
        ];

      if (!permission || permission.identityId !== identityId) {
        continue;
      }
      permissions.push(permission);
    }

    const hostPermissions = permissions
      .sortBy((x) => x.host)
      .groupBy(
        (x) => x.host,
        (y) => y,
      );

    hostPermissions.forEach((permissions, host) => {
      this.hostsPermissions.push({
        host: host,
        permissions: permissions.sortBy((x) => x.method),
      });
    });
  }
}
