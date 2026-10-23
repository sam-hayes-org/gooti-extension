/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BackgroundCommon,
  BackgroundRequestMessage,
  PromptResponseMessage,
  IndexPromptResponseMessage,
  PromptResponse,
  IndexPromptResponse,
} from './background-common';
import browser from 'webextension-polyfill';
import { Buffer } from 'buffer';
import {
  BrowserSessionData,
  Identity_DECRYPTED,
} from '../services/storage/types';
import { NostrHelper } from '../helpers/nostr-helper';
import {
  BUNKER_DID_NOT_ANSWER,
  BUNKER_NOT_CONNECTED,
  BunkerCallOptions,
  DESKTOP_DID_NOT_ANSWER,
  bunkerNip04Decrypt,
  bunkerNip04Encrypt,
  bunkerNip44Decrypt,
  bunkerNip44Encrypt,
  bunkerSignEvent,
} from '../nip46/client';
import {
  bunkerSiteQuestion,
  describePermissionRequest,
  isConsequenceMethod,
  isUnrememberedSign,
  PermissionCardSnapshot,
} from './permission-card';
import { isNip07Method } from '../models/nostr';
import { identityForSite } from '../sites/binding';
import { identityPubkey, readIdentityColor } from '../identity/appearance';
import { recordHasVault } from '../services/storage/retire-account-sync';
import {
  ActivityDraft,
  ActivityStore,
  UNLOCK_DISMISSED,
  activityOutcome,
  recordActivity,
} from '../activity/log';
import { GOOTI_META_DATA_KEY } from '../services/storage/types';

async function createPopupWindow(
  backgroundCommon: BackgroundCommon,
  options: {
    url: string;
    type: 'popup';
    width: number;
    height: number;
    left: number;
    top: number;
    focused: true;
  },
) {
  try {
    return await browser.windows.create(options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    if (!detail.includes('visible screen space')) {
      throw error;
    }
    backgroundCommon.debug(
      'Popup bounds were off screen. Opening without a position.',
    );
    return await browser.windows.create({
      url: options.url,
      type: options.type,
      width: options.width,
      height: options.height,
      focused: true,
    });
  }
}

function publicKeyOf(identity: Identity_DECRYPTED): string {
  if (identity.pubkey) {
    return identity.pubkey;
  }
  if (identity.privkey) {
    return NostrHelper.pubkeyFromPrivkey(identity.privkey);
  }
  throw new Error('Identity has no public key.');
}

/** Public key and stored color for the prompt's identity row. Both are public. */
function signerQuery(identity: Identity_DECRYPTED): string {
  const parts: string[] = [];
  try {
    parts.push(`pk=${identityPubkey(identity)}`);
  } catch {
    // The row still shows the nick when this identity has no public key.
  }
  const color = readIdentityColor(identity.color);
  if (color) {
    parts.push(`color=${encodeURIComponent(color)}`);
  }
  return parts.length > 0 ? `&${parts.join('&')}` : '';
}

const BUNKER_CALLS = new Set<BackgroundRequestMessage['method']>([
  'signEvent',
  'nip04.encrypt',
  'nip04.decrypt',
  'nip44.encrypt',
  'nip44.decrypt',
]);

function permissionPromptKey(req: BackgroundRequestMessage): string {
  if (req.method === 'signEvent') {
    const kind = req.params?.kind;
    return `${req.host}\n${req.method}\n${typeof kind === 'number' ? kind : ''}`;
  }
  return `${req.host}\n${req.method}`;
}

function connectedBunker(identity: Identity_DECRYPTED): {
  clientSecretKey: string;
  bunker: NonNullable<Identity_DECRYPTED['bunker']>;
} {
  const clientSecretKey = identity.bunker?.clientSecretKey;
  if (!identity.bunker || !clientSecretKey) {
    throw new Error(BUNKER_NOT_CONNECTED);
  }
  return { clientSecretKey, bunker: identity.bunker };
}

/**
 * Gooti Desktop holds this identity's key: the identity was connected with a Gooti Desktop link,
 * or backup carries its bunker pointer with a custody time. The backup check covers sessions
 * stored before the flag existed. Such requests name the site and wait for the desktop's own
 * approval time, and this browser does not ask first.
 */
export function heldByGootiDesktop(
  session: BrowserSessionData,
  identity: Identity_DECRYPTED,
): boolean {
  if (identity.privkey || !identity.bunker) {
    return false;
  }
  if (identity.bunker.gootiDesktop) {
    return true;
  }
  const row = session.backupState?.document.identities.find(
    (item) => item.pubkey === identity.pubkey && item.deletedAt === undefined,
  );
  return (
    row?.custodyAt !== undefined &&
    row.bunker !== undefined &&
    row.bunker.pubkey === identity.bunker.pubkey
  );
}

function bunkerCallOptions(
  session: BrowserSessionData,
  identity: Identity_DECRYPTED,
  host: string,
): BunkerCallOptions | undefined {
  if (!heldByGootiDesktop(session, identity)) {
    return undefined;
  }
  return { desktop: usableHost(host) ? { site: host } : {} };
}

/**
 * A bunker identity: the bunker decides on every sign, encrypt, and decrypt. Linking the site to
 * the identity was the site question, so this browser asks only before a deletion or an erase,
 * and not even then for Gooti Desktop, which sees the site and asks itself.
 */
function bunkerDecides(
  identity: Identity_DECRYPTED,
  method: BackgroundRequestMessage['method'],
): boolean {
  return !identity.privkey && !!identity.bunker?.clientSecretKey && BUNKER_CALLS.has(method);
}

export interface BunkerForwarder {
  signEvent: typeof bunkerSignEvent;
  nip04Encrypt: typeof bunkerNip04Encrypt;
  nip04Decrypt: typeof bunkerNip04Decrypt;
  nip44Encrypt: typeof bunkerNip44Encrypt;
  nip44Decrypt: typeof bunkerNip44Decrypt;
}

const defaultBunkerForwarder: BunkerForwarder = {
  signEvent: bunkerSignEvent,
  nip04Encrypt: bunkerNip04Encrypt,
  nip04Decrypt: bunkerNip04Decrypt,
  nip44Encrypt: bunkerNip44Encrypt,
  nip44Decrypt: bunkerNip44Decrypt,
};

const localActivity: ActivityStore = {
  async get() {
    const stored = await activityArea().get(GOOTI_META_DATA_KEY.activity);
    return stored[GOOTI_META_DATA_KEY.activity];
  },
  async set(entries) {
    await activityArea().set({ [GOOTI_META_DATA_KEY.activity]: entries });
  },
};

function activityArea(): {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
} {
  const local = (globalThis as { chrome?: { storage?: { local?: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  } } } }).chrome?.storage?.local;
  if (!local) {
    throw new Error('Activity storage is unavailable.');
  }
  return local;
}

