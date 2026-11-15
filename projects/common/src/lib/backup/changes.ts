import {
  bunkerAsksSite,
  SharedBunker,
  SharedDocument,
  SharedIdentity,
  SharedPermission,
  SharedSite,
} from './document';
import { activeSharedDocument } from './merge';

/** What a backup changed. Lines name nicks and hosts. They never include keys or secrets. */
export interface ChangeReport {
  /** Rows this browser did not have before the merge. */
  took: string[];
  /** Rows the relay did not have, and this backup sent. */
  sent: string[];
}

const CHANGE_LIMIT = 80;

/**
 * Compares the vault this browser held, the relay vault, and the merge.
 * A missing relay vault is one line, not a list of every row.
 */
export function describeChanges(
  local: SharedDocument,
  remote: SharedDocument | null,
  merged: SharedDocument,
  published: boolean,
): ChangeReport {
  if (remote === null) {
    return { took: [], sent: published ? ['Created the backup.'] : [] };
  }
  const took = cap(diffDocuments(activeSharedDocument(local), activeSharedDocument(merged)));
  const sent = published
    ? cap(diffDocuments(activeSharedDocument(remote), activeSharedDocument(merged)))
    : [];
  return { took, sent };
}

function diffDocuments(before: SharedDocument, after: SharedDocument): string[] {
  const names = nickMap(before, after);
  return [
    ...identityLines(before.identities, after.identities),
    ...permissionLines(before.permissions, after.permissions, names),
    ...siteLines(before.sites ?? [], after.sites ?? [], names),
  ];
}

function identityLines(before: readonly SharedIdentity[], after: readonly SharedIdentity[]): string[] {
  const previous = new Map(before.map((identity) => [identity.pubkey, identity]));
  const next = new Map(after.map((identity) => [identity.pubkey, identity]));
  const added: string[] = [];
  const removed: string[] = [];
  const renamed: string[] = [];
  const bunker: string[] = [];
  for (const identity of next.values()) {
    const older = previous.get(identity.pubkey);
    const name = nameOf(identity);
    if (!older) {
      added.push(identity.bunker ? `Added bunker ${name}` : `Added identity ${name}`);
      continue;
    }
    if (nameOf(older) !== name) {
      renamed.push(`Renamed ${nameOf(older)} to ${name}`);
    }
    const bunkerLine = bunkerLineFor(older, identity);
    if (bunkerLine) {
      bunker.push(bunkerLine);
    }
  }
  for (const identity of previous.values()) {
    if (!next.has(identity.pubkey)) {
      removed.push(`Removed identity ${nameOf(identity)}`);
    }
  }
  return [...sorted(added), ...sorted(removed), ...sorted(renamed), ...sorted(bunker)];
}

function bunkerLineFor(before: SharedIdentity, after: SharedIdentity): string | undefined {
  const name = nameOf(after);
  if (!before.bunker && after.bunker) {
    return `Added a bunker for ${name}`;
  }
  if (before.bunker && !after.bunker) {
    return `Removed the bunker from ${name}`;
  }
  if (before.bunker && after.bunker && bunkerChanged(before.bunker, after.bunker)) {
    return `Updated the bunker for ${name}`;
  }
  return undefined;
}

function bunkerChanged(before: SharedBunker, after: SharedBunker): boolean {
  return (
    before.pubkey !== after.pubkey ||
    before.secret !== after.secret ||
    bunkerAsksSite(before) !== bunkerAsksSite(after) ||
    before.relays.join('\n') !== after.relays.join('\n')
  );
}

function permissionLines(
  before: readonly SharedPermission[],
  after: readonly SharedPermission[],
  names: ReadonlyMap<string, string>,
): string[] {
  const previous = new Map(before.map((permission) => [permissionKey(permission), permission]));
  const next = new Map(after.map((permission) => [permissionKey(permission), permission]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const permission of next.values()) {
    const older = previous.get(permissionKey(permission));
    const label = permissionLabel(permission, names);
    if (!older) {
      added.push(
        permission.methodPolicy === 'deny' ? `Added denial ${label}` : `Added permission ${label}`,
      );
      continue;
    }
    if (older.methodPolicy !== permission.methodPolicy) {
      changed.push(permission.methodPolicy === 'deny' ? `Denied ${label}` : `Allowed ${label}`);
    }
  }
  for (const permission of previous.values()) {
    if (!next.has(permissionKey(permission))) {
      removed.push(`Removed permission ${permissionLabel(permission, names)}`);
    }
  }
  return [...sorted(added), ...sorted(removed), ...sorted(changed)];
}

function siteLines(
  before: readonly SharedSite[],
  after: readonly SharedSite[],
  names: ReadonlyMap<string, string>,
): string[] {
  const previous = new Map(before.map((site) => [site.host, site]));
  const next = new Map(after.map((site) => [site.host, site]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const site of next.values()) {
    const older = previous.get(site.host);
    const who = names.get(site.identityPubkey) ?? 'Unknown identity';
    if (!older) {
      added.push(`${site.host} uses ${who}`);
      continue;
    }
    if (older.identityPubkey !== site.identityPubkey) {
      changed.push(`${site.host} now uses ${who}`);
    }
  }
  for (const site of previous.values()) {
    if (!next.has(site.host)) {
      removed.push(`Cleared ${site.host}`);
    }
  }
  return [...sorted(added), ...sorted(removed), ...sorted(changed)];
}

function permissionKey(permission: SharedPermission): string {
  return [permission.identityPubkey, permission.host, permission.method, permission.kind ?? ''].join(
    '\n',
  );
}

function permissionLabel(permission: SharedPermission, names: ReadonlyMap<string, string>): string {
  const kind = permission.kind !== undefined ? ` kind ${permission.kind}` : '';
  const who = names.get(permission.identityPubkey) ?? 'Unknown identity';
  return `${permission.host} · ${permission.method}${kind} · ${who}`;
}

function nickMap(before: SharedDocument, after: SharedDocument): Map<string, string> {
  const names = new Map<string, string>();
  for (const identity of before.identities) {
    names.set(identity.pubkey, nameOf(identity));
  }
  for (const identity of after.identities) {
    names.set(identity.pubkey, nameOf(identity));
  }
  return names;
}

function nameOf(identity: { nick: string }): string {
  const nick = identity.nick.trim();
  return nick || 'Unnamed';
}

function sorted(lines: string[]): string[] {
  return lines.sort((a, b) => a.localeCompare(b));
}

function cap(lines: string[]): string[] {
  if (lines.length <= CHANGE_LIMIT) {
    return lines;
  }
  const shown = lines.slice(0, CHANGE_LIMIT - 1);
  return [...shown, `And ${lines.length - shown.length} more.`];
}
