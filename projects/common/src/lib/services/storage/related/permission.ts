import {
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
  StorageService,
} from '@common';
import { stampPermissionDeleted } from '../../../sync/state';
import { persistNostrSyncSeal } from './seal-nostr-sync';

export const deletePermission = async function (
  this: StorageService,
  permissionId: string,
): Promise<void> {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getVaultHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  const removed = browserSessionData[`permission_${permissionId}`];
  const identity = removed
    ? browserSessionData[`identity_${removed.identityId}`]
    : undefined;
  if (removed && identity && browserSessionData.nostrSync) {
    browserSessionData.nostrSync = stampPermissionDeleted(
      browserSessionData.nostrSync,
      {
        identityPubkey: identity.pubkey,
        host: removed.host,
        method: removed.method,
        methodPolicy: removed.methodPolicy,
        ...(removed.kind !== undefined ? { kind: removed.kind } : {}),
      },
      Date.now(),
    );
    await persistNostrSyncSeal.call(this);
  }

  browserSessionData.permissions = browserSessionData.permissions.filter(
    (x) => x !== permissionId,
  );
  delete browserSessionData[`permission_${permissionId}`];
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Handle Sync data. v3 ciphertext is not deterministic, so match by opening ids.
  const encryptedPermissionId = await this.matchEncryptedId(
    browserSyncData.permissions,
    permissionId,
  );
  if (!encryptedPermissionId) {
    throw new Error('Permission not found in browser sync data.');
  }
  await this.getVaultHandler().saveAndSetPartialData_Permissions({
    permissions: browserSyncData.permissions.filter(
      (x) => x !== encryptedPermissionId,
    ),
  });
  await this.getVaultHandler().deleteSaveAndUnsetPartialData_Permission({
    permissionId: encryptedPermissionId,
  });
};

export const encryptPermission = async function (
  this: StorageService,
  permission: Permission_DECRYPTED,
): Promise<Permission_ENCRYPTED> {
  const encryptedPermission: Permission_ENCRYPTED = {
    id: await this.encrypt(permission.id),
    identityId: await this.encrypt(permission.identityId),
    host: await this.encrypt(permission.host),
    method: await this.encrypt(permission.method),
    methodPolicy: await this.encrypt(permission.methodPolicy),
  };

  if (typeof permission.kind !== 'undefined') {
    encryptedPermission.kind = await this.encrypt(permission.kind.toString());
  }

  return encryptedPermission;
};

export const decryptPermission = async function (
  this: StorageService,
  permission: Permission_ENCRYPTED,
  withLockedVault: { iv: string; password: string } | undefined = undefined,
): Promise<Permission_DECRYPTED> {
  if (typeof withLockedVault === 'undefined') {
    const decryptedPermission: Permission_DECRYPTED = {
      id: await this.decrypt(permission.id, 'string'),
      identityId: await this.decrypt(permission.identityId, 'string'),
      method: await this.decrypt(permission.method, 'string'),
      methodPolicy: await this.decrypt(permission.methodPolicy, 'string'),
      host: await this.decrypt(permission.host, 'string'),
    };
    if (typeof permission.kind !== 'undefined') {
      decryptedPermission.kind = await this.decrypt(permission.kind, 'number');
    }
    return decryptedPermission;
  }

  const decryptedPermission: Permission_DECRYPTED = {
    id: await this.decryptWithLockedVault(
      permission.id,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
    identityId: await this.decryptWithLockedVault(
      permission.identityId,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
    method: await this.decryptWithLockedVault(
      permission.method,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
    methodPolicy: await this.decryptWithLockedVault(
      permission.methodPolicy,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
    host: await this.decryptWithLockedVault(
      permission.host,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
  };
  if (typeof permission.kind !== 'undefined') {
    decryptedPermission.kind = await this.decryptWithLockedVault(
      permission.kind,
      'number',
      withLockedVault.iv,
      withLockedVault.password,
    );
  }
  return decryptedPermission;
};

export const decryptPermissions = async function (
  this: StorageService,
  permissions: Permission_ENCRYPTED[],
  withLockedVault: { iv: string; password: string } | undefined = undefined,
): Promise<Permission_DECRYPTED[]> {
  const decryptedPermissions: Permission_DECRYPTED[] = [];

  for (const permission of permissions) {
    const decryptedPermission = await decryptPermission.call(
      this,
      permission,
      withLockedVault,
    );
    decryptedPermissions.push(decryptedPermission);
  }

  return decryptedPermissions;
};
