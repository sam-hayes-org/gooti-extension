import { BunkerForwarder, initializeBackground } from './background';
import { BackgroundCommon } from './background-common';
import { NostrHelper } from '../helpers/nostr-helper';
import { BUNKER_NOT_CONNECTED } from '../nip46/client';
import { PermissionCardSnapshot } from './permission-card';
import {
  BrowserSessionData,
  Identity_DECRYPTED,
  Permission_DECRYPTED,
} from '../services/storage/types';

const PRIVKEY = '1'.padStart(64, '0');

interface PopupOptions {
  url?: string;
  type?: string;
  width?: number;
  height?: number;
}

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => void;

interface TestChrome {
  runtime: {
    lastError?: { message: string };
    getURL: (path: string) => string;
    onMessage: {
      addListener: (listener: MessageListener) => void;
    };
  };
  windows: {
    create: (options: PopupOptions, callback: () => void) => void;
  };
}

const listeners: MessageListener[] = [];
const created: PopupOptions[] = [];
const storedPermissions: string[] = [];
const forwarded: string[] = [];
let session: BrowserSessionData | undefined;
let createError: string | undefined;

function testChrome(): TestChrome {
  return (globalThis as unknown as { chrome: TestChrome }).chrome;
}

function unlockedSession(): BrowserSessionData {
  const identity: Identity_DECRYPTED = {
    id: 'id-1',
    nick: 'Ada',
    createdAt: '2020-01-01T00:00:00.000Z',
    pubkey: NostrHelper.pubkeyFromPrivkey(PRIVKEY),
    privkey: PRIVKEY,
  };
  const permission: Permission_DECRYPTED = {
    id: 'perm-1',
    identityId: identity.id,
    host: 'primal.net',
    method: 'getPublicKey',
    methodPolicy: 'allow',
  };
  const data: BrowserSessionData = {
    iv: '',
    permissions: [permission.id],
    identities: [identity.id],
    selectedIdentityId: identity.id,
  };
  data[`identity_${identity.id}`] = identity;
  data[`permission_${permission.id}`] = permission;
  return rememberSite(data, identity.id);
}

function disconnectedBunkerSession(): BrowserSessionData {
  const identity: Identity_DECRYPTED = {
    id: 'id-bunker',
    nick: 'Phone',
    createdAt: '2020-01-01T00:00:00.000Z',
    pubkey: 'aa'.repeat(32),
    bunker: {
      pubkey: 'bb'.repeat(32),
      relays: ['wss://relay.example.com'],
      secret: 'once',
    },
  };
  const permissions: Permission_DECRYPTED[] = [
    {
      id: 'perm-pub',
      identityId: identity.id,
      host: 'primal.net',
      method: 'getPublicKey',
      methodPolicy: 'allow',
    },
  ];
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
  return rememberSite(data, identity.id);
}

function connectedBunkerSession(): BrowserSessionData {
  const data = disconnectedBunkerSession();
  const identity = data['identity_id-bunker'];
  if (!identity?.bunker) {
    throw new Error('Bunker session is missing its identity.');
  }
  identity.bunker = {
    ...identity.bunker,
    clientSecretKey: '11'.repeat(32),
  };
  data.permissions = [];
  delete data['permission_perm-pub'];
  return data;
}

function straightBunkerSession(): BrowserSessionData {
  const data = connectedBunkerSession();
  const identity = data['identity_id-bunker'];
  if (!identity?.bunker) {
    throw new Error('Bunker session is missing its identity.');
  }
  identity.bunker = { ...identity.bunker, askSite: false };
  return data;
}

function sessionWithoutPermission(): BrowserSessionData {
  const data = unlockedSession();
  data.permissions = [];
  delete data['permission_perm-1'];
  return data;
}

const BOB_KEY = '2'.padStart(64, '0');

function allow(
  data: BrowserSessionData,
  identityId: string,
  host: string,
  method: Permission_DECRYPTED['method'],
): Permission_DECRYPTED {
  const permission: Permission_DECRYPTED = {
    id: `allow-${data.permissions.length + 1}`,
    identityId,
    host,
    method,
    methodPolicy: 'allow',
  };
  data.permissions = [...data.permissions, permission.id];
  data[`permission_${permission.id}`] = permission;
  return permission;
}

