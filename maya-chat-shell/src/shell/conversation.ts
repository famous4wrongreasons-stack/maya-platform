// K5 — the conversation: the in-memory timeline and the ONE path a typed or spoken turn takes
// (SHELL-PLAN v2.1 §1.4, §1.5A, §1.6; D6, D9, D12d, V2-5).
//
// `submitUserTurn(text, origin)` is the only function that starts a turn, for the composer and for
// the voice transcript alike; `retry(itemId)` re-sends a failed turn under its own requestId where
// that is safe. Nothing else in the bundle calls `Transport.chat`. The origin (typed or spoken) is
// kept on the timeline item for the glyph and never leaves the device.
//
// History sent to `/ai/chat` is the client-carried interim history: only SENT user turns and real
// server replies, at most 11 of them plus the new message (DTO 1..12), each cut to 2 000 UTF-16 code
// units without splitting a surrogate pair (`AiCoreChatMessageDto @MaxLength(2_000)`; a reply may be
// 3 500). The timeline keeps the full reply; only the history copy is cut. Notices — including
// `approval_not_here` — failed turns and widget items are never history (P-11).
//
// Same-requestId retry (D12d): tool effects dedupe only when a re-run repeats tool, step and
// arguments, and a divergent re-run answers 409. So a requestId is reused only after 429, 502 /
// network, abort and 503; a 409 is terminal for its id, and so is any outcome whose processing
// state is unknown. Every failure is a visible per-turn state; nothing is written as a MAYA bubble.
//
// Memory only (A6). A signed-in → signed-out transition empties the timeline and aborts the turn in
// flight, so no history crosses to another session or tenant (D7 B).

import type { ChatFailure, ChatMessage, ChatProjection, ChatWidgetResolution, Outcome } from '../net/types.ts';
import type {
  Cancel,
  ComposerState,
  ConversationPort,
  ConversationView,
  NoticeKind,
  Scheduler,
  SessionPort,
  SubmitResult,
  TimelineItemView,
  Transport,
  TurnModality,
  TurnOrigin,
  TurnRetry,
} from './ports.ts';

/** The composer's limit and the DTO's per-item limit, in UTF-16 code units. */
export const MAX_TURN_CHARS = 2_000;
export const HISTORY_ITEM_MAX_CHARS = 2_000;
/** Prior history items sent with a new message (DTO `messages` 1..12). */
export const HISTORY_PRIOR_MAX = 11;
/** Items kept on screen; older ones are dropped and disclosed, never silently. */
export const DISPLAY_CAP = 200;

/** The abort side of an `AbortController`; `shell/` may not construct one, so it is injected. */
export interface AbortHandle {
  readonly signal: AbortSignal;
  abort(): void;
}

export type WidgetItemView = Extract<TimelineItemView, { readonly kind: 'widget' }>;

export type DropReason = 'cap' | 'cleared';

/** How `shell/intents.ts` and the deep-link landing write into the one timeline. */
export interface TimelineWriter {
  appendWidget(item: WidgetItemView): void;
  /** Replace a widget item at its position (L7). False when the id is not on the timeline. */
  replaceWidget(item: WidgetItemView): boolean;
  hasItem(itemId: string): boolean;
  appendNotice(notice: NoticeKind): string;
  /**
   * Items leaving the timeline so their owners release them: `cap` for the display cap, `cleared`
   * when the whole conversation ends (a signed-in → signed-out transition, or dispose).
   */
  onDropped(listener: (itemIds: readonly string[], reason: DropReason) => void): Cancel;
}

export interface ConversationDeps {
  readonly transport: Pick<Transport, 'chat'>;
  readonly session: Pick<SessionPort, 'view' | 'subscribe'>;
  readonly scheduler: Pick<Scheduler, 'now'>;
  readonly newAbort: () => AbortHandle;
  /** B4: pass one server-authorized envelope to the existing widget owner after the turn settles. */
  readonly ingestResolution?: (resolution: ChatWidgetResolution) => void;
  /** `crypto.randomUUID()` by default: 36 chars of `[0-9a-f-]`, inside the DTO's `^[A-Za-z0-9_-]{8,128}$`. */
  readonly newRequestId?: () => string;
}

export interface Conversation extends ConversationPort {
  readonly timeline: TimelineWriter;
  dispose(): void;
}

