import {
  BrowserSessionData,
  BrowserSyncData,
  CryptoHelper,
  Identity_ENCRYPTED,
  Permission_ENCRYPTED,
  StorageService,
} from '@common';
import { decryptIdentities } from './identity';
import { decryptPermissions } from './permission';
import { decryptRelays } from './relay';

export const createNewVault = async function (
  this: StorageService,
  password: string,
): Promise<void> {
  this.assureIsInitialized();

  const vaultHash = await CryptoHelper.hash(password);

  const sessionData: BrowserSessionData = {
    iv: CryptoHelper.generateIV(),
    vaultPassword: password,
    identities: [],
    permissions: [],
    relays: [],
    selectedIdentityId: null,
  };

  await this.getBrowserSessionHandler().saveFullData(sessionData);
  this.getBrowserSessionHandler().setFullData(sessionData);

  const syncData: BrowserSyncData = {
    version: this.latestVersion,
    iv: sessionData.iv,
    vaultHash,
    identities: [],
    permissions: [],
    relays: [],
    selectedIdentityId: null,
  };
  await this.getBrowserSyncHandler().saveAndSetFullData(syncData);
};

export const unlockVault = async function (
  this: StorageService,
  password: string,
): Promise<void> {
  this.assureIsInitialized();

  let browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (browserSessionData) {
    throw new Error(
      'Browser session data is available. Should only happen when the vault is unlocked',
    );
  }

  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSyncData) {
    throw new Error(
      'Browser sync data is not available. Should have been loaded before.',
    );
  }

  const passwordHash = await CryptoHelper.hash(password);
  if (passwordHash !== browserSyncData.vaultHash) {
    throw new Error('Invalid password.');
  }

  // Ok. Everything is fine. We can unlock the vault now.

  // Decrypt the identities.
  const withLockedVault = {
    iv: browserSyncData.iv,
    password,
  };

  const encryptedIdentityIds = browserSyncData.identities;
  const encryptedIdentities: Identity_ENCRYPTED[] = [];
  for (const identityId of encryptedIdentityIds) {
    const encryptedIdentity = browserSyncData[`identity_${identityId}`];
    if (encryptedIdentity) {
      encryptedIdentities.push(encryptedIdentity);
    }
  }

  const decryptedIdentities = await decryptIdentities.call(
    this,
    encryptedIdentities,
    withLockedVault,
  );

  const encryptedPermissionIds = browserSyncData.permissions;
  const encryptedPermissions: Permission_ENCRYPTED[] = [];
  for (const permissionId of encryptedPermissionIds) {
    const encryptedPermission = browserSyncData[`permission_${permissionId}`];
    if (encryptedPermission) {
      encryptedPermissions.push(encryptedPermission);
    }
  }

  const decryptedPermissions = await decryptPermissions.call(
    this,
    encryptedPermissions,
    withLockedVault,
  );
  const decryptedRelays = await decryptRelays.call(
    this,
    browserSyncData.relays,
    withLockedVault,
  );
  const decryptedSelectedIdentityId =
    browserSyncData.selectedIdentityId === null
      ? null
      : await this.decryptWithLockedVault(
          browserSyncData.selectedIdentityId,
          'string',
          browserSyncData.iv,
          password,
        );

  browserSessionData = {
    vaultPassword: password,
    iv: browserSyncData.iv,
    permissions: decryptedPermissions.map((x) => x.id),
    identities: decryptedIdentities.map((x) => x.id),
    selectedIdentityId: decryptedSelectedIdentityId,
    relays: decryptedRelays,
  };
  // Add identity properties
  decryptedIdentities.forEach((x) => {
    browserSessionData![`identity_${x.id}`] = x;
  });
  // Add permission properties
  decryptedPermissions.forEach((x) => {
    browserSessionData![`permission_${x.id}`] = x;
  });

  await this.getBrowserSessionHandler().saveFullData(browserSessionData);
  this.getBrowserSessionHandler().setFullData(browserSessionData);
};

export const deleteVault = async function (
  this: StorageService,
  doNotSetIsInitializedToFalse: boolean,
): Promise<void> {
  this.assureIsInitialized();
  const syncFlow = this.getGootiMetaHandler().gootiMetaData?.syncFlow;
  if (typeof syncFlow === 'undefined') {
    throw new Error('Sync flow is not set.');
  }

  await this.getBrowserSyncHandler().clearData();
  await this.getBrowserSessionHandler().clearData();

  if (!doNotSetIsInitializedToFalse) {
    this.isInitialized = false;
  }
};
