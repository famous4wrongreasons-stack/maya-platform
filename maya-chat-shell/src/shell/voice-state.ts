// K5 — the voice hook's state machine (SHELL-PLAN v2.1 §1.9; lens-voice §6.2, §6.4, §6.5, §6.7).
//
// Voice is an input mode on the `pwa` carrier, not a second path. A transcript goes VERBATIM into
// the one `submitUserTurn` the composer uses; this module adds no alias, ordinal, affirmation or
// escape matching (pre-LLM resolution is server-side, B5/D2), builds no readback and never names a
// surface. Everything it needs arrives injected, so it runs under `node --test` with doubles.
//
//   idle ─gesture→ arming ─granted→ listening (mic hot, nothing leaves the device)
//   arming ─denied/absent→ unavailable (the one V11 Cell)
//   listening ─«Отправить»→ recording (encode) → transcribing (POST) → submitUserTurn → idle
//   listening ─20 s cap→ held (capture stopped, clip on device, never auto-sent)
//   arming|listening|held ─«Отмена»/Esc/hidden/route change/sign-out→ idle (0 requests)
//   recording|transcribing ─«Отмена»/sign-out→ idle (the transcribe request is aborted)
//
// V6 is evaluated before arming and again at commit, over the vault-side envelopes (never the view).
// V7: every arm and send needs a genuine GestureProof, and each proof is spent once.
// No logging, no persistence, no playback; the clip is referenced only until the POST settles.

import type { Cell, Lifecycle } from '../contract.ts';
import type {
  Cancel,
  CapturePort,
  ConversationPort,
  EncodedClip,
  EnvironmentProbe,
  GestureProof,
  Scheduler,
  SessionPort,
  TranscribeFailure,
  Transport,
  TurnOrigin,
  VoiceControlPort,
  VoiceNotice,
  VoiceState,
  VoiceView,
  WidgetPort,
} from './ports.ts';

/** The capture cap: equal to the legacy web and native caps, under SpeechKit's 30 s sync limit. */
export const VOICE_CAP_MS = 20_000;
/** Shorter clips are dropped on the device; no provider call is spent on a tap. */
export const VOICE_MIN_CLIP_MS = 300;
/** Meter and elapsed-counter sampling: 4 Hz at most (V8). */
export const VOICE_TICK_MS = 250;
/** Above the 20 s provider default, below the relay's 75 s. No automatic retry. */
export const TRANSCRIBE_TIMEOUT_MS = 30_000;

export const VOICE_UNAVAILABLE_LABEL = 'Голос недоступен на этом устройстве — напишите сообщение';
export const VOICE_LOCKED_LABEL = 'Здесь лучше написать текстом — голос для этого шага выключен';

const SPOKEN: TurnOrigin = { modality: 'spoken' };

/** V11: the single failure shape. Neutral; never an error. */
export function voiceUnavailableCell(): Cell<boolean> {
  return {
    state: 'UNAVAILABLE',
    value: null,
    label: VOICE_UNAVAILABLE_LABEL,
    reason_code: 'OUT_OF_SCOPE',
    fact_ref: null,
    as_of: null,
    evidence_refs: [],
    next_intent_ref: null,
  };
}

// ── V6: the capture gate ─────────────────────────────────────────────────────────────────────────

/** What the gate reads from a live envelope: its input lock and its body. A full envelope fits. */
export interface VoiceLockSource {
  readonly lifecycle: Pick<Lifecycle, 'input_lock'>;
  readonly body: unknown;
}

export type CaptureGateResult = { readonly allowed: true } | { readonly allowed: false; readonly cell: Cell<boolean> };

const LOCKING_SENSITIVITY: ReadonlySet<unknown> = new Set(['pii', 'SECURE_SURFACE_ONLY']);

/** True when any object inside `value` declares a `sensitivity` of `pii` or `SECURE_SURFACE_ONLY`. */
function carriesLockingField(value: unknown, depth: number, seen: WeakSet<object>): boolean {
  if (typeof value !== 'object' || value === null || depth > 16 || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => carriesLockingField(item, depth + 1, seen));
  if ('sensitivity' in value && LOCKING_SENSITIVITY.has(value.sensitivity)) return true;
  return Object.values(value).some((item) => carriesLockingField(item, depth + 1, seen));
}

