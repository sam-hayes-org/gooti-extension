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
export * from './lib/components/nostr-sync/nostr-sync.component';
export * from './lib/components/identity-avatar/identity-avatar.component';
export * from './lib/components/identity-current/identity-current.component';
export * from './lib/components/identity-row/identity-row.component';
export * from './lib/components/activity/activity.component';

// Site identity
export { activeTabHost } from './lib/sites/active-tab';
export { identityForSite, SITE_CLEARED_HINT, SITE_RELOAD_HINT } from './lib/sites/binding';

// Pipes
export * from './lib/pipes/visual-nip05.pipe';

// Background
export * from './lib/background';

// Nostr vault sync
export * from './lib/sync';

// Identity appearance
export * from './lib/identity/appearance';

// Local activity log
export {
  ACTIVITY_KEY,
  ACTIVITY_LIMIT,
  activityOutcome,
  appendActivity,
  formatActivityTime,
  noteSyncActivity,
  parseActivity,
  recordActivity,
  recordSyncActivity,
  syncFailureReason,
} from './lib/activity/log';
export type {
  ActivityDraft,
  ActivityEntry,
  ActivityOutcome,
  ActivityRow,
  ActivityStore,
  SyncActivityDraft,
  SyncActivityEntry,
  SyncActivityMode,
  SyncActivityResult,
} from './lib/activity/log';

// Remote bunker client
export {
  BUNKER_DID_NOT_ANSWER,
  BUNKER_NOT_CONNECTED,
  INVALID_BUNKER_LINK,
  connectBunker,
} from './lib/nip46/client';
export type { ConnectedBunker } from './lib/nip46/client';

export { checkNip05 } from './lib/nip05/check';
export type { Nip05Check } from './lib/nip05/check';
