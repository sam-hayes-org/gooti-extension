import { getPublicKey } from 'nostr-tools';
import { buildBackupEvent, readBackupPayload, SHARED_D_TAG, BACKUP_KIND } from './event';
import { openSharedDocument, sealSharedDocument } from './blob';
import { SharedDocument } from './document';
import { deriveSharedKeys } from './phrase';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const PRIVKEY = '11'.repeat(32);

const document: SharedDocument = {
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

describe('sync event', () => {
  it('builds a signed kind 30078 event and reads the blob back', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const payload = await sealSharedDocument(document, keys.encryptionKey);
    const event = buildBackupEvent(keys.signingKey, payload, 1_700_000_000);

    expect(event.kind).toBe(BACKUP_KIND);
    expect(event.pubkey).toBe(keys.pubkey);
    expect(event.tags).toContain(['d', SHARED_D_TAG]);
    expect(event.sig.length).toBeGreaterThan(0);

    const opened = await openSharedDocument(
      readBackupPayload(event),
      keys.encryptionKey,
    );
    expect(opened).toEqual(document);
  });

  it('rejects an event whose signature was edited', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const event = buildBackupEvent(keys.signingKey, 'payload', 1_700_000_000);
    const tampered = {
      ...event,
      content: 'payload-edited',
    };

    let rejected = false;
    try {
      readBackupPayload(tampered);
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid sync event.';
    }
    expect(rejected).toBeTrue();
  });
});
