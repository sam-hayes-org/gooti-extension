import { checkNip05 } from './check';

const PUBKEY = '11'.repeat(32);
const OTHER = '22'.repeat(32);

describe('checkNip05', () => {
  it('matches the signing key when the address resolves to it', async () => {
    const urls: string[] = [];
    const result = await checkNip05('Alice@Example.com', PUBKEY.toUpperCase(), fake(urls, 200, {
      names: { Alice: PUBKEY },
    }));

    expect(result).toBe('match');
    expect(urls).toEqual(['https://example.com/.well-known/nostr.json?name=alice']);
  });

  it('reports a mismatch when the address is a different key', async () => {
    const result = await checkNip05('alice@example.com', PUBKEY, fake([], 200, {
      names: { alice: OTHER },
    }));

    expect(result).toBe('mismatch');
  });

  it('leaves the decision open when the address cannot be checked', async () => {
    expect(await checkNip05('not an address', PUBKEY, unusedFetch)).toBe('unchecked');
    expect(await checkNip05('alice@example.com', PUBKEY, fake([], 404, {}))).toBe('unchecked');
    expect(await checkNip05('alice@example.com', PUBKEY, fake([], 302, {
      names: { alice: OTHER },
    }))).toBe('unchecked');
    expect(await checkNip05('alice@example.com', PUBKEY, fake([], 200, {
      names: {},
    }))).toBe('unchecked');
    expect(await checkNip05('alice@example.com', PUBKEY, async () => {
      throw new Error('offline');
    })).toBe('unchecked');
  });
});

const unusedFetch: typeof fetch = async () => {
  throw new Error('lookup should not run');
};

function fake(urls: string[], status: number, body: unknown): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return { status, json: async () => body } as Response;
  }) as typeof fetch;
}
