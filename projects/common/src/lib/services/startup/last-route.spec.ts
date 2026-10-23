import {
  LAST_ROUTE_TTL_MS,
  readLastRoute,
  resolveOpeningRoute,
  touchLastRoute,
  writeLastRoute,
} from './last-route';

describe('last route', () => {
  const now = 1_000_000;
  const identities = ['ada'];

  beforeEach(() => {
    localStorage.clear();
  });

  it('returns to the last screen within five minutes', () => {
    expect(
      resolveOpeningRoute(
        { path: '/edit-identity/ada/keys', at: now - LAST_ROUTE_TTL_MS },
        now,
        identities,
      ),
    ).toBe('/edit-identity/ada/keys');
  });

  it('opens the identity list after five minutes', () => {
    expect(
      resolveOpeningRoute(
        { path: '/home/settings', at: now - LAST_ROUTE_TTL_MS - 1 },
        now,
        identities,
      ),
    ).toBe('/home/identities');
  });

  it('opens the identity list when nothing is stored', () => {
    expect(resolveOpeningRoute(null, now, [])).toBe('/home/identities');
  });

  it('restores the activity tab', () => {
    expect(
      resolveOpeningRoute({ path: '/home/activity', at: now }, now, identities),
    ).toBe('/home/activity');
  });

  it('opens the identity list for a stored You screen', () => {
    expect(
      resolveOpeningRoute({ path: '/home/identity', at: now }, now, identities),
    ).toBe('/home/identities');
  });

  it('drops a screen for an identity that is gone', () => {
    expect(
      resolveOpeningRoute(
        { path: '/edit-identity/gone/keys', at: now },
        now,
        identities,
      ),
    ).toBe('/home/identities');
  });

  it('refreshes the timestamp without changing the path', () => {
    writeLastRoute('/home/settings?from=x', now - 10, '/home/settings');
    touchLastRoute(now);
    expect(readLastRoute()).toEqual({
      path: '/home/settings',
      at: now,
      returnTo: '/home/settings',
    });
  });

  it('keeps the home tab when a later screen is saved', () => {
    writeLastRoute('/home/identity', now, '/home/identity');
    writeLastRoute('/edit-identity/ada/keys', now + 1);
    expect(readLastRoute()).toEqual({
      path: '/edit-identity/ada/keys',
      at: now + 1,
      returnTo: '/home/identity',
    });
  });
});
