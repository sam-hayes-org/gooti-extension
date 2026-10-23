import type { StorageService } from '../storage.service';

/**
 * Re-seals the sync state with the current vault key. Does not rotate the salt.
 * A content change queues a quiet sync. Saving the relay list passes sync: false.
 */
export const persistNostrSyncSeal = async function (
  this: StorageService,
  options?: { sync?: boolean },
): Promise<void> {
  const session = this.getBrowserSessionHandler().browserSessionData;
  const vault = this.getVaultHandler().browserSyncData;
  if (!session?.nostrSync || !vault) {
    return;
  }

  const sealed = await this.encrypt(JSON.stringify(session.nostrSync));
  await this.getVaultHandler().saveAndSetFullData({ ...vault, nostrSync: sealed });
  await this.getBrowserSessionHandler().saveFullData(session);
  if (options?.sync !== false) {
    this.queueQuietSync();
  }
};
