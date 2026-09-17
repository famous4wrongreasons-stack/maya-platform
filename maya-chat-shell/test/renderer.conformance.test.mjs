// K5 / G23 — the renderer conformance suite (SHELL-PLAN v2.1 §1.11, §2.8; D1, D7).
//
// §8 of the mapping lists five obligations and then says the honest thing about them: WCAG 2.2 AA
// is "[UNENFORCEABLE-TODAY] until K5 creates a build". K5 created the build; this is the conformance
// run §8's table names, executed against the real renderer over contract-shaped envelopes minted by
// dev/make-envelopes.mjs (hashed by the backend's canonicaliser, never by the shell).
//
// It is deliberately NOT a browser audit: the renderer returns a value and touches no document, so
// what §8 requires is checked on the value. The DOM-level halves (focus trap, roving tabindex keys,
// contrast, reflow) are S5's DOM-double tests and the CDP steps.
//
// The first fifteen tests are the original obligations, kept and moved onto the new renderer input;
// the rest are the 22-branch floor (WC §4.8.2), A-1/A-3/A-5/A-6/A-7/A-11/A-12/A-17/A-18, the shell
// half of A-21, per-kind focus and live regions, the H7 fallback, and the token-free input/output.
//
//   node --test test/renderer.conformance.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, interactiveRefs, keyOf } from '../src/renderer/render.ts';
import { KIND_A11Y_FLOOR, KIND_BRANCH_COUNT, KIND_ORDER } from '../src/renderer/kinds.ts';
import { verify } from '../src/integrity/h7.ts';
import { INTERACTIVE_PATHS, NAME_SUFFIX } from '../dev/make-envelopes.mjs';

const SH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const TIERS = ['RICH_INTERACTIVE', 'RICH_CONSTRAINED', 'ANNOUNCEMENT', 'SPOKEN', 'TEXT_ONLY'];
const DETAIL_KEYS = new Set(['fs.booking', 'fs.client-card', 'fs.calendar', 'fs.catalogue', 'fs.team-thread', 'fs.report', 'fs.consent', 'fs.payment', 'fs.media']);
const PROSE_KINDS = new Set(['CHART', 'CONSENT_STATE', 'IDENTITY_BINDING', 'PAYMENT_HANDOFF', 'MEDIA_PREVIEW']);

const envelopeOf = (id) => {
  const f = INDEX.fixtures.find((x) => x.id === id);
  assert.ok(f, `fixture ${id}`);
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, f.file), 'utf8'));
};
const fixture = (id) => INDEX.fixtures.find((x) => x.id === id);

/**
 * An allowlist projection written for this suite (the shell's own is shell/view.ts, S4): every
 * member copied is listed, pointers are rewritten, and target refs and params are dropped (R-2, D1).
 */
const project = (env) => {
  const tokens = new Map(env.intents.filter((i) => i.intent_token).map((i) => [i.intent_token, i.intent_ref]));
  const pointer = (p) => (tokens.has(p) ? { k: 'intent', intent_ref: tokens.get(p) } : DETAIL_KEYS.has(p) ? { k: 'route', key: p } : { k: 'unresolved' });
  const target = (t) => (t === null ? null : t.class === 's' ? { class: 's', route: t.ref.route } : t.class === 'detail' ? { class: 'detail', route_key: t.ref } : { class: t.class });
  return structuredClone({
    kind: env.kind,
    body_version: env.body_version,
    body: env.body,
    provenance: env.provenance,
    limitations: env.limitations,
    presentation: env.presentation,
    lifecycle: { state: env.lifecycle.state, input_lock: env.lifecycle.input_lock, on_expiry: env.lifecycle.on_expiry },
    render: {
      render_tier: env.render.render_tier,
      withheld: env.render.intents_withheld.map((w) => ({ role: w.role, reason: w.reason, reachable_via: pointer(w.reachable_via) })),
      reductions: env.render.body_reductions.map((r) => ({ path: r.path, reduction: r.reduction, restored_by: pointer(r.restored_by) })),
    },
    intents: env.intents.map((i) => ({
      intent_ref: i.intent_ref,
      role: i.role,
      label: i.label,
      utterance_preview: i.utterance_preview,
      priority: i.priority,
      effect: i.effect,
      enabled: i.enabled,
      authority_hint: i.authority_hint,
      input_schema: i.input_schema,
      target: target(i.target),
    })),
  });
};

const A11Y_ENV = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };

