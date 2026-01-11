import {
  CryptoHelper,
  Identity_DECRYPTED,
  Identity_ENCRYPTED,
  NostrHelper,
  StorageService,
} from '@common';

export const editNick = async function (
  this: StorageService,
  identityId: string,
  newNick: string,
) {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  const browserSessionDataIdentity =
    browserSessionData[`identity_${identityId}`];
  if (!browserSessionDataIdentity) {
    throw new Error('Identity not found in browser session data.');
  }
  browserSessionDataIdentity.nick = newNick;
  this.getBrowserSessionHandler().saveFullData(browserSessionData);

  const encryptedIdentity = await encryptIdentity.call(
    this,
    browserSessionDataIdentity,
  );
  // Find the encrypted identity in sync data, update and store it.
  const browserSyncDataIdentity =
    browserSyncData[`identity_${encryptedIdentity.id}`];
  if (!browserSyncDataIdentity) {
    throw new Error('Identity not found in browser sync data.');
  }
  browserSyncDataIdentity.nick = encryptedIdentity.nick;
  await this.getBrowserSyncHandler().saveAndSetPartialData_Identities({
    identities: browserSyncData.identities,
  });
};

export const addIdentity = async function (
  this: StorageService,
  data: {
    nick: string;
    privkeyString: string;
  },
): Promise<void> {
  this.assureIsInitialized();

  const privkey = NostrHelper.getNostrPrivkeyObject(
    data.privkeyString.toLowerCase(),
  ).hex;

  // Check if an identity with the same privkey already exists.
  // Get all identityIds
  const identityIds =
    this.getBrowserSessionHandler().browserSessionData?.identities ?? [];
  identityIds.forEach((identityId) => {
    const identity =
      this.getBrowserSessionHandler().browserSessionData?.[
        `identity_${identityId}`
      ];
    if (identity?.privkey === privkey) {
      throw new Error(
        `An identity with the same private key already exists: ${identity.nick}`,
      );
    }
  });

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (!browserSessionData) {
    throw new Error('Browser session data is undefined.');
  }

  const decryptedIdentity: Identity_DECRYPTED = {
    id: CryptoHelper.v4(),
    nick: data.nick,
    privkey,
    createdAt: new Date().toISOString(),
  };

  // Add the new identity to the session data.
  browserSessionData.identities.push(decryptedIdentity.id);
  let isFirstIdentity = false;
  if (browserSessionData.identities.length === 1) {
    isFirstIdentity = true;
    browserSessionData.selectedIdentityId = decryptedIdentity.id;
  }
  browserSessionData[`identity_${decryptedIdentity.id}`] = decryptedIdentity;
  this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Encrypt the new identity and add it to the sync data.
  const encryptedIdentity = await encryptIdentity.call(this, decryptedIdentity);
  const encryptedIdentities = [
    ...(this.getBrowserSyncHandler().browserSyncData?.identities ?? []),
    encryptedIdentity.id,
  ];

  await this.getBrowserSyncHandler().saveAndSetPartialData_Identities({
    identities: encryptedIdentities,
  });
  await this.getBrowserSyncHandler().saveAndSetPartialData_Identity({
    identity: encryptedIdentity,
  });

  if (isFirstIdentity) {
    await this.getBrowserSyncHandler().saveAndSetPartialData_SelectedIdentityId(
      {
        selectedIdentityId: encryptedIdentity.id,
      },
    );
  }
};

