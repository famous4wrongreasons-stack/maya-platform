#!/usr/bin/env node
// K5 — the phone probe: what a CSS file cannot prove about itself (phase 3, mobile foundation).
//
//   node test/mobile-probe.mjs --url=http://127.0.0.1:8787/ \
//        --chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        [--evidence=<dir>/mobile-probe.json]
//
// The page under test is served by `dev/serve.mjs --mock` exactly as test/cdp-verify.mjs serves it, and
// this probe borrows that harness's CDP client (Browser, Page) so there is one CDP implementation.
//
// It measures six things on a phone-sized viewport, each one a number the shell either produces or does
// not:
//
//   M1  overscroll containment on the document — the property a browser consults before it offers
//       pull-to-refresh or rubber-bands the page. A reload signs the owner out (memory-only, A6).
//   M2  overscroll containment on EVERY scroll container the shell actually builds, enumerated from the
//       live layout rather than from a list written by hand.
//   M3  a real touch drag downward on the log at scrollTop 0: the document must not move. Recorded as
//       evidence, not gated — headless Chrome implements no pull-to-refresh UI, so M1/M2 are the
//       enforceable form of this.
//   M4  the safe-area insets: with insets present, no shell surface may sit under them. Driven by
//       Emulation.setSafeAreaInsetsOverride when this Chrome has it, and by the stylesheet's own inset
//       tokens otherwise — both drive the same declarations.
//   M5  the keyboard inset, SIMULATED: this probe writes the custom property the entry writes from
//       visualViewport and measures what the stylesheet then does with it. No keyboard is opened and
//       none can be — headless Chrome has no on-screen keyboard, so no engine here can report a
//       non-zero visual-viewport inset. M5 therefore proves that the layout consumes the inset (the
//       composer, «Отправить» and the fullscreen body stay above it, including with the textarea
//       dragged to its own maximum); it does NOT prove that iOS or Android reports the inset, nor
//       that the entry's visualViewport listener fires on a real device. The one number here that
//       IS the entry's own is the 0px it wrote with no keyboard.
//   M6  320 and 390 CSS px at a 2x text scale: no horizontal page scroll, every visible control
//       ≥ 44x44, the log still scrollable.
//   M8  the column inside the shell: at EVERY size and text scale above, with the device insets
//       applied and with the log both empty and filled, the composer and «Отправить» stay inside the
//       window, inside the conversation column, clear of the nav and clear of the home indicator, and
//       the page never becomes scrollable. This is the combination M4 (insets, one text scale) and M6
//       (two text scales, no insets) each half-covered and neither caught.
//
// Exit: 0 when every gated check passes, 1 when any fails, 2 when the probe itself cannot run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { MOCK_ACCOUNT, MOCK_TENANTS } from '../dev/scenarios.mjs';
import { Browser, voiceShim } from './cdp-verify.mjs';

/** The V11 Cell a refused microphone draws (§1.4; asserted verbatim by test/cdp-verify.mjs step 15). */
const VOICE_UNAVAILABLE = /Голос недоступен на этом устройстве — напишите сообщение/;
const MIC_BUTTON = 'Q.all(".voice button").find((b) => /Сказать голосом/.test(Q.name(b)) && Q.visible(b)) ?? null';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * iPhone-14-Pro-class portrait, and the narrowest phone the plan names (§1.11, A-10).
 *
 * `keyboard` is the iOS portrait keyboard height for that screen INCLUDING the predictive/accessory
 * bar — the inset visualViewport reports when the keyboard opens. `keyboardStress` is a deliberately
 * unreasonable keyboard (three fifths of a 568 px screen; no shipped device does this) and is recorded
 * as an observation, never gated: a gate tuned to an impossible device proves nothing.
 */
const PHONES = Object.freeze([
  Object.freeze({ name: '390x844', width: 390, height: 844, dsf: 3, keyboard: 336, keyboardStress: 500 }),
  Object.freeze({ name: '320x568', width: 320, height: 568, dsf: 2, keyboard: 260, keyboardStress: 336 }),
]);
/** A notch, a home indicator and a landscape cheek — the insets iOS reports in standalone. */
const INSETS = Object.freeze({ top: 47, right: 21, bottom: 34, left: 21 });

class Checks {
  constructor() {
    this.items = [];
  }
  ok(name, condition, detail = null) {
    this.items.push({ name, ok: Boolean(condition), ...(detail === null ? {} : { detail }) });
    return Boolean(condition);
  }
  /** Recorded, never gated: a number this probe can read but headless Chrome cannot decide. */
  note(name, detail) {
    this.items.push({ name, ok: true, observation: true, detail });
  }
  get failed() {
    return this.items.filter((i) => !i.ok);
  }
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`unknown argument ${a}`);
    out[m[1]] = m[2] ?? true;
  }
  return out;
}

