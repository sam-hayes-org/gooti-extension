export type Nip07Method =
  | 'signEvent'
  | 'getPublicKey'
  | 'getRelays'
  | 'nip04.encrypt'
  | 'nip04.decrypt'
  | 'nip44.encrypt'
  | 'nip44.decrypt';

export type Nip07MethodPolicy = 'allow' | 'deny';