async function noteActivity(
  debug: (message: string, level?: 'error') => void,
  draft: ActivityDraft,
): Promise<void> {
  try {
    await recordActivity(localActivity, draft);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'unknown';
    debug(`Activity was not stored: ${detail}`, 'error');
  }
}

function usableHost(host: unknown): host is string {
  return typeof host === 'string' && host.length > 0 && !/\s/.test(host) && !host.includes('/');
}

/** A vault with no unlocked session shows a lock on the toolbar icon. */
function watchToolbarLock(): void {
  void applyToolbarLock();
  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (
        area === 'session' ||
        (area === 'local' &&
          (changes['version'] || changes['salt'] || changes['canary'] || changes['vaultHash']))
      ) {
        void applyToolbarLock();
      }
    });
  } catch {
    // Unit tests have no storage events.
  }
  try {
    // Browser startup clears the session, so the worker has to set the lock itself.
    browser.runtime.onStartup.addListener(() => {
      void applyToolbarLock();
    });
  } catch {
    // Unit tests have no startup event.
  }
}

async function applyToolbarLock(): Promise<void> {
  try {
    if (typeof browser.action?.setIcon !== 'function') {
      return;
    }
    const session = await browser.storage.session.get('vaultPassword');
    const local = await browser.storage.local.get(['version', 'salt', 'canary', 'vaultHash']);
    const locked = recordHasVault(local) && typeof session['vaultPassword'] !== 'string';
    // Firefox caches toolbar images for this add-on id. A new filename is a new image.
    const lockedIcon = /\bFirefox\//.test(navigator.userAgent)
      ? 'gooti-locked-ff.png'
      : 'gooti-locked.png';
    const icon = locked ? lockedIcon : 'gooti-with-bg.png';
    await browser.action.setIcon({
      path: {
        16: icon,
        32: icon,
        48: icon,
        128: icon,
      },
    });
  } catch {
    // The toolbar icon is optional.
  }
}

