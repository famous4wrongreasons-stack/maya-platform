// The React widget drawer, against the sealed 40-fixture corpus.
//
//   node --test test/parity.test.mjs
//
// The pipeline is the canonical one, offline, from published runtime modules only:
//   project(envelope)  → shell/view.ts
//   verify(envelope, INDEX.now) → integrity/h7.ts, frozen clock 2026-09-17T09:05:00.000Z
//   render({view, verdict, env, density}) → renderer/render.ts
// and then the React drawer renders that RenderResult to markup.
//
// 🔴 Nothing here touches the `widgets.runtime` entitlement, and nothing activates anything. The
// corpus is sealed JSON on disk; the drawer is rendered to a string. No server is involved and no
// booking can occur — which is exactly the proof shape D3 leaves open while the gate stays shut.
//
// The checker itself is proved in both directions: §3 perturbs correct markup four ways and
// requires every perturbation to be caught. A parity test that can only pass has proved nothing.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { findAll, parse, textOf } from './html.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, '..', '..', 'maya-chat-shell', 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));

const { resultOf, markupOf, receiptRefreshMarkup, project, render } = await import(pathToFileURL(path.join(HERE, '.bundle.mjs')).href);

const envelopeOf = (f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f.file), 'utf8'));

const itemOf = (f, over = {}) => {
  const envelope = envelopeOf(f);
  const result = resultOf(envelope, INDEX.now);
  return { item: { id: 'w-' + f.id, result, display: 'live', pending: null, sentence: null, ...over }, result };
};

/** The facts the shell's own fixture host reports, read back out of the React markup. */
const factsOf = (markup) => {
  const root = parse(markup);
  const article = findAll(root, (el) => el.tag === 'article')[0] ?? null;
  const refs = findAll(root, (el) => 'data-ref' in el.attrs);
  const live = findAll(root, (el) => 'aria-live' in el.attrs)[0] ?? null;
  return {
    article,
    drawnRefs: refs.map((el) => el.attrs['data-ref']),
    refEls: refs,
    headings: findAll(root, (el) => el.tag === 'h2' || el.tag === 'h3' || el.tag === 'h4'),
    alerts: findAll(root, (el) => el.attrs.role === 'alert'),
    sinks: findAll(root, (el) => 'href' in el.attrs || 'src' in el.attrs || 'srcset' in el.attrs),
    disabled: findAll(root, (el) => 'disabled' in el.attrs),
    rows: findAll(root, (el) => el.tag === 'tr'),
    tables: findAll(root, (el) => el.tag === 'table'),
    live,
    liveText: live === null ? null : textOf(live),
  };
};

// The sealed name is carried either as the aria-label or as the visible text, byte for byte.
const namedCorrectly = (el, sealed) => el.attrs['aria-label'] === sealed || textOf(el) === sealed;

const reachable = (el) => el.tag === 'button' || el.attrs.tabindex === '0';

// ── 1. every fixture, drawn live ───────────────────────────────────────────────────────────────

test('the corpus is the 40 sealed envelopes', () => {
  assert.equal(INDEX.fixtures.length, 40);
  assert.equal(INDEX.now, '2026-09-17T09:05:00.000Z');
});

