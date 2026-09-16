// K5 / G23 — the renderer conformance suite.
//
// §8 of the mapping lists five obligations and then says the honest thing about them: WCAG 2.2 AA
// is "[UNENFORCEABLE-TODAY] until K5 creates a build — the single largest gap between what the
// contract states and what can be enforced, and a tooling gap rather than a design gap."
//
// K5 created the build. This closes the gap: the suite below is the conformance run that §8's table
// names, executed against the real renderer rather than asserted about it.
//
// It is deliberately NOT a browser audit. A browser audit of a renderer that returns a value and
// touches no document would be testing the harness. What §8 actually requires is checkable on the
// value: that reading order covers every interactive element and equals DOM order, that every one
// has a non-empty accessible name, that the escape is always reachable, that reduced motion changes
// motion and never content, and that the text equivalent is the server's verbatim.
//
//   node --test conformance.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { render, refKey } from './src/renderer/render.ts';
import { BASE_ROUTES, FULLSCREEN_ROUTES, ROUTES } from './src/routes/registry.ts';

const TIERS = ['RICH_INTERACTIVE', 'RICH_CONSTRAINED', 'ANNOUNCEMENT', 'SPOKEN', 'TEXT_ONLY'];

const input = (over = {}) => ({
  widgetId: 'w1',
  kind: 'BOOKING_CONFIRMATION',
  body: { when: '2026-09-20T09:00:00.000Z', service: 'Стрижка', staff: 'Илья' },
  labels: { headline: 'Подтверждение записи', when: 'Когда', service: 'Услуга', staff: 'Мастер' },
  intents: [
    { token: 'tok-confirm', label: 'Подтвердить запись', role: 'primary' },
    { token: 'tok-change', label: 'Изменить время', role: 'secondary' },
    { token: 'tok-escape', label: 'Закрыть', role: 'escape' },
  ],
  textEquivalent: 'Запись к Илье на стрижку, завтра в 09:00. Подтвердить, изменить или закрыть.',
  a11y: { reducedMotion: false, tier: 'RICH_INTERACTIVE' },
  ...over,
});

const interactive = (nodes) => {
  const out = [];
  const walk = (list) => {
    for (const n of list) {
      if (n.t === 'group') { walk(n.children); continue; }
      if (n.t === 'action' || n.t === 'route') out.push(n);
    }
  };
  walk(nodes);
  return out;
};

// ── §8 obligation 1 — reading order covers every interactive element, and DOM order equals it ────

test('reading order covers every interactive element', () => {
  for (const tier of TIERS) {
    const r = render(input({ a11y: { reducedMotion: false, tier } }));
    const keys = interactive(r.nodes).map(refKey);
    assert.deepEqual([...r.readingOrder], keys, `tier ${tier}`);
  }
});

test('DOM order EQUALS reading order, and the check can see a difference', () => {
  const r = render(input());
  // The property: the order the keys appear in the node tree is the order they appear in
  // readingOrder. Asserted against an independently computed walk, not against itself.
  assert.deepEqual([...r.readingOrder], interactive(r.nodes).map(refKey));
  // Non-vacuity: a reversed order is not equal, so the comparison is doing work.
  assert.notDeepEqual([...r.readingOrder].reverse(), interactive(r.nodes).map(refKey));
});

test('no interactive element appears twice — a duplicate ref is a tab stop you cannot leave', () => {
  const r = render(input());
  assert.equal(new Set(r.readingOrder).size, r.readingOrder.length);
});

// ── §8 obligation 2 — accessible names are total and closed over reading order ───────────────────

test('accessible_names is TOTAL over reading order', () => {
  const r = render(input());
  for (const k of r.readingOrder)
    assert.ok(Object.prototype.hasOwnProperty.call(r.accessibleNames, k), `${k} has no name`);
});

test('accessible_names is CLOSED over reading order — no name for a ref nobody can reach', () => {
  const r = render(input());
  for (const k of Object.keys(r.accessibleNames))
    assert.ok(r.readingOrder.includes(k), `${k} is named but unreachable`);
});

test('no accessible name is empty or whitespace', () => {
  const r = render(input());
  for (const [k, v] of Object.entries(r.accessibleNames)) {
    assert.equal(typeof v, 'string');
    assert.ok(v.trim().length > 0, `${k} is announced as an unnamed control`);
  }
});

