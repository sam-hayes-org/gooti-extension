import { Nip07Method } from '../models/nostr';
import { NostrHelper } from '../helpers/nostr-helper';

/**
 * Kind 5 deletes an event. Kind 62 asks relays to erase the account.
 * An earlier Approve does not cover either one.
 */
export const UNREMEMBERED_SIGN_KINDS: ReadonlySet<number> = new Set([5, 62]);

const CONSEQUENCE_METHODS: ReadonlySet<Nip07Method> = new Set([
  'signEvent',
  'nip04.encrypt',
  'nip04.decrypt',
  'nip44.encrypt',
  'nip44.decrypt',
]);

export interface PermissionCardLine {
  headline: string;
  detail?: string;
  /** Kind 5 targets. `e` tags are event ids. `a` tags are addressable coordinates. */
  events?: string[];
  danger: boolean;
  method: Nip07Method;
  kind?: number;
}

export interface PermissionCardSnapshot {
  revision: number;
  lines: PermissionCardLine[];
}

export function isConsequenceMethod(method: Nip07Method): boolean {
  return CONSEQUENCE_METHODS.has(method);
}

export function isUnrememberedSign(method: Nip07Method, params: unknown): boolean {
  if (method !== 'signEvent') {
    return false;
  }
  const kind = kindOf(params);
  return kind !== undefined && UNREMEMBERED_SIGN_KINDS.has(kind);
}

/** The browser question for a bunker. The phone still reads the note or message. */
export type BunkerSiteQuestion = 'sign' | 'encrypt' | 'decrypt' | 'delete' | 'erase';

export function bunkerSiteQuestion(method: Nip07Method, params: unknown): BunkerSiteQuestion {
  if (method === 'nip04.encrypt' || method === 'nip44.encrypt') {
    return 'encrypt';
  }
  if (method === 'nip04.decrypt' || method === 'nip44.decrypt') {
    return 'decrypt';
  }
  if (!isUnrememberedSign(method, params)) {
    return 'sign';
  }
  return kindOf(params) === 62 ? 'erase' : 'delete';
}

export function bunkerSiteQuestionLabel(question: BunkerSiteQuestion): string {
  switch (question) {
    case 'encrypt':
      return 'ask your bunker to encrypt';
    case 'decrypt':
      return 'ask your bunker to decrypt';
    case 'delete':
      return 'ask your bunker to delete a note';
    case 'erase':
      return 'ask your bunker to erase this account';
    case 'sign':
      return 'ask your bunker to sign';
  }
}

export function describePermissionRequest(req: {
  method: Nip07Method;
  params: unknown;
}): PermissionCardLine {
  if (req.method === 'signEvent') {
    return describeSign(req.params);
  }
  if (req.method === 'nip04.encrypt' || req.method === 'nip44.encrypt') {
    return describeEncrypt(req.method, req.params);
  }
  if (req.method === 'nip04.decrypt' || req.method === 'nip44.decrypt') {
    return describeDecrypt(req.method, req.params);
  }
  return { headline: 'Sign an event', danger: false, method: req.method };
}

export function permissionCardTitle(
  lines: PermissionCardLine[],
  bunker: boolean,
): string {
  if (bunker) {
    return 'Send to bunker';
  }
  const signing = lines.some((line) => line.method === 'signEvent');
  if (signing || lines.length === 0) {
    return 'Sign event';
  }
  const encrypting = lines.some((line) => line.method.endsWith('.encrypt'));
  const decrypting = lines.some((line) => line.method.endsWith('.decrypt'));
  if (encrypting && !decrypting) {
    return 'Encrypt';
  }
  if (decrypting && !encrypting) {
    return 'Decrypt';
  }
  return 'Sign event';
}

export function fillPermissionCard(
  list: HTMLElement,
  lines: PermissionCardLine[],
): void {
  list.replaceChildren();
  for (const line of lines) {
    const item = document.createElement('div');
    item.className = 'card-line';

    const headline = document.createElement('div');
    headline.className = line.danger
      ? 'card-line-headline danger'
      : 'card-line-headline';
    headline.textContent = line.headline;
    item.append(headline);

    if (line.events && line.events.length > 0) {
      appendField(
        item,
        line.events.length > 1 ? 'Events' : 'Event',
        line.events,
        'card-event-id',
      );
    }
    if (line.detail) {
      if (line.kind === 5) {
        appendField(item, 'Reason', [line.detail], '');
      } else {
        const detail = document.createElement('div');
        detail.className = 'card-line-detail';
        detail.textContent = line.detail;
        item.append(detail);
      }
    }

    list.append(item);
  }
}