// ── pure policy ────────────────────────────────────────────────────────────────────────────────

/**
 * Cut a history item to 2 000 UTF-16 code units. When the last kept unit would be a high surrogate
 * the cut backs off one unit, so a pair is never split (legacy `app.html:16855,16858`).
 */
export const truncateForHistory = (content: string): string => {
  if (content.length <= HISTORY_ITEM_MAX_CHARS) return content;
  const last = content.charCodeAt(HISTORY_ITEM_MAX_CHARS - 1);
  const cut = last >= 0xd800 && last <= 0xdbff ? HISTORY_ITEM_MAX_CHARS - 1 : HISTORY_ITEM_MAX_CHARS;
  return content.slice(0, cut);
};

/** The user's own text: NFC, trimmed, 1..2 000 units. Never silently truncated. */
export const normalizeTurnText = (text: unknown): { readonly ok: true; readonly text: string } | { readonly ok: false; readonly refusal: 'empty' | 'too_long' } => {
  if (typeof text !== 'string') return { ok: false, refusal: 'empty' };
  const normalized = text.normalize('NFC').trim();
  if (normalized.length === 0) return { ok: false, refusal: 'empty' };
  if (normalized.length > MAX_TURN_CHARS) return { ok: false, refusal: 'too_long' };
  return { ok: true, text: normalized };
};

/**
 * §1.4 / D12d: which failures may re-send the same requestId. The request was refused before
 * processing (429), never reached the runtime (502, network, a 503 relay or model failure — the
 * runtime refuses before executing), or was cancelled by the shell. Everything else is terminal for
 * that id: a 409 conflict, and any outcome whose processing state is unknown.
 */
export const retryPolicy = (failure: ChatFailure, now: number): TurnRetry => {
  switch (failure.reason) {
    case 'rate_limited':
      return { retry: 'same_request', notBefore: now + Math.max(0, failure.retryAfterSec) * 1000 };
    case 'no_connection':
    case 'aborted':
    case 'model_failure':
      return { retry: 'same_request', notBefore: null };
    case 'server_error':
      return failure.status === 502 || failure.status === 503 ? { retry: 'same_request', notBefore: null } : { retry: 'new_turn_only' };
    case 'conflict':
    case 'unexpected_response':
      return { retry: 'new_turn_only' };
    case 'signed_out':
    case 'subscription_required':
    case 'feature_locked':
    case 'tenant_required':
    case 'forbidden':
    case 'outdated_client':
      return { retry: 'none' };
  }
};

/** The conversation-level notice a failure adds, if any (§1.4). */
export const noticeFor = (failure: ChatFailure): NoticeKind | null => {
  switch (failure.reason) {
    case 'subscription_required':
      return 'subscription_required';
    case 'feature_locked':
      return 'feature_locked';
    case 'tenant_required':
      return 'tenant_required';
    case 'outdated_client':
      return 'outdated_client';
    default:
      return null;
  }
};

// ── the timeline ───────────────────────────────────────────────────────────────────────────────

interface UserItem {
  readonly kind: 'user';
  readonly id: string;
  readonly text: string;
  readonly modality: TurnModality;
  readonly requestId: string;
  state: 'sending' | 'sent' | 'failed';
  failure: ChatFailure | null;
  retry: TurnRetry;
}

interface AssistantItem {
  readonly kind: 'assistant';
  readonly id: string;
  readonly text: string;
}

interface WidgetEntry {
  readonly kind: 'widget';
  readonly id: string;
  view: WidgetItemView;
}

interface NoticeItem {
  readonly kind: 'notice';
  readonly id: string;
  readonly notice: NoticeKind;
}

type Item = UserItem | AssistantItem | WidgetEntry | NoticeItem;

const NO_RETRY: TurnRetry = { retry: 'none' };
const DISPLAY_CAPPED_ID = 'notice:display_capped';

const itemView = (item: Item): TimelineItemView => {
  switch (item.kind) {
    case 'user':
      return { kind: 'user', id: item.id, text: item.text, modality: item.modality, state: item.state, failure: item.failure, retry: item.retry };
    case 'assistant':
      return { kind: 'assistant', id: item.id, text: item.text };
    case 'widget':
      return item.view;
    case 'notice':
      return { kind: 'notice', id: item.id, notice: item.notice };
  }
};

