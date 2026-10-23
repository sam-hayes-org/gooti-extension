import { Event, EventTemplate, generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { decrypt, encrypt, getConversationKey } from 'nostr-tools/nip44';
import { AbstractSimplePool } from 'nostr-tools/pool';
import {
  BUNKER_DID_NOT_ANSWER,
  BUNKER_SENT_NO_RELAYS,
  DESKTOP_BAD_SIGNATURE,
  DESKTOP_DID_NOT_ANSWER,
  INVALID_BUNKER_LINK,
  bunkerNip44Encrypt,
  bunkerSignEvent,
  bunkerSwitchRelays,
  connectBunker,
  forgetDesktopAnswers,
  fromGootiDesktop,
} from './client';
import { SharedBunker } from '../backup/document';

function fake(pool: FakeBunker): AbstractSimplePool {
  return pool as unknown as AbstractSimplePool;
}

describe('bunker client', () => {
  const bunkerKey = generateSecretKey();
  const userKey = generateSecretKey();
  const bunkerPubkey = getPublicKey(bunkerKey);
  const userPubkey = getPublicKey(userKey);
  const link = `bunker://${bunkerPubkey}?relay=wss://relay.example.com&secret=topsecret`;

  it('knows a Gooti Desktop link by gooti=1', () => {
    expect(fromGootiDesktop(`${link}&gooti=1`)).toBeTrue();
    expect(fromGootiDesktop(` bunker://${bunkerPubkey}?gooti=1&relay=wss://r.example `)).toBeTrue();
    expect(fromGootiDesktop(link)).toBeFalse();
    expect(fromGootiDesktop(`${link}&gooti=0`)).toBeFalse();
    expect(fromGootiDesktop(`bunker://${bunkerPubkey}`)).toBeFalse();
  });

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

  it('keeps the saved relays when the bunker has no change', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    const connected = await connectBunker(link, { pool: fake(pool), timeoutMs: 1_000 });
    pool.switchResult = null;

    const refresh = await bunkerSwitchRelays(connected.clientSecretKeyHex, connected.bunker, {
      pool: fake(pool),
      timeoutMs: 1_000,
    });

    expect(refresh).toEqual({ changed: false });
  });

  it('treats a trailing slash as the same relay', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    const connected = await connectBunker(link, { pool: fake(pool), timeoutMs: 1_000 });
    pool.switchResult = '["wss://relay.example.com/"]';

    const refresh = await bunkerSwitchRelays(connected.clientSecretKeyHex, connected.bunker, {
      pool: fake(pool),
      timeoutMs: 1_000,
    });

    expect(refresh).toEqual({ changed: false });
  });

  it('returns the bunker relay list when it changed', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    const connected = await connectBunker(link, { pool: fake(pool), timeoutMs: 1_000 });
    pool.switchResult = '["wss://relay.nip46.com/","wss://nrs.primal.net"]';

    const refresh = await bunkerSwitchRelays(connected.clientSecretKeyHex, connected.bunker, {
      pool: fake(pool),
      timeoutMs: 1_000,
    });

    expect(refresh).toEqual({
      changed: true,
      relays: ['wss://relay.nip46.com', 'wss://nrs.primal.net'],
    });
    expect(pool.methods).toContain('switch_relays');
  });

  it('rejects an answer that is not a relay list', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    const connected = await connectBunker(link, { pool: fake(pool), timeoutMs: 1_000 });
    pool.switchResult = 'ack';

    await expectAsync(
      bunkerSwitchRelays(connected.clientSecretKeyHex, connected.bunker, {
        pool: fake(pool),
        timeoutMs: 1_000,
      }),
    ).toBeRejectedWithError(BUNKER_SENT_NO_RELAYS);
  });

  it('reports a refusal from the bunker', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    const connected = await connectBunker(link, { pool: fake(pool), timeoutMs: 1_000 });
    pool.switchError = 'no permission';

    await expectAsync(
      bunkerSwitchRelays(connected.clientSecretKeyHex, connected.bunker, {
        pool: fake(pool),
        timeoutMs: 1_000,
      }),
    ).toBeRejectedWithError('no permission');
  });

  it('fails the call when the bunker does not answer', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    pool.silent = true;

    await expectAsync(connectBunker(link, { pool: fake(pool), timeoutMs: 30 })).toBeRejectedWithError(
      BUNKER_DID_NOT_ANSWER,
    );
  });
});

