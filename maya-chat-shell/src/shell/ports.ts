// K5 — the ports. Frozen in S0.
//
// Every capability a layer needs from outside itself arrives through one of these, built and
// injected by `entry/main.ts` — the only module that holds the document. `dom/`, `voice/` and
// `shell/` import this module for TYPES only, so nothing here is a runtime edge.
//
//   Transport          shell -> net      the typed chat and transcribe calls
//   SessionPort        dom   -> net      sign-in, sign-out, the signed-in/out state
//   SubmissionPort     shell -> (later)  a widget intent submission; P1 binding answers unavailable
//   ConversationPort   dom   -> shell    the timeline, `submitUserTurn`, retry
//   WidgetPort         dom   -> shell    activation by intent ref, fullscreen chrome, deep links
//   VoiceControlPort   dom   -> shell    the voice hook's state machine
//   CapturePort        shell -> voice    the one capture module
//   RenderFn           shell -> renderer the pure renderer, injected (the shell may not import it)
//   DomPort            entry -> dom      the mount root and the closed element factory (dom-port.ts)
//   Scheduler, HistoryPort, ViewportPort, EnvironmentProbe   entry -> dom / shell
//
// Types only; this module emits no runtime bytes.

import type { A11yEnvironment, Cell, InteractiveRefKey, ShellRoute, TerminalLine, WidgetEnvelope, WidgetIntentSubmission } from '../contract.ts';
import type { RenderInput, RenderResult } from '../renderer/nodes.ts';
import type {
  BusinessChoice,
  BusinessMatch,
  ChatFailure,
  ChatProjection,
  ConversationHistoryProjection,
  ChatRequest,
  FirstRunFailure,
  Outcome,
  SignedOutReason,
  SignInDisplay,
  SignInFailure,
  TranscribeFailure,
  TranscribeProjection,
  TranscribeRequest,
  WidgetFailure,
  WidgetIntentProjection,
  WidgetOwnerDecisionProjection,
  WidgetResolveProjection,
  WidgetResolveRequest,
} from '../net/types.ts';

// `dom/` may not import `net/types.ts`; the shapes it draws are re-exported here unchanged.
export type {
  BusinessChoice,
  BusinessMatch,
  ChatFailure,
  FirstRunFailure,
  SignedOutReason,
  SignInDisplay,
  SignInFailure,
  TranscribeFailure,
} from '../net/types.ts';

/** Undo a registration or a timer. Idempotent. */
export type Cancel = () => void;

// ── time, history, viewport, environment ───────────────────────────────────────────────────────

export interface Scheduler {
  /** Epoch milliseconds. */
  now(): number;
  after(ms: number, run: () => void): Cancel;
  /** The next animation frame (stick-to-bottom, first-frame checks). */
  frame(run: () => void): Cancel;
}

/**
 * Back closes a fullscreen detail without an address: `push` records a history entry whose URL is
 * the current one, unchanged (R3.3.4); `back` pops it when chrome closes the detail first.
 */
export interface HistoryPort {
  push(): void;
  back(): void;
  onBack(listener: () => void): Cancel;
}

export interface ViewportPort {
  /** Bottom inset in CSS px covered by a virtual keyboard; 0 when none. */
  onInsetChange(listener: (bottomInsetPx: number) => void): Cancel;
}

export interface EnvironmentProbe {
  a11y(): A11yEnvironment;
  onA11yChange(listener: (env: A11yEnvironment) => void): Cancel;
  /** The raw fragment at load, for the NT8 parser. Query parameters are never offered. */
  fragment(): string;
  /** pagehide, or visibility becoming hidden. */
  onHidden(listener: () => void): Cancel;
}

// ── the renderer, as the shell reaches it ──────────────────────────────────────────────────────

/** `renderer/render.ts`'s `render`, injected by `entry/`: `shell/` imports renderer types only. */
export type RenderFn = (input: RenderInput) => RenderResult;

// ── network, as the shell reaches it ───────────────────────────────────────────────────────────

export interface Transport {
  /** Optional for older embedded hosts; the canonical network transport always implements it. */
  conversation?(signal: AbortSignal): Promise<Outcome<ConversationHistoryProjection, ChatFailure>>;
  chat(request: ChatRequest, signal: AbortSignal): Promise<Outcome<ChatProjection, ChatFailure>>;
  transcribe(request: TranscribeRequest, signal: AbortSignal): Promise<Outcome<TranscribeProjection, TranscribeFailure>>;
  widgetIntent(request: WidgetIntentSubmission, signal: AbortSignal): Promise<Outcome<WidgetIntentProjection, WidgetFailure>>;
  resolveWidgets(request: WidgetResolveRequest, signal: AbortSignal): Promise<Outcome<WidgetResolveProjection, WidgetFailure>>;
}

export type SessionView =
  | { readonly signedIn: false; readonly reason: SignedOutReason | null }
  | { readonly signedIn: true; readonly display: SignInDisplay };

