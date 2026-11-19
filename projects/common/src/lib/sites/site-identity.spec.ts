import { BrowserSessionData } from '../services/storage/types';
import { lastUseByHost, lastUsedNote, splitIdentities } from './site-identity';

describe('site-only identities', () => {
  it('splits regular identities from site-only identities, in session order', () => {
    const session = {
      identities: ['a', 'b', 'c'],
      permissions: [],
      selectedIdentityId: null,
      iv: '',
      identity_a: { id: 'a', nick: 'Ada', pubkey: 'aa', createdAt: '' },
      identity_b: { id: 'b', nick: 'primal.net', pubkey: 'bb', createdAt: '', site: 'primal.net' },
      identity_c: { id: 'c', nick: 'Cy', pubkey: 'cc', createdAt: '' },
    } as unknown as BrowserSessionData;
    const groups = splitIdentities(session);
    expect(groups.regular.map((i) => i.id)).toEqual(['a', 'c']);
    expect(groups.site.map((i) => i.id)).toEqual(['b']);
  });

  it('keeps the newest request per host and skips backup rows', () => {
    const last = lastUseByHost([
      { at: 300, host: 'primal.net', method: 'signEvent', outcome: 'allowed' },
      { at: 900, backup: 'now', result: 'current' },
      { at: 100, host: 'primal.net', method: 'getPublicKey', outcome: 'allowed' },
      { at: 200, host: 'snort.social', method: 'getPublicKey', outcome: 'denied' },
    ]);
    expect(last.get('primal.net')).toBe(300);
    expect(last.get('snort.social')).toBe(200);
    expect(last.size).toBe(2);
  });

  it('says when a site-only identity was last used, in days', () => {
    const now = new Date(2026, 10, 16, 12, 0).getTime();
    expect(lastUsedNote(undefined, now)).toBeUndefined();
    expect(lastUsedNote(new Date(2026, 10, 16, 8, 0).getTime(), now)).toBe('Used today');
    expect(lastUsedNote(new Date(2026, 10, 15, 23, 0).getTime(), now)).toBe('Used yesterday');
    expect(lastUsedNote(new Date(2026, 10, 11, 9, 0).getTime(), now)).toBe('Used 5 days ago');
  });
});