/** The renderer input for a fixture, with the verdict computed on the FULL envelope (R-5). */
const inputOf = (id, over = {}) => {
  const env = envelopeOf(id);
  const view = project(env);
  if (over.tier) view.render.render_tier = over.tier;
  if (over.mutate) over.mutate(view);
  return {
    view,
    verdict: over.verdict ?? verify(env, INDEX.now),
    env: { ...A11Y_ENV, ...(over.env ?? {}) },
    density: over.density ?? env.presentation.density,
  };
};
const renderOf = (id, over) => render(inputOf(id, over));

const walk = (nodes, visit) => {
  for (const n of nodes) {
    visit(n);
    if (n.t === 'block' || n.t === 'choice') walk(n.children, visit);
    if (n.t === 'field') walk([...n.help, ...(n.value ? [n.value] : [])], visit);
    if (n.t === 'action' && n.explanation) walk([n.explanation], visit);
    if (n.t === 'table') for (const g of n.groups) for (const r of g.rows) walk([...r.cells.filter(Boolean), ...r.actions], visit);
  }
};
const nodesOfType = (result, t) => {
  const out = [];
  walk(result.nodes, (n) => n.t === t && out.push(n));
  return out;
};
const interactiveNodes = (result) => {
  const out = [];
  walk(result.nodes, (n) => (n.t === 'action' || n.t === 'choice' || n.t === 'field') && out.push(n));
  return out;
};

const KIND_FIXTURES = INDEX.fixtures.filter((f) => f.category === 'kind' && f.id.startsWith('kind-'));
const LIVE_FIXTURES = INDEX.fixtures.filter((f) => f.expect.mode !== 'frozen_prose');
const ESCAPE_FIXTURES = LIVE_FIXTURES.filter((f) => envelopeOf(f.id).intents.some((i) => i.role === 'escape'));

// ── §8 obligation 1 — reading order covers every interactive element, and DOM order equals it ────

test('reading order covers every interactive element', () => {
  for (const tier of TIERS) {
    const r = renderOf('kind-booking-confirmation', { tier });
    assert.deepEqual([...r.readingOrder], interactiveNodes(r).map((n) => n.ref), `tier ${tier}`);
    assert.ok(r.readingOrder.length > 0);
  }
});

test('DOM order EQUALS reading order, and the check can see a difference', () => {
  for (const f of LIVE_FIXTURES) {
    const env = envelopeOf(f.id);
    const r = renderOf(f.id);
    const sealed = env.presentation.a11y.reading_order.map(keyOf);
    assert.deepEqual([...r.readingOrder], sealed, `${f.id}: drawn order differs from the sealed reading_order`);
    assert.deepEqual(interactiveRefs(r.nodes), sealed, f.id);
  }
  // Non-vacuity: a reversed order is not equal, so the comparison is doing work.
  const r = renderOf('kind-booking-confirmation');
  assert.notDeepEqual([...r.readingOrder].reverse(), interactiveRefs(r.nodes));
});

test('no interactive element appears twice — a duplicate ref is a tab stop you cannot leave', () => {
  for (const f of INDEX.fixtures) {
    const r = renderOf(f.id);
    assert.equal(new Set(r.readingOrder).size, r.readingOrder.length, f.id);
  }
});

// ── §8 obligation 2 — accessible names are total and closed over reading order ───────────────────

test('accessible_names is TOTAL over reading order', () => {
  for (const f of INDEX.fixtures) {
    const r = renderOf(f.id);
    for (const k of r.readingOrder) assert.ok(Object.hasOwn(r.accessibleNames, k), `${f.id}: ${k} has no name`);
  }
});

test('accessible_names is CLOSED over reading order — no name for a ref nobody can reach', () => {
  for (const f of INDEX.fixtures) {
    const r = renderOf(f.id);
    for (const k of Object.keys(r.accessibleNames)) assert.ok(r.readingOrder.includes(k), `${f.id}: ${k} is named but unreachable`);
  }
});

test('no accessible name is empty or whitespace', () => {
  for (const f of INDEX.fixtures) {
    const r = renderOf(f.id);
    for (const [k, v] of Object.entries(r.accessibleNames)) {
      assert.equal(typeof v, 'string');
      assert.ok(v.trim().length > 0, `${f.id}: ${k} is announced as an unnamed control`);
    }
  }
});

test('an unnamed intent is caught rather than rendered', () => {
  // The negative arm: a sealed name that is blank is one a screen reader announces as "button".
  const r = renderOf('kind-booking-confirmation', { mutate: (v) => (v.presentation.a11y.accessible_names['intent:i1'] = '   ') });
  const empty = Object.entries(r.accessibleNames).filter(([, v]) => v.trim() === '');
  assert.equal(empty.length, 1, 'the suite must be able to SEE an unnamed control');
});

