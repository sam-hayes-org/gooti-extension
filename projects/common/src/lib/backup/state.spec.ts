import { getPublicKey } from 'nostr-tools';
import { activeSharedDocument, mergeSharedDocuments } from './merge';
import { BackupKeys } from './phrase';
import {
  applySharedDocument,
  bytesToHex,
  canonicalSharedDocument,
  createBackupState,
  DEFAULT_BACKUP_RELAYS,
  hexToBytes,
  parseBackupState,
  parseBackupRelays,
  projectSharedDocument,
  stampIdentity,
  tombstoneIdentity,
  LocalVault,
  LiveVault,
} from './state';

const ADA = 'ab'.repeat(32);
const BOB = 'cd'.repeat(32);
const ADA_PUB = getPublicKey(hexToBytes(ADA));
const BOB_PUB = getPublicKey(hexToBytes(BOB));
const CREATED = '2020-01-01T00:00:00.000Z';

const keys: BackupKeys = {
  signingKey: new Uint8Array(32).fill(1),
  encryptionKey: new Uint8Array(32).fill(2),
  pubkey: '11'.repeat(32),
};

function live(nick = 'Ada'): LiveVault {
  return {
    identities: [{ pubkey: ADA_PUB, privkey: ADA, nick, createdAt: CREATED }],
    permissions: [],
  };
}

describe('default sync relays', () => {
  it('starts from the Gooti relay', () => {
    expect(DEFAULT_BACKUP_RELAYS).toEqual(['wss://relay.getgooti.com']);
  });
});

