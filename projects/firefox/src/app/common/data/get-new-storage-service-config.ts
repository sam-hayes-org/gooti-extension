import { FirefoxMetaHandler } from './firefox-meta-handler';
import { FirefoxSessionHandler } from './firefox-session-handler';
import { FirefoxSyncNoHandler } from './firefox-sync-no-handler';
import { FirefoxSyncYesHandler } from './firefox-sync-yes-handler';

export const getNewStorageServiceConfig = () => {
  const storageConfig = {
    browserSessionHandler: new FirefoxSessionHandler(),
    browserSyncYesHandler: new FirefoxSyncYesHandler(),
    browserSyncNoHandler: new FirefoxSyncNoHandler(),
    gootiMetaHandler: new FirefoxMetaHandler(),
  };

  return storageConfig;
};
