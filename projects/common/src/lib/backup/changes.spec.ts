import { SharedDocument, SharedIdentity, SharedPermission } from './document';
import { describeChanges } from './changes';

const ADA = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

function identity(pubkey: string, nick: string, extra: Partial<SharedIdentity> = {}): SharedIdentity {
  return {
    pubkey,
    nick,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: 1,
    ...extra,
  };
}

function permission(
  identityPubkey: string,
  host: string,
  methodPolicy: 'allow' | 'deny' = 'allow',
): SharedPermission {
  return {
    identityPubkey,
    host,
    method: 'signEvent',
    methodPolicy,
    kind: 1,
    updatedAt: 1,
  };
}

function vault(partial: Partial<SharedDocument> = {}): SharedDocument {
  return {
    v: 2,
    identities: [],
    permissions: [],
    relays: [],
    sites: [],
    ...partial,
  };
}

describe('sync change report', () => {
  const ada = identity(ADA, 'Ada');
  const bob = identity(BOB, 'Bob');

  it('names a first send without listing every row', () => {
    const local = vault({ identities: [ada] });

    expect(describeChanges(local, null, local, true)).toEqual({
      took: [],
      sent: ['Created the backup.'],
    });
  });

  it('lists an identity taken from the relay and an identity sent to it', () => {
    const local = vault({ identities: [ada] });
    const remote = vault({ identities: [bob] });
    const merged = vault({ identities: [ada, bob] });

    expect(describeChanges(local, remote, merged, true)).toEqual({
      took: ['Added identity Bob'],
      sent: ['Added identity Ada'],
    });
  });

  it('lists a rename and a removed permission that stayed on the relay', () => {
    const local = vault({
      identities: [ada],
      permissions: [permission(ADA, 'primal.net')],
    });
    const remote = vault({
      identities: [identity(ADA, 'Ada Lovelace', { updatedAt: 5 })],
    });

    expect(describeChanges(local, remote, remote, false)).toEqual({
      took: [
        'Renamed Ada to Ada Lovelace',
        'Removed permission primal.net · signEvent kind 1 · Ada Lovelace',
      ],
      sent: [],
    });
  });

  it('lists a denial, a site move, and a removal this browser sent', () => {
    const local = vault({
      identities: [ada, bob],
      permissions: [permission(ADA, 'primal.net', 'deny')],
      sites: [{ host: 'iris.to', identityPubkey: BOB, updatedAt: 2 }],
    });
    const remote = vault({
      identities: [ada, bob],
      permissions: [permission(ADA, 'primal.net', 'allow'), permission(ADA, 'snort.social')],
      sites: [{ host: 'iris.to', identityPubkey: ADA, updatedAt: 1 }],
    });

    expect(describeChanges(local, remote, local, true)).toEqual({
      took: [],
      sent: [
        'Removed permission snort.social · signEvent kind 1 · Ada',
        'Denied primal.net · signEvent kind 1 · Ada',
        'iris.to now uses Bob',
      ],
    });
  });

  it('ignores a color-only edit and never prints a key or a bunker secret', () => {
    const secret = 'bunker-secret-value';
    const local = vault({
      identities: [identity(ADA, 'Ada', { color: '#112233', privkey: 'c'.repeat(64) })],
    });
    const remote = vault({
      identities: [
        identity(ADA, 'Ada', {
          bunker: { pubkey: 'd'.repeat(64), relays: ['wss://relay.example'], secret },
        }),
      ],
    });

    const report = describeChanges(local, remote, remote, false);
    const text = JSON.stringify(report);

    expect(report.took).toEqual(['Added a bunker for Ada']);
    expect(text).not.toContain(secret);
    expect(text).not.toContain('c'.repeat(64));
    expect(text).not.toContain('d'.repeat(64));
  });

  it('stops the list after 80 lines', () => {
    const permissions = Array.from({ length: 81 }, (_, index) =>
      permission(ADA, `host-${String(index).padStart(2, '0')}.social`),
    );
    const local = vault({ identities: [ada] });
    const merged = vault({ identities: [ada], permissions });

    const report = describeChanges(local, local, merged, false);

    expect(report.took.length).toBe(80);
    expect(report.took[0]).toBe('Added permission host-00.social · signEvent kind 1 · Ada');
    expect(report.took[79]).toBe('And 2 more.');
  });
});