describe('bunker client with Gooti Desktop', () => {
  const bunkerKey = generateSecretKey();
  const userKey = generateSecretKey();
  const clientKey = 'ab'.repeat(32);
  const pointer: SharedBunker = {
    pubkey: getPublicKey(bunkerKey),
    relays: ['wss://relay.getgooti.com'],
    secret: null,
  };
  const template: EventTemplate = { kind: 1, created_at: 1_700_000_000, tags: [], content: 'hi' };

  beforeEach(() => forgetDesktopAnswers());

  it('pings first, names the site, and skips the ping while the desktop answered recently', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    const options = { pool: fake(pool), timeoutMs: 1_000, desktop: { site: 'primal.net' } };

    const signed = await bunkerSignEvent(clientKey, pointer, template, options);
    expect(signed.pubkey).toBe(getPublicKey(userKey));
    await bunkerNip44Encrypt(clientKey, pointer, 'cd'.repeat(32), 'secret', options);

    expect(pool.methods).toEqual(['ping', 'sign_event', 'nip44_encrypt']);
    expect(pool.calls[1].params).toEqual([JSON.stringify(template), '{"site":"primal.net"}']);
    expect(pool.calls[2].params).toEqual(['cd'.repeat(32), 'secret', '{"site":"primal.net"}']);
  });

  it('a bunker that is not Gooti Desktop gets standard requests without a ping', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    await bunkerSignEvent(clientKey, pointer, template, { pool: fake(pool), timeoutMs: 1_000 });

    expect(pool.methods).toEqual(['sign_event']);
    expect(pool.calls[0].params).toEqual([JSON.stringify(template)]);
  });

  it('says Gooti Desktop did not answer when the ping gets no answer', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    pool.silent = true;

    await expectAsync(
      bunkerSignEvent(clientKey, pointer, template, { pool: fake(pool), timeoutMs: 30, desktop: {} }),
    ).toBeRejectedWithError(DESKTOP_DID_NOT_ANSWER);
    expect(pool.methods).toEqual([]);
  });

  it('says Gooti Desktop did not answer when the request itself gets no answer in time', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    pool.silentFor = ['sign_event'];

    await expectAsync(
      bunkerSignEvent(clientKey, pointer, template, { pool: fake(pool), timeoutMs: 50, desktop: {} }),
    ).toBeRejectedWithError(DESKTOP_DID_NOT_ANSWER);
    expect(pool.methods).toEqual(['ping']);
  });

  it('rejects an event that is not signed correctly', async () => {
    const pool = new FakeBunker(bunkerKey, userKey);
    pool.badSignature = true;

    await expectAsync(
      bunkerSignEvent(clientKey, pointer, template, { pool: fake(pool), timeoutMs: 1_000, desktop: {} }),
    ).toBeRejectedWithError(DESKTOP_BAD_SIGNATURE);
  });
});

class FakeBunker {
  silent = false;
  /** Methods this bunker never answers. */
  silentFor: string[] = [];
  badSignature = false;
  methods: string[] = [];
  calls: { method: string; params: string[] }[] = [];
  switchResult: unknown = undefined;
  switchError = '';
  #onevent: ((event: Event) => void) | undefined;

  constructor(
    private readonly bunkerKey: Uint8Array,
    private readonly userKey: Uint8Array,
  ) {}

  subscribe(
    _relays: string[],
    _filter: unknown,
    params: { onevent: (event: Event) => void; oneose?: () => void },
  ): { close: () => void } {
    this.#onevent = params.onevent;
    params.oneose?.();
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
    if (this.silentFor.includes(request.method)) {
      return;
    }
    this.methods.push(request.method);
    this.calls.push({ method: request.method, params: request.params });
    let result: unknown = 'ack';
    if (request.method === 'ping') {
      result = 'pong';
    }
    if (request.method === 'nip44_encrypt') {
      result = 'ciphertext';
    }
    if (request.method === 'get_public_key') {
      result = getPublicKey(this.userKey);
    }
    if (request.method === 'sign_event') {
      const template = JSON.parse(request.params[0]) as EventTemplate;
      const signed = finalizeEvent(template, this.userKey);
      result = JSON.stringify(this.badSignature ? { ...signed, content: 'changed' } : signed);
    }
    if (request.method === 'switch_relays') {
      result = this.switchResult;
    }
    const body = this.switchError && request.method === 'switch_relays'
      ? { id: request.id, error: this.switchError }
      : { id: request.id, result };
    const response = finalizeEvent(
      {
        kind: 24133,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', event.pubkey]],
        content: encrypt(JSON.stringify(body), conversationKey),
      },
      this.bunkerKey,
    );
    this.#onevent?.(response);
  }
}
