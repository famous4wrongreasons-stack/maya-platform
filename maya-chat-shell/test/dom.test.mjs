// K5 / S5 — the DOM host, entry, sign-in and styles (SHELL-PLAN v2.1 §1.1, §1.4, §1.7, §1.8, §1.11,
// §2.4, §3.1 S5; D7, D10, D13, V2-5, V2-6, V2-15, V2-16; owner rulings SH-04, SH-06, A6).
//
//   node --test test/dom.test.mjs
//
// No browser and no DOM library: `src/dom/**` runs on test/dom-double.mjs, the shell on the real
// runtime (`createShellRuntime`, the real renderer, S2's backend-hashed envelope corpus), and the
// network either as counting doubles or — for the sign-in mapping — S3's real `createNet` over a
// fetch double answering the recorded backend bodies. The double throws on any request or HTML sink,
// so a module that reached one fails the test that drew it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDom, createScheduler } from './dom-double.mjs';
import { render } from '../src/renderer/render.ts';
import { createShellRuntime } from '../src/shell/shell.ts';
import { createNet } from '../src/net/session.ts';
import { BASE_ROUTES, ROUTES } from '../src/routes/registry.ts';
import { createWidgetDrawer, drawResult, identityText, mountApp } from '../src/dom/host.ts';
import { APPROVAL_NOT_HERE, isReplyHref, renderReplyLink, replySegments } from '../src/dom/timeline.ts';
import { failureSentence, fieldSentence, firstRunSentence, mountSignIn, signedOutSentence } from '../src/dom/signin.ts';
import { mountFullscreen } from '../src/dom/fullscreen.ts';
import { HEADER_CSP, cspSplitProblems } from '../dev/serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');
const ENVELOPES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const API = path.join(SH, 'dev', 'fixtures', 'api');
const INDEX = JSON.parse(fs.readFileSync(path.join(ENVELOPES, 'index.json'), 'utf8'));
const NOW = Date.parse(INDEX.now);
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };
const DISPLAY = { userName: 'Анна Смирнова', tenantName: 'Салон «Северный ветер»' };
const ROLE_WORDS = /Владелец|Сотрудник|Клиент|онлайн/;

const envelopeOf = (id) => JSON.parse(fs.readFileSync(path.join(ENVELOPES, INDEX.fixtures.find((f) => f.id === id).file), 'utf8'));
const apiFixture = (rel) => JSON.parse(fs.readFileSync(path.join(API, rel), 'utf8'));
const flush = async (rounds = 12) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setImmediate(resolve));
};
const secretsOf = (f) => [...f.secrets.intent_tokens, ...f.secrets.class_i_refs, ...f.secrets.receipt_pointers, ...f.secrets.idempotency_keys, f.secrets.envelope_seal, f.secrets.principal_proof_hash, f.secrets.tenant_id];

// ── doubles ──────────────────────────────────────────────────────────────────────────────────────

function sessionDouble(initial = { signedIn: false, reason: null }) {
  let view = initial;
  const listeners = new Set();
  const calls = [];
  const answers = {};
  let landing = { state: 'none' };
  const landingListeners = new Set();
  const setLanding = (next) => {
    landing = next;
    for (const l of [...landingListeners]) l(next);
  };
  const session = {
    view: () => view,
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    async startEmail(email) {
      calls.push(['startEmail', email]);
      return answers.startEmail ? answers.startEmail(email) : { step: 'code_sent' };
    },
    async verifyEmail(email, code, slug) {
      calls.push(['verifyEmail', email, code, slug]);
      return answers.verifyEmail ? answers.verifyEmail(email, code, slug) : { step: 'failed', failure: { state: 'code_invalid' } };
    },
    async signInPassword(slug, email, password) {
      calls.push(['signInPassword', slug, email, password]);
      return answers.signInPassword ? answers.signInPassword(slug, email, password) : { step: 'failed', failure: { state: 'credentials_invalid' } };
    },
    async findBusinesses(term) {
      calls.push(['findBusinesses', term]);
      return answers.findBusinesses ? answers.findBusinesses(term) : { step: 'matches', businesses: MATCHES };
    },
    async startTelegram(slug) {
      calls.push(['startTelegram', slug]);
      return answers.startTelegram ? answers.startTelegram(slug) : { step: 'handed_off' };
    },
    landing: () => landing,
    onLanding(listener) {
      landingListeners.add(listener);
      return () => landingListeners.delete(listener);
    },
    async completeTelegram(payload) {
      calls.push(['completeTelegram', payload]);
      return answers.completeTelegram ? answers.completeTelegram(payload) : { step: 'failed', failure: { state: 'callback_unsolicited' } };
    },
    async signOut() {
      calls.push(['signOut']);
      set({ signedIn: false, reason: 'signed_out' });
    },
  };
  const set = (next) => {
    view = next;
    for (const l of [...listeners]) l(next);
  };
  return { session, calls, answers, set, setLanding, signIn: (display = DISPLAY) => set({ signedIn: true, display }) };
}

/** What the canonical public finder answers in these tests. The slug is never shown, only carried. */
const MATCHES = [
  { name: 'Салон «Северный ветер»', slug: 'severny-veter', address: 'ул. Лесная, 8' },
  { name: 'Студия «Тихая гавань»', slug: 'tikhaya-gavan', address: 'пр. Морской, 2' },
];

const termField = (dom) => dom.find((el) => el.localName === 'input' && /Название или город/.test(dom.nameOf(el)));

/** The first run, as a person walks it: type a term, find, choose a business. */
async function chooseBusiness(dom, label = /Северный ветер/) {
  dom.type(termField(dom), 'се');
  dom.click(dom.button(/^Найти$/));
  await flush();
  dom.click(dom.button(label));
  await flush();
}

/** Password sign-in lives behind this disclosure and is never the first thing offered. */
const openOtherWay = (dom) => dom.click(dom.button(/^Другой способ входа$/));

/** Find, choose, open the other way in, and fill the two fields it asks for. */
async function toPassword(dom, { email = 'anna@example.test', password = 'mock-password-1' } = {}) {
  await chooseBusiness(dom);
  openOtherWay(dom);
  dom.type(dom.find((el) => el.type === 'email'), email);
  const field = dom.find((el) => el.type === 'password');
  dom.type(field, password);
  return field;
}

function voiceDouble() {
  const view = { state: 'idle', elapsedMs: 0, level: 0, unavailable: null, notice: null };
  return { view: () => view, subscribe: () => () => undefined, arm: () => undefined, send: () => undefined, cancel: () => undefined };
}

/** The page: dom double + real shell runtime + counting network doubles + mountApp. */
function page({ signedIn = true, voice = true, chat = null, fragment = '' } = {}) {
  const dom = createDom();
  const scheduler = createScheduler(NOW);
  const s = sessionDouble(signedIn ? { signedIn: true, display: DISPLAY } : { signedIn: false, reason: null });
  const chats = [];
  const outcomes = [];
  const history = { pushes: 0, backs: 0, listener: null };
  const transport = {
    chat(request, signal) {
      chats.push(request);
      const next = outcomes.shift();
      if (chat) return chat(request, signal);
      return Promise.resolve(next ?? { ok: true, value: { request_id: request.requestId, reply: `Ответ ${chats.length}`, action_status: null, resolution: null } });
    },
    transcribe: () => new Promise(() => undefined),
  };
  let ids = 0;
  const runtime = createShellRuntime({
    transport,
    session: s.session,
    render,
    environment: { a11y: () => A11Y, onA11yChange: () => () => undefined, fragment: () => fragment },
    scheduler,
    history: { push: () => (history.pushes += 1), back: () => (history.backs += 1), onBack: (l) => ((history.listener = l), () => (history.listener = null)) },
    newAbort: () => new AbortController(),
    newId: () => `request-${String((ids += 1)).padStart(6, '0')}`,
  });
  const cancel = mountApp({
    dom: { root: dom.root, factory: dom.factory },
    session: s.session,
    conversation: runtime.conversation,
    widgets: runtime.widgetPort,
    voice: voice ? voiceDouble() : null,
    scheduler,
  });
  scheduler.flush();
  const composer = () => dom.find((el) => el.localName === 'textarea' && dom.nameOf(el) === 'Сообщение для MAYA');
  const log = () => dom.find((el) => el.getAttribute('role') === 'log');
  const send = async (text) => {
    dom.type(composer(), text);
    dom.key(composer(), 'Enter');
    await flush();
    scheduler.flush();
  };
  return { dom, scheduler, ...s, runtime, chats, outcomes, history, cancel, composer, log, send };
}

// ── entry: index.html, main.ts, styles.css ───────────────────────────────────────────────────────

test('entry/index.html: meta CSP without frame-ancestors (D10), data: favicon, digest placeholder, no inline script', () => {
  const html = fs.readFileSync(path.join(SH, 'entry', 'index.html'), 'utf8');
  assert.deepEqual(cspSplitProblems(HEADER_CSP, html), []);
  assert.ok(!/frame-ancestors|report-uri|report-to|sandbox/.test(html));
  assert.equal((html.match(/connect-src 'self'/g) ?? []).length, 1);
  assert.match(html, /<link rel="icon" href="data:,">/, 'the favicon is a data link: no /favicon.ico request, no console error');
  assert.equal((html.match(/<script\b/g) ?? []).length, 1);
  assert.match(html, /<script type="module" src="\.\/m\/<webDigest16>\/entry\/main\.js"><\/script>/);
  // 🔴 The stylesheet must carry the digest too. The JS is content-addressed under m/<digest>/, but
  // styles.css sits at a FIXED path — and on the production host nginx serves static files itself,
  // never reaching Apache, so no .htaccess rule can shorten its cache. Measured on 2026-09-29:
  // `cache-control: max-age=604800` on styles.css, and a browser that had visited before ran the new
  // markup against a seven-day-old stylesheet. The digest is computed over the modules AND the
  // stylesheet, so this query changes whenever either does.
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css\?v=<webDigest16>">/);
  assert.match(html, /<main id="maya"/);
  assert.match(html, /<noscript>/);
  assert.ok(!/document\.(body|getElementById|querySelector)/.test(html), 'the page text names no host acquisition');
});

