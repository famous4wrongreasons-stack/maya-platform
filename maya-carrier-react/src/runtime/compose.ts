// The carrier's composition root.
//
// This is the React twin of maya-chat-shell/entry/main.ts, and it is deliberately a transcription
// of it rather than a new design. The shell builds five plain-object host adapters and then calls
// three factories in a fixed order; this file builds the same adapters — minus the DomFactory,
// which exists only to feed src/dom/** — and calls the same factories in the same order. The one
// seam that changes is the last line of the shell's root: `mountApp({dom, …})` becomes React.
//
// Everything below the seam is the runtime's: sessions, tokens, transport, request ids, history,
// retry policy, widget authority. Nothing here decides any of it. What this module produces is a
// set of ports for the presentation to READ and to hand gestures back to.
//
// 🔴 Module scope, once, on purpose. The whole defence against a hostile OAuth callback is one
// closure variable inside createNet — `pendingTelegram`, net/session.ts:194 — which records that
// THIS app started the login. React 19 StrictMode double-invokes effects; composing inside a
// component or an effect would give two nets, `startTelegram` would record the state in one and
// `completeTelegram` would read null in the other, and every login would fail as
// `callback_unsolicited`. The shell composes at module scope and so does this.

import { createNet } from '../../../maya-chat-shell/src/net/session.ts';
import { createShellRuntime } from '../../../maya-chat-shell/src/shell/shell.ts';
import { createLiveSubmission } from '../../../maya-chat-shell/src/shell/intents.ts';
import { createVoiceControl } from '../../../maya-chat-shell/src/shell/voice-state.ts';
import { createCapture } from '../voice/capture.ts';
import { render } from '../../../maya-chat-shell/src/renderer/render.ts';
import type {
  Cancel,
  EnvironmentProbe,
  HistoryPort,
  Scheduler,
} from '../../../maya-chat-shell/src/shell/ports.ts';
import type { A11yEnvironment } from '../../../maya-chat-shell/src/contract.ts';

/** entry/main.ts:42 — the marker that says this load is a provider callback, not a route. */
const OAUTH_MARK = 'oauth=telegram';
/** entry/main.ts:40 — the native carrier hands the callback over on this event. */
const OAUTH_EVENT = 'maya:oauth-callback';
/** entry/main.ts:44 */
const WEB_CALLBACK_FILE = 'oauth-callback.html';

const scheduler: Scheduler = {
  now: () => Date.now(),
  after(ms, run) {
    const handle = window.setTimeout(run, Math.max(0, ms));
    return () => window.clearTimeout(handle);
  },
  frame(run) {
    const handle = window.requestAnimationFrame(() => run());
    return () => window.cancelAnimationFrame(handle);
  },
};

