import {
  BrowserSessionData,
  BrowserSyncData,
  CryptoHelper,
  Identity_DECRYPTED,
  Identity_ENCRYPTED,
  Permission_DECRYPTED,
  Permission_ENCRYPTED,
  StorageService,
  KDF_VERSION_CURRENT,
  KDF_ITERATIONS_V2,
  KDF_SALT_V1,
  KDF_ITERATIONS_V1,
} from '@common';
import { decryptIdentities } from './identity';
import { decryptPermissions } from './permission';
import { decryptRelays } from './relay';

interface LockedVaultParams {
  iv: string;
  password: string;
  kdfSalt: string;
  kdfIterations: number;
}

export const createNewVault = async function (
  this: StorageService,
  password: string,
): Promise<void> {
  this.assureIsInitialized();

  const vaultHash = await CryptoHelper.hash(password);
  const kdfSalt = CryptoHelper.generateSalt();

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
    kdfVersion: KDF_VERSION_CURRENT,
    kdfSalt,
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

  const needsKdfMigration =
    !browserSyncData.kdfVersion ||
    browserSyncData.kdfVersion < KDF_VERSION_CURRENT;

  const currentKdfSalt = browserSyncData.kdfSalt ?? KDF_SALT_V1;
  const currentKdfIterations =
    browserSyncData.kdfVersion === KDF_VERSION_CURRENT
      ? KDF_ITERATIONS_V2
      : KDF_ITERATIONS_V1;

  const withLockedVault: LockedVaultParams = {
    iv: browserSyncData.iv,
    password,
    kdfSalt: currentKdfSalt,
    kdfIterations: currentKdfIterations,
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
          currentKdfSalt,
          currentKdfIterations,
        );

  browserSessionData = {
    vaultPassword: password,
    iv: browserSyncData.iv,
    permissions: decryptedPermissions.map((x) => x.id),
    identities: decryptedIdentities.map((x) => x.id),
    selectedIdentityId: decryptedSelectedIdentityId,
    relays: decryptedRelays,
  };
  decryptedIdentities.forEach((x) => {
    browserSessionData![`identity_${x.id}`] = x;
  });
  decryptedPermissions.forEach((x) => {
    browserSessionData![`permission_${x.id}`] = x;
  });

  await this.getBrowserSessionHandler().saveFullData(browserSessionData);
  this.getBrowserSessionHandler().setFullData(browserSessionData);

  if (needsKdfMigration) {
    await migrateKdf.call(
      this,
      decryptedIdentities,
      decryptedPermissions,
      decryptedRelays,
      decryptedSelectedIdentityId,
      password,
    );
  }
};

