import {
  CryptoHelper,
  Relay_DECRYPTED,
  Relay_ENCRYPTED,
  StorageService,
} from '@common';

export const addRelay = async function (
  this: StorageService,
  data: {
    identityId: string;
    url: string;
    write: boolean;
    read: boolean;
  }
): Promise<void> {
  this.assureIsInitialized();

  // Check, if a relay with the same URL already exists for the identity.
  const existingRelay =
    this.getBrowserSessionHandler().browserSessionData?.relays.find(
      (x) =>
        x.url.toLowerCase() === data.url.toLowerCase() &&
        x.identityId === data.identityId
    );
  if (existingRelay) {
    throw new Error('A relay with the same URL already exists.');
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  if (!browserSessionData) {
    throw new Error('Browser session data is undefined.');
  }

  const decryptedRelay: Relay_DECRYPTED = {
    id: CryptoHelper.v4(),
    identityId: data.identityId,
    url: data.url,
    write: data.write,
    read: data.read,
  };

  // Add the new relay to the session data.
  browserSessionData.relays.push(decryptedRelay);
  this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Encrypt the new relay and add it to the sync data.
  const encryptedRelay = await encryptRelay.call(this, decryptedRelay);
  const encryptedRelays = [
    ...(this.getBrowserSyncHandler().browserSyncData?.relays ?? []),
    encryptedRelay,
  ];
  await this.getBrowserSyncHandler().saveAndSetPartialData_Relays({
    relays: encryptedRelays,
  });
};

export const deleteRelay = async function (
  this: StorageService,
  relayId: string
): Promise<void> {
  this.assureIsInitialized();

  if (!relayId) {
    return;
  }

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  browserSessionData.relays = browserSessionData.relays.filter(
    (x) => x.id !== relayId
  );
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Handle Sync data.
  const encryptedRelayId = await this.encrypt(relayId);
  await this.getBrowserSyncHandler().saveAndSetPartialData_Relays({
    relays: browserSyncData.relays.filter((x) => x.id !== encryptedRelayId),
  });
};

export const updateRelay = async function (
  this: StorageService,
  relayClone: Relay_DECRYPTED
): Promise<void> {
  this.assureIsInitialized();

  const browserSessionData = this.getBrowserSessionHandler().browserSessionData;
  const browserSyncData = this.getBrowserSyncHandler().browserSyncData;
  if (!browserSessionData || !browserSyncData) {
    throw new Error('Browser session or sync data is undefined.');
  }

  const sessionRelay = browserSessionData.relays.find(
    (x) => x.id === relayClone.id
  );
  const encryptedRelayId = await this.encrypt(relayClone.id);
  const syncRelay = browserSyncData.relays.find(
    (x) => x.id === encryptedRelayId
  );
  if (!sessionRelay || !syncRelay) {
    throw new Error(
      'Relay not found in browser session or sync data for update.'
    );
  }

  // Handle Session update.
  sessionRelay.read = relayClone.read;
  sessionRelay.write = relayClone.write;
  sessionRelay.url = relayClone.url;
  await this.getBrowserSessionHandler().saveFullData(browserSessionData);

  // Handle Sync update.
  syncRelay.read = await this.encrypt(relayClone.read.toString());
  syncRelay.write = await this.encrypt(relayClone.write.toString());
  syncRelay.url = await this.encrypt(relayClone.url);
  await this.getBrowserSyncHandler().saveAndSetPartialData_Relays({
    relays: browserSyncData.relays,
  });
};

export const decryptRelay = async function (
  this: StorageService,
  relay: Relay_ENCRYPTED,
  withLockedVault: { iv: string; password: string } | undefined = undefined
): Promise<Relay_DECRYPTED> {
  if (typeof withLockedVault === 'undefined') {
    const decryptedRelay: Relay_DECRYPTED = {
      id: await this.decrypt(relay.id, 'string'),
      identityId: await this.decrypt(relay.identityId, 'string'),
      url: await this.decrypt(relay.url, 'string'),
      read: await this.decrypt(relay.read, 'boolean'),
      write: await this.decrypt(relay.write, 'boolean'),
    };
    return decryptedRelay;
  }

  const decryptedRelay: Relay_DECRYPTED = {
    id: await this.decryptWithLockedVault(
      relay.id,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
    identityId: await this.decryptWithLockedVault(
      relay.identityId,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
    url: await this.decryptWithLockedVault(
      relay.url,
      'string',
      withLockedVault.iv,
      withLockedVault.password
    ),
    read: await this.decryptWithLockedVault(
      relay.read,
      'boolean',
      withLockedVault.iv,
      withLockedVault.password
    ),
    write: await this.decryptWithLockedVault(
      relay.write,
      'boolean',
      withLockedVault.iv,
      withLockedVault.password
    ),
  };
  return decryptedRelay;
};

export const decryptRelays = async function (
  this: StorageService,
  relays: Relay_ENCRYPTED[],
  withLockedVault: { iv: string; password: string } | undefined = undefined
): Promise<Relay_DECRYPTED[]> {
  const decryptedRelays: Relay_DECRYPTED[] = [];

  for (const relay of relays) {
    const decryptedRelay = await decryptRelay.call(
      this,
      relay,
      withLockedVault
    );
    decryptedRelays.push(decryptedRelay);
  }

  return decryptedRelays;
};

export const encryptRelay = async function (
  this: StorageService,
  relay: Relay_DECRYPTED
): Promise<Relay_ENCRYPTED> {
  const encryptedRelay: Relay_ENCRYPTED = {
    id: await this.encrypt(relay.id),
    identityId: await this.encrypt(relay.identityId),
    url: await this.encrypt(relay.url),
    read: await this.encrypt(relay.read.toString()),
    write: await this.encrypt(relay.write.toString()),
  };

  return encryptedRelay;
};