// ── in-page measurements ───────────────────────────────────────────────────────────────────────

/** Every element the layout actually scrolls, with the containment each one declares. */
const SCROLLERS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('html,body,div,section,nav,dialog,main')) {
    const s = getComputedStyle(el);
    const scrollsY = /auto|scroll/.test(s.overflowY);
    const scrollsX = /auto|scroll/.test(s.overflowX);
    if (!scrollsY && !scrollsX) continue;
    out.push({
      sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : ''),
      overflowY: s.overflowY, overflowX: s.overflowX,
      behaviorY: s.overscrollBehaviorY, behaviorX: s.overscrollBehaviorX,
      canScrollY: el.scrollHeight > el.clientHeight + 1,
    });
  }
  return out;
})()`;

const rectsOf = (selectors) => `(() => {
  const pick = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, w: r.width, h: r.height }; };
  const out = {};
  ${selectors.map(([key, expr]) => `out[${JSON.stringify(key)}] = pick(${expr});`).join('\n  ')}
  out.__viewport = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight };
  out.__visual = window.visualViewport ? { width: window.visualViewport.width, height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop } : null;
  return out;
})()`;

const LAST_NAV_BUTTON = `(() => { const n = Q.nav(); return n ? [...n.querySelectorAll('button')].pop() ?? null : null; })()`;

// ── the probe ──────────────────────────────────────────────────────────────────────────────────

class Probe {
  constructor(options) {
    this.options = options;
    this.origin = new URL(options.url).origin;
    this.evidence = { generatedAt: new Date().toISOString(), url: options.url, chrome: null, safeAreaDriver: null, measurements: [] };
  }

  async dev(pathname, body = undefined) {
    const res = await fetch(`${this.origin}${pathname}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.json();
  }

  async scenario(name) {
    await this.dev('/__dev/reset', {});
    const res = await this.dev('/__dev/scenario', { name });
    if (res.scenario !== name) throw new Error(`scenario ${name} not set: ${JSON.stringify(res)}`);
  }

  async phone(page, phone) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: phone.width, height: phone.height, deviceScaleFactor: phone.dsf, mobile: true });
    await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }

  /** The real thing when this Chrome has it; the stylesheet's own tokens otherwise. Both reach the
   *  same declarations, and the probe records which one it used. */
  async applyInsets(page) {
    if (this.evidence.safeAreaDriver === null) {
      try {
        await page.send('Emulation.setSafeAreaInsetsOverride', { insets: INSETS });
        this.evidence.safeAreaDriver = 'Emulation.setSafeAreaInsetsOverride';
      } catch (error) {
        this.evidence.safeAreaDriver = `stylesheet inset tokens (${String(error.message).slice(0, 120)})`;
      }
    } else if (this.evidence.safeAreaDriver === 'Emulation.setSafeAreaInsetsOverride') {
      await page.send('Emulation.setSafeAreaInsetsOverride', { insets: INSETS });
    }
    if (this.evidence.safeAreaDriver !== 'Emulation.setSafeAreaInsetsOverride')
      await page.eval(`(() => { const s = document.documentElement.style; s.setProperty('--safe-top', '${INSETS.top}px'); s.setProperty('--safe-right', '${INSETS.right}px'); s.setProperty('--safe-bottom', '${INSETS.bottom}px'); s.setProperty('--safe-left', '${INSETS.left}px'); return true; })()`);
    await sleep(120);
  }

  async clearInsets(page) {
    if (this.evidence.safeAreaDriver === 'Emulation.setSafeAreaInsetsOverride') await page.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, right: 0, bottom: 0, left: 0 } }).catch(() => {});
    else await page.eval(`(() => { for (const n of ['--safe-top', '--safe-right', '--safe-bottom', '--safe-left']) document.documentElement.style.removeProperty(n); return true; })()`);
    await sleep(120);
  }

  async signInPassword(page) {
    const ok = (await page.fill('Q.business()', MOCK_TENANTS[0].slug)) && (await page.fill('Q.email()', MOCK_ACCOUNT.email)) && (await page.fill('Q.password()', MOCK_ACCOUNT.password));
    if (!ok) return false;
    const before = page.apiRequests('/auth/').length;
    await page.press('Enter');
    await sleep(250);
    if (page.apiRequests('/auth/').length === before)
      await page.click(`(() => { const field = document.activeElement; const buttons = Q.all('button').filter(Q.visible); return buttons.find((b) => field && (field.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && /Войти/i.test(Q.name(b))) ?? null; })()`);
    return Boolean(await page.waitFor('Q.composer() && Q.visible(Q.composer()) ? true : null', { timeoutMs: 10_000 }));
  }

  /** A log with enough turns to scroll: the mock answers every turn the composer sends. */
  async fillLog(page, turns) {
    for (let i = 0; i < turns; i += 1) {
      await page.fill('Q.composer()', `Проверка прокрутки ${i + 1}`);
      await page.press('Enter');
      await page.waitFor(`Q.all('.turn--maya', Q.log()).length >= ${i + 1} ? true : null`, { timeoutMs: 10_000 });
    }
  }

  record(m) {
    this.evidence.measurements.push(m);
    const bad = m.checks.filter((c) => !c.ok);
    console.log(`${m.id} ${bad.length === 0 ? 'PASS' : 'FAIL'} — ${m.title}`);
    for (const c of bad) console.log(`  FAILED: ${c.name} ${JSON.stringify(c.detail ?? null)}`);
    return bad.length === 0;
  }

  // ── M1 + M2 + M3: overscroll ──

  async overscroll(page) {
    const checks = new Checks();
    const root = await page.eval(`(() => { const h = getComputedStyle(document.documentElement); const b = getComputedStyle(document.body); return { htmlY: h.overscrollBehaviorY, htmlX: h.overscrollBehaviorX, bodyY: b.overscrollBehaviorY, bodyX: b.overscrollBehaviorX, docScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1 }; })()`);
    checks.ok('M1 the document contains overscroll on both axes (no pull-to-refresh, no page rubber-band)', root.htmlY === 'none' && root.htmlX === 'none', root);
    checks.ok('M1 the document itself does not scroll on a phone', root.docScrollable === false, root);

    const scrollers = await page.eval(SCROLLERS);
    const chaining = scrollers.filter((s) => (/auto|scroll/.test(s.overflowY) && s.behaviorY === 'auto') || (/auto|scroll/.test(s.overflowX) && s.behaviorX === 'auto'));
    checks.ok('M2 every scroll container the shell builds contains its overscroll', scrollers.length > 0 && chaining.length === 0, { scrollers, chaining });

    const log = await page.eval(`(() => { const l = Q.log(); if (!l) return null; l.scrollTop = 0; const r = l.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, scrollTop: l.scrollTop, canScroll: l.scrollHeight > l.clientHeight + 1, behaviorY: getComputedStyle(l).overscrollBehaviorY }; })()`);
    checks.ok('M2 the log is a scroll container that contains its overscroll', log !== null && log.canScroll === true && log.behaviorY !== 'auto', log);
    if (log) {
      const before = await page.eval('({ scrollTop: document.scrollingElement.scrollTop, scrollY: window.scrollY, offsetTop: window.visualViewport ? window.visualViewport.offsetTop : null })');
      await page.send('Input.synthesizeScrollGesture', { x: Math.round(log.x), y: Math.round(log.y), xDistance: 0, yDistance: 400, gestureSourceType: 'touch', speed: 800, repeatCount: 1 }).catch(() => {});
      await sleep(400);
      const after = await page.eval('({ scrollTop: document.scrollingElement.scrollTop, scrollY: window.scrollY, offsetTop: window.visualViewport ? window.visualViewport.offsetTop : null, logTop: Q.log() ? Q.log().scrollTop : null })');
      checks.ok('M3 a downward touch drag on the log at scrollTop 0 leaves the document where it was', after.scrollTop === before.scrollTop && after.scrollY === before.scrollY, { before, after });
      checks.note('M3 headless Chrome offers no pull-to-refresh UI, so M1/M2 are the enforceable form of this', { before, after });
    }
    return this.record({ id: 'M1-M3', title: 'overscroll containment: document and every live scroll container', checks: checks.items });
  }

  // ── M4: safe area ──

  async safeArea(page, { signedIn }) {
    const checks = new Checks();
    await this.applyInsets(page);
    const selectors = signedIn
      ? [
          ['identityText', "document.querySelector('.identity-text')"],
          ['identityHeader', "document.querySelector('.identity')"],
          ['shell', "document.querySelector('.app-shell')"],
          ['log', 'Q.log()'],
          ['composer', 'Q.composer()'],
          ['lastNavButton', LAST_NAV_BUTTON],
        ]
      : [
          ['signinTitle', "document.querySelector('.signin-title')"],
          ['signin', "document.querySelector('.signin')"],
          ['email', 'Q.email()'],
        ];
    const r = await page.eval(rectsOf(selectors));
    const vp = r.__viewport;
    const label = signedIn ? 'signed in' : 'signed out';
    const first = signedIn ? r.identityText : r.signinTitle;
    checks.ok(`M4 (${label}) nothing sits under the notch: the first line starts at or below inset-top ${INSETS.top}`, first !== null && first.top >= INSETS.top - 0.5, { first, insets: INSETS });
    checks.ok(`M4 (${label}) nothing sits under the left cheek`, first !== null && first.left >= INSETS.left - 0.5, first);
    checks.ok(`M4 (${label}) nothing sits under the right cheek`, first !== null && first.right <= vp.innerWidth - INSETS.right + 0.5, { first, innerWidth: vp.innerWidth });
    checks.ok(`M4 (${label}) the insets add no horizontal page scroll`, vp.scrollWidth <= vp.clientWidth, vp);
    if (signedIn) {
      checks.ok(`M4 (signed in) the last nav control stays above the home indicator (inset-bottom ${INSETS.bottom})`, r.lastNavButton !== null && r.lastNavButton.bottom <= vp.innerHeight - INSETS.bottom + 0.5, { lastNavButton: r.lastNavButton, innerHeight: vp.innerHeight });
      checks.ok('M4 (signed in) the composer is inside both cheeks', r.composer !== null && r.composer.left >= INSETS.left - 0.5 && r.composer.right <= vp.innerWidth - INSETS.right + 0.5, { composer: r.composer, innerWidth: vp.innerWidth });
    } else {
      checks.ok('M4 (signed out) the email field clears the home indicator', r.email !== null && r.email.bottom <= vp.innerHeight - INSETS.bottom + 0.5 || (r.signin !== null && r.signin.bottom > vp.innerHeight), { email: r.email, innerHeight: vp.innerHeight });
    }
    let fullscreen = null;
    if (signedIn) {
      fullscreen = await page.eval(`(() => {
        const d = document.querySelector('dialog.fullscreen');
        if (!d) return null;
        const wasOpen = d.open;
        if (!wasOpen) d.showModal();
        const bar = d.querySelector('.fullscreen-bar');
        const body = d.querySelector('.fullscreen-body');
        const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, h: r.height }; };
        const s = body ? getComputedStyle(body) : null;
        const out = { dialog: box(d), bar: box(bar), body: box(body), bodyOverflowY: s ? s.overflowY : null, bodyBehaviorY: s ? s.overscrollBehaviorY : null, dialogOverflowY: getComputedStyle(d).overflowY, dialogScrolls: d.scrollHeight > d.clientHeight + 1, innerHeight: window.innerHeight, wasOpen };
        if (!wasOpen) d.close();
        return out;
      })()`);
      if (fullscreen === null) checks.ok('M4 the fullscreen host exists in the shell', false, null);
      else {
        checks.ok(`M4 the fullscreen host keeps its bar below inset-top ${INSETS.top}`, fullscreen.bar !== null && fullscreen.bar.top >= INSETS.top - 0.5, fullscreen);
        checks.ok('M4 the fullscreen host fits the window (no taller than innerHeight)', fullscreen.dialog !== null && fullscreen.dialog.h <= fullscreen.innerHeight + 0.5, fullscreen);
        checks.ok('M4 the fullscreen body is the scroll container, not the dialog, and contains its overscroll', fullscreen.bodyOverflowY !== null && /auto|scroll/.test(fullscreen.bodyOverflowY) && fullscreen.bodyBehaviorY !== 'auto' && fullscreen.dialogScrolls === false, fullscreen);
      }
    }
    await this.clearInsets(page);
    return this.record({ id: signedIn ? 'M4-in' : 'M4-out', title: `safe-area insets, ${label} (driver: ${this.evidence.safeAreaDriver})`, checks: checks.items, rects: r, fullscreen });
  }

  // ── M5: the keyboard ──

  async keyboard(page, phone) {
    const checks = new Checks();
    const written = await page.eval(`(() => { const m = document.getElementById('maya'); return { inline: m ? m.style.getPropertyValue('--maya-keyboard-inset') : null, computed: m ? getComputedStyle(m).getPropertyValue('--maya-keyboard-inset').trim() : null }; })()`);
    checks.ok('M5 the entry itself wrote the keyboard inset from visualViewport — 0px, the only unsimulated keyboard number in this probe', written.inline === '0px', written);

    const measure = async (note) => {
      const r = await page.eval(rectsOf([
        ['composer', 'Q.composer()'],
        ['send', 'Q.send()'],
        ['log', 'Q.log()'],
        ['shell', "document.querySelector('.app-shell')"],
      ]));
      return { note, ...r };
    };
    /**
     * SIMULATES the keyboard: it writes the one custom property entry/main.ts writes from
     * visualViewport. It does not open a keyboard — headless Chrome has none — so what follows
     * measures whether the LAYOUT consumes the inset, not whether a device reports it.
     */
    const simulateKeyboardInset = async (px) => {
      await page.eval(`(() => { document.getElementById('maya').style.setProperty('--maya-keyboard-inset', '${px}px'); return true; })()`);
      await sleep(150);
    };
    const grow = async () => page.eval(`(() => { const t = Q.composer(); if (!t) return null; const max = getComputedStyle(t).maxHeight; t.style.height = max; return { maxHeight: max, height: t.getBoundingClientRect().height }; })()`);
    const shrink = async () => page.eval(`(() => { const t = Q.composer(); if (t) t.style.removeProperty('height'); return true; })()`);

    // The inset the shell will really see: the iOS portrait keyboard for this screen, written as the
    // property rather than typed on a keyboard that does not exist in this browser.
    await simulateKeyboardInset(phone.keyboard);
    const visible = phone.height - phone.keyboard;
    const open = await measure('keyboard inset simulated');
    checks.note('M5 the keyboard is SIMULATED — the custom property is written directly; no keyboard is opened, so these checks prove the layout consumes the inset, not that a device reports one', { simulatedInsetPx: phone.keyboard, property: '--maya-keyboard-inset', visible });
    checks.ok(`M5 with the ${phone.keyboard} px inset simulated the composer stays inside the visible ${visible} px`, open.composer !== null && open.composer.bottom <= visible + 0.5, { composer: open.composer, visible });
    checks.ok('M5 «Отправить» stays inside the visible area too', open.send !== null && open.send.bottom <= visible + 0.5, { send: open.send, visible });
    checks.ok('M5 the log keeps a non-zero height with the inset simulated', open.log !== null && open.log.h > 0, open.log);

    /* The fullscreen host is a <dialog> the size of the window, so `100dvh` is the whole window even
     * with the keyboard up: without the same keyboard-inset term .app-shell uses, its body's last line
     * and any control at the bottom of a detail sit under the keyboard. Measured on the real dialog. */
    const dialog = await page.eval(`(() => {
      const d = document.querySelector('dialog.fullscreen');
      if (!d) return null;
      const wasOpen = d.open;
      if (!wasOpen) d.showModal();
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), h: +r.height.toFixed(2) }; };
      const s = getComputedStyle(d);
      const out = { dialog: box(d), bar: box(d.querySelector('.fullscreen-bar')), body: box(d.querySelector('.fullscreen-body')), close: box(d.querySelector('.fullscreen-close')), paddingBottom: s.paddingBottom, height: s.height, innerHeight: window.innerHeight };
      if (!wasOpen) d.close();
      return out;
    })()`);
    checks.ok(`M5 the fullscreen host's body ends above the simulated keyboard (visible ${visible} px), like the shell's own column`, dialog !== null && dialog.body !== null && dialog.body.bottom <= visible + 0.5, { dialog, visible });

    // The textarea dragged to its own maximum — the one composer height the user can choose.
    const grown = await grow();
    await sleep(150);
    const dragged = await measure('keyboard open, textarea at max-height');
    checks.ok('M5 with the textarea at its max-height the composer is still inside the visible area', dragged.composer !== null && dragged.composer.bottom <= visible + 0.5, { grown, composer: dragged.composer, visible });
    checks.ok('M5 with the textarea at its max-height «Отправить» is still reachable', dragged.send !== null && dragged.send.bottom <= visible + 0.5, { send: dragged.send, visible });
    await shrink();

    // The unreasonable keyboard, recorded only.
    await simulateKeyboardInset(phone.keyboardStress);
    const stressGrown = await grow();
    await sleep(150);
    const stress = await measure(`keyboard ${phone.keyboardStress} px (stress), textarea at max-height`);
    const stressVisible = phone.height - phone.keyboardStress;
    checks.note(`M5 stress ${phone.keyboardStress} px keyboard on a ${phone.height} px screen — recorded, not gated`, { grown: stressGrown, composer: stress.composer, send: stress.send, visible: stressVisible, composerInside: stress.composer !== null && stress.composer.bottom <= stressVisible + 0.5, sendInside: stress.send !== null && stress.send.bottom <= stressVisible + 0.5 });
    await shrink();
    await simulateKeyboardInset(0);
    return this.record({ id: `M5-${phone.name}`, title: `keyboard inset ${phone.keyboard} px (iOS portrait) SIMULATED on ${phone.name} — the property written, no keyboard opened`, checks: checks.items, open, dragged, grown, stress, dialog });
  }

  // ── M6: reflow, targets, scrolling ──

  async reflow(page, phone) {
    const checks = new Checks();
    await page.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    await sleep(200);
    const scroll = await page.eval('({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, coarse: matchMedia("(pointer: coarse)").matches, logScrolls: Q.log() ? Q.log().scrollHeight > Q.log().clientHeight + 1 : null, logH: Q.log() ? Q.log().getBoundingClientRect().height : null })');
    checks.ok(`M6 ${phone.name} at 2x text: no horizontal page scroll`, scroll.scrollWidth <= scroll.clientWidth, scroll);
    checks.ok(`M6 ${phone.name}: the pointer is coarse`, scroll.coarse === true, scroll);
    checks.ok(`M6 ${phone.name}: the log keeps room and still scrolls`, scroll.logH > 0 && scroll.logScrolls === true, scroll);
    const small = await page.eval('Q.all("button,textarea,input,a").filter(Q.visible).map((el) => ({ ...Q.describe(el), ...Q.rect(el) })).filter((r) => r.w < 44 || r.h < 44)');
    checks.ok(`M6 ${phone.name}: every visible control is ≥ 44x44`, small.length === 0, small);
    const nav = await page.eval(`(() => { const n = Q.nav(); if (!n) return null; const s = getComputedStyle(n); const buttons = [...n.querySelectorAll('button')]; return { overflowX: s.overflowX, behaviorX: s.overscrollBehaviorX, buttons: buttons.length, widest: Math.max(0, ...buttons.map((b) => b.getBoundingClientRect().width)), scrollsX: n.scrollWidth > n.clientWidth + 1 }; })()`);
    checks.ok(`M6 ${phone.name}: the nav holds five routes without pushing the page wide`, nav !== null && nav.buttons === 5, nav);
    checks.ok(`M6 ${phone.name}: if the nav scrolls sideways it contains that overscroll`, nav !== null && (!nav.scrollsX || nav.behaviorX !== 'auto'), nav);
    await page.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
    await sleep(150);
    return this.record({ id: `M6-${phone.name}`, title: `reflow, targets and scrolling at ${phone.name}, text scale 2.0`, checks: checks.items });
  }

  // ── M7: the microphone surface on a phone ──

  /**
   * The permission path from a real tap, and the refusal it draws, at a phone size and a 2x text scale.
   * WHEN the prompt is asked is not this probe's business and is not touched: getUserMedia is answered by
   * the same shim test/cdp-verify.mjs step 15 uses (deviation D-6 — Chrome's fake capture hangs on this
   * Mac), and the count of calls before the tap is what proves nothing asked early.
   */
  async microphone(browser, phone) {
    const checks = new Checks();
    await this.scenario('happy');
    const page = await browser.newPage();
    try {
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: voiceShim({ deny: true }) });
      await this.phone(page, phone);
      await page.goto(this.options.url);
      await sleep(400);
      if (!(await this.signInPassword(page))) throw new Error('the probe could not sign in for the microphone measurement');
      await page.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
      await sleep(250);
      const before = await page.eval(`({ calls: window.__cdpGum.calls, mic: (() => { const b = ${MIC_BUTTON}; if (!b) return null; const r = b.getBoundingClientRect(); return { name: Q.name(b), top: r.top, right: r.right, bottom: r.bottom, left: r.left, w: r.width, h: r.height }; })(), scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, innerWidth: window.innerWidth })`);
      checks.ok('M7 nothing asked for the microphone before a tap', before.calls === 0, before);
      checks.ok('M7 the mic control is present, named and ≥ 44x44 at a 2x text scale', before.mic !== null && before.mic.w >= 44 && before.mic.h >= 44 && /Сказать голосом/.test(before.mic.name ?? ''), before.mic);
      checks.ok('M7 the mic control is wholly inside the viewport', before.mic !== null && before.mic.left >= -0.5 && before.mic.right <= before.innerWidth + 0.5, { mic: before.mic, innerWidth: before.innerWidth });

      checks.ok('M7 the mic control is tapped', await page.click(MIC_BUTTON));
      const denied = await page.waitFor(`${VOICE_UNAVAILABLE.source ? `/${VOICE_UNAVAILABLE.source}/` : '/x/'}.test(Q.text(document.body)) ? (() => {
        const el = Q.all('p,span,div').filter((e) => ${`/${VOICE_UNAVAILABLE.source}/`}.test(Q.text(e)) && Q.visible(e) && e.children.length === 0)[0] ?? null;
        const r = el ? el.getBoundingClientRect() : null;
        const composerFirst = (() => { const all = Q.all('textarea,button').filter(Q.visible); return all.indexOf(Q.composer()) === 0; })();
        return { calls: window.__cdpGum.calls, alerts: Q.alerts().length, composerFirst, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, innerWidth: window.innerWidth, sentence: el ? { top: r.top, right: r.right, bottom: r.bottom, left: r.left, w: r.width, h: r.height, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, text: Q.text(el) } : null };
      })() : null`, { timeoutMs: 10_000 });
      checks.ok('M7 the refusal draws the V11 Cell after exactly one getUserMedia, inside the tap', denied !== null && denied.calls === 1, denied);
      checks.ok('M7 the refusal is a Cell, not an alert, and the composer is still the first control', denied !== null && denied.alerts === 0 && denied.composerFirst === true, denied);
      checks.ok('M7 the refusal sentence is legible: inside the viewport, not clipped, no horizontal page scroll', denied?.sentence != null && denied.sentence.left >= -0.5 && denied.sentence.right <= denied.innerWidth + 0.5 && denied.sentence.scrollWidth <= denied.sentence.clientWidth + 1 && denied.sentence.scrollHeight <= denied.sentence.clientHeight + 1 && denied.scrollWidth <= denied.clientWidth, denied);
      await page.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
      return this.record({ id: `M7-${phone.name}`, title: `the microphone surface at ${phone.name}, text scale 2.0 (permission answered by the step-15 shim, D-6)`, checks: checks.items, before, denied });
    } finally {
      await page.close();
    }
  }

  // ── M8: the conversation column inside the fixed-height shell ──

  /**
   * The combination M4 and M6 each half-covered: the device insets APPLIED at both text scales, at
   * both phone sizes, with the log empty and filled. The regression this catches is a real one —
   * with `.app-shell` taking `padding-top: var(--safe-top)` and the conversation column free to
   * overflow it, the cold-start hint's own minimum at a 2x text scale pushed the composer out of the
   * column and «Отправить» 224 px below a 320x568 window, over the nav, with the page itself grown
   * to 803 px. M4 applied the insets but only at the default text size and never looked below the
   * composer's left and right edges; M6 used both text scales but with no insets and never measured
   * the composer at all. Each passed. This measurement is the one that does not.
   *
   * `inside the window` is not enough on its own: the column is also a scroll container of last
   * resort, so a composer that is merely scrolled out of view would still report a rect inside the
   * window. So the column is required not to scroll at these sizes, and the composer's bottom is
   * required to be inside the column's own box.
   */
  async layout(browser, phone) {
    const checks = new Checks();
    await this.scenario('happy');
    const page = await browser.newPage();
    try {
      await this.phone(page, phone);
      await page.goto(this.options.url);
      await sleep(400);
      if (!(await this.signInPassword(page))) throw new Error('the probe could not sign in for the column measurement');
      await this.applyInsets(page);
      const rects = [];
      for (const log of ['empty', 'filled']) {
        if (log === 'filled') await this.fillLog(page, 3);
        for (const [scale, px] of [['1x', 16], ['2x', 32]]) {
          await page.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: Math.round(px * 0.8) } });
          await sleep(250);
          const m = await page.eval(`(() => {
            const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(2), right: +r.right.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
            const column = document.querySelector('.panel--conversation');
            const hint = document.querySelector('.timeline-hint');
            const nav = Q.nav();
            return {
              innerHeight: window.innerHeight, innerWidth: window.innerWidth,
              rootFontSize: getComputedStyle(document.documentElement).fontSize,
              shortViewport: matchMedia('(max-height: 32rem)').matches,
              pageScrollHeight: document.documentElement.scrollHeight, pageClientHeight: document.documentElement.clientHeight,
              pageScrollWidth: document.documentElement.scrollWidth, pageClientWidth: document.documentElement.clientWidth,
              composer: box(Q.composer() ? Q.composer().closest('.composer') : null),
              send: box(Q.send()), column: box(column), nav: box(nav), lastNav: box(${LAST_NAV_BUTTON}),
              hintShown: hint !== null && !hint.hasAttribute('hidden'),
              columnScrolls: column === null ? null : column.scrollHeight > column.clientHeight + 1,
            };
          })()`);
          rects.push({ log, scale, ...m });
          const at = `M8 ${phone.name} ${scale} text, insets on, log ${log}`;
          const ih = m.innerHeight;
          checks.ok(`${at}: the page itself never becomes scrollable`, m.pageScrollHeight <= m.pageClientHeight + 1 && m.pageScrollWidth <= m.pageClientWidth + 1, m);
          checks.ok(`${at}: the composer is wholly inside the window`, m.composer !== null && m.composer.top >= INSETS.top - 0.5 && m.composer.bottom <= ih + 0.5, { composer: m.composer, innerHeight: ih, insets: INSETS });
          checks.ok(`${at}: «Отправить» is inside the window and clear of the home indicator (inset-bottom ${INSETS.bottom})`, m.send !== null && m.send.bottom <= ih - INSETS.bottom + 0.5 && m.send.top >= INSETS.top - 0.5, { send: m.send, innerHeight: ih, insets: INSETS });
          checks.ok(`${at}: the composer is inside the conversation column, which does not have to scroll to hold it`, m.column !== null && m.composer !== null && m.composer.bottom <= m.column.bottom + 0.5 && m.columnScrolls === false, { composer: m.composer, column: m.column, columnScrolls: m.columnScrolls });
          checks.ok(`${at}: the composer does not overlap the nav`, m.nav !== null && m.composer !== null && m.composer.bottom <= m.nav.top + 0.5, { composer: m.composer, nav: m.nav });
          checks.ok(`${at}: the last nav control still clears the home indicator`, m.lastNav !== null && m.lastNav.bottom <= ih - INSETS.bottom + 0.5, { lastNav: m.lastNav, innerHeight: ih, insets: INSETS });
          if (log === 'empty') checks.ok(`${at}: the cold-start hint is the state under measurement (it is what has no upper bound)`, m.hintShown === true, { hintShown: m.hintShown });
        }
      }
      await page.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 13 } });
      await this.clearInsets(page);
      return this.record({ id: `M8-${phone.name}`, title: `the conversation column inside the shell at ${phone.name}, insets applied, 1x and 2x text, log empty and filled`, checks: checks.items, rects });
    } finally {
      await page.close();
    }
  }

  async run() {
    const browser = await Browser.launch(this.options.chrome, []);
    this.evidence.chrome = (await browser.version()).product;
    let ok = true;
    try {
      for (const phone of PHONES) {
        await this.scenario('happy');
        const page = await browser.newPage();
        try {
          await this.phone(page, phone);
          await page.goto(this.options.url);
          await sleep(600);
          if (phone === PHONES[0]) ok = (await this.safeArea(page, { signedIn: false })) && ok;
          if (!(await this.signInPassword(page))) throw new Error('the probe could not sign in against the mock');
          await this.fillLog(page, 8);
          ok = (await this.overscroll(page)) && ok;
          ok = (await this.safeArea(page, { signedIn: true })) && ok;
          ok = (await this.keyboard(page, phone)) && ok;
          ok = (await this.reflow(page, phone)) && ok;
          const errors = [...page.console.filter((c) => c.type === 'error'), ...page.exceptions];
          ok = this.record({ id: `M0-${phone.name}`, title: 'no console error while the probe drove the phone', checks: [{ name: '0 console errors, 0 exceptions', ok: errors.length === 0, detail: errors }] }) && ok;
        } finally {
          await page.close();
        }
        ok = (await this.microphone(browser, phone)) && ok;
        ok = (await this.layout(browser, phone)) && ok;
      }
    } finally {
      await browser.close();
    }
    this.evidence.exit = ok ? 0 : 1;
    return ok ? 0 : 1;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.url) throw new Error('--url is required (dev/serve.mjs --mock)');
  options.chrome = options.chrome ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const probe = new Probe(options);
  const evidenceFile = options.evidence ? path.resolve(String(options.evidence)) : path.join(HERE, '..', 'dist', 'mobile-probe.json');
  let exit = 2;
  try {
    exit = await probe.run();
  } finally {
    probe.evidence.finishedAt = new Date().toISOString();
    probe.evidence.exit = exit;
    fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
    fs.writeFileSync(evidenceFile, `${JSON.stringify(probe.evidence, null, 2)}\n`);
  }
  console.log(`mobile-probe: ${exit === 0 ? 'PASS' : 'FAIL'}; evidence ${evidenceFile}; exit ${exit}`);
  return exit;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`mobile-probe: ${error.stack ?? error.message}`);
      process.exit(2);
    },
  );
}
