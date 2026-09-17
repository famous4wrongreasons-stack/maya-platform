// K5 — the timeline (SHELL-PLAN v2.1 §1.4, §1.6, §1.8; D6, D7, D9, V2-5, V2-15, SH-06).
//
// One `role="log"` region, polite. It draws the conversation's view and nothing else: sent and
// failed user turns, the server's replies, widget items (through the injected drawer) and shell
// notices. Every failure is a visible per-turn state with its own sentence; a same-request retry is
// offered only where the conversation says it is safe, after any countdown; nothing is ever written
// as a MAYA bubble. Notices — including the SH-06 approval notice — are chrome: they carry no
// control, no link and no route, and they never enter history (the conversation keeps them out).
//
// `renderReplyLink` is the ONLY place in the bundle that writes an `href` (N-3, V2-15), and only
// after the https:/tel:/mailto: check. Everything else in a reply stays text.
//
// While the reader is within 96 px of the end, new content keeps the log scrolled to the end.

import type {
  Cancel,
  ChatFailure,
  ConversationPort,
  ConversationView,
  DomFactory,
  NoticeKind,
  Scheduler,
  TimelineItemView,
  TurnRetry,
} from '../shell/ports.ts';
import type { WidgetDrawer } from './host.ts';

type UserItem = Extract<TimelineItemView, { readonly kind: 'user' }>;

export interface TimelineMount {
  readonly factory: DomFactory;
  /** The hint, the log and the pending status are appended here, in that order. */
  readonly container: HTMLElement;
  readonly conversation: Pick<ConversationPort, 'view' | 'subscribe' | 'retry'>;
  readonly scheduler: Pick<Scheduler, 'now' | 'after' | 'frame'>;
  readonly drawer: WidgetDrawer;
  /** The «Выйти» of the tenant-required state (§1.4 row 11). */
  readonly signOut: () => void;
  /** Where focus goes when the control it was on leaves the log (a retry that started). */
  readonly focusComposer: () => void;
}

/** The distance from the end within which the log sticks to the end. */
export const STICK_TO_END_PX = 96;

// ── copy ───────────────────────────────────────────────────────────────────────────────────────

/** SH-06, exactly. */
export const APPROVAL_NOT_HERE = 'Действие ждёт подтверждения; подтвердить его здесь пока нельзя.';

export const COLD_START_HINT = 'Напишите MAYA, что нужно сделать, — ответ появится здесь.';

export const THINKING = 'MAYA думает…';

/** The shell's sentence for each notice kind. Shell chrome only: never history (P-11). */
export const noticeSentence = (notice: NoticeKind): string => {
  switch (notice) {
    case 'approval_not_here':
      return APPROVAL_NOT_HERE;
    case 'subscription_required':
      return 'Разговор с MAYA недоступен для этого бизнеса: нужна активная подписка.';
    case 'feature_locked':
      return 'MAYA сейчас недоступна для этого бизнеса.';
    case 'tenant_required':
      return 'Для разговора с MAYA нужен вход в бизнес';
    case 'outdated_client':
      return 'Версия MAYA устарела — обновите страницу';
    case 'display_capped':
      return 'Ранние сообщения скрыты: на экране остаются последние 200.';
    case 'deeplink_refused':
      return 'Эту ссылку нельзя открыть здесь.';
    case 'deeplink_unavailable':
      return 'Карточку по этой ссылке пока нельзя показать.';
  }
};

/** What happened to a turn, before any retry wording. */
export const failureBase = (failure: ChatFailure): string => {
  switch (failure.reason) {
    case 'signed_out':
      return 'Сессия завершена';
    case 'subscription_required':
      return 'Сообщение не отправлено: MAYA недоступна для этого бизнеса';
    case 'feature_locked':
      return 'Сообщение не отправлено: MAYA сейчас недоступна для этого бизнеса';
    case 'tenant_required':
      return 'Сообщение не отправлено: нужен вход в бизнес';
    case 'forbidden':
      return 'Сообщение не отправлено: этот запрос сейчас недоступен';
    case 'rate_limited':
      return 'Слишком много запросов';
    case 'outdated_client':
      return 'Сообщение не отправлено';
    case 'model_failure':
      return 'MAYA не смогла безопасно ответить';
    case 'conflict':
      return 'MAYA не приняла этот запрос';
    case 'no_connection':
      return 'Нет связи';
    case 'aborted':
      return 'Отправка прервана';
    case 'server_error':
      return 'Сервер MAYA не ответил';
    case 'unexpected_response':
      return 'Ответ MAYA не получен';
  }
};

export const NEW_TURN_NOTE = 'Текст остался в поле ввода — отправьте его ещё раз, это будет новый запрос.';

/** Whole seconds left before a same-request retry is allowed; 0 when it is allowed now. */
export const secondsLeft = (retry: TurnRetry, now: number): number =>
  retry.retry === 'same_request' && retry.notBefore !== null && retry.notBefore > now ? Math.ceil((retry.notBefore - now) / 1000) : 0;