function pair(selected: 'ada' | 'bob'): BrowserSessionData {
  const ada: Identity_DECRYPTED = {
    id: 'id-ada',
    nick: 'Ada',
    createdAt: '2020-01-01T00:00:00.000Z',
    pubkey: NostrHelper.pubkeyFromPrivkey(PRIVKEY),
    privkey: PRIVKEY,
  };
  const bob: Identity_DECRYPTED = {
    id: 'id-bob',
    nick: 'Bob',
    createdAt: '2020-01-01T00:00:00.000Z',
    pubkey: NostrHelper.pubkeyFromPrivkey(BOB_KEY),
    privkey: BOB_KEY,
  };
  const data: BrowserSessionData = {
    iv: '',
    permissions: [],
    identities: [ada.id, bob.id],
    sites: [],
    selectedIdentityId: selected === 'ada' ? ada.id : bob.id,
  };
  data[`identity_${ada.id}`] = ada;
  data[`identity_${bob.id}`] = bob;
  return data;
}

function rememberSite(data: BrowserSessionData, identityId: string): BrowserSessionData {
  return bindHost(data, 'primal.net', identityId);
}

function bindHost(data: BrowserSessionData, host: string, identityId: string): BrowserSessionData {
  const site = { id: 'site-primal', identityId, host };
  data.sites = ['site-primal'];
  data[`site_${site.id}`] = site;
  return data;
}

function boundTo(host: string): string | undefined {
  for (const id of session?.sites ?? []) {
    const site = session?.[`site_${id}`];
    if (site?.host === host) {
      return site.identityId;
    }
  }
  return undefined;
}

class Harness extends BackgroundCommon {
  override getBrowserSessionData(): Promise<BrowserSessionData | undefined> {
    return Promise.resolve(session);
  }
  override getBrowserSyncData(): Promise<never> {
    return Promise.reject(new Error('unused'));
  }
  override savePermissionsToBrowserSyncStorage(): Promise<void> {
    return Promise.reject(new Error('unused'));
  }
  override storePermission(
    data: BrowserSessionData,
    identity: Identity_DECRYPTED,
    host: string,
    method: Permission_DECRYPTED['method'],
    methodPolicy: Permission_DECRYPTED['methodPolicy'],
    kind?: number,
  ): Promise<void> {
    const kindLabel = typeof kind === 'number' ? String(kind) : '';
    storedPermissions.push(`${host}:${method}:${methodPolicy}:${kindLabel}`);
    const id = `stored-${storedPermissions.length}`;
    const permission: Permission_DECRYPTED = {
      id,
      identityId: identity.id,
      host,
      method,
      methodPolicy,
      ...(typeof kind === 'number' ? { kind } : {}),
    };
    data.permissions = [...data.permissions, id];
    data[`permission_${id}`] = permission;
    return Promise.resolve();
  }
  override saveSiteBinding(
    host: string,
    identity: Identity_DECRYPTED,
    replace: boolean,
  ): Promise<void> {
    const data = session;
    if (!data) {
      return Promise.resolve();
    }
    const ids = [...(data.sites ?? [])];
    const existingId = ids.find((id) => data[`site_${id}`]?.host === host);
    const existing = existingId ? data[`site_${existingId}`] : undefined;
    const live = !!existing && !!data[`identity_${existing.identityId}`];
    if (existing && live && !replace) {
      return Promise.resolve();
    }
    const id = existing?.id ?? `site-${ids.length + 1}`;
    const kept = ids.filter((item) => data[`site_${item}`]?.host !== host);
    for (const item of ids) {
      if (!kept.includes(item) && item !== id) {
        delete data[`site_${item}`];
      }
    }
    data.sites = [...kept, id];
    data[`site_${id}`] = { id, identityId: identity.id, host };
    return Promise.resolve();
  }
  override clearSiteBinding(host: string): Promise<void> {
    const data = session;
    if (!data) {
      return Promise.resolve();
    }
    const ids = [...(data.sites ?? [])];
    const kept = ids.filter((id) => data[`site_${id}`]?.host !== host);
    for (const id of ids) {
      if (!kept.includes(id)) {
        delete data[`site_${id}`];
      }
    }
    data.sites = kept;
    return Promise.resolve();
  }
  override getPosition(
    width: number,
    height: number,
  ): Promise<{ left: number; top: number; width: number; height: number }> {
    return Promise.resolve({ left: 10, top: 20, width, height });
  }
}

function dispatch(message: unknown): Promise<unknown> {
  const listener = listeners[0];
  return new Promise((resolve, reject) => {
    listener(message, {}, (response) => {
      if (
        response &&
        typeof response === 'object' &&
        '__mozWebExtensionPolyfillReject__' in response
      ) {
        const failure = response as { message?: string };
        reject(new Error(failure.message ?? 'rejected'));
        return;
      }
      resolve(response);
    });
  });
}

