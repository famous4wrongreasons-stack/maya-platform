#!/usr/bin/env node
// K5 — headless Chrome verification over CDP (§2.7 steps 1–17), JSON evidence.
//
//   node test/cdp-verify.mjs --url=http://127.0.0.1:8787/ \
//        --chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        [--evidence=<SCRATCH>/p1-shell/cdp-evidence.json] [--steps=1,2,3b,10b] [--root=<served dist/web>] \
//        [--api-url=http://127.0.0.1:8788/ --fixture=<SCRATCH>/shell-fixture.<slug>.json]   (step 17)
//
// The page under test is served by `dev/serve.mjs --mock` (steps 1–16) or `--api` (step 17). Mock
// scenarios are switched from THIS process (POST /__dev/scenario), so no page request exists that the
// shell did not make. Every step ends PASS, FAIL, PENDING_INTEGRATION (a module, page or DOM the step
// needs is not in the served build yet — never faked) or NOT_EXERCISED (with the reason).
//
// Exit: 0 only when every requested step PASSES; 1 when any FAILS; 4 when none fails but some are
// PENDING_INTEGRATION or NOT_EXERCISED; 2 when the harness itself cannot run. A partial run is never 0.
//
// A harness self-check runs first on the dev pages (0 console errors and 0 CSP issues under the header
// CSP; the locale override really applies, asserted by Intl.Collator().resolvedOptions().locale and a
// collation signature; request initiators are attributed to a module URL). It is evidence that the
// driver's instruments work, and is reported apart from the steps.
//
// DOM lookups use the plan's copy and ARIA (the role="log" timeline, the «Сообщение для MAYA» composer,
// «Основная навигация», the §1.4 sentences, the SH-06 approval notice). `SELECTORS` and `COPY` are the
// single place to reconcile with S5's markup at integration.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertScratchPath } from '../dev/local-api-env.mjs';
import { MOCK_ACCOUNT, MOCK_TENANTS, MOCK_TRANSCRIPT, SIGN_IN_FAILURE_ROWS, loadApiFixture } from '../dev/scenarios.mjs';
import { cspSplitProblems } from '../dev/serve.mjs';

const SH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── copy and selectors (plan §1.4, §1.7, §1.8, §1.9, SH-06) ────────────────────────────────────

export const COPY = Object.freeze({
  composerName: /Сообщение для MAYA/,
  send: /^Отправить$/,
  cancel: /^Отмена$/,
  navLabel: 'Основная навигация',
  signOut: /^Выйти$/,
  thinking: /MAYA думает/,
  retry: /повторить/i,
  approvalNotice: 'Действие ждёт подтверждения; подтвердить его здесь пока нельзя.',
  noConnection: /Нет связи — повторить/,
  modelFailure: /MAYA не смогла безопасно ответить — повторить/,
  outdated: /Версия MAYA устарела — обновите страницу/,
  actionUnavailable: /Это действие сейчас недоступно/,
  voiceUnavailable: /Голос недоступен на этом устройстве — напишите сообщение/,
  roleWords: /Владелец|Сотрудник|Клиент|онлайн/,
  approveReject: /подтверд|отклон|approve|reject/i,
  // Integration: the voice controls are named by what they show first (WCAG 2.5.3), and differ from the
  // composer's «Отправить».
  voiceSend: /^Отправить запись$/,
  voiceCancel: /^Отмена( записи|:)/,
  voiceListening: 'Слушаю',
  voiceRecording: 'Отправляю запись',
  signInTitle: 'Вход в MAYA',
  featureLocked: /MAYA сейчас недоступна для этого бизнеса\./,
  subscriptionRequired: /Разговор с MAYA недоступен для этого бизнеса: нужна активная подписка\./,
  deeplinkRefused: /Эту ссылку нельзя открыть здесь\./,
  deeplinkUnavailable: /Карточку по этой ссылке пока нельзя показать\./,
  widgetSentences: ['Это действие сейчас недоступно', 'Нет связи — действие не выполнено', 'Этот переход здесь недоступен', 'Карточка устарела — показана сводка'],
});

/** §1.4 sign-in table: row → the sentence the signed-out state shows. Row 9's copy is S5's field sentence. */
export const SIGN_IN_SENTENCES = Object.freeze({
  1: /Слишком много попыток — повторите через \d+ с/,
  2: /Слишком много попыток ввода кода — запросите новый код/,
  3: /Вход по коду сейчас недоступен — войдите по паролю/,
  4: /Код не подошёл — проверьте и введите ещё раз/,
  5: /Код устарел — запросите новый/,
  6: /Этот email не связан с пользователем выбранного бизнеса/,
  7: /Неверный адрес бизнеса, email или пароль/,
  8: /Вход для этой учётной записи сейчас недоступен/,
  9: null,
  10: /Нет связи — повторить/,
  11: /Для разговора с MAYA нужен вход в бизнес/,
});

/**
 * How each row is reached from the signed-out state. Row 8 is the email path: on /auth/login the same
 * 403 arrives for a known email before the password is checked, so there it is row 7's «never says
 * which» state (checked separately below; integration finding).
 */
const SIGN_IN_FLOWS = Object.freeze({ 1: 'password', 2: 'email', 3: 'email_start', 4: 'email', 5: 'email', 6: 'email_select', 7: 'password', 8: 'email', 9: 'password', 10: 'password', 11: 'password_then_turn' });

/** Where focus lands for each row (dom/signin.ts `fail`): the field in error, or the path's first control. */
const SIGN_IN_FOCUS = Object.freeze({
  1: { tag: 'input', name: /^Адрес бизнеса/ },
  2: { tag: 'button', name: /^Запросить новый код$/ },
  3: { tag: 'input', name: /^Адрес бизнеса/ },
  4: { tag: 'input', name: /^Код из письма/ },
  5: { tag: 'button', name: /^Запросить новый код$/ },
  6: { tag: 'input', name: /^Email/ },
  7: { tag: 'input', name: /^Адрес бизнеса/ },
  8: { tag: 'input', name: /^Email/ },
  9: { tag: 'input', name: /^Пароль/ },
  10: { tag: 'button', name: /^Повторить вход$/ },
  11: { tag: 'textarea', name: /Сообщение для MAYA/ },
});

/**
 * Deviation D-6 (S6): Chrome's fake capture device never settles getUserMedia on this Mac, so the voice
 * steps run with a page-level shim that answers getUserMedia with a WebAudio 440 Hz oscillator stream
 * (or refuses with NotAllowedError). The bundle still calls navigator.mediaDevices.getUserMedia inside
 * the trusted click; MediaRecorder, decodeAudioData, OfflineAudioContext, the WAV encoder, CSP and track
 * stop are real Chromium. The shim also records every voice indicator state it sees.
 */
const voiceShim = ({ deny = false } = {}) => `(() => {
  window.__cdpGum = { calls: 0, tracks: [] };
  window.__voiceStates = [];
  MediaDevices.prototype.getUserMedia = async function () {
    window.__cdpGum.calls += 1;
    ${deny ? "throw new DOMException('Permission denied', 'NotAllowedError');" : ''}
    const ctx = new AudioContext();
    await ctx.resume();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    window.__cdpGum.tracks.push(...dest.stream.getTracks());
    return dest.stream;
  };
  new MutationObserver(() => {
    const label = document.querySelector('.voice-state-label');
    const glyph = document.querySelector('.voice-indicator .voice-glyph');
    if (!label || label.closest('.voice-indicator')?.hidden) return;
    const s = { label: label.textContent, glyph: glyph ? glyph.textContent : '' };
    const last = window.__voiceStates[window.__voiceStates.length - 1];
    if (s.label && (!last || last.label !== s.label || last.glyph !== s.glyph)) window.__voiceStates.push(s);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
})();`;

/** In-page helpers, evaluated as a prelude (no script is injected into the page). */
const Q = String.raw`
const Q = {
  text: (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim(),
  visible: (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  name(el) {
    if (!el) return '';
    const by = el.getAttribute('aria-labelledby');
    if (by) return by.split(/\s+/).map((id) => Q.text(document.getElementById(id))).join(' ').trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    if (el.labels && el.labels.length) return [...el.labels].map(Q.text).join(' ').trim();
    return Q.text(el);
  },
  all: (sel, root = document) => [...root.querySelectorAll(sel)],
  byName: (sel, re, root = document) => Q.all(sel, root).find((el) => re.test(Q.name(el)) && Q.visible(el)) ?? null,
  composer: () => Q.all('textarea').find((el) => /Сообщение для MAYA/.test(Q.name(el))) ?? null,
  send: () => Q.byName('button', /^Отправить$/),
  log: () => document.querySelector('[role="log"]'),
  nav: () => Q.all('nav,[role="navigation"]').find((el) => el.getAttribute('aria-label') === 'Основная навигация') ?? null,
  dialogs: () => Q.all('dialog[open],[role="dialog"][aria-modal="true"]').filter(Q.visible),
  email: () => Q.all('input[type="email"]').find(Q.visible) ?? null,
  password: () => Q.all('input[type="password"]').find(Q.visible) ?? null,
  business: () => Q.all('input[type="text"]').find((el) => Q.visible(el) && /бизнес/i.test(Q.name(el))) ?? null,
  code: () => Q.all('input').find((el) => Q.visible(el) && /код/i.test(Q.name(el))) ?? null,
  alerts: () => Q.all('[role="alert"]'),
  rect(el) { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; },
  describe(el) { return el ? { tag: el.tagName.toLowerCase(), name: Q.name(el), type: el.getAttribute('type') } : null; },
};`;

// ── a minimal CDP client ───────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Browser {
  static async launch(chromePath, extraArgs = []) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-shell-cdp-'));
    const child = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, ...extraArgs, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c));
    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i += 1) await sleep(100);
    if (!fs.existsSync(portFile)) {
      child.kill('SIGKILL');
      throw new Error(`Chrome did not open a DevTools port: ${stderr.slice(0, 400)}`);
    }
    const [port, wsPath] = fs.readFileSync(portFile, 'utf8').trim().split('\n');
    const browser = new Browser(child, userDataDir, `ws://127.0.0.1:${port}${wsPath}`);
    await browser.connect();
    return browser;
  }

  constructor(child, userDataDir, wsUrl) {
    this.child = child;
    this.userDataDir = userDataDir;
    this.wsUrl = wsUrl;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Set();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error(`CDP socket: ${e.message ?? 'error'}`));
      this.ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve: ok, reject: fail, method } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) fail(new Error(`${method}: ${msg.error.message}`));
          else ok(msg.result);
        } else if (msg.method) for (const l of this.listeners) l(msg);
      };
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async version() {
    return this.send('Browser.getVersion');
  }

  async newPage() {
    const { browserContextId } = await this.send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(this, sessionId, targetId, browserContextId);
    await page.enable();
    return page;
  }

  async close() {
    try {
      await Promise.race([this.send('Browser.close'), sleep(2000)]);
    } catch {
      // already closing
    }
    this.ws?.close();
    if (this.child.exitCode === null) this.child.kill('SIGKILL');
    await sleep(200);
    fs.rmSync(this.userDataDir, { recursive: true, force: true });
  }
}

class Page {
  constructor(browser, sessionId, targetId, browserContextId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.browserContextId = browserContextId;
    this.reset();
    browser.listeners.add((msg) => {
      if (msg.sessionId !== this.sessionId) return;
      this.onEvent(msg.method, msg.params);
    });
  }