// ── reply links (N-3) ──────────────────────────────────────────────────────────────────────────

const HTTPS_HREF = /^https:\/\/[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?(?::\d{1,5})?(?:[/?#][^\s<>"'`\\]*)?$/u;
const TEL_HREF = /^tel:\+?\d[\d()-]{2,31}$/;
const MAILTO_HREF = /^mailto:[\p{L}\p{N}._%+-]+@[\p{L}\p{N}](?:[\p{L}\p{N}.-]*[\p{L}\p{N}])?$/u;
const LINK_CANDIDATE = /(?:https:\/\/|tel:|mailto:)[^\s<>"'`]+/gu;
const TRAILING_PUNCTUATION = /[.,;:!?»)\]]+$/u;
const BOUNDARY_BEFORE = /[\s(«"']$/u;

/** True only for an https:, tel: or mailto: target with nothing that could smuggle a scheme or markup. */
export const isReplyHref = (candidate: string): boolean => HTTPS_HREF.test(candidate) || TEL_HREF.test(candidate) || MAILTO_HREF.test(candidate);

export type ReplySegment = { readonly link: false; readonly text: string } | { readonly link: true; readonly text: string };

/** A reply split into text and link candidates that pass `isReplyHref`. Everything else is text. */
export const replySegments = (reply: string): ReplySegment[] => {
  const out: ReplySegment[] = [];
  let at = 0;
  for (const match of reply.matchAll(LINK_CANDIDATE)) {
    const start = match.index;
    const before = reply.slice(0, start);
    if (start > 0 && !BOUNDARY_BEFORE.test(before)) continue;
    const candidate = match[0].replace(TRAILING_PUNCTUATION, '');
    if (!isReplyHref(candidate)) continue;
    if (start > at) out.push({ link: false, text: reply.slice(at, start) });
    out.push({ link: true, text: candidate });
    at = start + candidate.length;
  }
  if (at < reply.length) out.push({ link: false, text: reply.slice(at) });
  return out;
};

/** The ONLY href writer in the bundle: an anchor for a checked https:, tel: or mailto: target. */
export function renderReplyLink(factory: DomFactory, candidate: string): HTMLAnchorElement | null {
  if (!isReplyHref(candidate)) return null;
  const anchor = factory.create('a');
  anchor.href = candidate;
  anchor.rel = 'noopener noreferrer';
  if (candidate.startsWith('https:')) anchor.target = '_blank';
  anchor.classList.add('reply-link');
  anchor.textContent = candidate;
  return anchor;
}

// ── the log ────────────────────────────────────────────────────────────────────────────────────

interface Entry {
  readonly element: HTMLElement;
  item: TimelineItemView;
  signature: string;
  timer: Cancel | null;
}

const focusedWithin = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>(':focus');

export function mountTimeline(mount: TimelineMount): Cancel {
  const { factory, scheduler } = mount;

  const hint = factory.create('p');
  hint.classList.add('timeline-hint');
  hint.textContent = COLD_START_HINT;

  const log = factory.create('div');
  log.classList.add('timeline');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', 'Сообщения');

  // The one pending status: present from the start and empty when nothing is pending.
  const status = factory.create('p');
  status.classList.add('timeline-status');
  status.setAttribute('role', 'status');

  mount.container.append(hint, log, status);

  const entries = new Map<string, Entry>();

  const text = (className: string, value: string): HTMLParagraphElement => {
    const p = factory.create('p');
    p.classList.add(className);
    p.textContent = value;
    return p;
  };

  const author = (who: string): HTMLSpanElement => {
    const span = factory.create('span');
    span.classList.add('vh');
    span.textContent = who;
    return span;
  };

  const userSignature = (item: UserItem, now: number): string =>
    [item.text, item.modality, item.state, item.failure?.reason ?? '', item.retry.retry, secondsLeft(item.retry, now)].join('\u0000');

  const drawUser = (entry: Entry, item: UserItem): void => {
    const body = factory.create('p');
    body.classList.add('turn-text');
    body.append(author('Вы: '), item.text);
    if (item.modality === 'spoken') {
      const glyph = factory.create('span');
      glyph.classList.add('turn-voice');
      glyph.setAttribute('role', 'img');
      glyph.setAttribute('aria-label', 'голосом');
      glyph.textContent = '◉';
      body.append(' ', glyph);
    }
    const parts: HTMLElement[] = [body];
    entry.timer?.();
    entry.timer = null;
    if (item.state === 'failed' && item.failure !== null) {
      const base = failureBase(item.failure);
      const line = factory.create('p');
      line.classList.add('turn-failure');
      const left = secondsLeft(item.retry, scheduler.now());
      if (item.retry.retry === 'same_request' && left > 0) {
        line.textContent = `${base} — повторить можно через ${left} с`;
        const retry = item.retry;
        const wait = retry.notBefore === null ? 1000 : Math.max(1, Math.min(1000, retry.notBefore - scheduler.now() - (left - 1) * 1000));
        entry.timer = scheduler.after(wait, () => redraw(item.id));
      } else if (item.retry.retry === 'same_request') {
        const button = factory.create('button');
        button.type = 'button';
        button.classList.add('turn-retry');
        button.textContent = 'повторить';
        button.setAttribute('aria-label', 'Повторить отправку');
        button.addEventListener('click', () => mount.conversation.retry(item.id));
        line.append(`${base} — `, button);
      } else if (item.retry.retry === 'new_turn_only') {
        line.textContent = `${base}. ${NEW_TURN_NOTE}`;
      } else {
        line.textContent = `${base}.`;
      }
      parts.push(line);
    }
    entry.element.className = '';
    entry.element.classList.add('turn', 'turn--user', `turn--${item.state}`);
    entry.element.replaceChildren(...parts);
  };

  const drawAssistant = (element: HTMLElement, reply: string): void => {
    const body = factory.create('p');
    body.classList.add('turn-text');
    body.append(author('MAYA: '));
    for (const segment of replySegments(reply)) {
      const anchor = segment.link ? renderReplyLink(factory, segment.text) : null;
      body.append(anchor ?? segment.text);
    }
    element.classList.add('turn', 'turn--maya');
    element.replaceChildren(body);
  };

  const drawNotice = (element: HTMLElement, notice: NoticeKind): void => {
    element.classList.add('notice', `notice--${notice.replaceAll('_', '-')}`);
    const parts: HTMLElement[] = [text('notice-text', noticeSentence(notice))];
    if (notice === 'tenant_required') {
      const out = factory.create('button');
      out.type = 'button';
      out.classList.add('notice-action');
      out.textContent = 'Выйти';
      out.addEventListener('click', () => mount.signOut());
      parts.push(out);
    }
    element.replaceChildren(...parts);
  };

  /** Create or update the element of one item. A changed item keeps its element and position. */
  const place = (item: TimelineItemView): HTMLElement => {
    if (item.kind === 'widget') {
      const element = mount.drawer.element(item);
      entries.set(item.id, { element, item, signature: '', timer: null });
      return element;
    }
    const known = entries.get(item.id);
    const signature =
      item.kind === 'user' ? userSignature(item, scheduler.now()) : item.kind === 'assistant' ? `a\u0000${item.text}` : `n\u0000${item.notice}`;
    if (known !== undefined && known.signature === signature) {
      known.item = item;
      return known.element;
    }
    const element = known?.element ?? factory.create('div');
    const entry: Entry = known ?? { element, item, signature, timer: null };
    const hadFocus = known !== undefined && focusedWithin(element) !== null;
    entry.item = item;
    entry.signature = signature;
    entries.set(item.id, entry);
    if (item.kind === 'user') drawUser(entry, item);
    else if (item.kind === 'assistant') drawAssistant(element, item.text);
    else drawNotice(element, item.notice);
    // The control focus was on is gone (a retry started): continue in the composer.
    if (hadFocus && focusedWithin(element) === null) mount.scheduler.frame(mount.focusComposer);
    return element;
  };

  const render = (view: ConversationView): void => {
    const nearEnd = log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_TO_END_PX;
    const wanted: HTMLElement[] = [];
    const ids = new Set<string>();
    let newUserTurn = false;
    for (const item of view.items) {
      ids.add(item.id);
      if (item.kind === 'user' && !entries.has(item.id)) newUserTurn = true;
      wanted.push(place(item));
    }
    for (const [id, entry] of entries) {
      if (ids.has(id)) continue;
      entry.timer?.();
      entry.element.remove();
      if (entry.item.kind === 'widget') mount.drawer.release(id);
      entries.delete(id);
    }
    // The timeline only appends, replaces in place and drops from the start, so the kept elements
    // are already in order: only new ones are inserted, and nothing focused is moved.
    let previous: HTMLElement | null = null;
    for (const element of wanted) {
      if (element.parentElement !== log) {
        if (previous === null) log.prepend(element);
        else previous.after(element);
      }
      previous = element;
    }
    hint.hidden = view.items.length > 0;
    const pending = view.inFlight ? THINKING : '';
    if (status.textContent !== pending) status.textContent = pending;
    if (nearEnd || newUserTurn) scheduler.frame(() => (log.scrollTop = log.scrollHeight));
  };

  const redraw = (itemId: string): void => {
    const entry = entries.get(itemId);
    if (entry === undefined) return;
    entry.timer = null;
    entry.signature = '';
    place(entry.item);
  };

  render(mount.conversation.view());
  const off = mount.conversation.subscribe(render);
  return () => {
    off();
    for (const entry of entries.values()) entry.timer?.();
    entries.clear();
    hint.remove();
    log.remove();
    status.remove();
  };
}
