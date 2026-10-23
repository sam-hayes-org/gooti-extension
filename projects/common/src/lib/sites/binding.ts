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