// ── §8 obligation 3 — no keyboard trap; the escape verb is always reachable ──────────────────────
//
// The old "keyboard traversal 3/3" test iterated an array and could not fail. Traversal is the DOM
// double's and CDP's (S5, steps 4 and 11); what the value can prove is that the escape is a drawn,
// ordered, named control on every envelope that carries one.

test('the escape is a drawn control in the reading order of every envelope that carries one', () => {
  assert.ok(ESCAPE_FIXTURES.length >= 6, 'the corpus carries escapes');
  for (const f of ESCAPE_FIXTURES) {
    const env = envelopeOf(f.id);
    const r = renderOf(f.id);
    const escape = env.intents.find((i) => i.role === 'escape');
    const key = `intent:${escape.intent_ref}`;
    assert.ok(r.readingOrder.includes(key), `${f.id}: the escape is not in the reading order`);
    assert.ok(nodesOfType(r, 'action').some((a) => a.ref === key && a.role === 'escape'), `${f.id}: the escape is not a button`);
  }
});

test('the escape is present on EVERY tier, including the most degraded', () => {
  for (const id of ['kind-booking-confirmation', 'kind-choice', 'kind-form']) {
    const escape = envelopeOf(id).intents.find((i) => i.role === 'escape');
    for (const tier of TIERS) assert.ok(renderOf(id, { tier }).readingOrder.includes(`intent:${escape.intent_ref}`), `${id} at ${tier} dropped the escape`);
  }
});

// ── §8 obligation 4 — prefers-reduced-motion honoured ────────────────────────────────────────────

test('reduced motion changes MOTION', () => {
  assert.equal(renderOf('kind-booking-confirmation', { env: { reduced_motion: true } }).motion, 'none');
  assert.equal(renderOf('kind-booking-confirmation', { env: { reduced_motion: false } }).motion, 'standard');
});

test('reduced motion changes motion and NEVER content', () => {
  // WCAG 2.3.3 is about animation, not about showing a person less.
  for (const f of INDEX.fixtures) {
    const on = renderOf(f.id, { env: { reduced_motion: true } });
    const off = renderOf(f.id, { env: { reduced_motion: false } });
    assert.deepEqual(on.nodes, off.nodes, f.id);
    assert.deepEqual([...on.readingOrder], [...off.readingOrder]);
    assert.deepEqual(on.accessibleNames, off.accessibleNames);
    assert.deepEqual(on.textEquivalent, off.textEquivalent);
    assert.notEqual(on.motion, off.motion);
  }
});

// ── §8 obligation 5 — the text equivalent is the server's, byte for byte ─────────────────────────

test('the text equivalent is used verbatim and is never composed here', () => {
  const sealed = envelopeOf('kind-booking-confirmation').presentation.text_equivalent;
  for (const tier of TIERS) {
    const r = renderOf('kind-booking-confirmation', { tier });
    assert.deepEqual(r.textEquivalent, sealed, `tier ${tier} rewrote the text equivalent`);
    assert.equal(nodesOfType(r, 'heading')[0].text, sealed.headline);
  }
});

test('the text equivalent is produced on every tier, never optional', () => {
  for (const f of INDEX.fixtures)
    for (const tier of TIERS) {
      const r = renderOf(f.id, { tier });
      assert.equal(typeof r.textEquivalent.headline, 'string');
      assert.ok(r.textEquivalent.headline.length > 0, `${f.id} ${tier}`);
    }
});

// ── the renderer's own negative property, checked here as well as at build time ──────────────────

test('the renderer is pure: same input, same output, no clock, no randomness, no mutation', () => {
  const deepFreeze = (o) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o)) deepFreeze(v);
    }
    return o;
  };
  for (const f of INDEX.fixtures) {
    const input = deepFreeze(inputOf(f.id));
    assert.deepEqual(render(input), render(input), f.id);
  }
});

test('the renderer cannot add an intent the server did not mint', () => {
  const r = renderOf('kind-booking-confirmation', {
    mutate: (v) => {
      v.intents = [];
      v.presentation.a11y.reading_order = [];
      v.presentation.a11y.accessible_names = {};
    },
  });
  assert.deepEqual([...r.readingOrder], []);
  assert.deepEqual(r.accessibleNames, {});
  assert.equal(nodesOfType(r, 'action').length, 0);
});

// ── D7: the 22-branch floor (WC §4.8.2) ──────────────────────────────────────────────────────────

