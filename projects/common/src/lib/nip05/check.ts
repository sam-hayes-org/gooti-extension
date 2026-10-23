export type Nip05Check = 'match' | 'mismatch' | 'unchecked';

const NIP05_REGEX = /^(?:([\w.+-]+)@)?([\w_-]+(\.[\w_-]+)+)$/;
const HEX_PUBKEY = /^[0-9a-f]{64}$/i;
const LOOKUP_TIMEOUT_MS = 8_000;

/**
 * Compare a bunker signing key with a NIP-05 address.
 * A failed lookup is `unchecked`, so the person can still decide.
 */
export async function checkNip05(
  address: string,
  pubkey: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Nip05Check> {
  const parsed = parseAddress(address);
  if (!parsed) {
    return 'unchecked';
  }

  let found: string | undefined;
  try {
    const url = `https://${parsed.domain}/.well-known/nostr.json?name=${encodeURIComponent(parsed.name)}`;
    const response = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      return 'unchecked';
    }
    found = pubkeyFromNames(await response.json(), parsed.name);
  } catch {
    return 'unchecked';
  }

  if (!found || !HEX_PUBKEY.test(found)) {
    return 'unchecked';
  }
  return found.toLowerCase() === pubkey.toLowerCase() ? 'match' : 'mismatch';
}

function parseAddress(address: string): { name: string; domain: string } | undefined {
  const match = address.trim().match(NIP05_REGEX);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }
  return { name: match[1].toLowerCase(), domain: match[2].toLowerCase() };
}

function pubkeyFromNames(body: unknown, name: string): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const names = (body as { names?: unknown }).names;
  if (!names || typeof names !== 'object') {
    return undefined;
  }
  for (const [key, value] of Object.entries(names)) {
    if (key.toLowerCase() === name && typeof value === 'string') {
      return value;
    }
  }
  return undefined;
}
