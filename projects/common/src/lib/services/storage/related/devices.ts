import type { StorageService } from '../storage.service';
import { BrowserSessionData, Identity_DECRYPTED } from '../types';
import { Event, generateSecretKey } from 'nostr-tools';
import { bytesToHex } from '../../../backup/state';
import {
  DEVICE_REFRESH_MS,
  DeviceRecord,
  DeviceRelayIO,
  defaultBrowserDeviceName,
  devicesFromEvents,
  readDeviceEvent,
  fetchDevices,
  isDeviceId,
  newDeviceId,
  normalizeDeviceName,
  publishDeviceRecord,
  removeDevice,
} from '../../../backup/device';
import { backupKeysFromState, BackupState, LocalDevice } from '../../../backup/state';
import { persistBackupSeal } from './seal-backup';

/** "Devices" in Settings: every device with this backup, and which one is this browser. */
export interface DeviceList {
  devices: DeviceRecord[];
  thisId: string;
}

/**
 * Publishes this browser's device record after a backup, at most once an hour unless `force`.
 * `seen` is this browser's device events as the backup read them: when they do not list it
 * (another device removed it from Devices), it is published now. Makes the device id on the
 * first call. A failure leaves the backup result alone.
 */
export const refreshThisDevice = async function (
  this: StorageService,
  io: Pick<DeviceRelayIO, 'publish'>,
  options: { force?: boolean; now?: number; seen?: readonly Event[] } = {},
): Promise<void> {
  const now = options.now ?? Date.now();
  const session = this.getBrowserSessionHandler().browserSessionData;
  const state = session?.backupState;
  if (!session?.vaultPassword || !state) {
    return;
  }
  const device = state.device ?? { id: newDeviceId() };
  const keys = backupKeysFromState(state);
  // The newest record of this browser the backup saw, and whether it lists it.
  const seen = (options.seen ?? []).filter(
    (event) => readDeviceEvent(event, keys.pubkey)?.id === device.id,
  );
  const removed =
    options.seen !== undefined &&
    !(await devicesFromEvents(seen, keys)).some((listed) => listed.id === device.id);
  const due =
    options.force ||
    removed ||
    device.publishedAt === undefined ||
    now - device.publishedAt >= DEVICE_REFRESH_MS;
  if (!due) {
    return;
  }
  // A replaceable event: a record after a rename or a removal must still be the later one.
  const times = seen.map((event) => event.created_at);
  if (device.publishedAt !== undefined) {
    times.push(Math.floor(device.publishedAt / 1000));
  }
  await publishDeviceRecord(
    { id: device.id, name: deviceName(device), app: 'browser', backedUpAt: now },
    keys,
    state.relays,
    io,
    times.length > 0 ? Math.max(...times) : null,
  );
  await saveDevice.call(this, session, { ...device, publishedAt: now });
};

export const listDevices = async function (
  this: StorageService,
  io: DeviceRelayIO,
): Promise<DeviceList> {
  const state = backupState.call(this);
  const device = state.device ?? { id: newDeviceId() };
  if (!state.device) {
    await saveDevice.call(this, unlockedSession.call(this), device);
  }
  const devices = await fetchDevices(backupKeysFromState(state), state.relays, io);
  return { devices, thisId: device.id };
};

/** Renames this browser and publishes the name right away. */
export const renameThisDevice = async function (
  this: StorageService,
  name: string,
  io: Pick<DeviceRelayIO, 'publish'>,
): Promise<void> {
  const normalized = normalizeDeviceName(name);
  const session = unlockedSession.call(this);
  const state = backupState.call(this);
  const device = state.device ?? { id: newDeviceId() };
  await saveDevice.call(this, session, { ...device, name: normalized });
  await refreshThisDevice.call(this, io, { force: true });
};

/** "Remove from list". The device shows up again when it backs up. Not this browser. */
export const removeDeviceFromList = async function (
  this: StorageService,
  id: string,
  io: DeviceRelayIO,
): Promise<void> {
  const state = backupState.call(this);
  if (!isDeviceId(id)) {
    throw new Error('Unknown device.');
  }
  if (state.device?.id === id) {
    throw new Error('This browser cannot remove itself.');
  }
  await removeDevice(id, backupKeysFromState(state), state.relays, io);
};