test('KIND_A11Y_FLOOR has exactly 22 rows, each with a present suffix descriptor, keyed by the contract kinds', () => {
  const contractKinds = Object.keys(INTERACTIVE_PATHS).sort();
  assert.equal(contractKinds.length, 22);
  assert.deepEqual(Object.keys(KIND_A11Y_FLOOR).sort(), contractKinds);
  assert.deepEqual([...KIND_ORDER].sort(), contractKinds);
  assert.equal(KIND_BRANCH_COUNT, 22);
  for (const kind of contractKinds) {
    const row = KIND_A11Y_FLOOR[kind];
    assert.notEqual(row.accessibleNameSuffix, undefined, kind);
    assert.deepEqual(row.accessibleNameSuffix, NAME_SUFFIX[kind] ?? {}, `${kind}: suffix descriptors differ from WC §4.8.2`);
    assert.equal(row.branch, PROSE_KINDS.has(kind) ? 'prose' : 'structured', kind);
  }
});

test('every kind renders through its own branch and reproduces its sealed reading order', () => {
  const kinds = new Set(KIND_FIXTURES.map((f) => f.kind));
  assert.equal(kinds.size, 22, 'the corpus has one fixture per kind');
  for (const f of KIND_FIXTURES) {
    const env = envelopeOf(f.id);
    const r = renderOf(f.id);
    assert.equal(r.kind, f.kind);
    assert.equal(r.mode, KIND_A11Y_FLOOR[f.kind].branch, `${f.id}: rendered in ${r.mode}`);
    assert.deepEqual([...r.readingOrder], env.presentation.a11y.reading_order.map(keyOf), f.id);
    assert.equal(r.roleHint, env.presentation.a11y.role_hint);
  }
});

test('R-3: every string the renderer places is a minted string of the view, byte-equal', () => {
  for (const f of INDEX.fixtures) {
    const input = inputOf(f.id);
    const minted = new Set();
    const collect = (v) => {
      if (typeof v === 'string') minted.add(v);
      else if (v && typeof v === 'object') for (const x of Object.values(v)) collect(x);
    };
    collect(input.view);
    const r = render(input);
    const placed = [r.label, r.description];
    walk(r.nodes, (n) => {
      if (n.t === 'text' || n.t === 'heading' || n.t === 'limitation') placed.push(n.text);
      if (n.t === 'leaf') placed.push(n.text, ...(n.detail === null ? [] : [n.detail]));
      if (n.t === 'block' && n.label !== null) placed.push(n.label);
      if (n.t === 'action') placed.push(n.name, n.label);
      if (n.t === 'choice' || n.t === 'field') placed.push(n.name);
      if (n.t === 'table') placed.push(n.caption, ...n.columns.map((c) => c.label), ...n.groups.map((g) => g.label).filter((l) => l !== null));
    });
    for (const s of placed) assert.ok(minted.has(s), `${f.id}: "${s}" was composed, not copied`);
  }
});

test('A-1: every retained intent renders as a real button; nothing else activates an intent', () => {
  for (const f of LIVE_FIXTURES) {
    const input = inputOf(f.id);
    const r = render(input);
    const actions = nodesOfType(r, 'action');
    for (const intent of input.view.intents)
      assert.ok(actions.some((a) => a.intent_ref === intent.intent_ref), `${f.id}: ${intent.intent_ref} is not a button`);
    for (const a of actions) assert.ok(input.view.intents.some((i) => i.intent_ref === a.intent_ref), `${f.id}: a button for an unminted intent`);
    for (const c of nodesOfType(r, 'choice')) assert.ok(c.selects === null || input.view.intents.some((i) => i.intent_ref === c.selects), f.id);
  }
});

test('A-2: every drawn control carries its sealed accessible name byte-for-byte', () => {
  for (const f of INDEX.fixtures) {
    const input = inputOf(f.id);
    const r = render(input);
    const sealed = input.view.presentation.a11y.accessible_names;
    for (const n of interactiveNodes(r)) assert.equal(n.name, sealed[n.ref], `${f.id}: ${n.ref}`);
    for (const [k, v] of Object.entries(r.accessibleNames)) assert.equal(v, sealed[k]);
  }
  // Suffix-bearing names reach their control and no other (APPROVAL.4, ARTIFACT.5, CLIENT.3).
  assert.equal(renderOf('kind-approval').accessibleNames['intent:i1'], 'Одобрить, 42 клиента, средний риск, необратимо: сообщение уйдёт клиентам');
  assert.equal(renderOf('kind-approval').accessibleNames['intent:i2'], 'Отклонить');
  assert.equal(renderOf('kind-artifact').accessibleNames['intent:i1'], 'Скачать, otchet-avgust.pdf, PDF, 180 КБ');
  assert.equal(renderOf('kind-client-list').accessibleNames['intent:i1'], 'Пригласить на визит, 42 клиента');
  assert.equal(renderOf('kind-service-selector').accessibleNames['option:svc-cut'], 'Мужская стрижка, 60 мин, 1 500 ₽');
});

