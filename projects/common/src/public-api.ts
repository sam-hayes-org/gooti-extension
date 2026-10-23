/*
 * Public API Surface of common
 */

// Common
export * from './lib/common/nav-component';
export * from './lib/common/sleep';

// Helpers
export * from './lib/helpers/crypto-helper';
export * from './lib/helpers/nostr-helper';
export * from './lib/helpers/text-helper';
export * from './lib/helpers/date-helper';

// Models
export * from './lib/models/nostr';

// Services (and related)
export * from './lib/services/storage/storage.service';
export * from './lib/services/storage/types';
export * from './lib/services/storage/vault-handler';
export * from './lib/services/storage/retire-account-sync';
export * from './lib/services/storage/browser-session-handler';
export * from './lib/services/storage/gooti-meta-handler';
export * from './lib/services/logger/logger.service';
export * from './lib/services/startup/startup.service';
export * from './lib/services/startup/last-route';

// Components
export * from './lib/components/icon-button/icon-button.component';
export * from './lib/components/confirm/confirm.component';
export * from './lib/components/toast/toast.component';
export * from './lib/components/nav-item/nav-item.component';
export * from './lib/components/pubkey/pubkey.component';
export * from './lib/components/backup-panel/backup-panel.component';
export * from './lib/components/identity-avatar/identity-avatar.component';
export * from './lib/components/identity-current/identity-current.component';
export * from './lib/components/identity-row/identity-row.component';
export * from './lib/components/activity/activity.component';
export * from './lib/components/backup-notice/backup-notice.component';

// Site identity
export { activeTabHost } from './lib/sites/active-tab';
export { identityForSite, siteList, SITE_CLEARED_HINT, SITE_RELOAD_HINT } from './lib/sites/binding';
export type { SiteListEntry } from './lib/sites/binding';

// Pipes
export * from './lib/pipes/visual-nip05.pipe';

// Background
export * from './lib/background';

// Nostr backup
export * from './lib/backup';

// Identity appearance
export * from './lib/identity/appearance';

// Local activity log
export {
  ACTIVITY_KEY,
  ACTIVITY_LIMIT,
  activityOutcome,
  appendActivity,
  formatActivityTime,
  noteBackupActivity,
  parseActivity,
  recordActivity,
  recordBackupActivity,
  backupFailureReason,
} from './lib/activity/log';
export type {
  ActivityDraft,
  ActivityEntry,
  ActivityOutcome,
  ActivityRow,
  ActivityStore,
  BackupActivityDraft,
  BackupActivityEntry,
  BackupActivityMode,
  BackupActivityResult,
} from './lib/activity/log';

// Remote bunker client
export {
  BUNKER_DID_NOT_ANSWER,
  BUNKER_NOT_CONNECTED,
  DESKTOP_DID_NOT_ANSWER,
  INVALID_BUNKER_LINK,
  bunkerSwitchRelays,
  connectBunker,
} from './lib/nip46/client';
export type { BunkerRelayRefresh, ConnectedBunker } from './lib/nip46/client';

export { checkNip05 } from './lib/nip05/check';
export type { Nip05Check } from './lib/nip05/check';
