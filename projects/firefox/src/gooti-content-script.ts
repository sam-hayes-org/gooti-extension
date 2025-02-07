import browser from 'webextension-polyfill';
import { BackgroundRequestMessage } from './background-common';

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

    response = await browser.runtime.sendMessage(request);
  } catch (error) {
    response = { error };
  }

  // return response
  window.postMessage(
    { id: message.data.id, ext: 'gooti', response },
    message.origin
  );
});
