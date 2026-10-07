// Local synthetic carrier proof. Provider authority is supplied by the canonical gateway owner;
// these fixtures exercise strict projection and truthful wording, not real provider writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bodyHash } from '../src/integrity/h7.ts';
import { projectWidgetIntent } from '../src/net/project.ts';
import { interactiveRefs, render } from '../src/renderer/render.ts';
import { createLiveSubmission } from '../src/shell/intents.ts';
import { createShellRuntime } from '../src/shell/shell.ts';
import { widgetSentence as domSentence } from '../src/dom/host.ts';
import { widgetSentence as reactSentence } from '../../maya-carrier-react/src/runtime/copy.ts';

const fixture = () => JSON.parse(fs.readFileSync(new URL('../dev/fixtures/envelopes/h7/invariant/kind-approval.json', import.meta.url), 'utf8'));
const seal = e => { e.integrity.body_hash = bodyHash(e); return e; };
const facts = Object.freeze({ company_id: '77', goods_id: '123', store_id: '9', quantity: '2.5', unit_id: '11', unit_cost: '10.25', currency: 'RUB', line_total: '25.625', received_at: '2026-10-07T09:00:00Z' });
const envelope = () => {
  const e = fixture();
  e.source.capability = 'inventory.goods.receipt.prepare';
  const cell = value => ({ ...e.body.subject, value, label: String(value) });
  e.body.effect_preview = Object.entries(facts).map(([key, value]) => ({ label: { phrase_key: `approval.goods_receipt.${key}`, rendered: key }, value: cell(value) }));
  e.body.audience_size = null;
  e.body.risk_tier.value = 'high_write';
  for (const intent of e.intents.filter(i => i.effect === 'COMMIT')) {
    intent.capability = { space: 'AE', key: 'crm.goods.receipt.create.v1' };
    intent.confirmation.audience_size = null;
  }
  return seal(e);
};
const completed = () => ({ decision: 'APPROVED', status: 'completed', state: 'SUCCEEDED', outcome: {
  ...facts, verified: true, source: 'yclients', operation: 'stock_receipt', receipt_id: 'synthetic-receipt-1',
  catalog_price_change_requested: false, absolute_stock_assignment_requested: false,
  action_execution_id: 'synthetic-ae-execution-1',
} });
const response = (decision) => ({ contract: 'maya.widget.intent/1', outcome: 'terminate', code: null,
  next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED', owner_decision: decision });
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };
const setup = (options = {}) => {
  let serial = 0;
  const submissions = [];
  const resolves = [];
  let a11yChange;
  const e = options.envelope ?? envelope();
  const transport = {
    async widgetIntent(submission) {
      submissions.push(submission);
      if (options.send) return options.send(submission);
      return { ok: true, value: projectWidgetIntent(options.response ?? response(completed())) };
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
    newAbort: () => new AbortController(), newId: () => `price-outcome-${++serial}`,
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


test('exact fractional receipt renders current React wording, freezes controls, and never rewrites sealed facts', async t => {
  const s = setup(); t.after(s.dispose); const before = JSON.stringify(s.envelope);
  await s.click(); assert.equal(s.item().sentence, 'goods_receipt_confirmed');
  assert.equal(s.item().display, 'terminal'); assert.equal(s.submissions.length, 1);
  assert.equal(interactiveRefs(s.item().result.nodes).length, 0); assert.equal(JSON.stringify(s.envelope), before);
  assert.equal(reactSentence(s.item().sentence), 'Приход товара подтверждён в YCLIENTS.');
  assert.equal(domSentence(s.item().sentence), reactSentence(s.item().sentence));
  await s.click(); assert.equal(s.submissions.length, 1);
});
for (const key of Object.keys(facts)) test(`mismatched ${key} never confirms an accepted receipt`, async t => {
  const raw = completed(); raw.outcome[key] = key === 'line_total' ? '25.63' : 'different';
  const s = setup({ response: response(raw) }); t.after(s.dispose); await s.click();
  assert.equal(s.item().sentence, 'goods_receipt_unconfirmed'); assert.equal(interactiveRefs(s.item().result.nodes).length, 0);
});
for (const [name, change] of [
 ['unknown', d => { d.state = 'UNKNOWN'; }], ['accepted only', d => { delete d.outcome; }],
 ['no AE', d => { delete d.outcome.action_execution_id; }], ['no receipt', d => { delete d.outcome.receipt_id; }],
 ['wrong provider', d => { d.outcome.source = 'internal'; }], ['not verified', d => { d.outcome.verified = 'true'; }],
 ['sale price requested', d => { d.outcome.catalog_price_change_requested = true; }],
 ['absolute stock requested', d => { d.outcome.absolute_stock_assignment_requested = true; }],
 ['wrong operation', d => { d.outcome.operation = 'sale'; }],
]) test(`${name} stays unconfirmed without another submission`, async t => {
 const raw = completed(); change(raw); const s = setup({ response: response(raw) }); t.after(s.dispose);
 await s.click(); await s.click(); assert.equal(s.item().sentence, 'goods_receipt_unconfirmed'); assert.equal(s.submissions.length, 1);
});
for (const kind of ['no_connection', 'server_error', 'unexpected_response']) test(`${kind} cannot offer retry`, async t => {
 const s = setup({ send: () => ({ ok: false, failure: { reason: kind } }) }); t.after(s.dispose);
 await s.click(); await s.click(); assert.equal(s.item().sentence, 'goods_receipt_unconfirmed'); assert.equal(s.submissions.length, 1);
});
test('only rejection control can claim a rejected receipt', async t => {
 const res = response({ decision: 'REJECTED', status: 'rejected', state: 'REJECTED' });
 const yes = setup({ response: res }), no = setup({ response: res }); t.after(yes.dispose); t.after(no.dispose);
 await yes.click(); await no.click('i2'); assert.equal(yes.item().sentence, 'goods_receipt_unconfirmed'); assert.equal(no.item().sentence, 'goods_receipt_rejected');
});
test('duplicate or missing preview field cannot borrow readback', async t => {
 for (const duplicate of [true, false]) { const e = envelope(); if (duplicate) e.body.effect_preview.push(structuredClone(e.body.effect_preview[0])); else e.body.effect_preview.shift(); seal(e);
  const s = setup({ envelope: e }); t.after(s.dispose); await s.click(); assert.equal(s.item().sentence, 'goods_receipt_unconfirmed'); }
});
test('projection ignores getters and undeclared provider data', () => {
 const raw = completed(); raw.outcome.secret = 'must-not-cross'; Object.defineProperty(raw.outcome, 'receipt_id', { get() { assert.fail('getter executed'); }, enumerable: true });
 const projected = projectWidgetIntent(response(raw)); assert.equal(projected.owner_decision.outcome.goods_receipt.receipt_id, null); assert.equal(JSON.stringify(projected).includes('must-not-cross'), false);
});