function describeSign(params: unknown): PermissionCardLine {
  const kind = kindOf(params);
  const content = contentOf(params);
  const tags = tagsOf(params);
  const base = {
    danger: kind !== undefined && UNREMEMBERED_SIGN_KINDS.has(kind),
    method: 'signEvent' as const,
    ...(kind !== undefined ? { kind } : {}),
  };

  switch (kind) {
    case 0:
      return finish(base, 'Replace your profile.', profileDetail(content));
    case 1:
      return finish(base, 'Publish this note', emptyToUndefined(content));
    case 5: {
      const events = deletionTargets(tags);
      const headline = events.length > 1 ? 'Delete these notes' : 'Delete this note';
      const line = finish(base, headline, emptyToUndefined(content));
      return events.length > 0 ? { ...line, events } : line;
    }
    case 7:
      return describeReaction(base, content);
    case 62:
      return finish(base, 'Ask relays to erase this account.');
    case 22242:
      return describeRelayLogin(base, tags);
    default:
      return finish(
        base,
        kind === undefined ? 'Sign an event' : `Sign a kind ${kind} event`,
        emptyToUndefined(content),
      );
  }
}

function appendField(
  item: HTMLElement,
  label: string,
  values: string[],
  valueClass: string,
): void {
  const field = document.createElement('div');
  field.className = 'card-field';
  const kicker = document.createElement('div');
  kicker.className = 'card-kicker';
  kicker.textContent = label;
  field.append(kicker);
  for (const value of values) {
    const box = document.createElement('div');
    box.className = valueClass ? `card-line-detail ${valueClass}` : 'card-line-detail';
    box.textContent = value;
    field.append(box);
  }
  item.append(field);
}

/** Ids a kind 5 event names, in tag order. */
function deletionTargets(tags: string[][]): string[] {
  return tags
    .filter((tag) => (tag[0] === 'e' || tag[0] === 'a') && !!tag[1])
    .map((tag) => tag[1]);
}

function finish(
  base: Pick<PermissionCardLine, 'danger' | 'method' | 'kind'>,
  headline: string,
  detail?: string,
): PermissionCardLine {
  if (!detail) {
    return { ...base, headline };
  }
  return { ...base, headline, detail };
}

function describeReaction(
  base: Pick<PermissionCardLine, 'danger' | 'method' | 'kind'>,
  content: string,
): PermissionCardLine {
  const reaction = content.trim();
  if (reaction.length === 0) {
    return { ...base, headline: 'React to this post' };
  }
  if (reaction.length > 24) {
    return { ...base, headline: 'React to this post', detail: reaction };
  }
  return { ...base, headline: `React with ${reaction} to this post` };
}

function describeRelayLogin(
  base: Pick<PermissionCardLine, 'danger' | 'method' | 'kind'>,
  tags: string[][],
): PermissionCardLine {
  const relay = tags.find((tag) => tag[0] === 'relay' && tag[1])?.[1];
  return {
    ...base,
    headline: relay ? `Log in to ${relay}` : 'Log in to this relay',
  };
}

function describeEncrypt(method: Nip07Method, params: unknown): PermissionCardLine {
  const record = asRecord(params);
  const plaintext = stringField(record, 'plaintext') ?? '';
  const peer = stringField(record, 'peerPubkey') ?? '';
  return finish(
    { danger: false, method },
    peer ? `Encrypt a message to ${peerLabel(peer)}` : 'Encrypt a message',
    emptyToUndefined(plaintext),
  );
}

function describeDecrypt(method: Nip07Method, params: unknown): PermissionCardLine {
  const peer = stringField(asRecord(params), 'peerPubkey') ?? '';
  return {
    headline: peer ? `Decrypt a message from ${peerLabel(peer)}` : 'Decrypt a message',
    danger: false,
    method,
  };
}

function profileDetail(content: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    const record = asRecord(parsed);
    const name = textField(record['display_name']) ?? textField(record['name']);
    const about = textField(record['about']);
    const lines = [name, about].filter((line): line is string => !!line);
    return lines.length > 0 ? lines.join('\n') : undefined;
  } catch {
    return undefined;
  }
}

function peerLabel(pubkey: string): string {
  try {
    const npub = NostrHelper.pubkey2npub(pubkey);
    if (npub.length <= 20) {
      return npub;
    }
    return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
  } catch {
    const trimmed = pubkey.trim();
    if (trimmed.length <= 12) {
      return trimmed || 'someone';
    }
    return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
  }
}

function kindOf(params: unknown): number | undefined {
  const kind = asRecord(params)['kind'];
  return typeof kind === 'number' ? kind : undefined;
}

function contentOf(params: unknown): string {
  return stringField(asRecord(params), 'content') ?? '';
}

function tagsOf(params: unknown): string[][] {
  const tags = asRecord(params)['tags'];
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.filter(
    (tag): tag is string[] =>
      Array.isArray(tag) && tag.every((part) => typeof part === 'string'),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function textField(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToUndefined(value: string): string | undefined {
  return value.length > 0 ? value : undefined;
}
