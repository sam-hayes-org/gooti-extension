/* eslint-disable @typescript-eslint/no-explicit-any */
import { NostrHelper } from '@common';
import {
  BackgroundRequestMessage,
  checkPermissions,
  debug,
  getBrowserSessionData,
  getPosition,
  nip04Decrypt,
  nip04Encrypt,
  nip44Decrypt,
  nip44Encrypt,
  PromptResponse,
  PromptResponseMessage,
  signEvent,
  storePermission,
} from './background-common';
import browser from 'webextension-polyfill';
import { Buffer } from 'buffer';

type Relays = Record<string, { read: boolean; write: boolean }>;

const openPrompts = new Map<
  string,
  {
    resolve: (response: PromptResponse) => void;
    reject: (reason?: any) => void;
  }
>();

browser.runtime.onMessage.addListener(async (message /*, sender*/) => {
  debug('Message received');
  const request = message as BackgroundRequestMessage | PromptResponseMessage;
  debug(request);

  if ((request as PromptResponseMessage)?.id) {
    // Handle prompt response
    const promptResponse = request as PromptResponseMessage;
    const openPrompt = openPrompts.get(promptResponse.id);
    if (!openPrompt) {
      throw new Error(
        'Prompt response could not be matched to any previous request.'
      );
    }

    openPrompt.resolve(promptResponse.response);
    openPrompts.delete(promptResponse.id);
    return;
  }

  const browserSessionData = await getBrowserSessionData();

  if (!browserSessionData) {
    throw new Error('Gooti vault not unlocked by the user.');
  }

  const currentIdentity = browserSessionData.identities.find(
    (x) => x.id === browserSessionData.selectedIdentityId
  );

  if (!currentIdentity) {
    throw new Error('No Nostr identity available at endpoint.');
  }

  const req = request as BackgroundRequestMessage;
  const permissionState = checkPermissions(
    browserSessionData,
    currentIdentity,
    req.host,
    req.method,
    req.params
  );

  if (permissionState === false) {
    throw new Error('Permission denied');
  }

  if (permissionState === undefined) {
    // Ask user for permission.
    const width = 375;
    const height = 600;
    const { top, left } = await getPosition(width, height);

    const base64Event = Buffer.from(
      JSON.stringify(req.params ?? {}, undefined, 2)
    ).toString('base64');

    const response = await new Promise<PromptResponse>((resolve, reject) => {
      const id = crypto.randomUUID();
      openPrompts.set(id, { resolve, reject });
      browser.windows.create({
        type: 'popup',
        url: `prompt.html?method=${req.method}&host=${req.host}&id=${id}&nick=${currentIdentity.nick}&event=${base64Event}`,
        height,
        width,
        top,
        left,
      });
    });
    debug(response);
    if (response === 'approve' || response === 'reject') {
      await storePermission(
        browserSessionData,
        currentIdentity,
        req.host,
        req.method,
        response === 'approve' ? 'allow' : 'deny',
        req.params?.kind
      );
    }

    if (['reject', 'reject-once'].includes(response)) {
      throw new Error('Permission denied');
    }
  } else {
    debug('Request allowed (via saved permission).');
  }

  const relays: Relays = {};
  switch (req.method) {
    case 'getPublicKey':
      return NostrHelper.pubkeyFromPrivkey(currentIdentity.privkey);

    case 'signEvent':
      return signEvent(req.params, currentIdentity.privkey);

    case 'getRelays':
      browserSessionData.relays.forEach((x) => {
        relays[x.url] = { read: x.read, write: x.write };
      });
      return relays;

    case 'nip04.encrypt':
      return await nip04Encrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.plaintext
      );

    case 'nip44.encrypt':
      return await nip44Encrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.plaintext
      );

    case 'nip04.decrypt':
      return await nip04Decrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.ciphertext
      );

    case 'nip44.decrypt':
      return await nip44Decrypt(
        currentIdentity.privkey,
        req.params.peerPubkey,
        req.params.ciphertext
      );

    default:
      throw new Error(`Not supported request method '${req.method}'.`);
  }
});