describe('sync stamps', () => {
  it('stamps a missing identity from createdAt once', () => {
    const state = createBackupState(keys, ['wss://relay.damus.io']);
    const first = projectSharedDocument(state, live(), 5_000);
    expect(first.document.identities[0].updatedAt).toBe(Date.parse(CREATED));
    expect(first.changed).toBeTrue();

    const second = projectSharedDocument(first.state, live(), 9_000);
    expect(second.document.identities[0].updatedAt).toBe(Date.parse(CREATED));
    expect(second.changed).toBeFalse();
  });

  it('moves the stamp when a conversation key is published for the first time', () => {
    const bunker = {
      pubkey: 'bb'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once' as string | null,
    };
    const state = createBackupState(keys, []);
    const stored = projectSharedDocument(
      state,
      {
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            bunker,
          },
        ],
        permissions: [],
      },
      5_000,
    );
    const linked = projectSharedDocument(
      stored.state,
      {
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            bunker: { ...bunker, clientSecretKey: '11'.repeat(32) },
          },
        ],
        permissions: [],
      },
      9_000,
    );

    expect(linked.document.identities[0].updatedAt).toBe(9_000);
    expect(linked.document.identities[0].bunker?.clientSecretKey).toBe('11'.repeat(32));
  });

  it('publishes a derived color without moving the stamp again', () => {
    const first = projectSharedDocument(createBackupState(keys, []), live(), 5_000);
    expect(first.document.identities[0].color).toMatch(/^#[0-9a-f]{6}$/);

    const second = projectSharedDocument(first.state, live(), 9_000);
    expect(second.document.identities[0].color).toBe(first.document.identities[0].color);
    expect(second.changed).toBeFalse();
  });

  it('keeps an explicit color on the published identity', () => {
    const stamped = stampIdentity(
      createBackupState(keys, []),
      { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED, color: '#abc123' },
      4_000,
    );
    const projected = projectSharedDocument(
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
    const stamped = projectSharedDocument(createBackupState(keys, []), live(), 5_000);
    const bumped = stampIdentity(
      stamped.state,
      { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada Lovelace', createdAt: CREATED },
      8_000,
    );
    const projected = projectSharedDocument(bumped, live('Ada Lovelace'), 12_000);

    expect(projected.document.identities[0].nick).toBe('Ada Lovelace');
    expect(projected.document.identities[0].updatedAt).toBe(8_000);
  });

  it('keeps a tombstone after the identity leaves the vault', () => {
    const stamped = projectSharedDocument(createBackupState(keys, []), live(), 5_000);
    const dead = tombstoneIdentity(
      stamped.state,
      { pubkey: ADA_PUB, privkey: ADA, nick: 'Ada', createdAt: CREATED },
      [],
      8_000,
    );
    const projected = projectSharedDocument(dead, { identities: [], permissions: [] }, 9_000);

    expect(projected.document.identities[0].deletedAt).toBe(8_000);
    expect(activeSharedDocument(projected.document).identities).toEqual([]);
  });

  it('keeps the custody time Gooti Desktop set when this browser edits the identity', () => {
    const state = createBackupState(keys, []);
    state.document.identities.push({
      pubkey: ADA_PUB,
      nick: 'Ada',
      createdAt: CREATED,
      updatedAt: 5_000,
      custodyAt: 4_000,
      bunker: { pubkey: BOB_PUB, relays: ['wss://relay.getgooti.com'], secret: null },
    });
    const pointer = {
      pubkey: ADA_PUB,
      nick: 'Ada Lovelace',
      createdAt: CREATED,
      bunker: { pubkey: BOB_PUB, relays: ['wss://relay.getgooti.com'], secret: null },
    };
    const edited = stampIdentity(state, pointer, 8_000);
    const projected = projectSharedDocument(edited, { identities: [pointer], permissions: [] }, 9_000);

    expect(projected.document.identities[0].custodyAt).toBe(4_000);
    expect(projected.document.identities[0].updatedAt).toBe(8_000);
    expect(canonicalSharedDocument(projected.document)).toContain('"custodyAt":4000');
  });

  it('rejects a relay that is not wss', () => {
    expect(() => parseBackupRelays('wss://relay.damus.io\nhttps://nos.lol')).toThrowError(
      'Relays must be wss:// URLs.',
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

  it('marks a pointer with a custody time as Gooti Desktop, and keeps the mark', () => {
    const pointer = { pubkey: BOB_PUB, relays: ['wss://relay.getgooti.com'], secret: null };
    const row = { pubkey: ADA_PUB, nick: 'Ada', createdAt: CREATED, updatedAt: 10, bunker: pointer };
    const fresh: LocalVault = { identities: [], permissions: [], selectedIdentityId: null };

    const fromDesktop = applySharedDocument(
      fresh,
      { v: 2, identities: [{ ...row, custodyAt: 5 }], permissions: [], relays: [] },
      () => 'ada',
    );
    expect(fromDesktop.identities[0].bunker?.gootiDesktop).toBeTrue();

    const plain = applySharedDocument(
      fresh,
      { v: 2, identities: [row], permissions: [], relays: [] },
      () => 'ada',
    );
    expect(plain.identities[0].bunker?.gootiDesktop).toBeUndefined();

    const kept = applySharedDocument(
      {
        ...fresh,
        identities: [
          { id: 'ada', pubkey: ADA_PUB, nick: 'Ada', createdAt: CREATED, bunker: { ...pointer, gootiDesktop: true } },
        ],
      },
      { v: 2, identities: [{ ...row, updatedAt: 20 }], permissions: [], relays: [] },
      () => 'other',
    );
    expect(kept.identities[0].bunker?.gootiDesktop).toBeTrue();
  });

  it('keeps the local UUID and ignores a stored publish-relay list', () => {
    const ids = ['new-bob'];
    const applied = applySharedDocument(
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
    const applied = applySharedDocument(
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
    const applied = applySharedDocument(
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
    const applied = applySharedDocument(
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
    const colored = applySharedDocument(
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

    const derived = applySharedDocument(
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
    const applied = applySharedDocument(
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

    const moved = applySharedDocument(
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

    const movedRelays = applySharedDocument(
      localBunker,
      {
        v: 2,
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            updatedAt: 12,
            bunker: { ...pointer, relays: ['wss://relay.nip46.com'], askSite: true },
          },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );
    expect(movedRelays.identities[0].bunker?.relays).toEqual(['wss://relay.nip46.com']);
    expect(movedRelays.identities[0].bunker?.clientSecretKey).toBe('11'.repeat(32));
  });

  it('gives a browser with no conversation key the synced one', () => {
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
          bunker: { ...pointer },
        },
      ],
      permissions: [],
      selectedIdentityId: 'local-bunker',
    };
    const applied = applySharedDocument(
      localBunker,
      {
        v: 2,
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            updatedAt: 10,
            bunker: { ...pointer, clientSecretKey: '22'.repeat(32) },
          },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );

    expect(applied.identities[0].bunker?.clientSecretKey).toBe('22'.repeat(32));
  });

  it('leaves a disconnected browser unlinked when sync still has a key', () => {
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
          bunker: { ...pointer, unlinked: true },
        },
      ],
      permissions: [],
      selectedIdentityId: 'local-bunker',
    };
    const applied = applySharedDocument(
      localBunker,
      {
        v: 2,
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            updatedAt: 10,
            bunker: { ...pointer, clientSecretKey: '22'.repeat(32) },
          },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );

    expect(applied.identities[0].bunker?.clientSecretKey).toBeUndefined();
    expect(applied.identities[0].bunker?.unlinked).toBeTrue();
  });

  it('keeps this browser conversation key when sync has a different one', () => {
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
          bunker: { ...pointer, clientSecretKey: '11'.repeat(32) },
        },
      ],
      permissions: [],
      selectedIdentityId: 'local-bunker',
    };
    const applied = applySharedDocument(
      localBunker,
      {
        v: 2,
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            updatedAt: 10,
            bunker: { ...pointer, clientSecretKey: '22'.repeat(32) },
          },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );

    expect(applied.identities[0].bunker?.clientSecretKey).toBe('11'.repeat(32));
  });

  it('takes the synced key when the bunker itself changed', () => {
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
          bunker: { ...pointer, clientSecretKey: '11'.repeat(32) },
        },
      ],
      permissions: [],
      selectedIdentityId: 'local-bunker',
    };
    const applied = applySharedDocument(
      localBunker,
      {
        v: 2,
        identities: [
          {
            pubkey: 'aa'.repeat(32),
            nick: 'Phone',
            createdAt: CREATED,
            updatedAt: 11,
            bunker: { ...pointer, pubkey: 'cc'.repeat(32), clientSecretKey: '22'.repeat(32) },
          },
        ],
        permissions: [],
        relays: [],
      },
      () => 'unused',
    );

    expect(applied.identities[0].bunker?.pubkey).toBe('cc'.repeat(32));
    expect(applied.identities[0].bunker?.clientSecretKey).toBe('22'.repeat(32));
  });

  it('publishes the site question and the conversation key', () => {
    const stamped = stampIdentity(
      createBackupState(keys, []),
      {
        pubkey: 'aa'.repeat(32),
        nick: 'Phone',
        createdAt: CREATED,
        bunker: {
          pubkey: 'bb'.repeat(32),
          relays: ['wss://relay.example.com'],
          secret: 'once',
          askSite: false,
          clientSecretKey: '11'.repeat(32),
        },
      },
      4_000,
    );

    expect(stamped.document.identities[0].bunker).toEqual({
      pubkey: 'bb'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once',
      askSite: false,
      clientSecretKey: '11'.repeat(32),
    });
  });

  it('rejects a site question that is not true or false', () => {
    expect(() =>
      parseBackupState(
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

  it('rejects a custody time that is not a number', () => {
    expect(() =>
      parseBackupState(
        JSON.stringify({
          signingKeyHex: bytesToHex(keys.signingKey),
          encryptionKeyHex: bytesToHex(keys.encryptionKey),
          relays: [],
          document: {
            v: 2,
            identities: [
              {
                pubkey: ADA_PUB,
                privkey: ADA,
                nick: 'Ada',
                createdAt: CREATED,
                updatedAt: 1,
                custodyAt: 'later',
              },
            ],
            permissions: [],
            relays: [],
          },
        }),
      ),
    ).toThrowError('Invalid sync state.');
  });

  it('rejects a conversation key that is not a hex key', () => {
    expect(() =>
      parseBackupState(
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
                  clientSecretKey: 'short',
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
    const parsed = parseBackupState(JSON.stringify({
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

    expect(parseBackupState(JSON.stringify(stored)).autoBackup).toBeUndefined();
    expect(parseBackupState(JSON.stringify({ ...stored, autoBackup: true })).autoBackup).toBeTrue();
    expect(parseBackupState(JSON.stringify({ ...stored, autoBackup: false })).autoBackup).toBeUndefined();
  });

  it('drops a document from the previous format and keeps the sync keys', () => {
    const parsed = parseBackupState(JSON.stringify({
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
    const projected = projectSharedDocument(createBackupState(keys, []), live(), 1);
    expect(canonicalSharedDocument(projected.document)).not.toContain('selected');
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
    const parsed = parseBackupState(JSON.stringify({
      signingKeyHex: bytesToHex(keys.signingKey),
      encryptionKeyHex: bytesToHex(keys.encryptionKey),
      relays: ['wss://relay.damus.io'],
      document: { v: 2, identities: [], permissions: [], relays: [] },
    }));

    expect(parsed.document.sites).toEqual([]);
  });

  it('rejects a document whose sites field is not an array', () => {
    expect(() => parseBackupState(JSON.stringify({
      signingKeyHex: bytesToHex(keys.signingKey),
      encryptionKeyHex: bytesToHex(keys.encryptionKey),
      relays: ['wss://relay.damus.io'],
      document: { v: 2, identities: [], permissions: [], relays: [], sites: {} },
    }))).toThrowError('Invalid sync state.');
  });

  it('applies an identity-delete tombstone and drops that host', () => {
    const state = createBackupState(keys, []);
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

    const applied = applySharedDocument(
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
    const merged = mergeSharedDocuments(
      { v: 2, identities: [ada], permissions: [], relays: [], sites: [site] },
      { v: 2, identities: [ada], permissions: [], relays: [] },
    );
    const applied = applySharedDocument(
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
