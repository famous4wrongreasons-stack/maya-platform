// K5 — the shell. One source, emitted once.
//
// The shell owns what is on screen. That single sentence is the difference from today's app, where
// six overlays mounted themselves and nothing could enumerate what was open. Here a surface asks,
// the shell decides, and the answer is a value anyone can inspect.
//
// State (SHELL-PLAN v2.1 §1.5D, §1.7): the conversation, which is always open; ONE primary route of
// the five base routes; at most ONE fullscreen detail, in PROGRESS or OPEN; and the opener it returns
// to. A detail never opens from a route key or a URL (D3, R3.3.4): it opens as PROGRESS when an
// activation of a NAVIGATE(detail) intent starts, and OPEN only through `presentDetail(envelope,
// opener)`, which is contract-typed and receipt-agnostic. Close, Esc and Back are shell chrome, not
// intents. Back goes through `HistoryPort`, which records an entry for the CURRENT address: the URL
// never changes, so there is no address for a detail.

import type { InteractiveRefKey, WidgetEnvelope } from '../contract.ts';
import type { RenderResult } from '../renderer/nodes.ts';
import { BASE_ROUTES } from '../routes/registry.ts';
import { createConversation, type AbortHandle, type Conversation } from './conversation.ts';
import { landDeepLink, type DeepLinkLanding } from './deeplink.ts';
import { createUnavailableSubmission, createWidgets, type Widgets } from './intents.ts';
import type {
  Cancel,
  EnvironmentProbe,
  FullscreenView,
  HistoryPort,
  PrimaryRoute,
  RenderFn,
  Scheduler,
  SessionPort,
  ShellView,
  SubmissionPort,
  Transport,
  WidgetPort,
} from './ports.ts';

/** The timeline control that asked for a detail: focus returns to it, and its item carries any sentence. */
export interface DetailOpener {
  readonly itemId: string;
  readonly ref: InteractiveRefKey;
}

export interface ShellState {
  /** The conversation is always present. It is not a route you leave — it is where you are. */
  readonly conversation: 'open';
  readonly primary: PrimaryRoute;
  /** At most ONE fullscreen surface. Two was the old bug; one is a type, not a convention. */
  readonly fullscreen: FullscreenView | null;
  readonly opener: DetailOpener | null;
}

export const initialState = (): ShellState => ({
  conversation: 'open',
  primary: 'shell.root',
  fullscreen: null,
  opener: null,
});

// ── pure transitions ───────────────────────────────────────────────────────────────────────────

/** A base route, checked against the closed list: a value outside it is not a route. */
export const asPrimaryRoute = (value: unknown): PrimaryRoute | null => BASE_ROUTES.find((k) => k === value) ?? null;

/** Switch the primary route. Leaving for another route closes any detail first (one action back). */
export const navigateState = (state: ShellState, route: unknown): ShellState => {
  const primary = asPrimaryRoute(route);
  if (primary === null) return state;
  if (primary === state.primary && state.fullscreen === null) return state;
  return { ...state, primary, fullscreen: null, opener: null };
};

/** A detail in PROGRESS, replacing whatever detail was showing: one at a time. */
export const progressState = (state: ShellState, opener: DetailOpener): ShellState => ({
  ...state,
  fullscreen: { phase: 'progress', itemId: opener.itemId },
  opener,
});

export const openState = (state: ShellState, opener: DetailOpener, itemId: string, result: RenderResult): ShellState => ({
  ...state,
  fullscreen: { phase: 'open', itemId, result },
  opener,
});

/** The escape verb §4 requires on every tier. Closing is always available and never fails. */
export const closedState = (state: ShellState): ShellState =>
  state.fullscreen === null && state.opener === null ? state : { ...state, fullscreen: null, opener: null };

// ── the controller ─────────────────────────────────────────────────────────────────────────────

