import { Event, EventTemplate, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import { AbstractSimplePool } from 'nostr-tools/pool';
import {
  BUNKER_DID_NOT_ANSWER,
  INVALID_BUNKER_LINK,
  bunkerSignEvent,
  connectBunker,
} from './client';

function fake(pool: FakeBunker): AbstractSimplePool {
  return pool as unknown as AbstractSimplePool;
}

describe('bunker client', () => {
  const bunkerKey = generateSecretKey();
  const userKey = generateSecretKey();
  const bunkerPubkey = getPublicKey(bunkerKey);
  const userPubkey = getPublicKey(userKey);
  const link = `bunker://${bunkerPubkey}?relay=wss://relay.example.com&secret=topsecret`;

  it('rejects a link that is not a bunker URL', async () => {
    await expectAsync(connectBunker('nope', { pool: fake(new FakeBunker(bunkerKey, userKey)), timeoutMs: 50 })).toBeRejectedWithError(
      INVALID_BUNKER_LINK,
    );
  });

  it('connects and signs one event, then closes', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    const connected = await connectBunker(link, { pool: fake(pool), timeoutMs: 1_000 });

    expect(connected.pubkey).toBe(userPubkey);
    expect(connected.bunker.pubkey).toBe(bunkerPubkey);
    expect(connected.bunker.secret).toBe('topsecret');
    expect(connected.bunker.relays).toEqual(['wss://relay.example.com']);

    const template: EventTemplate = {
      kind: 1,
      created_at: 1_700_000_000,
      tags: [],
      content: 'hello',
    };
    const signed = await bunkerSignEvent(connected.clientSecretKeyHex, connected.bunker, template, {
      pool: fake(pool),
      timeoutMs: 1_000,
    });

    expect(signed.pubkey).toBe(userPubkey);
    expect(signed.content).toBe('hello');
    expect(pool.methods).toEqual(['connect', 'get_public_key', 'sign_event']);
  });

  it('fails the call when the bunker does not answer', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    pool.silent = true;

    await expectAsync(connectBunker(link, { pool: fake(pool), timeoutMs: 30 })).toBeRejectedWithError(
      BUNKER_DID_NOT_ANSWER,
    );
  });
});

class FakeBunker {
  silent = false;
  methods: string[] = [];
  #onevent: ((event: Event) => void) | undefined;

  constructor(
    private readonly bunkerKey: Uint8Array,
    private readonly userKey: Uint8Array,
  ) {}

  subscribe(
    _relays: string[],
    _filter: unknown,
    params: { onevent: (event: Event) => void },
  ): { close: () => void } {
    this.#onevent = params.onevent;
    return { close: () => undefined };
  }

  publish(_relays: string[], event: Event): Promise<string>[] {
    if (!this.silent) {
      this.#reply(event);
    }
    return [Promise.resolve('ok')];
  }

  close(): void {
    return undefined;
  }

  #reply(event: Event): void {
    const conversationKey = getConversationKey(this.bunkerKey, event.pubkey);
    const request = JSON.parse(decrypt(event.content, conversationKey)) as {
      id: string;
      method: string;
      params: string[];
    };
    this.methods.push(request.method);
    let result = 'ack';
    if (request.method === 'get_public_key') {
      result = getPublicKey(this.userKey);
    }
    if (request.method === 'sign_event') {
      const template = JSON.parse(request.params[0]) as EventTemplate;
      result = JSON.stringify(finalizeEvent(template, this.userKey));
    }
    const response = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', event.pubkey]],
        content: encrypt(JSON.stringify({ id: request.id, result }), conversationKey),
      },
      this.bunkerKey,
    );
    this.#onevent?.(response);
  }
}
