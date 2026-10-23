import { SharedDocument, SharedIdentity, SharedSite } from './document';
import { activeSharedDocument, mergeSharedDocuments } from './merge';

const LOCAL_KEY = 'ab'.repeat(32);
const REMOTE_KEY = 'cd'.repeat(32);

function identity(
  pubkey: string,
  nick: string,
  updatedAt: number,
  deletedAt?: number,
): SharedIdentity {
  return {
    pubkey,
    nick,
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt,
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

function doc(identities: SharedIdentity[]): SharedDocument {
  return { v: 2, identities, permissions: [], relays: [] };
}

describe('shared merge', () => {
  it('adds an identity that exists only on the remote', () => {
    const merged = mergeSharedDocuments(
      doc([identity(LOCAL_KEY, 'local', 1)]),
      doc([identity(REMOTE_KEY, 'remote', 1)]),
    );

    expect(activeSharedDocument(merged).identities.map((item) => item.pubkey)).toEqual([
      LOCAL_KEY,
      REMOTE_KEY,
    ]);
  });

  it('keeps an identity that the remote does not mention', () => {
    const merged = mergeSharedDocuments(
      doc([identity(LOCAL_KEY, 'local', 1)]),
      doc([]),
    );

    expect(activeSharedDocument(merged).identities).toEqual([
      identity(LOCAL_KEY, 'local', 1),
    ]);
  });

  it('fills a missing conversation key when the revision ties', () => {
    const bunker = {
      pubkey: 'ee'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once',
    };
    const local = identity(LOCAL_KEY, 'Phone', 5);
    local.bunker = bunker;
    const remote = identity(LOCAL_KEY, 'Phone', 5);
    remote.bunker = { ...bunker, clientSecretKey: '22'.repeat(32) };

    const merged = mergeSharedDocuments(doc([local]), doc([remote]));

    expect(merged.identities[0]?.bunker?.clientSecretKey).toBe('22'.repeat(32));
    expect(merged.identities[0]?.nick).toBe('Phone');
  });

  it('does not copy a conversation key from an older revision', () => {
    const bunker = {
      pubkey: 'ee'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once',
    };
    const local = identity(LOCAL_KEY, 'Phone', 6);
    local.bunker = bunker;
    const remote = identity(LOCAL_KEY, 'Phone', 5);
    remote.bunker = { ...bunker, clientSecretKey: '22'.repeat(32) };

    const merged = mergeSharedDocuments(doc([local]), doc([remote]));

    expect(merged.identities[0]?.bunker?.clientSecretKey).toBeUndefined();
  });

  it('keeps the newer nick and ignores an older one', () => {
    const newerRemote = mergeSharedDocuments(
      doc([identity(LOCAL_KEY, 'old', 1)]),
      doc([identity(LOCAL_KEY, 'new', 2)]),
    );
    const olderRemote = mergeSharedDocuments(
      doc([identity(LOCAL_KEY, 'current', 5)]),
      doc([identity(LOCAL_KEY, 'stale', 4)]),
    );

    expect(activeSharedDocument(newerRemote).identities[0]?.nick).toBe('new');
    expect(activeSharedDocument(olderRemote).identities[0]?.nick).toBe('current');
  });

  it('removes an identity when the remote delete is newer and keeps the tombstone', () => {
    const merged = mergeSharedDocuments(
      doc([identity(LOCAL_KEY, 'local', 10)]),
      doc([identity(LOCAL_KEY, 'local', 5, 20)]),
    );

    expect(activeSharedDocument(merged).identities).toEqual([]);
    expect(merged.identities[0]?.deletedAt).toBe(20);
  });

  it('keeps the newer site row and a tie keeps local', () => {
    const localSite: SharedSite = { host: 'primal.net', identityPubkey: LOCAL_KEY, updatedAt: 5 };
    const newer: SharedSite = { host: 'primal.net', identityPubkey: REMOTE_KEY, updatedAt: 6 };
    const tie: SharedSite = { host: 'primal.net', identityPubkey: REMOTE_KEY, updatedAt: 5 };
    const local = doc([]);
    local.sites = [localSite];

    const remoteNewer = doc([]);
    remoteNewer.sites = [newer];
    const remoteTie = doc([]);
    remoteTie.sites = [tie];

    expect(mergeSharedDocuments(local, remoteNewer).sites).toEqual([newer]);
    expect(mergeSharedDocuments(local, remoteTie).sites).toEqual([localSite]);
  });

  describe('custody', () => {
    const KEY = 'ef'.repeat(32);
    const pointer = { pubkey: '12'.repeat(32), relays: ['wss://relay.getgooti.com'], secret: null };
    const withKey = (updatedAt: number, custodyAt?: number): SharedIdentity => ({
      ...identity(LOCAL_KEY, 'key', updatedAt),
      privkey: KEY,
      ...(custodyAt === undefined ? {} : { custodyAt }),
    });
    const moved = (updatedAt: number, custodyAt?: number): SharedIdentity => ({
      ...identity(LOCAL_KEY, 'pointer', updatedAt),
      bunker: pointer,
      ...(custodyAt === undefined ? {} : { custodyAt }),
    });

    it('a newer edit of the key does not undo a move to Gooti Desktop', () => {
      const merged = mergeSharedDocuments(doc([withKey(50)]), doc([moved(10, 10)]));
      expect(merged.identities[0]?.nick).toBe('pointer');
      const reverse = mergeSharedDocuments(doc([moved(10, 10)]), doc([withKey(50)]));
      expect(reverse.identities[0]?.nick).toBe('pointer');
    });

    it('a later move back into sync wins over an older pointer', () => {
      const merged = mergeSharedDocuments(doc([moved(90, 10)]), doc([withKey(30, 20)]));
      expect(merged.identities[0]?.nick).toBe('key');
    });

    it('the same custody time, or two rows of one kind, falls back to the newer edit', () => {
      expect(mergeSharedDocuments(doc([moved(10, 10)]), doc([withKey(50, 10)])).identities[0]?.nick).toBe('key');
      expect(mergeSharedDocuments(doc([moved(10)]), doc([withKey(50)])).identities[0]?.nick).toBe('key');
      const older = { ...moved(10, 30), nick: 'older' };
      expect(mergeSharedDocuments(doc([older]), doc([moved(50)])).identities[0]?.nick).toBe('pointer');
    });
  });

  it('keeps a local site when the remote document omits sites', () => {
    const localSite: SharedSite = { host: 'primal.net', identityPubkey: LOCAL_KEY, updatedAt: 5 };
    const local = doc([identity(LOCAL_KEY, 'local', 1)]);
    local.sites = [localSite];
    const remote = doc([identity(LOCAL_KEY, 'local', 1)]);

    expect(mergeSharedDocuments(local, remote).sites).toEqual([localSite]);
  });
});
