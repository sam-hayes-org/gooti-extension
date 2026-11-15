import { accountFromSeedWords } from 'nostr-tools/nip06';
import {
  deriveSharedKeys,
  generatePassphrase,
  isPassphrase,
} from './phrase';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const OTHER =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

describe('sync phrase', () => {
  it('generates a valid 12-word phrase', () => {
    const phrase = generatePassphrase();

    expect(phrase.split(' ').length).toBe(12);
    expect(isPassphrase(phrase)).toBeTrue();
    expect(isPassphrase('not a phrase')).toBeFalse();
  });

  it('derives the same pubkey from the same phrase', async () => {
    const first = await deriveSharedKeys(`  ${PHRASE}\n`);
    const second = await deriveSharedKeys(PHRASE);

    expect(first.pubkey).toBe(second.pubkey);
    expect(first.signingKey).toEqual(second.signingKey);
    expect(first.encryptionKey).toEqual(second.encryptionKey);
  });

  it('derives a different pubkey from a different phrase', async () => {
    const first = await deriveSharedKeys(PHRASE);
    const second = await deriveSharedKeys(OTHER);

    expect(first.pubkey).not.toBe(second.pubkey);
  });

  it('does not use the NIP-06 identity key', async () => {
    const keys = await deriveSharedKeys(PHRASE);
    const identity = accountFromSeedWords(PHRASE);

    expect(keys.pubkey).not.toBe(identity.publicKey);
  });

  it('rejects a phrase that is not BIP-39', async () => {
    let rejected = false;
    try {
      await deriveSharedKeys('abandon abandon abandon');
    } catch (error) {
      rejected = error instanceof Error && error.message === 'That passphrase is not valid. Check your 12 words.';
    }
    expect(rejected).toBeTrue();
  });
});
