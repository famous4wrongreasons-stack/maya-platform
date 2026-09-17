// K5 — the voice control (SHELL-PLAN v2.1 §1.9, §1.8; lens-voice §6.2; WC V7, V8, V11, A-9, A-12).
//
// Draws the VoiceControlPort's view and turns trusted user gestures into GestureProofs. It holds no
// capture, no network and no text of its own beyond the chrome sentences below.
//
//   * Appended AFTER whatever the container already holds: the composer is first in DOM and reading
//     order and stays equally prominent whether or not voice exists (V11/A-20).
//   * V7: a proof is minted only from a trusted event, inside its handler. A synthetic click arms
//     nothing.
//   * V8/A-9: listening and recording differ in glyph AND label, never by motion; the level meter is
//     three discrete steps, `aria-hidden`, and the elapsed counter sits outside the live region.
//   * A-12: one polite live region, written only when the state or the notice changes (never per
//     meter tick). No `role="alert"`, nothing red: the unavailable Cell is neutral.
//   * Esc cancels a capture. «Отправить» is disabled while a chat turn is in flight.
//
// Elements come only from the closed DomFactory; styling is classList only (N-3).

import type {
  Cancel,
  ConversationPort,
  ConversationView,
  DomFactory,
  GestureProof,
  VoiceControlPort,
  VoiceNotice,
  VoiceState,
  VoiceView,
} from '../shell/ports.ts';

export interface VoiceControlMount {
  readonly factory: DomFactory;
  /** The control is appended here, after the composer the caller has already placed. */
  readonly container: HTMLElement;
  readonly voice: VoiceControlPort;
  readonly conversation: Pick<ConversationPort, 'view' | 'subscribe'>;
}

export interface VoiceIndicator {
  readonly glyph: string;
  readonly label: string;
}

const STATES: readonly VoiceState[] = ['idle', 'arming', 'listening', 'held', 'recording', 'transcribing', 'unavailable'];

/** The non-motion indicator of each in-progress state (V8). Idle and unavailable draw none. */
export function voiceIndicator(state: VoiceState): VoiceIndicator | null {
  switch (state) {
    case 'arming':
      return { glyph: '◌', label: 'Жду микрофон' };
    case 'listening':
      return { glyph: '◎', label: 'Слушаю' };
    case 'held':
      return { glyph: '‖', label: 'Остановлено' };
    case 'recording':
      return { glyph: '●', label: 'Отправляю запись' };
    case 'transcribing':
      return { glyph: '…', label: 'Распознаю' };
    case 'idle':
    case 'unavailable':
      return null;
  }
}

export function voiceNoticeSentence(notice: VoiceNotice): string {
  switch (notice) {
    case 'not_recognized':
      return 'Не расслышала — повторите или напишите сообщение';
    case 'audio_rejected':
      return 'Запись не принята — попробуйте ещё раз или напишите сообщение';
    case 'too_short':
      return 'Запись слишком короткая — ничего не отправлено';
    case 'no_connection':
      return 'Нет связи — запись не распознана, повторите или напишите сообщение';
    case 'locked_for_step':
      return 'Здесь лучше написать текстом — голос для этого шага выключен';
  }
}

/** The one polite announcement for a view. Empty when there is nothing to say. */
export function voiceStatusSentence(view: VoiceView): string {
  switch (view.state) {
    case 'idle':
      return view.notice === null ? '' : voiceNoticeSentence(view.notice);
    case 'arming':
      return 'Жду разрешения на микрофон';
    case 'listening':
      return 'Слушаю — ничего не отправляется';
    case 'held':
      return 'Прошло 20 секунд — запись остановлена и не отправлена';
    case 'recording':
      return 'Отправляю запись на распознавание';
    case 'transcribing':
      return 'Распознаю…';
    case 'unavailable':
      return view.unavailable === null ? '' : view.unavailable.label;
  }
}

/** m:ss */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  return `${Math.floor(total / 60)}:${seconds < 10 ? '0' : ''}${seconds}`;
}

const proofOf = (event: MouseEvent): GestureProof | null =>
  event.isTrusted === true ? { isTrusted: true, type: 'click', timeStamp: event.timeStamp } : null;

