/* eslint-disable @typescript-eslint/no-unused-vars */
import { bech32 } from '@scure/base';
import * as utils from '@noble/curves/abstract/utils';
import { getPublicKey } from 'nostr-tools';

export interface NostrHexObject {
  represents: string;
  hex: string;
}

export interface NostrPubkeyObject {
  hex: string;
  npub: string;
}

export interface NostrPrivkeyObject {
  hex: string;
  nsec: string;
}

export class NostrHelper {
  static getNostrPrivkeyObject(nsec_OR_hex: string): NostrPrivkeyObject {
    // 1. Assume we got an nsec.
    // Try to generate hex value.
    try {
      const hexObject = this.#nSomething2hexObject(nsec_OR_hex);
      if (hexObject.represents !== 'nsec') {
        throw new Error('The provided string is NOT an nsec.');
      }

      // Everything is fine. The provided string IS an nsec.
      return {
        hex: hexObject.hex,
        nsec: nsec_OR_hex,
      };
    } catch (error) {
      // Continue.
    }

    // 2. Assume we got an hex.
    // Try to generate the nsec.
    try {
      const nsec = NostrHelper.privkey2nsec(nsec_OR_hex);
      return {
        hex: nsec_OR_hex,
        nsec,
      };
    } catch (error) {
      // Continue;
    }

    throw new Error('Could not convert the provided string into nsec/hex.');
  }

  static getNostrPubkeyObject(npub_OR_hex: string): NostrPubkeyObject {
    // 1. Assume we got an npub.
    // Try to generate hex value.
    try {
      const hexObject = this.#nSomething2hexObject(npub_OR_hex);
      if (hexObject.represents !== 'npub') {
        throw new Error('The provided string is NOT an npub.');
      }

      // Everything is fine. The provided string IS an npub.
      return {
        hex: hexObject.hex,
        npub: npub_OR_hex,
      };
    } catch (error) {
      // Continue.
    }

    // 2. Assume we got an hex.
    // Try to generate the npub.
    try {
      const npub = NostrHelper.pubkey2npub(npub_OR_hex);
      return {
        hex: npub_OR_hex,
        npub,
      };
    } catch (error) {
      // Continue;
    }

    throw new Error('Could not convert the provided string into npub/hex.');
  }

  static pubkey2npub(hex: string): string {
    const data = utils.hexToBytes(hex);
    const words = bech32.toWords(data);
    return bech32.encode('npub', words, 5000);
  }

  static privkey2nsec(hex: string): string {
    const data = utils.hexToBytes(hex);
    const words = bech32.toWords(data);
    return bech32.encode('nsec', words, 5000);
  }

  static pubkeyFromPrivkey(hex: string): string {
    const privkeyBytes = utils.hexToBytes(hex);
    return getPublicKey(privkeyBytes);
  }

  static hex2bytes(hex: string): Uint8Array {
    return utils.hexToBytes(hex);
  }

  static splitKey(text: string, first: number, last: number): string {
    const part1 = text.slice(0, first);
    const part2 = '...';
    const part3 = text.slice(-last);
    return `${part1}${part2}${part3}`;
  }

  static #nSomething2hexObject(nSomething: string): NostrHexObject {
    const { prefix, words } = bech32.decode(
      nSomething as `${string}1${string}`,
      5000
    );
    const data = new Uint8Array(bech32.fromWords(words));

    return {
      represents: prefix,
      hex: utils.bytesToHex(data),
    };
  }
}
