// K5 — the entry (SHELL-PLAN v2.1 §1.1, §1.2 H1, §1.10; D5, D13, V2-15).
//
// The one module that holds the page. It takes the mount root exactly once, reaches everything else
// through that root's page object and its view, and builds every port the other layers receive:
//
//   DomFactory        the CLOSED tag set of shell/ports.ts, refused at run time as well as by type
//   Scheduler         clock, timers and animation frames
//   HistoryPort       Back without an address: an entry for the CURRENT URL, never a new one
//   ViewportPort      the virtual keyboard's bottom inset, written as one CSS custom property
//   EnvironmentProbe  reduced motion, forced colours, pointer, text scale, the load-time fragment
//
// Then the network (memory-only session, A6), the shell runtime, the voice hook, and the DOM. No
// service worker is registered and nothing is stored.

import type { A11yEnvironment } from '../src/contract.ts';
import { mountApp } from '../src/dom/host.ts';
import { createNet } from '../src/net/session.ts';
import { render } from '../src/renderer/render.ts';
import type {
  Cancel,
  EnvironmentProbe,
  HistoryPort,
  Scheduler,
  ViewportPort,
} from '../src/shell/ports.ts';
import type { DomFactory, DomInputType, DomTag } from '../src/shell/dom-port.ts';
import { createShellRuntime } from '../src/shell/shell.ts';
import { createLiveSubmission } from '../src/shell/intents.ts';
import { createVoiceControl } from '../src/shell/voice-state.ts';
import { createCapture } from '../src/voice/capture.ts';

const DOM_TAGS: ReadonlySet<string> = new Set<DomTag>([
  'div', 'span', 'p', 'section', 'article', 'header', 'footer', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
  'button', 'textarea', 'label', 'nav', 'main', 'dialog', 'table', 'caption', 'thead', 'tbody', 'tr',
  'th', 'td', 'time', 'output', 'a',
]);
const INPUT_TYPES: ReadonlySet<string> = new Set<DomInputType>(['text', 'email', 'password']);

/** The event the native carrier dispatches once it has checked the deep link's shape. */
const OAUTH_EVENT = 'maya:oauth-callback';
/** What marks this page's fragment as a provider callback rather than a route. */
const OAUTH_MARK = 'oauth=telegram';
/** The page the provider returns a WEB browser to. It carries the callback into the fragment. */
const WEB_CALLBACK_FILE = 'oauth-callback.html';

const root = document.getElementById('maya');
if (root !== null) start(root);

