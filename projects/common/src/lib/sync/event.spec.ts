import { getPublicKey } from 'nostr-tools';
import { buildSyncEvent, readSyncPayload, SYNC_D_TAG, SYNC_KIND } from './event';
import { openSyncDocument, sealSyncDocument } from './blob';
import { SyncDocument } from './document';
import { deriveSyncKeys } from './phrase';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const PRIVKEY = '11'.repeat(32);

const document: SyncDocument = {
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
    const keys = await deriveSyncKeys(PHRASE);
    const payload = await sealSyncDocument(document, keys.encryptionKey);
    const event = buildSyncEvent(keys.signingKey, payload, 1_700_000_000);

    expect(event.kind).toBe(SYNC_KIND);
    expect(event.pubkey).toBe(keys.pubkey);
    expect(event.tags).toContain(['d', SYNC_D_TAG]);
    expect(event.sig.length).toBeGreaterThan(0);

    const opened = await openSyncDocument(
      readSyncPayload(event),
      keys.encryptionKey,
    );
    expect(opened).toEqual(document);
  });

  it('rejects an event whose signature was edited', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const event = buildSyncEvent(keys.signingKey, 'payload', 1_700_000_000);
    const tampered = {
      ...event,
      content: 'payload-edited',
    };

    let rejected = false;
    try {
      readSyncPayload(tampered);
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid sync event.';
    }
    expect(rejected).toBeTrue();
  });
});