  reset() {
    this.requests = new Map();
    this.console = [];
    this.exceptions = [];
    this.logEntries = [];
    this.issues = [];
    this.loadWaiters = [];
  }

  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }

  async enable() {
    await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable', 'Audits.enable', 'DOM.enable', 'Accessibility.enable'].map((m) => this.send(m)));
  }

  onEvent(method, p) {
    switch (method) {
      case 'Network.requestWillBeSent':
        this.requests.set(p.requestId, {
          requestId: p.requestId,
          url: p.request.url,
          method: p.request.method,
          type: p.type,
          postData: p.request.postData ?? null,
          hasPostData: Boolean(p.request.hasPostData),
          initiator: { type: p.initiator?.type, url: p.initiator?.url ?? null, top: p.initiator?.stack?.callFrames?.[0]?.url ?? null, frames: (p.initiator?.stack?.callFrames ?? []).map((f) => f.url) },
          startedAt: p.timestamp,
          documentURL: p.documentURL ?? null,
        });
        break;
      case 'Network.responseReceived': {
        const r = this.requests.get(p.requestId);
        if (r) r.status = p.response.status;
        break;
      }
      case 'Network.loadingFinished': {
        const r = this.requests.get(p.requestId);
        if (r) r.finishedAt = p.timestamp;
        break;
      }
      case 'Network.loadingFailed': {
        const r = this.requests.get(p.requestId);
        if (r) r.failed = p.errorText;
        break;
      }
      case 'Runtime.consoleAPICalled':
        this.console.push({ type: p.type, text: (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ') });
        break;
      case 'Runtime.exceptionThrown':
        this.exceptions.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'exception');
        break;
      case 'Log.entryAdded':
        this.logEntries.push({ source: p.entry.source, level: p.entry.level, text: p.entry.text, url: p.entry.url ?? null });
        break;
      case 'Audits.issueAdded':
        this.issues.push({ code: p.issue.code, details: p.issue.details });
        break;
      case 'Page.loadEventFired':
        for (const w of this.loadWaiters.splice(0)) w();
        break;
      default:
    }
  }

  async goto(url, { timeoutMs = 15_000 } = {}) {
    const loaded = new Promise((resolve) => this.loadWaiters.push(resolve));
    const nav = await this.send('Page.navigate', { url });
    if (nav.errorText) throw new Error(`navigate ${url}: ${nav.errorText}`);
    await Promise.race([loaded, sleep(timeoutMs).then(() => Promise.reject(new Error(`load timeout ${url}`)))]);
  }

  async reload() {
    const loaded = new Promise((resolve) => this.loadWaiters.push(resolve));
    await this.send('Page.reload', { ignoreCache: true });
    await Promise.race([loaded, sleep(15_000)]);
  }

  async eval(expression, { awaitPromise = true } = {}) {
    const res = await this.send('Runtime.evaluate', { expression: `(async () => { ${Q}\n return (${expression}); })()`, awaitPromise, returnByValue: true, userGesture: false });
    if (res.exceptionDetails) throw new Error(`eval: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    return res.result.value;
  }

  async waitFor(expression, { timeoutMs = 8000, intervalMs = 50 } = {}) {
    const until = Date.now() + timeoutMs;
    let last;
    while (Date.now() < until) {
      last = await this.eval(expression).catch((e) => ({ __error: e.message }));
      if (last && !last.__error) return last;
      await sleep(intervalMs);
    }
    return null;
  }

  async click(expression) {
    const rect = await this.eval(`(() => { const el = ${expression}; if (!el) return null; el.scrollIntoView({ block: 'center' }); return Q.rect(el); })()`);
    if (!rect) return false;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await this.send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
    return true;
  }

  async focus(expression) {
    return this.eval(`(() => { const el = ${expression}; if (!el) return false; el.focus(); return document.activeElement === el; })()`);
  }

  async type(text) {
    await this.send('Input.insertText', { text });
  }

  async fill(expression, text) {
    if (!(await this.focus(expression))) return false;
    await this.eval(`(() => { const el = document.activeElement; if ('value' in el) el.select?.(); return true; })()`);
    await this.press('Backspace');
    await this.type(text);
    return true;
  }

  /** As Puppeteer does: one keyDown carrying the text for keys that type, rawKeyDown otherwise. */
  async press(key, { shift = false } = {}) {
    const codes = { Enter: [13, 'Enter', '\r'], Tab: [9, 'Tab', ''], Escape: [27, 'Escape', ''], Backspace: [8, 'Backspace', ''], Space: [32, 'Space', ' '] };
    const [vk, code, text] = codes[key];
    const modifiers = shift ? 8 : 0;
    const keyName = key === 'Space' ? ' ' : key;
    await this.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: keyName, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text, unmodifiedText: text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, modifiers });
  }

  async responseBody(requestId) {
    try {
      const { body, base64Encoded } = await this.send('Network.getResponseBody', { requestId });
      return base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
    } catch {
      return null;
    }
  }

  async postData(r) {
    if (r.postData !== null) return r.postData;
    if (!r.hasPostData) return null;
    try {
      return (await this.send('Network.getRequestPostData', { requestId: r.requestId })).postData;
    } catch {
      return null;
    }
  }

  apiRequests(pathPrefix) {
    return [...this.requests.values()].filter((r) => new URL(r.url).pathname.startsWith(`/api${pathPrefix}`));
  }

  async close() {
    await this.browser.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
    await this.browser.send('Target.disposeBrowserContext', { browserContextId: this.browserContextId }).catch(() => {});
  }
}

// ── the run ────────────────────────────────────────────────────────────────────────────────────

const PASS = 'PASS';
const FAIL = 'FAIL';
const PENDING = 'PENDING_INTEGRATION';
const NOT_EXERCISED = 'NOT_EXERCISED';

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a}`);
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

class Checks {
  constructor() {
    this.items = [];
    this.skipped = [];
  }
  ok(name, condition, detail = null) {
    this.items.push({ name, ok: Boolean(condition), ...(detail === null ? {} : { detail }) });
    return Boolean(condition);
  }
  /** A named sub-clause this run could not exercise: reported on its own, never folded into a PASS. */
  notExercised(name, reason) {
    this.skipped.push({ name, status: NOT_EXERCISED, reason });
  }
  get status() {
    return this.items.length > 0 && this.items.every((i) => i.ok) ? PASS : FAIL;
  }
  result(step, title, extra = {}) {
    return { step, title, status: this.status, checks: this.items, notExercised: this.skipped, ...extra };
  }
}

class Run {
  constructor(options) {
    this.options = options;
    this.origin = new URL(options.url).origin;
    this.evidence = { generatedAt: new Date().toISOString(), url: options.url, harness: null, preconditions: null, steps: [], requestAudit: null };
    this.allRequests = [];
    this.pages = [];
  }

  async dev(pathname, body = undefined, origin = this.origin) {
    const res = await fetch(`${origin}${pathname}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json();
  }

  async scenario(name) {
    await this.dev('/__dev/reset', {});
    const res = await this.dev('/__dev/scenario', { name });
    if (res.scenario !== name) throw new Error(`scenario ${name} not set: ${JSON.stringify(res)}`);
  }

  async page(extraArgs = null) {
    const browser = extraArgs ? await Browser.launch(this.options.chrome, extraArgs) : this.browser;
    const page = await browser.newPage();
    this.pages.push(page);
    if (extraArgs) page.ownBrowser = browser;
    return page;
  }

  async release(page) {
    // A page served from another local origin (step 17's --api-url) is audited against ITS origin.
    this.allRequests.push(...[...page.requests.values()].map((r) => ({ ...r, pageOrigin: page.origin ?? this.origin })));
    await page.close();
    if (page.ownBrowser) await page.ownBrowser.close();
  }

  async preconditions() {
    const web = await this.dev('/__dev/web.json').catch(() => null);
    const index = await fetch(this.options.url).then(async (r) => ({ status: r.status, csp: r.headers.get('content-security-policy'), html: await r.text() })).catch(() => null);
    const has = (file) => Boolean(web?.files?.includes(file));
    const devPage = async (p) => (await fetch(`${this.origin}${p}`)).status === 200;
    this.pre = {
      mockServer: Boolean(web),
      modulePath: web?.modulePath ?? null,
      entry: Boolean(index && index.status === 200 && /<script\b[^>]*type="module"/.test(index.html) && has('entry/main.js')),
      dom: has('src/dom/host.js') && has('src/dom/timeline.js') && has('src/dom/composer.js') && has('src/dom/signin.js'),
      shell: has('src/shell/conversation.js') && has('src/shell/intents.js') && has('src/shell/view.js'),
      fullscreen: has('src/dom/fullscreen.js'),
      voice: has('src/voice/capture.js') && has('src/dom/voice-control.js'),
      integrity: has('src/integrity/h7.js'),
      fixtureHost: await devPage('/__dev/fixture-host.html'),
      h7Parity: await devPage('/__dev/h7-parity.html'),
      indexCspSplit: index && index.status === 200 ? cspSplitProblems(index.csp ?? '', index.html) : ['index.html not served'],
      files: web?.files ?? [],
    };
    this.evidence.preconditions = { ...this.pre, files: undefined, fileCount: this.pre.files.length };
    return this.pre;
  }

  pending(step, title, needs) {
    const missing = Object.entries(needs).filter(([, present]) => !present).map(([k]) => k);
    return missing.length ? { step, title, status: PENDING, reason: `not in the served build yet: ${missing.join(', ')}` } : null;
  }

  // ── harness self-check (runs on dev pages; not a step) ──

  async harness() {
    const checks = new Checks();
    const out = { locale: [], initiator: null, consoleErrors: null, cspIssues: null };
    if (!this.pre.fixtureHost) {
      this.evidence.harness = { status: FAIL, reason: '/__dev/fixture-host.html not served (is this dev/serve.mjs --mock?)' };
      return this.evidence.harness;
    }
    const page = await this.page();
    try {
      await page.goto(`${this.origin}/__dev/fixture-host.html`);
      const status = await page.waitFor(`globalThis.__fixtureHost && globalThis.__fixtureHost.ready.then((s) => ({ phase: s.phase, locale: s.locale, envelopes: s.envelopes.length, capabilities: s.capabilities, missing: s.missing, inventory: Object.keys(s.inventory), errors: s.errors }))`, { timeoutMs: 10_000 });
      out.fixtureHost = status;
      checks.ok('fixture host booted', status && status.phase !== 'error' && status.errors.length === 0, status);
      await sleep(300);
      const errors = [...page.console.filter((c) => c.type === 'error'), ...page.logEntries.filter((l) => l.level === 'error'), ...page.exceptions];
      const csp = [...page.issues.filter((i) => /ContentSecurityPolicy/i.test(i.code)), ...page.logEntries.filter((l) => l.source === 'security')];
      out.consoleErrors = errors;
      out.cspIssues = csp;
      checks.ok('0 console errors on a dev page under the header CSP', errors.length === 0, errors);
      checks.ok('0 CSP issues', csp.length === 0, csp);
      const fetches = [...page.requests.values()].filter((r) => r.type === 'Fetch');
      out.initiator = fetches.map((r) => ({ url: new URL(r.url).pathname, type: r.initiator.type, top: r.initiator.top && new URL(r.initiator.top).pathname }));
      checks.ok('fetch initiators carry the module URL at the stack top', fetches.length > 0 && fetches.every((r) => r.initiator.type === 'script' && /\/__dev\/fixture-host\.mjs$/.test(r.initiator.top ?? '')), out.initiator);
      const expectSignature = { 'ru-RU': 'ajtyzZ', 'en-US': 'ajtyzZ', 'et-EE': 'ajzZty', 'lt-LT': 'ayjtzZ' };
      for (const locale of Object.keys(expectSignature)) {
        await page.send('Emulation.setLocaleOverride', {});
        await page.send('Emulation.setLocaleOverride', { locale });
        await page.reload();
        const got = await page.waitFor(`globalThis.__fixtureHost && globalThis.__fixtureHost.ready.then((s) => ({ locale: s.locale, signature: s.collationSignature }))`, { timeoutMs: 8000 });
        out.locale.push({ requested: locale, ...got });
        checks.ok(`locale override ${locale} applied (resolved locale and collation)`, got && got.locale === locale && got.signature === expectSignature[locale], got);
      }
      await page.send('Emulation.setLocaleOverride', {});
    } finally {
      await this.release(page);
    }
    this.evidence.harness = { status: checks.status, checks: checks.items, ...out };
    return this.evidence.harness;
  }

  // ── shared flows ──

  /**
   * Submit the sign-in step the focused field belongs to: Enter first; if no /api/auth request follows
   * (the closed tag set has no <form>), the step's own button — the first visible button after the field.
   */
  async submit(page) {
    const before = page.apiRequests('/auth/').length;
    await page.press('Enter');
    await sleep(250);
    if (page.apiRequests('/auth/').length > before) return true;
    return page.click(`(() => { const field = document.activeElement; const buttons = Q.all('button').filter(Q.visible); return buttons.find((b) => field && (field.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && /Войти|код|Подтверд|Продолж|Далее|Отправить/i.test(Q.name(b))) ?? null; })()`);
  }

  async signInPassword(page, { slug = MOCK_TENANTS[0].slug, email = MOCK_ACCOUNT.email, password = MOCK_ACCOUNT.password } = {}) {
    const ok = (await page.fill('Q.business()', slug)) && (await page.fill('Q.email()', email)) && (await page.fill('Q.password()', password));
    if (!ok) return { ok: false, reason: 'password form fields not found (business address, email, password)' };
    await this.submit(page);
    const signedIn = await page.waitFor('Q.composer() && Q.visible(Q.composer()) ? true : null', { timeoutMs: 8000 });
    return { ok: Boolean(signedIn) };
  }

  async sendTurn(page, text) {
    await page.fill('Q.composer()', text);
    await page.press('Enter');
  }

  async chatBodies(page) {
    const out = [];
    for (const r of page.apiRequests('/ai/chat')) {
      const data = await page.postData(r);
      out.push({ requestId: r.requestId, status: r.status ?? null, body: data ? JSON.parse(data) : null, startedAt: r.startedAt, finishedAt: r.finishedAt ?? null });
    }
    return out;
  }

  // ── steps ──

  async step1() {
    const title = 'Load under CSP: 0 console errors, 0 CSP violations, initiators (D5, D10, V2-15)';
    const gate = this.pending('1', title, { entry: this.pre.entry });
    if (gate) return gate;
    await this.scenario('happy');
    const page = await this.page();
    const checks = new Checks();
    try {
      await page.goto(this.options.url);
      await sleep(1500);
      const signedIn = await this.signInPassword(page);
      if (signedIn.ok) {
        await this.sendTurn(page, 'Проверка загрузки');
        await page.waitFor('Q.log() && /Тестовый ответ MAYA/.test(Q.text(Q.log())) ? true : null');
      }
      checks.ok('index CSP split (header frame-ancestors; meta without it)', this.pre.indexCspSplit.length === 0, this.pre.indexCspSplit);
      const errors = [...page.console.filter((c) => c.type === 'error'), ...page.logEntries.filter((l) => l.level === 'error'), ...page.exceptions];
      checks.ok('0 console errors', errors.length === 0, errors);
      const csp = [...page.issues.filter((i) => /ContentSecurityPolicy/i.test(i.code)), ...page.logEntries.filter((l) => l.source === 'security')];
      checks.ok('0 CSP violations', csp.length === 0, csp);
      const audit = auditRequests([...page.requests.values()], this.origin, this.pre.modulePath);
      checks.ok('every /api request is initiated by net/client.js', audit.apiNotFromClient.length === 0, audit.apiNotFromClient);
      checks.ok('every other request is a document, module or stylesheet load, or initiated by net/client.js', audit.unexpected.length === 0, audit.unexpected);
      checks.ok('0 requests to other origins', audit.crossOrigin.length === 0, audit.crossOrigin);
      checks.ok('signed in with the password path during the load check', signedIn.ok, signedIn);
    } finally {
      await this.release(page);
    }
    return { step: '1', title, status: checks.status, checks: checks.items };
  }

  async step2() {
    const title = 'Signed out (R2 default): named state, nav absent or inert, 0 /api/ai requests';
    const gate = this.pending('2', title, { entry: this.pre.entry, dom: this.pre.dom });
    if (gate) return gate;
    await this.scenario('happy');
    const page = await this.page();
    const checks = new Checks();
    try {
      await page.goto(this.options.url);
      const state = await page.waitFor(`Q.email() || Q.password() ? { title: Q.all('h1,h2,h3').filter(Q.visible).map(Q.text), email: Q.describe(Q.email()), password: Q.describe(Q.password()), business: Q.describe(Q.business()), composer: Q.describe(Q.composer()), nav: Q.nav() ? { inert: Q.nav().inert || Q.nav().closest("[inert]") !== null, hidden: !Q.visible(Q.nav()) } : null } : null`);
      checks.ok('the signed-out sign-in state is drawn', Boolean(state), state);
      checks.ok(`the state is named: a visible «${COPY.signInTitle}» heading`, Array.isArray(state?.title) && state.title.includes(COPY.signInTitle), state?.title);
      checks.ok('its fields are named: email, business address, password', state?.email?.name === 'Email' && /^Адрес бизнеса/.test(state?.business?.name ?? '') && /^Пароль/.test(state?.password?.name ?? ''), state);
      checks.ok('no usable composer while signed out', !state?.composer, state?.composer);
      checks.ok('nav absent or inert', !state?.nav || state.nav.inert || state.nav.hidden, state?.nav);
      checks.ok('0 /api/ai requests', page.apiRequests('/ai/').length === 0, page.apiRequests('/ai/').map((r) => r.url));
      checks.notExercised('a signed-out REASON sentence on a fresh load', 'a fresh load has no reason by design (signedOutSentence(null)); the reasons are drawn after a session ends — step 9');
    } finally {
      await this.release(page);
    }
    return checks.result('2', title);
  }

  async step3() {
    const title = 'Email OTP with select_business; password with a required business address (V2-6)';
    const gate = this.pending('3', title, { entry: this.pre.entry, dom: this.pre.dom });
    if (gate) return gate;
    const checks = new Checks();
    await this.scenario('select_business');
    let page = await this.page();
    try {
      await page.goto(this.options.url);
      checks.ok('email field', await page.fill('Q.email()', MOCK_ACCOUNT.email));
      await this.submit(page);
      const start = await page.waitFor('Q.code() ? true : null');
      checks.ok('code field after /auth/email/start', Boolean(start));
      const startReq = page.apiRequests('/auth/email/start')[0];
      const startBody = startReq ? JSON.parse((await page.responseBody(startReq.requestId)) ?? '{}') : {};
      checks.ok('debug_code read from the network log', typeof startBody.debug_code === 'string', { keys: Object.keys(startBody) });
      await page.fill('Q.code()', startBody.debug_code ?? '');
      await this.submit(page);
      const choices = await page.waitFor(`(() => { const bs = Q.all('button').filter((b) => ${JSON.stringify(MOCK_TENANTS.map((t) => t.name))}.includes(Q.name(b))); return bs.length ? bs.map(Q.name) : null; })()`);
      checks.ok('businesses offered by name', Array.isArray(choices) && choices.length === 2, choices);
      await page.click(`Q.all('button').find((b) => Q.name(b) === ${JSON.stringify(MOCK_TENANTS[1].name)})`);
      const signed = await page.waitFor('Q.composer() ? true : null');
      checks.ok('signed in after the re-verify', Boolean(signed));
      const verifies = page.apiRequests('/auth/email/verify');
      const reverify = verifies.length ? JSON.parse((await page.postData(verifies.at(-1))) ?? '{}') : {};
      checks.ok('re-verify carries the chosen tenantSlug', reverify.tenantSlug === MOCK_TENANTS[1].slug, reverify.tenantSlug);
      const identity = await page.eval('Q.text(document.body)');
      checks.ok('identity shows the user and the chosen business', identity.includes(MOCK_ACCOUNT.userName) && identity.includes(MOCK_TENANTS[1].name));
      const ax = await page.send('Accessibility.getFullAXTree');
      const names = ax.nodes.map((n) => n.name?.value ?? '').filter(Boolean);
      checks.ok('AX tree names no role or online label', !names.some((n) => COPY.roleWords.test(n)), names.filter((n) => COPY.roleWords.test(n)));
    } finally {
      await this.release(page);
    }
    await this.scenario('happy');
    page = await this.page();
    try {
      await page.goto(this.options.url);
      await page.fill('Q.email()', MOCK_ACCOUNT.email);
      await page.fill('Q.password()', MOCK_ACCOUNT.password);
      await this.submit(page);
      await sleep(600);
      checks.ok('empty business address → 0 /auth/login requests', page.apiRequests('/auth/login').length === 0);
      checks.ok('empty business address → a field state (aria-invalid or described error)', await page.eval('(() => { const b = Q.business(); return !!b && (b.getAttribute("aria-invalid") === "true" || !!b.getAttribute("aria-describedby")); })()'));
      const signed = await this.signInPassword(page);
      checks.ok('password sign-in succeeds with the business address', signed.ok, signed);
      const login = page.apiRequests('/auth/login')[0];
      const body = login ? JSON.parse((await page.postData(login)) ?? '{}') : {};
      checks.ok('/auth/login body keys are exactly {tenantSlug, email, password}', JSON.stringify(Object.keys(body).sort()) === JSON.stringify(['email', 'password', 'tenantSlug']), Object.keys(body));
      await this.sendTurn(page, 'Проверка тела запроса');
      await page.waitFor('Q.log() && /Тестовый ответ MAYA/.test(Q.text(Q.log())) ? true : null');
      const chats = await this.chatBodies(page);
      const tenantValues = MOCK_TENANTS.flatMap((t) => [t.id, t.slug, t.name]);
      checks.ok('/ai/chat bodies carry no tenant value', chats.length > 0 && chats.every((c) => !tenantValues.some((v) => JSON.stringify(c.body).includes(v))), chats.map((c) => Object.keys(c.body ?? {})));
      const identity = await page.eval('Q.text(document.body)');
      checks.ok('login display uses the nested user.tenant', identity.includes(MOCK_TENANTS[0].name));
    } finally {
      await this.release(page);
    }
    return { step: '3', title, status: checks.status, checks: checks.items };
  }

  async step3b() {
    const title = 'Sign-in failures: one scenario per §1.4 row, a named state each, focus on the field in error, silent login outcomes = 0 (V2-16)';
    const gate = this.pending('3b', title, { entry: this.pre.entry, dom: this.pre.dom });
    if (gate) return gate;
    const checks = new Checks();
    let attempts = 0;
    let named = 0;
    const rows = [];
    const drive = async (page, flow) => {
      if (flow === 'password' || flow === 'password_then_turn') {
        await page.fill('Q.business()', MOCK_TENANTS[0].slug);
        await page.fill('Q.email()', MOCK_ACCOUNT.email);
        await page.fill('Q.password()', MOCK_ACCOUNT.password);
        await this.submit(page);
        if (flow === 'password_then_turn') {
          await page.waitFor('Q.composer() ? true : null');
          await this.sendTurn(page, 'Здравствуйте');
        }
        return;
      }
      await page.fill('Q.email()', MOCK_ACCOUNT.email);
      await this.submit(page);
      if (flow === 'email_start') return;
      await page.waitFor('Q.code() ? true : null');
      await page.fill('Q.code()', MOCK_ACCOUNT.debugCode);
      await this.submit(page);
      if (flow === 'email_select') {
        await page.waitFor(`Q.all('button').some((b) => Q.name(b) === ${JSON.stringify(MOCK_TENANTS[1].name)}) ? true : null`);
        await page.click(`Q.all('button').find((b) => Q.name(b) === ${JSON.stringify(MOCK_TENANTS[1].name)})`);
      }
    };
    for (const row of SIGN_IN_FAILURE_ROWS) {
      for (const scenario of row.scenarios) {
        await this.scenario(scenario);
        const page = await this.page();
        try {
          await page.goto(this.options.url);
          attempts += 1;
          await drive(page, SIGN_IN_FLOWS[row.row]);
          const sentence = SIGN_IN_SENTENCES[row.row];
          const state = await page.waitFor(
            sentence
              ? `(${sentence}).test(Q.text(document.body)) ? { focus: Q.describe(document.activeElement), alerts: Q.alerts().length } : null`
              : `Q.all('[aria-invalid="true"]').length ? { focus: Q.describe(document.activeElement), alerts: Q.alerts().length, invalid: Q.all('[aria-invalid="true"]').map(Q.describe) } : null`,
            { timeoutMs: 6000 },
          );
          if (state) named += 1;
          const want = SIGN_IN_FOCUS[row.row];
          const focusOk = !!state && state.focus?.tag === want.tag && want.name.test(state.focus?.name ?? '');
          rows.push({ row: row.row, scenario, named: Boolean(state), focus: state?.focus ?? null, wantFocus: `${want.tag} ${want.name}`, alerts: state?.alerts ?? null });
          checks.ok(`row ${row.row} ${scenario}: named state`, Boolean(state), state);
          checks.ok(`row ${row.row} ${scenario}: focus on the field in error (${want.tag} ${want.name})`, focusOk, state?.focus);
          checks.ok(`row ${row.row} ${scenario}: no role="alert"`, state && state.alerts === 0, state?.alerts);
          if (row.row === 9 && state) checks.ok('row 9: the field in error is aria-invalid', (state.invalid ?? []).some((d) => d.tag === 'input' && /^Пароль/.test(d.name)), state.invalid);
          if (row.row === 1 && state) {
            const first = await page.eval(`(() => { const m = /через (\\d+) с/.exec(Q.text(document.body)); return m ? Number(m[1]) : null; })()`);
            await sleep(2200);
            const later = await page.eval(`(() => { const m = /через (\\d+) с/.exec(Q.text(document.body)); return m ? Number(m[1]) : null; })()`);
            checks.ok('row 1: the countdown decreases', first !== null && later !== null && later < first, { first, later });
          }
        } finally {
          await this.release(page);
        }
      }
    }
    // Row 8's 403 on the PASSWORD path: the same «never says which» state as row 7, focus on the business
    // address — never «Вход для этой учётной записи сейчас недоступен» (no account enumeration).
    for (const scenario of SIGN_IN_FAILURE_ROWS.find((r) => r.row === 8).scenarios) {
      await this.scenario(scenario);
      const page = await this.page();
      try {
        await page.goto(this.options.url);
        attempts += 1;
        await drive(page, 'password');
        const state = await page.waitFor(`(${SIGN_IN_SENTENCES[7]}).test(Q.text(document.body)) ? { focus: Q.describe(document.activeElement), alerts: Q.alerts().length, account: /учётной записи/.test(Q.text(document.body)) } : null`, { timeoutMs: 6000 });
        if (state) named += 1;
        rows.push({ row: '8 via /auth/login', scenario, named: Boolean(state), focus: state?.focus ?? null });
        checks.ok(`row 8 via /auth/login (${scenario}): the row 7 sentence, no account wording`, state && state.account === false, state);
        checks.ok(`row 8 via /auth/login (${scenario}): focus on the business address`, state?.focus?.tag === 'input' && /^Адрес бизнеса/.test(state.focus.name ?? ''), state?.focus);
      } finally {
        await this.release(page);
      }
    }
    const silent = attempts - named;
    checks.ok('silent login outcomes = attempts − (signed-in + named state) = 0', silent === 0, { attempts, named, silent });
    return checks.result('3b', title, { rows, silentLoginOutcomes: silent });
  }

  async signedInPage(scenario = 'happy', { voice = false } = {}) {
    await this.scenario('happy');
    const page = await this.page();
    if (voice) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: voiceShim() });
    await page.goto(this.options.url);
    const signed = await this.signInPassword(page);
    if (scenario !== 'happy') await this.dev('/__dev/scenario', { name: scenario });
    return { page, signed };
  }

  /** A fresh fixture-host page, booted. */
  async hostPage() {
    const page = await this.page();
    await page.goto(`${this.origin}/__dev/fixture-host.html`);
    await page.waitFor('globalThis.__fixtureHost && globalThis.__fixtureHost.ready.then(() => true)', { timeoutMs: 10_000 });
    return page;
  }

  async step4() {
    const title = 'Navigation: 5 buttons with registry labels; Tab order composer → send → mic → nav';
    const gate = this.pending('4', title, { entry: this.pre.entry, dom: this.pre.dom });
    if (gate) return gate;
    const checks = new Checks();
    const labels = await registryLabels(this.options.root, this.pre.modulePath);
    const { page, signed } = await this.signedInPage();
    try {
      checks.ok('signed in', signed.ok);
      const nav = await page.eval('Q.nav() ? Q.all("button", Q.nav()).map(Q.name) : null');
      checks.ok('exactly 5 nav buttons', Array.isArray(nav) && nav.length === 5, nav);
      if (labels) checks.ok('labels are the registry labels', JSON.stringify(nav) === JSON.stringify(labels), { nav, labels });
      else checks.ok('registry labels readable from the emitted routes/registry.js', false, 'labels not found in the emitted registry');
      await page.focus('Q.composer()');
      const forward = [];
      for (let i = 0; i < 8; i += 1) {
        forward.push(await page.eval('Q.describe(document.activeElement)'));
        await page.press('Tab');
      }
      const order = forward.map((d) => d?.name);
      checks.ok('stop 1 is the composer', COPY.composerName.test(order[0] ?? ''), order[0]);
      checks.ok('stop 2 is «Отправить»', COPY.send.test(order[1] ?? ''), order[1]);
      checks.ok('stop 3 is the mic («Сказать голосом»)', forward[2]?.tag === 'button' && /Сказать голосом/.test(order[2] ?? ''), forward[2]);
      checks.ok('stops 4–8 are the five nav buttons in order', !!nav && order.slice(3, 8).join('|') === nav.join('|'), order.slice(3, 8));
      const back = [];
      for (let i = 0; i < 7; i += 1) {
        await page.press('Tab', { shift: true });
        back.push((await page.eval('Q.describe(document.activeElement)'))?.name);
      }
      // Eight Tabs leave focus one stop PAST the eighth recorded stop, so seven Shift+Tabs revisit
      // recorded stops 8…2 (indices 7…1). Comparing with stops 7…1 could only pass with a keyboard trap.
      checks.ok('Shift+Tab reverses it', back.join('|') === order.slice(1, 8).reverse().join('|'), back);
    } finally {
      await this.release(page);
    }
    return checks.result('4', title);
  }

  async step5() {
    const title = 'Typed turn: bubble before the reply, one role=status, polite log, focus stays, body keys (D7)';
    const gate = this.pending('5', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell });
    if (gate) return gate;
    const checks = new Checks();
    const { page, signed } = await this.signedInPage('slow_reply');
    try {
      checks.ok('signed in', signed.ok);
      const text = 'Какие окна свободны завтра?';
      await this.sendTurn(page, text);
      const early = await page.waitFor(`Q.log() && Q.text(Q.log()).includes(${JSON.stringify(text)}) ? { statuses: Q.all('[role="status"]').filter(Q.visible).length, live: Q.log().getAttribute('aria-live') } : null`, { timeoutMs: 1500 });
      checks.ok('user bubble appears before the reply resolves', Boolean(early), early);
      checks.ok('exactly one visible role="status" while pending', early?.statuses === 1, early?.statuses);
      checks.ok('role="log" is polite', early?.live === 'polite', early?.live);
      const done = await page.waitFor('Q.log() && /Тестовый ответ MAYA/.test(Q.text(Q.log())) ? true : null', { timeoutMs: 6000 });
      checks.ok('reply lands in the log', Boolean(done));
      checks.ok('focus stays in the composer', await page.eval('document.activeElement === Q.composer()'));
      const chats = await this.chatBodies(page);
      checks.ok('body keys exactly {surface, requestId, messages}, surface web', chats.length === 1 && JSON.stringify(Object.keys(chats[0].body).sort()) === JSON.stringify(['messages', 'requestId', 'surface']) && chats[0].body.surface === 'web', chats.map((c) => c.body && Object.keys(c.body)));
    } finally {
      await this.release(page);
    }
    return { step: '5', title, status: checks.status, checks: checks.items };
  }

  async step6() {
    const title = 'Double Enter: exactly one POST';
    const gate = this.pending('6', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell });
    if (gate) return gate;
    const checks = new Checks();
    const { page, signed } = await this.signedInPage('slow_reply');
    try {
      checks.ok('signed in', signed.ok);
      await page.fill('Q.composer()', 'Двойной ввод');
      await page.press('Enter');
      await page.press('Enter');
      await page.waitFor('Q.log() && /Тестовый ответ MAYA/.test(Q.text(Q.log())) ? true : null', { timeoutMs: 6000 });
      checks.ok('exactly one POST /api/ai/chat', page.apiRequests('/ai/chat').length === 1, page.apiRequests('/ai/chat').length);
    } finally {
      await this.release(page);
    }
    return { step: '6', title, status: checks.status, checks: checks.items };
  }

  async step7() {
    const title = '502: text kept, named retry, no bot bubble, same requestId; 7b long reply history ≤ 2000 (D6)';
    const gate = this.pending('7', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell });
    if (gate) return gate;
    const checks = new Checks();
    let { page, signed } = await this.signedInPage('chat_502');
    try {
      checks.ok('signed in', signed.ok);
      const text = 'Сообщение при обрыве связи';
      await this.sendTurn(page, text);
      const failed = await page.waitFor(`${COPY.noConnection}.test(Q.text(document.body)) ? { kept: Q.text(Q.log() ?? document.body).includes(${JSON.stringify(text)}), retry: Q.describe(Q.byName('button', ${COPY.retry})) } : null`);
      checks.ok('named failed state «Нет связи — повторить»', Boolean(failed), failed);
      checks.ok('the text is kept', failed?.kept === true);
      checks.ok('a named retry control', Boolean(failed?.retry), failed?.retry);
      checks.ok('no bot bubble', !(await page.eval('/Тестовый ответ MAYA/.test(Q.text(document.body))')));
      await page.click(`Q.byName('button', ${COPY.retry})`);
      await page.waitFor('/Тестовый ответ MAYA/.test(Q.text(document.body)) ? true : null');
      const chats = await this.chatBodies(page);
      checks.ok('retry sends a byte-identical requestId', chats.length === 2 && chats[0].body.requestId === chats[1].body.requestId, chats.map((c) => c.body?.requestId));
      await this.sendTurn(page, 'Следующий ход');
      await page.waitFor('Q.all("[role=log] *").length > 0 ? true : null');
      await sleep(400);
      const next = (await this.chatBodies(page)).at(-1);
      checks.ok('the next turn carries no notice text', next && !JSON.stringify(next.body.messages).includes('Нет связи'), next?.body?.messages);
    } finally {
      await this.release(page);
    }
    ({ page, signed } = await this.signedInPage('long_reply'));
    try {
      await this.sendTurn(page, 'Дай подробный план');
      const long = loadApiFixture('ai/chat.201.long-reply.json').body.reply;
      checks.ok('7b: the 3 500-char reply is drawn in full', Boolean(await page.waitFor(`Q.text(document.body).includes(${JSON.stringify(long.slice(-60).replace(/\s+/g, ' ').trim())}) ? true : null`)));
      await this.sendTurn(page, 'Дальше');
      await sleep(800);
      const chats = await this.chatBodies(page);
      const next = chats.at(-1);
      checks.ok('7b: next turn history items are ≤ 2000 units', next && next.body.messages.every((m) => m.content.length <= 2000), next?.body?.messages?.map((m) => m.content.length));
      checks.ok('7b: the DTO-enforcing mock answers 201', next?.status === 201, next?.status);
    } finally {
      await this.release(page);
    }
    return { step: '7', title, status: checks.status, checks: checks.items };
  }

  async step8() {
    const title = '429/402/403/503/409 and approval_required (V2-5, SH-06): named states, no role=alert';
    const gate = this.pending('8', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell });
    if (gate) return gate;
    const checks = new Checks();
    // [scenario, sentence, what, the notice kind whose own element must carry the sentence (null: a turn line)]
    const cases = [
      ['chat_429', /повторить можно через \d+ с/, 'countdown', null],
      ['chat_402', COPY.subscriptionRequired, 'the neutral unavailable notice, composer disabled', 'subscription-required'],
      ['chat_403_feature_locked', COPY.featureLocked, 'the neutral feature notice', 'feature-locked'],
      ['chat_503_model_failure', COPY.modelFailure, 'failed turn with retry', null],
      ['chat_409_conflict', /отправьте его ещё раз, это будет новый запрос/, 'no same-id retry, text stays in the composer', null],
    ];
    for (const [scenario, sentence, what, noticeKind] of cases) {
      const { page, signed } = await this.signedInPage(scenario);
      try {
        checks.ok(`${scenario}: signed in`, signed.ok);
        const text = `Проверка ${scenario}`;
        await this.sendTurn(page, text);
        const state = await page.waitFor(`(${sentence}).test(Q.text(document.body)) ? ({ body: Q.text(document.body), alerts: Q.alerts().length, composerDisabled: !!Q.composer()?.disabled || Q.composer()?.getAttribute('aria-disabled') === 'true', composerValue: Q.composer()?.value ?? null, retry: Q.describe(Q.byName('button', ${COPY.retry})), maya: Q.all('.turn--maya', Q.log()).length }) : null`, { timeoutMs: 5000 });
        checks.ok(`${scenario}: ${what} — the sentence is drawn`, Boolean(state), sentence.source);
        if (!state) continue;
        if (noticeKind) {
          // The notice element itself carries the sentence: the failed turn's own line may echo similar words.
          const notice = await page.eval(`(() => { const el = document.querySelector('[role="log"] .notice--${noticeKind} .notice-text'); return el ? { text: Q.text(el), visible: Q.visible(el) } : null; })()`);
          checks.ok(`${scenario}: the ${noticeKind} notice element draws exactly its sentence`, !!notice && notice.visible && sentence.test(notice.text), notice);
        }
        checks.ok(`${scenario}: no MAYA bubble is written for a failure`, state.maya === 0, state.maya);
        if (scenario === 'chat_402') checks.ok('chat_402: composer disabled with a reason', state.composerDisabled);
        if (scenario === 'chat_409_conflict') {
          checks.ok('chat_409: no retry control', !state.retry, state.retry);
          checks.ok('chat_409: text stays in the composer', state.composerValue === text, state.composerValue);
        }
        if (scenario === 'chat_503_model_failure') {
          await page.click(`Q.byName('button', ${COPY.retry})`);
          await page.waitFor('/Тестовый ответ MAYA/.test(Q.text(document.body)) ? true : null');
          const chats = await this.chatBodies(page);
          checks.ok('chat_503: retry on the same requestId', chats.length === 2 && chats[0].body.requestId === chats[1].body.requestId);
        }
        checks.ok(`${scenario}: no role="alert"`, state.alerts === 0, state.alerts);
        checks.ok(`${scenario}: the turn keeps its text on screen`, state.body.includes(text));
      } finally {
        await this.release(page);
      }
    }
    const { page, signed } = await this.signedInPage('approval_required');
    try {
      checks.ok('approval_required: signed in', signed.ok);
      await this.sendTurn(page, 'Запиши меня на стрижку завтра в 12:00');
      const drawn = await page.waitFor(`Q.text(document.body).includes('Действие подготовлено и ждёт вашего подтверждения.') && Q.text(document.body).includes(${JSON.stringify(COPY.approvalNotice)}) ? true : null`);
      checks.ok('approval_required: reply drawn, then the SH-06 notice', Boolean(drawn));
      const notice = await page.eval(`(() => { const el = Q.all('*').filter((e) => Q.text(e) === ${JSON.stringify(COPY.approvalNotice)}).pop(); if (!el) return null; const item = el.closest('li,article,section,div') ?? el; return { controls: Q.all('button,a,input,[role=button],[role=link]', item).length, alertRole: el.closest('[role=alert]') !== null }; })()`);
      checks.ok('approval notice has no control, link or route', notice && notice.controls === 0, notice);
      checks.ok('approval notice is not role="alert"', notice && notice.alertRole === false);
      const ax = await page.send('Accessibility.getFullAXTree');
      const interactive = ax.nodes.filter((n) => ['button', 'link'].includes(n.role?.value)).map((n) => n.name?.value ?? '');
      checks.ok('no approve/reject control in the AX tree', !interactive.some((n) => COPY.approveReject.test(n)), interactive);
      await this.sendTurn(page, 'Спасибо');
      await sleep(900);
      const next = (await this.chatBodies(page)).at(-1);
      const serialized = JSON.stringify(next?.body?.messages ?? []);
      checks.ok('next turn history contains the reply but not the notice', serialized.includes('Действие подготовлено') && !serialized.includes('подтвердить его здесь'), next?.body?.messages);
    } finally {
      await this.release(page);
    }
    return checks.result('8', title);
  }

  async step9() {
    const title = 'refresh_token_reused → signed out with a reason; two parallel 401s produce exactly one /auth/refresh';
    const gate = this.pending('9', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell, voice: this.pre.voice });
    if (gate) return gate;
    const checks = new Checks();
    let { page, signed } = await this.signedInPage('refresh_token_reused');
    try {
      checks.ok('signed in', signed.ok);
      await this.sendTurn(page, 'Проверка сессии');
      const out = await page.waitFor('Q.email() || Q.password() ? Q.text(document.body) : null', { timeoutMs: 6000 });
      checks.ok('back to the signed-out state', Boolean(out));
      checks.ok('with the reason sentence «Сессия завершена ради безопасности — войдите снова.»', Boolean(out) && out.includes('Сессия завершена ради безопасности — войдите снова.'), out?.slice(0, 200));
    } finally {
      await this.release(page);
    }
    // Two authorized requests in flight at once: a spoken clip's /ai/transcribe and a typed /ai/chat, both
    // answered 401 while /auth/refresh is slow — the session must refresh exactly once for both.
    ({ page, signed } = await this.signedInPage('access_rejected_parallel', { voice: true }));
    try {
      checks.ok('parallel: signed in', signed.ok);
      checks.ok('parallel: mic armed', await page.click(`Q.all('.voice button').find((b) => /Сказать голосом/.test(Q.name(b)) && Q.visible(b))`));
      const listening = await page.waitFor(`Q.text(document.querySelector('.voice-state-label')) === ${JSON.stringify(COPY.voiceListening)} ? true : null`, { timeoutMs: 6000 });
      checks.ok('parallel: listening', Boolean(listening));
      await sleep(700);
      await page.click(`Q.all('.voice button').find((b) => ${COPY.voiceSend}.test(Q.name(b)) && Q.visible(b))`);
      await page.waitFor(`window.performance.getEntriesByType('resource').some((e) => e.name.endsWith('/api/ai/transcribe')) ? true : null`, { timeoutMs: 4000, intervalMs: 10 });
      await this.sendTurn(page, 'Параллельный запрос');
      await page.waitFor(`/${MOCK_TRANSCRIPT.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/.test(Q.text(Q.log())) && Q.all('.turn--maya', Q.log()).length >= 1 ? true : null`, { timeoutMs: 15_000 });
      await sleep(500);
      const refreshes = page.apiRequests('/auth/refresh');
      const rejected = [...page.apiRequests('/ai/chat'), ...page.apiRequests('/ai/transcribe')].filter((r) => r.status === 401);
      const refreshDone = refreshes[0]?.finishedAt ?? null;
      const overlapping = refreshDone !== null && rejected.length >= 2 && new Set(rejected.map((r) => new URL(r.url).pathname)).size === 2 && rejected.every((r) => r.startedAt < refreshDone);
      checks.ok('parallel: a 401 on /ai/transcribe and a 401 on /ai/chat, both before the refresh completed', overlapping, { rejected: rejected.map((r) => ({ path: new URL(r.url).pathname, startedAt: r.startedAt })), refreshDone });
      checks.ok('parallel: exactly one /auth/refresh', refreshes.length === 1, refreshes.length);
      const retried = [...page.apiRequests('/ai/chat'), ...page.apiRequests('/ai/transcribe')].filter((r) => r.status === 201 || r.status === 200);
      checks.ok('parallel: both requests succeed after the one refresh', new Set(retried.map((r) => new URL(r.url).pathname)).size === 2, retried.map((r) => [new URL(r.url).pathname, r.status]));
    } finally {
      await this.release(page);
    }
    return checks.result('9', title);
  }

  async step10() {
    const title = 'Widget fixtures in the fixture host: reading order, names, token-free DOM, verdicts, tampered/expired/superseded, per-kind floor, A-17, focus, live regions (D1, D7)';
    const gate = this.pending('10', title, { fixtureHost: this.pre.fixtureHost, integrity: this.pre.integrity, shell: this.pre.shell, dom: this.pre.dom });
    if (gate) return gate;
    const checks = new Checks();
    const index = JSON.parse(fs.readFileSync(path.join(SH, 'dev', 'fixtures', 'envelopes', 'index.json'), 'utf8'));
    const out = {};
    let page = await this.hostPage();
    try {
      const verified = await page.eval('globalThis.__fixtureHost.verifyAll()');
      out.verdicts = verified.results?.map((r) => ({ name: r.name, verdict: r.verdict }));
      const wrong = (verified.results ?? []).filter((r) => r.meta && r.verdict !== r.meta.expect.verdict && r.meta.group === 'invariant');
      checks.ok('emitted h7.verify in Chrome gives the expected verdict for every invariant fixture', verified.status === 'OK' && wrong.length === 0, wrong);
    } finally {
      await this.release(page);
    }

    page = await this.hostPage();
    try {
      const r = await page.eval('globalThis.__fixtureHost.renderAll(null, { activate: false })');
      if (r.status === PENDING) return { step: '10', title, status: PENDING, reason: `fixture host: ${r.missing.join('; ')}` };
      out.render = { rendered: r.rendered, added: r.added, ingest: r.ingest, orderMismatches: r.orderMismatches, nameMismatches: r.nameMismatches, alerts: r.alerts };
      out.items = r.items;
      checks.ok('every fixture was ingested and drawn or deduplicated (P-25)', r.rendered === index.fixtures.length && r.ingest.every((i) => ['added', 'replaced', 'duplicate'].includes(i.ingested)), r.ingest.filter((i) => !['added', 'replaced', 'duplicate'].includes(i.ingested)));
      checks.ok('DOM order of interactive elements == reading order, for every drawn item', r.orderMismatches.length === 0 && r.items.length > 0, r.orderMismatches);
      checks.ok('every drawn control is named byte-equal to its sealed accessible name', r.nameMismatches.length === 0, r.nameMismatches.slice(0, 5));
      checks.ok('no role="alert" anywhere', r.alerts === 0, r.alerts);
      const dom = await page.eval('document.documentElement.outerHTML');
      const secrets = index.fixtures.flatMap((f) => [...f.secrets.intent_tokens, ...f.secrets.class_i_refs, ...f.secrets.receipt_pointers, f.secrets.envelope_seal, f.secrets.principal_proof_hash, f.secrets.tenant_id]);
      checks.ok('serialized DOM contains 0 token, class-i ref, pointer, seal, proof or tenant bytes', secrets.every((s) => !dom.includes(s)), secrets.filter((s) => dom.includes(s)).slice(0, 5));

      const byFixture = new Map(r.items.map((i) => [i.fixture, i]));
      const kinds = new Set(r.items.map((i) => i.kind));
      checks.ok('all 22 kinds are drawn', kinds.size === 22, [...kinds].sort());
      const modeWrong = r.items.filter((i) => i.expect?.mode && i.mode !== i.expect.mode).map((i) => ({ fixture: i.fixture, mode: i.mode, want: i.expect.mode }));
      checks.ok('every drawn item takes the mode its fixture names (structured / prose / frozen_prose)', modeWrong.length === 0, modeWrong);
      const liveWrong = r.items.filter((i) => i.liveRegionAttr !== (i.sealedLiveRegion === 'off' ? null : i.sealedLiveRegion)).map((i) => ({ fixture: i.fixture, attr: i.liveRegionAttr, sealed: i.sealedLiveRegion }));
      checks.ok('each item’s live region is the sealed live_region (off → none)', liveWrong.length === 0, liveWrong);
      const blocking = byFixture.get('h7/invariant/kind-limitation-blocking.json');
      const nonBlocking = byFixture.get('h7/invariant/limitation-non-blocking.json');
      checks.ok('LIMITATION blocking → aria-live="assertive"', blocking?.liveRegionAttr === 'assertive' && blocking.limitationSeverity === 'blocking', blocking && { attr: blocking.liveRegionAttr, severity: blocking.limitationSeverity });
      checks.ok('LIMITATION non-blocking → aria-live="polite"', nonBlocking?.liveRegionAttr === 'polite' && nonBlocking.limitationSeverity !== 'blocking', nonBlocking && { attr: nonBlocking.liveRegionAttr, severity: nonBlocking.limitationSeverity });
      const tampered = r.items.filter((i) => i.expect?.verdict === 'body_mismatch');
      checks.ok('tampered fixtures are drawn (at least 3)', tampered.length >= 3, tampered.map((i) => i.fixture));
      checks.ok('tampered → frozen prose plus at most the server REFINE, no error role', tampered.every((i) => i.mode === 'frozen_prose' && i.buttonEffects.every((e) => e === 'REFINE') && i.alerts === 0), tampered.map((i) => ({ fixture: i.fixture, mode: i.mode, effects: i.buttonEffects, alerts: i.alerts })));
      const expired = byFixture.get('h7/invariant/booking-expired.json');
      const quiet = expired && { collapse_to_summary: 'collapsed', re_resolve: 'collapsed', mark_stale: 'stale' }[expired.onExpiry];
      checks.ok('expired → follows on_expiry quietly (display, no alert; re_resolve adds the neutral sentence)', !!expired && expired.display === quiet && expired.alerts === 0 && (expired.onExpiry !== 're_resolve' || expired.sentence === 'Карточка устарела — показана сводка'), expired && { onExpiry: expired.onExpiry, display: expired.display, sentence: expired.sentence, alerts: expired.alerts });
      const tableOk = (t) => t.caption !== '' && t.colHeaders >= 1 && t.activatableRows === 0;
      const clientList = byFixture.get('h7/invariant/kind-client-list.json');
      checks.ok('A-17 CLIENT_LIST.table: caption, column headers, row headers, in-row buttons, no activatable row', !!clientList && clientList.tables.length >= 1 && clientList.tables.every(tableOk) && clientList.tables.some((t) => t.rowHeaders >= 1), clientList?.tables);
      const report = byFixture.get('h7/invariant/kind-report.json');
      checks.ok('A-17 REPORT section tables: caption and column headers, no activatable row', !!report && report.tables.length >= 1 && report.tables.every(tableOk), report?.tables);
      const chart = byFixture.get('h7/divergent/kind-chart.json') ?? r.items.find((i) => i.kind === 'CHART');
      checks.ok('A-17 CHART.table_equivalent drawn in full in the prose branch', !!chart && chart.mode === 'prose' && chart.tables.length >= 1 && chart.tables.every(tableOk), chart && { mode: chart.mode, tables: chart.tables });
      checks.notExercised('SCHEDULE lane/time header grid', 'the P1 renderer draws SCHEDULE lanes as labelled groups with in-lane entry controls (not a table); its row is asserted on the DOM double (dom.test) — no CDP grid assertion');
    } finally {
      await this.release(page);
    }

    page = await this.hostPage();
    try {
      const kindFixtures = index.fixtures.filter((f) => f.category === 'kind').map((f) => f.file);
      const probe = await page.eval(`globalThis.__fixtureHost.focusProbe(${JSON.stringify(kindFixtures)})`);
      out.focus = probe.probes;
      const byKind = new Map((probe.probes ?? []).map((p) => [p.kind, p]));
      for (const kind of ['BOOKING_CONFIRMATION', 'CONSENT_STATE', 'PAYMENT_HANDOFF']) {
        const p = byKind.get(kind);
        checks.ok(`${kind}: focus moves to the item's heading`, !!p && p.focusRule === 'heading' && p.onHeading, p);
      }
      const form = byKind.get('FORM');
      if (form?.focusRule === 'first_refused_field') checks.ok('FORM refusal: focus on the first refused field', form.onFirstRefused, form);
      else checks.notExercised('FORM: focus on the first refused field', `the kind-form fixture carries no refused field (focus rule ${form?.focusRule}); covered on the DOM double (dom.test per-kind focus)`);
      const others = (probe.probes ?? []).filter((p) => p.kind && !['BOOKING_CONFIRMATION', 'CONSENT_STATE', 'PAYMENT_HANDOFF', 'FORM'].includes(p.kind));
      checks.ok('every other kind leaves focus in the composer', others.length >= 18 && others.every((p) => p.composerParked && p.stayedInComposer && !p.insideItem), others.filter((p) => !p.stayedInComposer).map((p) => ({ kind: p.kind, active: p.active })));
    } finally {
      await this.release(page);
    }

    page = await this.hostPage();
    try {
      const s = await page.eval('globalThis.__fixtureHost.supersede()');
      out.supersede = s;
      checks.ok('superseded → replaced in place: same item, same element, same index, one item fewer never', s.sameItem && s.sameElement && s.sameIndex && s.itemCountUnchanged && s.contentChanged && s.alerts === 0, s);
    } finally {
      await this.release(page);
    }

    page = await this.hostPage();
    try {
      const a = await page.eval('globalThis.__fixtureHost.announceProbe()', { awaitPromise: true });
      out.announce = a;
      checks.ok('PROGRESS announces politely, and a second announcement waits ≥ 5 s after the first', a.writes.length >= 2 && a.writes.every((w) => w.ariaLive === 'polite') && a.gaps.every((g) => g >= 4990) && a.alerts === 0, a);
    } finally {
      await this.release(page);
    }
    return checks.result('10', title, { evidence: out });
  }

  async step10b() {
    const title = 'H7 browser parity under Emulation.setLocaleOverride with the resolved-locale assertion (D11, V2-2)';
    const gate = this.pending('10b', title, { h7Parity: this.pre.h7Parity, integrity: this.pre.integrity });
    if (gate) return gate;
    const checks = new Checks();
    const runs = [];
    const page = await this.page();
    try {
      for (const locale of ['ru-RU', 'en-US', 'et-EE', 'lt-LT']) {
        await page.send('Emulation.setLocaleOverride', {});
        await page.send('Emulation.setLocaleOverride', { locale });
        await page.goto(`${this.origin}/__dev/h7-parity.html?module=/${this.pre.modulePath}src/integrity/h7.js`);
        const state = await page.waitFor('document.documentElement.dataset.h7 ? document.documentElement.dataset.h7 : null', { timeoutMs: 20_000 });
        const result = await page.eval('globalThis.__H7_PARITY__ ?? null');
        if (!result || state !== 'done') {
          checks.ok(`${locale}: parity page finished`, false, result?.error ?? state);
          continue;
        }
        const applied = checks.ok(`${locale}: locale applied (Intl.Collator resolved ${result.locale})`, result.locale === locale && result.results.every((r) => r.locale === locale), result.locale);
        if (!applied) continue;
        const invariantBad = result.results.filter((r) => r.group === 'invariant' && (!r.equal || !r.verdict_ok));
        checks.ok(`${locale}: every invariant fixture equals the reference`, invariantBad.length === 0, invariantBad.map((r) => r.id));
        if (locale === 'en-US') {
          const divergentBad = result.results.filter((r) => r.group === 'divergent' && (!r.equal || !r.verdict_ok));
          checks.ok('en-US: every divergent fixture equals the reference', divergentBad.length === 0, divergentBad.map((r) => r.id));
        }
        runs.push({ locale, probe: result.probe, summary: result.summary, divergentRecorded: locale === 'en-US' ? [] : result.summary.divergent_differs });
      }
      await page.send('Emulation.setLocaleOverride', {});
    } finally {
      await this.release(page);
    }
    return { step: '10b', title, status: checks.status, checks: checks.items, runs, note: 'Divergent fixtures outside en-US are recorded as R7-E6 evidence and do not fail the step.' };
  }

  async step11() {
    const title = 'Escape and silent outcomes: NONE escape keyboard-reachable, 0 requests, collapses; typed «отмена» reaches /ai/chat; every activation ends in one outcome (D2, D9)';
    const gate = this.pending('11', title, { fixtureHost: this.pre.fixtureHost, shell: this.pre.shell, dom: this.pre.dom, entry: this.pre.entry });
    if (gate) return gate;
    const checks = new Checks();
    const out = {};
    const { page, signed } = await this.signedInPage('chat_with_envelopes');
    try {
      checks.ok('signed in', signed.ok);
      await this.sendTurn(page, 'отмена');
      await page.waitFor('/конвертами виджетов/.test(Q.text(document.body)) ? true : null');
      const chats = await this.chatBodies(page);
      checks.ok('typed «отмена» is recorded as reaching /ai/chat (known gap B5/R10)', chats.some((c) => c.body.messages.at(-1).content === 'отмена'));
      const index = JSON.parse(fs.readFileSync(path.join(SH, 'dev', 'fixtures', 'envelopes', 'index.json'), 'utf8'));
      const dom = await page.eval('document.documentElement.outerHTML');
      const tokens = index.fixtures.flatMap((f) => f.secrets.intent_tokens);
      checks.ok('envelopes on /ai/chat are not drawn in P1 (no token byte in the DOM)', tokens.every((t) => !dom.includes(t)));
    } finally {
      await this.release(page);
    }

    for (const name of ['h7/invariant/kind-choice.json', 'h7/invariant/kind-booking-confirmation.json']) {
      const host = await this.hostPage();
      try {
        const probe = await host.eval(`globalThis.__fixtureHost.escapeProbe(${JSON.stringify(name)})`);
        if (probe.status === PENDING) return { step: '11', title, status: PENDING, reason: `fixture host: ${probe.missing.join('; ')}` };
        checks.ok(`${name}: a NONE escape is drawn`, typeof probe.escapeRef === 'string', probe);
        if (typeof probe.escapeRef !== 'string') continue;
        const reach = [];
        for (const start of probe.tabbable) {
          const focusStart = `(() => { const el = document.querySelector('[role="log"] [data-ref="' + CSS.escape(${JSON.stringify(start)}) + '"]'); el.focus(); return document.activeElement === el; })()`;
          let reached = start === probe.escapeRef;
          for (const shift of [false, true]) {
            if (reached) break;
            await host.eval(focusStart);
            for (let i = 0; i <= probe.tabbable.length + 1 && !reached; i += 1) {
              await host.press('Tab', { shift });
              reached = (await host.eval('document.activeElement && document.activeElement.getAttribute("data-ref")')) === probe.escapeRef;
            }
          }
          reach.push({ start, reached });
        }
        checks.ok(`${name}: the escape is keyboard-reachable from every drawn position`, reach.length > 0 && reach.every((x) => x.reached), reach);
        const before = host.requests.size;
        await host.eval(`document.querySelector('[role="log"] [data-ref="' + CSS.escape(${JSON.stringify(probe.escapeRef)}) + '"]').focus()`);
        await host.press('Enter');
        const result = await host.eval('globalThis.__fixtureHost.escapeResult()');
        out[name] = { probe, reach, result };
        checks.ok(`${name}: activating the escape by keyboard makes 0 requests`, host.requests.size === before, [...host.requests.values()].slice(before).map((r) => r.url));
        checks.ok(`${name}: the item collapses to its headline, no control left`, result.collapsed && result.controlsLeft === 0 && result.display === 'collapsed', result);
        checks.ok(`${name}: focus moves to the collapsed headline`, result.focusOnHeadline, result.active);
        checks.ok(`${name}: one state change, no submission`, result.delta.activations === 1 && result.delta.stateChanges === 1 && result.delta.sentences === 0 && result.delta.submissions === 0, result.delta);
      } finally {
        await this.release(host);
      }
    }

    const host = await this.hostPage();
    try {
      const r = await host.eval('globalThis.__fixtureHost.renderAll()');
      if (r.status === PENDING) return { step: '11', title, status: PENDING, reason: `fixture host: ${r.missing.join('; ')}` };
      out.activations = { clicks: r.clicks, counters: r.counters, silent: r.silent, byEffect: r.activations.reduce((m, a) => ((m[a.effect ?? 'none'] = (m[a.effect ?? 'none'] ?? 0) + 1), m), {}) };
      checks.ok('activations were exercised on every drawn button (at least 60)', r.clicks >= 60, r.clicks);
      checks.ok('silent outcomes = 0: every activation moved the counters by exactly one outcome AND redrew its item into a sentence or a collapsed state', r.silent.length === 0, r.silent.slice(0, 5));
      checks.ok('the runtime counts one activation per click', r.counters.activations === r.clicks, { clicks: r.clicks, counters: r.counters });
      checks.ok('activations == state changes + sentences (equality, not ≤)', r.countersBalanced, r.counters);
      checks.ok('every sentence drawn is one of the known neutral sentences', r.activations.every((a) => a.collapsed || COPY.widgetSentences.includes(a.sentence)), [...new Set(r.activations.map((a) => a.sentence))]);
      checks.ok('no dialog left open, no role="alert", href unchanged', r.activations.every((a) => a.dialogsOpen === 0 && a.hrefUnchanged) && r.alerts === 0);
      checks.ok('the fixture host sent no /api request while activating', [...host.requests.values()].every((q) => !new URL(q.url).pathname.startsWith('/api/')));
    } finally {
      await this.release(host);
    }
    return checks.result('11', title, { evidence: out });
  }

  async step12() {
    const title = 'Fullscreen and deep links (D3): refused fs.* with its sentence and 0 requests, base route switch, w handle sentence; NAVIGATE(detail) PROGRESS → close → sentence; presentDetail dialog, Tab cycle, replace, Esc, Back';
    const gate = this.pending('12', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell, fullscreen: this.pre.fullscreen });
    if (gate) return gate;
    const checks = new Checks();
    const out = {};
    const privacyLabel = (await registryLabels(this.options.root, this.pre.modulePath))?.[3] ?? null;
    const cases = [
      ['#r=fs.booking&h=abcdefgh', 'refused', COPY.deeplinkRefused],
      ['#r=shell.privacy', 'route', null],
      ['#r=w&h=abcdefgh12', 'unavailable', COPY.deeplinkUnavailable],
    ];
    for (const [fragment, expect, sentence] of cases) {
      const { page, signed } = await this.signedInPage();
      try {
        checks.ok(`${fragment}: signed in`, signed.ok);
        const before = page.requests.size;
        const href = await page.eval('location.href');
        await page.eval(`(location.hash = ${JSON.stringify(fragment)}, true)`);
        await page.reload();
        await this.signInPassword(page);
        await sleep(800);
        const state = await page.eval('({ dialogs: Q.dialogs().length, body: Q.text(document.body), current: Q.all("[aria-current]").map(Q.name), href: location.href, alerts: Q.alerts().length })');
        const apiAfter = [...page.requests.values()].slice(before).filter((r) => /\/api\/(?!auth\/)/.test(r.url));
        checks.ok(`${fragment}: 0 requests besides sign-in`, apiAfter.length === 0, apiAfter.map((r) => r.url));
        checks.ok(`${fragment}: no dialog`, state.dialogs === 0);
        checks.ok(`${fragment}: no role="alert"`, state.alerts === 0);
        if (sentence) {
          const kind = expect === 'refused' ? 'deeplink-refused' : 'deeplink-unavailable';
          const notice = await page.eval(`(() => { const el = document.querySelector('[role="log"] .notice--${kind} .notice-text'); return el ? { text: Q.text(el), visible: Q.visible(el) } : null; })()`);
          checks.ok(`${fragment}: the ${kind} notice draws exactly its sentence`, !!notice && notice.visible && sentence.test(notice.text) && sentence.test(state.body), notice);
        }
        if (expect === 'route') checks.ok(`${fragment}: route switch (aria-current names «${privacyLabel}»)`, privacyLabel !== null && state.current.includes(privacyLabel), state.current);
        checks.ok(`${fragment}: href unchanged by the shell beyond the fragment`, state.href.startsWith(href.split('#')[0]), state.href);
      } finally {
        await this.release(page);
      }
    }
    checks.notExercised('#r=w: the PROGRESS phase before the sentence', 'P1 has no resolve (B3), so the landing goes straight to the deeplink_unavailable sentence with 0 requests (shell/deeplink.ts); only the sentence is observable');

    let host = await this.hostPage();
    try {
      const nav = await host.eval('globalThis.__fixtureHost.navigateDetail("h7/invariant/kind-report.json")');
      if (nav.status === PENDING) return { step: '12', title, status: PENDING, reason: `fixture host: ${nav.missing.join('; ')}` };
      out.navigateDetail = nav;
      checks.ok('NAVIGATE(detail): the shell goes to PROGRESS and back to none', nav.progressSeen && nav.phases.at(-1) === 'none', nav.phases);
      checks.ok('NAVIGATE(detail): the dialog opened and closed', nav.dialogOpened && nav.dialogClosed && nav.dialogsOpen === 0, nav);
      checks.ok('NAVIGATE(detail): focus returns to the opener control', nav.focusOnOpener, nav.active);
      checks.ok('NAVIGATE(detail): the opener item carries the neutral sentence', COPY.widgetSentences.includes(nav.sentence), nav.sentence);
      checks.ok('NAVIGATE(detail): href unchanged, no role="alert", 0 /api requests', nav.hrefUnchanged && nav.alerts === 0 && [...host.requests.values()].every((q) => !new URL(q.url).pathname.startsWith('/api/')));
    } finally {
      await this.release(host);
    }

    host = await this.hostPage();
    try {
      const first = await host.eval('globalThis.__fixtureHost.present("h7/invariant/kind-booking-confirmation.json")');
      if (first.status === PENDING) return { step: '12', title, status: PENDING, reason: `fixture host presentDetail: ${first.missing.join('; ')}` };
      out.present = first;
      checks.ok('presentDetail: exactly one aria-modal dialog, focus inside, href unchanged', first.status === 'OK' && first.dialogs === 1 && first.modal === 'true' && first.focusInside && first.hrefUnchanged, first);
      const cycle = [];
      for (const shift of [false, true]) {
        for (let i = 0; i < 12; i += 1) {
          await host.press('Tab', { shift });
          cycle.push({ shift, ...(await host.eval('globalThis.__fixtureHost.dialogState()')) });
        }
      }
      const stops = new Set(cycle.filter((c) => !c.shift).map((c) => JSON.stringify(c.active)));
      checks.ok('Tab and Shift+Tab stay inside the dialog and cycle', cycle.every((c) => c.dialogs === 1 && c.focusInside) && stops.size >= 2 && stops.size < 12, { stops: stops.size, outside: cycle.filter((c) => !c.focusInside).slice(0, 3) });
      const second = await host.eval('globalThis.__fixtureHost.present("h7/invariant/kind-report.json", { openerName: null })');
      checks.ok('a second presentDetail replaces the first: still exactly one dialog, new content', second.dialogs === 1 && second.title !== first.title && second.hrefUnchanged, { first: first.title, second: second.title, dialogs: second.dialogs });
      await host.press('Escape');
      await sleep(200);
      const afterEsc = await host.eval('globalThis.__fixtureHost.dialogState()');
      checks.ok('Esc closes it and focus returns to the opener control', afterEsc.dialogs === 0 && afterEsc.active?.ref === first.opener.ref, afterEsc);
      const third = await host.eval('globalThis.__fixtureHost.present("h7/invariant/kind-booking-confirmation.json")');
      checks.ok('presentDetail again: one dialog', third.dialogs === 1, third);
      await host.eval('(history.back(), true)');
      await sleep(400);
      const afterBack = await host.eval('globalThis.__fixtureHost.dialogState()');
      checks.ok('Back closes it and focus returns to the opener control', afterBack.dialogs === 0 && afterBack.active?.ref === third.opener.ref, afterBack);
      checks.ok('location.href is unchanged throughout (no address for a detail)', afterBack.href === afterBack.hrefAtStart && cycle.every((c) => c.href === c.hrefAtStart), { href: afterBack.href, start: afterBack.hrefAtStart });
      checks.ok('the fixture host sent no /api request', [...host.requests.values()].every((q) => !new URL(q.url).pathname.startsWith('/api/')));
    } finally {
      await this.release(host);
    }
    return checks.result('12', title, { evidence: out });
  }

  async step13() {
    const title = 'Reduced motion and forced colours: reply complete on the first frame; focus ring ≥ 3:1';
    const gate = this.pending('13', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell });
    if (gate) return gate;
    const checks = new Checks();
    const { page, signed } = await this.signedInPage();
    try {
      checks.ok('signed in', signed.ok);
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await this.sendTurn(page, 'Короткий ответ');
      const frame = await page.waitFor(`(() => { const log = Q.log(); if (!log || !/Тестовый ответ MAYA/.test(Q.text(log))) return null; const els = Q.all('*', log); return { animated: els.filter((e) => { const s = getComputedStyle(e); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0 || parseFloat(s.transitionDuration) > 0; }).length }; })()`, { intervalMs: 16 });
      checks.ok('reply present with no running animation or transition under reduced motion', frame && frame.animated === 0, frame);
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });
      await page.focus('Q.composer()');
      const contrast = await page.eval(`(() => { const el = document.activeElement; const s = getComputedStyle(el); const rgb = (c) => (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number); const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }; let bgEl = el; let bg = 'rgba(0, 0, 0, 0)'; while (bgEl && /rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) { bg = getComputedStyle(bgEl).backgroundColor; bgEl = bgEl.parentElement; } const a = lum(rgb(s.outlineColor)); const b = lum(rgb(bg)); return { outline: s.outlineColor, outlineStyle: s.outlineStyle, background: bg, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }; })()`);
      checks.ok('focus ring contrast ≥ 3:1', contrast.outlineStyle !== 'none' && contrast.ratio >= 3, contrast);
      await page.send('Emulation.setEmulatedMedia', { features: [] });
    } finally {
      await this.release(page);
    }
    return checks.result('13', title, { note: 'Listening ≠ recording (glyph and label) is asserted in step 15, on the states the voice control actually drew.' });
  }

  async step14() {
    const title = 'Reflow: 320 CSS px at text scale 2.0, a 200-char unbroken token, coarse targets ≥ 44×44';
    const gate = this.pending('14', title, { entry: this.pre.entry, dom: this.pre.dom, shell: this.pre.shell });
    if (gate) return gate;
    const checks = new Checks();
    const { page, signed } = await this.signedInPage('unbroken_token');
    try {
      checks.ok('signed in', signed.ok);
      await page.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await page.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
      await this.sendTurn(page, 'Дай код');
      await page.waitFor('/Z{200}/.test(Q.text(document.body)) ? true : null');
      const scroll = await page.eval('({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, coarse: matchMedia("(pointer: coarse)").matches })');
      checks.ok('no horizontal page scroll', scroll.scrollWidth <= scroll.clientWidth, scroll);
      const small = await page.eval('Q.all("button,textarea,input,a").filter(Q.visible).map((el) => ({ ...Q.describe(el), ...Q.rect(el) })).filter((r) => r.w < 44 || r.h < 44)');
      checks.ok('coarse-pointer targets ≥ 44×44', scroll.coarse && small.length === 0, { coarse: scroll.coarse, small });
    } finally {
      await this.release(page);
    }
    return { step: '14', title, status: checks.status, checks: checks.items };
  }

  async step15() {
    const title = 'Voice (D-6 capture shim): no getUserMedia before a gesture; listening ≠ recording; WAV PCM16 mono 16 kHz; the spoken /ai/chat body equals typing the transcript; cancel; denied';
    const gate = this.pending('15', title, { entry: this.pre.entry, dom: this.pre.dom, voice: this.pre.voice });
    if (gate) return gate;
    const checks = new Checks();
    const out = { deviation: 'D-6 (S6): getUserMedia answered by a WebAudio oscillator shim; Chrome fake capture hangs on this Mac' };
    const micButton = 'Q.all(".voice button").find((b) => /Сказать голосом/.test(Q.name(b)) && Q.visible(b))';
    const voiceButton = (re) => `Q.all(".voice button").find((b) => ${re}.test(Q.name(b)) && Q.visible(b))`;
    const stateLabel = 'Q.text(document.querySelector(".voice-state-label"))';
    let spoken = null;
    let { page, signed } = await this.signedInPage('happy', { voice: true });
    try {
      checks.ok('signed in', signed.ok);
      checks.ok('no getUserMedia before a click', (await page.eval('window.__cdpGum.calls')) === 0);
      checks.ok('mic button', await page.click(micButton));
      const listening = await page.waitFor(`${stateLabel} === ${JSON.stringify(COPY.voiceListening)} ? { calls: window.__cdpGum.calls, tracks: window.__cdpGum.tracks.length, live: window.__cdpGum.tracks.filter((t) => t.readyState === 'live').length } : null`, { timeoutMs: 8000 });
      checks.ok('the voice control shows «Слушаю» after the gesture, with one live capture track', !!listening && listening.calls === 1 && listening.tracks > 0 && listening.live > 0, listening);
      await sleep(900);
      checks.ok('«Отправить запись» (the voice control, not the composer) is clicked', await page.click(voiceButton(COPY.voiceSend)));
      await page.waitFor(`Q.text(Q.log()).includes(${JSON.stringify(MOCK_TRANSCRIPT)}) ? true : null`, { timeoutMs: 10_000 });
      const transcribe = page.apiRequests('/ai/transcribe')[0];
      const body = transcribe ? JSON.parse((await page.postData(transcribe)) ?? '{}') : {};
      checks.ok('transcribe body is JSON {audioBase64} with a data:audio/wav;base64, prefix', JSON.stringify(Object.keys(body)) === '["audioBase64"]' && /^data:audio\/wav;base64,/.test(body.audioBase64 ?? ''), Object.keys(body));
      const wav = Buffer.from((body.audioBase64 ?? '').split(',')[1] ?? '', 'base64');
      const header = wav.length > 44 ? { riff: wav.toString('ascii', 0, 4), wave: wav.toString('ascii', 8, 12), format: wav.readUInt16LE(20), channels: wav.readUInt16LE(22), rate: wav.readUInt32LE(24), bits: wav.readUInt16LE(34), bytes: wav.length } : null;
      out.wav = header;
      checks.ok('WAV header: RIFF/WAVE, PCM, mono, 16 kHz, 16-bit, non-empty', !!header && header.riff === 'RIFF' && header.wave === 'WAVE' && header.format === 1 && header.channels === 1 && header.rate === 16000 && header.bits === 16, header);
      await page.waitFor('Q.all(".turn--maya", Q.log()).length >= 1 ? true : null', { timeoutMs: 8000 });
      spoken = (await this.chatBodies(page)).at(-1)?.body ?? null;
      const states = await page.eval('window.__voiceStates');
      out.voiceStates = states;
      const listen = states.find((s) => s.label === COPY.voiceListening);
      const record = states.find((s) => s.label === COPY.voiceRecording);
      checks.ok('listening and recording were both drawn, with different glyphs and labels (V8/A-9)', !!listen && !!record && listen.glyph !== record.glyph && listen.label !== record.label && listen.glyph !== '' && record.glyph !== '', states);
      checks.ok('the spoken turn carries the transcript verbatim', spoken?.messages?.at(-1)?.content === MOCK_TRANSCRIPT, spoken?.messages?.at(-1));
      checks.ok('the spoken turn is shown with the «голосом» glyph', await page.eval('Q.all(".turn-voice", Q.log()).some((g) => g.getAttribute("aria-label") === "голосом")'));
      const tracksBefore = await page.eval('window.__cdpGum.tracks.length');
      await page.click(micButton);
      const second = await page.waitFor(`${stateLabel} === ${JSON.stringify(COPY.voiceListening)} && window.__cdpGum.tracks.length > ${tracksBefore} ? window.__cdpGum.tracks.length : null`, { timeoutMs: 8000 });
      checks.ok('a second capture is listening with a new track', second !== null, second);
      const beforeCancel = page.requests.size;
      checks.ok('«Отмена записи» is clicked', await page.click(voiceButton(COPY.voiceCancel)));
      await sleep(600);
      checks.ok('cancel makes 0 requests', [...page.requests.values()].slice(beforeCancel).length === 0, [...page.requests.values()].slice(beforeCancel).map((r) => r.url));
      const tracks = await page.eval('window.__cdpGum.tracks.map((t) => t.readyState)');
      checks.ok('every capture track (non-empty list) is ended after cancel', tracks.length >= 2 && tracks.every((s) => s === 'ended'), tracks);
      checks.ok('the voice control is back to the mic', await page.eval(`!!(${micButton})`));
    } finally {
      await this.release(page);
    }
    ({ page, signed } = await this.signedInPage('happy'));
    try {
      await this.sendTurn(page, MOCK_TRANSCRIPT);
      await page.waitFor('Q.all(".turn--maya", Q.log()).length >= 1 ? true : null', { timeoutMs: 8000 });
      const typed = (await this.chatBodies(page)).at(-1)?.body ?? null;
      const norm = (b) => (b ? JSON.stringify({ ...b, requestId: '<requestId>' }) : null);
      out.bodies = { spoken: norm(spoken), typed: norm(typed) };
      checks.ok('the spoken /ai/chat body is byte-identical to typing the transcript (requestId aside)', norm(spoken) !== null && norm(spoken) === norm(typed), out.bodies);
    } finally {
      await this.release(page);
    }
    const denied = await this.page();
    try {
      await denied.send('Page.addScriptToEvaluateOnNewDocument', { source: voiceShim({ deny: true }) });
      await this.scenario('happy');
      await denied.goto(this.options.url);
      await this.signInPassword(denied);
      await denied.click(micButton);
      const cell = await denied.waitFor(`${COPY.voiceUnavailable}.test(Q.text(document.body)) ? { calls: window.__cdpGum.calls, composerFirst: (() => { const all = Q.all('textarea,button').filter(Q.visible); return all.indexOf(Q.composer()) === 0; })(), alerts: Q.alerts().length } : null`);
      checks.ok('denied permission shows the V11 Cell', Boolean(cell), cell);
      checks.ok('the composer is still first, no role="alert"', cell?.composerFirst === true && cell.alerts === 0, cell);
      checks.ok('denied after exactly one getUserMedia (inside the gesture)', cell?.calls === 1, cell?.calls);
    } finally {
      await this.release(denied);
    }
    return checks.result('15', title, { evidence: out });
  }

  async step16() {
    const title = 'Hostile inputs: ?booking_tenant=&tips= change nothing; a javascript: link renders no anchor';
    const gate = this.pending('16', title, { entry: this.pre.entry, dom: this.pre.dom });
    if (gate) return gate;
    const checks = new Checks();
    await this.scenario('happy');
    const plain = await this.page();
    const hostile = await this.page();
    try {
      await plain.goto(this.options.url);
      await hostile.goto(`${this.options.url}?booking_tenant=x&tips=123`);
      await sleep(800);
      const a = await plain.eval('Q.text(document.body)');
      const b = await hostile.eval('Q.text(document.body)');
      checks.ok('the query changes nothing on screen', a === b);
      const bodies = [...hostile.requests.values()].filter((r) => r.url.includes('booking_tenant') && !r.url.startsWith(this.options.url));
      checks.ok('no request carries the query', bodies.length === 0);
    } finally {
      await this.release(plain);
      await this.release(hostile);
    }
    const { page, signed } = await this.signedInPage('reply_links');
    try {
      checks.ok('signed in', signed.ok);
      await this.sendTurn(page, 'Ссылки');
      await page.waitFor('/javascript:alert/.test(Q.text(document.body)) ? true : null');
      const anchors = await page.eval('Q.all("a[href]", Q.log() ?? document.body).map((a) => ({ href: a.getAttribute("href"), rel: a.getAttribute("rel") }))');
      checks.ok('only https:, tel: and mailto: anchors', anchors.every((x) => /^(https:|tel:|mailto:)/.test(x.href)), anchors);
      checks.ok('no javascript: or data: anchor', !anchors.some((x) => /^(javascript|data):/i.test(x.href)));
      checks.ok('rel="noopener noreferrer"', anchors.every((x) => /noopener/.test(x.rel ?? '') && /noreferrer/.test(x.rel ?? '')), anchors);
    } finally {
      await this.release(page);
    }
    return { step: '16', title, status: checks.status, checks: checks.items };
  }

  async step17() {
    const title = 'Local-API mode against real NestJS on :55611: steps 2–6, sign-in failures producible locally, approval attempt; 0 requests off 127.0.0.1; binary provenance';
    if (!this.options['api-url'] || !this.options.fixture) return { step: '17', title, status: NOT_EXERCISED, reason: 'no --api-url and --fixture given' };
    const apiUrl = this.options['api-url'];
    const apiOrigin = new URL(apiUrl).origin;
    const index = await fetch(apiUrl).then((r) => r.status).catch(() => 0);
    if (index !== 200 || !this.pre.entry) return { step: '17', title, status: PENDING, reason: 'the shell entry is not served at --api-url' };
    const credentials = JSON.parse(fs.readFileSync(this.options.fixture, 'utf8'));
    const checks = new Checks();
    const provenance = binaryProvenance();
    const subjects = new Set(['127.0.0.1']);
    const loginHint = (slug, email) => JSON.stringify([slug.trim().toLowerCase(), email.trim().toLowerCase()]);
    const pages = [];
    const open = async () => {
      const p = await this.page();
      p.origin = apiOrigin;
      pages.push(p);
      await p.goto(apiUrl);
      await p.waitFor('Q.email() || Q.composer() ? true : null', { timeoutMs: 10_000 });
      return p;
    };
    const signIn = async (p, slug = credentials.slug, password = credentials.password) => {
      subjects.add(loginHint(slug, credentials.email));
      return this.signInPassword(p, { slug, email: credentials.email, password });
    };
    const out = {};
    try {
      // 2 — signed out
      let p = await open();
      const signedOut = await p.eval(`({ title: Q.all('h1,h2,h3').filter(Q.visible).map(Q.text), composer: !!Q.composer(), nav: !!Q.nav() && Q.visible(Q.nav()), ai: 0 })`);
      checks.ok('2: the named signed-out state, no composer, no nav', signedOut.title.includes(COPY.signInTitle) && !signedOut.composer && !signedOut.nav, signedOut);
      checks.ok('2: 0 /api/ai requests while signed out', p.apiRequests('/ai/').length === 0);
      // 3 — the business address is required before any request
      await p.fill('Q.email()', credentials.email);
      await p.fill('Q.password()', credentials.password);
      await this.submit(p);
      await sleep(500);
      checks.ok('3: empty business address → 0 /auth/login and a field state', p.apiRequests('/auth/login').length === 0 && (await p.eval('(() => { const b = Q.business(); return !!b && b.getAttribute("aria-invalid") === "true"; })()')));
      // 3b — failures the backend produces locally: wrong password (401), unknown business (404)
      for (const [label, slug, password] of [['wrong password → 401', credentials.slug, `${credentials.password}-wrong`], ['unknown business → 404', `${credentials.slug}-none`, credentials.password]]) {
        const before = p.apiRequests('/auth/login').length;
        await signIn(p, slug, password);
        const state = await p.waitFor(`(${SIGN_IN_SENTENCES[7]}).test(Q.text(document.body)) ? { focus: Q.describe(document.activeElement), alerts: Q.alerts().length } : null`, { timeoutMs: 8000 });
        const res = p.apiRequests('/auth/login').slice(before).map((r) => r.status);
        out[`3b ${label}`] = { statuses: res, state };
        checks.ok(`3b: ${label} → the «never says which» state, focus on the business address, no alert`, !!state && state.focus?.tag === 'input' && /^Адрес бизнеса/.test(state.focus.name ?? '') && state.alerts === 0, { res, state });
      }
      checks.notExercised('3b: 429, 503 and 403 on the real API', 'provoking them would exhaust the proof DB rate limits or change tenant state; each is a mock row of step 3b and a row of local-api.history.test where producible');
      // 3 — password sign-in with the typed business address
      const beforeLogin = p.apiRequests('/auth/login').length;
      const signed = await signIn(p);
      checks.ok('3: password sign-in with the typed business address against NestJS', signed.ok, signed);
      const login = p.apiRequests('/auth/login').slice(beforeLogin).find((r) => r.status === 201 || r.status === 200);
      const loginBody = login ? JSON.parse((await p.postData(login)) ?? '{}') : {};
      checks.ok('3: /auth/login body keys are exactly {tenantSlug, email, password}', JSON.stringify(Object.keys(loginBody).sort()) === JSON.stringify(['email', 'password', 'tenantSlug']), Object.keys(loginBody));
      const identity = await p.eval('Q.text(document.querySelector("header") ?? document.body)');
      checks.ok('3: identity shows the user and the business, no role or presence word', identity.includes(credentials.userName) && identity.includes(credentials.tenantName) && !COPY.roleWords.test(identity), identity);
      // 4 — navigation
      const nav = await p.eval('Q.nav() ? Q.all("button", Q.nav()).map(Q.name) : null');
      checks.ok('4: exactly 5 nav buttons', Array.isArray(nav) && nav.length === 5, nav);
      // 5 — a typed turn gets a real reply
      const text = 'Здравствуйте';
      await this.sendTurn(p, text);
      const early = await p.waitFor(`Q.text(Q.log()).includes(${JSON.stringify(text)}) ? { statuses: Q.all('[role="status"]').filter(Q.visible).length } : null`, { timeoutMs: 3000 });
      checks.ok('5: the user bubble appears', Boolean(early), early);
      const reply = await p.waitFor('(() => { const m = Q.all(".turn--maya", Q.log()); const f = Q.all(".turn-failure", Q.log()); return m.length >= 1 || f.length >= 1 ? { maya: m.map((x) => Q.text(x)), failures: f.map((x) => Q.text(x)) } : null; })()', { timeoutMs: 30_000 });
      out.reply = reply;
      checks.ok('5: a real MAYA reply lands in role="log" (an assistant item, not the user turn), and no failure sentence', !!reply && reply.maya.length >= 1 && reply.maya[0].replace(/^MAYA:\s*/, '').length > 0 && reply.failures.length === 0, reply);
      checks.ok('5: focus stays in the composer', await p.eval('document.activeElement === Q.composer()'));
      const chats = await this.chatBodies(p);
      checks.ok('5: body keys exactly {surface, requestId, messages}, surface web, status 2xx', chats.length === 1 && JSON.stringify(Object.keys(chats[0].body).sort()) === JSON.stringify(['messages', 'requestId', 'surface']) && chats[0].body.surface === 'web' && chats[0].status >= 200 && chats[0].status < 300, chats.map((c) => ({ keys: Object.keys(c.body ?? {}), status: c.status })));
      // 6 — double Enter
      await p.fill('Q.composer()', 'Двойной ввод');
      const beforeDouble = p.apiRequests('/ai/chat').length;
      await p.press('Enter');
      await p.press('Enter');
      await p.waitFor(`Q.all(".turn--maya", Q.log()).length >= 2 || Q.all(".turn-failure", Q.log()).length >= 1 ? true : null`, { timeoutMs: 30_000 });
      checks.ok('6: double Enter → exactly one POST /api/ai/chat', p.apiRequests('/ai/chat').length - beforeDouble === 1, p.apiRequests('/ai/chat').length - beforeDouble);
      // approval_required — attempted (V2-5)
      await this.sendTurn(p, 'Запиши меня на стрижку завтра в 12:00');
      const approval = await p.waitFor(`Q.all(".turn--maya", Q.log()).length >= 3 || Q.all(".turn-failure", Q.log()).length >= 1 ? { notice: Q.text(document.body).includes(${JSON.stringify(COPY.approvalNotice)}) } : null`, { timeoutMs: 30_000 });
      const lastChat = p.apiRequests('/ai/chat').at(-1);
      const lastReply = lastChat ? JSON.parse((await p.responseBody(lastChat.requestId)) ?? '{}') : {};
      out.approval = { notice: approval?.notice ?? null, actionStatus: lastReply?.action?.status ?? null };
      if (lastReply?.action?.status === 'approval_required') checks.ok('approval_required: the reply, then the SH-06 notice', approval?.notice === true, out.approval);
      else checks.notExercised('approval_required on the real API', `the binary answered action ${JSON.stringify(lastReply?.action ?? null)}: AI_CORE_PROVIDER=safe has no model candidate, so no approval-gated tool runs; the mock scenario (step 8) is the P1 proof`);
      checks.notExercised('7: 502 and the same-requestId retry', 'the relay cannot be fault-injected against the real API from the browser; step 7 (mock) is the proof');
      checks.notExercised('7b: the 3 500-char reply on the real API', 'the safe provider does not produce it; test/local-api.history.test.mjs proves untruncated → 400, truncated → 201 against this binary');
      // 3 — email OTP with the debug code (one membership: signs in directly)
      p = await open();
      subjects.add(JSON.stringify(['*', credentials.email]));
      await p.fill('Q.email()', credentials.email);
      await this.submit(p);
      await p.waitFor('Q.code() ? true : null', { timeoutMs: 8000 });
      const startReq = p.apiRequests('/auth/email/start')[0];
      const startBody = startReq ? JSON.parse((await p.responseBody(startReq.requestId)) ?? '{}') : {};
      checks.ok('3: debug_code read from the network log', typeof startBody.debug_code === 'string', Object.keys(startBody));
      const wrongCode = startBody.debug_code === '000000' ? '111111' : '000000';
      await p.fill('Q.code()', wrongCode);
      await this.submit(p);
      const codeState = await p.waitFor(`(${SIGN_IN_SENTENCES[4]}).test(Q.text(document.body)) ? { focus: Q.describe(document.activeElement), alerts: Q.alerts().length } : null`, { timeoutMs: 8000 });
      checks.ok('3b: a wrong code → «Код не подошёл», focus on the code field, no alert', !!codeState && codeState.focus?.tag === 'input' && /^Код из письма/.test(codeState.focus.name ?? '') && codeState.alerts === 0, codeState);
      await p.fill('Q.code()', startBody.debug_code ?? '');
      await this.submit(p);
      const otp = await p.waitFor('Q.composer() ? Q.text(document.querySelector("header") ?? document.body) : null', { timeoutMs: 10_000 });
      checks.ok('3: email OTP signs in and shows the business from the top-level tenant', !!otp && otp.includes(credentials.tenantName), otp);
      checks.notExercised('3: select_business on the real API', 'the fixture user has one membership by design (one tenant, one user, one membership; §2.5); step 3 (mock) proves the re-verify');
      const off = pages.flatMap((q) => [...q.requests.values()]).filter((r) => !/^(data|about):/.test(r.url) && new URL(r.url).hostname !== '127.0.0.1');
      checks.ok('0 requests leave 127.0.0.1', off.length === 0, off.map((r) => r.url));
    } finally {
      for (const q of pages) await this.release(q);
      const ledger = path.join(path.dirname(path.resolve(this.options.fixture)), 'rate-limit-subjects.json');
      const existing = fs.existsSync(ledger) ? JSON.parse(fs.readFileSync(ledger, 'utf8')).subjects ?? [] : [];
      fs.writeFileSync(ledger, `${JSON.stringify({ note: 'rate-limit subjects used by S7 local-API runs and the CDP step 17 (dev-only)', subjects: [...new Set([...existing, ...subjects])] }, null, 2)}\n`, { mode: 0o600 });
    }
    return checks.result('17', title, { apiOrigin, binary: provenance, evidence: out });
  }
}

