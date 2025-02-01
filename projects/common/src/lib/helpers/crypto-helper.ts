import { Buffer } from 'buffer';

export class CryptoHelper {
  /**
   * Generate a base64 encoded IV.
   */
  static generateIV(): string {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return Buffer.from(iv).toString('base64');
  }

  /**
   * Hash (SHA-256) a text string.
   */
  static async hash(text: string): Promise<string> {
    const textUint8 = new TextEncoder().encode(text); // encode as (utf-8) Uint8Array
    const hashBuffer = await crypto.subtle.digest('SHA-256', textUint8); // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''); // convert bytes to hex string
    return hashHex;
  }

  static v4(): string {
    return crypto.randomUUID();
  }

  static async deriveKey(password: string): Promise<CryptoKey> {
    const algo = {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('3e7cdebd-3b4c-4125-a18c-05750cad8ec3'),
      iterations: 1000,
    };
    return crypto.subtle.deriveKey(
      algo,
      await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        {
          name: algo.name,
        },
        false,
        ['deriveKey']
      ),
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async encrypt(
    text: string,
    ivBase64String: string,
    password: string
  ): Promise<string> {
    const algo = {
      name: 'AES-GCM',
      length: 256,
      iv: Buffer.from(ivBase64String, 'base64'),
    };

    const cipherText = await crypto.subtle.encrypt(
      algo,
      await CryptoHelper.deriveKey(password),
      new TextEncoder().encode(text)
    );
    return Buffer.from(cipherText).toString('base64');
  }

  static async decrypt(
    encryptedBase64String: string,
    ivBase64String: string,
    password: string
  ): Promise<string> {
    const algo = {
      name: 'AES-GCM',
      length: 256,
      iv: Buffer.from(ivBase64String, 'base64'),
    };
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        algo,
        await CryptoHelper.deriveKey(password),
        Buffer.from(encryptedBase64String, 'base64')
      )
    );
  }
}
