import { StorageServiceConfig } from '@common';
import { FirefoxMetaHandler } from './firefox-meta-handler';
import { FirefoxSessionHandler } from './firefox-session-handler';
import { FirefoxVaultHandler } from './firefox-vault-handler';

export const getNewStorageServiceConfig = () => {
  const storageConfig: StorageServiceConfig = {
    browserSessionHandler: new FirefoxSessionHandler(),
    vaultHandler: new FirefoxVaultHandler(),
    gootiMetaHandler: new FirefoxMetaHandler(),
    autoSync: true,
  };

  return storageConfig;
};