/** Every request of a page against the D5/V2-15 initiator rule. */
export function auditRequests(requests, origin, modulePath) {
  const apiNotFromClient = [];
  const unexpected = [];
  const crossOrigin = [];
  for (const r of requests) {
    let url;
    try {
      url = new URL(r.url);
    } catch {
      continue;
    }
    if (url.protocol === 'data:' || url.protocol === 'about:') continue;
    if (url.origin !== origin) crossOrigin.push(r.url);
    const fromClient = r.initiator.type === 'script' && (r.initiator.frames ?? []).some((f) => /\/net\/client\.js$/.test(f ?? ''));
    if (url.pathname.startsWith('/api/')) {
      if (!fromClient) apiNotFromClient.push({ url: url.pathname, initiator: r.initiator });
      continue;
    }
    const isDocument = r.type === 'Document';
    const isModule = r.type === 'Script' && modulePath && url.pathname.startsWith(`/${modulePath}`);
    const isStylesheet = r.type === 'Stylesheet' && url.pathname === '/styles.css';
    // /__dev/ requests are admissible only from a /__dev/ page, never from the shell.
    const isDev = url.pathname.startsWith('/__dev/') && /\/__dev\//.test(r.documentURL ?? '');
    const isFavicon = url.pathname === '/favicon.ico' && r.initiator.type === 'other';
    if (!(isDocument || isModule || isStylesheet || isDev || isFavicon || fromClient)) unexpected.push({ url: url.pathname, type: r.type, initiator: r.initiator });
  }
  return { apiNotFromClient, unexpected, crossOrigin };
}

