import { getPublicKey } from 'nostr-tools';
import { activeSyncDocument, mergeSyncDocuments } from './merge';
import { SyncKeys } from './phrase';
import {
  applySyncDocument,
  bytesToHex,
  canonicalSyncDocument,
  createNostrSyncState,
  hexToBytes,
  parseNostrSyncState,
  parseSyncRelays,
  projectSyncDocument,
  stampIdentity,
  tombstoneIdentity,
  LocalVault,
  SyncLiveVault,
} from './state';

const ADA = 'ab'.repeat(32);
const BOB = 'cd'.repeat(32);
const ADA_PUB = getPublicKey(hexToBytes(ADA));
const BOB_PUB = getPublicKey(hexToBytes(BOB));
const CREATED = '2020-01-01T00:00:00.000Z';

const keys: SyncKeys = {
  signingKey: new Uint8Array(32).fill(1),
  encryptionKey: new Uint8Array(32).fill(2),
  pubkey: '11'.repeat(32),
};

function live(nick = 'Ada'): SyncLiveVault {
  return {
    identities: [{ pubkey: ADA_PUB, privkey: ADA, nick, createdAt: CREATED }],
    permissions: [],
  };
}

describe('sync stamps', () => {
  it('stamps a missing identity from createdAt once', () => {
    const state = createNostrSyncState(keys, ['wss://relay.damus.io']);
    const first = projectSyncDocument(state, live(), 5_000);
    expect(first.document.identities[0].updatedAt).toBe(Date.parse(CREATED));
    expect(first.changed).toBeTrue();

    const second = projectSyncDocument(first.state, live(), 9_000);
    expect(second.document.identities[0].updatedAt).toBe(Date.parse(CREATED));
    expect(second.changed).toBeFalse();
  });

  it('publishes a derived color without moving the stamp again', () => {
    const first = projectSyncDocument(createNostrSyncState(keys, []), live(), 5_000);
    expect(first.document.identities[0].color).toMatch(/^#[0-9a-f]{6}$/);

    const second = projectSyncDocument(first.state, live(), 9_000);
    expect(second.document.identities[0].color).toBe(first.document.identities[0].color);
    expect(second.changed).toBeFalse();
  });

  it('keeps an explicit color on the published identity', () => {
    const stamped = stampIdentity(
      createNostrSyncState(keys, []),
      { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, color: '#abc123' },
      4_000,
    );
    const projected = projectSyncDocument(
      stamped,
      {
        identities: [{ pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, color: '#abc123' }],
        permissions: [],
      },
      9_000,
    );

    expect(projected.document.identities[0].color).toBe('#abc123');
    expect(projected.changed).toBeFalse();
  });

  it('publishes the live nick and keeps the bumped stamp', () => {
    const stamped = projectSyncDocument(createNostrSyncState(keys, []), live(), 5_000);
    const bumped = stampIdentity(
      stamped.state,
      { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada Lovelace', createdAt: CREATED },
      8_000,
    );
    const projected = projectSyncDocument(bumped, live('Ada Lovelace'), 12_000);

    expect(projected.document.identities[0].nick).toBe('Ada Lovelace');
    expect(projected.document.identities[0].updatedAt).toBe(8_000);
  });

  it('keeps a tombstone after the identity leaves the vault', () => {
    const stamped = projectSyncDocument(createNostrSyncState(keys, []), live(), 5_000);
    const dead = tombstoneIdentity(
      stamped.state,
      { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED },
      [],
      8_000,
    );
    const projected = projectSyncDocument(dead, { identities: [], permissions: [] }, 9_000);

    expect(projected.document.identities[0].deletedAt).toBe(8_000);
    expect(activeSyncDocument(projected.document).identities).toEqual([]);
  });

  it('rejects a relay that is not wss', () => {
    expect(() => parseSyncRelays('wss://relay.damus.io\nhttps://nos.lol')).toThrowError(
      'Sync relays must be wss:// URLs.',
    );
  });
});

describe('apply sync document', () => {
  const local: LocalVault = {
    identities: [{ id: 'local-ada', pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED }],
    permissions: [
      {
        id: 'perm-1',
        identityId: 'local-ada',
        host: 'primal.net',
        method: 'getPublicKey',
        methodPolicy: 'allow',
      },
    ],
    selectedIdentityId: 'local-ada',
  };

  it('keeps the local UUID and ignores a stored publish-relay list', () => {
    const ids = ['new-bob'];
    const applied = applySyncDocument(
      local,
      {
        v: 2,
        identities: [
          { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada Lovelace', createdAt: CREATED, updatedAt: 10 },
          { pubkey: BOB_PUB, privkey: BOB, nick: 'Bob', createdAt: CREATED, updatedAt: 5 },
        ],
        permissions: [
          {
            identityPubkey: ADA_PUB,
            host: 'primal.net',
            method: 'getPublicKey',
            methodPolicy: 'deny',
            updatedAt: 8,
          },
        ],
        relays: [
          {
            identityPubkey: ADA_PUB,
            url: 'wss://old.example',
            read: false,
            write: true,
            updatedAt: 4,
          },
          {
            identityPubkey: BOB_PUB,
            url: 'wss://bob.example',
            read: true,
            write: true,
            updatedAt: 4,
          },
        ],
      },
      () => ids.shift() as string,
    );

    expect(applied.identities.map((identity) => identity.id)).toEqual(['local-ada', 'new-bob']);
    expect(applied.identities[0].nick).toBe('Ada Lovelace');
    expect(applied.permissions).toEqual([
      {
        id: 'perm-1',
        identityId: 'local-ada',
        host: 'primal.net',
        method: 'getPublicKey',
        methodPolicy: 'deny',
      },
    ]);
    expect(applied.selectedIdentityId).toBe('local-ada');
    expect(ids).toEqual([]);
    expect('relays' in applied).toBeFalse();
  });

  it('moves the selection when the selected identity was deleted', () => {
    const applied = applySyncDocument(
      local,
      {
        v: 2,
        identities: [
          { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, updatedAt: 1, deletedAt: 9 },
          { pubkey: BOB_PUB, privkey: BOB, nick: 'Bob', createdAt: CREATED, updatedAt: 3 },
        ],
        permissions: [],
        relays: [],
      },
      () => 'new-bob',
    );

    expect(applied.identities.map((identity) => identity.pubkey)).toEqual([BOB_PUB]);
    expect(applied.permissions).toEqual([]);
    expect(applied.selectedIdentityId).toBe('new-bob');
  });

  it('selects the only identity when this browser has none selected', () => {
    const applied = applySyncDocument(
      { ...local, identities: [], permissions: [], selectedIdentityId: null },
      {
        v: 2,
        identities: [
          { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, updatedAt: 3 },
        ],
        permissions: [],
        relays: [],
      },
      () => 'only-ada',
    );

    expect(applied.identities.map((identity) => identity.id)).toEqual(['only-ada']);
    expect(applied.selectedIdentityId).toBe('only-ada');
  });

  it('leaves the selection empty when several identities arrive and none is selected', () => {
    const ids = ['first', 'second'];
    const applied = applySyncDocument(
      { ...local, identities: [], permissions: [], selectedIdentityId: null },
      {
        v: 2,
        identities: [
          { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, updatedAt: 3 },
          { pubkey: BOB_PUB, privkey: BOB, nick: 'Bob', createdAt: CREATED, updatedAt: 3 },
        ],
        permissions: [],
        relays: [],
      },
      () => ids.shift() as string,
    );

    expect(applied.selectedIdentityId).toBeNull();
  });

  it('copies a synced color and derives one when the record has none', () => {
    const colored = applySyncDocument(
      local,
      {
        v: 2,
        identities: [
          { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, updatedAt: 3, color: '#123456' },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );
    expect(colored.identities[0].color).toBe('#123456');

    const derived = applySyncDocument(
      local,
      {
        v: 2,
        identities: [{ pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, updatedAt: 3 }],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );
    expect(derived.identities[0].color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps the conversation key when only the site question changes', () => {
    const pointer = {
      pubkey: 'bb'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once' as string | null,
    };
    const localBunker: LocalVault = {
      identities: [
        {
          id: 'local-bunker',
          pubkey: 'aa'.repeat(32),
          nick: 'Phone',
          createdAt: CREATED,
          bunker: { ...pointer, askSite: true, clientSecretKey: '11'.repeat(32) },
        },
      ],
      permissions: [],
      selectedIdentityId: 'local-bunker',
    };
    const applied = applySyncDocument(
      localBunker,
      {
        v: 2,
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            updatedAt: 10,
            bunker: { ...pointer, askSite: false },
          },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );

    expect(applied.identities[0].bunker).toEqual({
      ...pointer,
      askSite: false,
      clientSecretKey: '11'.repeat(32),
    });

    const moved = applySyncDocument(
      localBunker,
      {
        v: 2,
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            updatedAt: 11,
            bunker: { ...pointer, pubkey: 'cc'.repeat(32), askSite: false },
          },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );
    expect(moved.identities[0].bunker?.clientSecretKey).toBeUndefined();
    expect(moved.identities[0].bunker?.askSite).toBeFalse();
  });

  it('publishes the site question and leaves the conversation key out', () => {
    const stamped = stampIdentity(
      createNostrSyncState(keys, []),
      {
        pubkey: 'aa'.repeat(32),
        nick: 'Phone',
        createdAt: CREATED,
        bunker: {
          pubkey: 'bb'.repeat(32),
          relays: ['wss://relay.example.com'],
          secret: 'once',
          askSite: false,
        },
      },
      4_000,
    );

    expect(stamped.document.identities[0].bunker).toEqual({
      pubkey: 'bb'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once',
      askSite: false,
    });
    expect(JSON.stringify(stamped.document)).not.toContain('clientSecretKey');
  });

  it('rejects a site question that is not true or false', () => {
    expect(() =>
      parseNostrSyncState(
        JSON.stringify({
          signingKeyHex: bytesToHex(keys.signingKey),
          encryptionKeyHex: bytesToHex(keys.encryptionKey),
          relays: [],
          document: {
            v: 2,
            identities: [
              {
                pubkey: 'aa'.repeat(32),
                nick: 'Phone',
                createdAt: CREATED,
                updatedAt: 1,
                bunker: {
                  pubkey: 'bb'.repeat(32),
                  relays: ['wss://relay.example.com'],
                  secret: null,
                  askSite: 'no',
                },
              },
            ],
            permissions: [],
            relays: [],
          },
        }),
      ),
    ).toThrowError('Invalid sync state.');
  });

  it('drops identity relays and getRelays permissions from an older v2 document', () => {
    const parsed = parseNostrSyncState(JSON.stringify({
      signingKeyHex: bytesToHex(keys.signingKey),
      encryptionKeyHex: bytesToHex(keys.encryptionKey),
      relays: ['wss://relay.damus.io'],
      document: {
        v: 2,
        identities: [
          { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, updatedAt: 1 },
        ],
        permissions: [
          {
            identityPubkey: ADA_PUB,
            host: 'primal.net',
            method: 'getRelays',
            methodPolicy: 'allow',
            updatedAt: 2,
          },
        ],
        relays: [
          {
            identityPubkey: ADA_PUB,
            url: 'wss://relay.example.com',
            read: true,
            write: true,
            updatedAt: 3,
          },
        ],
      },
    }));

    expect(parsed.relays).toEqual(['wss://relay.damus.io']);
    expect(parsed.document.identities[0].nick).toBe('Ada');
    expect(parsed.document.permissions).toEqual([]);
    expect(parsed.document.relays).toEqual([]);
  });

  it('keeps automatic sync only when this browser turned it on', () => {
    const stored = {
      signingKeyHex: bytesToHex(keys.signingKey),
      encryptionKeyHex: bytesToHex(keys.encryptionKey),
      relays: ['wss://relay.damus.io'],
      document: { v: 2, identities: [], permissions: [], relays: [], sites: [] },
    };

    expect(parseNostrSyncState(JSON.stringify(stored)).autoSync).toBeUndefined();
    expect(parseNostrSyncState(JSON.stringify({ ...stored, autoSync: true })).autoSync).toBeTrue();
    expect(parseNostrSyncState(JSON.stringify({ ...stored, autoSync: false })).autoSync).toBeUndefined();
  });

  it('drops a document from the previous format and keeps the sync keys', () => {
    const parsed = parseNostrSyncState(JSON.stringify({
      signingKeyHex: bytesToHex(keys.signingKey),
      encryptionKeyHex: bytesToHex(keys.encryptionKey),
      relays: ['wss://relay.damus.io'],
      document: {
        v: 1,
        identities: [{ privkey: ADA, nick: 'Ada', createdAt: CREATED, updatedAt: 1 }],
        permissions: [],
        relays: [],
      },
    }));

    expect(parsed.signingKeyHex).toBe(bytesToHex(keys.signingKey));
    expect(parsed.document).toEqual({ v: 2, identities: [], permissions: [], relays: [], sites: [] });
  });

  it('does not put the selected identity in the document comparison', () => {
    const projected = projectSyncDocument(createNostrSyncState(keys, []), live(), 1);
    expect(canonicalSyncDocument(projected.document)).not.toContain('selected');
  });
});

describe('site bindings in the sync document', () => {
  const ada = {
    pubkey: ADA_PUB,
    privkey: ADA,
    nick: 'Ada',
    createdAt: CREATED,
    updatedAt: 1,
  };
  const bob = {
    pubkey: BOB_PUB,
    privkey: BOB,
    nick: 'Bob',
    createdAt: CREATED,
    updatedAt: 1,
  };

  it('opens an older v2 document that has no sites', () => {
    const parsed = parseNostrSyncState(JSON.stringify({
      signingKeyHex: bytesToHex(keys.signingKey),
      encryptionKeyHex: bytesToHex(keys.encryptionKey),
      relays: ['wss://relay.damus.io'],
      document: { v: 2, identities: [], permissions: [], relays: [] },
    }));

    expect(parsed.document.sites).toEqual([]);
  });

  it('rejects a document whose sites field is not an array', () => {
    expect(() => parseNostrSyncState(JSON.stringify({
      signingKeyHex: bytesToHex(keys.signingKey),
      encryptionKeyHex: bytesToHex(keys.encryptionKey),
      relays: ['wss://relay.damus.io'],
      document: { v: 2, identities: [], permissions: [], relays: [], sites: {} },
    }))).toThrowError('Invalid sync state.');
  });

  it('applies an identity-delete tombstone and drops that host', () => {
    const state = createNostrSyncState(keys, []);
    state.document = {
      v: 2,
      identities: [ada, bob],
      permissions: [],
      relays: [],
      sites: [
        { host: 'primal.net', identityPubkey: ADA_PUB, updatedAt: 3 },
        { host: 'nos.lol', identityPubkey: BOB_PUB, updatedAt: 3 },
      ],
    };
    const dead = tombstoneIdentity(
      state,
      { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED },
      [],
      8_000,
    );

    expect(dead.document.sites?.find((site) => site.host === 'primal.net')?.deletedAt).toBe(8_000);
    expect(dead.document.sites?.find((site) => site.host === 'nos.lol')?.deletedAt).toBeUndefined();

    const applied = applySyncDocument(
      {
        identities: [
          { id: 'local-ada', pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED },
          { id: 'local-bob', pubkey: BOB_PUB, privkey: BOB, nick: 'Bob', createdAt: CREATED },
        ],
        permissions: [],
        sites: [
          { id: 'site-primal', identityId: 'local-ada', host: 'primal.net' },
          { id: 'site-nos', identityId: 'local-bob', host: 'nos.lol' },
        ],
        selectedIdentityId: 'local-ada',
      },
      dead.document,
      () => 'unused',
    );

    expect(applied.sites).toEqual([
      { id: 'site-nos', identityId: 'local-bob', host: 'nos.lol' },
    ]);
  });

  it('keeps a local site when the remote document omits sites', () => {
    const site = { host: 'primal.net', identityPubkey: ADA_PUB, updatedAt: 4 };
    const merged = mergeSyncDocuments(
      { v: 2, identities: [ada], permissions: [], relays: [], sites: [site] },
      { v: 2, identities: [ada], permissions: [], relays: [] },
    );
    const applied = applySyncDocument(
      {
        identities: [{ id: 'local-ada', pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED }],
        permissions: [],
        sites: [{ id: 'site-primal', identityId: 'local-ada', host: 'primal.net' }],
        selectedIdentityId: 'local-ada',
      },
      merged,
      () => 'new-id',
    );

    expect(applied.sites).toEqual([
      { id: 'site-primal', identityId: 'local-ada', host: 'primal.net' },
    ]);
  });
});
