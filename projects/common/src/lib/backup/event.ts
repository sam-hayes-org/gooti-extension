import { Event, finalizeEvent, verifyEvent, VerifiedEvent } from 'nostr-tools';

/** Replaceable application-specific data. The d tag makes one current vault per shared key. */
export const BACKUP_KIND = 30078;

export const SHARED_D_TAG = 'gooti-shared';

/** Signed replaceable event. content is the base64 blob from sealSharedDocument. */
export function buildBackupEvent(
  signingKey: Uint8Array,
  payload: string,
  createdAt = Math.floor(Date.now() / 1000),
): VerifiedEvent {
  return finalizeEvent(
    {
      kind: BACKUP_KIND,
      created_at: createdAt,
      tags: [['d', SHARED_D_TAG]],
      content: payload,
    },
    signingKey,
  );
}

/**
 * Returns the blob payload after the signature and the d tag check out.
 * The check uses a plain copy so a cached verification flag cannot hide an edit.
 */
export function readBackupPayload(event: Event): string {
  const checked: Event = {
    id: event.id,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: event.sig,
  };
  if (!verifyEvent(checked) || checked.kind !== BACKUP_KIND || !hasSyncTag(checked)) {
    throw new Error('Invalid sync event.');
  }
  return checked.content;
}

function hasSyncTag(event: Event): boolean {
  return event.tags.some((tag) => tag[0] === 'd' && tag[1] === SHARED_D_TAG);
}