/** HEAD, the backend dist build time and the newest commit not newer than it; "pre-HEAD binary" when they differ (V2-14). */
function binaryProvenance() {
  const canon = path.resolve(SH, '..');
  const git = (...args) => execFileSync('git', ['-C', canon, ...args], { encoding: 'utf8' }).trim();
  const main = path.join(canon, 'maya-saas-backend', 'dist', 'src', 'main.js');
  const mtime = fs.statSync(main).mtime.toISOString();
  const head = git('rev-parse', 'HEAD');
  const line = git('log', '-1', `--before=${mtime}`, '--format=%H %cI', 'HEAD');
  const [sourceCommit, sourceTime] = line ? line.split(' ') : [null, null];
  return { head, distMainMtime: mtime, sourceCommit, sourceCommitTime: sourceTime, label: sourceCommit === head ? 'HEAD binary' : 'pre-HEAD binary' };
}

async function registryLabels(root, modulePath) {
  if (!root || !modulePath) return null;
  const file = path.join(root, modulePath, 'src', 'routes', 'registry.js');
  if (!fs.existsSync(file)) return null;
  const registry = await import(pathToFileURL(file).href);
  const base = registry.BASE_ROUTES ?? [];
  const routes = registry.ROUTES ?? {};
  const labels = base.map((key) => routes[key]?.label ?? null);
  return labels.length === 5 && labels.every(Boolean) ? labels : null;
}

