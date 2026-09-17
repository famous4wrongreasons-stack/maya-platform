// K5 / G23 — the route registry's conformance tests.
//
// The first two tests moved unchanged from conformance.test.mjs in S0; the renderer's half lives
// in renderer.conformance.test.mjs. S1 adds the contract spelling (WC §3.3 `ShellRoute`), the F71
// parameter handle, router honesty over inherited names, and `resolveTarget` over every target
// class — including the bare keys it must refuse.
//
//   node --test test/routes.conformance.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_ROUTES,
  BASE_ROUTES,
  FULLSCREEN_ROUTES,
  RETIRED_OVERLAYS,
  ROUTES,
  SHELL_ROUTES,
  intentSet,
  isRouteParam,
  resolveRoute,
  resolveTarget,
} from '../src/routes/registry.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_INTENT = path.join(HERE, '..', '..', 'maya-saas-backend', 'src', 'widget-contract', 'intent.ts');

// ── the route registry's own a11y obligation: every destination has a name ───────────────────────

test('every route has a human label — a destination with no name cannot be announced', () => {
  for (const key of [...BASE_ROUTES, ...FULLSCREEN_ROUTES]) {
    const def = ROUTES[key];
    assert.ok(def, `${key} has no definition`);
    assert.ok(def.label.trim().length > 0, `${key} has no label`);
  }
});

test('the primary navigation is five, which is the signed D2 target', () => {
  assert.equal(BASE_ROUTES.length, 5);
});

// ── contract spelling ──────────────────────────────────────────────────────────────────────────────

