import { Event, getPublicKey } from 'nostr-tools';
import { openSyncDocument, sealSyncDocument } from './blob';
import { SyncDocument } from './document';
import { buildSyncEvent, readSyncPayload } from './event';
import { SyncRelayIO, manualSync } from './manual';
import { deriveSyncKeys } from './phrase';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ADA = 'ab'.repeat(32);
const BOB = 'cd'.repeat(32);
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

function identity(privkey: string, nick: string, updatedAt: number): SyncDocument {
  return {
    v: 2,
    identities: [
      {
        pubkey: getPublicKey(hexToBytes(privkey)),
        privkey,
        nick,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt,
      },
    ],
    permissions: [],
    relays: [],
  };
}

describe('manual sync', () => {
  it('publishes the local vault when no remote blob exists', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const published: SyncDocument[] = [];
    const io = fakeIO(keys, {
      remote: null,
      onPublish: (document) => published.push(document),
    });

    const steps: string[] = [];
    const result = await manualSync(identity(ADA, 'Ada', 1), keys, RELAYS, io, (step) =>
      steps.push(step),
    );

    expect(steps).toEqual(['read', 'merge', 'send']);
    expect(result.published).toBeTrue();
    expect(published.length).toBe(1);
    expect(result.document.identities[0].nick).toBe('Ada');
  });

  it('merges a remote identity and publishes the result', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const local = identity(ADA, 'Ada', 1);
    const remote = identity(BOB, 'Bob', 2);
    let published = 0;
    const io = fakeIO(keys, { remote, onPublish: () => published++ });

    const result = await manualSync(local, keys, RELAYS, io);

    expect(result.published).toBeTrue();
    expect(published).toBe(1);
    expect(result.document.identities.map((item) => item.privkey)).toEqual([ADA, BOB]);
  });

  it('does not publish when the remote blob is already the merge', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const local = identity(ADA, 'Ada', 1);
    const remote: SyncDocument = {
      v: 2,
      identities: [
        {
          pubkey: getPublicKey(hexToBytes(ADA)),
          privkey: ADA,
          nick: 'Ada Lovelace',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: 5,
        },
        {
          pubkey: getPublicKey(hexToBytes(BOB)),
          privkey: BOB,
          nick: 'Bob',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: 2,
        },
      ],
      permissions: [],
      relays: [],
    };
    let published = 0;
    const io = fakeIO(keys, { remote, onPublish: () => published++ });

    const steps: string[] = [];
    const result = await manualSync(local, keys, RELAYS, io, (step) => steps.push(step));

    expect(steps).toEqual(['read', 'merge']);
    expect(result.published).toBeFalse();
    expect(published).toBe(0);
    expect(result.document.identities[0].nick).toBe('Ada Lovelace');
  });

  it('does not publish when every relay is unreachable', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    let published = 0;
    const io: SyncRelayIO = {
      publish: async () => {
        published++;
        return RELAYS;
      },
      fetchNewest: async () => {
        throw new Error('No sync relay could be reached.');
      },
    };

    await expectAsync(manualSync(identity(ADA, 'Ada', 1), keys, RELAYS, io)).toBeRejectedWithError(
      'No sync relay could be reached.',
    );
    expect(published).toBe(0);
  });

  it('rejects a blob this phrase cannot open', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const other = await deriveSyncKeys(
      'legal winner thank year wave sausage worth useful legal winner thank yellow',
    );
    const payload = await sealSyncDocument(identity(ADA, 'Ada', 1), other.encryptionKey);
    const event = buildSyncEvent(keys.signingKey, payload, 50);
    const io: SyncRelayIO = {
      publish: async () => RELAYS,
      fetchNewest: async () => event,
    };

    await expectAsync(manualSync(identity(ADA, 'Ada', 1), keys, RELAYS, io)).toBeRejectedWithError(
      'The relay returned a vault this phrase cannot open.',
    );
  });

  it('requires a relay', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const io: SyncRelayIO = {
      publish: async () => [],
      fetchNewest: async () => null,
    };

    await expectAsync(manualSync(identity(ADA, 'Ada', 1), keys, [], io)).toBeRejectedWithError(
      'Add a sync relay first.',
    );
  });
});

function fakeIO(
  keys: Awaited<ReturnType<typeof deriveSyncKeys>>,
  options: {
    remote: SyncDocument | null;
    onPublish: (document: SyncDocument) => void;
  },
): SyncRelayIO {
  return {
    async publish(_relays, event) {
      options.onPublish(await openPublished(event, keys));
      return ['wss://relay.damus.io'];
    },
    async fetchNewest() {
      if (!options.remote) {
        return null;
      }
      const payload = await sealSyncDocument(options.remote, keys.encryptionKey);
      return buildSyncEvent(keys.signingKey, payload, 100);
    },
  };
}

async function openPublished(
  event: Event,
  keys: Awaited<ReturnType<typeof deriveSyncKeys>>,
): Promise<SyncDocument> {
  const opened = await openSyncDocument(readSyncPayload(event), keys.encryptionKey);
  if (!opened) {
    throw new Error('Invalid sync blob.');
  }
  return opened;
}
