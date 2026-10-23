import { liveVaultFromSession } from './session-live';
import { BrowserSessionData } from '../services/storage/types';

describe('live vault', () => {
  it('publishes the bunker conversation key and the site question', () => {
    const session: BrowserSessionData = {
      iv: '',
      vaultPassword: 'secret',
      identities: ['phone'],
      permissions: [],
      sites: [],
      selectedIdentityId: 'phone',
      identity_phone: {
        id: 'phone',
        createdAt: '2020-01-01T00:00:00.000Z',
        nick: 'Phone',
        pubkey: 'aa'.repeat(32),
        bunker: {
          pubkey: 'bb'.repeat(32),
          relays: ['wss://relay.example.com'],
          secret: 'once',
          askSite: false,
          clientSecretKey: '11'.repeat(32),
          unlinked: true,
        },
      },
    };

    expect(liveVaultFromSession(session).identities[0].bunker).toEqual({
      pubkey: 'bb'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once',
      askSite: false,
      clientSecretKey: '11'.repeat(32),
    });
  });
});
