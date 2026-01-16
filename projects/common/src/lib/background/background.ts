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
import { Identity_DECRYPTED } from '../services/storage/types';
import { NostrHelper } from '../helpers/nostr-helper';

export const initializeBackground = (backgroundCommon: BackgroundCommon) => {
  type Relays = Record<string, { read: boolean; write: boolean }>;

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

  browser.runtime.onMessage.addListener(async (message: any /*, sender*/) => {
    backgroundCommon.debug('Message received');
    const request = message as BackgroundRequestMessage | PromptResponseMessage;
    backgroundCommon.debug(request);

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

        indexPrompt.resolve(message.response);
        openIndexPrompts.delete(message.id);
      } else {
        // Response from regular prompt
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

    let browserSessionData = await backgroundCommon.getBrowserSessionData();
    let currentIdentity = browserSessionData?.[
      `identity_${browserSessionData.selectedIdentityId}`
    ] as Identity_DECRYPTED | undefined;

    while (!browserSessionData || !currentIdentity) {
      await new Promise<IndexPromptResponse>((resolve, reject) => {
        const id = crypto.randomUUID();
        openIndexPrompts.set(id, { resolve, reject });
        const popupUrl = browser.runtime.getURL(
          `index.html?source=background&id=${id}`,
        );
        backgroundCommon.debug(
          `Opening extension window from background: ${popupUrl}`,
        );

        const width = 475;
        const height = 600;
        try {
          backgroundCommon.getPosition(width, height).then(({ left, top }) => {
            browser.windows.create({
              url: popupUrl,
              type: 'popup', // Makes it a floating window
              width,
              height,
              left,
              top,
              focused: true,
            });
          });
        } catch (error) {
          backgroundCommon.debug(`Error creating window: ${error}`);
        }
      });

      browserSessionData = await backgroundCommon.getBrowserSessionData();
      currentIdentity = browserSessionData?.[
        `identity_${browserSessionData.selectedIdentityId}`
      ] as Identity_DECRYPTED | undefined;
    }

    const req = request as BackgroundRequestMessage;
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
      // Ask user for permission.
      const width = 375;
      const height = 600;
      const { top, left } = await backgroundCommon.getPosition(width, height);

      const base64Event = Buffer.from(
        JSON.stringify(req.params ?? {}, undefined, 2),
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
          focused: true,
        });
      });
      backgroundCommon.debug(response);
      if (response === 'approve' || response === 'reject') {
        await backgroundCommon.storePermission(
          browserSessionData,
          currentIdentity,
          req.host,
          req.method,
          response === 'approve' ? 'allow' : 'deny',
          req.params?.kind,
        );
      }

      if (['reject', 'reject-once'].includes(response)) {
        throw new Error('Permission denied');
      }
    } else {
      backgroundCommon.debug('Request allowed (via saved permission).');
    }

    const relays: Relays = {};
    switch (req.method) {
      case 'getPublicKey':
        return NostrHelper.pubkeyFromPrivkey(currentIdentity.privkey);

      case 'signEvent':
        return backgroundCommon.signEvent(req.params, currentIdentity.privkey);

      case 'getRelays':
        browserSessionData.relays.forEach((x) => {
          relays[x.url] = { read: x.read, write: x.write };
        });
        return relays;

      case 'nip04.encrypt':
        return await backgroundCommon.nip04Encrypt(
          currentIdentity.privkey,
          req.params.peerPubkey,
          req.params.plaintext,
        );

      case 'nip44.encrypt':
        return await backgroundCommon.nip44Encrypt(
          currentIdentity.privkey,
          req.params.peerPubkey,
          req.params.plaintext,
        );

      case 'nip04.decrypt':
        return await backgroundCommon.nip04Decrypt(
          currentIdentity.privkey,
          req.params.peerPubkey,
          req.params.ciphertext,
        );

      case 'nip44.decrypt':
        return await backgroundCommon.nip44Decrypt(
          currentIdentity.privkey,
          req.params.peerPubkey,
          req.params.ciphertext,
        );

      default:
        throw new Error(`Not supported request method '${req.method}'.`);
    }
  });
};