export const deleteIdentity = async function (
  this: StorageService,
  identityId: string | undefined,
): Promise<void> {
  this.assureIsInitialized();

  if (!identityId) {
    return;
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  browserSessionData.identities = browserSessionData.identities.filter(
    (x) => x !== identityId,
  );

  // Find permissions to delete.
  const toBeDeletedPermissionIds: string[] = [];
  browserSessionData.permissions.forEach((permissionId) => {
    const permission = browserSessionData[`permission_${permissionId}`];
    if (permission?.identityId === identityId) {
      toBeDeletedPermissionIds.push(permissionId);
    }
  });

  browserSessionData.permissions = browserSessionData.permissions.filter(
    (x) => !toBeDeletedPermissionIds.includes(x),
  );
  toBeDeletedPermissionIds.forEach((permissionId) => {
    delete browserSessionData[`permission_${permissionId}`];
  });

  browserSessionData.relays = browserSessionData.relays.filter(
    (x) => x.identityId !== identityId,
  );
  if (browserSessionData.selectedIdentityId === identityId) {
    // Choose another identity to be selected or null if there is none.
    browserSessionData.selectedIdentityId =
      browserSessionData.identities.length > 0
        ? browserSessionData.identities[0]
        : null;
  }
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // UPDATE Sync Data.

  // Handle the identity
  const encryptedIdentityId = await this.encrypt(identityId);
  await this.getBrowserSyncHandler().saveAndSetPartialData_Identities({
    identities: browserSyncData.identities.filter(
      (x) => x !== encryptedIdentityId,
    ),
  });
  await this.getBrowserSyncHandler().deleteSaveAndUnsetPartialData_Identity({
    identityId: encryptedIdentityId,
  });

  // Handle the permissions
  const toBeDeletedEncryptedPermissionIds: string[] = [];
  browserSyncData.permissions.forEach((encryptedPermissionId) => {
    const encryptedPermission =
      browserSyncData[`permission_${encryptedPermissionId}`];
    if (encryptedPermission?.identityId === encryptedIdentityId) {
      toBeDeletedEncryptedPermissionIds.push(encryptedPermissionId);
    }
  });
  await this.getBrowserSyncHandler().saveAndSetPartialData_Permissions({
    permissions: browserSyncData.permissions.filter(
      (x) => !toBeDeletedEncryptedPermissionIds.includes(x),
    ),
  });
  for (const encryptedPermissionId of toBeDeletedEncryptedPermissionIds) {
    await this.getBrowserSyncHandler().deleteSaveAndUnsetPartialData_Permission(
      {
        permissionId: encryptedPermissionId,
      },
    );
  }

  // Handle the relays
  await this.getBrowserSyncHandler().saveAndSetPartialData_Relays({
    relays: browserSyncData.relays.filter(
      (x) => x.identityId !== encryptedIdentityId,
    ),
  });

  // Handle the selected identity id
  await this.getBrowserSyncHandler().saveAndSetPartialData_SelectedIdentityId({
    selectedIdentityId:
      browserSessionData.selectedIdentityId === null
        ? null
        : await this.encrypt(browserSessionData.selectedIdentityId),
  });
};

export const switchIdentity = async function (
  this: StorageService,
  identityId: string | null,
): Promise<void> {
  this.assureIsInitialized();

  // Check, if the identity really exists.
  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;

  if (!browserSessionData?.identities.find((x) => x === identityId)) {
    return;
  }

  browserSessionData.selectedIdentityId = identityId;
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  const encryptedIdentityId =
    identityId === null ? null : await this.encrypt(identityId);
  await this.getBrowserSyncHandler().saveAndSetPartialData_SelectedIdentityId({
    selectedIdentityId: encryptedIdentityId,
  });
};

export const encryptIdentity = async function (
  this: StorageService,
  identity: Identity_DECRYPTED,
): Promise<Identity_ENCRYPTED> {
  const encryptedIdentity: Identity_ENCRYPTED = {
    id: await this.encrypt(identity.id),
    nick: await this.encrypt(identity.nick),
    createdAt: await this.encrypt(identity.createdAt),
    privkey: await this.encrypt(identity.privkey),
  };

  return encryptedIdentity;
};

export const decryptIdentities = async function (
  this: StorageService,
  identities: Identity_ENCRYPTED[],
  withLockedVault: { iv: string; password: string } | undefined = undefined,
): Promise<Identity_DECRYPTED[]> {
  const decryptedIdentities: Identity_DECRYPTED[] = [];

  for (const identity of identities) {
    const decryptedIdentity = await decryptIdentity.call(
      this,
      identity,
      withLockedVault,
    );
    decryptedIdentities.push(decryptedIdentity);
  }

  return decryptedIdentities;
};

export const decryptIdentity = async function (
  this: StorageService,
  identity: Identity_ENCRYPTED,
  withLockedVault: { iv: string; password: string } | undefined = undefined,
): Promise<Identity_DECRYPTED> {
  if (typeof withLockedVault === 'undefined') {
    const decryptedIdentity: Identity_DECRYPTED = {
      id: await this.decrypt(identity.id, 'string'),
      nick: await this.decrypt(identity.nick, 'string'),
      createdAt: await this.decrypt(identity.createdAt, 'string'),
      privkey: await this.decrypt(identity.privkey, 'string'),
    };

    return decryptedIdentity;
  }

  const decryptedIdentity: Identity_DECRYPTED = {
    id: await this.decryptWithLockedVault(
      identity.id,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
    nick: await this.decryptWithLockedVault(
      identity.nick,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
    createdAt: await this.decryptWithLockedVault(
      identity.createdAt,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
    privkey: await this.decryptWithLockedVault(
      identity.privkey,
      'string',
      withLockedVault.iv,
      withLockedVault.password,
    ),
  };

  return decryptedIdentity;
};
