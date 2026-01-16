import browser from 'webextension-polyfill';
import { Buffer } from 'buffer';
import { Nip07Method, PromptResponse, PromptResponseMessage } from '@common';

const params = new URLSearchParams(location.search);
const id = params.get('id') as string;
const method = params.get('method') as Nip07Method;
const host = params.get('host') as string;
const nick = params.get('nick') as string;
const event = Buffer.from(params.get('event') as string, 'base64').toString();

let title = '';
switch (method) {
  case 'getPublicKey':
    title = 'Get Public Key';
    break;

  case 'signEvent':
    title = 'Sign Event';
    break;

  case 'nip04.encrypt':
    title = 'Encrypt';
    break;

  case 'nip44.encrypt':
    title = 'Encrypt';
    break;

  case 'nip04.decrypt':
    title = 'Decrypt';
    break;

  case 'nip44.decrypt':
    title = 'Decrypt';
    break;

  case 'getRelays':
    title = 'Get Relays';
    break;

  default:
    break;
}

const titleSpanElement = document.getElementById('titleSpan');
if (titleSpanElement) {
  titleSpanElement.innerText = title;
}

Array.from(document.getElementsByClassName('nick-INSERT')).forEach(
  (element) => {
    (element as HTMLElement).innerText = nick;
  }
);

Array.from(document.getElementsByClassName('host-INSERT')).forEach(
  (element) => {
    (element as HTMLElement).innerText = host;
  }
);

const kindSpanElement = document.getElementById('kindSpan');
if (kindSpanElement) {
  kindSpanElement.innerText = JSON.parse(event).kind;
}

const cardGetPublicKeyElement = document.getElementById('cardGetPublicKey');
if (cardGetPublicKeyElement) {
  if (method === 'getPublicKey') {
    // Do nothing.
  } else {
    cardGetPublicKeyElement.style.display = 'none';
  }
}

const cardGetRelaysElement = document.getElementById('cardGetRelays');
if (cardGetRelaysElement) {
  if (method === 'getRelays') {
    // Do nothing.
  } else {
    cardGetRelaysElement.style.display = 'none';
  }
}

const cardSignEventElement = document.getElementById('cardSignEvent');
const card2SignEventElement = document.getElementById('card2SignEvent');
if (cardSignEventElement && card2SignEventElement) {
  if (method === 'signEvent') {
    const card2SignEvent_jsonElement = document.getElementById(
      'card2SignEvent_json'
    );
    if (card2SignEvent_jsonElement) {
      card2SignEvent_jsonElement.innerText = event;
    }
  } else {
    cardSignEventElement.style.display = 'none';
    card2SignEventElement.style.display = 'none';
  }
}

const cardNip04EncryptElement = document.getElementById('cardNip04Encrypt');
const card2Nip04EncryptElement = document.getElementById('card2Nip04Encrypt');
if (cardNip04EncryptElement && card2Nip04EncryptElement) {
  if (method === 'nip04.encrypt') {
    const card2Nip04Encrypt_textElement = document.getElementById(
      'card2Nip04Encrypt_text'
    );
    if (card2Nip04Encrypt_textElement) {
      const eventObject: { peerPubkey: string; plaintext: string } =
        JSON.parse(event);
      card2Nip04Encrypt_textElement.innerText = eventObject.plaintext;
    }
  } else {
    cardNip04EncryptElement.style.display = 'none';
    card2Nip04EncryptElement.style.display = 'none';
  }
}

const cardNip44EncryptElement = document.getElementById('cardNip44Encrypt');
const card2Nip44EncryptElement = document.getElementById('card2Nip44Encrypt');
if (cardNip44EncryptElement && card2Nip44EncryptElement) {
  if (method === 'nip44.encrypt') {
    const card2Nip44Encrypt_textElement = document.getElementById(
      'card2Nip44Encrypt_text'
    );
    if (card2Nip44Encrypt_textElement) {
      const eventObject: { peerPubkey: string; plaintext: string } =
        JSON.parse(event);
      card2Nip44Encrypt_textElement.innerText = eventObject.plaintext;
    }
  } else {
    cardNip44EncryptElement.style.display = 'none';
    card2Nip44EncryptElement.style.display = 'none';
  }
}
const cardNip04DecryptElement = document.getElementById('cardNip04Decrypt');
const card2Nip04DecryptElement = document.getElementById('card2Nip04Decrypt');
if (cardNip04DecryptElement && card2Nip04DecryptElement) {
  if (method === 'nip04.decrypt') {
    const card2Nip04Decrypt_textElement = document.getElementById(
      'card2Nip04Decrypt_text'
    );
    if (card2Nip04Decrypt_textElement) {
      const eventObject: { peerPubkey: string; ciphertext: string } =
        JSON.parse(event);
      card2Nip04Decrypt_textElement.innerText = eventObject.ciphertext;
    }
  } else {
    cardNip04DecryptElement.style.display = 'none';
    card2Nip04DecryptElement.style.display = 'none';
  }
}

const cardNip44DecryptElement = document.getElementById('cardNip44Decrypt');
const card2Nip44DecryptElement = document.getElementById('card2Nip44Decrypt');
if (cardNip44DecryptElement && card2Nip44DecryptElement) {
  if (method === 'nip44.decrypt') {
    const card2Nip44Decrypt_textElement = document.getElementById(
      'card2Nip44Decrypt_text'
    );
    if (card2Nip44Decrypt_textElement) {
      const eventObject: { peerPubkey: string; ciphertext: string } =
        JSON.parse(event);
      card2Nip44Decrypt_textElement.innerText = eventObject.ciphertext;
    }
  } else {
    cardNip44DecryptElement.style.display = 'none';
    card2Nip44DecryptElement.style.display = 'none';
  }
}

//
// Functions
//

function deliver(response: PromptResponse) {
  const message: PromptResponseMessage = {
    id,
    response,
  };

  browser.runtime.sendMessage(message);
  window.close();
}

document.addEventListener('DOMContentLoaded', function () {
  const rejectJustOnceButton = document.getElementById('rejectJustOnceButton');
  rejectJustOnceButton?.addEventListener('click', () => {
    deliver('reject-once');
  });

  const rejectButton = document.getElementById('rejectButton');
  rejectButton?.addEventListener('click', () => {
    deliver('reject');
  });

  const approveJustOnceButton = document.getElementById(
    'approveJustOnceButton'
  );
  approveJustOnceButton?.addEventListener('click', () => {
    deliver('approve-once');
  });

  const approveButton = document.getElementById('approveButton');
  approveButton?.addEventListener('click', () => {
    deliver('approve');
  });
});
