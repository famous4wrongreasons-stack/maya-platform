// Synthetic local carrier proof; no provider or model acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectWidgetIntent } from '../src/net/project.ts';
import { BOOKING_REFUSALS } from '../src/net/booking-reasons.ts';
import { render } from '../src/renderer/render.ts';
import { createLiveSubmission } from '../src/shell/intents.ts';
import { createShellRuntime } from '../src/shell/shell.ts';
import { widgetSentence as domSentence } from '../src/dom/host.ts';
import { widgetSentence as reactSentence } from '../../maya-carrier-react/src/runtime/copy.ts';
const fixture = () => JSON.parse(fs.readFileSync(new URL('../dev/fixtures/envelopes/h7/invariant/kind-booking-confirmation.json', import.meta.url), 'utf8'));
const response = () => ({ contract: 'maya.widget.intent/1', outcome: 'terminate', code: null,
  next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED', owner_decision: { state: 'UNKNOWN' } });
const refused = code => ({ ...response(), code, receipt_outcome: 'REFUSED', owner_decision: null,
  reason_text: { phrase_key: BOOKING_REFUSALS[code].phrase_key, rendered: BOOKING_REFUSALS[code].rendered } });
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };
const setup = (options = {}) => {
  let serial = 0;
  const submissions = [];
  const resolves = [];
  let a11yChange;
  const e = options.envelope ?? fixture();
  const transport = {
    async widgetIntent(submission) {
      submissions.push(submission);
      if (options.send) return options.send(submission);
      return { ok: true, value: projectWidgetIntent(options.response ?? response()) };
    },
    async resolveWidgets(request) {
      resolves.push(request);
      return options.page ?? { ok: true, value: { widgets: [], tenant_bound: true } };
    },
    async chat() { assert.fail('no chat or direct approve call belongs to a button'); },
  };
  const runtime = createShellRuntime({
    transport,
    session: { view: () => ({ signedIn: true, display: { userName: 'Test owner', tenantName: null } }), subscribe: () => () => undefined },
    render, environment: { a11y: () => A11Y, onA11yChange: callback => { a11yChange = callback; return () => undefined; }, fragment: () => '' },
    scheduler: { now: () => Date.parse('2026-09-17T09:05:00.000Z'), after: () => () => undefined },
    history: { push() {}, back() {}, onBack: () => () => undefined },
    newAbort: () => new AbortController(), newId: () => `booking-outcome-${++serial}`,
    submission: createLiveSubmission(transport),
  });
  const inserted = runtime.widgets.ingest(e);
  assert.equal(inserted.verdict, 'valid');
  const item = () => runtime.conversation.view().items.find(i => i.id === inserted.itemId);
  assert.equal(item().result.mode, options.renderMode ?? 'structured');
  return { ...runtime, envelope: e, submissions, resolves, item,
    a11yChange: () => a11yChange(),
    click: (ref = 'i1') => runtime.widgets.activate(inserted.itemId, `intent:${ref}`) };
};


const page = (lines, options = {}) => ({ ok: true, value: { tenant_bound: options.tenantBound ?? true,
  widgets: [{ envelope: { ...fixture(), widget_id: options.widgetId ?? fixture().widget_id }, terminal_lines: lines }] } });
const plain = nodes => nodes.flatMap(n => n.t === 'block' || n.t === 'choice' ? plain(n.children) : [n]);
const assertFrozen = async s => {
  const hash = s.envelope.integrity.body_hash;
  const lifecycle = JSON.stringify(s.envelope.lifecycle);
  assert.equal(s.item().display, 'terminal');
  for (const rerender of [() => undefined, s.a11yChange]) {
    rerender();
    assert.equal(s.item().result.mode, 'frozen_prose');
    assert.deepEqual(s.item().result.readingOrder, []);
    assert.equal(plain(s.item().result.nodes).some(n => ['action', 'choice', 'field'].includes(n.t)), false);
    assert.equal((await s.click()).reason, 'not_drawn');
    assert.equal(s.submissions.length, 1);
    assert.equal(s.envelope.integrity.body_hash, hash);
    assert.equal(JSON.stringify(s.envelope.lifecycle), lifecycle);
    const preview = JSON.stringify(s.item().result.nodes);
    assert.ok(preview.includes(s.envelope.body.staff_label.label));
    for (const notice of s.envelope.body.policy_notices) assert.ok(preview.includes(notice.rendered));
  }
};

for (const [code, phrase] of Object.entries(BOOKING_REFUSALS)) {
  test(`${code}: persisted reason and fallback remain precise; tokens cannot be reused`, async t => {
    const line = { outcome: 'NOT_CONFIRMED', text: phrase.rendered, action_receipt_ref: null };
    for (const resolved of [page([line]), { ok: false, failure: { reason: 'no_connection' } }]) {
      const s = setup({ response: refused(code), page: resolved }); t.after(s.dispose);
      await s.click();
      assert.equal(s.item().sentence, resolved.ok ? null : phrase.sentence);
      if (resolved.ok) assert.ok(JSON.stringify(s.conversation.view().items).includes(phrase.rendered));
      assert.equal(s.resolves.length, 1);
      await assertFrozen(s);
    }
  });
  test(`${code}: DOM and React wording match the canonical reason table`, () => {
    assert.equal(domSentence(phrase.sentence), phrase.rendered);
    assert.equal(reactSentence(phrase.sentence), phrase.rendered);
    const table = fs.readFileSync(new URL('../../maya-saas-backend/src/widget-contract/reason-table.ts', import.meta.url), 'utf8');
    assert.ok(table.includes(phrase.phrase_key)); assert.ok(table.includes(phrase.rendered));
  });
}

test('projection rejects forged/inherited/accessor phrase and never copies arbitrary errors', () => {
  for (const phrase of [{ ...refused('handle_stale').reason_text, rendered: 'private exception' },
    Object.create(refused('handle_stale').reason_text),
    { get phrase_key() { assert.fail('getter invoked'); }, rendered: BOOKING_REFUSALS.handle_stale.rendered }]) {
    assert.equal(projectWidgetIntent({ ...refused('handle_stale'), reason_text: phrase }).reason_text, undefined);
  }
});

test('UNKNOWN remains submitted, never NOT_CONFIRMED, even with stray refusal text', async t => {
  const s = setup({ response: { ...response(), reason_text: refused('handle_stale').reason_text },
    page: page([{ outcome: 'SUBMITTED', text: 'Результат пока не подтверждён. Не отправляйте повторно.', action_receipt_ref: null }]) });
  t.after(s.dispose); await s.click(); await assertFrozen(s);
  assert.equal(s.item().sentence, null);
  const shown = JSON.stringify(s.conversation.view().items);
  assert.ok(shown.includes('Не отправляйте повторно'));
  assert.equal(shown.includes('NOT_CONFIRMED'), false);
});

for (const reason of ['no_connection', 'server_error', 'unexpected_response']) {
  test(`submitted ${reason} never offers a second POST, including accessibility rerender`, async t => {
    const s = setup({ send: async () => ({ ok: false, failure: { reason } }) }); t.after(s.dispose);
    await s.click(); assert.equal(s.item().sentence, 'booking_unconfirmed');
    await assertFrozen(s);
    assert.equal(s.resolves.length, 0);
    assert.equal(JSON.stringify(s.conversation.view().items).includes('NOT_CONFIRMED'), false);
  });
}

test('unbound or another widget receipt cannot settle this confirmation', async t => {
  for (const options of [{ tenantBound: false }, { widgetId: 'other-widget' }]) {
    const s = setup({ page: page([{ outcome: 'CONFIRMED', text: 'foreign success', action_receipt_ref: 'foreign' }], options) });
    t.after(s.dispose); await s.click(); await assertFrozen(s);
    assert.equal(s.item().sentence, 'booking_unconfirmed');
    assert.equal(JSON.stringify(s.conversation.view().items).includes('foreign success'), false);
  }
});

test('confirmed receipt is stated once and retains the factual static preview', async t => {
  const s = setup({ response: { ...response(), owner_decision: { state: 'SUCCEEDED' } },
    page: page([{ outcome: 'CONFIRMED', text: 'Запись подтверждена.', action_receipt_ref: 'canonical-ae' }]) });
  t.after(s.dispose); await s.click(); await assertFrozen(s);
  assert.equal(JSON.stringify(s.conversation.view().items).split('Запись подтверждена.').length - 1, 1);
});
