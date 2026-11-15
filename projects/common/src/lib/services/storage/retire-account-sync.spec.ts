import {
  decideAccountSyncRetirement,
  recordHasVault,
} from './retire-account-sync';

describe('recordHasVault', () => {
  it('accepts a v2 hash or a v3 salt and canary', () => {
    expect(recordHasVault(undefined)).toBeFalse();
    expect(recordHasVault({})).toBeFalse();
    expect(recordHasVault({ version: 2 })).toBeFalse();
    expect(
      recordHasVault({ version: 2, vaultHash: 'abc', iv: 'iv' }),
    ).toBeTrue();
    expect(recordHasVault({ version: 3 })).toBeFalse();
    expect(recordHasVault({ version: 3, vaultHash: 'abc' })).toBeFalse();
    expect(
      recordHasVault({ version: 3, salt: 'salt', canary: 'canary' }),
    ).toBeTrue();
  });
});

describe('decideAccountSyncRetirement', () => {
  it('does nothing after the one-time retirement', () => {
    expect(
      decideAccountSyncRetirement({
        syncRetired: true,
        localHasVault: false,
        syncHasVault: true,
      }),
    ).toEqual({ copySyncToLocal: false, clearSync: false });
  });

  it('copies a sync vault when local has none, then clears sync', () => {
    expect(
      decideAccountSyncRetirement({
        syncRetired: false,
        localHasVault: false,
        syncHasVault: true,
      }),
    ).toEqual({ copySyncToLocal: true, clearSync: true });
  });

  it('keeps an existing local vault and still clears sync', () => {
    expect(
      decideAccountSyncRetirement({
        syncRetired: false,
        localHasVault: true,
        syncHasVault: true,
      }),
    ).toEqual({ copySyncToLocal: false, clearSync: true });
  });

  it('clears an empty sync area when there is no vault anywhere', () => {
    expect(
      decideAccountSyncRetirement({
        syncRetired: false,
        localHasVault: false,
        syncHasVault: false,
      }),
    ).toEqual({ copySyncToLocal: false, clearSync: true });
  });
});
