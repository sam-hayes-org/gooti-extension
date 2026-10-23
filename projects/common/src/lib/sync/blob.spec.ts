import { Buffer } from 'buffer';
import { getPublicKey } from 'nostr-tools';
import { openSyncDocument, sealSyncDocument } from './blob';
import { SyncDocument } from './document';
import { deriveSyncKeys } from './phrase';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const OTHER =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

const PRIVKEY = 'ab'.repeat(32);

function document(): SyncDocument {
  return {
    v: 2,
    identities: [
      {
        pubkey: getPublicKey(hexToBytes(PRIVKEY)),
        privkey: PRIVKEY,
        nick: 'ada',
        createdAt: '2026-10-23T00:00:00.000Z',
        updatedAt: 1,
      },
    ],
    permissions: [],
    relays: [],
    sites: [],
  };
}

describe('sync blob', () => {
  it('opens a sealed document and seals it differently the next time', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const first = await sealSyncDocument(document(), keys.encryptionKey);
    const second = await sealSyncDocument(document(), keys.encryptionKey);

    expect(first).not.toBe(second);
    expect(await openSyncDocument(first, keys.encryptionKey)).toEqual(document());
    expect(Buffer.from(first, 'base64').includes(Buffer.from(PRIVKEY))).toBeFalse();
  });

  it('rejects a different key', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const other = await deriveSyncKeys(OTHER);
    const payload = await sealSyncDocument(document(), keys.encryptionKey);

    let rejected = false;
    try {
      await openSyncDocument(payload, other.encryptionKey);
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid sync blob.';
    }
    expect(rejected).toBeTrue();
  });

  it('rejects a flipped ciphertext byte', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const payload = await sealSyncDocument(document(), keys.encryptionKey);
    const packed = Buffer.from(payload, 'base64');
    packed[packed.length - 1] ^= 0xff;

    let rejected = false;
    try {
      await openSyncDocument(packed.toString('base64'), keys.encryptionKey);
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid sync blob.';
    }
    expect(rejected).toBeTrue();
  });
});
