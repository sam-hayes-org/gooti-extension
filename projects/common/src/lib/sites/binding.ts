import {
  BrowserSessionData,
  Identity_DECRYPTED,
} from '../services/storage/types';

export const SITE_RELOAD_HINT = 'Reload the site so it sees this identity.';
export const SITE_CLEARED_HINT =
  'Reload the site. The next request asks for an identity.';

/** The identity this host is bound to. No row, or a deleted identity, means unbound. */
export function identityForSite(
  session: BrowserSessionData | undefined,
  host: string | null | undefined,
): Identity_DECRYPTED | undefined {
  if (!session || !host) {
    return undefined;
  }
  for (const id of session.sites ?? []) {
    const site = session[`site_${id}`];
    if (!site || site.host !== host) {
      continue;
    }
    return session[`identity_${site.identityId}`];
  }
  return undefined;
}

export interface SiteListEntry {
  host: string;
  identity: Identity_DECRYPTED;
}

/** Every site with a live identity, sorted by host. Rows for a deleted identity are left out. */
export function siteList(session: BrowserSessionData | undefined): SiteListEntry[] {
  if (!session) {
    return [];
  }
  const entries: SiteListEntry[] = [];
  const seen = new Set<string>();
  for (const id of session.sites ?? []) {
    const site = session[`site_${id}`];
    const identity = site ? session[`identity_${site.identityId}`] : undefined;
    if (!site || !identity || seen.has(site.host)) {
      continue;
    }
    seen.add(site.host);
    entries.push({ host: site.host, identity });
  }
  return entries.sort((a, b) => a.host.localeCompare(b.host));
}
