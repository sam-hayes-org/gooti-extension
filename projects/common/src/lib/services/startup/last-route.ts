export const LAST_ROUTE_TTL_MS = 5 * 60 * 1000;

const STORAGE_KEY = 'gooti.lastRoute';

export interface LastRoute {
  path: string;
  at: number;
  returnTo?: string;
}

export function pathOnly(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

export function isHomeRoute(path: string): boolean {
  return /^\/home\/(?:identity|identities|activity|settings|info)$/.test(path);
}

export function isRestorableRoute(path: string): boolean {
  return (
    isHomeRoute(path) ||
    /^\/edit-identity\/[^/]+\/(?:home|keys|permissions)$/.test(path) ||
    path === '/new-identity'
  );
}

export function readLastRoute(): LastRoute | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as LastRoute).path !== 'string' ||
      typeof (parsed as LastRoute).at !== 'number'
    ) {
      return null;
    }
    const returnTo = (parsed as LastRoute).returnTo;
    return {
      path: (parsed as LastRoute).path,
      at: (parsed as LastRoute).at,
      returnTo: typeof returnTo === 'string' && isHomeRoute(returnTo) ? returnTo : undefined,
    };
  } catch {
    return null;
  }
}

export function writeLastRoute(
  path: string,
  at = Date.now(),
  returnTo?: string,
): void {
  const normalized = pathOnly(path);
  if (!isRestorableRoute(normalized)) {
    return;
  }
  const existing = readLastRoute();
  const home = returnTo && isHomeRoute(pathOnly(returnTo))
    ? pathOnly(returnTo)
    : existing?.returnTo;
  const stored: LastRoute = { path: normalized, at };
  if (home) {
    stored.returnTo = home;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function touchLastRoute(at = Date.now()): void {
  const saved = readLastRoute();
  if (!saved) {
    return;
  }
  writeLastRoute(saved.path, at);
}

export function resolveOpeningRoute(
  saved: LastRoute | null,
  now: number,
  identityIds: readonly string[],
): string {
  const fallback = '/home/identities';
  if (!saved || now - saved.at > LAST_ROUTE_TTL_MS) {
    return fallback;
  }
  const path = pathOnly(saved.path);
  if (path === '/home/identity' || !isRestorableRoute(path)) {
    return fallback;
  }
  const edit = /^\/edit-identity\/([^/]+)\//.exec(path);
  if (edit && !identityIds.includes(edit[1])) {
    return fallback;
  }
  return path;
}
