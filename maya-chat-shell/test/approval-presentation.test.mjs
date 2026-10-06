// Generic APPROVAL presentation only. These local source fixtures do not mint approval authority
// or qualify a provider lane: HMAC, policy and business receipts remain server responsibilities.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bodyHash } from '../src/integrity/h7.ts';
import { projectChat } from '../src/net/project.ts';
import { render } from '../src/renderer/render.ts';
import { createLiveSubmission } from '../src/shell/intents.ts';
import { createShellRuntime } from '../src/shell/shell.ts';

const fixture = (name = 'kind-approval') => JSON.parse(fs.readFileSync(new URL(`../dev/fixtures/envelopes/h7/invariant/${name}.json`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-09-17T09:05:00.000Z');
const BEFORE = '2026-09-17T09:04:00.000Z';
const AFTER = '2026-09-17T09:06:00.000Z';
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };
const rehash = (envelope) => { envelope.integrity.body_hash = bodyHash(envelope); return envelope; };
const resolution = (envelope) => envelope === null ? null : ({ matched: true, receipt: {
  widget_id: envelope.widget_id, envelope_seal: envelope.integrity.envelope_seal, envelope,
}, dismiss_widget_id: null });
const flush = () => new Promise((resolve) => setImmediate(resolve));

const setup = () => {
  let next = null;
  let now = NOW;
  let serial = 0;
  const requests = [];
  const submissions = [];
  const transport = {
    async chat(request) {
      requests.push(request);
      const value = projectChat({ request_id: request.requestId, reply: 'Подготовлено. Требуется подтверждение.',
        action: { status: 'approval_required' }, resolution: resolution(next) }, request.requestId);
      assert.notEqual(value, null, 'the test response meets the existing chat wire boundary');
      return { ok: true, value };
    },
    async widgetIntent(submission) {
      submissions.push(submission);
      return { ok: false, failure: { reason: 'no_connection' } };
    },
    async resolveWidgets() { assert.fail('a lost gateway response must not trigger a reread or retry'); },
  };
  const runtime = createShellRuntime({
    transport,
    session: { view: () => ({ signedIn: true, display: { userName: 'Test owner', tenantName: null } }), subscribe: () => () => undefined },
    render,
    environment: { a11y: () => A11Y, onA11yChange: () => () => undefined, fragment: () => '' },
    // Deliberately do not run timers: guards must also work after a suspended tab resumes.
    scheduler: { now: () => now, after: () => () => undefined },
    history: { push() {}, back() {}, onBack: () => () => undefined },
    newAbort: () => new AbortController(), newId: () => `approval-test-${++serial}`,
    submission: createLiveSubmission(transport),
  });
  return { ...runtime, requests, submissions,
    items: () => runtime.conversation.view().items,
    setNow: (time) => { now = time; },
    async reply(envelope) {
      next = envelope;
      assert.equal(runtime.conversation.submitUserTurn('Покажи подготовленное действие', { modality: 'typed' }).accepted, true);
      await flush();
    },
  };
};
const notices = (s) => s.items().filter((item) => item.notice === 'approval_not_here');
const cards = (s) => s.items().filter((item) => item.kind === 'widget');

test('chat preserves the standard resolution and never reads legacy action.approval', () => {
  const envelope = fixture();
  const action = { status: 'approval_required', get approval() { assert.fail('legacy authority read'); } };
  const projected = projectChat({ request_id: 'request-1', reply: 'Проверьте действие', action, resolution: resolution(envelope) }, 'request-1');
  assert.equal(projected.resolution.receipt.envelope, envelope);
  assert.equal('approval' in projected, false);
  for (const field of ['widget_id', 'envelope_seal']) {
    const invalid = resolution(envelope);
    invalid.receipt[field] = 'mismatch';
    assert.equal(projectChat({ request_id: 'request-1', reply: '', action, resolution: invalid }, 'request-1'), null);
  }
});

test('a live standard approval suppresses only the legacy notice, including an exact duplicate', async (t) => {
  const s = setup(); t.after(s.dispose);
  const envelope = fixture();
  await s.reply(envelope);
  assert.deepEqual(s.items().map((item) => item.kind), ['user', 'assistant', 'widget']);
  assert.equal(cards(s)[0].result.mode, 'structured');
  assert.equal(s.widgets.hasPresentedApproval(envelope), true);
  await s.reply(structuredClone(envelope));
  assert.equal(cards(s).length, 1);
  assert.equal(notices(s).length, 0);
  for (const intent of envelope.intents) assert.equal(JSON.stringify(s.items()).includes(intent.intent_token), false);
});

const refused = [
  ['body mismatch', (e) => { e.body.subject.label = 'Tampered'; }, false],
  ['expired envelope', (e) => { e.lifecycle.expires_at = BEFORE; }],
  ['stale lifecycle', (e) => { e.lifecycle.state = 'EXPIRED'; e.lifecycle.on_expiry = 'mark_stale'; }],
  ['completed approval', (e) => { e.body.state.value = 'COMPLETED'; }],
  ['unknown approval state', (e) => { e.body.state.state = 'UNKNOWN'; e.body.state.value = null; }],
  ['blocked approval', (e) => { e.body.blocked_reason = { phrase_key: 'approval.blocked', rendered: 'Недоступно' }; }],
  ['expired approval body', (e) => { e.body.expires_at = BEFORE; }],
  ['expired primary intent', (e) => { e.intents[0].expires_at = BEFORE; }],
  ['disabled primary intent', (e) => { e.intents[0].enabled.value = false; }],
  ['unknown primary availability', (e) => { e.intents[0].enabled.state = 'UNKNOWN'; e.intents[0].enabled.value = null; }],
  ['missing primary reference', (e) => { e.body.approve_intent = null; }],
  ['missing token', (e) => { e.intents[0].intent_token = null; }],
  ['not primary', (e) => { e.intents[0].role = 'secondary'; }],
  ['not COMMIT', (e) => { e.intents[0].effect = 'REQUEST_APPROVAL'; }],
  ['not drawn', (e) => { e.presentation.a11y.reading_order = e.presentation.a11y.reading_order.filter((ref) => ref.id !== 'i1'); }],
  ['withheld primary', (e) => { e.intents = e.intents.filter((intent) => intent.intent_ref !== 'i1'); e.render.intents_emitted = 2; }],
];
for (const [name, alter, hash = true] of refused) {
  test(`${name} keeps the approval notice`, async (t) => {
    const s = setup(); t.after(s.dispose);
    const envelope = fixture(); alter(envelope); if (hash) rehash(envelope);
    await s.reply(envelope);
    assert.equal(s.widgets.hasPresentedApproval(envelope), false);
    assert.equal(notices(s).length, 1);
    assert.equal(s.submissions.length, 0);
  });
}

for (const [name, alter, hash = true] of [
  ...refused.filter(([name]) => ['body mismatch', 'expired envelope', 'stale lifecycle', 'completed approval', 'blocked approval'].includes(name)),
  ['changed sealed body', (e) => { e.body.subject.label = 'Different proposal'; }],
  ['changed seal', (e) => { e.integrity.envelope_seal = 'b'.repeat(64); }],
  ['changed token', (e) => { e.intents[0].intent_token = 'different-source-fixture-token'; }],
]) {
  test(`a duplicate id with ${name} cannot borrow the current card's presentation`, async (t) => {
    const s = setup(); t.after(s.dispose);
    await s.reply(fixture());
    const different = fixture(); alter(different); if (hash) rehash(different);
    await s.reply(different);
    assert.equal(cards(s).length, 1);
    assert.equal(s.widgets.hasPresentedApproval(different), false);
    assert.equal(notices(s).length, 1);
  });
}

for (const expiry of ['envelope', 'body', 'intent']) {
  test(`current ${expiry} expiry is checked even when background timers have not fired`, async (t) => {
    const s = setup(); t.after(s.dispose);
    const envelope = fixture();
    if (expiry === 'envelope') envelope.lifecycle.expires_at = AFTER;
    if (expiry === 'body') envelope.body.expires_at = AFTER;
    if (expiry === 'intent') envelope.intents[0].expires_at = AFTER;
    rehash(envelope);
    await s.reply(envelope);
    assert.equal(notices(s).length, 0);
    s.setNow(Date.parse(AFTER));
    await s.reply(structuredClone(envelope));
    assert.equal(notices(s).length, 1);
  });
}

test('a superseded envelope cannot borrow its successor presentation or restore old controls', async (t) => {
  const s = setup(); t.after(s.dispose);
  const old = fixture();
  await s.reply(old);
  const itemId = cards(s)[0].id;
  const next = fixture(); next.widget_id = '01M2Q9G7M0XX12C7H20TZJKQ7M'; next.lifecycle.supersedes_widget_id = old.widget_id;
  next.intents[0].intent_token = 'successor-fixture-token'; rehash(next);
  await s.reply(next);
  assert.equal(cards(s).length, 1);
  assert.equal(cards(s)[0].id, itemId);
  assert.equal(s.widgets.hasPresentedApproval(next), true);
  assert.equal(s.widgets.hasPresentedApproval(old), false);
  await s.reply(old);
  assert.equal(notices(s).length, 1);
  await s.widgets.activate(itemId, 'intent:i1');
  assert.equal(s.submissions[0].intent_token, next.intents[0].intent_token);
});

test('no resolution or an unrelated widget keeps the legacy notice', async (t) => {
  const s = setup(); t.after(s.dispose);
  await s.reply(null);
  await s.reply(fixture('kind-schedule'));
  assert.equal(notices(s).length, 2);
});

for (const ref of ['i1', 'i2']) {
  test(`standard ${ref} activation uses the existing gateway once; a lost response claims no success`, async (t) => {
    const s = setup(); t.after(s.dispose);
    const envelope = fixture(); await s.reply(envelope);
    const card = cards(s)[0];
    await s.widgets.activate(card.id, `intent:${ref}`);
    await flush();
    assert.equal(s.submissions.length, 1);
    assert.deepEqual(s.submissions[0], { contract: 'maya.widget.intent.submission/1', widget_id: envelope.widget_id,
      intent_token: envelope.intents.find((intent) => intent.intent_ref === ref).intent_token,
      inputs: null, client_nonce: 'approval-test-2', profile_id: envelope.render.profile_id });
    assert.equal(cards(s)[0].sentence, 'no_connection');
    assert.equal(cards(s)[0].display, 'live');
    assert.equal(s.items().filter((item) => item.kind === 'assistant').length, 1);
  });
}