/** Which bunker did not answer, from the client's error. */
function bunkerSilence(error: unknown): 'desktop' | 'bunker' | undefined {
  const message = error instanceof Error ? error.message : '';
  if (message === DESKTOP_DID_NOT_ANSWER) {
    return 'desktop';
  }
  if (message === BUNKER_DID_NOT_ANSWER) {
    return 'bunker';
  }
  return undefined;
}

/** At most one notice window per kind of bunker in this time. */
export const SILENCE_NOTICE_MS = 5 * 60_000;
const lastSilenceNotice = new Map<'desktop' | 'bunker', number>();

/** For tests. */
export function forgetSilenceNotices(): void {
  lastSilenceNotice.clear();
}

/** A small window saying the bunker did not answer, since the site may not show the error. */
function showSilenceNotice(which: 'desktop' | 'bunker'): void {
  const now = Date.now();
  const last = lastSilenceNotice.get(which);
  if (last !== undefined && now - last < SILENCE_NOTICE_MS) {
    return;
  }
  lastSilenceNotice.set(which, now);
  void (async () => {
    try {
      await browser.windows.create({
        url: `prompt.html?notice=${which}`,
        type: 'popup',
        width: 375,
        height: 320,
        focused: true,
      });
    } catch {
      // The site still gets the error, and Activity has the reason.
    }
  })();
}