for (const f of INDEX.fixtures) {
  test(`${f.id} — drawn`, () => {
    const { item, result } = itemOf(f);
    const facts = factsOf(markupOf(item));

    // The index's sealed expectations, reached through the React drawer's own input.
    assert.equal(result.mode, f.expect.mode, 'mode');
    assert.equal(result.liveRegion, f.expect.live_region, 'live region');

    // A-0: DOM order of interactive nodes equals the sealed reading order.
    assert.deepEqual(facts.drawnRefs, [...result.readingOrder], 'reading order');

    // A-2: names are sealed, never composed; and every drawn ref is keyboard-reachable.
    for (const el of facts.refEls) {
      const ref = el.attrs['data-ref'];
      const sealed = result.accessibleNames[ref];
      if (sealed !== undefined && sealed !== '')
        assert.ok(namedCorrectly(el, sealed), `${ref}: name byte-equal (got ${JSON.stringify(el.attrs['aria-label'] ?? textOf(el))})`);
      assert.ok(reachable(el), `${ref}: keyboard-reachable`);
    }

    // A bad verdict is never an error surface, and a widget writes no request sink.
    assert.equal(facts.alerts.length, 0, 'no role=alert');
    assert.equal(facts.sinks.length, 0, 'no href/src/srcset');

    // `enabled` is drawn, never decided: nothing is ever really disabled.
    assert.equal(facts.disabled.length, 0, 'no disabled attribute');

    // The headline heading is the server's, verbatim.
    const h2 = facts.headings.filter((el) => el.tag === 'h2');
    assert.equal(h2.length, 1, 'exactly one h2');
    assert.equal(textOf(h2[0]), result.textEquivalent.headline, 'headline verbatim');
    for (const h of facts.headings) assert.equal(h.attrs.tabindex, '-1', 'headings are programmatically focusable');

    // The live region exists iff the seal says so, and is born EMPTY.
    if (result.liveRegion === 'off') assert.equal(facts.live, null, 'no live region');
    else {
      assert.ok(facts.live !== null, 'live region present');
      assert.equal(facts.live.attrs['aria-live'], result.liveRegion, 'aria-live matches the seal');
      assert.equal(facts.live.attrs['aria-atomic'], 'true', 'atomic');
      assert.equal(facts.liveText, '', 'born empty — a region created with its text is not announced');
    }

    // A-17: a row is never itself a control.
    for (const tr of facts.rows) {
      assert.ok(!('data-ref' in tr.attrs), 'no ref on a row');
      assert.notEqual(tr.attrs.tabindex, '0', 'no tab stop on a row');
    }
  });
}

// ── 2. the display states the runtime can put a card in ────────────────────────────────────────

const WITH_REFS = INDEX.fixtures.filter((f) => f.expect.mode !== 'frozen_prose').slice(0, 6);

for (const f of WITH_REFS) {
  test(`${f.id} — collapsed draws one heading and nothing interactive`, () => {
    const { item, result } = itemOf(f, { display: 'collapsed' });
    const facts = factsOf(markupOf(item));
    assert.equal(facts.drawnRefs.length, 0, 'no controls when collapsed');
    assert.equal(facts.headings.length, 1, 'exactly one heading');
    assert.equal(textOf(facts.headings[0]), result.textEquivalent.headline);
  });

  test(`${f.id} — pending marks the card busy and the one ref disabled`, () => {
    const { item, result } = itemOf(f);
    const ref = result.readingOrder[0];
    if (ref === undefined) return;
    const facts = factsOf(markupOf({ ...item, display: 'pending', pending: ref }));
    assert.equal(facts.article.attrs['aria-busy'], 'true', 'aria-busy while in flight');
    const el = facts.refEls.find((x) => x.attrs['data-ref'] === ref);
    assert.equal(el.attrs['aria-disabled'], 'true', 'the pending ref is aria-disabled');
    assert.ok(!('disabled' in el.attrs), 'and never really disabled');
  });
}

// ── 4. M7 — the booking surface, fixture-only ──────────────────────────────────────────────────
//
// The four canonical booking kinds, plus the terminal state. Nothing is activated and the
// widgets.runtime entitlement is not read: these are sealed envelopes rendered to a string.
//
// The property that matters is FAIL-CLOSED. When integrity or expiry says the card is no longer
// trustworthy, the renderer answers with frozen prose, and the one thing presentation must never do
// is keep offering the commit. So: across the WHOLE corpus, no COMMIT may survive a non-valid
// verdict — asserted per fixture and once over the corpus, because a per-fixture check alone would
// pass if a whole fixture silently stopped being rendered.

const BOOKING_KINDS = new Set(['SERVICE_SELECTOR', 'STAFF_SELECTOR', 'TIME_SLOT_SELECTOR', 'BOOKING_CONFIRMATION']);

/** The effects of the actions actually drawn, in reading order. */
const drawnEffects = (result) => {
  const out = [];
  const visit = (node) => {
    if (node.t === 'action') out.push(node.effect);
    for (const child of node.children ?? []) visit(child);
    if (node.t === 'table')
      for (const group of node.groups) for (const row of group.rows) for (const a of row.actions) visit(a);
  };
  for (const node of result.nodes) visit(node);
  return out;
};