export function mountVoiceControl(mount: VoiceControlMount): Cancel {
  const { factory, voice, conversation } = mount;

  const region = factory.create('section');
  region.classList.add('voice');
  region.setAttribute('aria-label', 'Голосовой ввод');

  const mic = factory.create('button');
  mic.type = 'button';
  mic.classList.add('voice-mic');
  const micGlyph = factory.create('span');
  micGlyph.classList.add('voice-glyph');
  micGlyph.setAttribute('aria-hidden', 'true');
  micGlyph.textContent = '◉';
  const micLabel = factory.create('span');
  micLabel.textContent = 'Сказать голосом';
  mic.append(micGlyph, micLabel);

  const indicator = factory.create('div');
  indicator.classList.add('voice-indicator');
  const glyph = factory.create('span');
  glyph.classList.add('voice-glyph');
  glyph.setAttribute('aria-hidden', 'true');
  const label = factory.create('span');
  label.classList.add('voice-state-label');
  const meter = factory.create('span');
  meter.classList.add('voice-meter');
  meter.setAttribute('aria-hidden', 'true');
  const steps = [factory.create('span'), factory.create('span'), factory.create('span')];
  for (const step of steps) step.classList.add('voice-meter-step');
  meter.append(...steps);
  const elapsed = factory.create('time');
  elapsed.classList.add('voice-elapsed');
  indicator.append(glyph, label, meter, elapsed);

  const send = factory.create('button');
  send.type = 'button';
  send.classList.add('voice-send');
  send.textContent = 'Отправить';
  send.setAttribute('aria-label', 'Отправить запись');

  const cancel = factory.create('button');
  cancel.type = 'button';
  cancel.classList.add('voice-cancel');
  cancel.textContent = 'Отмена';

  const status = factory.create('p');
  status.classList.add('voice-status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.setAttribute('tabindex', '-1');

  region.append(mic, indicator, send, cancel, status);
  mount.container.append(region);

  const controls: readonly HTMLElement[] = [mic, send, cancel, status];
  let focused: HTMLElement | null = null;
  const track = (el: HTMLElement): void => {
    el.addEventListener('focus', () => {
      focused = el;
    });
    el.addEventListener('blur', () => {
      if (focused === el) focused = null;
    });
  };
  for (const el of controls) track(el);

  let announced: string | null = null;

  const successor = (state: VoiceState): HTMLElement => {
    switch (state) {
      case 'idle':
        return mic;
      case 'listening':
      case 'held':
        return send;
      case 'arming':
      case 'recording':
      case 'transcribing':
        return cancel;
      case 'unavailable':
        return status;
    }
  };

  const render = (view: VoiceView, talk: ConversationView): void => {
    const state = view.state;
    const hadFocus = focused;
    const capturing = state === 'arming' || state === 'listening' || state === 'held';
    const committed = state === 'recording' || state === 'transcribing';

    for (const s of STATES) region.classList.toggle(`voice--${s}`, s === state);

    mic.hidden = state !== 'idle';
    mic.disabled = !talk.composer.enabled;

    const shown = voiceIndicator(state);
    indicator.hidden = shown === null;
    glyph.textContent = shown === null ? '' : shown.glyph;
    label.textContent = shown === null ? '' : shown.label;

    meter.hidden = state !== 'listening';
    const lit = state === 'listening' ? view.level : 0;
    for (const [i, step] of steps.entries()) step.classList.toggle('is-on', i < lit);

    elapsed.hidden = state !== 'listening' && state !== 'held';
    elapsed.textContent = formatElapsed(view.elapsedMs);

    send.hidden = !(state === 'listening' || state === 'held');
    send.disabled = talk.inFlight;

    cancel.hidden = !(capturing || committed);
    // WCAG 2.5.3 (label in name): the accessible name begins with the visible «Отмена», so a person who
    // says what they see reaches the control.
    cancel.setAttribute('aria-label', state === 'transcribing' ? 'Отмена: текст не попадёт в чат' : 'Отмена записи');

    status.classList.toggle('voice-unavailable', state === 'unavailable');
    const sentence = voiceStatusSentence(view);
    if (sentence !== announced) {
      announced = sentence;
      status.textContent = sentence;
    }

    if (hadFocus !== null && hadFocus.hidden) successor(state).focus();
  };

  const redraw = (): void => render(voice.view(), conversation.view());

  mic.addEventListener('click', (event) => {
    const proof = proofOf(event);
    if (proof !== null) voice.arm(proof);
  });
  send.addEventListener('click', (event) => {
    const proof = proofOf(event);
    if (proof !== null) voice.send(proof);
  });
  cancel.addEventListener('click', () => voice.cancel());
  region.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const state = voice.view().state;
    if (state === 'idle' || state === 'unavailable') return;
    event.preventDefault();
    voice.cancel();
  });

  const stops: Cancel[] = [voice.subscribe(redraw), conversation.subscribe(redraw)];
  redraw();

  return () => {
    for (const stop of stops.splice(0)) stop();
    region.remove();
  };
}
