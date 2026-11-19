import { Event, finalizeEvent, verifyEvent, VerifiedEvent } from 'nostr-tools';
import { openPlaintext, sealPlaintext } from './blob';
import { BACKUP_KIND } from './event';
import { publishTime } from './manual';
import { BackupKeys } from './phrase';
import { hexToBytes } from './state';
import { sha256 } from '@noble/hashes/sha2';

/**
 * One small record per browser or desktop that opens a backup: its name, what it is, and when
 * it last backed up. A replaceable kind 30078 event with `d` = `gooti-device:<id>`, signed and
 * sealed with the backup keys like the shared record. Settings lists them as "Devices".
 * Gooti Desktop writes and reads the same record (`backup/device.rs`).
 */
export const DEVICE_D_PREFIX = 'gooti-device:';

/** At most this often after a backup, so most backups add no second event. */
export const DEVICE_REFRESH_MS = 60 * 60 * 1000;

const DEVICE_ID = /^[0-9a-f]{32}$/;
const MAX_NAME = 80;

export type DeviceApp = 'browser' | 'desktop';

export interface DeviceRecord {
  id: string;
  name: string;
  app: DeviceApp;
  /** When this device last backed up, in ms. */
  backedUpAt: number;
}

/** "Remove from list": the device shows up again when it backs up. */
export interface RemovedDevice {
  id: string;
  removedAt: number;
}

export interface DeviceRelayIO {
  publish(relays: readonly string[], event: Event): Promise<readonly string[]>;
  /** Every device event of this author. A relay that cannot be reached is left out. */
  fetchDeviceEvents(relays: readonly string[], pubkey: string): Promise<Event[]>;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * "K7F-2QX": the first 30 bits of SHA-256 over the 32-byte public key, in Crockford base32. Gooti
 * Desktop shows the same code (`bunker::state::browser_code`), so a lost browser can be told from
 * the ones you still have.
 */
export function browserCode(pubkeyHex: string): string {
  const hash = sha256(hexToBytes(pubkeyHex));
  const bits = (((hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3]) >>> 2) >>> 0;
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CROCKFORD[(bits >>> (25 - i * 5)) & 31];
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function newDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID.test(value);
}

/** "Firefox on Linux", from the user agent. Each device can rename itself. */
export function defaultBrowserDeviceName(userAgent: string): string {
  const browser = /Firefox\//.test(userAgent)
    ? 'Firefox'
    : /Edg\//.test(userAgent)
      ? 'Edge'
      : /OPR\//.test(userAgent)
        ? 'Opera'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : 'Browser';
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /CrOS/.test(userAgent)
          ? 'ChromeOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return system ? `${browser} on ${system}` : browser;
}

/** Trimmed, at most 80 characters. Empty is refused. */
export function normalizeDeviceName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new Error('Enter a name.');
  }
  return [...trimmed].slice(0, MAX_NAME).join('');
}

export function deviceTag(id: string): string {
  return `${DEVICE_D_PREFIX}${id}`;
}

export async function sealDeviceRecord(
  record: DeviceRecord | RemovedDevice,
  encryptionKey: Uint8Array,
): Promise<string> {
  return sealPlaintext(encode({ v: 1, device: record }), encryptionKey);
}

/** Null when the record cannot be opened or read. A removed device is returned as such. */
export async function openDeviceRecord(
  payload: string,
  encryptionKey: Uint8Array,
): Promise<DeviceRecord | RemovedDevice | null> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(await openPlaintext(payload, encryptionKey)));
  } catch {
    return null;
  }
  return readDevice(value);
}

export function readDevice(value: unknown): DeviceRecord | RemovedDevice | null {
  if (!isRecord(value) || value['v'] !== 1 || !isRecord(value['device'])) {
    return null;
  }
  const device = value['device'];
  if (!isDeviceId(device['id'])) {
    return null;
  }
  if (device['removedAt'] !== undefined) {
    return isTime(device['removedAt']) ? { id: device['id'], removedAt: device['removedAt'] } : null;
  }
  const name = device['name'];
  const app = device['app'];
  if (typeof name !== 'string' || name.trim().length === 0 || [...name].length > MAX_NAME) {
    return null;
  }
  if ((app !== 'browser' && app !== 'desktop') || !isTime(device['backedUpAt'])) {
    return null;
  }
  return { id: device['id'], name, app, backedUpAt: device['backedUpAt'] };
}