for (const f of INDEX.fixtures.filter((x) => BOOKING_KINDS.has(x.kind))) {
  test(`M7 ${f.kind} — ${f.id}`, () => {
    const { item, result } = itemOf(f);
    const facts = factsOf(markupOf(item));
    assert.deepEqual(facts.drawnRefs, [...result.readingOrder], 'reading order');
    assert.equal(result.mode, f.expect.mode, 'mode');

    const effects = drawnEffects(result);
    const trustworthy = f.expect.verdict === 'valid' && result.mode !== 'frozen_prose';
    if (trustworthy) return;

    // Frozen: text_equivalent plus AT MOST the one server REFINE. Never a commit, never a draft.
    assert.ok(!effects.includes('COMMIT'), `${f.id}: a COMMIT survived a non-valid verdict`);
    assert.ok(!effects.includes('DRAFT'), `${f.id}: a DRAFT survived a non-valid verdict`);
    assert.ok(effects.length <= 1, `${f.id}: more than one control in frozen prose`);
    for (const effect of effects) assert.equal(effect, 'REFINE', `${f.id}: the survivor must be a REFINE`);
    // And it is not an error surface.
    assert.equal(facts.alerts.length, 0, 'frozen is not an error banner');
  });
}

test('M7 — no COMMIT survives a non-valid verdict, anywhere in the corpus', () => {
  const offenders = [];
  let checked = 0;
  for (const f of INDEX.fixtures) {
    const { result } = itemOf(f);
    if (f.expect.verdict === 'valid' && result.mode !== 'frozen_prose') continue;
    checked += 1;
    if (drawnEffects(result).some((e) => e === 'COMMIT' || e === 'DRAFT')) offenders.push(f.id);
  }
  assert.ok(checked >= 6, `the sweep must actually examine the untrusted fixtures (saw ${checked})`);
  assert.deepEqual(offenders, []);
});

test('M7 — a superseded predecessor offers nothing at all', () => {
  const f = INDEX.fixtures.find((x) => x.id === 'slots-superseded-predecessor');
  assert.ok(f, 'the superseded-predecessor fixture exists');
  const { item, result } = itemOf(f);
  assert.equal(result.readingOrder.length, 0, 'no interactive refs');
  assert.equal(factsOf(markupOf(item)).drawnRefs.length, 0, 'and none drawn');
});

test('M7 — a terminal card is drawn whole, marked terminal, and carries no control', () => {
  const f = INDEX.fixtures.find((x) => x.id === 'approval-consumed');
  assert.ok(f, 'the consumed-approval fixture exists');
  const { item, result } = itemOf(f, { display: 'terminal' });
  const facts = factsOf(markupOf(item));
  assert.ok(facts.article.attrs.class.includes('widget--terminal'), 'the display is on the article');
  assert.equal(facts.drawnRefs.length, 0, 'a consumed approval offers nothing');
  assert.equal(result.mode, 'frozen_prose');
  // Whole, not collapsed: the heading AND the server's prose are still there.
  assert.ok(textOf(facts.article).includes(result.textEquivalent.headline));
  assert.ok(textOf(facts.article).length > result.textEquivalent.headline.length, 'more than the headline');
});

// A synthetic consumed renderer view checks presentation only. The runtime's
// receipt qualification and exact READ correlation have their own shell tests.
const spentBooking = () => {
  const fixture = INDEX.fixtures.find(row => row.id === 'kind-booking-confirmation');
  assert.ok(fixture);
  const view = project(envelopeOf(fixture));
  const result = render({
    view: { ...view, lifecycle: { ...view.lifecycle, state: 'CONSUMED' } },
    verdict: 'valid', density: view.presentation.density,
    env: { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false },
  });
  assert.equal(result.readingOrder.length, 0);
  return { id: 'local-spent-booking-item', result, display: 'terminal', pending: null, sentence: 'booking_unconfirmed' };
};
const refreshButton = markup => findAll(parse(markup), el => el.tag === 'button')[0] ?? null;

test('L27 React receipt control requires both runtime projection and callback', () => {
  const item = spentBooking();
  for (const receiptRefresh of [undefined, null]) {
    assert.equal(refreshButton(receiptRefreshMarkup({ ...item, receiptRefresh })), null);
  }
  assert.equal(refreshButton(receiptRefreshMarkup({ ...item, receiptRefresh: 'available' }, false)), null);
  assert.equal(refreshButton(receiptRefreshMarkup({ ...item, receiptRefresh: 'unavailable' }, false)), null);
});