/** What renders inside a detail: `shell/intents.ts` verifies, vaults, projects and renders it at SHEET. */
export interface DetailSource {
  openDetail(envelope: WidgetEnvelope, opener: DetailOpener): { readonly itemId: string; readonly result: RenderResult } | null;
  /** The detail left the screen: its tokens and timers go with it. */
  releaseDetail(itemId: string): void;
  /** True when the item is a widget item on the timeline. */
  hasTimelineItem(itemId: string): boolean;
}

/** What `shell/intents.ts` may do to the chrome. */
export interface ShellChrome {
  openProgress(opener: DetailOpener): void;
  /** Redraw the open detail (an environment change); ignored unless `itemId` is the one open. */
  updateDetail(itemId: string, result: RenderResult): void;
  closeDetail(): void;
  /** Close a detail still in PROGRESS for this item; an OPEN detail, or another item's, stays. */
  closeProgress(itemId: string): void;
}

export type PresentOutcome =
  | { readonly presented: true; readonly itemId: string }
  | { readonly presented: false; readonly reason: 'no_source' | 'no_opener' | 'refused' };

export interface ShellController extends ShellChrome {
  view(): ShellView;
  subscribe(listener: (view: ShellView) => void): Cancel;
  state(): ShellState;
  navigate(route: PrimaryRoute): void;
  presentDetail(envelope: WidgetEnvelope, opener: DetailOpener): PresentOutcome;
  connect(source: DetailSource): Cancel;
  dispose(): void;
}

export interface ShellDeps {
  readonly history: HistoryPort;
  /**
   * Signed out, the primary route is the root: sign-in is the signed-out state of the root screen
   * (SH-04), so a route asked for while signed out (a landed link) is applied at sign-in. A signed-in →
   * signed-out transition closes the detail and returns to the root.
   */
  readonly session?: Pick<SessionPort, 'view' | 'subscribe'>;
}

export const createShell = (deps: ShellDeps): ShellController => {
  let state = initialState();
  let current: ShellView = { primary: state.primary, fullscreen: state.fullscreen };
  let source: DetailSource | null = null;
  /** True while this shell owns a history entry pushed for a detail. */
  let pushed = false;
  const listeners = new Set<(view: ShellView) => void>();

  const set = (next: ShellState): void => {
    if (next === state) return;
    const before = state.fullscreen;
    state = next;
    // A detail that left the screen, or was replaced by another, releases its tokens.
    if (before?.phase === 'open' && (next.fullscreen?.phase !== 'open' || next.fullscreen.itemId !== before.itemId)) source?.releaseDetail(before.itemId);
    current = { primary: state.primary, fullscreen: state.fullscreen };
    for (const listener of [...listeners]) {
      try {
        listener(current);
      } catch (error) {
        setTimeout(() => {
          throw error;
        }, 0);
      }
    }
  };

  const ensureHistoryEntry = (): void => {
    if (pushed) return;
    deps.history.push();
    pushed = true;
  };

  const closeDetail = (): void => {
    if (state.fullscreen === null) return;
    set(closedState(state));
    if (pushed) {
      pushed = false;
      deps.history.back();
    }
  };

  const offBack = deps.history.onBack(() => {
    if (!pushed) return;
    // The browser already popped the entry; closing must not pop another one.
    pushed = false;
    set(closedState(state));
  });

  let signedIn = deps.session?.view().signedIn ?? true;
  /** A route asked for while signed out; applied at sign-in. */
  let afterSignIn: PrimaryRoute | null = null;
  const offSession =
    deps.session?.subscribe((session) => {
      const was = signedIn;
      signedIn = session.signedIn;
      if (was && !session.signedIn) {
        afterSignIn = null;
        closeDetail();
        set(navigateState(state, 'shell.root'));
      } else if (!was && session.signedIn && afterSignIn !== null) {
        const route = afterSignIn;
        afterSignIn = null;
        set(navigateState(state, route));
      }
    }) ?? (() => undefined);

  return {
    view: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    state: () => state,
    navigate(route) {
      const primary = asPrimaryRoute(route);
      if (primary === null) return;
      if (!signedIn) {
        afterSignIn = primary === 'shell.root' ? null : primary;
        return;
      }
      closeDetail();
      set(navigateState(state, primary));
    },
    openProgress(opener) {
      ensureHistoryEntry();
      set(progressState(state, opener));
    },
    updateDetail(itemId, result) {
      const open = state.fullscreen;
      if (open?.phase !== 'open' || open.itemId !== itemId || state.opener === null) return;
      set(openState(state, state.opener, itemId, result));
    },
    closeDetail,
    closeProgress(itemId) {
      const shown = state.fullscreen;
      if (shown?.phase === 'progress' && shown.itemId === itemId) closeDetail();
    },
    presentDetail(envelope, opener) {
      if (source === null) return { presented: false, reason: 'no_source' };
      if (opener === null || typeof opener !== 'object' || !source.hasTimelineItem(opener.itemId)) return { presented: false, reason: 'no_opener' };
      const opened = source.openDetail(envelope, opener);
      if (opened === null) return { presented: false, reason: 'refused' };
      ensureHistoryEntry();
      set(openState(state, opener, opened.itemId, opened.result));
      return { presented: true, itemId: opened.itemId };
    },
    connect(next) {
      source = next;
      return () => {
        if (source === next) source = null;
      };
    },
    dispose() {
      offBack();
      offSession();
      closeDetail();
      listeners.clear();
      source = null;
    },
  };
};

