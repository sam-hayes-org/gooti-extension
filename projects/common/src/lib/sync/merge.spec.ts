import { SyncDocument, SyncIdentity, SyncSite } from './document';
import { activeSyncDocument, mergeSyncDocuments } from './merge';

const LOCAL_KEY = 'ab'.repeat(32);
const REMOTE_KEY = 'cd'.repeat(32);

function identity(
  pubkey: string,
  nick: string,
  updatedAt: number,
  deletedAt?: number,
): SyncIdentity {
  return {
    pubkey,
    nick,
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt,
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

function doc(identities: SyncIdentity[]): SyncDocument {
  return { v: 2, identities, permissions: [], relays: [] };
}

describe('sync merge', () => {
  it('adds an identity that exists only on the remote', () => {
    const merged = mergeSyncDocuments(
      doc([identity(LOCAL_KEY, 'local', 1)]),
      doc([identity(REMOTE_KEY, 'remote', 1)]),
    );

    expect(activeSyncDocument(merged).identities.map((item) => item.pubkey)).toEqual([
      LOCAL_KEY,
      REMOTE_KEY,
    ]);
  });

  it('keeps an identity that the remote does not mention', () => {
    const merged = mergeSyncDocuments(
      doc([identity(LOCAL_KEY, 'local', 1)]),
      doc([]),
    );

    expect(activeSyncDocument(merged).identities).toEqual([
      identity(LOCAL_KEY, 'local', 1),
    ]);
  });

  it('keeps the newer nick and ignores an older one', () => {
    const newerRemote = mergeSyncDocuments(
      doc([identity(LOCAL_KEY, 'old', 1)]),
      doc([identity(LOCAL_KEY, 'new', 2)]),
    );
    const olderRemote = mergeSyncDocuments(
      doc([identity(LOCAL_KEY, 'current', 5)]),
      doc([identity(LOCAL_KEY, 'stale', 4)]),
    );

    expect(activeSyncDocument(newerRemote).identities[0]?.nick).toBe('new');
    expect(activeSyncDocument(olderRemote).identities[0]?.nick).toBe('current');
  });

  it('removes an identity when the remote delete is newer and keeps the tombstone', () => {
    const merged = mergeSyncDocuments(
      doc([identity(LOCAL_KEY, 'local', 10)]),
      doc([identity(LOCAL_KEY, 'local', 5, 20)]),
    );

    expect(activeSyncDocument(merged).identities).toEqual([]);
    expect(merged.identities[0]?.deletedAt).toBe(20);
  });

  it('keeps the newer site row and a tie keeps local', () => {
    const localSite: SyncSite = { host: 'primal.net', identityPubkey: LOCAL_KEY, updatedAt: 5 };
    const newer: SyncSite = { host: 'primal.net', identityPubkey: REMOTE_KEY, updatedAt: 6 };
    const tie: SyncSite = { host: 'primal.net', identityPubkey: REMOTE_KEY, updatedAt: 5 };
    const local = doc([]);
    local.sites = [localSite];

    const remoteNewer = doc([]);
    remoteNewer.sites = [newer];
    const remoteTie = doc([]);
    remoteTie.sites = [tie];

    expect(mergeSyncDocuments(local, remoteNewer).sites).toEqual([newer]);
    expect(mergeSyncDocuments(local, remoteTie).sites).toEqual([localSite]);
  });

  it('keeps a local site when the remote document omits sites', () => {
    const localSite: SyncSite = { host: 'primal.net', identityPubkey: LOCAL_KEY, updatedAt: 5 };
    const local = doc([identity(LOCAL_KEY, 'local', 1)]);
    local.sites = [localSite];
    const remote = doc([identity(LOCAL_KEY, 'local', 1)]);

    expect(mergeSyncDocuments(local, remote).sites).toEqual([localSite]);
  });
});