test('L27 React receipt READ is separate chrome; spent article and result text remain unchanged', () => {
  const item = spentBooking();
  const before = markupOf(item);
  for (const receiptRefresh of ['available', 'pending', 'unavailable']) {
    const markup = receiptRefreshMarkup({ ...item, receiptRefresh });
    const root = parse(markup), facts = factsOf(markup);
    assert.deepEqual(facts.article, factsOf(before).article, 'No widget content or sealed controls rewritten');
    assert.deepEqual(facts.drawnRefs, [], 'Receipt READ has no widget intent ref');
    assert.deepEqual(facts.sinks, []);
    const originalSentence = findAll(parse(before), el => el.attrs.class === 'widget-sentence')[0];
    assert.deepEqual(findAll(root, el => el.attrs.class === 'widget-sentence')[0], originalSentence);
    const button = refreshButton(markup); assert.ok(button);
    assert.equal(button.attrs.type, 'button');
    for (const key of ['data-ref', 'data-widget-id', 'data-token', 'formaction']) assert.equal(key in button.attrs, false);
    assert.equal(findAll(facts.article, el => el.tag === 'button').length, 0, 'Spent card stays static');
    assert.equal(textOf(root).includes('Запись подтверждена.'), false, 'The READ button invents no result');
  }
});

test('L27 React pending disables only the receipt READ; unavailable offers a neutral manual retry', () => {
  const item = spentBooking();
  const available = refreshButton(receiptRefreshMarkup({ ...item, receiptRefresh: 'available' }));
  assert.equal(textOf(available), 'Проверить результат');
  assert.equal('disabled' in available.attrs, false);
  const pendingMarkup = receiptRefreshMarkup({ ...item, receiptRefresh: 'pending' });
  const pending = refreshButton(pendingMarkup);
  assert.equal(textOf(pending), 'Проверяем результат…');
  assert.equal('disabled' in pending.attrs, true);
  assert.equal(pending.attrs['aria-busy'], 'true');
  const unavailableMarkup = receiptRefreshMarkup({ ...item, receiptRefresh: 'unavailable' });
  const unavailable = refreshButton(unavailableMarkup);
  assert.equal(textOf(unavailable), 'Проверить результат');
  assert.equal('disabled' in unavailable.attrs, false);
  assert.equal(textOf(findAll(parse(unavailableMarkup), el => el.attrs.role === 'status')[0]), 'Не удалось проверить результат. Попробуйте ещё раз.');
});

// ── 3. the checker, proved in the other direction ──────────────────────────────────────────────
//
// Four perturbations of correct markup. Each is a mistake a plausible drawer makes; each MUST be
// caught. A check that has never failed is a check nobody has proved works.

test('the checker catches a drawer that is wrong', () => {
  const f = INDEX.fixtures.find((x) => x.id === 'kind-client-list') ?? INDEX.fixtures[0];
  const { item, result } = itemOf(f);
  const good = markupOf(item);
  assert.deepEqual(factsOf(good).drawnRefs, [...result.readingOrder], 'the baseline really is correct');

  const caught = [];
  const check = (why, markup, assertion) => {
    try {
      assertion(factsOf(markup));
      caught.push(`NOT CAUGHT: ${why}`);
    } catch {
      /* caught, as required */
    }
  };

  // (a) a dropped control — the commonest way to break A-0
  check('a dropped control', good.replace(/<button[^>]*data-ref="[^"]*"[\s\S]*?<\/button>/, ''), (facts) =>
    assert.deepEqual(facts.drawnRefs, [...result.readingOrder]),
  );
  // (b) a composed accessible name — on a NAMED CONTROL, not on the article's own label, which no
  //     control is named by. (The first version of this perturbation rewrote the article and was
  //     rightly not caught; the checker was correct and the probe was aimed at the wrong element.)
  const composed = good.replace(/(data-ref="[^"]*"\s+)aria-label="[^"]*"/, '$1aria-label="Нажмите здесь"');
  assert.notEqual(composed, good, 'the perturbation must actually change a named control');
  check('a composed name', composed, (facts) => {
    for (const el of facts.refEls) {
      const sealed = result.accessibleNames[el.attrs['data-ref']];
      if (sealed !== undefined && sealed !== '') assert.ok(namedCorrectly(el, sealed));
    }
  });
  // (c) a real `disabled`, which takes the reason out of reach
  check('a real disabled attribute', good.replace('aria-disabled="true"', 'disabled=""').replace('<button', '<button disabled=""'), (facts) =>
    assert.equal(facts.disabled.length, 0),
  );
  // (d) a live region born with its text
  check('a live region born speaking', good.replace(/(aria-live="[^"]*" aria-atomic="true">)/, '$1сказано'), (facts) =>
    assert.equal(facts.liveText, ''),
  );

  assert.deepEqual(caught, [], 'every perturbation must be caught');
});