/**
 * Starts connecting this browser to Gooti Desktop, if a Desktop only identity here does not have
 * this browser's own key allowed yet. Called only right after the user did something in this
 * browser: opened the popup, or entered the passphrase. Makes the key the first time, and a new
 * one after the desktop disconnected the old one.
 */
export const requestDesktopConnect = async function (
  this: StorageService,
  send: (message: unknown) => Promise<unknown>,
  refused: boolean,
): Promise<DesktopConnect> {
  const session = this.getBrowserSessionHandler().browserSessionData;
  if (!session?.vaultPassword || !session.backupState) {
    return 'none';
  }
  const device = session.backupState.device ?? { id: newDeviceId() };
  const allowed = refused ? [] : (device.desktopAllowed ?? []);
  const held = session.identities
    .map((id) => session[`identity_${id}`])
    .filter((identity): identity is Identity_DECRYPTED => !!identity && heldByDesktop(session, identity));
  if (held.length === 0) {
    return 'none';
  }
  if (held.every((identity) => allowed.includes(identity.pubkey))) {
    return 'allowed';
  }
  if (!device.browserKey || refused) {
    await saveDevice.call(this, session, {
      ...device,
      browserKey: bytesToHex(generateSecretKey()),
      desktopAllowed: [],
    });
  }
  await send({ type: 'connect-desktop' });
  return 'asked';
};

/**
 * "Bunker (unlinked)": a bunker identity this browser has no key to reach. One that Gooti Desktop
 * holds signs with this browser's own key instead, once allowed; the pairing note covers the rest.
 */
export function bunkerUnlinked(session: BrowserSessionData | undefined, identity: Identity_DECRYPTED): boolean {
  if (!identity.bunker || identity.bunker.clientSecretKey) {
    return false;
  }
  return !session || !heldByDesktop(session, identity);
}

/** Whether an identity here is held by Gooti Desktop (signs through it). */
export const desktopIdentityHere = function (this: StorageService): boolean {
  const session = this.getBrowserSessionHandler().browserSessionData;
  if (!session) {
    return false;
  }
  return session.identities.some((id) => {
    const identity = session[`identity_${id}`];
    return !!identity && heldByDesktop(session, identity);
  });
};

/**
 * What `requestDesktopConnect` did: no identity here needs Gooti Desktop, every one is allowed
 * already, or it asked.
 */
export type DesktopConnect = 'none' | 'allowed' | 'asked';

/** Same rule as the background's `heldByGootiDesktop`, without loading the background here. */
function heldByDesktop(session: BrowserSessionData, identity: Identity_DECRYPTED): boolean {
  if (identity.privkey || !identity.bunker) {
    return false;
  }
  if (identity.bunker.gootiDesktop) {
    return true;
  }
  const row = session.backupState?.document.identities.find(
    (item) => item.pubkey === identity.pubkey && item.deletedAt === undefined,
  );
  return row?.custodyAt !== undefined && row.bunker?.pubkey === identity.bunker.pubkey;
}

export function deviceName(device: LocalDevice): string {
  return device.name ?? defaultBrowserDeviceName(globalThis.navigator?.userAgent ?? '');
}

async function saveDevice(
  this: StorageService,
  session: BrowserSessionData,
  device: LocalDevice,
): Promise<void> {
  if (!session.backupState) {
    return;
  }
  session.backupState = { ...session.backupState, device };
  await persistBackupSeal.call(this, { backUp: false });
}

function backupState(this: StorageService): BackupState {
  const state = unlockedSession.call(this).backupState;
  if (!state) {
    throw new Error('Turn on backup first.');
  }
  return state;
}

function unlockedSession(this: StorageService): BrowserSessionData {
  this.assureIsInitialized();
  const session = this.getBrowserSessionHandler().browserSessionData;
  if (!session?.vaultPassword) {
    throw new Error('Unlock Gooti first.');
  }
  return session;
}