test('A-3: DOM order equals reading order in every tier the envelope is drawn at', () => {
  for (const f of LIVE_FIXTURES)
    for (const tier of TIERS) {
      const r = renderOf(f.id, { tier });
      assert.deepEqual([...r.readingOrder], interactiveRefs(r.nodes), `${f.id} ${tier}`);
      assert.deepEqual([...r.readingOrder], envelopeOf(f.id).presentation.a11y.reading_order.map(keyOf), `${f.id} ${tier}`);
    }
});

test('A-5 / A-18: SHEET density is inside the same floor — identical controls, order and names', () => {
  for (const f of INDEX.fixtures) {
    const card = renderOf(f.id, { density: 'CARD' });
    const sheet = renderOf(f.id, { density: 'SHEET' });
    assert.equal(sheet.density, 'SHEET');
    assert.deepEqual(sheet.nodes, card.nodes, f.id);
    assert.deepEqual([...sheet.readingOrder], [...card.readingOrder]);
    assert.deepEqual(sheet.accessibleNames, card.accessibleNames);
    assert.equal(sheet.focus, card.focus);
  }
});

test('A-6: options and slots are one group — one tab stop — labelled by a minted prompt, under the sealed role', () => {
  const cases = { 'kind-choice': 'option', 'kind-service-selector': 'option', 'kind-staff-selector': 'option', 'kind-strategy-options': 'option', 'kind-time-slot-selector': 'slot' };
  for (const [id, k] of Object.entries(cases)) {
    const r = renderOf(id);
    const role = envelopeOf(id).presentation.a11y.role_hint;
    const groups = nodesOfType(r, 'block').filter((b) => b.block === 'group' && b.roleHint === role);
    assert.equal(groups.length, 1, `${id}: one ${role} group`);
    const inside = [];
    walk(groups[0].children, (n) => n.t === 'choice' && inside.push(n.ref));
    const all = nodesOfType(r, 'choice').map((c) => c.ref).filter((ref) => ref.startsWith(`${k}:`));
    assert.ok(all.length >= 2, id);
    assert.deepEqual(inside.filter((ref) => ref.startsWith(`${k}:`)), all, `${id}: every ${k} sits inside the one group`);
    assert.ok(typeof groups[0].label === 'string' && groups[0].label.length > 0, `${id}: the group is labelled`);
  }
  // STRATEGY_OPTIONS: NO_ACTION is in the same group, never a dismissal.
  const s = renderOf('kind-strategy-options');
  const group = nodesOfType(s, 'block').find((b) => b.roleHint === 'radiogroup');
  const insideActions = [];
  walk(group.children, (n) => n.t === 'action' && insideActions.push(n.intent_ref));
  assert.deepEqual(insideActions, ['i2']);
});

test('A-7: the five Cell branches — every non-KNOWN Cell is stated with its label, never by state alone', () => {
  const unknownCells = (v, out = []) => {
    if (Array.isArray(v)) v.forEach((x) => unknownCells(x, out));
    else if (v && typeof v === 'object') {
      if (typeof v.label === 'string' && 'reason_code' in v && ['PARTIAL', 'NOT_MEASURED', 'UNAVAILABLE', 'PENDING'].includes(v.state)) out.push(v);
      Object.values(v).forEach((x) => unknownCells(x, out));
    }
    return out;
  };
  let seen = 0;
  for (const f of LIVE_FIXTURES) {
    const input = inputOf(f.id);
    const r = render(input);
    const leaves = nodesOfType(r, 'leaf');
    for (const c of unknownCells([input.view.body, input.view.intents])) {
      seen += 1;
      assert.ok(leaves.some((l) => l.state === c.state && l.text === c.label), `${f.id}: "${c.label}" (${c.state}) is not stated`);
    }
  }
  assert.ok(seen >= 20, `the corpus exercises non-KNOWN cells (${seen})`);
  // Each of the five states round-trips as data on the leaf.
  for (const state of ['KNOWN', 'PARTIAL', 'NOT_MEASURED', 'UNAVAILABLE', 'PENDING']) {
    const r = renderOf('kind-choice', {
      mutate: (v) => Object.assign(v.body.options[0].label, { state, reason_code: state === 'KNOWN' ? null : 'NOT_COLLECTED', label: `state ${state}` }),
    });
    assert.equal(r.mode, 'structured');
    assert.ok(nodesOfType(r, 'leaf').some((l) => l.state === state && l.text === `state ${state}`), state);
  }
  // A state outside the five is not guessed at: the item falls back to prose, it does not throw.
  const odd = renderOf('kind-choice', { mutate: (v) => (v.body.options[0].label.state = 'FAILED') });
  assert.equal(odd.mode, 'prose');
});

