import { accountFromSeedWords } from 'nostr-tools/nip06';
import {
  deriveSyncKeys,
  generateSyncPhrase,
  isSyncPhrase,
} from './phrase';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const OTHER =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

describe('sync phrase', () => {
  it('generates a valid 12-word phrase', () => {
    const phrase = generateSyncPhrase();

    expect(phrase.split(' ').length).toBe(12);
    expect(isSyncPhrase(phrase)).toBeTrue();
    expect(isSyncPhrase('not a phrase')).toBeFalse();
  });

  it('derives the same pubkey from the same phrase', async () => {
    const first = await deriveSyncKeys(`  ${PHRASE}\n`);
    const second = await deriveSyncKeys(PHRASE);

    expect(first.pubkey).toBe(second.pubkey);
    expect(first.signingKey).toEqual(second.signingKey);
    expect(first.encryptionKey).toEqual(second.encryptionKey);
  });

  it('derives a different pubkey from a different phrase', async () => {
    const first = await deriveSyncKeys(PHRASE);
    const second = await deriveSyncKeys(OTHER);

    expect(first.pubkey).not.toBe(second.pubkey);
  });

  it('does not use the NIP-06 identity key', async () => {
    const keys = await deriveSyncKeys(PHRASE);
    const identity = accountFromSeedWords(PHRASE);

    expect(keys.pubkey).not.toBe(identity.publicKey);
  });

  it('rejects a phrase that is not BIP-39', async () => {
    let rejected = false;
    try {
      await deriveSyncKeys('abandon abandon abandon');
    } catch (error) {
      rejected = error instanceof Error && error.message === 'Invalid recovery phrase.';
    }
    expect(rejected).toBeTrue();
  });
});
