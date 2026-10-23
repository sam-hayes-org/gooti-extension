export const NIP07_METHODS = [
  'signEvent',
  'getPublicKey',
  'nip04.encrypt',
  'nip04.decrypt',
  'nip44.encrypt',
  'nip44.decrypt',
] as const;

export type Nip07Method = (typeof NIP07_METHODS)[number];

export function isNip07Method(method: unknown): method is Nip07Method {
  return typeof method === 'string' && (NIP07_METHODS as readonly string[]).includes(method);
}

export type Nip07MethodPolicy = 'allow' | 'deny';