test('A-11: no capability is reachable only by drag — every retained intent is a keyboard control', () => {
  const r = renderOf('kind-schedule');
  const move = r.nodes && nodesOfType(r, 'action').find((a) => a.intent_ref === 'i3');
  assert.ok(move, "SCHEDULE's move intent is a button, not a drag");
  assert.ok(r.readingOrder.includes('intent:i3'));
  for (const f of LIVE_FIXTURES) {
    const input = inputOf(f.id);
    const r2 = render(input);
    for (const i of input.view.intents) assert.ok(r2.readingOrder.includes(`intent:${i.intent_ref}`), `${f.id}: ${i.intent_ref}`);
  }
});

test('A-12: live regions are the sealed value and the kind row; assertive iff a blocking LIMITATION; never an alert', () => {
  for (const f of INDEX.fixtures) {
    const env = envelopeOf(f.id);
    const r = renderOf(f.id);
    assert.equal(r.liveRegion, env.presentation.a11y.live_region, f.id);
    const row = KIND_A11Y_FLOOR[f.kind].liveRegion;
    const expected = row.region === 'assertive_iff_blocking' ? (env.body.severity === 'blocking' ? 'assertive' : 'polite') : row.region;
    assert.equal(r.liveRegion, expected, `${f.id}: sealed live region differs from the ${f.kind} row`);
    assert.equal(r.announceIntervalMs, f.kind === 'PROGRESS' ? 5000 : 0, f.id);
    assert.ok(!JSON.stringify(r).includes('"alert"'), `${f.id}: role alert`);
  }
  assert.equal(renderOf('kind-limitation-blocking').liveRegion, 'assertive');
  assert.equal(renderOf('limitation-non-blocking').liveRegion, 'polite');
});

test('A-17: CLIENT_LIST — caption, column headers, one row-header column, in-row buttons, bulk outside', () => {
  const env = envelopeOf('kind-client-list');
  const r = renderOf('kind-client-list');
  const [table] = nodesOfType(r, 'table');
  assert.equal(table.caption, env.body.table.caption.rendered);
  assert.deepEqual(table.columns.map((c) => c.label), env.body.table.columns.map((c) => c.label.rendered));
  assert.equal(table.rowHeaderKey, 'name');
  const rows = table.groups.flatMap((g) => g.rows);
  assert.deepEqual(rows.map((row) => row.ref), ['row:r-1', 'row:r-2', null]);
  assert.deepEqual(rows.map((row) => row.actions.map((a) => [a.ref, a.intent_ref])), [[['row:r-1', 'i2']], [['row:r-2', 'i2']], []]);
  assert.equal(rows[2].cells[2], null, 'a null cell is drawn as an empty cell, not a composed dash');
  // Bulk intents sit after the table, with the audience size stated before the control.
  const top = r.nodes.map((n) => n.t);
  const tableAt = top.indexOf('table');
  const bulkAt = r.nodes.findIndex((n) => n.t === 'action' && n.intent_ref === 'i1');
  assert.ok(bulkAt > tableAt);
  assert.equal(r.nodes[bulkAt - 1].t, 'leaf');
  assert.equal(r.nodes[bulkAt - 1].text, '42 клиента');
  assert.ok(!table.groups.some((g) => g.rows.some((row) => row.actions.some((a) => a.intent_ref === 'i1'))), 'bulk intents are never inside the table');
});

test('A-17: REPORT section tables carry row-group headers from group_by; CHART draws table_equivalent in full', () => {
  const r = renderOf('kind-report');
  const [table] = nodesOfType(r, 'table');
  assert.deepEqual(table.groups.map((g) => [g.label, g.rows.map((row) => row.row_key)]), [
    ['Дневная смена', ['rs-ilya', 'rs-anna']],
    ['Вечерняя смена', ['rs-oleg']],
  ]);
  assert.deepEqual(nodesOfType(r, 'heading').map((h) => [h.level, h.text]).slice(1), [
    [3, 'Выручка по мастерам'],
    [4, 'Расходы'],
  ]);
  const chartEnv = envelopeOf('kind-chart');
  const chart = renderOf('kind-chart');
  const [equivalent] = nodesOfType(chart, 'table');
  assert.equal(chart.mode, 'prose');
  assert.equal(equivalent.caption, chartEnv.body.table_equivalent.caption.rendered);
  assert.deepEqual(equivalent.groups.flatMap((g) => g.rows.map((row) => row.row_key)), chartEnv.body.table_equivalent.rows.map((row) => row.row_key));
  // SCHEDULE is not an A-17 table: lanes are row headers of a grid drawn as labelled lane groups.
  const s = renderOf('kind-schedule');
  assert.equal(nodesOfType(s, 'table').length, 0);
  const grid = nodesOfType(s, 'block').find((b) => b.roleHint === 'grid');
  assert.deepEqual(grid.children.map((lane) => lane.label), ['Илья', 'Анна']);
});

