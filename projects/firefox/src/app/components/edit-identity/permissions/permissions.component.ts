import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IconButtonComponent, Identity_DECRYPTED, NavComponent, Permission_DECRYPTED, StorageService } from '@common';

interface HostPermissions {
  host: string;
  permissions: Permission_DECRYPTED[];
}

@Component({
  selector: 'app-permissions',
  imports: [IconButtonComponent],
  templateUrl: './permissions.component.html',
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

  #initialize(identityId: string) {
    this.identity = this.#storage
      .getBrowserSessionHandler()
      .browserSessionData?.identities.find((x) => x.id === identityId);

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

    const hostPermissions = (
      this.#storage.getBrowserSessionHandler().browserSessionData
        ?.permissions ?? []
    )
      .filter((x) => x.identityId === identityId)
      .sortBy((x) => x.host)
      .groupBy(
        (x) => x.host,
        (y) => y
      );

    hostPermissions.forEach((permissions, host) => {
      this.hostsPermissions.push({
        host: host,
        permissions: permissions.sortBy((x) => x.method),
      });
    });
  }
}
