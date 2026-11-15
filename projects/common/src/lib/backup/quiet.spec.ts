import { getPublicKey } from 'nostr-tools';
import { openSharedDocument, sealSharedDocument } from './blob';
import { SharedDocument } from './document';
import { buildBackupEvent, readBackupPayload } from './event';
import { BackupRelayIO } from './manual';
import { deriveSharedKeys } from './phrase';
import { localPublishPlan, publishIfLocalWins } from './quiet';
import { hexToBytes } from './state';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ADA = 'ab'.repeat(32);
const BOB = 'cd'.repeat(32);

function vault(rows: { privkey: string; nick: string; updatedAt: number }[]): SharedDocument {
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
    const keys = await deriveSharedKeys(PHRASE);
    const published: SharedDocument[] = [];
    const local = vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }]);
    const io: BackupRelayIO = {
      async publish(_relays, event) {
        const opened = await openSharedDocument(readBackupPayload(event), keys.encryptionKey);
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

    expect(sent.published).toBeTrue();
    expect(sent.report).toEqual({ took: [], sent: ['Created the backup.'] });
    expect(published.length).toBe(1);
    expect(published[0].identities[0].nick).toBe('Ada');
  });

  it('names the row it sent when this browser is ahead', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const local = vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }]);
    const ahead = vault([
      { privkey: ADA, nick: 'Ada', updatedAt: 2 },
      { privkey: BOB, nick: 'Bob', updatedAt: 3 },
    ]);
    const io: BackupRelayIO = {
      async publish() {
        return ['wss://relay.damus.io'];
      },
      async fetchNewest() {
        const payload = await sealSharedDocument(local, keys.encryptionKey);
        return buildBackupEvent(keys.signingKey, payload, 100);
      },
    };

    const sent = await publishIfLocalWins(ahead, keys, ['wss://relay.damus.io'], io);

    expect(sent.published).toBeTrue();
    expect(sent.report).toEqual({ took: [], sent: ['Added identity Bob'] });
  });

  it('does not send when the relay has a row this browser lacks', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    let published = false;
    const local = vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }]);
    const remote = vault([
      { privkey: ADA, nick: 'Ada', updatedAt: 2 },
      { privkey: BOB, nick: 'Bob', updatedAt: 4 },
    ]);
    const io: BackupRelayIO = {
      async publish() {
        published = true;
        return ['wss://relay.damus.io'];
      },
      async fetchNewest() {
        const payload = await sealSharedDocument(remote, keys.encryptionKey);
        return buildBackupEvent(keys.signingKey, payload, 100);
      },
    };

    const sent = await publishIfLocalWins(local, keys, ['wss://relay.damus.io'], io);

    expect(sent.published).toBeFalse();
    expect(sent.report).toEqual({ took: [], sent: [] });
    expect(published).toBeFalse();
  });

  it('sends a vault later than the relay event it was compared with', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const later = Math.floor(Date.now() / 1000) + 1000;
    const local = vault([{ privkey: ADA, nick: 'Ada', updatedAt: 2 }]);
    const ahead = vault([
      { privkey: ADA, nick: 'Ada', updatedAt: 2 },
      { privkey: BOB, nick: 'Bob', updatedAt: 3 },
    ]);
    let createdAt = 0;
    const io: BackupRelayIO = {
      async publish(_relays, event) {
        createdAt = event.created_at;
        return ['wss://relay.damus.io'];
      },
      async fetchNewest() {
        const payload = await sealSharedDocument(local, keys.encryptionKey);
        return buildBackupEvent(keys.signingKey, payload, later);
      },
    };

    await publishIfLocalWins(ahead, keys, ['wss://relay.damus.io'], io);

    expect(createdAt).toBe(later + 1);
  });
});
