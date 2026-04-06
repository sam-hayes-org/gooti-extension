import { BackgroundRequestMessage } from '@common';
import browser from 'webextension-polyfill';

const RECEIVING_END_MISSING = 'Receiving end does not exist';

const isReceivingEndMissingError = (error: unknown): boolean => {
  return (
    error instanceof Error &&
    error.message.includes(RECEIVING_END_MISSING)
  );
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const sendMessageWithRetry = async (
  request: BackgroundRequestMessage,
): Promise<unknown> => {
  try {
    return await browser.runtime.sendMessage(request);
  } catch (error) {
    // Firefox can briefly report no receiver while the background starts.
    if (!isReceivingEndMissingError(error)) {
      throw error;
    }
  }

  await sleep(150);
  return await browser.runtime.sendMessage(request);
};

// Inject the script that will provide window.nostr
// The script needs to run before any other scripts from the real
// page run (and maybe check for window.nostr).
const script = document.createElement('script');
script.setAttribute('async', 'false');
script.setAttribute('type', 'text/javascript');
script.setAttribute('src', browser.runtime.getURL('gooti-extension.js'));
(document.head || document.documentElement).appendChild(script);

// listen for messages from that script
window.addEventListener('message', async (message) => {
  // We will also receive our own messages, that we sent.
  // We have to ignore them (they will not have a params field).

  if (message.source !== window) return;
  if (!message.data) return;
  if (!message.data.params) return;
  if (message.data.ext !== 'gooti') return;

  // pass on to background
  let response;
  try {
    const request: BackgroundRequestMessage = {
      method: message.data.method,
      params: message.data.params,
      host: location.host,
    };

    response = await sendMessageWithRetry(request);
  } catch (error) {
    response = { error };
  }

  // return response
  window.postMessage(
    { id: message.data.id, ext: 'gooti', response },
    message.origin
  );
});
