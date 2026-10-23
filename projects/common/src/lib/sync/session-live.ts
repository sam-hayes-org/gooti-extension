import {
  BrowserSessionData,
  Identity_DECRYPTED,
  Permission_DECRYPTED,
  Site_DECRYPTED,
} from '../services/storage/types';
import { SyncLiveVault } from './state';

/** The unlocked session as the vault sync compares and publishes. */
export function liveVaultFromSession(session: BrowserSessionData): SyncLiveVault {
  const identities = sessionIdentities(session);
  const pubkeyById = new Map(identities.map((identity) => [identity.id, identity.pubkey]));
  return {
    identities: identities.map((identity) => ({
      pubkey: identity.pubkey,
      ...(identity.privkey ? { privkey: identity.privkey } : {}),
      nick: identity.nick,
      createdAt: identity.createdAt,
      ...(identity.color !== undefined ? { color: identity.color } : {}),
      ...(identity.bunker
        ? {
            bunker: {
              pubkey: identity.bunker.pubkey,
              relays: [...identity.bunker.relays],
              secret: identity.bunker.secret,
            },
          }
        : {}),
    })),
    permissions: sessionPermissions(session).flatMap((permission) => {
      const identityPubkey = pubkeyById.get(permission.identityId);
      if (!identityPubkey) {
        return [];
      }
      return [
        {
          identityPubkey,
          host: permission.host,
          method: permission.method,
          methodPolicy: permission.methodPolicy,
          ...(permission.kind !== undefined ? { kind: permission.kind } : {}),
        },
      ];
    }),
    sites: liveSites(session, pubkeyById),
  };
}

function sessionIdentities(session: BrowserSessionData): Identity_DECRYPTED[] {
  return session.identities.flatMap((id) => {
    const identity = session[`identity_${id}`];
    return identity ? [identity] : [];
  });
}

function sessionPermissions(session: BrowserSessionData): Permission_DECRYPTED[] {
  return session.permissions.flatMap((id) => {
    const permission = session[`permission_${id}`];
    return permission ? [permission] : [];
  });
}

function sessionSites(session: BrowserSessionData): Site_DECRYPTED[] {
  return (session.sites ?? []).flatMap((id) => {
    const site = session[`site_${id}`];
    return site ? [site] : [];
  });
}

function liveSites(
  session: BrowserSessionData,
  pubkeyById: ReadonlyMap<string, string>,
): { host: string; identityPubkey: string }[] {
  const seen = new Set<string>();
  const sites: { host: string; identityPubkey: string }[] = [];
  for (const site of sessionSites(session)) {
    if (seen.has(site.host)) {
      continue;
    }
    const identityPubkey = pubkeyById.get(site.identityId);
    if (!identityPubkey) {
      continue;
    }
    seen.add(site.host);
    sites.push({ host: site.host, identityPubkey });
  }
  return sites;
}
