// K5 / S4 — the NT8 deep-link parser and landing (src/shell/deeplink.ts; WC NT8, E14, R3.3.4, R3.3.5;
// SHELL-PLAN v2.1 §1.5F; D3; P-01, P-03).
//
//   node --test test/deeplink.test.mjs
//
// The §1.5F table, row by row: the five base routes without a handle switch the primary route; a
// widget handle ends in a sentence with 0 requests in P1; every `fs.*`, `detail`, `i`, `c`,
// `shell.pay`, `shell.file` and anything else is refused with a sentence — never a screen, never a
// sign-in page, never a request. The parser returns `{route_key, opaque_handle}` and nothing else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_FRAGMENT_CHARS, landDeepLink, parseDeepLink } from '../src/shell/deeplink.ts';
import { createShellRuntime } from '../src/shell/shell.ts';
import { render } from '../src/renderer/render.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');

const BASE = ['shell.root', 'shell.account', 'shell.connections', 'shell.privacy', 'shell.notifications'];
const NINE = ['fs.booking', 'fs.client-card', 'fs.calendar', 'fs.catalogue', 'fs.team-thread', 'fs.report', 'fs.consent', 'fs.payment', 'fs.media'];
const HANDLE = 'abcdefgh12';

test('row 1: #r=<one of the five base routes> with no handle is a primary route switch', () => {
  for (const route of BASE) {
    for (const fragment of [`#r=${route}`, `r=${route}`, `#r=${route}&booking_tenant=male-esthetic&tips=123`, `#tips=1&r=${route}`, `#r=${route}&`]) {
      const parsed = parseDeepLink(fragment);
      assert.deepEqual(parsed, { kind: 'link', link: { route_key: route, opaque_handle: null } }, fragment);
      assert.deepEqual(Object.keys(parsed.link).sort(), ['opaque_handle', 'route_key'], 'two fields, nothing business-shaped');
    }
    for (const fragment of [`#r=${route}&h=${HANDLE}`, `#r=${route}&h=`, `#r=${route}&h`]) assert.deepEqual(parseDeepLink(fragment), { kind: 'refused' }, `${fragment}: a base route takes no handle`);
  }
});

test('row 2: #r=w&h=<opaque handle, 8..64 of [A-Za-z0-9_-]> is a widget link; any other handle is refused', () => {
  for (const handle of ['abcdefgh', HANDLE, 'A'.repeat(64), '01M2Q9G7M0TVG8K63F7CPYH1HN', 'a_b-c_d-e']) {
    assert.deepEqual(parseDeepLink(`#r=w&h=${handle}`), { kind: 'link', link: { route_key: 'w', opaque_handle: handle } }, handle);
    assert.deepEqual(parseDeepLink(`#h=${handle}&r=w`), { kind: 'link', link: { route_key: 'w', opaque_handle: handle } });
  }
  for (const handle of ['abcdefg', 'A'.repeat(65), 'abc/defgh', 'abc%2Fdefgh', 'abc.defgh', 'abcdefgh=', 'абвгдежз', 'abcd efgh', '', 'abcdefgh#x']) {
    assert.deepEqual(parseDeepLink(`#r=w&h=${handle}`), { kind: 'refused' }, JSON.stringify(handle));
  }
  assert.deepEqual(parseDeepLink('#r=w'), { kind: 'refused' }, 'a widget link needs its handle');
});

test('row 3: fs.*, detail, i, c, shell.pay, shell.file and anything else are refused, with or without a handle', () => {
  const refusedKeys = [...NINE, 'detail', 'i', 'c', 'shell.pay', 'shell.file', 'maya', 'SHELL.ROOT', ' shell.root', 'shell.root ', 'shell.root%20', 'fs.unknown', '__proto__', 'constructor', 'W', 'ww', ''];
  for (const key of refusedKeys) {
    assert.deepEqual(parseDeepLink(`#r=${key}`), { kind: 'refused' }, `r=${key}`);
    assert.deepEqual(parseDeepLink(`#r=${key}&h=${HANDLE}`), { kind: 'refused' }, `r=${key}&h`);
  }
  for (const fragment of [`#r=shell.root&r=shell.privacy`, `#r=w&h=${HANDLE}&h=${HANDLE}`, `#r=w&r=w&h=${HANDLE}`, `#r=${'x'.repeat(MAX_FRAGMENT_CHARS)}`])
    assert.deepEqual(parseDeepLink(fragment), { kind: 'refused' }, fragment.slice(0, 40));
});