test('entry/main.ts: `document` on exactly one code line — the one host acquisition — and the closed tag set equals dom-port.ts DomTag', () => {
  const main = fs.readFileSync(path.join(SH, 'entry', 'main.ts'), 'utf8');
  const codeLines = main.split('\n').filter((l) => /\bdocument\b/.test(l) && !/^\s*(\/\/|\/?\*)/.test(l));
  assert.deepEqual(codeLines, ["const root = document.getElementById('maya');"]);
  // DomTag moved to src/shell/dom-port.ts when the ports split, so that `shell/` and `net/` could be
  // type-checked with no DOM lib at all — the ratchet the React presentation carrier rests on.
  const ports = fs.readFileSync(path.join(SH, 'src', 'shell', 'dom-port.ts'), 'utf8');
  assert.ok(!/^export (type|interface) (DomTag|DomInputType|DomFactory|DomPort)\b/m.test(fs.readFileSync(path.join(SH, 'src', 'shell', 'ports.ts'), 'utf8')),
    'ports.ts DECLARES no DOM-typed member — that is what makes the headless typecheck possible (a doc comment naming one is fine)');
  const union = /export type DomTag =([^;]+);/.exec(ports)[1].match(/'([a-z0-9]+)'/g).map((s) => s.slice(1, -1)).sort();
  const set = /const DOM_TAGS[^=]*= new Set<DomTag>\(\[([^\]]+)\]/.exec(main)[1].match(/'([a-z0-9]+)'/g).map((s) => s.slice(1, -1)).sort();
  assert.deepEqual(set, union);
  for (const banned of ['img', 'iframe', 'form', 'link', 'script', 'svg', 'video', 'audio', 'object', 'embed', 'style', 'base', 'meta']) assert.ok(!set.includes(banned), banned);
  assert.ok(!/serviceWorker|localStorage|sessionStorage|indexedDB/.test(main));
});

test('entry/styles.css: tokens, forced colours, reduced motion, 44 px targets, nothing external', () => {
  const css = fs.readFileSync(path.join(SH, 'entry', 'styles.css'), 'utf8');
  assert.match(css, /:root \{/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important;[\s\S]*transition: none !important;/);
  assert.match(css, /--target: 44px;/);
  assert.match(css, /overflow-wrap: anywhere/);
  // "Nothing external" means no rule here can make the browser fetch anything. The ribbon mark is an
  // inline `data:` URI — bytes in this very file — so it is admitted BY SHAPE, and then the original
  // ban stands over everything that is left. (An SVG names its own gradients with url(#id) and its
  // own xmlns with an http URL; both are internal to those bytes, not rules of this stylesheet.)
  const outside = css.replace(/url\("data:image\/svg\+xml,[^"]*"\)/g, 'INLINE_SVG');
  assert.ok(!/url\(|@import|https?:/.test(outside), 'no external resource');
  assert.ok(!/\bdocument\b/.test(css), 'the K5 one-line count walks entry/');
});

// ── the phone (§1.11, A-10): overscroll, the four device insets, the keyboard ─────────────────────
//
// The browser measurements live in test/mobile-probe.mjs (headless Chrome, 390x844 and 320x568, real
// Emulation.setSafeAreaInsetsOverride). These read the stylesheet itself so `npm test` keeps the shape
// of the fix without a browser: one shared shell, no carrier branch.

const STYLES = () => fs.readFileSync(path.join(SH, 'entry', 'styles.css'), 'utf8');

/**
 * styles.css as { selector, body, at } rules in source order, flattening @media (and any other)
 * at-rule blocks but REMEMBERING which one each rule came from: `at` is '' at the top level and the
 * at-rule prelude(s) otherwise. The context is what makes it possible to ask what a selector's
 * padding actually is inside a media block rather than trusting the base declaration — which is how a
 * `padding-block` override silently dropped the nav's home-indicator inset on every short viewport.
 */
function cssRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const walk = (from, to, at) => {
    let sel = '';
    let j = from;
    while (j < to) {
      if (text[j] !== '{') {
        sel += text[j];
        j += 1;
        continue;
      }
      let depth = 1;
      let k = j + 1;
      while (k < to && depth > 0) {
        if (text[k] === '{') depth += 1;
        else if (text[k] === '}') depth -= 1;
        k += 1;
      }
      const name = sel.trim();
      if (name.startsWith('@')) walk(j + 1, k - 1, at === '' ? name : `${at} ${name}`);
      else rules.push({ selector: name, body: text.slice(j + 1, k - 1), at });
      sel = '';
      j = k;
    }
  };
  walk(0, text.length, '');
  return rules;
}

const selectorsOf = (rule) => rule.selector.split(',').map((s) => s.trim()).filter((s) => s !== '');
const declsOf = (body) => {
  const out = new Map();
  let depth = 0;
  let cut = 0;
  const parts = [];
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '(') depth += 1;
    else if (body[i] === ')') depth -= 1;
    else if (body[i] === ';' && depth === 0) {
      parts.push(body.slice(cut, i));
      cut = i + 1;
    }
  }
  parts.push(body.slice(cut));
  for (const part of parts) {
    const at = part.indexOf(':');
    if (at < 0) continue;
    const prop = part.slice(0, at).trim();
    if (prop === '') continue;
    out.set(prop, part.slice(at + 1).trim().replace(/\s*!important$/, ''));
  }
  return out;
};
/** A property value split on top-level whitespace: `calc(a + b) 0.5rem` is two values, not five. */
const splitTop = (value) => {
  const out = [];
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1;
    else if (value[i] === ')') depth -= 1;
    else if (depth === 0 && /\s/.test(value[i])) {
      if (i > cut) out.push(value.slice(cut, i));
      cut = i + 1;
    }
  }
  if (value.length > cut) out.push(value.slice(cut));
  return out.map((v) => v.trim()).filter((v) => v !== '');
};

/** Which sides a padding declaration sets, and to what. Every form the stylesheet may use. */
function paddingSides(prop, value) {
  const v = splitTop(value);
  if (v.length === 0) return null;
  const four = (t, r, b, l) => ({ top: t, right: r, bottom: b, left: l });
  switch (prop) {
    case 'padding':
      if (v.length === 1) return four(v[0], v[0], v[0], v[0]);
      if (v.length === 2) return four(v[0], v[1], v[0], v[1]);
      if (v.length === 3) return four(v[0], v[1], v[2], v[1]);
      return four(v[0], v[1], v[2], v[3]);
    case 'padding-block':
      return v.length === 1 ? { top: v[0], bottom: v[0] } : { top: v[0], bottom: v[1] };
    case 'padding-inline':
      // The shell is `dir: ltr` (entry/index.html, and the manifest says so): start is left.
      return v.length === 1 ? { left: v[0], right: v[0] } : { left: v[0], right: v[1] };
    case 'padding-top':
    case 'padding-block-start':
      return { top: v.join(' ') };
    case 'padding-bottom':
    case 'padding-block-end':
      return { bottom: v.join(' ') };
    case 'padding-left':
    case 'padding-inline-start':
      return { left: v.join(' ') };
    case 'padding-right':
    case 'padding-inline-end':
      return { right: v.join(' ') };
    default:
      return null;
  }
}

/** Every at-rule context the stylesheet has, plus the top level — the cascade is base, then context. */
const cssContexts = (rules) => [...new Set(rules.map((r) => r.at))];

/**
 * The padding a selector really has in one at-rule context: the base rules first, then that context's,
 * every padding form applied in source order. This is what a browser computes, and it is the only
 * honest way to ask "does the nav still carry the home-indicator inset inside this media block?".
 */
function paddingIn(rules, selector, at) {
  const sides = { top: null, right: null, bottom: null, left: null };
  for (const rule of rules) {
    if (rule.at !== '' && rule.at !== at) continue;
    if (!selectorsOf(rule).includes(selector)) continue;
    for (const [prop, value] of declsOf(rule.body)) {
      const set = paddingSides(prop, value);
      if (set !== null) Object.assign(sides, set);
    }
  }
  return sides;
}

/** Every value a selector declares for a property, in source order (the last one wins in CSS). */
const declared = (rules, selector, prop) => rules.filter((r) => selectorsOf(r).includes(selector)).map((r) => declsOf(r.body).get(prop)).filter((v) => v !== undefined);
const lastDecl = (rules, selector, prop) => declared(rules, selector, prop).at(-1) ?? null;

test('entry/styles.css: the document refuses overscroll and EVERY scroll container contains it — a pull-to-refresh reload would end the memory-only session (A6)', () => {
  const rules = cssRules(STYLES());
  assert.equal(lastDecl(rules, 'html', 'overscroll-behavior'), 'none', 'html');
  assert.equal(lastDecl(rules, 'body', 'overscroll-behavior'), 'none', 'body');

  const scrolls = (v) => v !== undefined && /\b(auto|scroll)\b/.test(v);
  const scrollers = rules.filter((r) => {
    const d = declsOf(r.body);
    return scrolls(d.get('overflow')) || scrolls(d.get('overflow-y')) || scrolls(d.get('overflow-x'));
  });
  // The log, the route panel, the fullscreen body, the wide-table scroller and the short-viewport nav.
  assert.ok(scrollers.length >= 5, `only ${scrollers.length} scroll containers found: ${scrollers.map((r) => r.selector).join(' | ')}`);
  const uncontained = [];
  for (const rule of scrollers)
    for (const selector of selectorsOf(rule)) {
      const contained = rules
        .filter((r) => selectorsOf(r).includes(selector))
        .some((r) => [...declsOf(r.body).keys()].some((p) => p === 'overscroll-behavior' || p.startsWith('overscroll-behavior-')));
      if (!contained) uncontained.push(selector);
    }
  assert.deepEqual([...new Set(uncontained)], [], 'a scroll container whose drag can chain out of it');
});

