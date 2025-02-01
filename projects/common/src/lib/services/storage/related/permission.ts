import {
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
  StorageService,
} from '@common';

export const deletePermission = async function (
  this: StorageService,
  permissionId: string
): Promise<void> {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  browserSessionData.permissions = browserSessionData.permissions.filter(
    (x) => x.id !== permissionId
  );
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  const encryptedPermissionId = await this.encrypt(permissionId);
  await this.getBrowserSyncHandler().saveAndSetPartialData_Permissions({
    permissions: browserSyncData.permissions.filter(
      (x) => x.id !== encryptedPermissionId
    ),
  });
};

export const decryptPermission = async function (
  this: StorageService,
  permission: Permission_ENCRYPTED,
  withLockedVault: { iv: string; password: string } | undefined = undefined
): Promise<Permission_DECRYPTED> {
  if (typeof withLockedVault === 'undefined') {
    const decryptedPermission: Permission_DECRYPTED = {
      id: await this.decrypt(permission.id, 'string'),
      identityId: await this.decrypt(permission.identityId, 'string'),
      method: await this.decrypt(permission.method, 'string'),
      methodPolicy: await this.decrypt(permission.methodPolicy, 'string'),
      host: await this.decrypt(permission.host, 'string'),
    };
    if (permission.kind) {
      decryptedPermission.kind = await this.decrypt(permission.kind, 'number');
    }
    return decryptedPermission;
  }

  const decryptedPermission: Permission_DECRYPTED = {
    id: await this.decryptWithLockedVault(
      permission.id,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
    identityId: await this.decryptWithLockedVault(
      permission.identityId,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
    method: await this.decryptWithLockedVault(
      permission.method,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
    methodPolicy: await this.decryptWithLockedVault(
      permission.methodPolicy,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
    host: await this.decryptWithLockedVault(
      permission.host,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
  };
  if (permission.kind) {
    decryptedPermission.kind = await this.decryptWithLockedVault(
      permission.kind,
      'number',
      withLockedVault.iv,
      withLockedVault.password
    );
  }
  return decryptedPermission;
};

export const decryptPermissions = async function (
  this: StorageService,
  permissions: Permission_ENCRYPTED[],
  withLockedVault: { iv: string; password: string } | undefined = undefined
): Promise<Permission_DECRYPTED[]> {
  const decryptedPermissions: Permission_DECRYPTED[] = [];

  for (const permission of permissions) {
    const decryptedPermission = await decryptPermission.call(
      this,
      permission,
      withLockedVault
    );
    decryptedPermissions.push(decryptedPermission);
  }

  return decryptedPermissions;
};
