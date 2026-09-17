// K5 / S4 — the shell state and the fullscreen host's controller (src/shell/shell.ts; SHELL-PLAN v2.1
// §1.5D, §1.7; D3, R3.3.4, A-5 shell half; P-01, P-06, P-24).
//
//   node --test test/shell.test.mjs
//
// One primary route of five; at most one detail, PROGRESS or OPEN; a detail never opens from a key or
// a URL; Close/Esc/Back are chrome; Back uses a history entry for the current address, so the URL
// never changes. The DOM half (focus trap, focus return, Esc key) is S5's; here the opener it
// returns focus to is state, and the history entries are counted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as shellModule from '../src/shell/shell.ts';
import { render } from '../src/renderer/render.ts';

const { closedState, createShell, createShellRuntime, initialState, navigateState, openState, progressState, asPrimaryRoute } = shellModule;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');
const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const envelope = (id) => JSON.parse(fs.readFileSync(path.join(FIXTURES, INDEX.fixtures.find((f) => f.id === id).file), 'utf8'));
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };
const BASE = ['shell.root', 'shell.account', 'shell.connections', 'shell.privacy', 'shell.notifications'];
const NOT_PRIMARY = ['maya', 'shell.pay', 'shell.file', 'fs.booking', 'fs.calendar', 'detail', 'w', '', 'SHELL.ROOT', ' shell.root', '__proto__', 'constructor', null, undefined, 7, {}];

const makeHistory = () => {
  const h = { pushes: 0, backs: 0, args: [], listener: null };
  return {
    h,
    port: {
      push: (...args) => ((h.pushes += 1), h.args.push(args)),
      back: (...args) => ((h.backs += 1), h.args.push(args)),
      onBack: (l) => ((h.listener = l), () => (h.listener = null)),
    },
  };
};

const RESULT = (id) => ({ kind: 'CHOICE', textEquivalent: { headline: id } });

test('initial state: the conversation is open, the primary route is shell.root, nothing is fullscreen', () => {
  assert.deepEqual(initialState(), { conversation: 'open', primary: 'shell.root', fullscreen: null, opener: null });
  assert.notEqual(initialState(), initialState(), 'a fresh value each time');
});

test('pure transitions: only the five base routes are primary; one detail at a time; closing always works', () => {
  let state = initialState();
  for (const route of BASE) {
    assert.equal(asPrimaryRoute(route), route);
    state = navigateState(state, route);
    assert.equal(state.primary, route);
  }
  for (const bad of NOT_PRIMARY) {
    assert.equal(asPrimaryRoute(bad), null, String(bad));
    assert.equal(navigateState(state, bad), state, `${String(bad)} changes nothing`);
  }
  const opener = { itemId: 'w1', ref: 'intent:i1' };
  const progress = progressState(state, opener);
  assert.deepEqual(progress.fullscreen, { phase: 'progress', itemId: 'w1' });
  const open = openState(progress, opener, 'd2', RESULT('a'));
  assert.deepEqual(open.fullscreen, { phase: 'open', itemId: 'd2', result: RESULT('a') });
  const replaced = openState(open, { itemId: 'w3', ref: 'intent:i2' }, 'd4', RESULT('b'));
  assert.equal(replaced.fullscreen.itemId, 'd4', 'a second open replaces the first');
  assert.deepEqual(replaced.opener, { itemId: 'w3', ref: 'intent:i2' });
  assert.deepEqual(closedState(replaced), { ...replaced, fullscreen: null, opener: null });
  assert.equal(closedState(initialState()).fullscreen, null);
  assert.deepEqual(navigateState(open, 'shell.privacy'), { ...open, primary: 'shell.privacy', fullscreen: null, opener: null }, 'leaving for a route closes the detail');
});