test('no link at all: an empty fragment or one without `r` lands nowhere; other keys are ignored', () => {
  for (const fragment of ['', '#', '#tips=123', '#booking_tenant=male-esthetic', `#h=${HANDLE}`, '#&&', '#rr=shell.root', '#R=shell.root', null, undefined, 42])
    assert.deepEqual(parseDeepLink(fragment), { kind: 'none' }, String(fragment));
});

test('landing: route → navigate once; widget → the unavailable sentence; refused → the refused sentence; none → nothing', () => {
  const run = (fragment) => {
    const calls = { navigate: [], notice: [] };
    const landed = landDeepLink(fragment, { navigate: (r) => calls.navigate.push(r), notice: (k) => calls.notice.push(k) });
    return { landed, ...calls };
  };
  assert.deepEqual(run('#r=shell.privacy'), { landed: { landed: 'route', route: 'shell.privacy' }, navigate: ['shell.privacy'], notice: [] });
  assert.deepEqual(run(`#r=w&h=${HANDLE}`), { landed: { landed: 'widget_unavailable' }, navigate: [], notice: ['deeplink_unavailable'] });
  assert.deepEqual(run(`#r=fs.booking&h=abcdefgh`), { landed: { landed: 'refused' }, navigate: [], notice: ['deeplink_refused'] });
  assert.deepEqual(run('#r=shell.pay&h=abcdefgh'), { landed: { landed: 'refused' }, navigate: [], notice: ['deeplink_refused'] });
  assert.deepEqual(run('#tips=1'), { landed: { landed: 'none' }, navigate: [], notice: [] });
});

test('through the runtime (§2.7 step 12): 0 requests, no dialog, no screen, and the fragment\'s bytes are never echoed', async () => {
  const runFragment = (fragment) => {
    const counts = { chat: 0, submit: 0, push: 0 };
    const runtime = createShellRuntime({
      transport: { chat: () => ((counts.chat += 1), new Promise(() => undefined)) },
      session: { view: () => ({ signedIn: false, reason: null }), subscribe: () => () => undefined },
      render,
      environment: { a11y: () => ({}), onA11yChange: () => () => undefined, fragment: () => fragment },
      scheduler: { now: () => 0, after: () => () => undefined },
      history: { push: () => (counts.push += 1), back() {}, onBack: () => () => undefined },
      newAbort: () => new AbortController(),
      submission: { submit: () => ((counts.submit += 1), Promise.resolve({ status: 'unavailable' })) },
    });
    const landed = runtime.landFragment();
    const out = { landed, counts, shell: runtime.shell.view(), timeline: runtime.conversation.view() };
    runtime.dispose();
    return out;
  };
  const fs1 = runFragment('#r=fs.booking&h=abcdefgh');
  assert.deepEqual(fs1.landed, { landed: 'refused' });
  assert.deepEqual(fs1.shell, { primary: 'shell.root', fullscreen: null });
  assert.deepEqual(fs1.timeline.items.map((i) => i.notice), ['deeplink_refused']);
  assert.ok(!JSON.stringify(fs1.timeline).includes('abcdefgh') && !JSON.stringify(fs1.timeline).includes('fs.booking'));

  const privacy = runFragment('#r=shell.privacy');
  assert.deepEqual(privacy.landed, { landed: 'route', route: 'shell.privacy' });
  assert.deepEqual(privacy.shell, { primary: 'shell.root', fullscreen: null }, 'signed out: the root (sign-in) stays; the route applies at sign-in (shell.test.mjs)');
  assert.deepEqual(privacy.timeline.items, []);

  const widget = runFragment('#r=w&h=abcdefgh12');
  assert.deepEqual(widget.landed, { landed: 'widget_unavailable' });
  assert.deepEqual(widget.timeline.items.map((i) => i.notice), ['deeplink_unavailable']);
  assert.ok(!JSON.stringify(widget.timeline).includes('abcdefgh12'));
  assert.deepEqual(widget.shell, { primary: 'shell.root', fullscreen: null });

  const hostile = runFragment('#r=shell.root&booking_tenant=x&tips=123');
  assert.deepEqual(hostile.shell, { primary: 'shell.root', fullscreen: null });
  assert.deepEqual(hostile.timeline.items, []);

  for (const r of [fs1, privacy, widget, hostile]) assert.deepEqual(r.counts, { chat: 0, submit: 0, push: 0 });
  // Signed out: the landing still makes no sign-in route and no request (SH-04, E14).
  assert.equal(fs1.timeline.composer.reason, 'signed_out');
});

test('the parser decodes nothing and reads no address itself', () => {
  const src = fs.readFileSync(path.join(SH, 'src/shell/deeplink.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  for (const banned of ['decodeURI', 'URLSearchParams', 'new URL', 'location', 'history', 'unescape', 'tenant', 'slug', 'price', 'staff']) assert.ok(!src.includes(banned), banned);
});