export type SignInStep =
  | { readonly step: 'code_sent' }
  | { readonly step: 'select_business'; readonly businesses: readonly BusinessChoice[] }
  | { readonly step: 'signed_in'; readonly display: SignInDisplay }
  | { readonly step: 'failed'; readonly failure: SignInFailure };

/**
 * What the first run can answer. Finding a business and being handed to Telegram are not sign-in
 * steps: no session exists yet either way, and `handed_off` means the browser is leaving.
 */
export type FinderStep =
  | { readonly step: 'matches'; readonly businesses: readonly BusinessMatch[] }
  | { readonly step: 'failed'; readonly failure: FirstRunFailure };

export type TelegramStep = { readonly step: 'handed_off' } | { readonly step: 'failed'; readonly failure: FirstRunFailure };

/**
 * The landing: what is happening to a provider callback the shell has been handed. It is a state of
 * being SIGNED OUT, watched separately from `SessionView`, which says only whether a session exists.
 */
export type TelegramLanding =
  | { readonly state: 'none' }
  | { readonly state: 'running' }
  | { readonly state: 'failed'; readonly failure: FirstRunFailure };

export type TelegramLandingStep =
  | { readonly step: 'signed_in'; readonly display: SignInDisplay; readonly isNewUser: boolean }
  | { readonly step: 'failed'; readonly failure: FirstRunFailure };

export interface SessionPort {
  view(): SessionView;
  subscribe(listener: (view: SessionView) => void): Cancel;
  /** The canonical public finder. Refuses a term under two characters before any request. */
  findBusinesses(term: string): Promise<FinderStep>;
  /**
   * Hand this browser to Telegram for the chosen business. On success the page is already
   * navigating away, so no caller may assume it still runs.
   */
  startTelegram(tenantSlug: string): Promise<TelegramStep>;
  /** What the landing is doing now, for the screen that has to show it. */
  landing(): TelegramLanding;
  onLanding(listener: (view: TelegramLanding) => void): Cancel;
  /**
   * Land a provider callback. `entry/` hands over whatever the carrier delivered, unread: this
   * refuses anything that is not three opaque strings, and anything that does not name the login
   * THIS app started. It is the one place a Telegram login becomes a session, on every carrier.
   */
  completeTelegram(payload: unknown): Promise<TelegramLandingStep>;
  startEmail(email: string): Promise<SignInStep>;
  /** `tenantSlug` is null on first verify and the chosen `businesses[].slug` on re-verify. */
  verifyEmail(email: string, code: string, tenantSlug: string | null): Promise<SignInStep>;
  /** Refuses an empty `tenantSlug` before any request (V2-6). */
  signInPassword(tenantSlug: string, email: string, password: string): Promise<SignInStep>;
  signOut(): Promise<void>;
}

/**
 * The P1 binding answers `unavailable` (D9). The receipt member arrives with R7-E1 and B3; until
 * then no receipt shape exists in the shell.
 */
export type SubmissionOutcome =
  // Safe stale successors may still advance the timeline; fullscreen requires an accepted reply.
  | { readonly status: 'advanced'; readonly envelope: WidgetEnvelope; readonly accepted: boolean }
  /** NS-1: an accepted re-resolve. The envelope is the server's `resolved_widget`, nothing else. */
  | { readonly status: 'returned'; readonly envelope: WidgetEnvelope }
  | { readonly status: 'settled'; readonly lines: readonly TerminalLine[]; readonly ownerDecision?: WidgetOwnerDecisionProjection }
  | { readonly status: 'accepted'; readonly ownerDecision?: WidgetOwnerDecisionProjection }
  | { readonly status: 'unavailable' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'no_connection' }
  | { readonly status: 'server_error' }
  | { readonly status: 'unexpected_response' };

export interface SubmissionPort {
  submit(submission: WidgetIntentSubmission, signal: AbortSignal): Promise<SubmissionOutcome>;
}

// ── conversation, as the DOM reaches it ────────────────────────────────────────────────────────

export type TurnModality = 'typed' | 'spoken';

export interface TurnOrigin {
  readonly modality: TurnModality;
}

/** Shell chrome, never model history (P-11). The DOM owns the sentence for each kind. */
export type NoticeKind =
  | 'approval_not_here'
  | 'subscription_required'
  | 'feature_locked'
  | 'tenant_required'
  | 'outdated_client'
  | 'display_capped'
  | 'history_restored'
  | 'booking_outcomes_restored'
  | 'history_interrupted'
  | 'history_unavailable'
  | 'history_not_supported'
  | 'history_truncated'
  | 'deeplink_refused'
  | 'deeplink_unavailable';

export type TurnRetry =
  | { readonly retry: 'same_request'; readonly notBefore: number | null }
  | { readonly retry: 'new_turn_only' }
  | { readonly retry: 'none' };

/** Why a widget item carries a neutral sentence instead of a state change (D9). */
export type WidgetSentence =
  | 'activation_unavailable'
  | 'activation_forbidden'
  | 'no_connection'
  | 'route_refused'
  | 'expired_not_resolved'
  | 'service_price_confirmed'
  | 'service_price_unconfirmed'
  | 'service_price_rejected';

