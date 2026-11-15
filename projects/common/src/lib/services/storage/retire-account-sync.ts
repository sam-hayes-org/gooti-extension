/**
 * Decides what to do with a vault that may still sit in browser-account sync
 * (`chrome.storage.sync` / `browser.storage.sync`).
 *
 * A later Nostr backup port is a different storage implementation. It does not
 * write to browser-account sync.
 */
export interface AccountSyncRetirement {
  /** Copy the sync area into local storage before clearing it. */
  copySyncToLocal: boolean;
  /** Delete the browser-account sync area after a successful copy, if any. */
  clearSync: boolean;
}

export function recordHasVault(
  data: object | null | undefined,
): boolean {
  if (!data) {
    return false;
  }

  const record = data as Record<string, unknown>;
  if (typeof record['version'] !== 'number') {
    return false;
  }

  if (record['version'] >= 3) {
    return (
      typeof record['salt'] === 'string' && typeof record['canary'] === 'string'
    );
  }

  return typeof record['vaultHash'] === 'string';
}

export function decideAccountSyncRetirement(input: {
  syncRetired: boolean;
  localHasVault: boolean;
  syncHasVault: boolean;
}): AccountSyncRetirement {
  if (input.syncRetired) {
    return { copySyncToLocal: false, clearSync: false };
  }

  return {
    copySyncToLocal: !input.localHasVault && input.syncHasVault,
    clearSync: true,
  };
}
