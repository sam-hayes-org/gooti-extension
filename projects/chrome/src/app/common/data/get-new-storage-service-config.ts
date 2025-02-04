import { StorageServiceConfig } from '@common';
import { ChromeSessionHandler } from './chrome-session-handler';
import { ChromeSyncYesHandler } from './chrome-sync-yes-handler';
import { ChromeSyncNoHandler } from './chrome-sync-no-handler';
import { ChromeMetaHandler } from './chrome-meta-handler';

export const getNewStorageServiceConfig = () => {
  const storageConfig: StorageServiceConfig = {
    browserSessionHandler: new ChromeSessionHandler(),
    browserSyncYesHandler: new ChromeSyncYesHandler(),
    browserSyncNoHandler: new ChromeSyncNoHandler(),
    gootiMetaHandler: new ChromeMetaHandler(),
  };

  return storageConfig;
};
