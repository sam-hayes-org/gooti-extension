import { BrowserSessionData, Identity_DECRYPTED } from '../services/storage/types';
import { checkThisBrowser, withBrowserKey } from './background';
import { DESKTOP_DID_NOT_ANSWER, DESKTOP_DISCONNECTED } from '../nip46/client';
import { LocalDevice } from '../backup/state';
import { bunkerUnlinked } from '../services/storage/related/devices';
import { browserCode } from '../backup/device';

const ALICE = 'aa'.repeat(32);
const SHARED = '11'.repeat(32);
const OWN = '22'.repeat(32);

function desktopIdentity(clientSecretKey?: string): Identity_DECRYPTED {
  return {
    id: 'id-alice',
    nick: 'Alice',
    pubkey: ALICE,
    createdAt: '2026-01-01T00:00:00.000Z',
    bunker: {
      pubkey: 'bb'.repeat(32),
      relays: ['wss://relay.getgooti.com'],
      secret: null,
      gootiDesktop: true,
      ...(clientSecretKey ? { clientSecretKey } : {}),
    },
  };
}

function session(device?: { browserKey?: string; desktopAllowed?: string[] }): BrowserSessionData {
  return {
    iv: '',
    identities: ['id-alice'],
    permissions: [],
    selectedIdentityId: null,
    ...(device
      ? {
          backupState: {
            signingKeyHex: '33'.repeat(32),
            encryptionKeyHex: '44'.repeat(32),
            relays: [],
            document: { v: 2, identities: [], permissions: [], relays: [], sites: [] },
            device: { id: '0a'.repeat(16), ...device },
          },
        }
      : {}),
  } as BrowserSessionData;
}

describe('a browser with its own key', () => {
  it('signs with its own key once Gooti Desktop allowed it for the identity', () => {
    const identity = desktopIdentity(SHARED);
    const used = withBrowserKey(session({ browserKey: OWN, desktopAllowed: [ALICE] }), identity);
    expect(used.bunker?.clientSecretKey).toBe(OWN);
    // In memory only: the stored identity keeps what it had.
    expect(identity.bunker?.clientSecretKey).toBe(SHARED);
  });

  it('keeps the shared key, or none, until the desktop allowed its own', () => {
    expect(withBrowserKey(session({ browserKey: OWN }), desktopIdentity(SHARED)).bunker?.clientSecretKey).toBe(SHARED);
    expect(withBrowserKey(session({ browserKey: OWN, desktopAllowed: ['cc'.repeat(32)] }), desktopIdentity()).bunker?.clientSecretKey).toBeUndefined();
    expect(withBrowserKey(session(), desktopIdentity(SHARED)).bunker?.clientSecretKey).toBe(SHARED);
  });

  it('never gives its key to a bunker that is not Gooti Desktop', () => {
    const phone = desktopIdentity('55'.repeat(32));
    delete phone.bunker?.gootiDesktop;
    const used = withBrowserKey(session({ browserKey: OWN, desktopAllowed: [ALICE] }), phone);
    expect(used.bunker?.clientSecretKey).toBe('55'.repeat(32));
  });

  it('shows a short code that reads the same everywhere', () => {
    const code = browserCode('eff37350d839ce3707332348af4549a96051bd695d3223af4aabce4993531d86');
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{3}-[0-9A-HJKMNP-TV-Z]{3}$/);
    expect(browserCode('eff37350d839ce3707332348af4549a96051bd695d3223af4aabce4993531d86')).toBe(code);
  });
});

describe('checking Gooti Desktop when the popup opens', () => {
  function background(data: BrowserSessionData) {
    const saved: LocalDevice[] = [];
    return {
      saved,
      common: {
        getBrowserSessionData: async () => data,
        saveBackupDevice: async (device: LocalDevice) => {
          saved.push(device);
        },
      },
    };
  }
  /** What the background does on a Disconnect, without the popup's note (no browser storage here). */
  const forget = async (common: {
    getBrowserSessionData(): Promise<BrowserSessionData | undefined>;
    saveBackupDevice(device: LocalDevice): Promise<void>;
  }) => {
    const device = (await common.getBrowserSessionData())?.backupState?.device as LocalDevice;
    await common.saveBackupDevice({ ...device, desktopAllowed: [] });
  };

  function allowed(): BrowserSessionData {
    const data = session({ browserKey: OWN, desktopAllowed: [ALICE] });
    data['identity_id-alice'] = desktopIdentity();
    return data;
  }

  it('forgets the allowance when the desktop disconnected this browser', async () => {
    const { saved, common } = background(allowed());
    let checked = '';
    await checkThisBrowser(
      common,
      10_000_000,
      async (key) => {
        checked = key;
        throw new Error(DESKTOP_DISCONNECTED);
      },
      forget,
    );
    expect(checked).toBe(OWN);
    expect(saved.map((device) => device.desktopAllowed)).toEqual([[]]);
    expect(saved[0].browserKey).toBe(OWN);
  });

  it('changes nothing when the desktop does not answer, and checks at most once a minute', async () => {
    const { saved, common } = background(allowed());
    let checks = 0;
    const check = async () => {
      checks++;
      throw new Error(DESKTOP_DID_NOT_ANSWER);
    };
    await checkThisBrowser(common, 20_000_000, check, forget);
    await checkThisBrowser(common, 20_030_000, check, forget);
    expect(checks).toBe(1);
    expect(saved).toEqual([]);
    await checkThisBrowser(common, 20_061_000, check, forget);
    expect(checks).toBe(2);
  });

  it('checks nothing for a browser the desktop has not allowed', async () => {
    const data = session({ browserKey: OWN });
    data['identity_id-alice'] = desktopIdentity();
    const { common } = background(data);
    let checks = 0;
    await checkThisBrowser(
      common,
      30_000_000,
      async () => {
        checks++;
      },
      forget,
    );
    expect(checks).toBe(0);
  });
});

describe('the bunker label', () => {
  it('calls a Gooti Desktop identity linked without a stored key, and another bunker unlinked', () => {
    const data = session({ browserKey: OWN, desktopAllowed: [ALICE] });
    expect(bunkerUnlinked(data, desktopIdentity())).toBeFalse();
    const phone = desktopIdentity();
    delete phone.bunker?.gootiDesktop;
    expect(bunkerUnlinked(data, phone)).toBeTrue();
    expect(bunkerUnlinked(data, desktopIdentity('55'.repeat(32)))).toBeFalse();
  });
});
