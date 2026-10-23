import { getPublicKey } from 'nostr-tools';
import { openSyncDocument, sealSyncDocument } from './blob';
import { SyncDocument } from './document';
import { buildSyncEvent, readSyncPayload } from './event';
import { SyncRelayIO } from './manual';
import { deriveSyncKeys } from './phrase';
import { localPublishPlan, publishIfLocalWins } from './quiet';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ADA = 'ab'.repeat(32);
const BOB = 'cd'.repeat(32);

function vault(rows: { privkey: string; nick: string; updatedAt: number }[]): SyncDocument {
  return {
    v: 2,
    identities: rows.map((row) => ({
      pubkey: getPublicKey(hexToBytes(row.privkey)),
      privkey: row.privkey,
      nick: row.nick,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: row.updatedAt,
    })),
    permissions: [],
    relays: [],
    sites: [],
  };
}

describe('local publish plan', () => {
  const local = vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }]);

  it('publishes when the relays have no vault yet', () => {
    expect(localPublishPlan(local, null).publish).toBeTrue();
  });

  it('skips a publish when the relay already has this vault', () => {
    expect(localPublishPlan(local, vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }])).publish).toBeFalse();
  });

  it('publishes a local row the relay does not have', () => {
    const ahead = vault([
      { privkey: ADA, nick: 'Ada', updatedAt: 2 },
      { privkey: BOB, nick: 'Bob', updatedAt: 3 },
    ]);
    expect(localPublishPlan(ahead, local).publish).toBeTrue();
  });

  it('does not publish over a remote row this browser has not applied', () => {
    const remote = vault([
      { privkey: ADA, nick: 'Ada', updatedAt: 2 },
      { privkey: BOB, nick: 'Bob', updatedAt: 4 },
    ]);
    expect(localPublishPlan(local, remote).publish).toBeFalse();
  });
});

describe('publishIfLocalWins', () => {
  it('sends the local vault when the relay has none', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const published: SyncDocument[] = [];
    const local = vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }]);
    const io: SyncRelayIO = {
      async publish(_relays, event) {
        const opened = await openSyncDocument(readSyncPayload(event), keys.encryptionKey);
        if (!opened) {
          throw new Error('Invalid sync blob.');
        }
        published.push(opened);
        return ['wss://relay.damus.io'];
      },
      async fetchNewest() {
        return null;
      },
    };

    const sent = await publishIfLocalWins(local, keys, ['wss://relay.damus.io'], io);

    expect(sent).toBeTrue();
    expect(published.length).toBe(1);
    expect(published[0].identities[0].nick).toBe('Ada');
  });

  it('does not send when the relay has a row this browser lacks', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    let published = false;
    const local = vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }]);
    const remote = vault([
      { privkey: ADA, nick: 'Ada', updatedAt: 2 },
      { privkey: BOB, nick: 'Bob', updatedAt: 4 },
    ]);
    const io: SyncRelayIO = {
      async publish() {
        published = true;
        return ['wss://relay.damus.io'];
      },
      async fetchNewest() {
        const payload = await sealSyncDocument(remote, keys.encryptionKey);
        return buildSyncEvent(keys.signingKey, payload, 100);
      },
    };

    const sent = await publishIfLocalWins(local, keys, ['wss://relay.damus.io'], io);

    expect(sent).toBeFalse();
    expect(published).toBeFalse();
  });
});
