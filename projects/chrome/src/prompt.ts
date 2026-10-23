import browser from 'webextension-polyfill';
import {
  avatarCells,
  bunkerSiteQuestionLabel,
  BunkerSiteQuestion,
  colorForPubkey,
  fillPermissionCard,
  Nip07Method,
  permissionCardTitle,
  PermissionCardLine,
  PermissionCardSnapshot,
  PromptResponse,
  PromptResponseMessage,
} from '@common';

const params = new URLSearchParams(location.search);
const id = params.get('id') as string;
const method = params.get('method') as Nip07Method | null;
const host = params.get('host') as string;
const nick = params.get('nick') as string;
const bunker = params.get('bunker') === '1';
const cardMode = params.get('card') === '1';

const titleSpanElement = document.getElementById('titleSpan');

function setTitle(title: string) {
  if (titleSpanElement) {
    titleSpanElement.innerText = title;
  }
}

function setDanger(danger: boolean) {
  titleSpanElement?.classList.toggle('danger', danger);
}

function showOnly(visibleId: string) {
  for (const elementId of ['cardGetPublicKey', 'cardBunkerAsk', 'cardConsequence']) {
    const element = document.getElementById(elementId);
    if (element) {
      element.hidden = elementId !== visibleId;
    }
  }
}

function setActionsEnabled(enabled: boolean) {
  document
    .querySelectorAll<HTMLButtonElement>('.actions button')
    .forEach((button) => {
      button.disabled = !enabled;
    });
}

function paintSigner() {
  const pk = params.get('pk') ?? '';
  const stored = params.get('color');
  const color = pk ? colorForPubkey(pk, stored ?? undefined) : '';
  const stripe = document.getElementById('stripe');
  if (stripe && color) {
    stripe.style.background = color;
  }
  const avatar = document.getElementById('avatar');
  if (!avatar) {
    return;
  }
  avatar.replaceChildren();
  if (!pk) {
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = (nick || '?').slice(0, 1).toUpperCase();
    if (color) {
      letter.style.color = color;
    }
    avatar.append(letter);
    return;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 5 5');
  for (const cell of avatarCells(pk)) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(cell.x));
    rect.setAttribute('y', String(cell.y));
    rect.setAttribute('width', '1');
    rect.setAttribute('height', '1');
    rect.setAttribute('fill', color);
    svg.append(rect);
  }
  avatar.append(svg);
}

Array.from(document.getElementsByClassName('nick-INSERT')).forEach(
  (element) => {
    (element as HTMLElement).innerText = nick;
  }
);

Array.from(document.getElementsByClassName('host-INSERT')).forEach(
  (element) => {
    (element as HTMLElement).innerText = host;
  }
);

paintSigner();

if (bunker) {
  const note = document.getElementById('bunkerNote');
  if (note) {
    note.hidden = false;
  }
}

let seenRevision = 0;

function applyCard(snapshot: PermissionCardSnapshot) {
  if (!snapshot || snapshot.revision < seenRevision) {
    return;
  }
  seenRevision = snapshot.revision;
  const list = document.getElementById('cardLines');
  const lines = Array.isArray(snapshot.lines) ? snapshot.lines : [];
  if (list) {
    fillPermissionCard(list, lines);
    list.classList.toggle('single', lines.length === 1);
  }
  const only = lines.length === 1 ? lines[0] : undefined;
  if (only) {
    setTitle(only.headline);
    setDanger(only.danger);
  } else {
    setTitle(permissionCardTitle(lines, bunker));
    setDanger(false);
  }
  setActionsEnabled(lines.length > 0);
  void browser.runtime
    .sendMessage({ type: 'card-shown', id, count: lines.length })
    .catch(() => undefined);
}

if (cardMode) {
  showOnly('cardConsequence');
  setTitle(bunker ? 'Send to bunker' : 'Sign event');
  setActionsEnabled(false);
  browser.runtime.onMessage.addListener((update: unknown) => {
    if (!update || typeof update !== 'object') {
      return;
    }
    const body = update as {
      type?: string;
      id?: string;
      revision?: number;
      lines?: PermissionCardLine[];
    };
    if (
      body.type === 'card-lines' &&
      body.id === id &&
      typeof body.revision === 'number'
    ) {
      applyCard({ revision: body.revision, lines: body.lines ?? [] });
    }
  });
  void browser.runtime
    .sendMessage({ type: 'card-ready', id })
    .then((snapshot) => {
      const body = snapshot as PermissionCardSnapshot;
      if (body && typeof body.revision === 'number') {
        applyCard(body);
      }
    })
    .catch(() => undefined);
} else if (method === 'getPublicKey') {
  showOnly('');
  setTitle('Read your public key');
} else if (isBunkerSiteQuestion(params.get('ask'))) {
  const ask = params.get('ask') as BunkerSiteQuestion;
  showOnly('');
  const label = bunkerSiteQuestionLabel(ask);
  setTitle(label.charAt(0).toUpperCase() + label.slice(1));
  setDanger(ask === 'delete' || ask === 'erase');
} else {
  showOnly('');
}

function isBunkerSiteQuestion(value: string | null): value is BunkerSiteQuestion {
  return (
    value === 'sign' ||
    value === 'encrypt' ||
    value === 'decrypt' ||
    value === 'delete' ||
    value === 'erase'
  );
}

//
// Functions
//

let delivered = false;

function deliver(response: PromptResponse) {
  if (delivered) {
    return;
  }
  delivered = true;
  const message: PromptResponseMessage = {
    id,
    response,
  };

  browser.runtime.sendMessage(message);
  window.close();
}

// Closing the window without a choice fails this request once.
window.addEventListener('beforeunload', () => {
  if (delivered) {
    return;
  }
  delivered = true;
  const message: PromptResponseMessage = {
    id,
    response: 'reject-once',
  };
  browser.runtime.sendMessage(message);
});

document.addEventListener('DOMContentLoaded', function () {
  const rejectJustOnceButton = document.getElementById('rejectJustOnceButton');
  rejectJustOnceButton?.addEventListener('click', () => {
    deliver('reject-once');
  });

  const rejectButton = document.getElementById('rejectButton');
  rejectButton?.addEventListener('click', () => {
    deliver('reject');
  });

  const approveJustOnceButton = document.getElementById(
    'approveJustOnceButton'
  );
  approveJustOnceButton?.addEventListener('click', () => {
    deliver('approve-once');
  });

  const approveButton = document.getElementById('approveButton');
  approveButton?.addEventListener('click', () => {
    deliver('approve');
  });
});
