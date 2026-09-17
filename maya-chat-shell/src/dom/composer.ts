// K5 — the composer (SHELL-PLAN v2.1 §1.5A, §1.8; D6, D12d; V11/A-20).
//
// A labelled textarea («Сообщение для MAYA»), then «Отправить», then — appended by the host — the
// mic: the composer is first in DOM and reading order, and equally complete with or without voice.
//
//   * Enter sends; Shift+Enter inserts a newline; an IME composition is never sent.
//   * One turn in flight at a time: «Отправить» is disabled (not hidden) while it runs, and a second
//     Enter is refused by the conversation, so a double Enter makes one request.
//   * The text stays until its turn is SENT. A failed turn — a 409 included — leaves it in place, so
//     sending again is a new turn with a new request id (§1.4). The user's own text is never cut:
//     past 2 000 characters the counter says so and the conversation refuses it visibly.
//   * Disabled with a reason (402, tenant required) keeps focus where it is: `aria-disabled` and
//     read-only, never a `disabled` attribute that would throw focus away.
//   * `prefill(text)` fills the composer and never sends (the D4 B capability-index port).

import type { Cancel, ComposerState, ConversationPort, ConversationView, DomFactory, TurnOrigin } from '../shell/ports.ts';

export const COMPOSER_LIMIT = 2_000;
/** The counter appears near the limit (§1.8), not before. */
export const COUNTER_FROM = 1_800;

const TYPED: TurnOrigin = { modality: 'typed' };

export interface ComposerMount {
  readonly factory: DomFactory;
  readonly container: HTMLElement;
  readonly conversation: Pick<ConversationPort, 'view' | 'subscribe' | 'submitUserTurn'>;
}

export interface Composer {
  readonly element: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  readonly send: HTMLButtonElement;
  /** The row after «Отправить»: the voice control is appended here. */
  readonly actions: HTMLElement;
  focus(): void;
  prefill(text: string): void;
  readonly cancel: Cancel;
}

/** Why the composer cannot send, in words (§1.4). */
export const composerReason = (state: ComposerState): string | null => {
  if (state.enabled) return null;
  switch (state.reason) {
    case 'subscription_required':
      return 'Отправка недоступна: разговор с MAYA не подключён для этого бизнеса';
    case 'tenant_required':
      return 'Для разговора с MAYA нужен вход в бизнес';
    case 'signed_out':
      return 'Войдите, чтобы написать MAYA';
  }
};

export const counterText = (length: number): string =>
  length > COMPOSER_LIMIT ? `${length} / ${COMPOSER_LIMIT} — сообщение слишком длинное, сократите его` : `${length} / ${COMPOSER_LIMIT}`;

let serial = 0;
const idFor = (name: string): string => {
  serial += 1;
  return `maya-composer-${name}-${serial}`;
};

const setDisabled = (el: HTMLElement, disabled: boolean): void => {
  if (disabled) el.setAttribute('aria-disabled', 'true');
  else el.removeAttribute('aria-disabled');
};

export function mountComposer(mount: ComposerMount): Composer {
  const { factory, conversation } = mount;

  const element = factory.create('div');
  element.classList.add('composer');

  const textarea = factory.create('textarea');
  textarea.id = idFor('input');
  textarea.classList.add('composer-input');
  textarea.rows = 2;
  textarea.enterKeyHint = 'send';
  textarea.placeholder = 'Сообщение для MAYA';

  const label = factory.create('label');
  label.classList.add('vh');
  label.htmlFor = textarea.id;
  label.textContent = 'Сообщение для MAYA';

  const counter = factory.create('p');
  counter.id = idFor('counter');
  counter.classList.add('composer-counter');

  const note = factory.create('p');
  note.id = idFor('note');
  note.classList.add('composer-note');
  note.hidden = true;

  textarea.setAttribute('aria-describedby', `${note.id} ${counter.id}`);

  const send = factory.create('button');
  send.type = 'button';
  send.classList.add('composer-send');
  send.textContent = 'Отправить';

  const actions = factory.create('div');
  actions.classList.add('composer-actions');
  actions.append(send);

  const meta = factory.create('div');
  meta.classList.add('composer-meta');
  meta.append(note, counter);

  element.append(label, textarea, meta, actions);
  mount.container.append(element);

  /** The turn whose text is still in the composer, cleared once that turn is sent. */
  let awaiting: { readonly itemId: string; readonly text: string } | null = null;
  /** A refusal sentence shown until the text changes. */
  let refusal: string | null = null;

  const paint = (view: ConversationView): void => {
    const reason = composerReason(view.composer);
    textarea.readOnly = reason !== null;
    setDisabled(textarea, reason !== null);
    setDisabled(send, reason !== null || view.inFlight);
    const sentence = reason ?? refusal;
    note.hidden = sentence === null;
    note.textContent = sentence ?? '';
    const length = textarea.value.length;
    counter.hidden = length < COUNTER_FROM;
    counter.textContent = counterText(length);
    counter.classList.toggle('composer-counter--over', length > COMPOSER_LIMIT);
    if (length > COMPOSER_LIMIT) textarea.setAttribute('aria-invalid', 'true');
    else textarea.removeAttribute('aria-invalid');
  };

  const onView = (view: ConversationView): void => {
    if (awaiting !== null) {
      const turn = view.items.find((item) => item.id === awaiting?.itemId);
      if (turn === undefined) awaiting = null;
      else if (turn.kind === 'user' && turn.state === 'sent') {
        if (textarea.value === awaiting.text) textarea.value = '';
        awaiting = null;
      }
    }
    paint(view);
  };

  const sendNow = (): void => {
    const view = conversation.view();
    if (!view.composer.enabled || view.inFlight) return paint(view);
    const text = textarea.value;
    const result = conversation.submitUserTurn(text, TYPED);
    if (result.accepted) {
      awaiting = { itemId: result.itemId, text };
      refusal = null;
    } else if (result.refusal === 'empty') {
      refusal = 'Напишите сообщение';
    } else if (result.refusal === 'too_long') {
      refusal = `Сообщение длиннее ${COMPOSER_LIMIT} символов — сократите его`;
    }
    paint(conversation.view());
  };

  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    sendNow();
  });
  textarea.addEventListener('input', () => {
    refusal = null;
    paint(conversation.view());
  });
  send.addEventListener('click', () => {
    if (send.getAttribute('aria-disabled') === 'true') return;
    sendNow();
  });

  const off = conversation.subscribe(onView);
  onView(conversation.view());

  return {
    element,
    textarea,
    send,
    actions,
    focus: () => textarea.focus(),
    prefill(text) {
      textarea.value = text;
      refusal = null;
      paint(conversation.view());
      textarea.focus();
    },
    cancel: () => {
      off();
      element.remove();
    },
  };
}