test('no route key or URL opens a fullscreen: the module has no key-based opener', () => {
  const exported = Object.keys(shellModule);
  assert.ok(!exported.some((n) => /openFullscreen|openRoute|openKey/i.test(n)), exported.join(','));
  const src = fs.readFileSync(path.join(SH, 'src/shell/shell.ts'), 'utf8');
  assert.ok(!/resolveRoute\(|location|href|hash/.test(src.replace(/^\s*\/\/.*$/gm, '')), 'the shell reads no address');
  const { port } = makeHistory();
  const shell = createShell({ history: port });
  for (const key of ['fs.booking', 'fs.calendar', 'shell.pay', 'detail']) {
    shell.navigate(key);
    assert.equal(shell.view().fullscreen, null);
    assert.equal(shell.view().primary, 'shell.root');
  }
});

// ── the controller ─────────────────────────────────────────────────────────────────────────────

const makeSource = (timelineIds = ['w1', 'w3']) => {
  const released = [];
  let n = 0;
  return {
    released,
    source: {
      openDetail: (env) => (env === 'refuse' ? null : { itemId: `d${++n}`, result: RESULT(env.kind ?? 'x') }),
      releaseDetail: (id) => released.push(id),
      hasTimelineItem: (id) => timelineIds.includes(id),
    },
  };
};

test('PROGRESS → OPEN → close: one history entry for the current address, popped once; the opener is kept for focus return', () => {
  const { h, port } = makeHistory();
  const shell = createShell({ history: port });
  const { source, released } = makeSource();
  shell.connect(source);
  const views = [];
  shell.subscribe((v) => views.push(v.fullscreen?.phase ?? null));
  const opener = { itemId: 'w1', ref: 'intent:i1' };

  shell.openProgress(opener);
  assert.deepEqual(shell.view().fullscreen, { phase: 'progress', itemId: 'w1' });
  assert.deepEqual(shell.state().opener, opener);
  assert.equal(h.pushes, 1);
  assert.ok(h.args.every((a) => a.length === 0), 'push takes no URL: the address never changes');

  const presented = shell.presentDetail({ kind: 'SCHEDULE' }, opener);
  assert.deepEqual(presented, { presented: true, itemId: 'd1' });
  assert.equal(shell.view().fullscreen.phase, 'open');
  assert.equal(h.pushes, 1, 'PROGRESS → OPEN reuses the entry');

  const second = shell.presentDetail({ kind: 'REPORT' }, { itemId: 'w3', ref: 'intent:i2' });
  assert.equal(second.itemId, 'd2');
  assert.deepEqual(released, ['d1'], 'the replaced detail releases its tokens');
  assert.equal(h.pushes, 1, 'exactly one detail at a time, one entry');

  shell.closeDetail();
  assert.equal(shell.view().fullscreen, null);
  assert.equal(shell.state().opener, null);
  assert.deepEqual(released, ['d1', 'd2']);
  assert.equal(h.backs, 1);
  shell.closeDetail();
  assert.equal(h.backs, 1, 'closing twice pops once');
  assert.deepEqual(views, ['progress', 'open', 'open', null]);
});

test('Back closes the detail without popping another entry; Esc/Close pops the entry it pushed', () => {
  const { h, port } = makeHistory();
  const shell = createShell({ history: port });
  const { source } = makeSource();
  shell.connect(source);
  shell.presentDetail({ kind: 'SCHEDULE' }, { itemId: 'w1', ref: 'intent:i1' });
  assert.equal(h.pushes, 1);
  h.listener();
  assert.equal(shell.view().fullscreen, null);
  assert.equal(h.backs, 0, 'the browser already popped it');
  h.listener();
  assert.equal(h.backs, 0, 'a Back with no detail does nothing');

  shell.presentDetail({ kind: 'SCHEDULE' }, { itemId: 'w1', ref: 'intent:i1' });
  assert.equal(h.pushes, 2);
  shell.closeDetail();
  assert.equal(h.backs, 1);
});

test('closeProgress closes only a PROGRESS detail for that item; navigate closes any detail (P-06: the conversation is one action away)', () => {
  const { h, port } = makeHistory();
  const shell = createShell({ history: port });
  const { source } = makeSource();
  shell.connect(source);
  shell.openProgress({ itemId: 'w1', ref: 'intent:i1' });
  shell.closeProgress('w3');
  assert.equal(shell.view().fullscreen.phase, 'progress', 'another item\'s outcome leaves it');
  shell.presentDetail({ kind: 'SCHEDULE' }, { itemId: 'w1', ref: 'intent:i1' });
  shell.closeProgress('w1');
  assert.equal(shell.view().fullscreen.phase, 'open', 'an OPEN detail is not closed by a late progress outcome');

  shell.navigate('shell.privacy');
  assert.deepEqual(shell.view(), { primary: 'shell.privacy', fullscreen: null });
  assert.equal(h.backs, 1);
  shell.navigate('shell.root');
  assert.deepEqual(shell.view(), { primary: 'shell.root', fullscreen: null }, 'one action back to the conversation');
});

test('presentDetail refuses without a source, without a timeline opener, and when the source refuses', () => {
  const { h, port } = makeHistory();
  const shell = createShell({ history: port });
  assert.deepEqual(shell.presentDetail({}, { itemId: 'w1', ref: 'intent:i1' }), { presented: false, reason: 'no_source' });
  const { source } = makeSource(['w1']);
  const disconnect = shell.connect(source);
  assert.deepEqual(shell.presentDetail({}, null), { presented: false, reason: 'no_opener' });
  assert.deepEqual(shell.presentDetail({}, { itemId: 'd9', ref: 'intent:i1' }), { presented: false, reason: 'no_opener' });
  assert.deepEqual(shell.presentDetail('refuse', { itemId: 'w1', ref: 'intent:i1' }), { presented: false, reason: 'refused' });
  assert.equal(shell.view().fullscreen, null);
  assert.equal(h.pushes, 0);
  disconnect();
  assert.deepEqual(shell.presentDetail({}, { itemId: 'w1', ref: 'intent:i1' }), { presented: false, reason: 'no_source' });
});

test('sign-out closes the detail and returns to the root route', () => {
  const { port } = makeHistory();
  let view = { signedIn: true, display: { userName: 'Стас', tenantName: null } };
  const listeners = new Set();
  const shell = createShell({ history: port, session: { view: () => view, subscribe: (l) => (listeners.add(l), () => listeners.delete(l)) } });
  const { source, released } = makeSource();
  shell.connect(source);
  shell.navigate('shell.account');
  shell.presentDetail({ kind: 'SCHEDULE' }, { itemId: 'w1', ref: 'intent:i1' });
  view = { signedIn: false, reason: 'session_revoked' };
  for (const l of [...listeners]) l(view);
  assert.deepEqual(shell.view(), { primary: 'shell.root', fullscreen: null });
  assert.deepEqual(released, ['d1']);
  shell.dispose();
  assert.equal(listeners.size, 0);
});

test('signed out, the primary route stays the root (SH-04); a route landed while signed out applies at sign-in', () => {
  const { port } = makeHistory();
  let view = { signedIn: false, reason: null };
  const listeners = new Set();
  const set = (next) => ((view = next), [...listeners].forEach((l) => l(next)));
  const shell = createShell({ history: port, session: { view: () => view, subscribe: (l) => (listeners.add(l), () => listeners.delete(l)) } });
  shell.navigate('shell.privacy');
  assert.deepEqual(shell.view(), { primary: 'shell.root', fullscreen: null }, 'no route screen replaces the signed-out root');
  set({ signedIn: true, display: { userName: 'Стас', tenantName: null } });
  assert.equal(shell.view().primary, 'shell.privacy');
  set({ signedIn: false, reason: 'signed_out' });
  assert.equal(shell.view().primary, 'shell.root');
  shell.navigate('shell.account');
  shell.navigate('shell.root');
  set({ signedIn: true, display: { userName: 'Стас', tenantName: null } });
  assert.equal(shell.view().primary, 'shell.root', 'the last request wins; the root clears it');
  shell.navigate('fs.booking');
  assert.equal(shell.view().primary, 'shell.root');
});

test('the runtime: one widget port for the DOM, a real detail at SHEET density, and the fragment landed without a request', async () => {
  const { h, port } = makeHistory();
  let chats = 0;
  let submits = 0;
  const runtime = createShellRuntime({
    transport: { chat: () => ((chats += 1), new Promise(() => undefined)) },
    session: { view: () => ({ signedIn: true, display: { userName: 'Стас', tenantName: null } }), subscribe: () => () => undefined },
    render,
    environment: { a11y: () => A11Y, onA11yChange: () => () => undefined, fragment: () => '#r=shell.privacy' },
    scheduler: { now: () => Date.parse(INDEX.now), after: () => () => undefined },
    history: port,
    newAbort: () => new AbortController(),
    submission: { submit: () => ((submits += 1), Promise.resolve({ status: 'unavailable' })) },
  });
  assert.deepEqual(Object.keys(runtime.widgetPort).sort(), ['activate', 'closeDetail', 'navigate', 'subscribe', 'view']);
  assert.deepEqual(runtime.landFragment(), { landed: 'route', route: 'shell.privacy' });
  assert.equal(runtime.widgetPort.view().primary, 'shell.privacy');

  const opener = runtime.widgets.ingest(envelope('kind-schedule'));
  const presented = runtime.shell.presentDetail(envelope('kind-booking-confirmation'), { itemId: opener.itemId, ref: 'intent:i1' });
  assert.equal(presented.presented, true);
  const shown = runtime.widgetPort.view().fullscreen;
  assert.equal(shown.phase, 'open');
  assert.equal(shown.result.density, 'SHEET');
  assert.equal(shown.result.kind, 'BOOKING_CONFIRMATION');
  assert.equal(h.pushes, 1);
  // The escape inside the detail is local and closes it.
  runtime.widgetPort.activate(presented.itemId, 'intent:i9');
  await new Promise((r) => setImmediate(r));
  assert.equal(runtime.widgetPort.view().fullscreen, null);
  assert.equal(h.backs, 1);
  assert.equal(chats + submits, 0);
  runtime.dispose();
});
