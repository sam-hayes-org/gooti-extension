import type { StorageService } from '../storage.service';

/**
 * Re-seals the backup state with the current vault key. Does not rotate the salt.
 * A content change queues a quiet backup. Saving the relay list passes backUp: false.
 */
export const persistBackupSeal = async function (
  this: StorageService,
  options?: { backUp?: boolean },
): Promise<void> {
  const session = this.getBrowserSessionHandler().browserSessionData;
  const vault = this.getVaultHandler().browserSyncData;
  if (!session?.backupState || !vault) {
    return;
  }

  const sealed = await this.encrypt(JSON.stringify(session.backupState));
  await this.getVaultHandler().saveAndSetFullData({ ...vault, backupState: sealed });
  await this.getBrowserSessionHandler().saveFullData(session);
  if (options?.backUp !== false) {
    this.queueQuietBackup();
  }
};