export function buildDeviceEvent(
  signingKey: Uint8Array,
  id: string,
  payload: string,
  createdAt = Math.floor(Date.now() / 1000),
): VerifiedEvent {
  return finalizeEvent(
    { kind: BACKUP_KIND, created_at: createdAt, tags: [['d', deviceTag(id)]], content: payload },
    signingKey,
  );
}

/** The device id and payload, after the signature, kind, author and d tag check out. */
export function readDeviceEvent(event: Event, pubkey: string): { id: string; payload: string } | null {
  const checked: Event = {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  };
  const tags = checked.tags.filter((tag) => tag[0] === 'd');
  const tag = tags.length === 1 ? tags[0][1] : undefined;
  if (typeof tag !== 'string' || !tag.startsWith(DEVICE_D_PREFIX)) {
    return null;
  }
  const id = tag.slice(DEVICE_D_PREFIX.length);
  if (!isDeviceId(id) || checked.kind !== BACKUP_KIND || checked.pubkey !== pubkey || !verifyEvent(checked)) {
    return null;
  }
  return { id, payload: checked.content };
}

/**
 * The devices on the relays, newest record per device, by name. A removed device and a record
 * whose id does not match its tag are left out.
 */
export async function devicesFromEvents(
  events: readonly Event[],
  keys: BackupKeys,
): Promise<DeviceRecord[]> {
  const newest = new Map<string, Event>();
  for (const event of events) {
    const read = readDeviceEvent(event, keys.pubkey);
    if (!read) {
      continue;
    }
    const known = newest.get(read.id);
    if (!known || event.created_at > known.created_at) {
      newest.set(read.id, event);
    }
  }
  const devices: DeviceRecord[] = [];
  for (const [id, event] of newest) {
    const record = await openDeviceRecord(event.content, keys.encryptionKey);
    if (!record || record.id !== id || 'removedAt' in record) {
      continue;
    }
    devices.push(record);
  }
  return devices.sort((a, b) => b.backedUpAt - a.backedUpAt || a.name.localeCompare(b.name));
}

export async function fetchDevices(
  keys: BackupKeys,
  relays: readonly string[],
  io: DeviceRelayIO,
): Promise<DeviceRecord[]> {
  if (relays.length === 0) {
    throw new Error('Add a relay first.');
  }
  return devicesFromEvents(await io.fetchDeviceEvents(relays, keys.pubkey), keys);
}

/**
 * A device record is replaceable: of two in the same second, relays keep only one. Pass the
 * `created_at` of the record it replaces as `after`, so the new one is always later.
 */
export async function publishDeviceRecord(
  record: DeviceRecord | RemovedDevice,
  keys: BackupKeys,
  relays: readonly string[],
  io: Pick<DeviceRelayIO, 'publish'>,
  after: number | null = null,
): Promise<void> {
  const payload = await sealDeviceRecord(record, keys.encryptionKey);
  await io.publish(relays, buildDeviceEvent(keys.signingKey, record.id, payload, publishTime(after)));
}

/** "Remove from list": later than that device's newest record on the relays. */
export async function removeDevice(
  id: string,
  keys: BackupKeys,
  relays: readonly string[],
  io: DeviceRelayIO,
  now = Date.now(),
): Promise<void> {
  const events = await io.fetchDeviceEvents(relays, keys.pubkey);
  const times = events
    .filter((event) => readDeviceEvent(event, keys.pubkey)?.id === id)
    .map((event) => event.created_at);
  const newest = times.length > 0 ? Math.max(...times) : null;
  await publishDeviceRecord({ id, removedAt: now }, keys, relays, io, newest);
}

function encode(value: unknown): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  return copy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
