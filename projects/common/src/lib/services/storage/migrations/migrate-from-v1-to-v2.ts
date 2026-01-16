/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserSyncDataVersion1, BrowserSyncDataVersion2 } from '../old-types';

export const migrateFromV1ToV2 = function (
  browserSyncData: BrowserSyncDataVersion1,
): BrowserSyncDataVersion2 {
  // Migrate the data structure from version 1 to version 2.
  const data = JSON.parse(JSON.stringify(browserSyncData)) as any;

  // Process identities
  for (const identity of browserSyncData.identities) {
    // In v2, identities are stored as separate entries.
    // This step involves saving each identity separately and replacing
    // the array with an array of identity IDs.
    const identityKey = `identity_${identity.id}`;
    data[identityKey] = identity;
  }
  data.identities = browserSyncData.identities.map((x) => x.id);

  // Process permissions
  for (const permission of browserSyncData.permissions) {
    // In v2, permissions are stored as separate entries.
    // This step involves saving each permission separately and replacing
    // the array with an array of permission IDs.
    const permissionKey = `permission_${permission.id}`;
    data[permissionKey] = permission;
  }
  data.permissions = browserSyncData.permissions.map((x) => x.id);

  // Update version number
  data.version = 2;

  return data as BrowserSyncDataVersion2;
};
