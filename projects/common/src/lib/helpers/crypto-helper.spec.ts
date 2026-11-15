import { CryptoHelper } from './crypto-helper';

describe('CryptoHelper v3', () => {
  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 120_000;
  });

  it('seals the same text twice into different ciphertext that both open', async () => {
    const salt = CryptoHelper.generateSalt();
    const key = await CryptoHelper.v3Key('correct horse', salt);
    const first = await CryptoHelper.seal('gooti-vault', key);
    const second = await CryptoHelper.seal('gooti-vault', key);

    expect(first).not.toEqual(second);
    expect(await CryptoHelper.open(first, key)).toBe('gooti-vault');
    expect(await CryptoHelper.open(second, key)).toBe('gooti-vault');

    const wrong = await CryptoHelper.v3Key('nope', salt);
    let rejected = false;
    try {
      await CryptoHelper.open(first, wrong);
    } catch {
      rejected = true;
    }
    expect(rejected).toBeTrue();
  });
});
