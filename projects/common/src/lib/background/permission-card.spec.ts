import { NostrHelper } from '../helpers/nostr-helper';
import {
  bunkerSiteQuestion,
  bunkerSiteQuestionLabel,
  describePermissionRequest,
  fillPermissionCard,
  isUnrememberedSign,
  permissionCardTitle,
} from './permission-card';

const PUB = '4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';

describe('bunker site question', () => {
  it('names deleting and erasing without the content', () => {
    expect(bunkerSiteQuestion({ kind: 5, content: 'gone' })).toBe('delete');
    expect(bunkerSiteQuestion({ kind: 62 })).toBe('erase');
    expect(bunkerSiteQuestionLabel('delete')).toBe('ask your bunker to delete a note');
    expect(bunkerSiteQuestionLabel('erase')).toBe('ask your bunker to erase this account');
  });
});

describe('permission card lines', () => {
  it('shows the note text', () => {
    expect(
      describePermissionRequest({
        method: 'signEvent',
        params: { kind: 1, content: 'hello' },
      }),
    ).toEqual({
      headline: 'Publish this note',
      detail: 'hello',
      danger: false,
      method: 'signEvent',
      kind: 1,
    });
  });

  it('shows a reaction', () => {
    expect(
      describePermissionRequest({
        method: 'signEvent',
        params: { kind: 7, content: '+' },
      }).headline,
    ).toBe('React with + to this post');
  });

  it('names the relay for a login', () => {
    expect(
      describePermissionRequest({
        method: 'signEvent',
        params: {
          kind: 22242,
          content: '',
          tags: [['relay', 'wss://relay.damus.io']],
        },
      }).headline,
    ).toBe('Log in to wss://relay.damus.io');
  });

  it('shows the profile name', () => {
    expect(
      describePermissionRequest({
        method: 'signEvent',
        params: {
          kind: 0,
          content: JSON.stringify({
            display_name: 'Ada Lovelace',
            name: 'ada',
            about: 'counting',
          }),
        },
      }),
    ).toEqual({
      headline: 'Replace your profile.',
      detail: 'Ada Lovelace\ncounting',
      danger: false,
      method: 'signEvent',
      kind: 0,
    });
  });

  it('marks a deletion and keeps its text', () => {
    expect(
      describePermissionRequest({
        method: 'signEvent',
        params: { kind: 5, content: 'gone', tags: [['e', 'aa'], ['e', 'bb']] },
      }),
    ).toEqual({
      headline: 'Delete these notes',
      detail: 'gone',
      events: ['aa', 'bb'],
      danger: true,
      method: 'signEvent',
      kind: 5,
    });
    expect(isUnrememberedSign('signEvent', { kind: 5 })).toBeTrue();
  });

  it('labels one deletion with its event id and reason', () => {
    const id = 'ab'.repeat(32);
    const line = describePermissionRequest({
      method: 'signEvent',
      params: {
        kind: 5,
        content: 'Deleted by the author',
        tags: [['e', id], ['a', '']],
      },
    });
    expect(line).toEqual({
      headline: 'Delete this note',
      detail: 'Deleted by the author',
      events: [id],
      danger: true,
      method: 'signEvent',
      kind: 5,
    });
    const list = document.createElement('div');
    fillPermissionCard(list, [line]);
    expect(list.querySelector('.card-kicker')?.textContent).toBe('Event');
    expect(list.querySelector('.card-event-id')?.textContent).toBe(id);
    expect(list.textContent).toContain('Reason');
    expect(list.textContent).toContain('Deleted by the author');
    expect(list.textContent).not.toContain('Publish');
  });

  it('marks an account erasure', () => {
    expect(
      describePermissionRequest({
        method: 'signEvent',
        params: { kind: 62, content: '' },
      }),
    ).toEqual({
      headline: 'Ask relays to erase this account.',
      danger: true,
      method: 'signEvent',
      kind: 62,
    });
    expect(isUnrememberedSign('signEvent', { kind: 62 })).toBeTrue();
    expect(isUnrememberedSign('signEvent', { kind: 1 })).toBeFalse();
  });

  it('names the person for encrypt and hides ciphertext on decrypt', () => {
    const npub = NostrHelper.pubkey2npub(PUB);
    const encrypted = describePermissionRequest({
      method: 'nip44.encrypt',
      params: { peerPubkey: PUB, plaintext: 'secret' },
    });
    expect(encrypted.headline).toContain(npub.slice(0, 12));
    expect(encrypted.headline).toContain(npub.slice(-4));
    expect(encrypted.headline.startsWith('Encrypt a message to npub1')).toBeTrue();
    expect(encrypted.detail).toBe('secret');
    expect(encrypted.headline).not.toContain(PUB);

    const decrypted = describePermissionRequest({
      method: 'nip04.decrypt',
      params: { peerPubkey: PUB, ciphertext: 'SECRET-CIPHER' },
    });
    expect(decrypted.headline.startsWith('Decrypt a message from npub1')).toBeTrue();
    expect(decrypted.detail).toBeUndefined();
    expect(JSON.stringify(decrypted)).not.toContain('SECRET-CIPHER');
  });

  it('titles a local signature and a bunker forward differently', () => {
    const note = describePermissionRequest({
      method: 'signEvent',
      params: { kind: 1, content: 'hi' },
    });
    expect(permissionCardTitle([note], false)).toBe('Sign event');
    expect(permissionCardTitle([note], true)).toBe('Send to bunker');
    const encrypt = describePermissionRequest({
      method: 'nip04.encrypt',
      params: { plaintext: 'hi' },
    });
    expect(permissionCardTitle([encrypt], false)).toBe('Encrypt');
  });

  it('writes the note as text', () => {
    const list = document.createElement('div');
    fillPermissionCard(list, [
      {
        headline: 'Publish this note',
        detail: '<script>',
        danger: false,
        method: 'signEvent',
        kind: 1,
      },
    ]);
    expect(list.querySelector('script')).toBeNull();
    expect(list.textContent).toContain('Publish this note');
    expect(list.textContent).toContain('<script>');
  });
});