/**
 * V6 (WC §4.7): while `input_lock !== 'none'` on a body holding a `pii` or `SECURE_SURFACE_ONLY`
 * field, capture is refused with an explanatory Cell. The walk only narrows: any declared locking
 * sensitivity anywhere in the body counts.
 */
export function captureGate(sources: readonly VoiceLockSource[]): CaptureGateResult {
  for (const source of sources)
    if (source.lifecycle.input_lock !== 'none' && carriesLockingField(source.body, 0, new WeakSet<object>()))
      return {
        allowed: false,
        cell: {
          state: 'UNAVAILABLE',
          value: null,
          label: VOICE_LOCKED_LABEL,
          reason_code: 'OUT_OF_SCOPE',
          fact_ref: null,
          as_of: null,
          evidence_refs: [],
          next_intent_ref: null,
        },
      };
  return { allowed: true };
}

// ── transcribe outcome mapping (lens-voice §6.4) ─────────────────────────────────────────────────

export type TranscribeDisposition =
  | { readonly then: 'notice'; readonly notice: VoiceNotice }
  | { readonly then: 'unavailable' }
  | { readonly then: 'quiet' };

/**
 * Every failure is neutral. `signed_out` and a user abort are quiet here because the session state
 * (or the user's own cancel) is what the screen shows; a timed-out abort is a lost connection.
 */
export function mapTranscribeFailure(failure: TranscribeFailure, timedOut: boolean): TranscribeDisposition {
  switch (failure.reason) {
    case 'not_recognized':
      return { then: 'notice', notice: 'not_recognized' };
    case 'audio_rejected':
    case 'rate_limited':
    case 'unexpected_response':
      return { then: 'notice', notice: 'audio_rejected' };
    case 'provider_unavailable':
      return { then: 'unavailable' };
    case 'no_connection':
      return { then: 'notice', notice: 'no_connection' };
    case 'aborted':
      return timedOut ? { then: 'notice', notice: 'no_connection' } : { then: 'quiet' };
    case 'signed_out':
      return { then: 'quiet' };
  }
}

// ── the machine ──────────────────────────────────────────────────────────────────────────────────

/** An abortable request handle. `entry/` passes `() => new AbortController()`. */
export interface AbortHandle {
  readonly signal: AbortSignal;
  abort(): void;
}

export interface VoiceDeps {
  readonly capture: CapturePort;
  readonly transport: Pick<Transport, 'transcribe'>;
  /** THE conversation: its `submitUserTurn` is the only way a transcript leaves this module. */
  readonly conversation: Pick<ConversationPort, 'view' | 'subscribe' | 'submitUserTurn'>;
  readonly scheduler: Scheduler;
  readonly newAbort: () => AbortHandle;
  /** V6: the live envelopes as the vault holds them (P1 has none: `() => []`). */
  readonly lockSources: () => readonly VoiceLockSource[];
  readonly environment: Pick<EnvironmentProbe, 'onHidden'>;
  readonly session: Pick<SessionPort, 'view' | 'subscribe'>;
  readonly widgets: Pick<WidgetPort, 'view' | 'subscribe'>;
}

export interface VoiceMachine extends VoiceControlPort {
  /** Unsubscribe from the environment, session and route; cancel anything in progress. */
  dispose(): void;
}

const GESTURE_TYPES: ReadonlySet<string> = new Set(['click', 'keydown', 'pointerup']);

function genuineProof(proof: GestureProof | null | undefined): boolean {
  return (
    typeof proof === 'object' &&
    proof !== null &&
    proof.isTrusted === true &&
    GESTURE_TYPES.has(proof.type) &&
    typeof proof.timeStamp === 'number' &&
    Number.isFinite(proof.timeStamp)
  );
}