export type TimelineItemView =
  | {
      readonly kind: 'user';
      /** The local id remains a view key; persistence has one server-owned identity. */
      readonly userTurn?: { readonly turnId: string; readonly conversationId: string };
      readonly id: string;
      readonly text: string;
      readonly modality: TurnModality;
      readonly state: 'sending' | 'sent' | 'failed';
      readonly failure: ChatFailure | null;
      readonly retry: TurnRetry;
    }
  | { readonly kind: 'assistant'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'widget';
      readonly id: string;
      readonly result: RenderResult;
      readonly display: 'live' | 'pending' | 'collapsed' | 'stale' | 'terminal';
      readonly pending: InteractiveRefKey | null;
      readonly sentence: WidgetSentence | null;
    }
  | { readonly kind: 'notice'; readonly id: string; readonly notice: NoticeKind };

export type ComposerState =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: 'subscription_required' | 'tenant_required' | 'signed_out' };

export interface ConversationView {
  readonly items: readonly TimelineItemView[];
  readonly inFlight: boolean;
  readonly composer: ComposerState;
  /** Items no longer displayed because of the display cap; disclosed, never silent. */
  readonly dropped: number;
}

export type SubmitResult =
  | { readonly accepted: true; readonly itemId: string }
  | { readonly accepted: false; readonly refusal: 'empty' | 'too_long' | 'in_flight' | 'composer_disabled' };

export interface ConversationPort {
  view(): ConversationView;
  subscribe(listener: (view: ConversationView) => void): Cancel;
  /** THE one path for typed and spoken text. */
  submitUserTurn(text: string, origin: TurnOrigin): SubmitResult;
  retry(itemId: string): void;
}

// ── widgets, routes and the fullscreen host, as the DOM reaches them ───────────────────────────

/** The five base routes: the parameter-less `ShellRoute` members. */
export type PrimaryRoute = Extract<ShellRoute, { param: null }>['route'];

export type FullscreenView =
  | { readonly phase: 'progress'; readonly itemId: string }
  | { readonly phase: 'open'; readonly itemId: string; readonly result: RenderResult };

export interface ShellView {
  readonly primary: PrimaryRoute;
  readonly fullscreen: FullscreenView | null;
}

export interface WidgetPort {
  /** Called by the carrier after mounting an intact RenderResult, never by a tap. */
  rendered(itemId: string): void;
  view(): ShellView;
  subscribe(listener: (view: ShellView) => void): Cancel;
  navigate(route: PrimaryRoute): void;
  /** Activation by ref only; the shell resolves the intent and never exposes its token. */
  activate(itemId: string, ref: InteractiveRefKey): void;
  closeDetail(): void;
}

// ── voice ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Minted by `dom/voice-control.ts` inside a trusted user-gesture handler (V7). The capture module
 * refuses to start without one.
 */
export interface GestureProof {
  readonly isTrusted: true;
  readonly type: 'click' | 'keydown' | 'pointerup';
  readonly timeStamp: number;
}

export type CaptureAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: 'insecure_context' | 'api_absent' | 'no_mime_type' };

export type ArmOutcome =
  | { readonly armed: true }
  | { readonly armed: false; readonly reason: 'denied' | 'absent' | 'busy' };

/** An encoded clip: `data:audio/wav;base64,…`, PCM16 mono 16 kHz, 44-byte RIFF header. */
export interface EncodedClip {
  readonly durationMs: number;
  readonly dataUrl: string;
}

export interface CapturePort {
  availability(): CaptureAvailability;
  arm(proof: GestureProof): Promise<ArmOutcome>;
  /** 0..3, sampled at ≤ 4 Hz by the caller. */
  level(): 0 | 1 | 2 | 3;
  /** Stop capturing and keep the clip on the device (the 20 s cap). */
  hold(): void;
  /** Stop if needed and encode. Null when there is no clip. */
  take(proof: GestureProof): Promise<EncodedClip | null>;
  /** Stop every track and drop the clip. Idempotent. */
  cancel(): void;
}

export type VoiceState = 'idle' | 'arming' | 'listening' | 'held' | 'recording' | 'transcribing' | 'unavailable';

export type VoiceNotice = 'not_recognized' | 'audio_rejected' | 'too_short' | 'no_connection' | 'locked_for_step';

export interface VoiceView {
  readonly state: VoiceState;
  readonly elapsedMs: number;
  readonly level: 0 | 1 | 2 | 3;
  /** The V11 Cell when voice is unavailable; null otherwise. */
  readonly unavailable: Cell<boolean> | null;
  readonly notice: VoiceNotice | null;
}

export interface VoiceControlPort {
  view(): VoiceView;
  subscribe(listener: (view: VoiceView) => void): Cancel;
  arm(proof: GestureProof): void;
  send(proof: GestureProof): void;
  cancel(): void;
}