// ── composition, for entry/ ────────────────────────────────────────────────────────────────────

export interface ShellRuntimeDeps {
  readonly transport: Pick<Transport, 'chat'>;
  readonly session: Pick<SessionPort, 'view' | 'subscribe'>;
  readonly render: RenderFn;
  readonly environment: Pick<EnvironmentProbe, 'a11y' | 'onA11yChange' | 'fragment'>;
  readonly scheduler: Pick<Scheduler, 'now' | 'after'>;
  readonly history: HistoryPort;
  readonly newAbort: () => AbortHandle;
  /** The P1 binding is `createUnavailableSubmission()` (D9); B3 replaces it. */
  readonly submission?: SubmissionPort;
  /** Request ids and client nonces; `crypto.randomUUID()` by default. */
  readonly newId?: () => string;
}

export interface ShellRuntime {
  readonly conversation: Conversation;
  readonly widgets: Widgets;
  readonly shell: ShellController;
  /** The DOM's view of routes, widgets and the detail chrome. */
  readonly widgetPort: WidgetPort;
  /** Land the load-time fragment (NT8). Makes no request. */
  landFragment(): DeepLinkLanding;
  dispose(): void;
}

const defaultId = (): string => crypto.randomUUID();

/** Wire the conversation, the widget store and the shell controller together, once. */
export const createShellRuntime = (deps: ShellRuntimeDeps): ShellRuntime => {
  const newId = deps.newId ?? defaultId;
  const conversation = createConversation({
    transport: deps.transport,
    session: deps.session,
    scheduler: deps.scheduler,
    newAbort: deps.newAbort,
    newRequestId: newId,
  });
  const shell = createShell({ history: deps.history, session: deps.session });
  const widgets = createWidgets({
    timeline: conversation.timeline,
    render: deps.render,
    environment: deps.environment,
    submission: deps.submission ?? createUnavailableSubmission(),
    scheduler: deps.scheduler,
    newAbort: deps.newAbort,
    newNonce: newId,
    chrome: shell,
  });
  const disconnect = shell.connect(widgets);
  const widgetPort: WidgetPort = {
    view: shell.view,
    subscribe: shell.subscribe,
    navigate: shell.navigate,
    activate: (itemId, ref) => void widgets.activate(itemId, ref),
    closeDetail: shell.closeDetail,
  };
  return {
    conversation,
    widgets,
    shell,
    widgetPort,
    landFragment: () =>
      landDeepLink(deps.environment.fragment(), {
        navigate: (route) => shell.navigate(route),
        notice: (kind) => void conversation.timeline.appendNotice(kind),
      }),
    dispose() {
      disconnect();
      widgets.dispose();
      shell.dispose();
      conversation.dispose();
    },
  };
};