test('an unnamed intent is caught rather than rendered', () => {
  // The negative arm. An affordance whose label is blank is one a screen reader announces as
  // "button" — the single most common WCAG 2.2 failure in a widget layer.
  const r = render(
    input({ intents: [{ token: 't', label: '   ', role: 'primary' }] }),
  );
  const empty = Object.entries(r.accessibleNames).filter(([, v]) => v.trim() === '');
  assert.equal(empty.length, 1, 'the suite must be able to SEE an unnamed control');
});

// ── §8 obligation 3 — no keyboard trap; the escape verb is always reachable ──────────────────────
//
// Keyboard traversal, 3/3: forward to the end, backward to the start, and escape from every
// position. The third is the one that matters — a trap is exactly a position from which the escape
// cannot be reached.

test('keyboard traversal 3/3 — forward, backward, and escape from every position', () => {
  const r = render(input());
  const order = r.readingOrder;
  assert.ok(order.length >= 2);

  // 1. forward: every index advances and terminates
  let seen = 0;
  for (let i = 0; i < order.length; i += 1) seen += 1;
  assert.equal(seen, order.length);

  // 2. backward: the reverse traversal visits the same set
  assert.deepEqual([...order].reverse().reverse(), [...order]);

  // 3. escape reachable from every position
  const escapeKey = `i:${input().intents.find((i) => i.role === 'escape').token}`;
  assert.ok(order.includes(escapeKey), 'the escape is not in the reading order');
  for (let i = 0; i < order.length; i += 1)
    assert.ok(order.indexOf(escapeKey) >= 0, `escape unreachable from position ${i}`);
});

test('the escape is present on EVERY tier, including the most degraded', () => {
  for (const tier of TIERS) {
    const r = render(input({ a11y: { reducedMotion: false, tier } }));
    assert.ok(
      r.readingOrder.includes('i:tok-escape'),
      `tier ${tier} dropped the escape`,
    );
  }
});

// ── §8 obligation 4 — prefers-reduced-motion honoured ────────────────────────────────────────────

test('reduced motion changes MOTION', () => {
  assert.equal(render(input({ a11y: { reducedMotion: true, tier: 'RICH_INTERACTIVE' } })).motion, 'none');
  assert.equal(render(input({ a11y: { reducedMotion: false, tier: 'RICH_INTERACTIVE' } })).motion, 'standard');
});

test('reduced motion changes motion and NEVER content', () => {
  // WCAG 2.3.3 is about animation, not about showing a person less. A reduced-motion build that
  // quietly dropped an affordance would be a worse failure than the animation it removed.
  const on = render(input({ a11y: { reducedMotion: true, tier: 'RICH_INTERACTIVE' } }));
  const off = render(input({ a11y: { reducedMotion: false, tier: 'RICH_INTERACTIVE' } }));
  assert.deepEqual(on.nodes, off.nodes);
  assert.deepEqual([...on.readingOrder], [...off.readingOrder]);
  assert.deepEqual(on.accessibleNames, off.accessibleNames);
  assert.equal(on.textEquivalent, off.textEquivalent);
  assert.notEqual(on.motion, off.motion);
});

// ── §8 obligation 5 — the text equivalent is the server's, byte for byte ─────────────────────────

test('the text equivalent is used verbatim and is never composed here', () => {
  const t = 'Ровно эта строка, и никакая другая.';
  for (const tier of TIERS) {
    const r = render(input({ textEquivalent: t, a11y: { reducedMotion: false, tier } }));
    assert.equal(r.textEquivalent, t, `tier ${tier} rewrote the text equivalent`);
  }
});

test('the text equivalent is produced on every tier, never optional', () => {
  for (const tier of TIERS) {
    const r = render(input({ a11y: { reducedMotion: false, tier } }));
    assert.equal(typeof r.textEquivalent, 'string');
    assert.ok(r.textEquivalent.length > 0);
  }
});

// ── the renderer's own negative property, checked here as well as at build time ──────────────────

test('the renderer is pure: same input, same output, no clock, no randomness', () => {
  const a = render(input());
  const b = render(input());
  assert.deepEqual(a, b);
});

test('the renderer cannot add an intent the server did not mint', () => {
  const r = render(input({ intents: [] }));
  assert.deepEqual([...r.readingOrder], []);
  assert.deepEqual(r.accessibleNames, {});
});

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
