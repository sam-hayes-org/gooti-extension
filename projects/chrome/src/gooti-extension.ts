/* eslint-disable @typescript-eslint/no-explicit-any */
import { Event, EventTemplate } from 'nostr-tools';
import { Nip07Method } from '@common';

type Relays = Record<string, { read: boolean; write: boolean }>;

class Messenger {
  #requests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: any) => void;
    }
  >();

  constructor() {
    window.addEventListener('message', this.#handleCallResponse.bind(this));
  }

  async request(method: Nip07Method, params: any): Promise<any> {
    const id = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      this.#requests.set(id, { resolve, reject });
      window.postMessage(
        {
          id,
          ext: 'gooti',
          method,
          params,
        },
        window.location.origin,
      );
    });
  }

  #handleCallResponse(message: MessageEvent) {
    if (
      !message.data ||
      message.data.response === null ||
      message.data.response === undefined ||
      message.data.ext !== 'gooti' ||
      !this.#requests.has(message.data.id)
    ) {
      return;
    }

    if (message.data.response.error) {
      this.#requests.get(message.data.id)?.reject(message.data.response.error);
    } else {
      this.#requests.get(message.data.id)?.resolve(message.data.response);
    }

    this.#requests.delete(message.data.id);
  }
}

const nostr = {
  messenger: new Messenger(),

  async getPublicKey(): Promise<string> {
    return await this.messenger.request('getPublicKey', {});
  },

  async signEvent(event: EventTemplate): Promise<Event> {
    return await this.messenger.request('signEvent', event);
  },

  async getRelays(): Promise<Relays> {
    return (await this.messenger.request('getRelays', {})) as Relays;
  },

  nip04: {
    that: this,

    async encrypt(peerPubkey: string, plaintext: string): Promise<string> {
      return (await nostr.messenger.request('nip04.encrypt', {
        peerPubkey,
        plaintext,
      })) as string;
    },

    async decrypt(peerPubkey: string, ciphertext: string): Promise<string> {
      return (await nostr.messenger.request('nip04.decrypt', {
        peerPubkey,
        ciphertext,
      })) as string;
    },
  },

  nip44: {
    async encrypt(peerPubkey: string, plaintext: string): Promise<string> {
      return (await nostr.messenger.request('nip44.encrypt', {
        peerPubkey,
        plaintext,
      })) as string;
    },

    async decrypt(peerPubkey: string, ciphertext: string): Promise<string> {
      return (await nostr.messenger.request('nip44.decrypt', {
        peerPubkey,
        ciphertext,
      })) as string;
    },
  },
};

window.nostr = nostr as any;