test('A-21 (shell half): at every tier the text equivalent is byte-equal, non-KNOWN labels appear, retained intents are reachable', () => {
  for (const f of LIVE_FIXTURES)
    for (const tier of TIERS) {
      const input = inputOf(f.id, { tier });
      const r = render(input);
      const te = input.view.presentation.text_equivalent;
      assert.deepEqual(r.textEquivalent, te);
      if (tier === 'TEXT_ONLY') {
        assert.equal(r.mode, 'prose', `${f.id}: TEXT_ONLY draws the canonical text`);
        const texts = nodesOfType(r, 'text').map((n) => n.text);
        assert.ok(texts.includes(te.body), `${f.id}: the text equivalent body is drawn`);
        for (const line of te.itemized) assert.ok(texts.includes(line), `${f.id}: itemized "${line}"`);
      }
      for (const i of input.view.intents) assert.ok(r.readingOrder.includes(`intent:${i.intent_ref}`), `${f.id} ${tier}: ${i.intent_ref}`);
    }
  // Every intents_withheld entry in a FIXTURE names a pointer present in it (checked on the full envelope).
  for (const f of INDEX.fixtures) {
    const env = envelopeOf(f.id);
    const tokens = new Set(env.intents.map((i) => i.intent_token).filter(Boolean));
    for (const w of env.render.intents_withheld) assert.ok(tokens.has(w.reachable_via) || DETAIL_KEYS.has(w.reachable_via), `${f.id}: withheld pointer`);
    for (const d of env.render.body_reductions) assert.ok(tokens.has(d.restored_by) || DETAIL_KEYS.has(d.restored_by), `${f.id}: reduction pointer`);
  }
});

test('D7 focus: heading focus for BOOKING_CONFIRMATION, CONSENT_STATE, PAYMENT_HANDOFF; first refused field for FORM', () => {
  for (const f of KIND_FIXTURES) {
    const r = renderOf(f.id);
    const heading = r.nodes[0];
    assert.equal(heading.t, 'heading');
    if (['BOOKING_CONFIRMATION', 'CONSENT_STATE', 'PAYMENT_HANDOFF'].includes(f.kind)) {
      assert.equal(r.focus, 'heading', f.id);
      assert.equal(heading.focusTarget, true, f.id);
    } else {
      assert.equal(heading.focusTarget, false, f.id);
      assert.equal(r.focus, f.kind === 'FORM' ? 'first_refused_field' : 'none', f.id);
    }
  }
  const form = renderOf('kind-form');
  const refused = nodesOfType(form, 'field').filter((n) => n.refused).map((n) => n.ref);
  assert.deepEqual(refused, ['field:amount']);
  const clean = renderOf('kind-form', { mutate: (v) => (v.limitations = []) });
  assert.equal(clean.focus, 'none');
  assert.equal(nodesOfType(clean, 'field').some((n) => n.refused), false);
});

test('H7 fallback: a tampered or expired envelope draws frozen prose plus the one REFINE — never an error surface', () => {
  for (const id of ['booking-tampered-body', 'booking-render-tier-changed', 'booking-cell-index-digest-changed', 'booking-expired', 'metric-class-i-ref-tampered']) {
    const env = envelopeOf(id);
    const r = renderOf(id);
    assert.notEqual(verify(env, INDEX.now), 'valid', id);
    assert.equal(r.mode, 'frozen_prose', id);
    const actions = nodesOfType(r, 'action');
    const firstRefine = env.presentation.a11y.reading_order.map((ref) => env.intents.find((i) => ref.k === 'intent' && i.intent_ref === ref.id)).find((i) => i && i.effect === 'REFINE');
    assert.deepEqual(actions.map((a) => a.intent_ref), firstRefine ? [firstRefine.intent_ref] : [], id);
    assert.ok(nodesOfType(r, 'text').some((t) => t.text === env.presentation.text_equivalent.body), `${id}: the text equivalent is drawn`);
    assert.equal(nodesOfType(r, 'limitation').length, env.limitations.length);
    assert.deepEqual([...r.readingOrder], actions.map((a) => a.ref));
  }
  // The same envelope with a valid verdict is structured: the fallback is the verdict's doing.
  assert.equal(renderOf('booking-tampered-body', { verdict: 'valid' }).mode, 'structured');
});