// entry/main.ts:80-89. The state object marks the entry; the URL argument is the current one,
// UNCHANGED (R3.3.4). A fullscreen detail is a route, not an address — giving it one breaks the
// invariant the shell's back handling is built on.
const history: HistoryPort = {
  push: () => window.history.pushState({ maya: 'detail' }, '', window.location.href),
  back: () => window.history.back(),
  onBack(listener) {
    const onPop = (): void => listener();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  },
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const forcedColors = window.matchMedia('(forced-colors: active)');
const coarsePointer = window.matchMedia('(pointer: coarse)');
const finePointer = window.matchMedia('(pointer: fine)');

const textScale = (): number => {
  const size = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? Math.min(3, Math.max(1, size / 16)) : 1;
};

// entry/main.ts:122-124. The fragment is snapshotted at LOAD and frozen; `fragment()` never
// re-reads location.hash. An authorization code is far longer than the router's MAX_FRAGMENT_CHARS,
// so a callback handed to the router would raise a «link refused» notice for something that was
// never a link — which is why the OAuth fragment is split off here and never reaches the router.
const rawFragment = window.location.hash;
const oauthLanded = rawFragment.includes(OAUTH_MARK);
const routerFragment = oauthLanded ? '' : rawFragment;

const a11yNow = (): A11yEnvironment => ({
  reduced_motion: reducedMotion.matches,
  forced_colors: forcedColors.matches,
  text_scale: textScale(),
  pointer: coarsePointer.matches ? 'coarse' : finePointer.matches ? 'fine' : 'none',
  keyboard_only_hint: false,
  caption_preference: false,
});

const onQueryChange = (query: MediaQueryList, listener: () => void): Cancel => {
  const fire = (): void => listener();
  query.addEventListener('change', fire);
  return () => query.removeEventListener('change', fire);
};

const environment: EnvironmentProbe = {
  a11y: a11yNow,
  onA11yChange(listener) {
    const stops = [reducedMotion, forcedColors, coarsePointer, finePointer].map((query) =>
      onQueryChange(query, () => listener(a11yNow())),
    );
    return () => {
      for (const stop of stops) stop();
    };
  },
  fragment: () => routerFragment,
  onHidden(listener) {
    const onPageHide = (): void => listener();
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') listener();
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  },
};

const newAbort = (): AbortController => new AbortController();

// ── FACTORY 1 — the session and the one transport (entry/main.ts:157-161) ──────────────────────
const origin = window.location.origin;
const net = createNet({
  webCallbackUrl: origin.startsWith('http') ? `${origin}/${WEB_CALLBACK_FILE}` : null,
  navigate: (target) => window.location.assign(target),
});

// ── the OAuth landing, between the factories (entry/main.ts:174-184) ───────────────────────────
const land = (payload: unknown): void => void net.session.completeTelegram(payload);
// NB: written without a generic type argument on purpose. The carrier's closed-tag scanner reads
// raw text, and a lowercase type argument such as `CustomEvent<unknown>` matches its tag pattern.
window.addEventListener(OAUTH_EVENT, (event) => {
  const carried: unknown = (event as CustomEvent).detail;
  land(carried);
});
if (oauthLanded) {
  // 🔴 Clear the fragment BEFORE landing it, never after. /complete is single-use, so a reload that
  // still carried the callback would burn the login and show a failure for something that had
  // already worked (entry/main.ts:179-181).
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  land(rawFragment);
}

// ── FACTORY 2 — conversation, widgets, shell chrome (entry/main.ts:185-194) ────────────────────
//
// `submission` is not optional in practice: omit it and createShellRuntime substitutes
// createUnavailableSubmission, every widget answers `unavailable`, and booking looks broken with no
// error anywhere. `render` is the pure renderer, injected — the shell may not import it.
const runtime = createShellRuntime({
  transport: net.transport,
  session: net.session,
  submission: createLiveSubmission(net.transport),
  render,
  environment,
  scheduler,
  history,
  newAbort,
});

// ── FACTORY 3 — voice (entry/main.ts:195-205) ─────────────────────────────────────────────────
//
// The machine is the published runtime's; only the CapturePort is the carrier's, because the voice
// layer is deliberately outside @maya/runtime — it is the one thing that must touch getUserMedia,
// MediaRecorder and AudioContext. See src/voice/capture.ts for why that is a capability and not an
// authority, and tools/ratchets.mjs for the two rules that came with it.
//
// `lockSources` passes the REAL vault envelopes. Substituting `() => []` — the P1 default — would
// silently disable the V6 lock that refuses to open the microphone while a card on screen holds
// personal data, and nothing would report it.
const voiceMachine = createVoiceControl({
  capture: createCapture({ secureContext: window.isSecureContext }),
  transport: net.transport,
  conversation: runtime.conversation,
  scheduler,
  newAbort,
  lockSources: () => runtime.widgets.lockSources(),
  environment,
  session: net.session,
  widgets: runtime.widgetPort,
});

export const voice = voiceMachine;

export const session = net.session;
export const conversation = runtime.conversation;
export const widgets = runtime.widgetPort;

/**
 * Deep links append a NOTICE to the timeline, so this must run after the presentation has
 * subscribed — entry/main.ts calls it at :221, after the mount at :211. Called from main.tsx.
 */
export const landFragment = (): void => void runtime.landFragment();

export const dispose = (): void => {
  voiceMachine.dispose();
  runtime.dispose();
};