export const initializeBackground = (
  backgroundCommon: BackgroundCommon,
  forwarder: BunkerForwarder = defaultBunkerForwarder,
) => {
  watchToolbarLock();

  const openPrompts = new Map<
    string,
    {
      resolve: (response: PromptResponse) => void;
      reject: (reason?: any) => void;
    }
  >();

  const openIndexPrompts = new Map<
    string,
    {
      resolve: (response: IndexPromptResponse) => void;
      reject: (reason?: any) => void;
    }
  >();

  // One unlock window for every caller that arrives while it is open.
  // Closing it without an identity fails those callers once.
  let pendingUnlock: Promise<void> | null = null;

  // One permission window per host and method while it is open.
  // Sign, encrypt, and decrypt from one site share a card instead.
  const pendingPermissions = new Map<string, Promise<PromptResponse>>();

  interface CardItem {
    req: BackgroundRequestMessage;
    resolve: (response: PromptResponse) => void;
    reject: (reason?: unknown) => void;
  }

  interface LiveCard {
    id: string;
    key: string;
    bunker: boolean;
    nick: string;
    host: string;
    session: BrowserSessionData;
    identity: Identity_DECRYPTED;
    items: CardItem[];
    shown: number;
    revision: number;
    ready: boolean;
    closed: boolean;
    settling: boolean;
  }

  const liveCards = new Map<string, LiveCard>();
  const openCards = new Map<string, LiveCard>();

  // One writer per host. Two calls can both read the session before either write finishes.
  const siteWrites = new Map<string, Promise<void>>();
  const enqueueSiteWrite = (
    host: string,
    identity: Identity_DECRYPTED,
    replace: boolean,
  ): Promise<void> => {
    const previous = siteWrites.get(host) ?? Promise.resolve();
    const run = previous.then(() => backgroundCommon.saveSiteBinding(host, identity, replace));
    siteWrites.set(
      host,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };

  const enqueueSiteClear = (host: string): Promise<void> => {
    const previous = siteWrites.get(host) ?? Promise.resolve();
    const run = previous.then(() => backgroundCommon.clearSiteBinding(host));
    siteWrites.set(
      host,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };

  const openUnlockWindow = (host: string): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const id = crypto.randomUUID();
      openIndexPrompts.set(id, {
        resolve: () => resolve(),
        reject,
      });
      const popupUrl = browser.runtime.getURL(
        `index.html?source=background&id=${id}&host=${encodeURIComponent(host)}`,
      );
      backgroundCommon.debug(
        `Opening extension window from background: ${popupUrl}`,
      );

      const width = 475;
      const height = 600;
      backgroundCommon
        .getPosition(width, height)
        .then((bounds) =>
          createPopupWindow(backgroundCommon, {
            url: popupUrl,
            type: 'popup',
            focused: true,
            ...bounds,
          }),
        )
        .catch((error: unknown) => {
          openIndexPrompts.delete(id);
          const detail = error instanceof Error ? error.message : 'unknown';
          backgroundCommon.debug(`Error creating window: ${detail}`, 'error');
          reject(error);
        });
    });
  };

  const waitForUnlock = (host: string): Promise<void> => {
    if (pendingUnlock) {
      return pendingUnlock;
    }

    const settled = openUnlockWindow(host).finally(() => {
      if (pendingUnlock === settled) {
        pendingUnlock = null;
      }
    });
    pendingUnlock = settled;
    return settled;
  };

  const askPermission = (
    browserSessionData: BrowserSessionData,
    identity: Identity_DECRYPTED,
    req: BackgroundRequestMessage,
    bunkerAsk = false,
  ): Promise<PromptResponse> => {
    const key = permissionPromptKey(req);
    const existing = pendingPermissions.get(key);
    if (existing) {
      return existing;
    }

    const asked = new Promise<PromptResponse>((resolve, reject) => {
      const id = crypto.randomUUID();
      openPrompts.set(id, { resolve, reject });
      const base64Event = Buffer.from(
        JSON.stringify(req.params ?? {}, undefined, 2),
      ).toString('base64');
      const forwardToBunker =
        !bunkerAsk &&
        !identity.privkey &&
        !!identity.bunker?.clientSecretKey &&
        BUNKER_CALLS.has(req.method);
      const signer = signerQuery(identity);
      const url = bunkerAsk
        ? `prompt.html?method=${encodeURIComponent(req.method)}&host=${encodeURIComponent(req.host)}&id=${id}&nick=${encodeURIComponent(identity.nick)}&bunker=1&ask=${bunkerSiteQuestion(req.params)}${signer}`
        : `prompt.html?method=${req.method}&host=${req.host}&id=${id}&nick=${identity.nick}&event=${base64Event}${forwardToBunker ? '&bunker=1' : ''}${signer}`;
      const width = 375;
      const height = 600;
      backgroundCommon
        .getPosition(width, height)
        .then((bounds) =>
          createPopupWindow(backgroundCommon, {
            type: 'popup',
            url,
            focused: true,
            ...bounds,
          }),
        )
        .catch((error: unknown) => {
          openPrompts.delete(id);
          const detail = error instanceof Error ? error.message : 'unknown';
          backgroundCommon.debug(`Error creating window: ${detail}`, 'error');
          reject(error);
        });
    }).then(async (response) => {
      if (response === 'approve' || response === 'reject') {
        // An approved deletion or erase is never remembered; a refusal is.
        if (bunkerAsk && response === 'approve') {
          return response;
        }
        const rawKind = req.params?.kind;
        const kind = typeof rawKind === 'number' ? rawKind : undefined;
        await backgroundCommon.storePermission(
          browserSessionData,
          identity,
          req.host,
          req.method,
          response === 'approve' ? 'allow' : 'deny',
          kind,
        );
      }
      return response;
    });

    const settled = asked.finally(() => {
      if (pendingPermissions.get(key) === settled) {
        pendingPermissions.delete(key);
      }
    });
    pendingPermissions.set(key, settled);
    return settled;
  };

  const snapshotCard = (card: LiveCard): PermissionCardSnapshot => {
    card.revision += 1;
    return {
      revision: card.revision,
      lines: card.items.map((item) => describePermissionRequest(item.req)),
    };
  };

  const publishCard = (card: LiveCard): void => {
    if (!card.ready || card.closed) {
      return;
    }
    const payload = snapshotCard(card);
    try {
      const pending = browser.runtime.sendMessage({
        type: 'card-lines',
        id: card.id,
        ...payload,
      });
      void Promise.resolve(pending).catch(() => undefined);
    } catch {
      // The prompt reads the list when it connects.
    }
  };

  const failCard = (card: LiveCard, error: unknown): void => {
    if (card.closed) {
      return;
    }
    card.closed = true;
    if (liveCards.get(card.key) === card) {
      liveCards.delete(card.key);
    }
    openCards.delete(card.id);
    const detail = error instanceof Error ? error.message : 'unknown';
    backgroundCommon.debug(`Error creating window: ${detail}`, 'error');
    const items = card.items.splice(0, card.items.length);
    for (const item of items) {
      item.reject(error);
    }
  };

  const cardWindowUrl = (card: LiveCard): string => {
    const host = encodeURIComponent(card.host);
    const nick = encodeURIComponent(card.nick);
    const bunker = card.bunker ? '&bunker=1' : '';
    return `prompt.html?card=1&host=${host}&id=${card.id}&nick=${nick}${bunker}${signerQuery(card.identity)}`;
  };

  const openCardWindow = (card: LiveCard): void => {
    const width = 375;
    const height = 600;
    backgroundCommon
      .getPosition(width, height)
      .then((bounds) =>
        createPopupWindow(backgroundCommon, {
          type: 'popup',
          url: cardWindowUrl(card),
          focused: true,
          ...bounds,
        }),
      )
      .catch((error: unknown) => {
        failCard(card, error);
      });
  };

  const startCard = (
    key: string,
    session: BrowserSessionData,
    identity: Identity_DECRYPTED,
    host: string,
    bunker: boolean,
    items: CardItem[],
  ): LiveCard => {
    const card: LiveCard = {
      id: crypto.randomUUID(),
      key,
      bunker,
      nick: identity.nick,
      host,
      session,
      identity,
      items: [...items],
      shown: 0,
      revision: 0,
      ready: false,
      closed: false,
      settling: false,
    };
    liveCards.set(key, card);
    openCards.set(card.id, card);
    openCardWindow(card);
    return card;
  };

  const rememberDecisions = async (
    session: BrowserSessionData,
    identity: Identity_DECRYPTED,
    items: CardItem[],
    response: 'approve' | 'reject',
  ): Promise<void> => {
    const seen = new Set<string>();
    for (const item of items) {
      const req = item.req;
      const kind =
        req.method === 'signEvent' && typeof req.params?.kind === 'number'
          ? req.params.kind
          : undefined;
      if (response === 'approve' && isUnrememberedSign(req.method, req.params)) {
        continue;
      }
      const stamp = `${req.method}\n${kind ?? ''}`;
      if (seen.has(stamp)) {
        continue;
      }
      seen.add(stamp);
      await backgroundCommon.storePermission(
        session,
        identity,
        req.host,
        req.method,
        response === 'approve' ? 'allow' : 'deny',
        kind,
      );
    }
  };

  const settleCard = async (
    card: LiveCard,
    response: PromptResponse,
  ): Promise<void> => {
    if (card.closed || card.settling) {
      return;
    }
    card.settling = true;
    const approving = response === 'approve' || response === 'approve-once';
    const count =
      card.shown > 0 ? card.shown : approving ? 0 : card.items.length;
    const decided = card.items.splice(0, count);
    const rest = card.items.splice(0, card.items.length);
    card.closed = true;
    if (liveCards.get(card.key) === card) {
      liveCards.delete(card.key);
    }
    openCards.delete(card.id);

    try {
      if (
        (response === 'approve' || response === 'reject') &&
        decided.length > 0
      ) {
        await rememberDecisions(card.session, card.identity, decided, response);
      }
      for (const item of decided) {
        item.resolve(response);
      }
    } catch (error) {
      for (const item of decided) {
        item.reject(error);
      }
    }

    if (rest.length > 0) {
      startCard(
        card.key,
        card.session,
        card.identity,
        card.host,
        card.bunker,
        rest,
      );
    }
  };

  const askCard = (
    session: BrowserSessionData,
    identity: Identity_DECRYPTED,
    req: BackgroundRequestMessage,
  ): Promise<PromptResponse> => {
    const key = `card\n${req.host}`;
    const bunker =
      !identity.privkey &&
      !!identity.bunker?.clientSecretKey &&
      isConsequenceMethod(req.method);
    const current = liveCards.get(key);
    if (current && !current.closed && !current.settling) {
      return new Promise((resolve, reject) => {
        current.items.push({ req, resolve, reject });
        publishCard(current);
      });
    }
    return new Promise((resolve, reject) => {
      startCard(key, session, identity, req.host, bunker, [
        { req, resolve, reject },
      ]);
    });
  };

  browser.runtime.onMessage.addListener(async (message: any /*, sender*/) => {
    backgroundCommon.debug('Message received');
    const request = message as BackgroundRequestMessage | PromptResponseMessage;
    const nip07 = request as Partial<BackgroundRequestMessage>;
    if (typeof nip07.method === 'string' && typeof nip07.host === 'string') {
      backgroundCommon.debug(`${nip07.method} ${nip07.host}`);
    }

    const cardMessage = message as {
      type?: string;
      id?: string;
      count?: number;
    };
    if (cardMessage?.type === 'card-lines') {
      return;
    }
    if (cardMessage?.type === 'card-ready' && typeof cardMessage.id === 'string') {
      const card = openCards.get(cardMessage.id);
      if (!card || card.closed) {
        return { revision: 0, lines: [] };
      }
      card.ready = true;
      return snapshotCard(card);
    }
    if (cardMessage?.type === 'card-shown' && typeof cardMessage.id === 'string') {
      const card = openCards.get(cardMessage.id);
      const count = cardMessage.count;
      if (
        card &&
        !card.closed &&
        !card.settling &&
        typeof count === 'number' &&
        count > card.shown &&
        count <= card.items.length
      ) {
        card.shown = count;
      }
      return;
    }
    if (cardMessage?.type === 'bind-site') {
      const host = (message as { host?: unknown }).host;
      const identityId = (message as { identityId?: unknown }).identityId;
      if (!usableHost(host) || typeof identityId !== 'string' || identityId.length === 0) {
        return;
      }
      const current = await backgroundCommon.getBrowserSessionData();
      const identity = current?.[`identity_${identityId}`];
      if (!current || !identity) {
        return;
      }
      await enqueueSiteWrite(host, identity, true);
      return;
    }
    if (cardMessage?.type === 'clear-site') {
      const host = (message as { host?: unknown }).host;
      if (!usableHost(host)) {
        return;
      }
      await enqueueSiteClear(host);
      return;
    }

    if ((request as PromptResponseMessage | IndexPromptResponseMessage)?.id) {
      // Handle prompt response
      const message = request as
        | PromptResponseMessage
        | IndexPromptResponseMessage;

      if (message.response === 'unlocked' || message.response === 'locked') {
        // Response from  index-prompt
        const indexPrompt = openIndexPrompts.get(message.id);
        if (!indexPrompt) {
          throw new Error(
            'Index prompt response could not be matched to any previous request.',
          );
        }

        openIndexPrompts.delete(message.id);
        if (message.response === 'locked') {
          backgroundCommon.debug(
            'Unlock window closed before this site had an identity.',
          );
          indexPrompt.reject(new Error(UNLOCK_DISMISSED));
        } else {
          indexPrompt.resolve(message.response);
        }
      } else {
        // Response from regular prompt
        const card = openCards.get(message.id);
        if (card) {
          await settleCard(card, message.response);
          return;
        }
        const openPrompt = openPrompts.get(message.id);
        if (!openPrompt) {
          throw new Error(
            'Prompt response could not be matched to any previous request.',
          );
        }

        openPrompt.resolve(message.response);
        openPrompts.delete(message.id);
      }

      return;
    }

    const req = request as BackgroundRequestMessage;
    if (!isNip07Method(req.method)) {
      throw new Error(`Not supported request method '${String(req.method)}'.`);
    }
    if (!usableHost(req.host)) {
      throw new Error('Permission denied');
    }

    let identityNick: string | undefined;
    let once = false;
    const kind =
      req.method === 'signEvent' && typeof req.params?.kind === 'number'
        ? req.params.kind
        : undefined;
    const note = (
      outcome: 'allowed' | 'once' | 'denied' | 'dismissed' | 'failed',
      reason?: string,
    ) =>
      noteActivity(backgroundCommon.debug.bind(backgroundCommon), {
        host: req.host,
        ...(identityNick ? { identity: identityNick } : {}),
        method: req.method,
        ...(kind !== undefined ? { kind } : {}),
        outcome,
        ...(reason ? { reason } : {}),
      });

    try {
    let browserSessionData = await backgroundCommon.getBrowserSessionData();
    if (pendingUnlock || !browserSessionData) {
      await waitForUnlock(req.host);
      browserSessionData = await backgroundCommon.getBrowserSessionData();
    }
    if (!browserSessionData) {
      throw new Error('Gooti is locked.');
    }

    let currentIdentity = identityForSite(browserSessionData, req.host);
    if (pendingUnlock || !currentIdentity) {
      await waitForUnlock(req.host);
      browserSessionData = await backgroundCommon.getBrowserSessionData();
      currentIdentity = browserSessionData
        ? identityForSite(browserSessionData, req.host)
        : undefined;
    }
    if (!browserSessionData) {
      throw new Error('Gooti is locked.');
    }
    if (!currentIdentity) {
      throw new Error(UNLOCK_DISMISSED);
    }
    identityNick = currentIdentity.nick;
    if (
      !currentIdentity.privkey &&
      BUNKER_CALLS.has(req.method) &&
      !currentIdentity.bunker?.clientSecretKey
    ) {
      throw new Error(BUNKER_NOT_CONNECTED);
    }

    if (bunkerDecides(currentIdentity, req.method)) {
      if (
        isUnrememberedSign(req.method, req.params) &&
        !heldByGootiDesktop(browserSessionData, currentIdentity)
      ) {
        const permissionState = backgroundCommon.checkPermissions(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          req.params,
        );
        if (permissionState === false) {
          throw new Error('Permission denied');
        }
        const response = await askPermission(browserSessionData, currentIdentity, req, true);
        if (['reject', 'reject-once'].includes(response)) {
          throw new Error('Permission denied');
        }
      }
    } else {
      const permissionState = backgroundCommon.checkPermissions(
        browserSessionData,
        currentIdentity,
        req.host,
        req.method,
        req.params,
      );

      if (permissionState === false) {
        throw new Error('Permission denied');
      }

      if (permissionState === undefined) {
        const response = isConsequenceMethod(req.method)
            ? await askCard(browserSessionData, currentIdentity, req)
            : await askPermission(browserSessionData, currentIdentity, req);

        if (['reject', 'reject-once'].includes(response)) {
          throw new Error('Permission denied');
        }
        if (response === 'approve-once') {
          once = true;
        }
      } else {
        backgroundCommon.debug('Request allowed (via saved permission).');
      }
    }

    const callOptions = bunkerCallOptions(browserSessionData, currentIdentity, req.host);
    let result: unknown;
    switch (req.method) {
      case 'getPublicKey':
        result = publicKeyOf(currentIdentity);
        break;

      case 'signEvent':
        result = currentIdentity.privkey
          ? backgroundCommon.signEvent(req.params, currentIdentity.privkey)
          : await forwarder.signEvent(
              connectedBunker(currentIdentity).clientSecretKey,
              connectedBunker(currentIdentity).bunker,
              req.params,
              callOptions,
            );
        break;

      case 'nip04.encrypt':
        result = currentIdentity.privkey
          ? await backgroundCommon.nip04Encrypt(
              currentIdentity.privkey,
              req.params.peerPubkey,
              req.params.plaintext,
            )
          : await forwarder.nip04Encrypt(
              connectedBunker(currentIdentity).clientSecretKey,
              connectedBunker(currentIdentity).bunker,
              req.params.peerPubkey,
              req.params.plaintext,
              callOptions,
            );
        break;

      case 'nip44.encrypt':
        result = currentIdentity.privkey
          ? await backgroundCommon.nip44Encrypt(
              currentIdentity.privkey,
              req.params.peerPubkey,
              req.params.plaintext,
            )
          : await forwarder.nip44Encrypt(
              connectedBunker(currentIdentity).clientSecretKey,
              connectedBunker(currentIdentity).bunker,
              req.params.peerPubkey,
              req.params.plaintext,
              callOptions,
            );
        break;

      case 'nip04.decrypt':
        result = currentIdentity.privkey
          ? await backgroundCommon.nip04Decrypt(
              currentIdentity.privkey,
              req.params.peerPubkey,
              req.params.ciphertext,
            )
          : await forwarder.nip04Decrypt(
              connectedBunker(currentIdentity).clientSecretKey,
              connectedBunker(currentIdentity).bunker,
              req.params.peerPubkey,
              req.params.ciphertext,
              callOptions,
            );
        break;

      case 'nip44.decrypt':
        result = currentIdentity.privkey
          ? await backgroundCommon.nip44Decrypt(
              currentIdentity.privkey,
              req.params.peerPubkey,
              req.params.ciphertext,
            )
          : await forwarder.nip44Decrypt(
              connectedBunker(currentIdentity).clientSecretKey,
              connectedBunker(currentIdentity).bunker,
              req.params.peerPubkey,
              req.params.ciphertext,
              callOptions,
            );
        break;

      default:
        throw new Error(`Not supported request method '${req.method}'.`);
    }

    if (usableHost(req.host)) {
      try {
        await enqueueSiteWrite(req.host, currentIdentity, false);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : 'unknown';
        backgroundCommon.debug(`Site binding was not stored: ${detail}`, 'error');
      }
    }
    await note(once ? 'once' : 'allowed');
    return result;
    } catch (error) {
      const silent = bunkerSilence(error);
      await note(activityOutcome(error), silent ? (error as Error).message : undefined);
      if (silent) {
        showSilenceNotice(silent);
      }
      throw error;
    }
  });
};