const CAPTURING: ReadonlySet<VoiceState> = new Set<VoiceState>(['arming', 'listening', 'held']);
const COMMITTED: ReadonlySet<VoiceState> = new Set<VoiceState>(['recording', 'transcribing']);

export function createVoiceControl(deps: VoiceDeps): VoiceMachine {
  const { capture, scheduler } = deps;
  const listeners = new Set<(view: VoiceView) => void>();
  const spent = new WeakSet<object>();

  const availableAtStart = capture.availability().available;
  let current: VoiceView = {
    state: availableAtStart ? 'idle' : 'unavailable',
    elapsedMs: 0,
    level: 0,
    unavailable: availableAtStart ? null : voiceUnavailableCell(),
    notice: null,
  };
  /** Bumped on every exit from an operation; an older continuation finds itself stale and stops. */
  let operation = 0;
  let startedAt = 0;
  let tick: Cancel | null = null;
  let cap: Cancel | null = null;
  let timeout: Cancel | null = null;
  let inflight: AbortHandle | null = null;
  let waiting: Cancel | null = null;

  const emit = (next: Partial<VoiceView>): void => {
    current = { ...current, ...next };
    for (const listener of [...listeners]) listener(current);
  };

  const spend = (proof: GestureProof): boolean => {
    if (!genuineProof(proof) || spent.has(proof)) return false;
    spent.add(proof);
    return true;
  };

  const clearTimers = (): void => {
    tick?.();
    tick = null;
    cap?.();
    cap = null;
    timeout?.();
    timeout = null;
    waiting?.();
    waiting = null;
  };

  /** Leave whatever is in progress: timers off, request aborted, tracks stopped, clip dropped. */
  const halt = (): void => {
    operation += 1;
    clearTimers();
    const request = inflight;
    inflight = null;
    request?.abort();
    capture.cancel();
  };

  const toIdle = (notice: VoiceNotice | null): void => {
    halt();
    emit({ state: 'idle', elapsedMs: 0, level: 0, notice });
  };

  const toUnavailable = (): void => {
    halt();
    emit({ state: 'unavailable', elapsedMs: 0, level: 0, unavailable: voiceUnavailableCell(), notice: null });
  };

  const sample = (): void => {
    tick = null;
    if (current.state !== 'listening') return;
    emit({ elapsedMs: Math.max(0, scheduler.now() - startedAt), level: capture.level() });
    tick = scheduler.after(VOICE_TICK_MS, sample);
  };

  const onCap = (): void => {
    cap = null;
    if (current.state !== 'listening') return;
    tick?.();
    tick = null;
    capture.hold();
    emit({ state: 'held', elapsedMs: VOICE_CAP_MS, level: 0 });
  };

  const startListening = (): void => {
    startedAt = scheduler.now();
    emit({ state: 'listening', elapsedMs: 0, level: 0, notice: null });
    tick = scheduler.after(VOICE_TICK_MS, sample);
    cap = scheduler.after(VOICE_CAP_MS, onCap);
  };

  /** A typed turn is in flight: deliver when the conversation frees up (never re-entering its notification). */
  const waitForTurn = (op: number, transcript: string): void => {
    let fired = false;
    let unsubscribe: Cancel | null = null;
    const release = (): void => {
      unsubscribe?.();
      unsubscribe = null;
    };
    unsubscribe = deps.conversation.subscribe((view) => {
      if (fired || view.inFlight) return;
      fired = true;
      release();
      waiting = scheduler.after(0, () => {
        waiting = null;
        deliver(op, transcript);
      });
    });
    if (fired) release();
    else waiting = release;
  };

  /** Hand the transcript to THE conversation, verbatim. The only way a transcript leaves this module. */
  const deliver = (op: number, transcript: string): void => {
    if (op !== operation) return;
    if (deps.conversation.view().inFlight) return waitForTurn(op, transcript);
    const result = deps.conversation.submitUserTurn(transcript, SPOKEN);
    if (result.accepted) return toIdle(null);
    switch (result.refusal) {
      case 'in_flight':
        waiting = scheduler.after(VOICE_TICK_MS, () => {
          waiting = null;
          deliver(op, transcript);
        });
        return;
      case 'empty':
        return toIdle('not_recognized');
      case 'too_long':
        return toIdle('audio_rejected');
      case 'composer_disabled':
        return toIdle(null);
    }
  };

  const transcribe = (op: number, clip: EncodedClip): void => {
    emit({ state: 'transcribing' });
    const request = deps.newAbort();
    inflight = request;
    let timedOut = false;
    timeout = scheduler.after(TRANSCRIBE_TIMEOUT_MS, () => {
      timeout = null;
      timedOut = true;
      request.abort();
    });
    deps.transport.transcribe({ audioBase64: clip.dataUrl }, request.signal).then(
      (outcome) => {
        if (op !== operation) return;
        timeout?.();
        timeout = null;
        inflight = null;
        if (outcome.ok) return deliver(op, outcome.value.transcript);
        const disposition = mapTranscribeFailure(outcome.failure, timedOut);
        if (disposition.then === 'unavailable') return toUnavailable();
        return toIdle(disposition.then === 'notice' ? disposition.notice : null);
      },
      () => {
        if (op === operation) toIdle('no_connection');
      },
    );
  };

  const machine: VoiceMachine = {
    view: () => current,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    arm(proof) {
      if (!spend(proof)) return;
      if (current.state !== 'idle') return;
      if (!deps.session.view().signedIn || !deps.conversation.view().composer.enabled) return;
      if (!capture.availability().available) return toUnavailable();
      if (!captureGate(deps.lockSources()).allowed) return emit({ notice: 'locked_for_step' });
      operation += 1;
      const op = operation;
      emit({ state: 'arming', elapsedMs: 0, level: 0, notice: null });
      capture.arm(proof).then(
        (outcome) => {
          if (op !== operation) return;
          if (outcome.armed) return startListening();
          if (outcome.reason === 'busy') return toIdle(null);
          return toUnavailable();
        },
        () => {
          if (op === operation) toUnavailable();
        },
      );
    },

    send(proof) {
      if (!spend(proof)) return;
      if (current.state !== 'listening' && current.state !== 'held') return;
      const conversation = deps.conversation.view();
      if (!conversation.composer.enabled) return toIdle(null);
      if (conversation.inFlight) return;
      if (!captureGate(deps.lockSources()).allowed) return toIdle('locked_for_step');
      if (current.state === 'listening' && scheduler.now() - startedAt < VOICE_MIN_CLIP_MS) return toIdle('too_short');
      clearTimers();
      operation += 1;
      const op = operation;
      emit({ state: 'recording', level: 0 });
      capture.take(proof).then(
        (clip) => {
          if (op !== operation) return;
          if (clip === null || clip.durationMs < VOICE_MIN_CLIP_MS) return toIdle('too_short');
          transcribe(op, clip);
        },
        () => {
          if (op === operation) toUnavailable();
        },
      );
    },

    cancel() {
      if (CAPTURING.has(current.state) || COMMITTED.has(current.state)) return toIdle(null);
      if (current.state === 'idle' && current.notice !== null) emit({ notice: null });
    },

    dispose() {
      for (const stop of subscriptions) stop();
      subscriptions.length = 0;
      if (CAPTURING.has(current.state) || COMMITTED.has(current.state)) toIdle(null);
      listeners.clear();
    },
  };

  // Hidden page and route change end a capture that has not been committed; sign-out ends all.
  let primary = deps.widgets.view().primary;
  const subscriptions: Cancel[] = [
    deps.environment.onHidden(() => {
      if (CAPTURING.has(current.state)) toIdle(null);
    }),
    deps.widgets.subscribe((view) => {
      if (view.primary === primary) return;
      primary = view.primary;
      if (CAPTURING.has(current.state)) toIdle(null);
    }),
    deps.session.subscribe((view) => {
      if (!view.signedIn && (CAPTURING.has(current.state) || COMMITTED.has(current.state))) toIdle(null);
    }),
  ];

  return machine;
}
