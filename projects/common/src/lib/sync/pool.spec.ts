import { Event } from 'nostr-tools';
import { nostrSyncRelayIO, SyncPool, SyncRelayConnection, SyncRelayFailureError } from './pool';

describe('sync relay pool', () => {
  const event = { id: '1', created_at: 1 } as Event;

  it('accepts the vault when one relay rejects the publish', async () => {
    const pool = fakePool({
      'wss://down.example': { publish: async () => Promise.reject(new Error('closed')) },
      'wss://up.example': { publish: async () => 'ok' },
    });
    const io = nostrSyncRelayIO(pool);

    const accepted = await io.publish(
      ['wss://down.example', 'wss://up.example'],
      event,
    );

    expect(accepted).toEqual(['wss://up.example']);
    expect(pool.closed).toEqual([['wss://down.example', 'wss://up.example']]);
  });

  it('fails the publish when every relay rejects it', async () => {
    const pool = fakePool({
      'wss://down.example': { publish: async () => Promise.reject(new Error('closed')) },
    });
    const io = nostrSyncRelayIO(pool);

    await expectAsync(io.publish(['wss://down.example'], event)).toBeRejectedWithError(
      'No sync relay accepted the vault.',
    );
  });

  it('keeps each relay reason when every publish is rejected', async () => {
    const pool = fakePool({
      'wss://auth.example': {
        publish: async () => Promise.reject(new Error('auth-required: write requires auth')),
      },
      'wss://slow.example': { publish: async () => Promise.reject(new Error('  publish timed out  ')) },
      'wss://quiet.example': { publish: async () => Promise.reject('  ') },
    });
    const io = nostrSyncRelayIO(pool);

    try {
      await io.publish(
        ['wss://auth.example', 'wss://slow.example', 'wss://quiet.example'],
        event,
      );
      fail('publish should reject');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncRelayFailureError);
      expect((error as SyncRelayFailureError).failures).toEqual([
        { url: 'wss://auth.example', reason: 'auth-required: write requires auth' },
        { url: 'wss://slow.example', reason: 'publish timed out' },
        { url: 'wss://quiet.example', reason: 'No reason.' },
      ]);
    }
  });

  it('returns the newest blob when one relay is down', async () => {
    const older = { id: 'old', created_at: 10 } as Event;
    const newer = { id: 'new', created_at: 20 } as Event;
    const pool = fakePool({
      'wss://down.example': { connect: async () => Promise.reject(new Error('timeout')) },
      'wss://a.example': { events: [older] },
      'wss://b.example': { events: [newer] },
    });
    const io = nostrSyncRelayIO(pool);

    const found = await io.fetchNewest(
      ['wss://down.example', 'wss://a.example', 'wss://b.example'],
      'aa'.repeat(32),
    );

    expect(found?.id).toBe('new');
    expect(pool.closed.length).toBe(1);
  });

  it('returns null when a relay answers with no blob', async () => {
    const pool = fakePool({
      'wss://down.example': { connect: async () => Promise.reject(new Error('timeout')) },
      'wss://up.example': { events: [] },
    });
    const io = nostrSyncRelayIO(pool);

    const found = await io.fetchNewest(['wss://down.example', 'wss://up.example'], 'aa'.repeat(32));

    expect(found).toBeNull();
  });

  it('fails the fetch when every relay is unreachable', async () => {
    const pool = fakePool({
      'wss://down.example': { connect: async () => Promise.reject(new Error('timeout')) },
    });
    const io = nostrSyncRelayIO(pool);

    await expectAsync(io.fetchNewest(['wss://down.example'], 'aa'.repeat(32))).toBeRejectedWithError(
      'No sync relay could be reached.',
    );
  });

  it('keeps each relay reason when every relay is unreachable', async () => {
    const pool = fakePool({
      'wss://down.example': { connect: async () => Promise.reject(new Error('timeout')) },
      'wss://other.example': { connect: async () => Promise.reject(new Error('closed')) },
    });
    const io = nostrSyncRelayIO(pool);

    try {
      await io.fetchNewest(['wss://down.example', 'wss://other.example'], 'aa'.repeat(32));
      fail('fetch should reject');
    } catch (error) {
      expect(error).toBeInstanceOf(SyncRelayFailureError);
      expect((error as SyncRelayFailureError).message).toBe('No sync relay could be reached.');
      expect((error as SyncRelayFailureError).failures).toEqual([
        { url: 'wss://down.example', reason: 'timeout' },
        { url: 'wss://other.example', reason: 'closed' },
      ]);
    }
  });
});

interface FakeRelay {
  publish?: (event: Event) => Promise<string>;
  connect?: () => Promise<void>;
  events?: Event[];
}

function fakePool(relays: Record<string, FakeRelay>): SyncPool & { closed: string[][] } {
  const closed: string[][] = [];
  return {
    closed,
    async ensureRelay(url) {
      const relay = relays[url];
      if (!relay) {
        throw new Error('missing fake relay');
      }
      if (relay.connect) {
        await relay.connect();
      }
      const connection: SyncRelayConnection = {
        publish: relay.publish ?? (async () => 'ok'),
        subscribe(_filters, params) {
          for (const event of relay.events ?? []) {
            params.onevent(event);
          }
          params.oneose();
          return { close: () => undefined };
        },
      };
      return connection;
    },
    close(urls) {
      closed.push(urls);
    },
  };
}