const ALL_STEPS = ['1', '2', '3', '3b', '4', '5', '6', '7', '8', '9', '10', '10b', '11', '12', '13', '14', '15', '16', '17'];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (typeof options.url !== 'string') throw new Error('--url=http://127.0.0.1:8787/ is required');
  // `npm run verify` passes no --evidence: the default is a fresh file in os.tmpdir(), outside any work tree.
  if (typeof options.evidence !== 'string') options.evidence = path.join(os.tmpdir(), `maya-chat-shell-cdp-evidence-${Date.now()}.json`);
  options.chrome = typeof options.chrome === 'string' ? options.chrome : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  options.root = typeof options.root === 'string' ? path.resolve(options.root) : path.join(SH, 'dist', 'web');
  const evidenceFile = assertScratchPath(options.evidence);
  const requested = typeof options.steps === 'string' ? options.steps.split(',').map((s) => s.trim()) : ALL_STEPS;
  for (const s of requested) if (!ALL_STEPS.includes(s)) throw new Error(`unknown step ${s}`);
  if (new URL(options.url).hostname !== '127.0.0.1') throw new Error('--url must be on 127.0.0.1');

  const run = new Run(options);
  run.browser = await Browser.launch(options.chrome);
  let exit = 0;
  try {
    run.evidence.chrome = await run.browser.version();
    run.evidence.head = execFileSync('git', ['-C', SH, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    await run.preconditions();
    const harness = await run.harness();
    console.log(`harness: ${harness.status}`);
    if (harness.status !== PASS) exit = 2;
    for (const step of requested) {
      let result;
      try {
        result = await run[`step${step}`]();
      } catch (error) {
        result = { step, status: FAIL, error: error.stack ?? error.message };
      }
      run.evidence.steps.push(result);
      const skipped = (result.notExercised ?? []).map((s) => s.name);
      console.log(`step ${result.step}: ${result.status}${result.reason ? ` — ${result.reason}` : ''}${skipped.length ? ` (not exercised: ${skipped.join('; ')})` : ''}`);
      for (const c of (result.checks ?? []).filter((x) => !x.ok)) console.log(`  FAILED CHECK: ${c.name}`);
    }
    const origins = [...new Set(run.allRequests.map((r) => r.pageOrigin ?? run.origin))];
    const audits = origins.map((origin) => auditRequests(run.allRequests.filter((r) => (r.pageOrigin ?? run.origin) === origin), origin, run.pre.modulePath));
    const audit = { apiNotFromClient: audits.flatMap((a) => a.apiNotFromClient), unexpected: audits.flatMap((a) => a.unexpected), crossOrigin: audits.flatMap((a) => a.crossOrigin), origins };
    run.evidence.requestAudit = { total: run.allRequests.length, ...audit };
    const statuses = run.evidence.steps.map((s) => s.status);
    run.evidence.summary = Object.fromEntries([PASS, FAIL, PENDING, NOT_EXERCISED].map((s) => [s, statuses.filter((x) => x === s).length]));
    if (exit === 0) exit = statuses.includes(FAIL) || audit.apiNotFromClient.length || audit.unexpected.length || audit.crossOrigin.length ? 1 : statuses.every((s) => s === PASS) ? 0 : 4;
  } finally {
    await run.browser.close();
    run.evidence.finishedAt = new Date().toISOString();
    run.evidence.exit = exit;
    fs.writeFileSync(evidenceFile, `${JSON.stringify(run.evidence, null, 2)}\n`);
  }
  console.log(`summary: ${JSON.stringify(run.evidence.summary)}; evidence ${evidenceFile}; exit ${exit}`);
  return exit;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`cdp-verify: ${error.stack ?? error.message}`);
      process.exit(2);
    },
  );
}
