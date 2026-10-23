import { Buffer } from 'buffer';

/** Fixed string sealed in a v3 vault. Opening it proves the password. */
export const VAULT_CANARY = 'gooti-vault';

/** Salt baked into v1 and v2 vaults. Not used for new vaults. */
export const LEGACY_SALT = '3e7cdebd-3b4c-4125-a18c-05750cad8ec3';

export const LEGACY_ITERATIONS = 1000;

/** OWASP PBKDF2-SHA-256 floor. WebCrypto has no Argon2. Unlock is once per session. */
export const V3_ITERATIONS = 600_000;

export class CryptoHelper {
  /**
   * Generate a base64 encoded IV.
   */
  static generateIV(): string {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return Buffer.from(iv).toString('base64');
  }

  /**
   * 16 random bytes, base64. Stored in the clear with a v3 vault.
   */
  static generateSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return Buffer.from(salt).toString('base64');
  }

  /**
   * Hash (SHA-256) a text string.
   */
  static async hash(text: string): Promise<string> {
    const textUint8 = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', textUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hashHex;
  }

  static v4(): string {
    return crypto.randomUUID();
  }

  static async deriveKey(
    password: string,
    salt: BufferSource,
    iterations: number,
  ): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations,
      },
      await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey'],
      ),
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  static legacyKey(password: string): Promise<CryptoKey> {
    return CryptoHelper.deriveKey(
      password,
      new TextEncoder().encode(LEGACY_SALT),
      LEGACY_ITERATIONS,
    );
  }

  static v3Key(password: string, saltBase64: string): Promise<CryptoKey> {
    return CryptoHelper.deriveKey(
      password,
      Buffer.from(saltBase64, 'base64'),
      V3_ITERATIONS,
    );
  }

  /**
   * Encrypt with a fresh IV. The result is `ivBase64.ciphertextBase64`.
   * Two seals of the same text differ.
   */
  static async seal(text: string, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherText = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(text),
    );
    return `${Buffer.from(iv).toString('base64')}.${Buffer.from(cipherText).toString('base64')}`;
  }

  static async open(packed: string, key: CryptoKey): Promise<string> {
    const dot = packed.indexOf('.');
    if (dot <= 0) {
      throw new Error('Invalid ciphertext.');
    }

    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(packed.slice(0, dot), 'base64') },
      key,
      Buffer.from(packed.slice(dot + 1), 'base64'),
    );
    return new TextDecoder().decode(plain);
  }

  /**
   * Legacy shared-IV encryption used by vault formats v1 and v2.
   * The same text, IV, and password always produce the same ciphertext.
   */
  static async encrypt(
    text: string,
    ivBase64String: string,
    password: string,
  ): Promise<string> {
    const cipherText = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: Buffer.from(ivBase64String, 'base64'),
      },
      await CryptoHelper.legacyKey(password),
      new TextEncoder().encode(text),
    );
    return Buffer.from(cipherText).toString('base64');
  }

  static async decrypt(
    encryptedBase64String: string,
    ivBase64String: string,
    password: string,
  ): Promise<string> {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Buffer.from(ivBase64String, 'base64'),
      },
      await CryptoHelper.legacyKey(password),
      Buffer.from(encryptedBase64String, 'base64'),
    );
    return new TextDecoder().decode(plain);
  }
}