const migrateKdf = async function (
  this: StorageService,
  decryptedIdentities: Identity_DECRYPTED[],
  decryptedPermissions: Permission_DECRYPTED[],
  decryptedRelays: {
    id: string;
    identityId: string;
    url: string;
    read: boolean;
    write: boolean;
  }[],
  decryptedSelectedIdentityId: string | null,
  password: string,
): Promise<void> {
  const newKdfSalt = CryptoHelper.generateSalt();
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSyncData) {
    return;
  }

  const newEncryptedIdentities: Identity_ENCRYPTED[] = [];
  for (const identity of decryptedIdentities) {
    const encrypted = await encryptIdentityWithKdf.call(
      this,
      identity,
      browserSyncData.iv,
      password,
      newKdfSalt,
      KDF_ITERATIONS_V2,
    );
    newEncryptedIdentities.push(encrypted);
  }

  const newEncryptedPermissions: Permission_ENCRYPTED[] = [];
  for (const permission of decryptedPermissions) {
    const encrypted = await encryptPermissionWithKdf.call(
      this,
      permission,
      browserSyncData.iv,
      password,
      newKdfSalt,
      KDF_ITERATIONS_V2,
    );
    newEncryptedPermissions.push(encrypted);
  }

  const newEncryptedRelays: {
    id: string;
    identityId: string;
    url: string;
    read: string;
    write: string;
  }[] = [];
  for (const relay of decryptedRelays) {
    const encrypted = await encryptRelayWithKdf.call(
      this,
      relay,
      browserSyncData.iv,
      password,
      newKdfSalt,
      KDF_ITERATIONS_V2,
    );
    newEncryptedRelays.push(encrypted);
  }

  const newEncryptedSelectedIdentityId =
    decryptedSelectedIdentityId === null
      ? null
      : await CryptoHelper.encrypt(
          decryptedSelectedIdentityId,
          browserSyncData.iv,
          password,
          newKdfSalt,
          KDF_ITERATIONS_V2,
        );

  const migratedSyncData: BrowserSyncData = {
    ...browserSyncData,
    kdfVersion: KDF_VERSION_CURRENT,
    kdfSalt: newKdfSalt,
    identities: newEncryptedIdentities.map((x) => x.id),
    permissions: newEncryptedPermissions.map((x) => x.id),
    relays: newEncryptedRelays,
    selectedIdentityId: newEncryptedSelectedIdentityId,
  };

  newEncryptedIdentities.forEach((x) => {
    migratedSyncData[`identity_${x.id}`] = x;
  });
  newEncryptedPermissions.forEach((x) => {
    migratedSyncData[`permission_${x.id}`] = x;
  });

  await this.getBrowserSyncHandler().saveAndSetFullData(migratedSyncData);
};

const encryptIdentityWithKdf = async function (
  this: StorageService,
  identity: Identity_DECRYPTED,
  iv: string,
  password: string,
  kdfSalt: string,
  kdfIterations: number,
): Promise<Identity_ENCRYPTED> {
  const encryptedIdentity: Identity_ENCRYPTED = {
    id: await CryptoHelper.encrypt(
      identity.id,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    nick: await CryptoHelper.encrypt(
      identity.nick,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    createdAt: await CryptoHelper.encrypt(
      identity.createdAt,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    privkey: await CryptoHelper.encrypt(
      identity.privkey,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
  };
  return encryptedIdentity;
};

const encryptPermissionWithKdf = async function (
  this: StorageService,
  permission: Permission_DECRYPTED,
  iv: string,
  password: string,
  kdfSalt: string,
  kdfIterations: number,
): Promise<Permission_ENCRYPTED> {
  const encryptedPermission: Permission_ENCRYPTED = {
    id: await CryptoHelper.encrypt(
      permission.id,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    identityId: await CryptoHelper.encrypt(
      permission.identityId,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    host: await CryptoHelper.encrypt(
      permission.host,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    method: await CryptoHelper.encrypt(
      permission.method,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    methodPolicy: await CryptoHelper.encrypt(
      permission.methodPolicy,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
  };
  if (typeof permission.kind !== 'undefined') {
    encryptedPermission.kind = await CryptoHelper.encrypt(
      permission.kind.toString(),
      iv,
      password,
      kdfSalt,
      kdfIterations,
    );
  }
  return encryptedPermission;
};

const encryptRelayWithKdf = async function (
  this: StorageService,
  relay: {
    id: string;
    identityId: string;
    url: string;
    read: boolean;
    write: boolean;
  },
  iv: string,
  password: string,
  kdfSalt: string,
  kdfIterations: number,
): Promise<{
  id: string;
  identityId: string;
  url: string;
  read: string;
  write: string;
}> {
  return {
    id: await CryptoHelper.encrypt(
      relay.id,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    identityId: await CryptoHelper.encrypt(
      relay.identityId,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    url: await CryptoHelper.encrypt(
      relay.url,
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    read: await CryptoHelper.encrypt(
      relay.read.toString(),
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
    write: await CryptoHelper.encrypt(
      relay.write.toString(),
      iv,
      password,
      kdfSalt,
      kdfIterations,
    ),
  };
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
