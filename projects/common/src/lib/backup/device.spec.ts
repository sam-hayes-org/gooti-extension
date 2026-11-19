import { Event } from 'nostr-tools';
import { deriveSharedKeys } from './phrase';
import {
  buildDeviceEvent,
  defaultBrowserDeviceName,
  devicesFromEvents,
  normalizeDeviceName,
  openDeviceRecord,
  readDevice,
  readDeviceEvent,
  sealDeviceRecord,
} from './device';
import { buildBackupEvent } from './event';

const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const ID_A = '0a'.repeat(16);
const ID_B = '0b'.repeat(16);

describe('device records', () => {
  it('seals and opens a record with the backup key only', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const other = await deriveSharedKeys(OTHER);
    const record = { id: ID_A, name: 'Firefox on Linux', app: 'browser' as const, backedUpAt: 1_700_000_000_000 };
    const payload = await sealDeviceRecord(record, keys.encryptionKey);
    expect(await openDeviceRecord(payload, keys.encryptionKey)).toEqual(record);
    expect(await openDeviceRecord(payload, other.encryptionKey)).toBeNull();
  });

  it('reads only well-formed records', () => {
    const ok = { v: 1, device: { id: ID_A, name: 'Desk', app: 'desktop', backedUpAt: 5 } };
    expect(readDevice(ok)).toEqual({ id: ID_A, name: 'Desk', app: 'desktop', backedUpAt: 5 });
    expect(readDevice({ v: 1, device: { id: ID_A, removedAt: 9 } })).toEqual({ id: ID_A, removedAt: 9 });
    for (const bad of [
      { ...ok, v: 2 },
      { v: 1, device: { ...ok.device, id: 'AB'.repeat(16) } },
      { v: 1, device: { ...ok.device, name: ' ' } },
      { v: 1, device: { ...ok.device, name: 'x'.repeat(81) } },
      { v: 1, device: { ...ok.device, app: 'phone' } },
      { v: 1, device: { ...ok.device, backedUpAt: 'today' } },
      { v: 1, device: { id: ID_A, removedAt: 'now' } },
    ]) {
      expect(readDevice(bad)).withContext(JSON.stringify(bad)).toBeNull();
    }
  });

  it('lists the newest record per device and leaves out removed ones and other events', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const other = await deriveSharedKeys(OTHER);
    const event = async (id: string, record: object, at: number, signer = keys): Promise<Event> =>
      buildDeviceEvent(signer.signingKey, id, await sealDeviceRecord(record as never, signer.encryptionKey), at);
    const events = [
      await event(ID_A, { id: ID_A, name: 'Old name', app: 'browser', backedUpAt: 1 }, 100),
      await event(ID_A, { id: ID_A, name: 'Laptop', app: 'browser', backedUpAt: 2 }, 200),
      await event(ID_B, { id: ID_B, name: 'Desk', app: 'desktop', backedUpAt: 3 }, 100),
      await event(ID_B, { id: ID_B, removedAt: 4 }, 300),
      // A record whose id does not match its tag, another author, and the shared record.
      await event(ID_A, { id: ID_B, name: 'Mixed', app: 'browser', backedUpAt: 9 }, 50),
      await event(ID_B, { id: ID_B, name: 'Stranger', app: 'browser', backedUpAt: 9 }, 900, other),
      buildBackupEvent(keys.signingKey, 'payload', 999),
    ];
    const devices = await devicesFromEvents(events, keys);
    expect(devices).toEqual([{ id: ID_A, name: 'Laptop', app: 'browser', backedUpAt: 2 }]);
    expect(readDeviceEvent(events[6], keys.pubkey)).toBeNull();
  });

  it('names a browser from its user agent', () => {
    const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    const edge = `${chrome} Edg/140.0`;
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
    expect(defaultBrowserDeviceName(firefox)).toBe('Firefox on Linux');
    expect(defaultBrowserDeviceName(chrome)).toBe('Chrome on Windows');
    expect(defaultBrowserDeviceName(edge)).toBe('Edge on Windows');
    expect(defaultBrowserDeviceName(mac)).toBe('Chrome on macOS');
    expect(defaultBrowserDeviceName('')).toBe('Browser');
  });

  it('trims a name, keeps it short, and refuses an empty one', () => {
    expect(normalizeDeviceName('  Work   laptop ')).toBe('Work laptop');
    expect([...normalizeDeviceName('é'.repeat(100))].length).toBe(80);
    expect(() => normalizeDeviceName('   ')).toThrowError('Enter a name.');
  });
});