const defaultRequestId = (): string => crypto.randomUUID();

export const createConversation = (deps: ConversationDeps): Conversation => {
  const newRequestId = deps.newRequestId ?? defaultRequestId;
  const items: Item[] = [];
  const listeners = new Set<(view: ConversationView) => void>();
  const dropListeners = new Set<(ids: readonly string[], reason: DropReason) => void>();
  let serial = 0;
  let dropped = 0;
  let generation = 0;
  let inflight: { readonly itemId: string; readonly abort: AbortHandle; readonly generation: number } | null = null;
  let blocked: 'subscription_required' | 'tenant_required' | null = null;
  let signedIn = deps.session.view().signedIn;
  let current: ConversationView;

  const nextId = (prefix: string): string => {
    serial += 1;
    return `${prefix}${serial}`;
  };

  const composer = (): ComposerState => {
    if (!signedIn) return { enabled: false, reason: 'signed_out' };
    if (blocked !== null) return { enabled: false, reason: blocked };
    return { enabled: true };
  };

  const snapshot = (): ConversationView => {
    const views = items.map(itemView);
    if (dropped > 0) views.unshift({ kind: 'notice', id: DISPLAY_CAPPED_ID, notice: 'display_capped' });
    return { items: views, inFlight: inflight !== null, composer: composer(), dropped };
  };

  const publish = (ids: readonly string[], reason: DropReason): void => {
    if (ids.length === 0 && reason === 'cap') return;
    for (const listener of [...dropListeners]) listener(ids, reason);
  };

  const emit = (): void => {
    current = snapshot();
    for (const listener of [...listeners]) {
      try {
        listener(current);
      } catch (error) {
        // One failing subscriber never stops the others; the error still surfaces.
        setTimeout(() => {
          throw error;
        }, 0);
      }
    }
  };

  /** Keep at most DISPLAY_CAP items; never drop the turn in flight. */
  const enforceCap = (): void => {
    const gone: string[] = [];
    while (items.length > DISPLAY_CAP) {
      const index = items.findIndex((item) => item.id !== inflight?.itemId);
      if (index < 0) break;
      const [removed] = items.splice(index, 1);
      if (removed === undefined) break;
      dropped += 1;
      gone.push(removed.id);
    }
    publish(gone, 'cap');
  };

  const append = (item: Item): void => {
    items.push(item);
    enforceCap();
  };

  /** Prior history for the turn at `index`: sent user turns and replies before it, the last 11. */
  const historyBefore = (index: number): ChatMessage[] => {
    const out: ChatMessage[] = [];
    for (const item of items.slice(0, index)) {
      if (item.kind === 'user' && item.state === 'sent') out.push({ role: 'user', content: truncateForHistory(item.text) });
      else if (item.kind === 'assistant' && item.text.length > 0) out.push({ role: 'assistant', content: truncateForHistory(item.text) });
    }
    return out.slice(-HISTORY_PRIOR_MAX);
  };

  const settle = (itemId: string, turnGeneration: number, outcome: Outcome<ChatProjection, ChatFailure>): void => {
    if (turnGeneration !== generation || inflight?.itemId !== itemId) return;
    inflight = null;
    const item = items.find((x): x is UserItem => x.kind === 'user' && x.id === itemId);
    if (item === undefined) return emit();
    if (outcome.ok) {
      item.state = 'sent';
      item.failure = null;
      item.retry = NO_RETRY;
      append({ kind: 'assistant', id: nextId('a'), text: outcome.value.reply });
      if (outcome.value.resolution !== null) deps.ingestResolution?.(outcome.value.resolution);
      // V2-5, SH-06: an approval-gated action is drawn as the server's reply plus a neutral notice
      // kept outside history. No control, no link, no route: the shell cannot approve here.
      if (outcome.value.action_status === 'approval_required') append({ kind: 'notice', id: nextId('n'), notice: 'approval_not_here' });
    } else {
      const failure = outcome.failure;
      item.state = 'failed';
      item.failure = failure;
      item.retry = retryPolicy(failure, deps.scheduler.now());
      if (failure.reason === 'subscription_required' || failure.reason === 'tenant_required') blocked = failure.reason;
      const notice = noticeFor(failure);
      if (notice !== null) append({ kind: 'notice', id: nextId('n'), notice });
    }
    emit();
  };

  const send = (item: UserItem): void => {
    const index = items.indexOf(item);
    const messages: ChatMessage[] = [...historyBefore(index), { role: 'user', content: item.text }];
    const abort = deps.newAbort();
    const turnGeneration = generation;
    inflight = { itemId: item.id, abort, generation: turnGeneration };
    item.state = 'sending';
    item.failure = null;
    item.retry = NO_RETRY;
    emit();
    let pending: Promise<Outcome<ChatProjection, ChatFailure>>;
    try {
      pending = deps.transport.chat({ surface: 'web', requestId: item.requestId, messages }, abort.signal);
    } catch {
      pending = Promise.resolve({ ok: false, failure: { reason: 'unexpected_response', status: 0 } });
    }
    pending.then(
      (outcome) => settle(item.id, turnGeneration, outcome),
      // The transport never rejects for an HTTP or network outcome; if it does, whether the request
      // was processed is unknown, so the id is not reused.
      () => settle(item.id, turnGeneration, { ok: false, failure: { reason: 'unexpected_response', status: 0 } }),
    );
  };

  const latestUserTurn = (): UserItem | undefined => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      if (item?.kind === 'user') return item;
    }
    return undefined;
  };

  const submitUserTurn = (text: string, origin: TurnOrigin): SubmitResult => {
    if (!composer().enabled) return { accepted: false, refusal: 'composer_disabled' };
    if (inflight !== null) return { accepted: false, refusal: 'in_flight' };
    const checked = normalizeTurnText(text);
    if (!checked.ok) return { accepted: false, refusal: checked.refusal };
    // The conversation has moved on: an earlier failed turn could only be re-sent with a different
    // history under its old id, which is exactly the divergence D12d refuses. It becomes a new turn.
    for (const item of items) if (item.kind === 'user' && item.state === 'failed' && item.retry.retry === 'same_request') item.retry = { retry: 'new_turn_only' };
    const item: UserItem = {
      kind: 'user',
      id: nextId('u'),
      text: checked.text,
      modality: origin?.modality === 'spoken' ? 'spoken' : 'typed',
      requestId: newRequestId(),
      state: 'sending',
      failure: null,
      retry: NO_RETRY,
    };
    append(item);
    send(item);
    return { accepted: true, itemId: item.id };
  };

  const retry = (itemId: string): void => {
    const item = items.find((x): x is UserItem => x.kind === 'user' && x.id === itemId);
    if (item === undefined || item.state !== 'failed' || item.retry.retry !== 'same_request') return;
    if (inflight !== null || !composer().enabled || latestUserTurn() !== item) return;
    const notBefore = item.retry.notBefore;
    if (notBefore !== null && deps.scheduler.now() < notBefore) return;
    send(item);
  };

  const clear = (): void => {
    generation += 1;
    const abort = inflight?.abort;
    inflight = null;
    const ids = items.map((item) => item.id);
    items.length = 0;
    dropped = 0;
    blocked = null;
    abort?.abort();
    publish(ids, 'cleared');
  };

  const unsubscribe = deps.session.subscribe((view) => {
    const wasSignedIn = signedIn;
    signedIn = view.signedIn;
    if (wasSignedIn && !view.signedIn) clear();
    emit();
  });

  const timeline: TimelineWriter = {
    appendWidget(view) {
      append({ kind: 'widget', id: view.id, view });
      emit();
    },
    replaceWidget(view) {
      const index = items.findIndex((item) => item.kind === 'widget' && item.id === view.id);
      if (index < 0) return false;
      items[index] = { kind: 'widget', id: view.id, view };
      emit();
      return true;
    },
    hasItem: (itemId) => items.some((item) => item.id === itemId),
    appendNotice(notice) {
      const id = nextId('n');
      append({ kind: 'notice', id, notice });
      emit();
      return id;
    },
    onDropped(listener) {
      dropListeners.add(listener);
      return () => void dropListeners.delete(listener);
    },
  };

  current = snapshot();

  return {
    view: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    submitUserTurn,
    retry,
    timeline,
    dispose() {
      unsubscribe();
      clear();
      listeners.clear();
      dropListeners.clear();
    },
  };
};
