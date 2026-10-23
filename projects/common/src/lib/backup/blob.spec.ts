import { Buffer } from 'buffer';
import { getPublicKey } from 'nostr-tools';
import { openSharedDocument, sealSharedDocument, sharedContentChars } from './blob';
import { SharedDocument } from './document';
import { deriveSharedKeys } from './phrase';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const OTHER =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

const PRIVKEY = 'ab'.repeat(32);

function document(): SharedDocument {
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
  it('measures the sealed text the relay stores', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const source = document();
    source.identities[0].nick = 'ädä';
    const payload = await sealSharedDocument(source, keys.encryptionKey);

    expect(sharedContentChars(source)).toBe(payload.length);
    expect(payload.length).toBeLessThan(1_000_000);
  });

  it('opens a sealed document and seals it differently the next time', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const first = await sealSharedDocument(document(), keys.encryptionKey);
    const second = await sealSharedDocument(document(), keys.encryptionKey);

    expect(first).not.toBe(second);
    expect(await openSharedDocument(first, keys.encryptionKey)).toEqual(document());
    expect(Buffer.from(first, 'base64').includes(Buffer.from(PRIVKEY))).toBeFalse();
  });

  it('keeps a site binding in the sealed vault', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const source = document();
    source.sites = [
      {
        host: 'primal.net',
        identityPubkey: source.identities[0].pubkey,
        updatedAt: 4,
      },
    ];

    const opened = await openSharedDocument(
      await sealSharedDocument(source, keys.encryptionKey),
      keys.encryptionKey,
    );

    expect(opened?.sites).toEqual(source.sites);
  });

  it('rejects a different key', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const other = await deriveSharedKeys(OTHER);
    const payload = await sealSharedDocument(document(), keys.encryptionKey);

    let rejected = false;
    try {
      await openSharedDocument(payload, other.encryptionKey);
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid sync blob.';
    }
    expect(rejected).toBeTrue();
  });

  it('rejects a flipped ciphertext byte', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const payload = await sealSharedDocument(document(), keys.encryptionKey);
    const packed = Buffer.from(payload, 'base64');
    packed[packed.length - 1] ^= 0xff;

    let rejected = false;
    try {
      await openSharedDocument(packed.toString('base64'), keys.encryptionKey);
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid sync blob.';
    }
    expect(rejected).toBeTrue();
  });
});