function start(mountRoot: HTMLElement): void {
  const page = mountRoot.ownerDocument;
  const view = page.defaultView;
  if (view === null) return;

  const factory: DomFactory = {
    create(tag) {
      if (!DOM_TAGS.has(tag)) throw new Error(`element <${tag}> is outside the closed tag set`);
      return page.createElement(tag);
    },
    createInput(type) {
      if (!INPUT_TYPES.has(type)) throw new Error(`input type ${type} is refused`);
      const input = page.createElement('input');
      input.type = type;
      return input;
    },
    text: (value) => page.createTextNode(value),
  };

  const scheduler: Scheduler = {
    now: () => Date.now(),
    after(ms, run) {
      const handle = view.setTimeout(run, Math.max(0, ms));
      return () => view.clearTimeout(handle);
    },
    frame(run) {
      const handle = view.requestAnimationFrame(() => run());
      return () => view.cancelAnimationFrame(handle);
    },
  };

  const history: HistoryPort = {
    // The state object marks the entry; the URL argument is the current one, unchanged (R3.3.4).
    push: () => view.history.pushState({ maya: 'detail' }, '', view.location.href),
    back: () => view.history.back(),
    onBack(listener) {
      const onPop = (): void => listener();
      view.addEventListener('popstate', onPop);
      return () => view.removeEventListener('popstate', onPop);
    },
  };

  const viewport: ViewportPort = {
    onInsetChange(listener) {
      const visual = view.visualViewport;
      if (visual === null) return () => undefined;
      const measure = (): void => listener(Math.max(0, Math.round(view.innerHeight - visual.height - visual.offsetTop)));
      visual.addEventListener('resize', measure);
      visual.addEventListener('scroll', measure);
      measure();
      return () => {
        visual.removeEventListener('resize', measure);
        visual.removeEventListener('scroll', measure);
      };
    },
  };

  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const forcedColors = view.matchMedia('(forced-colors: active)');
  const coarsePointer = view.matchMedia('(pointer: coarse)');
  const finePointer = view.matchMedia('(pointer: fine)');
  // 🔴 The load-time fragment, and whether it is a provider callback rather than a route. The order
  // is load-bearing: an authorization code is far longer than the router's MAX_FRAGMENT_CHARS, so
  // handing a callback to the router would raise a «link refused» notice for something that was
  // never a link — and would do it while the sign-in it belongs to is still in flight.
  const rawFragment = view.location.hash;
  const oauthLanded = rawFragment.includes(OAUTH_MARK);
  const fragment = oauthLanded ? '' : rawFragment;
  const textScale = (): number => {
    const px = Number.parseFloat(view.getComputedStyle(page.documentElement).fontSize);
    return Number.isFinite(px) && px > 0 ? Math.min(3, Math.max(1, Math.round((px / 16) * 100) / 100)) : 1;
  };
  const environment: EnvironmentProbe = {
    a11y: (): A11yEnvironment => ({
      reduced_motion: reducedMotion.matches,
      forced_colors: forcedColors.matches,
      text_scale: textScale(),
      pointer: coarsePointer.matches ? 'coarse' : finePointer.matches ? 'fine' : 'none',
      keyboard_only_hint: false,
      caption_preference: false,
    }),
    onA11yChange(listener) {
      const lists = [reducedMotion, forcedColors, coarsePointer, finePointer];
      const onChange = (): void => listener(environment.a11y());
      for (const list of lists) list.addEventListener('change', onChange);
      return () => {
        for (const list of lists) list.removeEventListener('change', onChange);
      };
    },
    fragment: () => fragment,
    onHidden(listener) {
      const onPageHide = (): void => listener();
      const onVisibility = (): void => {
        if (page.visibilityState === 'hidden') listener();
      };
      view.addEventListener('pagehide', onPageHide);
      page.addEventListener('visibilitychange', onVisibility);
      return () => {
        view.removeEventListener('pagehide', onPageHide);
        page.removeEventListener('visibilitychange', onVisibility);
      };
    },
  };

  const newAbort = (): AbortController => new view.AbortController();
  // Where Telegram returns a WEB browser: this document's own origin plus the callback file, so no
  // origin is written into the bundle and the native carrier — whose origin is not http(s) — sends
  // none, leaving that callback to the server. `navigate` is the only hand-off out of the shell.
  const origin = view.location.origin;
  const net = createNet({
    webCallbackUrl: origin.startsWith('http') ? `${origin}/${WEB_CALLBACK_FILE}` : null,
    navigate: (url) => view.location.assign(url),
  });

  // ── landing the provider's callback ──────────────────────────────────────────────────────────
  //
  // It reaches the shell two ways and ends in one place. On iOS the carrier receives the deep link,
  // checks its shape, and dispatches it as an event; on the web the callback page puts it in THIS
  // page's fragment. Neither is interpreted here: both are handed to the session unread, and the
  // session refuses anything that does not name the login this app itself started.
  //
  // The fragment, not the query, because the PKCE verifier for this flow lives on the server: until
  // it is spent, `state` + `code` together are enough for anyone to mint the session. A fragment is
  // never sent to any server, so it cannot be sitting in an access log; it is also cleared the
  // instant it is read, so a reload cannot replay it.
  const land = (payload: unknown): void => void net.session.completeTelegram(payload);
  view.addEventListener(OAUTH_EVENT, (event) => {
    land((event as CustomEvent<unknown>).detail);
  });
  if (oauthLanded) {
    // Cleared before it is even read, so a reload cannot replay it and it never enters a history
    // entry anyone can go back to — /complete is single-use, so a reload that still carried the
    // callback would burn the login and show a failure for something that had already worked.
    view.history.replaceState(null, '', view.location.pathname + view.location.search);
    land(rawFragment);
  }
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
  const voice = createVoiceControl({
    capture: createCapture({ secureContext: view.isSecureContext }),
    transport: net.transport,
    conversation: runtime.conversation,
    scheduler,
    newAbort,
    lockSources: () => runtime.widgets.lockSources(),
    environment,
    session: net.session,
    widgets: runtime.widgetPort,
  });

  mountRoot.replaceChildren();
  mountRoot.classList.add('app');
  const stops: Cancel[] = [
    viewport.onInsetChange((inset) => mountRoot.style.setProperty('--maya-keyboard-inset', `${inset}px`)),
    mountApp({
      dom: { root: mountRoot, factory },
      session: net.session,
      conversation: runtime.conversation,
      widgets: runtime.widgetPort,
      voice,
      scheduler,
    }),
  ];
  // A link lands once, at load, in the router — never in an overlay (NT8, D3).
  runtime.landFragment();

  view.addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    for (const stop of stops.splice(0)) stop();
    voice.dispose();
    runtime.dispose();
  });
}
