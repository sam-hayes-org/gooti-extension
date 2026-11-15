import { StorageServiceConfig } from '@common';
import { ChromeSessionHandler } from './chrome-session-handler';
import { ChromeVaultHandler } from './chrome-vault-handler';
import { ChromeMetaHandler } from './chrome-meta-handler';

export const getNewStorageServiceConfig = () => {
  const storageConfig: StorageServiceConfig = {
    browserSessionHandler: new ChromeSessionHandler(),
    vaultHandler: new ChromeVaultHandler(),
    gootiMetaHandler: new ChromeMetaHandler(),
    autoBackup: true,
  };

  return storageConfig;
};
