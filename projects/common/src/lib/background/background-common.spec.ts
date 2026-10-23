import { BackgroundCommon } from './background-common';
import {
  BrowserSessionData,
  Identity_DECRYPTED,
  Permission_DECRYPTED,
} from '../services/storage/types';

class StubBackground extends BackgroundCommon {
  getBrowserSessionData(): Promise<BrowserSessionData | undefined> {
    return Promise.reject(new Error('unused'));
  }
  getBrowserSyncData(): Promise<never> {
    return Promise.reject(new Error('unused'));
  }
  savePermissionsToBrowserSyncStorage(): Promise<void> {
    return Promise.reject(new Error('unused'));
  }
  storePermission(): Promise<void> {
    return Promise.reject(new Error('unused'));
  }
  getPosition(): Promise<{
    left: number;
    top: number;
    width: number;
    height: number;
  }> {
    return Promise.reject(new Error('unused'));
  }
}

function sessionWith(permissions: Permission_DECRYPTED[]): BrowserSessionData {
  const identity: Identity_DECRYPTED = {
    id: 'id-1',
    nick: 'Ada',
    createdAt: '2020-01-01T00:00:00.000Z',
    pubkey: 'aa',
    privkey: 'aa',
  };
  const data: BrowserSessionData = {
    iv: '',
    permissions: permissions.map((permission) => permission.id),
    identities: [identity.id],
    selectedIdentityId: identity.id,
  };
  data[`identity_${identity.id}`] = identity;
  for (const permission of permissions) {
    data[`permission_${permission.id}`] = permission;
  }
  return data;
}

describe('BackgroundCommon permissions', () => {
  const background = new StubBackground();
  const identity: Identity_DECRYPTED = {
    id: 'id-1',
    nick: 'Ada',
    createdAt: '2020-01-01T00:00:00.000Z',
    pubkey: 'aa',
    privkey: 'aa',
  };

  it('lets a kind deny beat an allow-all', () => {
    const permissions: Permission_DECRYPTED[] = [
      {
        id: 'allow-all',
        identityId: 'id-1',
        host: 'app.example',
        method: 'signEvent',
        methodPolicy: 'allow',
      },
      {
        id: 'deny-kind',
        identityId: 'id-1',
        host: 'app.example',
        method: 'signEvent',
        methodPolicy: 'deny',
        kind: 1,
      },
    ];

    expect(
      background.checkPermissions(
        sessionWith(permissions),
        identity,
        'app.example',
        'signEvent',
        { kind: 1 },
      ),
    ).toBeFalse();
  });

  it('lets a host deny beat an allow for getPublicKey', () => {
    const permissions: Permission_DECRYPTED[] = [
      {
        id: 'allow',
        identityId: 'id-1',
        host: 'app.example',
        method: 'getPublicKey',
        methodPolicy: 'allow',
      },
      {
        id: 'deny',
        identityId: 'id-1',
        host: 'app.example',
        method: 'getPublicKey',
        methodPolicy: 'deny',
      },
    ];

    expect(
      background.checkPermissions(
        sessionWith(permissions),
        identity,
        'app.example',
        'getPublicKey',
        {},
      ),
    ).toBeFalse();
  });

  it('does not treat a stored allow as permission to delete or vanish', () => {
    const permissions: Permission_DECRYPTED[] = [
      {
        id: 'allow-all',
        identityId: 'id-1',
        host: 'app.example',
        method: 'signEvent',
        methodPolicy: 'allow',
      },
      {
        id: 'allow-delete',
        identityId: 'id-1',
        host: 'app.example',
        method: 'signEvent',
        methodPolicy: 'allow',
        kind: 5,
      },
    ];

    expect(
      background.checkPermissions(
        sessionWith(permissions),
        identity,
        'app.example',
        'signEvent',
        { kind: 5, content: 'gone' },
      ),
    ).toBeUndefined();
    expect(
      background.checkPermissions(
        sessionWith(permissions),
        identity,
        'app.example',
        'signEvent',
        { kind: 62 },
      ),
    ).toBeUndefined();
    expect(
      background.checkPermissions(
        sessionWith(permissions),
        identity,
        'app.example',
        'signEvent',
        { kind: 1, content: 'hi' },
      ),
    ).toBeTrue();
  });

  it('still blocks a deletion that was rejected', () => {
    const permissions: Permission_DECRYPTED[] = [
      {
        id: 'deny-delete',
        identityId: 'id-1',
        host: 'app.example',
        method: 'signEvent',
        methodPolicy: 'deny',
        kind: 5,
      },
    ];

    expect(
      background.checkPermissions(
        sessionWith(permissions),
        identity,
        'app.example',
        'signEvent',
        { kind: 5 },
      ),
    ).toBeFalse();
  });
});