test('FR2: terminal lifecycles draw static text and no control, never a disabled button', () => {
  for (const id of ['approval-consumed', 'slots-superseded-predecessor']) {
    const r = renderOf(id);
    assert.equal(r.mode, 'frozen_prose', id);
    assert.equal(interactiveNodes(r).length, 0, id);
    assert.deepEqual([...r.readingOrder], []);
  }
});

test('R-2 / D1: neither the renderer input nor its output carries a token, class-i ref, receipt pointer, tenant, seal or proof', () => {
  for (const f of INDEX.fixtures) {
    const input = inputOf(f.id);
    const out = JSON.stringify(render(input));
    const serializedInput = JSON.stringify(input);
    const s = f.secrets;
    const values = [
      ...s.intent_tokens,
      ...s.class_i_refs,
      ...s.receipt_pointers.filter((p) => !DETAIL_KEYS.has(p)),
      ...s.idempotency_keys,
      s.tenant_id,
      s.envelope_seal,
      s.principal_proof_hash,
    ];
    assert.ok(values.length >= 3, f.id);
    for (const v of values) {
      assert.ok(!serializedInput.includes(v), `${f.id}: the renderer input carries a secret`);
      assert.ok(!out.includes(v), `${f.id}: the render result carries a secret`);
    }
    for (const key of ['"intent_token"', '"token"', '"envelope_seal"', '"principal_proof_hash"', '"tenant_id"', '"idempotency_key"', '"readback_ref"'])
      assert.ok(!out.includes(key), `${f.id}: ${key} in the render result`);
  }
  // Non-vacuity: a projection that kept the token would be seen.
  const leaky = inputOf('kind-booking-confirmation');
  leaky.view.intents[0].intent_token = fixture('kind-booking-confirmation').secrets.intent_tokens[0];
  assert.ok(JSON.stringify(leaky).includes(fixture('kind-booking-confirmation').secrets.intent_tokens[0]));
});

test('R-4: the tier comes from the envelope, never from the environment', () => {
  for (const tier of TIERS) assert.equal(renderOf('kind-choice', { tier }).tier, tier);
  const plain = renderOf('kind-choice');
  const other = renderOf('kind-choice', { env: { forced_colors: true, text_scale: 2, pointer: 'coarse', keyboard_only_hint: true, caption_preference: true } });
  assert.deepEqual(other, plain, 'nothing but reduced_motion may change the result');
});

test('R-6: limitations are always drawn; a non-KNOWN or false enabled state keeps the control and explains it', () => {
  for (const f of INDEX.fixtures) {
    const input = inputOf(f.id);
    assert.equal(nodesOfType(render(input), 'limitation').length, input.view.limitations.length, f.id);
  }
  const choice = renderOf('kind-choice');
  const both = nodesOfType(choice, 'choice').find((c) => c.ref === 'option:o-both');
  assert.ok(both.children.some((l) => l.t === 'leaf' && l.state === 'UNAVAILABLE' && l.text === 'Сейчас недоступно: мастер не принимает'));
  const r = renderOf('kind-booking-confirmation', {
    mutate: (v) => (v.intents[1].enabled = { state: 'UNAVAILABLE', value: null, label: 'Нельзя изменить время: запись закрыта', reason_code: 'PERMISSION', fact_ref: null, as_of: null, evidence_refs: [], next_intent_ref: null }),
  });
  const a = nodesOfType(r, 'action').find((x) => x.intent_ref === 'i2');
  assert.ok(a, 'the control is still drawn');
  assert.equal(a.enabled, 'UNAVAILABLE');
  assert.equal(a.explanation.text, 'Нельзя изменить время: запись закрыта');
  assert.equal(r.mode, 'structured');
});

test('an envelope whose structured drawing would not match its sealed order is drawn as prose in the sealed order', () => {
  const r = renderOf('kind-booking-confirmation', {
    mutate: (v) => {
      const order = v.presentation.a11y.reading_order;
      [order[0], order[1]] = [order[1], order[0]];
    },
  });
  assert.equal(r.mode, 'prose');
  assert.deepEqual([...r.readingOrder], ['intent:i2', 'intent:i1', 'intent:i3', 'intent:i9']);
  const broken = renderOf('kind-choice', { mutate: (v) => delete v.body.min_select });
  assert.equal(broken.mode, 'prose');
  assert.deepEqual([...broken.readingOrder], envelopeOf('kind-choice').presentation.a11y.reading_order.map(keyOf));
});
