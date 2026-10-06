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
const envelope = () => {
  const e = fixture();
  e.source.capability = 'catalog.service.price.update';
  const cell = value => ({ ...e.body.subject, value, label: String(value) });
  const money = value => ({ ...cell(value), key: 'service.price.proposed', unit: 'RUB',
    basis_key: null, basis: 'YCLIENTS', currency: 'RUB', formatted: `${value} RUB`, comparison: null });
  e.body.effect_preview = [
    { label: { phrase_key: 'approval.service', rendered: 'Услуга' }, value: cell('201') },
    { label: { phrase_key: 'approval.current_price', rendered: 'Текущая цена' }, value: money(2000) },
    { label: { phrase_key: 'approval.proposed_price', rendered: 'Новая цена' }, value: money(2500) },
  ];
  e.body.audience_size = null;
  e.body.risk_tier.value = 'high_write';
  for (const intent of e.intents.filter(i => i.effect === 'COMMIT')) {
    intent.capability = { space: 'AE', key: 'crm.service.fixed-price.update.v1' };
    intent.confirmation.audience_size = null;
  }
  return seal(e);
};
const completed = () => ({ decision: 'APPROVED', status: 'completed', state: 'SUCCEEDED', outcome: {
  verified: true, source: 'yclients', currency: 'RUB', service_id: 201, price_rubles: 2500,
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

test('allowlisted owner projection copies only own data properties, never accessors or extra payload', () => {
  const raw = completed();
  raw.secret = 'must-not-cross'; raw.outcome.secret = 'must-not-cross';
  const projected = projectWidgetIntent(response(raw));
  assert.deepEqual(projected.owner_decision, { ...completed(), outcome: { ...completed().outcome, service_id: '201' } });
  assert.equal(JSON.stringify(projected).includes('must-not-cross'), false);
  const getters = { get verified() { assert.fail('getter invoked'); }, get action_execution_id() { assert.fail('getter invoked'); } };
  const untrusted = projectWidgetIntent(response({ ...completed(), outcome: getters }));
  assert.equal(untrusted.owner_decision.outcome.verified, false);
  assert.equal(untrusted.owner_decision.outcome.action_execution_id, null);
  assert.equal(projectWidgetIntent(response(Object.create(completed()))).owner_decision.state, null);
  assert.equal('owner_decision' in projectWidgetIntent(response(null)), false);
});

test('exact approved diff plus verified owner readback shows confirmation through the standard gateway', async t => {
  const s = setup(); t.after(s.dispose);
  await s.click();
  assert.equal(s.item().sentence, 'service_price_confirmed');
  assert.equal(s.item().display, 'terminal');
  assert.equal(s.submissions.length, 1);
  assert.deepEqual(s.submissions[0], { contract: 'maya.widget.intent.submission/1', widget_id: s.envelope.widget_id,
    intent_token: s.envelope.intents[0].intent_token, inputs: null, client_nonce: 'price-outcome-1', profile_id: s.envelope.render.profile_id });
  assert.deepEqual(s.resolves, [{ thread_page: { limit: 20 } }]);
  const view = JSON.stringify(s.conversation.view());
  assert.equal(view.includes('synthetic-ae-execution-1'), false);
  assert.equal(view.includes(s.envelope.intents[0].intent_token), false);
  assert.equal(s.conversation.view().items.filter(i => i.kind === 'assistant').length, 0, 'no synthetic terminal journal line');
});

for (const [name, change] of [
  ['UNKNOWN', d => { d.state = 'UNKNOWN'; }],
  ['incomplete status', d => { d.status = 'pending'; }],
  ['wrong decision', d => { d.decision = 'REJECTED'; }],
  ['unverified', d => { d.outcome.verified = false; }],
  ['truthy verification', d => { d.outcome.verified = 'true'; }],
  ['different provider', d => { d.outcome.source = 'internal'; }],
  ['different currency', d => { d.outcome.currency = 'USD'; }],
  ['different service', d => { d.outcome.service_id = 202; }],
  ['different price', d => { d.outcome.price_rubles = 2501; }],
  ['string price', d => { d.outcome.price_rubles = '2500'; }],
  ['nonfinite price', d => { d.outcome.price_rubles = Infinity; }],
  ['missing AE receipt', d => { delete d.outcome.action_execution_id; }],
  ['empty AE receipt', d => { d.outcome.action_execution_id = ''; }],
  ['blank AE receipt', d => { d.outcome.action_execution_id = '  '; }],
  ['missing outcome', d => { delete d.outcome; }],
]) test(`${name} never confirms an ACCEPTED pricing button`, async t => {
  const decision = completed(); change(decision);
  const s = setup({ response: response(decision) }); t.after(s.dispose);
  await s.click();
  assert.equal(s.item().sentence, 'service_price_unconfirmed');
  assert.equal(s.item().display, 'terminal');
  assert.equal(s.submissions.length, 1);
});

for (const [name, alter] of [
  ['missing service row', e => { e.body.effect_preview.shift(); }],
  ['duplicate service rows', e => { e.body.effect_preview.push(structuredClone(e.body.effect_preview[0])); }],
  ['different proposed amount', e => { e.body.effect_preview[2].value.value = 2700; }],
  ['different proposed currency', e => { e.body.effect_preview[2].value.currency = 'USD'; }],
]) test(`${name} cannot borrow a different diff's owner receipt`, async t => {
  const e = envelope(); alter(e); seal(e);
  const s = setup({ envelope: e }); t.after(s.dispose);
  await s.click(); assert.equal(s.item().sentence, 'service_price_unconfirmed');
});

test('ACCEPTED alone and even an unrelated terminal line cannot claim a provider price change', async t => {
  const e = envelope();
  const s = setup({ envelope: e, response: response(null), page: { ok: true, value: { tenant_bound: true, widgets: [{
    envelope: e, terminal_lines: [{ outcome: 'CONFIRMED', text: 'A different result', action_receipt_ref: 'other-ae' }],
  }] } } }); t.after(s.dispose);
  await s.click();
  assert.equal(s.item().sentence, 'service_price_unconfirmed');
  assert.equal(s.conversation.view().items.some(i => i.text === 'A different result'), false);
});

test('canonical rejected decision is shown only for the rejection control', async t => {
  const raw = response({ decision: 'REJECTED', status: 'rejected', state: 'REJECTED' });
  const reject = setup({ response: raw }); const approve = setup({ response: raw });
  t.after(reject.dispose); t.after(approve.dispose);
  await reject.click('i2'); await approve.click('i1');
  assert.equal(reject.item().sentence, 'service_price_rejected');
  assert.equal(approve.item().sentence, 'service_price_unconfirmed');
});

test('successful owner data on a refused gateway response is never confirmation', async t => {
  const s = setup({ response: { ...response(completed()), outcome: 'refuse', receipt_outcome: 'REFUSED' } }); t.after(s.dispose);
  await s.click(); assert.equal(s.item().sentence, 'activation_forbidden');
});

test('lost response says unconfirmed and never automatically sends a second mutation', async t => {
  const s = setup({ send: async () => ({ ok: false, failure: { reason: 'no_connection' } }) }); t.after(s.dispose);
  await s.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.item().sentence, 'service_price_unconfirmed');
  assert.equal(s.submissions.length, 1); assert.equal(s.resolves.length, 0);
});

test('a late result cannot confirm a superseding price proposal', async t => {
  let finish;
  const s = setup({ send: () => new Promise(resolve => { finish = resolve; }) }); t.after(s.dispose);
  const pending = s.click();
  const next = envelope(); next.widget_id = '01M2Q9G7M0XX12C7H20TZJKQ7M';
  next.lifecycle.supersedes_widget_id = s.envelope.widget_id;
  next.body.effect_preview[2].value.value = 2700;
  s.widgets.ingest(seal(next));
  finish({ ok: true, value: projectWidgetIntent(response(completed())) }); await pending;
  assert.equal(s.item().sentence, null); assert.equal(s.item().display, 'live');
});

test('unrelated APPROVAL retains its existing ACCEPTED behavior', async t => {
  const s = setup({ envelope: fixture() }); t.after(s.dispose);
  await s.click(); assert.equal(s.item().sentence, null); assert.equal(s.item().display, 'terminal');
});

test('a different WidgetSource cannot borrow pricing wording from an extra capability property', async t => {
  const e = envelope();
  e.source = { from: 'action_execution', execution_id: 'synthetic-action', capability: 'catalog.service.price.update' };
  const s = setup({ envelope: seal(e) }); t.after(s.dispose);
  await s.click(); assert.equal(s.item().sentence, null); assert.equal(s.item().display, 'terminal');
});

test('React and DOM carriers use the same honest pricing sentences', () => {
  for (const [key, text] of [
    ['service_price_confirmed', 'Цена подтверждена в YCLIENTS'],
    ['service_price_unconfirmed', 'Результат пока не подтверждён. Не отправляйте повторно'],
    ['service_price_rejected', 'Изменение отклонено'],
  ]) {
    assert.equal(reactSentence(key), text); assert.equal(domSentence(key), text);
  }
});


const visibleStrings = nodes => nodes.flatMap(node => {
  if (node.t === 'block' || node.t === 'choice') return visibleStrings(node.children);
  return 'text' in node ? [node.text] : [];
});
const assertStaticPriceReceipt = (s, sentence) => {
  const item = s.item();
  assert.equal(item.display, 'terminal');
  assert.equal(item.sentence, sentence);
  assert.deepEqual(item.result.readingOrder, []);
  assert.deepEqual(interactiveRefs(item.result.nodes), []);
  assert.equal(item.result.liveRegion, 'off');
  assert.equal(visibleStrings(item.result.nodes).includes(s.envelope.body.state.label), false,
    'an obsolete pending prompt is not drawn alongside the receipt');
  for (const row of s.envelope.body.effect_preview) {
    assert.ok(visibleStrings(item.result.nodes).includes(row.value.formatted ?? row.value.label),
      'the exact authoritative diff is retained');
  }
  assert.equal(s.widgets.heldTokens(), 0);
};

for (const [name, raw, ref, sentence] of [
  ['confirmed', completed(), 'i1', 'service_price_confirmed'],
  ['rejected', { decision: 'REJECTED', state: 'REJECTED', status: 'rejected' }, 'i2', 'service_price_rejected'],
  ['UNKNOWN', { decision: 'APPROVED', state: 'UNKNOWN', status: 'unknown' }, 'i1', 'service_price_unconfirmed'],
]) test(`${name} becomes a static diff; repeated callbacks and accessibility redraw preserve its receipt`, async t => {
  const s = setup({ response: response(raw) }); t.after(s.dispose);
  const originalBytes = JSON.stringify(s.envelope);
  await s.click(ref);
  assertStaticPriceReceipt(s, sentence);
  for (const oldRef of s.envelope.intents.map(intent => intent.intent_ref)) {
    assert.deepEqual(await s.click(oldRef), { outcome: 'ignored', reason: 'not_drawn' });
    assertStaticPriceReceipt(s, sentence);
  }
  s.a11yChange();
  assertStaticPriceReceipt(s, sentence);
  assert.equal(s.submissions.length, 1);
  assert.equal(JSON.stringify(s.envelope), originalBytes, 'no fake lifecycle or body-state mutation');
});

test('lost mutation response freezes the preview and explicit repeated click cannot resend or replace UNKNOWN', async t => {
  const s = setup({ send: async () => ({ ok: false, failure: { reason: 'no_connection' } }) }); t.after(s.dispose);
  await s.click(); await s.click(); await s.click('i2');
  assertStaticPriceReceipt(s, 'service_price_unconfirmed');
  s.a11yChange();
  assertStaticPriceReceipt(s, 'service_price_unconfirmed');
  assert.equal(s.submissions.length, 1);
});

test('a newly loaded runtime carries no old pricing result or enabled confirmation from history alone', async t => {
  const old = setup({ response: response({ decision: 'APPROVED', state: 'UNKNOWN', status: 'unknown' }) });
  await old.click(); old.dispose();
  const submissions = [];
  const fresh = createShellRuntime({
    transport: {
      async conversation() { return { ok: true, value: { conversationId: 'restored', truncated: false,
        turns: [{ role: 'assistant', text: 'Изменение цены ожидает проверки.', completed: true }] } }; },
      async chat() { assert.fail('reload does not create an action'); },
      async resolveWidgets() { assert.fail('reload cannot invent an authoritative price receipt'); },
    },
    submission: { async submit(value) { submissions.push(value); return { status: 'accepted' }; } },
    session: { view: () => ({ signedIn: true, display: { userName: 'Test owner', tenantName: null } }), subscribe: () => () => undefined },
    render, environment: { a11y: () => A11Y, onA11yChange: () => () => undefined, fragment: () => '' },
    scheduler: { now: () => Date.parse('2026-09-17T09:05:00.000Z'), after: () => () => undefined },
    history: { push() {}, back() {}, onBack: () => () => undefined },
    newAbort: () => new AbortController(), newId: () => 'reload-id',
  });
  t.after(fresh.dispose);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fresh.conversation.view().items.filter(item => item.kind === 'assistant').map(item => item.text),
    ['Изменение цены ожидает проверки.']);
  assert.equal(fresh.conversation.view().items.some(item => item.kind === 'widget'), false);
  assert.equal(fresh.widgets.heldTokens(), 0);
  assert.equal(submissions.length, 0);
});

for (const textOnly of [false, true]) for (const sourceName of ['PENDING', 'Подтвердить цену']) {
  test(`receipt preserves colliding exact service labels (${sourceName}, textOnly=${textOnly})`, async t => {
    const e = envelope();
    e.body.subject.label = sourceName; e.body.subject.value = sourceName;
    e.body.state.label = 'PENDING';
    e.intents[0].label = 'Подтвердить цену';
    e.presentation.a11y.accessible_names['intent:i1'] = 'Подтвердить цену';
    e.body.effect_preview[0].value.label = sourceName;
    if (textOnly) e.render.render_tier = 'TEXT_ONLY';
    const s = setup({ envelope: seal(e), renderMode: textOnly ? 'prose' : 'structured' }); t.after(s.dispose);
    await s.click();
    assert.equal(s.item().sentence, 'service_price_confirmed');
    assert.deepEqual(interactiveRefs(s.item().result.nodes), []);
    assert.equal(visibleStrings(s.item().result.nodes).filter(text => text === sourceName).length, 2,
      'exact subject and service fact survive; only the named state field is omitted');
    for (const row of e.body.effect_preview) {
      assert.ok(visibleStrings(s.item().result.nodes).includes(row.value.formatted ?? row.value.label));
    }
  });
}

test('a corrected proposal supersedes a frozen UNKNOWN card and needs its own authoritative receipt', async t => {
  let next = { decision: 'APPROVED', state: 'UNKNOWN', status: 'unknown' };
  const s = setup({ send: async () => ({ ok: true, value: projectWidgetIntent(response(next)) }) }); t.after(s.dispose);
  await s.click();
  const replacement = envelope(); replacement.widget_id = '01M2Q9G7M0XX12C7H20TZJKQ7M';
  replacement.lifecycle.supersedes_widget_id = s.envelope.widget_id;
  replacement.body.effect_preview[2].value.value = 2700;
  replacement.body.effect_preview[2].value.formatted = '2700 RUB';
  s.widgets.ingest(seal(replacement));
  assert.equal(s.item().sentence, null); assert.equal(s.item().display, 'live');
  assert.ok(s.item().result.readingOrder.includes('intent:i1'));
  next = completed(); next.outcome.price_rubles = 2700;
  await s.click();
  assert.equal(s.item().sentence, 'service_price_confirmed');
  assert.equal(s.submissions.length, 2, 'one request per separately sealed and confirmed proposal');
});

for (const state of ['SUCCEEDED', 'UNKNOWN']) test(`a ${state} decision from detail freezes its exact parent preview`, async t => {
  const e = envelope();
  e.presentation.fullscreen_detail.route_key = 'fs.catalogue';
  e.intents[2].target.ref = 'fs.catalogue';
  seal(e);
  const child = structuredClone(e);
  child.widget_id = '01M2Q9G7M0XX12C7H20TZJKQ7N';
  child.correlation.parent_widget_id = e.widget_id;
  child.presentation.density = 'SHEET';
  seal(child);
  const decision = completed(); decision.state = state;
  const s = setup({ envelope: e, send: async submission => ({ ok: true, value: projectWidgetIntent(
    submission.widget_id === e.widget_id ? { ...response(null), next_envelope: child } : response(decision)
  ) }) }); t.after(s.dispose);
  await s.click('i3');
  const detail = s.shell.view().fullscreen;
  assert.equal(detail.phase, 'open');
  await s.widgets.activate(detail.itemId, 'intent:i1');
  assert.equal(s.shell.view().fullscreen, null);
  assertStaticPriceReceipt(s, state === 'SUCCEEDED' ? 'service_price_confirmed' : 'service_price_unconfirmed');
  await s.click();
  assert.equal(s.submissions.length, 2, 'one detail open and one decision, no parent retry');
});