test('entry/styles.css: the four device insets are read once, and every surface with no .app-shell above it pads from them — IN EVERY at-rule context', () => {
  const rules = cssRules(STYLES());
  for (const side of ['top', 'right', 'bottom', 'left']) assert.equal(lastDecl(rules, ':root', `--safe-${side}`), `env(safe-area-inset-${side}, 0px)`, side);

  /* Enumerated, not trusted. A media block that restates `padding` or `padding-block` replaces the
   * side the base rule had computed, and the inset is gone with it — which is exactly what the
   * short-viewport block did to the nav's home-indicator inset while a test that read only the base
   * declaration kept passing. So every surface below is checked in every context the stylesheet has,
   * and a new media block that drops an inset fails here even if the base rule still names it. */
  const needed = {
    // The signed-in shell: the notch and the two cheeks here, the keyboard at the bottom (the home
    // indicator is the nav's, below).
    '.app-shell': { top: /var\(--safe-top\)/, right: /var\(--safe-right\)/, left: /var\(--safe-left\)/, bottom: /var\(--maya-keyboard-inset/ },
    // The nav ends the column at every viewport, so the home indicator is its job at every viewport.
    '.nav': { bottom: /var\(--safe-bottom\)/ },
    // Sign-in is the root screen when signed out (SH-04) and the noscript line is drawn without any
    // shell at all, so each carries all four edges itself.
    '.signin': { top: /--safe-top\b/, right: /--safe-right\b/, bottom: /--safe-bottom\b/, left: /--safe-left\b/ },
    '.noscript': { top: /--safe-top\b/, right: /--safe-right\b/, bottom: /--safe-bottom\b/, left: /--safe-left\b/ },
    // The dialog fills the window: notch and cheeks on the dialog, keyboard at its bottom (the same
    // term .app-shell uses — `100dvh` is the whole window on iOS even with the keyboard up), and the
    // home indicator on .fullscreen-body, the surface that actually ends there.
    '.fullscreen': { top: /var\(--safe-top\)/, right: /var\(--safe-right\)/, left: /var\(--safe-left\)/, bottom: /var\(--maya-keyboard-inset/ },
    '.fullscreen-body': { bottom: /var\(--safe-bottom\)/ },
  };
  const contexts = cssContexts(rules);
  assert.ok(contexts.length >= 2 && contexts.includes(''), `contexts: ${JSON.stringify(contexts)}`);
  const missing = [];
  for (const [selector, sides] of Object.entries(needed))
    for (const at of contexts) {
      const padding = paddingIn(rules, selector, at);
      for (const [side, want] of Object.entries(sides))
        if (padding[side] === null || !want.test(padding[side]))
          missing.push(`${selector} ${side} in "${at || 'the top level'}" is ${JSON.stringify(padding[side])}, wanted ${want}`);
    }
  assert.deepEqual(missing, []);

  // One source for the four numbers: no other rule reaches for env() itself.
  assert.deepEqual(rules.filter((r) => r.selector !== ':root' && /env\(\s*safe-area/.test(r.body)).map((r) => r.selector), []);
});

test('entry/styles.css: the nav keeps its home-indicator inset because a media block can only change the row token, not the inset', () => {
  const rules = cssRules(STYLES());
  // The shape that makes the enumeration above hold by construction rather than by review: the row's
  // own padding is a token, and the bottom is a separate longhand declared after the shorthand.
  const base = rules.filter((r) => r.at === '');
  assert.equal(lastDecl(base, '.nav', '--nav-pad-block'), '0.35rem');
  assert.equal(lastDecl(base, '.nav', 'padding'), 'var(--nav-pad-block) 0.5rem');
  // The short viewport changes the token and nothing else about the nav's padding.
  const short0 = cssContexts(rules).find((at) => /max-height/.test(at));
  assert.equal(lastDecl(rules.filter((r) => r.at === short0), '.nav', '--nav-pad-block'), '0.25rem');
  assert.equal(lastDecl(base, '.nav', 'padding-bottom'), 'calc(var(--nav-pad-block) + var(--safe-bottom))');
  // No rule for .nav in any media block may restate a padding that covers the bottom side.
  const offenders = rules
    .filter((r) => r.at !== '' && selectorsOf(r).includes('.nav'))
    .filter((r) => [...declsOf(r.body).keys()].some((prop) => (paddingSides(prop, declsOf(r.body).get(prop)) ?? {}).bottom !== undefined))
    .map((r) => `${r.at}: ${[...declsOf(r.body).keys()].join(', ')}`);
  assert.deepEqual(offenders, []);
});

test('entry/styles.css: the conversation column cannot spill out of the fixed-height shell, and the hint is what gives way', () => {
  const rules = cssRules(STYLES());
  // The floor: the column carries its own remainder instead of pushing it past the window, and that
  // drag stays inside it (A6 — a chained drag becomes pull-to-refresh, and a reload ends the session).
  assert.equal(lastDecl(rules, '.panel--conversation', 'overflow-y'), 'auto');
  assert.equal(lastDecl(rules, '.panel--conversation', 'overscroll-behavior'), 'contain');
  // The hint is the one part with no upper bound: it must be able to give its room back and carry its
  // own remainder. `min-height: 0` is the load-bearing half — a flex item's default `auto` minimum is
  // what pushed the composer out of the column at a 2x text scale.
  assert.equal(lastDecl(rules, '.timeline-hint', 'min-height'), '0');
  assert.equal(lastDecl(rules, '.timeline-hint', 'overflow-y'), 'auto');
  assert.equal(lastDecl(rules, '.timeline-hint', 'overscroll-behavior'), 'contain');
  assert.match(lastDecl(rules, '.timeline-hint', 'flex') ?? '', /^0 1 /);
  // A border-box item cannot shrink below its own padding, so the short viewport tightens the two
  // paddings that sit above the composer; without this the composer was clipped by 26.5 px at
  // 320x568 with a 2x text scale and the device insets applied.
  const short = cssContexts(rules).find((at) => /max-height/.test(at));
  assert.ok(short, 'the short-viewport block');
  for (const selector of ['.timeline-hint', '.timeline'])
    assert.equal(paddingIn(rules, selector, short).top, '0.25rem', selector);
  // The composer is the item that must NOT shrink: it is the control the owner needs to reach.
  assert.equal(lastDecl(rules, '.composer', 'flex-shrink'), '0');
});

test('entry/styles.css + entry/main.ts: what must fit above the on-screen keyboard is sized from the visible height, never from vh', () => {
  const rules = cssRules(STYLES());
  const main = fs.readFileSync(path.join(SH, 'entry', 'main.ts'), 'utf8');
  assert.match(main, /visualViewport/, 'the entry measures the inset from the visual viewport');
  assert.match(main, /--maya-keyboard-inset/, 'and writes it as one custom property');
  assert.equal(lastDecl(rules, '.app-shell', '--maya-visible-height'), 'calc(100dvh - var(--maya-keyboard-inset, 0px))');
  assert.equal(lastDecl(rules, '.app-shell', 'padding-bottom'), 'var(--maya-keyboard-inset, 0px)');
  // Every height the owner can drag the textarea to — the base rule and the short-viewport override.
  const caps = declared(rules, '.composer-input', 'max-height');
  assert.ok(caps.length >= 2, `max-height declared ${caps.length} times`);
  for (const cap of caps) assert.match(cap, /var\(--maya-visible-height/, cap);
});

test('entry/styles.css: the fullscreen BODY scrolls, not the <dialog>, and the flex display is scoped to [open]', () => {
  const rules = cssRules(STYLES());
  assert.equal(lastDecl(rules, '.fullscreen', 'overflow'), 'hidden', 'the UA gives <dialog> overflow: auto');
  assert.equal(lastDecl(rules, '.fullscreen', 'display'), null, 'an author display on a closed dialog beats the UA display:none by origin');
  assert.equal(lastDecl(rules, '.fullscreen[open]', 'display'), 'flex');
  assert.equal(lastDecl(rules, '.fullscreen-body', 'overflow-y'), 'auto');
  assert.equal(lastDecl(rules, '.fullscreen-body', 'min-height'), '0');
  assert.equal(lastDecl(rules, '.fullscreen-body', 'flex'), '1 1 auto');
});

test('the only href write in src/** is renderReplyLink in dom/timeline.ts (N-3, V2-15)', () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts'))
        fs.readFileSync(p, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/\.href\s*=[^=]|setAttribute\(\s*['"]href/.test(line)) hits.push(`${path.relative(SH, p)}:${i + 1}`);
          });
    }
  };
  walk(path.join(SH, 'src'));
  walk(path.join(SH, 'entry'));
  assert.equal(hits.length, 1, hits.join(', '));
  const timeline = fs.readFileSync(path.join(SH, 'src', 'dom', 'timeline.ts'), 'utf8');
  const fn = timeline.slice(timeline.indexOf('export function renderReplyLink'));
  assert.ok(fn.indexOf('anchor.href = candidate') > 0 && fn.indexOf('anchor.href = candidate') < fn.indexOf('\n}\n'), 'inside renderReplyLink, after the check');
});

// ── the signed-out root state (SH-04, V2-6, V2-16) ─────────────────────────────────────────────────

test('signed out: the root screen is the sign-in state — no composer, no nav, no route, 0 chat requests', () => {
  const p = page({ signedIn: false });
  const text = p.dom.visibleText();
  assert.match(text, /Вход в MAYA/);
  assert.equal(p.composer(), null);
  assert.equal(p.dom.find((el) => el.localName === 'nav'), null);
  assert.equal(p.runtime.widgetPort.view().primary, 'shell.root');
  const fields = p.dom.findAll((el) => el.localName === 'input').map((el) => [el.type, p.dom.nameOf(el), p.dom.isVisible(el)]);
  // The first run asks ONE question. Email and password belong to the other way in, which is closed,
  // and nothing on this screen ever asks anyone to type a business handle.
  assert.deepEqual(fields.filter((f) => f[2]).map((f) => f.slice(0, 2)), [['text', 'Название или город']]);
  assert.equal(p.chats.length, 0);
  assert.ok(!/VK|ВКонтакте|MAX/i.test(p.dom.serialize()), 'no VK/MAX links');
  // Owner decision 2026-09-29 (OPTION B — TELEGRAM-FIRST) replaced the earlier «no Telegram hand-off»
  // rule: Telegram IS the offered way in. What it replaced is asserted below — it is still not a LINK
  // to a legacy login page, and email is not offered while that capability is switched off.
  assert.ok(/Продолжить с Telegram/.test(p.dom.serialize()), 'Telegram is the way in');
  assert.equal(p.dom.findAll((el) => el.localName === 'a').length, 0, 'no hand-off link to a legacy login page');
  const visible = p.dom.visibleText();
  assert.ok(!/войти по коду|код из письма|получить код/i.test(visible), 'email sign-in is not offered while the capability is off');
  // Owner constraint: no implementation vocabulary reaches the person.
  assert.ok(!/slug|слаг|адрес бизнеса|tenant|principal/i.test(visible), `implementation vocabulary: «${visible}»`);
  assert.match(visible, /Найдите свой бизнес/);
});

test('the business handle comes from the finder, never from a person: password sign-in carries it and no field asks for it (V2-6)', async () => {
  const dom = createDom();
  const scheduler = createScheduler(NOW);
  const s = sessionDouble();
  mountSignIn({ factory: dom.factory, container: dom.root, session: s.session, scheduler });

  // Before a business is chosen the other way in cannot be used, and it says so rather than
  // presenting fields that would fail.
  openOtherWay(dom);
  assert.equal(dom.find((el) => el.type === 'password' && dom.isVisible(el)), null, 'no password field yet');
  assert.match(dom.visibleText(), /Сначала найдите свой бизнес/);
  assert.equal(s.calls.filter((c) => c[0] === 'signInPassword').length, 0, '0 requests');

  // The matches are shown by name AND street address — that is how two of one name are told apart.
  dom.type(termField(dom), 'се');
  dom.click(dom.button(/^Найти$/));
  await flush();
  assert.deepEqual(s.calls.at(-1), ['findBusinesses', 'се']);
  const rows = dom.findAll((el) => el.localName === 'button' && el.classList.contains('signin-match')).map((b) => dom.textOf(b));
  assert.deepEqual(rows, ['Салон «Северный ветер»ул. Лесная, 8', 'Студия «Тихая гавань»пр. Морской, 2']);
  assert.ok(!/severny-veter|tikhaya-gavan/.test(dom.visibleText()), 'the handle is carried, never shown');

  dom.click(dom.button(/Тихая гавань/));
  await flush();
  dom.type(dom.find((el) => el.type === 'email'), 'anna@example.test');
  const password = dom.find((el) => el.type === 'password');
  dom.type(password, 'mock-password-1');
  dom.key(password, 'Enter');
  await flush();
  // The chosen row's handle is what reaches the port — V2-6 is satisfied without anyone typing it.
  assert.deepEqual(s.calls.at(-1), ['signInPassword', 'tikhaya-gavan', 'anna@example.test', 'mock-password-1']);
});

test('«Продолжить с Telegram» hands off the chosen business, and appears only once one is chosen', async () => {
  const dom = createDom();
  const s = sessionDouble();
  mountSignIn({ factory: dom.factory, container: dom.root, session: s.session, scheduler: createScheduler(NOW) });
  const telegram = dom.find((el) => el.localName === 'button' && el.classList.contains('signin-button--telegram'));
  assert.ok(!dom.isVisible(telegram), 'nothing to hand off before a business is chosen');
  await chooseBusiness(dom);
  assert.ok(dom.isVisible(telegram), 'the way in appears with the choice');
  assert.equal(dom.active(), telegram, 'focus lands on it');
  assert.match(dom.visibleText(), /Вы выбрали: Салон «Северный ветер»/);
  dom.click(telegram);
  await flush();
  assert.deepEqual(s.calls.at(-1), ['startTelegram', 'severny-veter']);
  assert.equal(dom.findAll((el) => el.getAttribute('role') === 'alert').length, 0);
});

test('the finder names every outcome: nothing found, too short, no connection — each a sentence and a focused control', async () => {
  for (const [answer, sentence] of [
    [{ step: 'matches', businesses: [] }, /Ничего не нашлось/],
    [{ step: 'failed', failure: { state: 'term_too_short' } }, /Введите хотя бы два символа/],
    [{ step: 'failed', failure: { state: 'no_connection' } }, /Нет связи/],
    [{ step: 'failed', failure: { state: 'business_unavailable' } }, /Этот бизнес сейчас не принимает вход/],
  ]) {
    const dom = createDom();
    const s = sessionDouble();
    s.answers.findBusinesses = () => answer;
    mountSignIn({ factory: dom.factory, container: dom.root, session: s.session, scheduler: createScheduler(NOW) });
    dom.type(termField(dom), 'се');
    dom.click(dom.button(/^Найти$/));
    await flush();
    assert.match(dom.visibleText(), sentence, JSON.stringify(answer));
    const active = dom.active();
    assert.ok(active && ['input', 'button'].includes(active.localName) && dom.isVisible(active), `focus on a visible control (${active?.localName})`);
    assert.equal(dom.findAll((el) => el.getAttribute('role') === 'alert').length, 0);
  }
});

test('every sign-in failure is a named state: sentence, focus on a control, no role="alert"; silent login outcomes = 0 (V2-16)', async () => {
  // The email-code rows left this table with the UI that could reach them: the capability is off, so
  // the screen offers no control that produces them. The states themselves are still frozen — the
  // copy table at the end of this test covers every one, and net.test.mjs maps each server body to it.
  const cases = [
    ['password', { state: 'rate_limited', retryAfterSec: 42 }, /Слишком много попыток — повторите через 42 с/],
    ['password', { state: 'credentials_invalid' }, /Неверный email или пароль/],
    ['password', { state: 'account_unavailable' }, /Вход для этой учётной записи сейчас недоступен/],
    ['password', { state: 'field_invalid', field: 'password' }, /Пароль — не короче 8 символов/],
    ['password', { state: 'field_invalid', field: 'email' }, /Введите email полностью/],
    ['password', { state: 'no_connection' }, /Нет связи — повторить/],
    ['password', { state: 'unexpected_response', status: 500 }, /Вход не удался — повторить/],
  ];
  let attempts = 0;
  let named = 0;
  for (const [flow, failure, sentence] of cases) {
    const dom = createDom();
    const scheduler = createScheduler(NOW);
    const s = sessionDouble();
    const fail = { step: 'failed', failure };
    s.answers.signInPassword = () => fail;
    mountSignIn({ factory: dom.factory, container: dom.root, session: s.session, scheduler });
    const password = await toPassword(dom);
    const email = dom.find((el) => el.type === 'email');
    attempts += 1;
    dom.key(password, 'Enter');
    await flush();
    const text = dom.visibleText();
    const ok = sentence.test(text);
    if (ok) named += 1;
    assert.ok(ok, `${flow} ${failure.state}: «${text}»`);
    const active = dom.active();
    assert.ok(active && ['input', 'button', 'textarea'].includes(active.localName) && dom.isVisible(active), `${flow} ${failure.state}: focus on a visible control (${active?.localName})`);
    assert.equal(dom.findAll((el) => el.getAttribute('role') === 'alert').length, 0);
    if (!(failure.state === 'field_invalid' && failure.field === 'email')) assert.equal(password.value, '', 'the password is not kept');
    assert.equal(email.value, 'anna@example.test', 'the email is kept');
    if (failure.state === 'field_invalid') assert.ok(dom.findAll((el) => el.getAttribute('aria-invalid') === 'true').length === 1);
  }
  assert.equal(attempts - named, 0, 'silent login outcomes');
  // the copy table covers every frozen SignInFailure state
  for (const state of ['rate_limited', 'code_attempts_exhausted', 'email_login_unavailable', 'code_invalid', 'code_expired', 'email_not_linked', 'credentials_invalid', 'account_unavailable', 'no_connection', 'unexpected_response'])
    assert.ok(failureSentence({ state, retryAfterSec: 1, status: 500 }).length > 0, state);
  for (const state of ['term_too_short', 'rate_limited', 'telegram_unavailable', 'business_unavailable', 'no_connection', 'unexpected_response'])
    assert.ok(firstRunSentence({ state, retryAfterSec: 1, status: 500 }).length > 0, state);
});

test('the unknown business: /auth/login 404 «Tenant not found», 401 and 403 end in the same «never says which» state (real createNet)', async () => {
  const savedFetch = globalThis.fetch;
  const bodies = [];
  const drawn = [];
  // 403 on the password path arrives for a KNOWN email before the password is checked (auth.service.ts
  // loginTenantUser → assertTenantAllowsClientAccess → bcrypt.compare): a different sentence there would
  // tell an attacker the account exists (integration finding). All four recorded bodies draw one state.
  const recordedBodies = ['auth/errors/tenant-not-found.404.json', 'auth/errors/login-invalid-credentials.401.json', 'auth/errors/tenant-not-accepting-client-access.403.json', 'auth/errors/user-not-active.403.json'];
  try {
    for (const rel of recordedBodies) {
      const recorded = apiFixture(rel);
      globalThis.fetch = async (url, init) => {
        const at = String(url);
        if (at.startsWith('/api/mobile/pwa/search'))
          return new Response(JSON.stringify({ items: [{ tenant_slug: 'no-such-business', name: 'Салон «Северный ветер»', address: 'ул. Лесная, 8' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        bodies.push([at, JSON.parse(init.body)]);
        return new Response(JSON.stringify(recorded.body), { status: recorded.status, headers: { 'Content-Type': 'application/json' } });
      };
      const dom = createDom();
      const net = createNet();
      mountSignIn({ factory: dom.factory, container: dom.root, session: net.session, scheduler: createScheduler(NOW) });
      // The finder answers from the same stubbed fetch, so the chosen handle is a real round trip.
      await chooseBusiness(dom);
      openOtherWay(dom);
      dom.type(dom.find((el) => el.type === 'email'), 'anna@example.test');
      const password = dom.find((el) => el.type === 'password');
      dom.type(password, 'mock-password-1');
      dom.key(password, 'Enter');
      await flush(30);
      const text = dom.visibleText();
      assert.match(text, /Неверный email или пароль/, rel);
      assert.ok(!/Tenant not found|не найден/i.test(text), `${rel}: the response never says which field was wrong`);
      assert.equal(dom.nameOf(dom.active()), 'Email');
      const group = dom.find((el) => el.classList.contains('signin-group--password'));
      assert.match(dom.textOf(group), /Неверный email или пароль/, 'the state stands in the group where focus is');
      assert.ok(!/учётной записи|not accepting|not active/i.test(text), `${rel}: no account wording`);
      drawn.push([dom.textOf(group), dom.nameOf(dom.active())]);
    }
    assert.equal(new Set(drawn.map((d) => JSON.stringify(d))).size, 1, 'identical sentence and focus for 404, 401 and both 403 bodies');
    assert.deepEqual(bodies.map(([url]) => url), recordedBodies.map(() => '/api/auth/login'));
    assert.deepEqual(Object.keys(bodies[0][1]).sort(), ['email', 'password', 'tenantSlug'], '/auth/login body keys are exactly {tenantSlug, email, password}');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('session-not-active 401 (a bearer after logout or revocation): one refresh, then the named signed-out state — end to end on the real net', async () => {
  const { fill, loadApiFixture } = await import('../dev/scenarios.mjs');
  const now = Date.now();
  const values = {
    now: new Date(now).toISOString(),
    expires_at: new Date(now + 300_000).toISOString(),
    refresh_expires_at: new Date(now + 30 * 86_400_000).toISOString(),
    approval_expires_at: new Date(now + 900_000).toISOString(),
    expires_in: 900,
    access_token: 'mock-at-0001',
    refresh_token: `maya_rt_${'a'.repeat(72)}`,
    session_id: 'session-0001',
    user_id: 'user-0001',
    tenant_id: 'tenant-0001',
    tenant_name: 'Салон «Северный ветер»',
    tenant_slug: 'severny-veter',
    user_name: 'Анна Смирнова',
    email: 'anna@example.test',
  };
  const respond = (rel) => {
    const f = loadApiFixture(rel);
    return new Response(JSON.stringify(fill(f.body, values)), { status: f.status, headers: { 'Content-Type': 'application/json' } });
  };
  const calls = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const at = new URL(url, 'http://127.0.0.1').pathname;
    if (at === '/api/mobile/pwa/search')
      return new Response(JSON.stringify({ items: [{ tenant_slug: 'severny-veter', name: 'Салон «Северный ветер»', address: 'ул. Лесная, 8' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    calls.push(at);
    if (at === '/api/auth/login') return respond('auth/login.201.json');
    if (at === '/api/ai/chat') return respond('auth/errors/session-not-active.401.json');
    if (at === '/api/auth/refresh') return respond('auth/errors/session-revoked.401.json');
    return new Response('{}', { status: 404 });
  };
  try {
    const dom = createDom();
    const scheduler = createScheduler(now);
    const net = createNet();
    const runtime = createShellRuntime({
      transport: net.transport,
      session: net.session,
      render,
      environment: { a11y: () => A11Y, onA11yChange: () => () => undefined, fragment: () => '' },
      scheduler,
      history: { push: () => undefined, back: () => undefined, onBack: () => () => undefined },
      newAbort: () => new AbortController(),
    });
    mountApp({ dom: { root: dom.root, factory: dom.factory }, session: net.session, conversation: runtime.conversation, widgets: runtime.widgetPort, voice: null, scheduler });
    await chooseBusiness(dom);
    openOtherWay(dom);
    dom.type(dom.find((el) => el.type === 'email'), 'anna@example.test');
    const password = dom.find((el) => el.type === 'password');
    dom.type(password, 'mock-password-1');
    dom.key(password, 'Enter');
    await flush(30);
    scheduler.flush();
    const composer = dom.find((el) => el.localName === 'textarea');
    assert.ok(composer, 'signed in');
    assert.match(dom.visibleText(), /Анна Смирнова · Салон «Северный ветер»/);
    dom.type(composer, 'Проверка сессии');
    dom.key(composer, 'Enter');
    await flush(40);
    scheduler.flush();
    assert.deepEqual(calls, ['/api/auth/login', '/api/ai/chat', '/api/auth/refresh']);
    assert.match(dom.visibleText(), /Вход в MAYA/);
    assert.match(dom.visibleText(), /Сессия завершена — войдите снова\./);
    assert.equal(dom.find((el) => el.localName === 'textarea'), null);
    assert.equal(dom.textOf(dom.active()), 'Вход в MAYA');
    assert.ok(!dom.serialize().includes('mock-at-0001') && !dom.serialize().includes('maya_rt_'), 'no token in the DOM');
  } finally {
    globalThis.fetch = savedFetch;
  }
});

test('rate limit: the countdown decreases, the submitting control is held until it ends, attempts meanwhile send nothing', async () => {
  const dom = createDom();
  const scheduler = createScheduler(NOW);
  const s = sessionDouble();
  s.answers.signInPassword = () => ({ step: 'failed', failure: { state: 'rate_limited', retryAfterSec: 3 } });
  mountSignIn({ factory: dom.factory, container: dom.root, session: s.session, scheduler });
  const password = await toPassword(dom);
  dom.key(password, 'Enter');
  await flush();
  const seconds = () => Number(/через (\d+) с/.exec(dom.visibleText())?.[1] ?? NaN);
  const submit = dom.button(/^Войти по паролю$/);
  assert.equal(seconds(), 3);
  assert.equal(submit.getAttribute('aria-disabled'), 'true');
  const group = dom.find((el) => el.classList.contains('signin-group--password'));
  const status = dom.find((el) => el.getAttribute('aria-live') === 'polite' && el.classList.contains('signin-status'), group);
  assert.equal(dom.textOf(status), 'Слишком много попыток — повторите через 3 с', 'announced once, in the password group where focus is');
  assert.ok(password.getAttribute('aria-describedby').split(' ').includes(status.getAttribute('id')), 'the field in focus is described by its path state');
  scheduler.advance(1000);
  assert.equal(seconds(), 2);
  assert.equal(dom.textOf(status), '', 'ticks are not re-announced in the live region');
  dom.type(password, 'mock-password-1');
  dom.key(password, 'Enter');
  dom.click(submit);
  await flush();
  assert.equal(s.calls.filter((c) => c[0] === 'signInPassword').length, 1, 'held: 0 more requests');
  scheduler.advance(2000);
  assert.ok(Number.isNaN(seconds()));
  assert.match(dom.visibleText(), /Можно попробовать снова/);
  assert.equal(submit.getAttribute('aria-disabled'), null);
});

test('the first run through the app: the root screen finds a business by name and address, then hands off — the handle is never shown', async () => {
  const p = page({ signedIn: false });
  p.answers.findBusinesses = (term) => ({
    step: 'matches',
    businesses: [
      { name: 'Салон «Северный ветер»', slug: 'severny-veter', address: 'ул. Лесная, 8' },
      { name: 'Салон «Северный ветер»', slug: 'severny-veter-2', address: 'пр. Морской, 2', term },
    ],
  });
  p.dom.type(termField(p.dom), 'север');
  p.dom.click(p.dom.button(/^Найти$/));
  await flush();
  // Two businesses of the SAME name: the street address is the only thing that tells them apart,
  // which is why the finder projects it and the row shows it.
  const rows = p.dom.findAll((el) => el.localName === 'button' && el.classList.contains('signin-match')).map((b) => p.dom.textOf(b));
  assert.deepEqual(rows, ['Салон «Северный ветер»ул. Лесная, 8', 'Салон «Северный ветер»пр. Морской, 2']);
  p.dom.click(p.dom.findAll((el) => el.localName === 'button' && el.classList.contains('signin-match')).at(1));
  await flush();
  p.dom.click(p.dom.find((el) => el.localName === 'button' && el.classList.contains('signin-button--telegram')));
  await flush();
  assert.deepEqual(p.calls.at(-1), ['startTelegram', 'severny-veter-2'], 'the SECOND row\'s handle, as chosen');
  assert.ok(!/severny-veter/.test(p.dom.visibleText()), 'the handle is carried, never shown');
  assert.equal(p.chats.length, 0, 'the first run sends no chat turn');
});

test('after sign-in the root is the signed-in app: identity, a focused composer, and the sign-in state gone', async () => {
  const p = page({ signedIn: false });
  p.answers.signInPassword = (slug, email) => {
    assert.equal(slug, 'severny-veter', 'the handle came from the finder');
    assert.equal(email, 'anna@example.test');
    p.signIn({ userName: 'Анна Смирнова', tenantName: 'Салон «Северный ветер»' });
    return { step: 'signed_in', display: { userName: 'Анна Смирнова', tenantName: 'Салон «Северный ветер»' } };
  };
  const password = await toPassword(p.dom);
  p.dom.key(password, 'Enter');
  await flush();
  p.scheduler.flush();
  assert.equal(p.dom.active(), p.composer(), 'cold start: the composer is focused');
  const text = p.dom.visibleText();
  assert.match(text, /Анна Смирнова · Салон «Северный ветер»/);
  assert.ok(!ROLE_WORDS.test(text));
  assert.equal(p.dom.find((el) => el.classList.contains('signin')), null, 'the sign-in state is gone');
  assert.equal(identityText({ userName: '', tenantName: null }), 'Вход выполнен');
});

test('the landing is visible: it says it is finishing, and every way it can fail is a sentence on a control', async () => {
  const dom = createDom();
  const s = sessionDouble();
  mountSignIn({ factory: dom.factory, container: dom.root, session: s.session, scheduler: createScheduler(NOW) });
  await chooseBusiness(dom);

  // Back from Telegram, the request in flight. The person must not be looking at a screen that
  // pretends nothing is happening — they left, they came back, and something is being decided.
  s.setLanding({ state: 'running' });
  assert.match(dom.visibleText(), /\u0417\u0430\u0432\u0435\u0440\u0448\u0430\u0435\u043c \u0432\u0445\u043e\u0434/);
  assert.equal(dom.button(/^\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0441 Telegram$/).getAttribute('aria-disabled'), 'true', 'held while it runs');

  for (const [failure, sentence] of [
    [{ state: 'callback_unsolicited' }, /\u042d\u0442\u043e\u0442 \u0432\u0445\u043e\u0434 \u043d\u0430\u0447\u0430\u043b\u0438 \u043d\u0435 \u0437\u0434\u0435\u0441\u044c/],
    [{ state: 'login_expired' }, /\u0412\u0445\u043e\u0434 \u0443\u0441\u0442\u0430\u0440\u0435\u043b/],
    [{ state: 'telegram_declined' }, /\u0412\u0445\u043e\u0434 \u0447\u0435\u0440\u0435\u0437 Telegram \u043e\u0442\u043c\u0435\u043d\u0451\u043d/],
    [{ state: 'phone_required' }, /\u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 Telegram \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u044c \u043d\u043e\u043c\u0435\u0440/],
    [{ state: 'registration_closed' }, /\u043d\u0435 \u043f\u0440\u0438\u043d\u0438\u043c\u0430\u0435\u0442 \u043d\u043e\u0432\u044b\u0445 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439/],
    [{ state: 'account_unavailable' }, /\u0412\u0445\u043e\u0434 \u0434\u043b\u044f \u044d\u0442\u043e\u0439 \u0443\u0447\u0451\u0442\u043d\u043e\u0439 \u0437\u0430\u043f\u0438\u0441\u0438/],
  ]) {
    s.setLanding({ state: 'failed', failure });
    const text = dom.visibleText();
    assert.match(text, sentence, JSON.stringify(failure));
    const active = dom.active();
    assert.ok(active && ['input', 'button'].includes(active.localName) && dom.isVisible(active), `${failure.state}: focus on a visible control`);
    assert.equal(dom.findAll((el) => el.getAttribute('role') === 'alert').length, 0, 'never role=alert');
    // The login has to start again, and the control that starts it is where focus went.
    assert.equal(dom.button(/^\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0441 Telegram$/).getAttribute('aria-disabled'), null, 'released');
  }
  assert.ok(!/state|code|te_|oauth/i.test(dom.visibleText()), 'no callback value is ever drawn');
});

test('a session that ends shows the signed-out state with its reason and focus on its heading; nothing typed survives', async () => {
  const p = page();
  p.dom.type(p.composer(), 'черновик');
  p.set({ signedIn: false, reason: 'refresh_token_reused' });
  p.scheduler.flush();
  assert.match(p.dom.visibleText(), /Сессия завершена ради безопасности — войдите снова\./);
  assert.equal(p.dom.textOf(p.dom.active()), 'Вход в MAYA');
  assert.equal(p.composer(), null);
  assert.ok(!p.dom.serialize().includes('черновик'));
  p.signIn();
  p.scheduler.flush();
  assert.equal(p.composer().value, '', 'a new sign-in starts empty (A6, D7 B)');
  for (const reason of ['signed_out', 'session_expired', 'refresh_token_invalid', 'session_revoked']) assert.ok(signedOutSentence(reason));
  assert.equal(signedOutSentence(null), null);
});

// ── the conversation ─────────────────────────────────────────────────────────────────────────────

test('typed turn: bubble before the reply, one role=status while pending, polite log, focus stays in the composer, text cleared once sent', async () => {
  let resolve;
  const p = page({ chat: (request) => new Promise((r) => (resolve = () => r({ ok: true, value: { request_id: request.requestId, reply: 'Тестовый ответ', action_status: null, resolution: null } }))) });
  const composer = p.composer();
  composer.focus();
  p.dom.type(composer, 'Какие окна свободны?');
  p.dom.key(composer, 'Enter');
  p.dom.key(composer, 'Enter');
  await flush();
  assert.equal(p.chats.length, 1, 'double Enter: one request');
  assert.match(p.dom.textOf(p.log()), /Какие окна свободны\?/);
  assert.equal(p.log().getAttribute('aria-live'), 'polite');
  const statuses = p.dom.findAll((el) => el.getAttribute('role') === 'status');
  assert.equal(statuses.length, 1);
  assert.equal(p.dom.textOf(statuses[0]), 'MAYA думает…');
  assert.equal(p.dom.button(/^Отправить$/).getAttribute('aria-disabled'), 'true', 'disabled, not hidden');
  assert.equal(composer.value, 'Какие окна свободны?', 'kept until sent');
  resolve();
  await flush();
  p.scheduler.flush();
  assert.match(p.dom.textOf(p.log()), /Тестовый ответ/);
  assert.equal(p.dom.active(), composer);
  assert.equal(composer.value, '');
  assert.equal(p.dom.textOf(statuses[0]), '');
  assert.deepEqual(Object.keys(p.chats[0]).sort(), ['messages', 'requestId', 'surface']);
  p.dom.type(composer, 'строка');
  const shifted = p.dom.key(composer, 'Enter', { shift: true });
  assert.equal(shifted.defaultPrevented, false);
  p.dom.key(composer, 'Enter', { composing: true });
  await flush();
  assert.equal(p.chats.length, 1, 'Shift+Enter and an IME composition send nothing');
});

test('approval_required (SH-06): the reply, then the exact notice — no control, link or route, not role="alert", never history', async () => {
  const p = page();
  p.outcomes.push({ ok: true, value: { request_id: 'x', reply: 'Действие подготовлено и ждёт вашего подтверждения.', action_status: 'approval_required', resolution: null } });
  p.chats.length = 0;
  const chat = p.runtime.conversation;
  await p.send('Запиши меня на стрижку');
  const noticeText = p.dom.find((el) => el.localName === 'p' && p.dom.textOf(el) === APPROVAL_NOT_HERE);
  assert.ok(noticeText, 'drawn with the SH-06 copy, exactly');
  assert.equal(APPROVAL_NOT_HERE, 'Действие ждёт подтверждения; подтвердить его здесь пока нельзя.');
  const item = noticeText.parentElement;
  assert.equal(p.dom.findAll((el) => ['button', 'a', 'input', 'textarea'].includes(el.localName), item).length, 0);
  for (let n = noticeText; n; n = n.parentElement) assert.notEqual(n.getAttribute('role'), 'alert');
  const all = p.dom.textOf(p.log());
  assert.ok(all.indexOf('Действие подготовлено') < all.indexOf(APPROVAL_NOT_HERE), 'after the reply');
  assert.ok(!p.dom.findAll((el) => el.localName === 'button').some((b) => /подтверд|отклон/i.test(p.dom.nameOf(b))));
  await p.send('Спасибо');
  const history = JSON.stringify(p.chats.at(-1).messages);
  assert.ok(history.includes('Действие подготовлено') && !history.includes('подтвердить его здесь'));
  assert.equal(chat.view().items.filter((i) => i.kind === 'notice').length, 1);
});

test('failures: 502 retry on the same id; 429 counts down, then retry; 409 has no retry and keeps the text; 402 disables the composer with a reason', async () => {
  const p = page();
  p.outcomes.push({ ok: false, failure: { reason: 'no_connection' } });
  await p.send('Сообщение при обрыве');
  assert.match(p.dom.visibleText(), /Нет связи — повторить/);
  assert.ok(!/Ответ/.test(p.dom.textOf(p.log())), 'no bot bubble');
  const retry = p.dom.button(/повторить/i);
  assert.ok(retry);
  p.dom.click(retry);
  await flush();
  p.scheduler.flush();
  assert.equal(p.chats.length, 2);
  assert.equal(p.chats[1].requestId, p.chats[0].requestId);
  assert.equal(p.dom.active(), p.composer(), 'the retry control left: focus continues in the composer');

  p.outcomes.push({ ok: false, failure: { reason: 'rate_limited', retryAfterSec: 3 } });
  await p.send('Много запросов');
  assert.match(p.dom.visibleText(), /Слишком много запросов — повторить можно через 3 с/);
  assert.equal(p.dom.button(/повторить/i), null);
  p.scheduler.advance(1000);
  assert.match(p.dom.visibleText(), /через 2 с/);
  p.scheduler.advance(2000);
  assert.ok(p.dom.button(/повторить/i), 'a retry control after the countdown');

  p.outcomes.push({ ok: false, failure: { reason: 'conflict' } });
  await p.send('Конфликт');
  assert.equal(p.dom.button(/повторить/i), null, 'no same-id retry after a 409 (the earlier 429 turn is superseded too)');
  assert.equal(p.composer().value, 'Конфликт');
  assert.match(p.dom.visibleText(), /отправьте его ещё раз, это будет новый запрос/);

  p.outcomes.push({ ok: false, failure: { reason: 'subscription_required' } });
  await p.send('Подписка');
  assert.equal(p.composer().getAttribute('aria-disabled'), 'true');
  assert.equal(p.composer().readOnly, true);
  assert.match(p.dom.visibleText(), /Отправка недоступна/);
  assert.equal(p.dom.findAll((el) => el.getAttribute('role') === 'alert').length, 0);
  assert.equal(p.dom.findAll((el) => el.localName === 'a').length, 0, 'no paywall link');
});

// The copy each notice kind must draw — written out, not read back from noticeSentence(), so a blanked or
// swapped sentence fails here (integration finding: no test asserted the 403 feature_locked or the
// deep-link sentences, and a silent notice passed every suite).
const NOTICE_COPY = {
  approval_not_here: 'Действие ждёт подтверждения; подтвердить его здесь пока нельзя.',
  subscription_required: 'Разговор с MAYA недоступен для этого бизнеса: нужна активная подписка.',
  feature_locked: 'MAYA сейчас недоступна для этого бизнеса.',
  tenant_required: 'Для разговора с MAYA нужен вход в бизнес',
  outdated_client: 'Версия MAYA устарела — обновите страницу',
  display_capped: 'Ранние сообщения скрыты: на экране остаются последние 200.',
  deeplink_refused: 'Эту ссылку нельзя открыть здесь.',
  deeplink_unavailable: 'Карточку по этой ссылке пока нельзя показать.',
};
const noticeElement = (p, kind) => p.dom.find((el) => el.classList.contains(`notice--${kind.replaceAll('_', '-')}`));

test('every notice kind draws its own sentence, exactly, with no control but tenant_required’s «Выйти» and never role="alert"', async () => {
  const p = page();
  for (const kind of Object.keys(NOTICE_COPY)) p.runtime.conversation.timeline.appendNotice(kind);
  await flush();
  p.scheduler.flush();
  for (const [kind, copy] of Object.entries(NOTICE_COPY)) {
    const el = noticeElement(p, kind);
    assert.ok(el, `${kind}: drawn`);
    const sentence = p.dom.find((x) => x.classList.contains('notice-text'), el);
    assert.equal(sentence && p.dom.textOf(sentence), copy, `${kind}: the sentence`);
    assert.ok(p.dom.isVisible(sentence), `${kind}: visible`);
    const controls = p.dom.findAll((x) => ['button', 'a', 'input', 'textarea'].includes(x.localName), el).map((x) => p.dom.nameOf(x));
    assert.deepEqual(controls, kind === 'tenant_required' ? ['Выйти'] : [], `${kind}: controls`);
    for (let n = el; n; n = n.parentElement) assert.notEqual(n.getAttribute('role'), 'alert');
  }
});

test('the real paths end in their notices: 403 feature_locked, 402 and 400 on a turn; #r=fs.* refused and #r=w unavailable at load, with 0 requests', async () => {
  for (const [reason, kind] of [['feature_locked', 'feature_locked'], ['subscription_required', 'subscription_required'], ['outdated_client', 'outdated_client']]) {
    const p = page();
    p.outcomes.push({ ok: false, failure: { reason } });
    await p.send(`Проверка ${reason}`);
    const el = noticeElement(p, kind);
    assert.ok(el, `${reason}: a ${kind} notice`);
    assert.equal(p.dom.textOf(p.dom.find((x) => x.classList.contains('notice-text'), el)), NOTICE_COPY[kind], reason);
    assert.match(p.dom.visibleText(), new RegExp(NOTICE_COPY[kind].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${reason}: visible`);
    assert.ok(p.dom.textOf(p.log()).includes(`Проверка ${reason}`), `${reason}: the turn stays with its text`);
    assert.equal(p.dom.findAll((x) => x.getAttribute('role') === 'alert').length, 0);
  }
  for (const [fragment, kind] of [['#r=fs.booking&h=abcdefgh', 'deeplink_refused'], ['#r=w&h=abcdefgh12', 'deeplink_unavailable'], ['#r=detail', 'deeplink_refused'], ['#r=shell.pay&h=abcdefgh', 'deeplink_refused']]) {
    const p = page({ fragment });
    p.chats.length = 0;
    const landing = p.runtime.landFragment();
    await flush();
    p.scheduler.flush();
    const el = noticeElement(p, kind);
    assert.ok(el, `${fragment}: a ${kind} notice (${JSON.stringify(landing)})`);
    assert.equal(p.dom.textOf(p.dom.find((x) => x.classList.contains('notice-text'), el)), NOTICE_COPY[kind], fragment);
    assert.equal(p.chats.length, 0, `${fragment}: 0 requests`);
    assert.equal(p.dom.findAll((x) => x.localName === 'dialog' && x.open).length, 0, `${fragment}: no dialog`);
  }
});

test('tenant_required (§1.4 row 11): the named signed-in state with «Выйти», composer disabled with the reason', async () => {
  const p = page();
  p.outcomes.push({ ok: false, failure: { reason: 'tenant_required' } });
  await p.send('Здравствуйте');
  assert.match(p.dom.visibleText(), /Для разговора с MAYA нужен вход в бизнес/);
  assert.equal(p.composer().getAttribute('aria-disabled'), 'true');
  p.dom.click(p.dom.button(/^Выйти$/));
  await flush();
  assert.deepEqual(p.calls.at(-1), ['signOut']);
});

test('reply links: only https:, tel: and mailto: become anchors with rel="noopener noreferrer"; javascript: and data: stay text', async () => {
  const p = page();
  const reply = apiFixture('ai/chat.201.reply-links.json').body.reply;
  p.outcomes.push({ ok: true, value: { request_id: 'x', reply, action_status: null, resolution: null } });
  await p.send('Ссылки');
  const anchors = p.dom.findAll((el) => el.localName === 'a', p.log());
  assert.deepEqual(anchors.map((a) => a.getAttribute('href')), ['https://example.test/booking', 'tel:+70000000000', 'mailto:hello@example.test']);
  for (const a of anchors) assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  assert.deepEqual(p.dom.record.hrefWrites.map((w) => w.value), anchors.map((a) => a.getAttribute('href')), 'every href write is one of these');
  assert.match(p.dom.textOf(p.log()), /javascript:alert\(1\)/);
  assert.match(p.dom.textOf(p.log()), /data:text\/html,<b>x<\/b>/);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'HTTPS://example.test', 'https://exa mple.test', 'https://example.test/"onmouseover=x', 'http://example.test', 'mailto:a@b.test?body=x', 'tel:abc', '//example.test', 'https:example.test'])
    assert.equal(isReplyHref(bad), false, bad);
  assert.equal(renderReplyLink(createDom().factory, 'javascript:alert(1)'), null);
  assert.deepEqual(replySegments('см.https://x.test'), [{ link: false, text: 'см.https://x.test' }], 'a scheme glued to a word is not a link');
  assert.deepEqual(replySegments('(https://x.test/a).').map((s) => s.link), [false, true, false]);
});

// ── navigation and route chrome ──────────────────────────────────────────────────────────────────

test('nav: exactly five buttons with the registry labels and aria-current; Tab order composer → Отправить → mic → nav', () => {
  const p = page();
  const nav = p.dom.find((el) => el.localName === 'nav');
  assert.equal(nav.getAttribute('aria-label'), 'Основная навигация');
  const buttons = p.dom.findAll((el) => el.localName === 'button', nav);
  assert.deepEqual(buttons.map((b) => p.dom.nameOf(b)), BASE_ROUTES.map((k) => ROUTES[k].label));
  assert.deepEqual(buttons.map((b) => b.getAttribute('aria-current')), ['page', null, null, null, null]);
  const order = p.dom.tabOrder().map((el) => p.dom.nameOf(el));
  const at = order.indexOf('Сообщение для MAYA');
  assert.deepEqual(order.slice(at, at + 8), ['Сообщение для MAYA', 'Отправить', 'Сказать голосом', ...BASE_ROUTES.map((k) => ROUTES[k].label)]);
  assert.equal(p.dom.findAll((el) => ['textarea', 'button'].includes(el.localName)).at(0), p.composer(), 'the composer is the first textarea or button (V11/A-20)');
  const text = p.dom.visibleText();
  assert.ok(!ROLE_WORDS.test(text));
});

test('routes: a base route draws its chrome with the escape back; account hosts «Выйти»; back returns focus to the composer', async () => {
  const p = page();
  p.dom.click(p.dom.button(/^Аккаунт$/));
  p.scheduler.flush();
  assert.equal(p.runtime.widgetPort.view().primary, 'shell.account');
  assert.equal(p.dom.isVisible(p.composer()), false);
  assert.equal(p.dom.textOf(p.dom.active()), 'Аккаунт', 'focus on the route heading');
  assert.match(p.dom.visibleText(), /Этот раздел пока недоступен здесь/);
  assert.ok(p.dom.button(/^Выйти$/));
  assert.equal(p.dom.findAll((el) => el.localName === 'nav').length, 1);
  assert.equal(p.dom.find((el) => el.localName === 'button' && p.dom.nameOf(el) === 'Аккаунт').getAttribute('aria-current'), 'page');
  p.dom.click(p.dom.button(/^Вернуться к разговору$/));
  p.scheduler.flush();
  assert.equal(p.runtime.widgetPort.view().primary, 'shell.root');
  assert.equal(p.dom.active(), p.composer());
  p.dom.click(p.dom.button(/^Приватность и данные$/));
  p.scheduler.flush();
  assert.equal(p.dom.button(/^Выйти$/), null, 'only the account route hosts «Выйти»');
  p.dom.click(p.dom.button(/^Аккаунт$/));
  p.scheduler.flush();
  p.dom.click(p.dom.button(/^Выйти$/));
  await flush();
  assert.match(p.dom.visibleText(), /Вы вышли из MAYA\./);
});

// ── widget items: order, names, token-free DOM, focus, live regions (D1, D7) ─────────────────────

test('every fixture drawn through the shell: DOM interactive order == reading order, names byte-equal, 0 secret bytes, closed tags, no role="alert"', () => {
  for (const f of INDEX.fixtures) {
    const p = page({ voice: false });
    const outcome = p.runtime.widgets.ingest(envelopeOf(f.id));
    assert.notEqual(outcome.ingested, 'duplicate', f.id);
    p.scheduler.flush();
    const item = p.runtime.conversation.view().items.find((i) => i.kind === 'widget');
    const article = p.dom.find((el) => el.localName === 'article' && el.classList.contains('widget'), p.log());
    assert.ok(article, f.id);
    const drawn = p.dom.findAll((el) => el.hasAttribute('data-ref'), article);
    const expected = item.display === 'collapsed' ? [] : item.result.readingOrder;
    assert.deepEqual(drawn.map((el) => el.getAttribute('data-ref')), [...expected], `${f.id}: DOM order`);
    for (const el of drawn) {
      const ref = el.getAttribute('data-ref');
      const sealed = item.result.accessibleNames[ref];
      if (sealed !== undefined && sealed !== '') assert.ok(el.getAttribute('aria-label') === sealed || p.dom.textOf(el) === sealed, `${f.id} ${ref}: name byte-equal`);
      assert.ok(p.dom.tabOrder(article).includes(el), `${f.id} ${ref}: keyboard-reachable`);
    }
    const serialized = p.dom.serialize();
    for (const secret of secretsOf(f)) assert.ok(!serialized.includes(secret), `${f.id}: secret byte in the DOM`);
    assert.equal(p.dom.findAll((el) => el.getAttribute('role') === 'alert').length, 0, f.id);
    assert.ok(serialized.includes(item.result.textEquivalent.headline), `${f.id}: headline drawn`);
    for (const tag of p.dom.record.creates) assert.ok(!['img', 'iframe', 'form', 'script', 'link'].includes(tag));
    assert.equal(p.dom.record.hrefWrites.length, 0, `${f.id}: a widget writes no href`);
    // a text tier item draws the text equivalent (A-21 shell half)
    if (item.result.mode !== 'structured') assert.ok(p.dom.textOf(article).includes(item.result.textEquivalent.headline));
  }
});

test('per-kind focus (D7): heading for BOOKING_CONFIRMATION, CONSENT_STATE, PAYMENT_HANDOFF; first refused field for FORM; none for the others', () => {
  const expectations = {
    'kind-booking-confirmation': 'heading',
    'kind-consent-state': 'heading',
    'kind-payment-handoff': 'heading',
    'kind-form': 'field',
    'kind-choice': 'none',
    'kind-client-list': 'none',
    'kind-limitation-blocking': 'none',
  };
  for (const [id, want] of Object.entries(expectations)) {
    const p = page({ voice: false });
    p.composer().focus();
    p.runtime.widgets.ingest(envelopeOf(id));
    p.scheduler.flush();
    const active = p.dom.active();
    const article = p.dom.find((el) => el.localName === 'article', p.log());
    if (want === 'heading') {
      assert.ok(/^h[234]$/.test(active.localName) && article.contains(active), `${id}: heading focused`);
      assert.equal(active.getAttribute('tabindex'), '-1');
    } else if (want === 'field') {
      assert.equal(active.getAttribute('aria-invalid'), 'true', `${id}: the first refused field`);
      assert.ok(article.contains(active));
    } else assert.equal(active, p.composer(), `${id}: focus stays in the composer`);
  }
});

test('in-place successor keeps position and takes heading focus when its row says so; a local NONE dismiss focuses the collapsed headline', () => {
  const dom = createDom();
  const scheduler = createScheduler(NOW);
  const activations = [];
  const drawer = createWidgetDrawer({ factory: dom.factory, scheduler, widgets: { activate: (id, ref) => activations.push([id, ref]) } });
  const p = page({ voice: false });
  p.runtime.widgets.ingest(envelopeOf('kind-choice'));
  const choice = p.runtime.conversation.view().items.find((i) => i.kind === 'widget');
  const booking = page({ voice: false });
  booking.runtime.widgets.ingest(envelopeOf('kind-booking-confirmation'));
  const bookingItem = booking.runtime.conversation.view().items.find((i) => i.kind === 'widget');

  const first = drawer.element({ ...choice, id: 'w9' });
  dom.root.append(first);
  scheduler.flush();
  const successor = drawer.element({ ...bookingItem, id: 'w9' });
  assert.equal(successor, first, 'replaced in place: the same element');
  scheduler.flush();
  assert.ok(/^h[234]$/.test(dom.active().localName) && first.contains(dom.active()));

  // NONE escape: the control is activated, then the item collapses — focus to its headline.
  const escape = dom.findAll((el) => el.hasAttribute('data-ref'), first).find((el) => bookingItem.result.nodes.some((n) => n.t === 'action' && n.effect === 'NONE' && n.ref === el.getAttribute('data-ref')));
  assert.ok(escape);
  // As Safari does: a click activates a button without focusing it, so only the dismiss rule moves focus.
  dom.active()?.blur();
  escape.dispatch({ type: 'click' });
  assert.equal(dom.active(), null);
  assert.equal(activations.length, 1);
  drawer.element({ ...bookingItem, id: 'w9', display: 'collapsed' });
  scheduler.flush();
  assert.ok(/^h[234]$/.test(dom.active().localName), 'collapsed headline focused');
  assert.equal(dom.findAll((el) => el.hasAttribute('data-ref'), first).length, 0, 'collapsed: no control');
});

test('the NONE escape through the real shell: 0 requests, the item collapses, focus on its headline', () => {
  const p = page({ voice: false });
  p.runtime.widgets.ingest(envelopeOf('kind-booking-confirmation'));
  p.scheduler.flush();
  const item = p.runtime.conversation.view().items.find((i) => i.kind === 'widget');
  const noneRef = item.result.nodes.flatMap(function flat(n) { return n.t === 'block' ? n.children.flatMap(flat) : [n]; }).find((n) => n.t === 'action' && n.effect === 'NONE').ref;
  const control = p.dom.find((el) => el.getAttribute('data-ref') === noneRef, p.log());
  p.dom.click(control);
  p.scheduler.flush();
  assert.equal(p.chats.length, 0);
  assert.equal(p.runtime.conversation.view().items.find((i) => i.kind === 'widget').display, 'collapsed');
  const article = p.dom.find((el) => el.localName === 'article', p.log());
  assert.ok(article.contains(p.dom.active()) && /^h[234]$/.test(p.dom.active().localName));
});

test('live regions (D7): LIMITATION blocking assertive, non-blocking polite; PROGRESS announces at most once per 5 s; never role="alert"', () => {
  for (const [id, want] of [['kind-limitation-blocking', 'assertive'], ['limitation-non-blocking', 'polite'], ['kind-progress', 'polite'], ['kind-metric', null]]) {
    const p = page({ voice: false });
    p.runtime.widgets.ingest(envelopeOf(id));
    p.scheduler.flush();
    const article = p.dom.find((el) => el.localName === 'article', p.log());
    const live = p.dom.findAll((el) => el.hasAttribute('aria-live'), article);
    if (want === null) assert.equal(live.length, 0, id);
    else {
      assert.deepEqual(live.map((el) => el.getAttribute('aria-live')), [want], id);
      assert.equal(p.dom.textOf(live[0]), p.runtime.conversation.view().items.at(-1).result.textEquivalent.headline, `${id}: announced after drawing`);
    }
    assert.equal(p.dom.findAll((el) => el.getAttribute('role') === 'alert').length, 0);
  }

  const dom = createDom();
  const scheduler = createScheduler(NOW);
  const drawer = createWidgetDrawer({ factory: dom.factory, scheduler, widgets: { activate: () => undefined } });
  const p = page({ voice: false });
  p.runtime.widgets.ingest(envelopeOf('kind-progress'));
  const base = p.runtime.conversation.view().items.find((i) => i.kind === 'widget');
  assert.equal(base.result.announceIntervalMs, 5000);
  const step = (n) => ({ ...base, result: { ...base.result, textEquivalent: { ...base.result.textEquivalent, headline: `Шаг ${n}` } } });
  const el = drawer.element(step(1));
  dom.root.append(el);
  const spoken = [];
  const liveText = () => dom.textOf(dom.find((x) => x.hasAttribute('aria-live'), el));
  const sample = () => {
    const t = liveText();
    if (spoken.at(-1)?.text !== t && t !== '') spoken.push({ at: scheduler.now() - NOW, text: t });
  };
  scheduler.flush();
  sample();
  for (let n = 2; n <= 4; n += 1) {
    scheduler.advance(1000);
    drawer.element(step(n));
    scheduler.flush();
    sample();
  }
  for (let i = 0; i < 12; i += 1) {
    scheduler.advance(500);
    sample();
  }
  assert.deepEqual(spoken.map((s) => s.text), ['Шаг 1', 'Шаг 4']);
  for (let i = 1; i < spoken.length; i += 1) assert.ok(spoken[i].at - spoken[i - 1].at >= 5000, JSON.stringify(spoken));
});

test('A-17: CLIENT_LIST table — caption, column headers, row headers, in-row buttons, no row click handler', () => {
  const p = page({ voice: false });
  p.runtime.widgets.ingest(envelopeOf('kind-client-list'));
  p.scheduler.flush();
  const table = p.dom.find((el) => el.localName === 'table', p.log());
  assert.ok(table);
  assert.ok(p.dom.find((el) => el.localName === 'caption', table));
  const colHeads = p.dom.findAll((el) => el.localName === 'th' && el.getAttribute('scope') === 'col', table);
  assert.ok(colHeads.length >= 2);
  const rows = p.dom.findAll((el) => el.localName === 'tr' && el.parentElement.localName === 'tbody', table);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    if (p.dom.find((el) => el.getAttribute('scope') === 'rowgroup', row)) continue;
    assert.equal(p.dom.findAll((el) => el.localName === 'th' && el.getAttribute('scope') === 'row', row).length, 1);
    assert.equal(row.listeners.size, 0, 'no handler on the row element');
  }
  assert.ok(p.dom.find((el) => el.classList.contains('widget-table-scroll')), 'horizontal scroll inside the table container (A-10)');
});

test('drawResult never composes a name: every aria-label is a sealed accessible name or the result label', () => {
  const dom = createDom();
  for (const f of INDEX.fixtures) {
    const p = page({ voice: false });
    p.runtime.widgets.ingest(envelopeOf(f.id));
    const item = p.runtime.conversation.view().items.find((i) => i.kind === 'widget');
    const drawn = drawResult(dom.factory, item.result, { onActivate: () => undefined, pending: null, collapsed: false });
    const allowed = new Set([...Object.values(item.result.accessibleNames), item.result.label, ...item.result.nodes.filter((n) => n.t === 'block').map((n) => n.label)]);
    const walk = (el) => [el, ...el.childNodes.filter((n) => n.nodeType === 1).flatMap(walk)];
    for (const el of walk(drawn.element)) {
      const label = el.getAttribute('aria-label');
      if (label !== null) assert.ok(allowed.has(label) || JSON.stringify(item.result.nodes).includes(JSON.stringify(label)), `${f.id}: ${label}`);
    }
  }
});

// ── the fullscreen host ──────────────────────────────────────────────────────────────────────────

test('fullscreen: PROGRESS opens one modal dialog with focus inside; Tab cycles inside; Esc asks the shell to close; focus returns to the opener', () => {
  const dom = createDom();
  const scheduler = createScheduler(NOW);
  const listeners = new Set();
  let view = { primary: 'shell.root', fullscreen: null };
  const closes = [];
  const widgets = {
    view: () => view,
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    activate: () => undefined,
    closeDetail: () => {
      closes.push(1);
      set({ primary: 'shell.root', fullscreen: null });
    },
  };
  const set = (next) => {
    view = next;
    for (const l of [...listeners]) l(next);
  };
  const opener = dom.factory.create('button');
  opener.textContent = 'Открыть запись';
  dom.root.append(opener);
  const p = page({ voice: false });
  p.runtime.widgets.ingest(envelopeOf('kind-booking-confirmation'));
  const result = p.runtime.conversation.view().items.find((i) => i.kind === 'widget').result;
  mountFullscreen({
    factory: dom.factory,
    container: dom.root,
    widgets,
    scheduler,
    draw: (r, onActivate) => drawResult(dom.factory, r, { onActivate, pending: null, collapsed: false }),
    refind: () => null,
    focusFallback: () => undefined,
  });
  assert.equal(dom.modal(), null);
  opener.focus();
  set({ primary: 'shell.root', fullscreen: { phase: 'progress', itemId: 'w1' } });
  scheduler.flush();
  const dialog = dom.modal();
  assert.ok(dialog && dialog.localName === 'dialog' && dialog.getAttribute('aria-modal') === 'true');
  assert.ok(dialog.contains(dom.active()), 'focus moved in');
  set({ primary: 'shell.root', fullscreen: { phase: 'open', itemId: 'd2', result } });
  scheduler.flush();
  assert.equal(dom.findAll((el) => el.localName === 'dialog').length, 1, 'one at a time');
  assert.ok(dialog.contains(dom.active()));
  const inside = dom.tabOrder(dialog);
  assert.ok(inside.length >= 2);
  inside.at(-1).focus();
  dom.key(inside.at(-1), 'Tab');
  assert.equal(dom.active(), inside.at(0), 'Tab wraps inside');
  dom.key(inside.at(0), 'Tab', { shift: true });
  assert.equal(dom.active(), inside.at(-1), 'Shift+Tab wraps inside');
  dom.key(dom.active(), 'Escape');
  scheduler.flush();
  assert.equal(closes.length, 1);
  assert.equal(dialog.open, false);
  assert.equal(dom.active(), opener, 'focus returned to the opener (A-5)');
});

test('the real shell: NAVIGATE(detail) opens PROGRESS in the dialog, the P1 binding closes it, focus returns to the opener, the item carries a sentence, history balanced', async () => {
  const p = page({ voice: false });
  p.runtime.widgets.ingest(envelopeOf('kind-report'));
  p.scheduler.flush();
  const item = p.runtime.conversation.view().items.find((i) => i.kind === 'widget');
  const control = p.dom.find((el) => el.getAttribute('data-ref') === 'intent:i1', p.log());
  assert.ok(control, 'the NAVIGATE(detail) control is drawn');
  assert.equal(item.result.nodes.flatMap(function flat(n) { return n.t === 'block' ? n.children.flatMap(flat) : [n]; }).find((n) => n.ref === 'intent:i1').effect, 'NAVIGATE');
  p.dom.click(control);
  const dialog = p.dom.modal();
  assert.ok(dialog && dialog.localName === 'dialog', 'PROGRESS: the dialog is open while the submission runs');
  assert.match(p.dom.textOf(dialog), /Открываю…/);
  p.scheduler.flush();
  assert.ok(dialog.contains(p.dom.active()), 'focus moved in');
  await flush();
  p.scheduler.flush();
  assert.equal(p.dom.modal(), null, 'the P1 binding answered unavailable: closed');
  const opener = p.dom.find((el) => el.getAttribute('data-ref') === 'intent:i1', p.log());
  assert.notEqual(opener, control, 'the item was redrawn in place (pending, then its sentence)');
  assert.equal(p.dom.active(), opener, 'focus returned to the opener control, found again by its ref (A-5)');
  assert.match(p.dom.textOf(p.dom.find((el) => el.localName === 'article', p.log())), /Это действие сейчас недоступно/);
  assert.deepEqual([p.history.pushes, p.history.backs], [1, 1], 'Back entry pushed and popped; no address');
  assert.equal(p.chats.length, 0);
});