/** The route literals of the generated contract's `ShellRoute`, read from its source text. */
const contractShellRoutes = () => {
  const text = fs.readFileSync(CONTRACT_INTENT, 'utf8');
  const start = text.indexOf('export type ShellRoute =');
  const end = text.indexOf('export type DetailRouteKey', start);
  assert.ok(start >= 0 && end > start, 'the contract declares ShellRoute before DetailRouteKey');
  const block = text.slice(start, end).replace(/\/\/[^\n]*/g, '');
  const base = [];
  const param = [];
  for (const member of block.split(/\|\s*\{/).slice(1)) {
    const routes = [...member.matchAll(/'(shell\.[a-z]+)'/g)].map((m) => m[1]);
    if (/param:\s*null/.test(member)) base.push(...routes);
    else if (/param:\s*string/.test(member)) param.push(...routes);
  }
  return { base, param };
};

test('the five base routes and the two hand-offs are spelled exactly as the contract spells them', () => {
  const contract = contractShellRoutes();
  assert.deepEqual([...BASE_ROUTES], ['shell.root', 'shell.account', 'shell.connections', 'shell.privacy', 'shell.notifications']);
  assert.deepEqual([...BASE_ROUTES], contract.base);
  assert.deepEqual([...SHELL_ROUTES], ['shell.pay', 'shell.file']);
  assert.deepEqual([...SHELL_ROUTES], contract.param);
});

test('no pre-contract spelling resolves', () => {
  for (const old of ['maya', 'account', 'connections', 'privacy-and-data', 'notifications'])
    assert.equal(resolveRoute(old), null, `${old} still resolves`);
});

// ── router honesty ─────────────────────────────────────────────────────────────────────────────────

test('router honesty: every registry key resolves to its own row, and nothing else resolves', () => {
  assert.equal(ALL_ROUTES.length, 16);
  assert.equal(new Set(ALL_ROUTES).size, 16);
  for (const key of ALL_ROUTES) assert.equal(resolveRoute(key)?.key, key);
  for (const key of ['x', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'shell.', 'SHELL.ROOT', ' shell.root', 'shell.root ', 'fs.', 'detail', 'w', 'i', 'c'])
    assert.equal(resolveRoute(key), null, `"${key}" resolved`);
});

test('the route lists are frozen: nothing can add a route at runtime', () => {
  for (const [name, list] of Object.entries({ BASE_ROUTES, SHELL_ROUTES, FULLSCREEN_ROUTES, ALL_ROUTES })) {
    assert.ok(Object.isFrozen(list), `${name} is not frozen`);
    assert.throws(() => list.push('shell.admin'), TypeError);
  }
  assert.ok(Object.isFrozen(ROUTES));
  assert.equal(resolveRoute('shell.admin'), null);
});

test('six overlays -> nine fs.* route keys, unchanged, each reached by a fullscreen intent', () => {
  assert.deepEqual([...FULLSCREEN_ROUTES], [
    'fs.booking', 'fs.client-card', 'fs.calendar', 'fs.catalogue', 'fs.team-thread', 'fs.report', 'fs.consent', 'fs.payment', 'fs.media',
  ]);
  assert.equal(RETIRED_OVERLAYS.length, 6);
  for (const key of FULLSCREEN_ROUTES) assert.equal(ROUTES[key].fullscreenIntent, `${key}.open`);
  for (const key of BASE_ROUTES) assert.equal(ROUTES[key].fullscreenIntent, null, `${key} is a destination, not a surface`);
});

// ── F71: the one opaque parameter ────────────────────────────────────────────────────────────────

test('a shell route parameter is an opaque handle matching /^[A-Za-z0-9_-]{8,64}$/ and nothing else (F71)', () => {
  for (const ok of ['abcdefgh', 'A'.repeat(64), 'Az09_-Az', 'sess_0123456789-ABC'])
    assert.equal(isRouteParam(ok), true, `refused ${ok}`);
  const refusedValues = [
    'abcdefg', 'A'.repeat(65), '', 'abc/defgh', 'abcdefgh?x=1', 'https://x.example', 'abcdefgh\n', 'abcd efgh',
    'абвгдежз', '../../../..', 'abcdefgh#', 'abc.defgh', null, undefined, 12345678, {}, ['abcdefgh'],
  ];
  for (const bad of refusedValues) assert.equal(isRouteParam(bad), false, `admitted ${JSON.stringify(bad)}`);
});

// ── resolveTarget: typed targets resolve, bare keys never do ─────────────────────────────────────

test('class s: the five base routes resolve with param null and refuse any parameter', () => {
  for (const route of BASE_ROUTES) {
    assert.deepEqual(resolveTarget({ class: 's', ref: { route, param: null } }), { kind: 'base', key: route });
    assert.deepEqual(resolveTarget({ class: 's', ref: { route, param: 'abcdefgh' } }), { kind: 'refused', reason: 'param_refused' });
  }
});

test('class s: shell.pay and shell.file resolve only with a valid opaque handle', () => {
  for (const route of SHELL_ROUTES) {
    assert.deepEqual(resolveTarget({ class: 's', ref: { route, param: 'sess_abcdefgh' } }), { kind: 'handoff', key: route, param: 'sess_abcdefgh' });
    for (const param of [null, undefined, '', 'short', 'https://pay.example/x', 'abcdefgh/../x', 42])
      assert.deepEqual(resolveTarget({ class: 's', ref: { route, param } }), { kind: 'refused', reason: 'param_invalid' }, `${route} with ${JSON.stringify(param)}`);
  }
});

test('bare keys are refused: a key string is never a target, and a class-s ref is never a key string', () => {
  for (const key of [...ALL_ROUTES, 'maya', 'privacy-and-data']) {
    assert.deepEqual(resolveTarget(key), { kind: 'refused', reason: 'bare_key' }, `bare "${key}"`);
    assert.deepEqual(resolveTarget({ class: 's', ref: key }), { kind: 'refused', reason: 'bare_key' }, `class s with "${key}"`);
  }
});

test('class s: a route the registry does not hold is refused, including every fs.* key', () => {
  for (const route of [...FULLSCREEN_ROUTES, 'shell.admin', 'privacy-and-data', 'maya', '__proto__', ''])
    assert.deepEqual(resolveTarget({ class: 's', ref: { route, param: null } }), { kind: 'refused', reason: 'unknown_route' }, route);
  assert.deepEqual(resolveTarget({ class: 's', ref: null }), { kind: 'refused', reason: 'malformed' });
  assert.deepEqual(resolveTarget({ class: 's', ref: 7 }), { kind: 'refused', reason: 'malformed' });
});

test('class detail: only the nine fs.* keys resolve (R7-E3 default)', () => {
  for (const key of FULLSCREEN_ROUTES) assert.deepEqual(resolveTarget({ class: 'detail', ref: key }), { kind: 'detail', key });
  for (const ref of [...BASE_ROUTES, ...SHELL_ROUTES, 'fs.unknown', 'fs.booking ', 'FS.BOOKING', 'booking', '', 'constructor'])
    assert.deepEqual(resolveTarget({ class: 'detail', ref }), { kind: 'refused', reason: 'unknown_detail' }, `detail "${ref}"`);
  for (const ref of [null, undefined, 1, { route: 'fs.booking' }])
    assert.deepEqual(resolveTarget({ class: 'detail', ref }), { kind: 'refused', reason: 'malformed' });
});

test('classes w, i and c never resolve to a route, whatever their ref names', () => {
  assert.deepEqual(resolveTarget({ class: 'w', ref: 'fs.booking' }), { kind: 'refused', reason: 'not_a_route' });
  assert.deepEqual(resolveTarget({ class: 'i', ref: 'shell.root' }), { kind: 'refused', reason: 'not_a_route' });
  assert.deepEqual(resolveTarget({ class: 'c', ref: { space: 'C9', key: 'shell.pay' }, scope_ref: null }), { kind: 'refused', reason: 'not_a_route' });
});

test('anything that is not an IntentTarget is refused as malformed', () => {
  for (const t of [null, undefined, 0, true, {}, [], { class: 'x', ref: 'shell.root' }, { class: 'S', ref: { route: 'shell.root', param: null } }, { route: 'shell.root', param: null }])
    assert.deepEqual(resolveTarget(t), { kind: 'refused', reason: 'malformed' }, JSON.stringify(t));
});

// ── role invariance ────────────────────────────────────────────────────────────────────────────────

test('intentSet takes no role and returns the same eleven fullscreen intents every time', () => {
  assert.equal(intentSet.length, 0);
  const a = intentSet();
  assert.deepEqual(a, [...SHELL_ROUTES, ...FULLSCREEN_ROUTES].map((k) => `${k}.open`));
  assert.deepEqual(intentSet(), a);
});
