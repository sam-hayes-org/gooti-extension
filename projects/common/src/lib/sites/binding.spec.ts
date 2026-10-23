import { NostrHelper } from '../helpers/nostr-helper';
import { BrowserSessionData, Identity_DECRYPTED } from '../services/storage/types';
import { identityForSite, siteList } from './binding';

const PRIVKEY = '1'.padStart(64, '0');

function session(): BrowserSessionData {
  const ada: Identity_DECRYPTED = {
    id: 'id-ada',
    nick: 'Ada',
    createdAt: '2020-01-01T00:00:00.000Z',
    pubkey: NostrHelper.pubkeyFromPrivkey(PRIVKEY),
    privkey: PRIVKEY,
  };
  const data: BrowserSessionData = {
    iv: '',
    permissions: [],
    identities: [ada.id],
    sites: ['site-primal'],
    selectedIdentityId: ada.id,
  };
  data[`identity_${ada.id}`] = ada;
  data['site_site-primal'] = {
    id: 'site-primal',
    identityId: ada.id,
    host: 'primal.net',
  };
  return data;
}

describe('identityForSite', () => {
  it('returns the identity bound to the host', () => {
    expect(identityForSite(session(), 'primal.net')?.id).toBe('id-ada');
  });

  it('does not fall back to the selected identity', () => {
    const data = session();
    data.sites = [];
    delete data['site_site-primal'];
    expect(identityForSite(data, 'primal.net')).toBeUndefined();
    expect(identityForSite(data, null)).toBeUndefined();
    expect(identityForSite(undefined, 'primal.net')).toBeUndefined();
  });

  it('treats a binding whose identity is gone as unbound', () => {
    const data = session();
    delete data['identity_id-ada'];
    expect(identityForSite(data, 'primal.net')).toBeUndefined();
  });
});

describe('siteList', () => {
  it('lists every site with its identity, sorted by host', () => {
    const data = session();
    data.sites = ['site-primal', 'site-coracle'];
    data['site_site-coracle'] = { id: 'site-coracle', identityId: 'id-ada', host: 'coracle.social' };

    const list = siteList(data);

    expect(list.map((entry) => entry.host)).toEqual(['coracle.social', 'primal.net']);
    expect(list.map((entry) => entry.identity.id)).toEqual(['id-ada', 'id-ada']);
  });

  it('leaves out a site whose identity is gone', () => {
    const data = session();
    delete data['identity_id-ada'];
    expect(siteList(data)).toEqual([]);
    expect(siteList(undefined)).toEqual([]);
  });
});
