export type Nip07Method =
  | 'signEvent'
  | 'getPublicKey'
  | 'getRelays'
  | 'nip04.encrypt'
  | 'nip04.decrypt';

export type Nip07MethodPolicy = 'allow' | 'deny';
