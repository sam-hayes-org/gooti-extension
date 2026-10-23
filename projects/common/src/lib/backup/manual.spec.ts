import { Event, getPublicKey } from 'nostr-tools';
import { openSharedDocument, sealSharedDocument } from './blob';
import { SharedDocument } from './document';
import { buildBackupEvent, readBackupPayload } from './event';
import { BackupRelayIO, backUpShared, publishTime } from './manual';
import { deriveSharedKeys } from './phrase';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ADA = 'ab'.repeat(32);
const BOB = 'cd'.repeat(32);
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

function identity(privkey: string, nick: string, updatedAt: number): SharedDocument {
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
    const keys = await deriveSharedKeys(PHRASE);
    const published: SharedDocument[] = [];
    const io = fakeIO(keys, {
      remote: null,
      onPublish: (document) => published.push(document),
    });

    const steps: string[] = [];
    const result = await backUpShared(identity(ADA, 'Ada', 1), keys, RELAYS, io, (step) =>
      steps.push(step),
    );

    expect(steps).toEqual(['read', 'merge', 'send']);
    expect(result.published).toBeTrue();
    expect(result.changed).toBeFalse();
    expect(published.length).toBe(1);
    expect(result.document.identities[0].nick).toBe('Ada');
  });

  it('merges a remote identity and publishes the result', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const local = identity(ADA, 'Ada', 1);
    const remote = identity(BOB, 'Bob', 2);
    let published = 0;
    const io = fakeIO(keys, { remote, onPublish: () => published++ });

    const result = await backUpShared(local, keys, RELAYS, io);

    expect(result.published).toBeTrue();
    expect(result.changed).toBeTrue();
    expect(published).toBe(1);
    expect(result.document.identities.map((item) => item.privkey)).toEqual([ADA, BOB]);
  });

  it('does not publish when the remote blob is already the merge', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const local = identity(ADA, 'Ada', 1);
    const remote: SharedDocument = {
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
    const result = await backUpShared(local, keys, RELAYS, io, (step) => steps.push(step));

    expect(steps).toEqual(['read', 'merge']);
    expect(result.published).toBeFalse();
    expect(result.changed).toBeTrue();
    expect(published).toBe(0);
    expect(result.document.identities[0].nick).toBe('Ada Lovelace');
  });

  it('does not publish when every relay is unreachable', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    let published = 0;
    const io: BackupRelayIO = {
      publish: async () => {
        published++;
        return RELAYS;
      },
      fetchNewest: async () => {
        throw new Error('No sync relay could be reached.');
      },
    };

    await expectAsync(backUpShared(identity(ADA, 'Ada', 1), keys, RELAYS, io)).toBeRejectedWithError(
      'No sync relay could be reached.',
    );
    expect(published).toBe(0);
  });

  it('rejects a blob this phrase cannot open', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const other = await deriveSharedKeys(
      'legal winner thank year wave sausage worth useful legal winner thank yellow',
    );
    const payload = await sealSharedDocument(identity(ADA, 'Ada', 1), other.encryptionKey);
    const event = buildBackupEvent(keys.signingKey, payload, 50);
    const io: BackupRelayIO = {
      publish: async () => RELAYS,
      fetchNewest: async () => event,
    };

    await expectAsync(backUpShared(identity(ADA, 'Ada', 1), keys, RELAYS, io)).toBeRejectedWithError(
      'This passphrase cannot open the backup on the relay.',
    );
  });

  it('publishes after the relay event, even in the same second', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    // A relay event from the future: a clock behind, or a backup in the same second.
    const later = Math.floor(Date.now() / 1000) + 1000;
    const payload = await sealSharedDocument(identity(BOB, 'Bob', 2), keys.encryptionKey);
    const remote = buildBackupEvent(keys.signingKey, payload, later);
    const sent: Event[] = [];
    const io: BackupRelayIO = {
      publish: async (_relays, event) => {
        sent.push(event);
        return RELAYS;
      },
      fetchNewest: async () => remote,
    };

    await backUpShared(identity(ADA, 'Ada', 1), keys, RELAYS, io);

    expect(sent.length).toBe(1);
    expect(sent[0].created_at).toBe(later + 1);
  });

  it('times an event now, and after the event it replaces', () => {
    expect(publishTime(null, 500)).toBe(500);
    expect(publishTime(100, 500)).toBe(500);
    expect(publishTime(500, 500)).toBe(501);
    expect(publishTime(900, 500)).toBe(901);
  });

  it('requires a relay', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const io: BackupRelayIO = {
      publish: async () => [],
      fetchNewest: async () => null,
    };

    await expectAsync(backUpShared(identity(ADA, 'Ada', 1), keys, [], io)).toBeRejectedWithError(
      'Add a relay first.',
    );
  });
});

function fakeIO(
  keys: Awaited<ReturnType<typeof deriveSharedKeys>>,
  options: {
    remote: SharedDocument | null;
    onPublish: (document: SharedDocument) => void;
  },
): BackupRelayIO {
  return {
    async publish(_relays, event) {
      options.onPublish(await openPublished(event, keys));
      return ['wss://relay.damus.io'];
    },
    async fetchNewest() {
      if (!options.remote) {
        return null;
      }
      const payload = await sealSharedDocument(options.remote, keys.encryptionKey);
      return buildBackupEvent(keys.signingKey, payload, 100);
    },
  };
}

async function openPublished(
  event: Event,
  keys: Awaited<ReturnType<typeof deriveSharedKeys>>,
): Promise<SharedDocument> {
  const opened = await openSharedDocument(readBackupPayload(event), keys.encryptionKey);
  if (!opened) {
    throw new Error('Invalid sync blob.');
  }
  return opened;
}