function nip07(): Promise<unknown> {
  return dispatch({
    method: 'getPublicKey',
    params: {},
    host: 'primal.net',
  });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function note(content: string, createdAt = 1_700_000_000) {
  return {
    method: 'signEvent',
    params: { kind: 1, content, tags: [], created_at: createdAt },
    host: 'primal.net',
  };
}

function popupId(url: string | undefined): string {
  if (!url) {
    throw new Error('No unlock window was opened.');
  }
  const id = new URL(url, 'https://gooti.test').searchParams.get('id');
  if (!id) {
    throw new Error(`Unlock window has no id: ${url}`);
  }
  return id;
}

function latestPopupId(): string {
  return popupId(created[created.length - 1]?.url);
}

describe('shared vault unlock', () => {
  const pubkey = NostrHelper.pubkeyFromPrivkey(PRIVKEY);

  beforeAll(() => {
    const chrome = testChrome();
    chrome.runtime.getURL = (path: string) => `https://gooti.test/${path}`;
    chrome.runtime.onMessage = {
      addListener(listener: MessageListener) {
        listeners.push(listener);
      },
    };
    chrome.windows = {
      create(options: PopupOptions, callback: () => void) {
        created.push(options);
        if (createError) {
          chrome.runtime.lastError = { message: createError };
          callback();
          delete chrome.runtime.lastError;
          return;
        }
        callback();
      },
    };
    const answered = (method: string) => async () => {
      forwarded.push(method);
      return { id: 'from-bunker' };
    };
    initializeBackground(new Harness(), {
      signEvent: answered('signEvent'),
      nip04Encrypt: answered('nip04.encrypt'),
      nip04Decrypt: answered('nip04.decrypt'),
      nip44Encrypt: answered('nip44.encrypt'),
      nip44Decrypt: answered('nip44.decrypt'),
    } as unknown as BunkerForwarder);
  });

  beforeEach(() => {
    created.length = 0;
    storedPermissions.length = 0;
    forwarded.length = 0;
    session = undefined;
    createError = undefined;
  });

  it('opens one unlock window for concurrent calls', async () => {
    const first = nip07();
    const second = nip07();
    const third = nip07();
    await flush();

    expect(created.length).toBe(1);
    expect(created[0].url).toContain('index.html?source=background&id=');
    expect(created[0].width).toBe(475);
    expect(created[0].height).toBe(600);

    session = unlockedSession();
    const closed = dispatch({ id: latestPopupId(), response: 'unlocked' });
    const pubs = await Promise.all([first, second, third, closed]);

    expect(pubs.slice(0, 3)).toEqual([pubkey, pubkey, pubkey]);
    expect(created.length).toBe(1);
  });

  it('does not open a window when the vault is already unlocked', async () => {
    session = unlockedSession();

    await expectAsync(nip07()).toBeResolvedTo(pubkey);
    expect(created.length).toBe(0);
  });

  it('fails waiters once when the unlock window is dismissed', async () => {
    const first = nip07();
    const second = nip07();
    await flush();
    expect(created.length).toBe(1);

    const closed = dispatch({ id: latestPopupId(), response: 'locked' });
    await expectAsync(first).toBeRejectedWithError(
      'Vault unlock was dismissed.',
    );
    await expectAsync(second).toBeRejectedWithError(
      'Vault unlock was dismissed.',
    );
    await closed;
    expect(created.length).toBe(1);

    const retry = nip07();
    await flush();
    expect(created.length).toBe(2);

    session = unlockedSession();
    await dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(retry).toBeResolvedTo(pubkey);
  });

  it('does not open another window when unlock reports success without a session', async () => {
    const first = nip07();
    await flush();

    const closed = dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(first).toBeRejectedWithError('Vault is locked.');
    await closed;
    expect(created.length).toBe(1);
  });

  it('lets a later call open a window after creation fails', async () => {
    createError = 'popup failed';
    await expectAsync(nip07()).toBeRejectedWithError('popup failed');
    expect(created.length).toBe(1);

    createError = undefined;
    const retry = nip07();
    await flush();
    expect(created.length).toBe(2);

    const closed = dispatch({ id: latestPopupId(), response: 'locked' });
    await expectAsync(retry).toBeRejectedWithError(
      'Vault unlock was dismissed.',
    );
    await closed;
  });

  it('opens one permission window for concurrent getPublicKey calls', async () => {
    session = sessionWithoutPermission();
    const first = nip07();
    const second = nip07();
    const third = nip07();
    await flush();

    expect(created.length).toBe(1);
    expect(created[0].url).toContain('prompt.html?method=getPublicKey');
    expect(created[0].width).toBe(375);

    const closed = dispatch({ id: latestPopupId(), response: 'approve' });
    const pubs = await Promise.all([first, second, third, closed]);

    expect(pubs.slice(0, 3)).toEqual([pubkey, pubkey, pubkey]);
    expect(created.length).toBe(1);
    expect(storedPermissions).toEqual(['primal.net:getPublicKey:allow:']);
  });

  async function shownCard(): Promise<PermissionCardSnapshot> {
    const snapshot = (await dispatch({
      type: 'card-ready',
      id: latestPopupId(),
    })) as PermissionCardSnapshot;
    await dispatch({
      type: 'card-shown',
      id: latestPopupId(),
      count: snapshot.lines.length,
    });
    return snapshot;
  }

  it('opens one card for a burst and lists every event', async () => {
    session = sessionWithoutPermission();
    const first = dispatch(note('a', 1));
    const second = dispatch(note('b', 2));
    const otherKind = dispatch({
      method: 'signEvent',
      params: { kind: 3, content: 'c', created_at: 3, tags: [] },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('card=1');
    expect(created[0].url).not.toContain('bunker=1');

    const snapshot = await shownCard();
    expect(snapshot.lines).toEqual([
      jasmine.objectContaining({ headline: 'Publish this note', detail: 'a' }),
      jasmine.objectContaining({ headline: 'Publish this note', detail: 'b' }),
      jasmine.objectContaining({ headline: 'Sign a kind 3 event', detail: 'c' }),
    ]);

    const dismiss = dispatch({
      id: latestPopupId(),
      response: 'reject-once',
    });
    await expectAsync(first).toBeRejectedWithError('Permission denied');
    await expectAsync(second).toBeRejectedWithError('Permission denied');
    await expectAsync(otherKind).toBeRejectedWithError('Permission denied');
    await dismiss;
    expect(created.length).toBe(1);
    expect(storedPermissions).toEqual([]);
  });

  it('sends a straight bunker request to the phone without a browser prompt', async () => {
    session = straightBunkerSession();
    const denied: Permission_DECRYPTED = {
      id: 'perm-deny',
      identityId: 'id-bunker',
      host: 'primal.net',
      method: 'signEvent',
      methodPolicy: 'deny',
      kind: 1,
    };
    session.permissions = [denied.id];
    session[`permission_${denied.id}`] = denied;

    const first = dispatch({
      method: 'signEvent',
      params: { kind: 1, content: 'a', created_at: 1 },
      host: 'primal.net',
    });
    const deletion = dispatch({
      method: 'signEvent',
      params: { kind: 5, content: 'gone', created_at: 2 },
      host: 'primal.net',
    });

    await expectAsync(first).toBeResolvedTo({ id: 'from-bunker' });
    await expectAsync(deletion).toBeResolvedTo({ id: 'from-bunker' });
    expect(created.length).toBe(0);
    expect(storedPermissions).toEqual([]);
    expect(forwarded).toEqual(['signEvent', 'signEvent']);
  });

  it('does not open another permission window when the prompt is dismissed', async () => {
    session = sessionWithoutPermission();
    const first = nip07();
    const second = nip07();
    await flush();
    expect(created.length).toBe(1);

    const closed = dispatch({ id: latestPopupId(), response: 'reject-once' });
    await expectAsync(first).toBeRejectedWithError('Permission denied');
    await expectAsync(second).toBeRejectedWithError('Permission denied');
    await closed;
    expect(created.length).toBe(1);
    expect(storedPermissions).toEqual([]);

    const retry = nip07();
    await flush();
    expect(created.length).toBe(2);
    const dismissed = dispatch({
      id: latestPopupId(),
      response: 'reject-once',
    });
    await expectAsync(retry).toBeRejectedWithError('Permission denied');
    await dismissed;
  });

  it('answers a disconnected bunker locally and skips the permission prompt for signing', async () => {
    session = disconnectedBunkerSession();

    await expectAsync(nip07()).toBeResolvedTo('aa'.repeat(32));
    await expectAsync(
      dispatch({ method: 'getRelays', params: {}, host: 'primal.net' }),
    ).toBeRejectedWithError("Not supported request method 'getRelays'.");
    expect(created.length).toBe(0);

    for (const method of [
      'signEvent',
      'nip04.encrypt',
      'nip04.decrypt',
      'nip44.encrypt',
      'nip44.decrypt',
    ]) {
      await expectAsync(
        dispatch({ method, params: {}, host: 'primal.net' }),
      ).toBeRejectedWithError(BUNKER_NOT_CONNECTED);
    }
    expect(created.length).toBe(0);
    expect(storedPermissions).toEqual([]);
  });

  it('keeps the public-key prompt and asks which site may sign', async () => {
    session = connectedBunkerSession();

    const pub = dispatch({
      method: 'getPublicKey',
      params: {},
      host: 'primal.net',
    });
    await flush();
    expect(created[0].url).toContain('method=getPublicKey');
    expect(created[0].url).not.toContain('bunker=1');
    const closed = dispatch({ id: latestPopupId(), response: 'reject-once' });
    await expectAsync(pub).toBeRejectedWithError('Permission denied');
    await closed;

    const sign = dispatch({
      method: 'signEvent',
      params: { kind: 1, content: 'hello' },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(2);
    expect(created[1].url).toContain('bunker=1');
    expect(created[1].url).toContain('ask=sign');
    expect(created[1].url).not.toContain('card=1');
    expect(created[1].url).not.toContain('event=');
    expect(created[1].url).not.toContain('hello');
    const dismissed = dispatch({ id: popupId(created[1].url), response: 'reject-once' });
    await expectAsync(sign).toBeRejectedWithError('Permission denied');
    await dismissed;
    expect(forwarded).toEqual([]);
    expect(storedPermissions).toEqual([]);
  });

  it('asks once which site may sign, then sends later kinds to the phone', async () => {
    session = connectedBunkerSession();
    const note = dispatch({
      method: 'signEvent',
      params: { kind: 1, content: 'hello' },
      host: 'primal.net',
    });
    const reaction = dispatch({
      method: 'signEvent',
      params: { kind: 7, content: '+' },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('ask=sign');

    const approved = dispatch({ id: latestPopupId(), response: 'approve' });
    await expectAsync(note).toBeResolvedTo({ id: 'from-bunker' });
    await expectAsync(reaction).toBeResolvedTo({ id: 'from-bunker' });
    await approved;
    expect(storedPermissions).toEqual(['primal.net:signEvent:allow:']);

    const follow = dispatch({
      method: 'signEvent',
      params: { kind: 3, content: 'follow' },
      host: 'primal.net',
    });
    await expectAsync(follow).toBeResolvedTo({ id: 'from-bunker' });
    expect(created.length).toBe(1);

    const deletion = dispatch({
      method: 'signEvent',
      params: { kind: 5, content: 'gone' },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(2);
    expect(created[1].url).toContain('ask=delete');
    expect(created[1].url).not.toContain('gone');
    const approvedDelete = dispatch({ id: popupId(created[1].url), response: 'approve' });
    await expectAsync(deletion).toBeResolvedTo({ id: 'from-bunker' });
    await approvedDelete;
    expect(storedPermissions).toEqual(['primal.net:signEvent:allow:']);
    expect(forwarded).toEqual(['signEvent', 'signEvent', 'signEvent', 'signEvent']);
  });

  it('asks once which site may encrypt and keeps the message off the prompt', async () => {
    session = connectedBunkerSession();
    const first = dispatch({
      method: 'nip44.encrypt',
      params: { peerPubkey: 'ab', plaintext: 'secret words' },
      host: 'primal.net',
    });
    await flush();
    expect(created[0].url).toContain('ask=encrypt');
    expect(created[0].url).not.toContain('secret');
    const approved = dispatch({ id: latestPopupId(), response: 'approve' });
    await expectAsync(first).toBeResolvedTo({ id: 'from-bunker' });
    await approved;
    expect(storedPermissions).toEqual(['primal.net:nip44.encrypt:allow:']);

    const second = dispatch({
      method: 'nip44.encrypt',
      params: { peerPubkey: 'ab', plaintext: 'again' },
      host: 'primal.net',
    });
    await expectAsync(second).toBeResolvedTo({ id: 'from-bunker' });
    expect(created.length).toBe(1);
    expect(forwarded).toEqual(['nip44.encrypt', 'nip44.encrypt']);
  });

  it('remembers a bunker site rejection for later signatures', async () => {
    session = connectedBunkerSession();
    const sign = dispatch({
      method: 'signEvent',
      params: { kind: 1, content: 'hello' },
      host: 'primal.net',
    });
    await flush();
    const rejected = dispatch({ id: latestPopupId(), response: 'reject' });
    await expectAsync(sign).toBeRejectedWithError('Permission denied');
    await rejected;
    expect(storedPermissions).toEqual(['primal.net:signEvent:deny:']);
    expect(forwarded).toEqual([]);

    const again = dispatch({
      method: 'signEvent',
      params: { kind: 7, content: '+' },
      host: 'primal.net',
    });
    await expectAsync(again).toBeRejectedWithError('Permission denied');
    expect(created.length).toBe(1);
    expect(forwarded).toEqual([]);
  });

  it('keeps the local sign prompt for a private key', async () => {
    session = sessionWithoutPermission();
    const sign = dispatch({
      method: 'signEvent',
      params: { kind: 1 },
      host: 'primal.net',
    });
    await flush();
    expect(created[0].url).toContain('card=1');
    expect(created[0].url).not.toContain('bunker=1');
    const closed = dispatch({ id: latestPopupId(), response: 'reject-once' });
    await expectAsync(sign).toBeRejectedWithError('Permission denied');
    await closed;
  });

  it('remembers a note and not a deletion on the same card', async () => {
    session = sessionWithoutPermission();
    const published = dispatch(note('hi'));
    const deletion = dispatch({
      method: 'signEvent',
      params: { kind: 5, content: 'gone', tags: [], created_at: 1_700_000_001 },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(1);
    const snapshot = await shownCard();
    expect(snapshot.lines.map((line) => line.headline)).toEqual([
      'Publish this note',
      'Delete this note',
    ]);
    expect(snapshot.lines[1].danger).toBeTrue();

    const closed = dispatch({ id: latestPopupId(), response: 'approve' });
    const signed = await published;
    await deletion;
    await closed;
    expect(signed).toEqual(jasmine.objectContaining({ kind: 1, content: 'hi' }));
    expect(storedPermissions).toEqual(['primal.net:signEvent:allow:1']);
  });

  it('asks again for a deletion that was allowed before', async () => {
    session = sessionWithoutPermission();
    const allow: Permission_DECRYPTED = {
      id: 'perm-sign',
      identityId: 'id-1',
      host: 'primal.net',
      method: 'signEvent',
      methodPolicy: 'allow',
      kind: 1,
    };
    const allowDelete: Permission_DECRYPTED = {
      id: 'perm-delete',
      identityId: 'id-1',
      host: 'primal.net',
      method: 'signEvent',
      methodPolicy: 'allow',
      kind: 5,
    };
    session.permissions = [allow.id, allowDelete.id];
    session[`permission_${allow.id}`] = allow;
    session[`permission_${allowDelete.id}`] = allowDelete;

    const published = dispatch(note('hi'));
    const deletion = dispatch({
      method: 'signEvent',
      params: { kind: 5, content: 'gone', tags: [], created_at: 1_700_000_002 },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(1);
    const snapshot = await shownCard();
    expect(snapshot.lines).toEqual([
      jasmine.objectContaining({ headline: 'Delete this note', detail: 'gone' }),
    ]);
    await expectAsync(published).toBeResolved();

    const closed = dispatch({ id: latestPopupId(), response: 'reject-once' });
    await expectAsync(deletion).toBeRejectedWithError('Permission denied');
    await closed;
    expect(storedPermissions).toEqual([]);
  });

  it('leaves an event that arrives after the card is shown for the next card', async () => {
    session = sessionWithoutPermission();
    const published = dispatch(note('hi'));
    await flush();
    await shownCard();

    const deletion = dispatch({
      method: 'signEvent',
      params: { kind: 5, content: 'late', tags: [], created_at: 1_700_000_003 },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(1);

    const closed = dispatch({ id: latestPopupId(), response: 'approve' });
    await expectAsync(published).toBeResolved();
    await closed;
    await flush();
    expect(created.length).toBe(2);
    expect(storedPermissions).toEqual(['primal.net:signEvent:allow:1']);

    const dismissed = dispatch({
      id: latestPopupId(),
      response: 'reject-once',
    });
    await expectAsync(deletion).toBeRejectedWithError('Permission denied');
    await dismissed;
  });

  it('puts an encryption on the same card as a signature', async () => {
    session = sessionWithoutPermission();
    const published = dispatch(note('hi'));
    const encrypted = dispatch({
      method: 'nip04.encrypt',
      params: {
        peerPubkey: '4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa',
        plaintext: 'secret',
      },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(1);
    const snapshot = await shownCard();
    expect(snapshot.lines[0].headline).toBe('Publish this note');
    expect(snapshot.lines[1].headline.startsWith('Encrypt a message to npub1')).toBeTrue();
    expect(snapshot.lines[1].detail).toBe('secret');

    const closed = dispatch({ id: latestPopupId(), response: 'reject-once' });
    await expectAsync(published).toBeRejectedWithError('Permission denied');
    await expectAsync(encrypted).toBeRejectedWithError('Permission denied');
    await closed;
  });

  it('keeps a binding after a successful call and after a denial', async () => {
    session = unlockedSession();
    await expectAsync(nip07()).toBeResolvedTo(pubkey);
    expect(boundTo('primal.net')).toBe('id-1');

    session = sessionWithoutPermission();
    const denied = nip07();
    await flush();
    expect(created[0].url).toContain('prompt.html');
    const closed = dispatch({ id: latestPopupId(), response: 'reject' });
    await expectAsync(denied).toBeRejectedWithError('Permission denied');
    await closed;
    expect(boundTo('primal.net')).toBe('id-1');
  });

  it('stores a binding when just once still returns the public key', async () => {
    session = sessionWithoutPermission();
    const pending = nip07();
    await flush();
    const closed = dispatch({ id: latestPopupId(), response: 'approve-once' });
    await expectAsync(pending).toBeResolvedTo(pubkey);
    await closed;
    expect(storedPermissions).toEqual([]);
    expect(boundTo('primal.net')).toBe('id-1');
  });

  it('keeps the binding when an unlinked bunker cannot sign', async () => {
    session = disconnectedBunkerSession();
    await expectAsync(
      dispatch({
        method: 'signEvent',
        params: { kind: 1, content: 'x', created_at: 1, tags: [] },
        host: 'primal.net',
      }),
    ).toBeRejectedWithError(BUNKER_NOT_CONNECTED);
    expect(boundTo('primal.net')).toBe('id-bunker');
    expect(created.length).toBe(0);
  });

  it('rejects an unknown method before opening a window', async () => {
    await expectAsync(
      dispatch({ method: 'getRelays', params: {}, host: 'primal.net' }),
    ).toBeRejectedWithError("Not supported request method 'getRelays'.");
    expect(created.length).toBe(0);
  });

  it('rejects a request with no website before opening a window', async () => {
    session = unlockedSession();
    await expectAsync(
      dispatch({ method: 'getPublicKey', params: {}, host: '' }),
    ).toBeRejectedWithError('Permission denied');
    expect(created.length).toBe(0);
  });

  it('clears one site so the next call asks for an identity again', async () => {
    session = unlockedSession();
    expect(boundTo('primal.net')).toBe('id-1');
    await dispatch({ type: 'clear-site', host: 'other.example' });
    expect(boundTo('primal.net')).toBe('id-1');

    await dispatch({ type: 'clear-site', host: 'primal.net' });
    expect(boundTo('primal.net')).toBeUndefined();
    expect(session['permission_perm-1']?.methodPolicy).toBe('allow');

    const pending = nip07();
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('host=primal.net');
    const closed = dispatch({ id: latestPopupId(), response: 'locked' });
    await expectAsync(pending).toBeRejectedWithError('Vault unlock was dismissed.');
    await closed;
    expect(boundTo('primal.net')).toBeUndefined();
  });

  it('opens a picker for an unbound site and saves nothing when it is dismissed', async () => {
    session = unlockedSession();
    session.sites = [];
    delete session['site_site-primal'];
    const pending = nip07();
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('source=background');
    expect(created[0].url).toContain('host=primal.net');
    expect(boundTo('primal.net')).toBeUndefined();

    const closed = dispatch({ id: latestPopupId(), response: 'locked' });
    await expectAsync(pending).toBeRejectedWithError('Vault unlock was dismissed.');
    await closed;
    expect(boundTo('primal.net')).toBeUndefined();
    expect(created.length).toBe(1);
  });

  it('uses the identity named by the picker, not the selected identity', async () => {
    const adaPub = NostrHelper.pubkeyFromPrivkey(PRIVKEY);
    session = pair('bob');
    allow(session, 'id-ada', 'primal.net', 'getPublicKey');
    const pending = nip07();
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('host=primal.net');
    expect(boundTo('primal.net')).toBeUndefined();

    await dispatch({ type: 'bind-site', host: 'primal.net', identityId: 'id-ada' });
    await dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(pending).toBeResolvedTo(adaPub);
    expect(boundTo('primal.net')).toBe('id-ada');
    expect(created.length).toBe(1);
  });

  it('leaves the binding when a chosen unlinked bunker cannot sign', async () => {
    session = disconnectedBunkerSession();
    session.sites = [];
    delete session['site_site-primal'];
    const pending = dispatch({
      method: 'signEvent',
      params: { kind: 1, content: 'x', created_at: 1, tags: [] },
      host: 'primal.net',
    });
    await flush();
    expect(created.length).toBe(1);

    await dispatch({
      type: 'bind-site',
      host: 'primal.net',
      identityId: 'id-bunker',
    });
    await dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(pending).toBeRejectedWithError(BUNKER_NOT_CONNECTED);
    expect(boundTo('primal.net')).toBe('id-bunker');
    expect(created.length).toBe(1);
  });

  it('opens another picker when a second host is still unbound', async () => {
    session = unlockedSession();
    session.sites = [];
    delete session['site_site-primal'];
    const primal = nip07();
    const snort = dispatch({
      method: 'getPublicKey',
      params: {},
      host: 'snort.social',
    });
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('host=primal.net');
    expect(created[0].url).not.toContain('snort.social');

    await dispatch({ type: 'bind-site', host: 'primal.net', identityId: 'id-1' });
    await dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(primal).toBeResolvedTo(pubkey);
    await flush();
    expect(created.length).toBe(2);
    expect(created[1].url).toContain('host=snort.social');
    expect(boundTo('snort.social')).toBeUndefined();

    allow(session, 'id-1', 'snort.social', 'getPublicKey');
    await dispatch({ type: 'bind-site', host: 'snort.social', identityId: 'id-1' });
    await dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(snort).toBeResolvedTo(pubkey);
    expect(created.length).toBe(2);
    expect(boundTo('primal.net')).toBe('id-1');
    expect(boundTo('snort.social')).toBe('id-1');
  });

  it('uses the bound identity and ignores the selected identity allow', async () => {
    const adaPub = NostrHelper.pubkeyFromPrivkey(PRIVKEY);
    session = pair('bob');
    bindHost(session, 'primal.net', 'id-ada');
    allow(session, 'id-ada', 'primal.net', 'getPublicKey');
    allow(session, 'id-ada', 'primal.net', 'signEvent');

    await expectAsync(nip07()).toBeResolvedTo(adaPub);
    const signed = await dispatch(note('hi'));
    expect((signed as { pubkey: string }).pubkey).toBe(adaPub);
    expect(created.length).toBe(0);

    session = pair('bob');
    bindHost(session, 'primal.net', 'id-ada');
    const bobsAllow = allow(session, 'id-bob', 'primal.net', 'getPublicKey');
    const pending = nip07();
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('nick=Ada');
    const closed = dispatch({ id: latestPopupId(), response: 'reject' });
    await expectAsync(pending).toBeRejectedWithError('Permission denied');
    await closed;
    expect(boundTo('primal.net')).toBe('id-ada');
    expect(session[`permission_${bobsAllow.id}`]?.identityId).toBe('id-bob');
  });

  it('moves the host to the named identity and keeps the previous allow', async () => {
    session = pair('bob');
    bindHost(session, 'primal.net', 'id-ada');
    const adasAllow = allow(session, 'id-ada', 'primal.net', 'getPublicKey');

    await dispatch({ type: 'bind-site', host: 'primal.net' });
    expect(boundTo('primal.net')).toBe('id-ada');
    await dispatch({ type: 'bind-site', host: 'primal.net', identityId: 'missing' });
    expect(boundTo('primal.net')).toBe('id-ada');
    await dispatch({ type: 'bind-site', host: 'primal.net', identityId: 'id-bob' });
    expect(boundTo('primal.net')).toBe('id-bob');
    expect(session[`permission_${adasAllow.id}`]?.identityId).toBe('id-ada');
    expect(session[`permission_${adasAllow.id}`]?.methodPolicy).toBe('allow');

    const pending = nip07();
    await flush();
    expect(created.length).toBe(1);
    expect(created[0].url).toContain('nick=Bob');
    const closed = dispatch({ id: latestPopupId(), response: 'reject-once' });
    await expectAsync(pending).toBeRejectedWithError('Permission denied');
    await closed;
  });

  it('binds the identity chosen after a binding is dropped', async () => {
    const bobPub = NostrHelper.pubkeyFromPrivkey(BOB_KEY);
    session = pair('bob');
    bindHost(session, 'primal.net', 'id-ada');
    session.identities = ['id-bob'];
    delete session['identity_id-ada'];
    session.sites = [];
    delete session['site_site-primal'];
    allow(session, 'id-bob', 'primal.net', 'getPublicKey');

    const pending = nip07();
    await flush();
    expect(created.length).toBe(1);
    await dispatch({ type: 'bind-site', host: 'primal.net', identityId: 'id-bob' });
    await dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(pending).toBeResolvedTo(bobPub);
    expect(created.length).toBe(1);
    expect(boundTo('primal.net')).toBe('id-bob');
  });

  it('replaces a binding whose identity is gone', async () => {
    const bobPub = NostrHelper.pubkeyFromPrivkey(BOB_KEY);
    session = pair('bob');
    bindHost(session, 'primal.net', 'id-ada');
    session.identities = ['id-bob'];
    delete session['identity_id-ada'];
    allow(session, 'id-bob', 'primal.net', 'getPublicKey');

    const pending = nip07();
    await flush();
    expect(created.length).toBe(1);
    await dispatch({ type: 'bind-site', host: 'primal.net', identityId: 'id-bob' });
    await dispatch({ id: latestPopupId(), response: 'unlocked' });
    await expectAsync(pending).toBeResolvedTo(bobPub);
    expect(boundTo('primal.net')).toBe('id-bob');
    expect(session.sites).toEqual(['site-primal']);
  });
});
