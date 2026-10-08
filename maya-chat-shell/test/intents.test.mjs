// K5 / S4 — widget items (src/shell/intents.ts): the vault, ingest, activation and the P1 submission
// binding (SHELL-PLAN v2.1 §1.5B-E; D1, D3, D9; F60, L6, L7, R3.3.4, R7-E3; P-24, P-25, P-41).
//
//   node --test test/intents.test.mjs
//
// Everything runs through `createShellRuntime` with the real renderer and S2's backend-hashed corpus.
// The transport and the submission port are counting doubles, so "0 requests" is a count, not a claim.
// Envelopes altered for a case are re-sealed with `integrity/h7.ts` `bodyHash`, so H7 still says
// 'valid' and the case exercises the rule under test rather than the frozen-prose fallback.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '../src/renderer/render.ts';
import { bodyHash } from '../src/integrity/h7.ts';
import { createPersonalBooking } from '../src/shell/personal-booking.ts';
import { projectWidgetIntent } from '../src/net/project.ts';
import { createShellRuntime } from '../src/shell/shell.ts';
import {
  createLiveSubmission,
  createTokenVault,
  createUnavailableSubmission,
  displayOf,
  inputsForActivation,
  intentRefFor,
} from '../src/shell/intents.ts';
import { DISPLAY_CAP } from '../src/shell/conversation.ts';
import { emitContract, loadTypeScript } from '../build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');
const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const NOW = Date.parse(INDEX.now);
const A11Y = { reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false };
const NINE = ['fs.booking', 'fs.client-card', 'fs.calendar', 'fs.catalogue', 'fs.team-thread', 'fs.report', 'fs.consent', 'fs.payment', 'fs.media'];

const fixture = (id) => INDEX.fixtures.find((f) => f.id === id);
const envelope = (id) => JSON.parse(fs.readFileSync(path.join(FIXTURES, fixture(id).file), 'utf8'));
const reseal = (env) => ((env.integrity.body_hash = bodyHash(env)), env);
const flush = () => new Promise((resolve) => setImmediate(resolve));

const setup = (options = {}) => {
  const counts = { chat: 0, transcribe: 0 };
  const submissions = [];
  const history = { pushes: 0, backs: 0, onBack: null };
  const timers = [];
  let now = options.now ?? NOW;
  let a11y = A11Y;
  const a11yListeners = new Set();
  const sessionListeners = new Set();
  let sessionView = { signedIn: true, display: { userName: 'Стас', tenantName: 'Мужская Эстетика' } };
  let nonces = 0;
  const submission = options.submission ?? {
    submit(s, signal) {
      submissions.push({ submission: s, signal });
      return createUnavailableSubmission().submit(s, signal);
    },
  };
  const runtime = createShellRuntime({
    transport: {
      resolveWidgets: (request, signal) => options.receiptRead ? options.receiptRead(request, signal) : options.observe ? options.observe(request) : Promise.resolve({ ok: false, failure: { reason: 'forbidden' } }),
      chat: (body, signal) => ((counts.chat += 1), (options.chat ?? (() => new Promise(() => undefined)))(body, signal)),
      transcribe: () => ((counts.transcribe += 1), new Promise(() => undefined)),
    },
    session: { view: () => sessionView, subscribe: (l) => (sessionListeners.add(l), () => sessionListeners.delete(l)) },
    render,
    environment: { a11y: () => a11y, onA11yChange: (l) => (a11yListeners.add(l), () => a11yListeners.delete(l)), fragment: () => '' },
    scheduler: {
      now: () => now,
      after: (ms, run) => {
        const timer = { at: now + ms, run, cancelled: false };
        timers.push(timer);
        return () => (timer.cancelled = true);
      },
    },
    history: {
      push: () => (history.pushes += 1),
      back: () => (history.backs += 1),
      onBack: (l) => ((history.onBack = l), () => (history.onBack = null)),
    },
    newAbort: () => new AbortController(),
    submission,
    newId: () => `nonce-${String(++nonces).padStart(6, '0')}`,
  });
  const items = () => runtime.conversation.view().items;
  const item = (id) => items().find((i) => i.id === id);
  return {
    runtime,
    counts,
    submissions,
    history,
    items,
    item,
    advance(ms) {
      now += ms;
      for (const t of timers.filter((x) => !x.cancelled && x.at <= now)) {
        t.cancelled = true;
        t.run();
      }
    },
    setA11y(next) {
      a11y = next;
      for (const l of [...a11yListeners]) l(next);
    },
    signOut() {
      sessionView = { signedIn: false, reason: 'signed_out' };
      for (const l of [...sessionListeners]) l(sessionView);
    },
    timers,
  };
};

const LIVE_FIXTURES = INDEX.fixtures.filter((f) => f.expect.mode !== 'frozen_prose');

// ── the vault ──────────────────────────────────────────────────────────────────────────────────

test('the vault: tokens by item and intent ref; lookups only, no enumeration; drop and clear', () => {
  const vault = createTokenVault();
  assert.deepEqual(Object.keys(vault).sort(), ['clear', 'drop', 'get', 'put', 'refOf', 'size']);
  vault.put('w1', 'i1', 'tok-a');
  vault.put('w1', 'i2', 'tok-b');
  vault.put('d2', 'i1', 'tok-c');
  assert.equal(vault.get('w1', 'i2'), 'tok-b');
  assert.equal(vault.get('w1', 'i3'), null);
  assert.equal(vault.get('d2', 'i1'), 'tok-c', 'a detail with the same refs keeps its own tokens');
  assert.equal(vault.refOf('w1', 'tok-a'), 'i1');
  assert.equal(vault.refOf('d2', 'tok-a'), null, 'lookups never cross items');
  assert.equal(vault.size(), 3);
  vault.drop('w1');
  assert.equal(vault.get('w1', 'i1'), null);
  assert.equal(vault.size(), 1);
  vault.clear();
  assert.equal(vault.size(), 0);
  assert.ok(!JSON.stringify(vault).includes('tok-'), 'serializing the vault shows no token');
});

test('FBE2E-1: live submission uses only widget intent/resolve and returns the authorized successor or receipt line', async () => {
  const successor = envelope('slots-superseded-successor');
  const submission = {
    contract: 'maya.widget.intent.submission/1',
    widget_id: 'w1',
    intent_token: 'opaque-token',
    inputs: { service_ref: 'opaque-option' },
    client_nonce: 'nonce-1',
    profile_id: 'owner-web',
  };
  const calls = [];
  const port = createLiveSubmission({
    widgetIntent: async (body) => (
      calls.push(['intent', body]),
      { ok: true, value: { outcome: 'terminate', code: null, next_envelope: successor, receipt_outcome: null } }
    ),
    resolveWidgets: async () => {
      throw new Error('successor must not query receipts');
    },
  });
  assert.deepEqual(await port.submit(submission, new AbortController().signal), {
    status: 'advanced',
    envelope: successor,
    accepted: false,
  });
  assert.deepEqual(calls, [['intent', submission]]);

  const receiptPort = createLiveSubmission({
    widgetIntent: async () => ({
      ok: true,
      value: { outcome: 'terminate', code: null, next_envelope: null, receipt_outcome: 'ACCEPTED' },
    }),
    resolveWidgets: async (body) => (
      calls.push(['resolve', body]),
      {
        ok: true,
        value: {
          tenant_bound: true,
          widgets: [{
            envelope: { ...successor, widget_id: 'w1' },
            terminal_lines: [{ outcome: 'CONFIRMED', text: 'Запись подтверждена', action_receipt_ref: 'ae-1' }],
            reread_intent: null,
          }],
        },
      }
    ),
  });
  assert.deepEqual(await receiptPort.submit(submission, new AbortController().signal), {
    status: 'settled',
    lines: [{ outcome: 'CONFIRMED', text: 'Запись подтверждена', action_receipt_ref: 'ae-1' }],
  });
  assert.deepEqual(calls.at(-1), ['resolve', { thread_page: { limit: 20 } }]);
});

test('FBE2E-1: a drawn selector can submit only one server-declared option/ref value', () => {
  const base = envelope('kind-choice').intents[0];
  assert.deepEqual(inputsForActivation(base, 'option:opaque-service'), {
    selection: 'opaque-service',
  });
  assert.equal(inputsForActivation(base, 'intent:i1'), undefined);
  assert.equal(inputsForActivation(base, 'option:'), undefined);
  assert.equal(inputsForActivation({ ...base, input_schema: null }, 'intent:i1'), null);
  // I-SRC-1: a no-input intent now sends `null` inputs from ANY drawn control, not only from an
  // `intent:` button. This assertion previously required `undefined` — i.e. a refusal — and that
  // refusal is the defect: a SCHEDULE entry retaining a cancellation proposal was rejected before
  // HTTP, so the canonical owner never saw it. With no schema there is no field to echo, so the
  // ref carries no data; its identity was already proved by the reading order and `intentRefFor`.
  assert.equal(inputsForActivation({ ...base, input_schema: null }, 'option:opaque'), null);
  assert.equal(inputsForActivation({ ...base, input_schema: null }, 'entry:opaque-appointment'), null);
  assert.equal(inputsForActivation({ ...base, input_schema: null }, 'row:r-1'), null);
  assert.equal(
    inputsForActivation(
      { ...base, input_schema: { ...base.input_schema, fields: [...base.input_schema.fields, base.input_schema.fields[0]] } },
      'option:opaque',
    ),
    undefined,
  );
});

test('FBE2E-1/3: successor replaces the selector and only a server terminal receipt enters conversation', async () => {
  const successor = envelope('slots-superseded-successor');
  const advanced = setup({ submission: { submit: async () => ({ status: 'advanced', envelope: successor, accepted: false }) } });
  const predecessor = advanced.runtime.widgets.ingest(
    reseal({ ...structuredClone(envelope('slots-superseded-predecessor')), lifecycle: { ...envelope('slots-superseded-predecessor').lifecycle, state: 'LIVE' } }),
  );
  assert.deepEqual(await advanced.runtime.widgets.activate(predecessor.itemId, 'intent:i2'), { outcome: 'dismissed' });
  assert.equal(advanced.item(predecessor.itemId).display, 'live');
  assert.equal(advanced.runtime.widgets.counters().stateChanges, 1);

  const settled = setup({
    submission: {
      submit: async () => ({
        status: 'settled',
        lines: [{ outcome: 'CONFIRMED', text: 'Запись подтверждена', action_receipt_ref: 'ae-1' }],
      }),
    },
  });
  const confirmation = settled.runtime.widgets.ingest(envelope('kind-booking-confirmation'));
  assert.deepEqual(await settled.runtime.widgets.activate(confirmation.itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(settled.item(confirmation.itemId).display, 'terminal');
  assert.ok(settled.items().some((item) => item.kind === 'assistant' && item.text === 'Запись подтверждена'));
});

// ── ingest ─────────────────────────────────────────────────────────────────────────────────────

test('ingest: H7 on the full envelope for all 40 fixtures; display follows the lifecycle and on_expiry quietly', () => {
  for (const f of INDEX.fixtures) {
    const s = setup();
    const env = envelope(f.id);
    const out = s.runtime.widgets.ingest(env);
    assert.equal(out.ingested, 'added', f.id);
    assert.equal(out.verdict, f.expect.verdict, f.id);
    const view = s.item(out.itemId);
    assert.equal(view.kind, 'widget');
    assert.equal(view.result.mode, f.expect.mode, f.id);
    const expected = displayOf(env, f.expect.verdict);
    assert.equal(view.display, expected.display, f.id);
    assert.equal(view.sentence, expected.sentence, f.id);
    assert.equal(s.counts.chat + s.counts.transcribe, 0);
  }
  const expired = envelope('booking-expired');
  assert.deepEqual(displayOf(expired, 'expired'), { display: 'collapsed', sentence: 'expired_not_resolved' }, 're_resolve: P1 collapses with a neutral sentence');
  assert.deepEqual(displayOf({ ...expired, lifecycle: { ...expired.lifecycle, on_expiry: 'mark_stale' } }, 'expired'), { display: 'stale', sentence: null });
  assert.deepEqual(displayOf({ ...expired, lifecycle: { ...expired.lifecycle, on_expiry: 'collapse_to_summary' } }, 'expired'), { display: 'collapsed', sentence: null });
  assert.deepEqual(displayOf(envelope('approval-consumed'), 'valid'), { display: 'terminal', sentence: null });
  assert.deepEqual(displayOf(envelope('booking-tampered-body'), 'body_mismatch'), { display: 'live', sentence: null }, 'frozen prose plus REFINE, never an error');
});

test('L7 replace in place: the successor takes the predecessor\'s position and item id; P-25: a repeated widget_id renders once', async () => {
  const s = setup();
  const first = s.runtime.widgets.ingest(envelope('kind-choice'));
  const predecessor = envelope('slots-superseded-predecessor');
  const successor = envelope('slots-superseded-successor');
  assert.equal(successor.lifecycle.supersedes_widget_id, predecessor.widget_id);
  // The predecessor as it was while live.
  const livePredecessor = reseal({ ...structuredClone(predecessor), lifecycle: { ...predecessor.lifecycle, state: 'LIVE' } });
  const p = s.runtime.widgets.ingest(livePredecessor);
  s.runtime.widgets.ingest(envelope('kind-metric'));
  s.runtime.conversation.timeline.appendNotice('deeplink_refused');
  const before = s.items().map((i) => i.id);
  const heldBefore = s.runtime.widgets.heldTokens();

  const r = s.runtime.widgets.ingest(successor);
  assert.deepEqual(r, { ingested: 'replaced', itemId: p.itemId, verdict: 'valid' });
  assert.deepEqual(s.items().map((i) => i.id), before, 'same ids, same order, nothing appended');
  assert.equal(s.items().indexOf(s.item(p.itemId)), 1);
  assert.equal(s.item(p.itemId).result.mode, 'structured');
  assert.equal(s.runtime.widgets.heldTokens(), heldBefore - livePredecessor.intents.filter((i) => i.intent_token).length + successor.intents.filter((i) => i.intent_token).length);

  // The successor's tokens are the ones submitted now.
  await s.runtime.widgets.activate(p.itemId, 'intent:i2');
  const sent = s.submissions.at(-1).submission;
  assert.equal(sent.widget_id, successor.widget_id);
  assert.equal(sent.intent_token, successor.intents.find((i) => i.intent_ref === 'i2').intent_token);

  assert.deepEqual(s.runtime.widgets.ingest(successor), { ingested: 'duplicate' });
  assert.deepEqual(s.runtime.widgets.ingest(predecessor), { ingested: 'duplicate' }, 'a replaced emission arriving late renders nothing');
  assert.deepEqual(s.runtime.widgets.ingest(envelope('kind-choice')), { ingested: 'duplicate' });
  assert.equal(s.items().filter((i) => i.kind === 'widget').length, 3);
  assert.equal(first.ingested, 'added');
});

test('a late outcome for a replaced emission draws nothing on its successor', async () => {
  let release;
  const s = setup({ submission: { submit: () => new Promise((r) => (release = r)) } });
  const predecessor = envelope('slots-superseded-predecessor');
  const p = s.runtime.widgets.ingest(reseal({ ...structuredClone(predecessor), lifecycle: { ...predecessor.lifecycle, state: 'LIVE' } }));
  const running = s.runtime.widgets.activate(p.itemId, 'intent:i2');
  await flush();
  assert.equal(s.item(p.itemId).display, 'pending');
  s.runtime.widgets.ingest(envelope('slots-superseded-successor'));
  release({ status: 'unavailable' });
  assert.deepEqual(await running, { outcome: 'ignored', reason: 'unknown_item' });
  assert.equal(s.item(p.itemId).sentence, null);
  assert.equal(s.item(p.itemId).display, 'live');
  const c = s.runtime.widgets.counters();
  assert.equal(c.activations - (c.stateChanges + c.sentences), 0, 'the replacement is the visible outcome');
});

// ── activation ─────────────────────────────────────────────────────────────────────────────────

test('F60: a NONE escape dismisses locally — 0 transport calls, 0 submissions — and nothing else stays activatable', async () => {
  const withEscape = LIVE_FIXTURES.filter((f) => envelope(f.id).intents.some((i) => i.effect === 'NONE'));
  assert.ok(withEscape.length >= 6, `${withEscape.length} fixtures carry a NONE escape`);
  for (const f of withEscape) {
    const s = setup();
    const env = envelope(f.id);
    const { itemId } = s.runtime.widgets.ingest(env);
    const escape = env.intents.find((i) => i.effect === 'NONE');
    assert.equal(escape.intent_token, null, `${f.id}: NONE carries no token`);
    const drawn = [...s.item(itemId).result.readingOrder];
    assert.ok(drawn.includes(`intent:${escape.intent_ref}`), `${f.id}: the escape is drawn`);
    assert.deepEqual(await s.runtime.widgets.activate(itemId, `intent:${escape.intent_ref}`), { outcome: 'dismissed' });
    assert.equal(s.counts.chat + s.counts.transcribe, 0, f.id);
    assert.equal(s.submissions.length, 0, f.id);
    assert.equal(s.item(itemId).display, 'collapsed');
    assert.equal(s.runtime.widgets.heldTokens(), 0, `${f.id}: a dismissed item holds no tokens`);
    for (const ref of drawn) assert.deepEqual(await s.runtime.widgets.activate(itemId, ref), { outcome: 'ignored', reason: 'not_drawn' });
    assert.equal(s.submissions.length, 0);
  }
});

test('D9: every drawn control of every live fixture ends in a state change or a sentence — silent outcomes 0, requests 0', async (t) => {
  let activations = 0;
  let submitted = 0;
  let dismissed = 0;
  for (const f of INDEX.fixtures) {
    const probe = setup();
    const { itemId } = probe.runtime.widgets.ingest(envelope(f.id));
    const refs = probe.item(itemId).display === 'collapsed' ? [] : [...probe.item(itemId).result.readingOrder];
    for (const ref of refs) {
      const s = setup();
      const id = s.runtime.widgets.ingest(envelope(f.id)).itemId;
      const before = s.item(id).display;
      const out = await s.runtime.widgets.activate(id, ref);
      activations += 1;
      assert.ok(out.outcome === 'dismissed' || out.outcome === 'sentence', `${f.id} ${ref}: ${JSON.stringify(out)}`);
      if (out.outcome === 'dismissed') dismissed += 1;
      const c = s.runtime.widgets.counters();
      assert.equal(c.activations, 1);
      assert.equal(c.activations - (c.stateChanges + c.sentences), 0, `${f.id} ${ref}: silent`);
      assert.equal(s.counts.chat + s.counts.transcribe, 0, `${f.id} ${ref}: a transport call`);
      assert.equal(s.submissions.length, c.submissions);
      if (out.outcome === 'sentence') {
        assert.equal(s.item(id).sentence, out.sentence);
        assert.equal(s.item(id).pending, null, 'the control is usable again');
        assert.equal(s.item(id).display, before);
        if (out.submitted) {
          submitted += 1;
          assert.equal(out.sentence, 'activation_unavailable', 'the P1 binding');
          // Usable again: a second activation submits again.
          await s.runtime.widgets.activate(id, ref);
          assert.equal(s.submissions.length, 2);
        }
      }
      assert.equal(s.runtime.shell.view().fullscreen, null, 'no detail stays open in P1');
    }
  }
  t.diagnostic(`activations ${activations}: submitted ${submitted}, dismissed ${dismissed}, sentence without a submission ${activations - submitted - dismissed}`);
  assert.ok(activations >= 100, `${activations} activations`);
  assert.ok(submitted >= 50, `${submitted} submissions`);
});

test('the submission is the contract WidgetIntentSubmission: exact members, the vault token, nothing else', async () => {
  const s = setup();
  const env = envelope('kind-booking-confirmation');
  const { itemId } = s.runtime.widgets.ingest(env);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.equal(s.submissions.length, 1);
  const sub = s.submissions[0].submission;
  assert.deepEqual(Object.keys(sub).sort(), ['client_nonce', 'contract', 'inputs', 'intent_token', 'profile_id', 'widget_id']);
  assert.deepEqual(sub, {
    contract: 'maya.widget.intent.submission/1',
    widget_id: env.widget_id,
    intent_token: env.intents.find((i) => i.intent_ref === 'i1').intent_token,
    inputs: null,
    client_nonce: 'nonce-000001',
    profile_id: env.render.profile_id,
  });
  assert.ok(s.submissions[0].signal instanceof AbortSignal);
  const raw = JSON.stringify(sub);
  for (const banned of ['readback', 'spoken', 'audience', 'tenant', 'role', 'surface', 'url', 'endpoint', 'capability', 'body']) assert.ok(!raw.includes(banned), banned);

  // Source: the literal is annotated with the contract type, imported through src/contract.ts.
  const src = fs.readFileSync(path.join(SH, 'src/shell/intents.ts'), 'utf8');
  assert.match(src, /import type \{[^}]*\bWidgetIntentSubmission\b[^}]*\} from '\.\.\/contract\.ts';/);
  assert.match(src, /const submission: WidgetIntentSubmission = \{/);
  assert.match(fs.readFileSync(path.join(SH, 'src/contract.ts'), 'utf8'), /\bWidgetIntentSubmission,[\s\S]*\} from '#contract';/);
});

test('the submission literal is checked against the closed contract type: an extra member does not compile', () => {
  const ts = loadTypeScript();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-s4-typeprobe-'));
  try {
    const contract = emitContract(ts, tmp);
    const config = ts.readConfigFile(path.join(SH, 'tsconfig.json'), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, SH);
    const options = { ...parsed.options, noEmit: true, types: [], paths: { '#contract': [contract.index] } };
    const target = path.join(SH, 'src/shell/intents.ts');
    const original = fs.readFileSync(target, 'utf8');
    const diagnosticsWith = (text) => {
      const host = ts.createCompilerHost(options);
      const readFile = host.readFile.bind(host);
      host.readFile = (f) => (path.resolve(f) === target ? text : readFile(f));
      const getSourceFile = host.getSourceFile.bind(host);
      host.getSourceFile = (f, lang, onError, create) =>
        path.resolve(f) === target ? ts.createSourceFile(f, text, lang, true) : getSourceFile(f, lang, onError, create);
      const program = ts.createProgram({ rootNames: parsed.fileNames, options, host });
      return ts.getPreEmitDiagnostics(program).filter((d) => d.file && path.resolve(d.file.fileName) === target);
    };
    assert.deepEqual(diagnosticsWith(original).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
    const extra = original.replace("      inputs,\n", "      inputs,\n      audience_hint: 'owner',\n");
    assert.notEqual(extra, original);
    const errors = diagnosticsWith(extra).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.ok(errors.some((m) => /audience_hint/.test(m) && /WidgetIntentSubmission/.test(m)), errors.join('\n'));
    const missing = original.replace("      client_nonce: deps.newNonce(),\n", '');
    assert.ok(diagnosticsWith(missing).some((d) => /client_nonce/.test(ts.flattenDiagnosticMessageText(d.messageText, '\n'))));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('outcomes: each SubmissionOutcome and a rejection end in a neutral sentence; one activation in flight per item', async () => {
  const cases = [
    [{ status: 'unavailable' }, 'activation_unavailable'],
    [{ status: 'forbidden' }, 'activation_forbidden'],
    [{ status: 'no_connection' }, 'no_connection'],
    [{ status: 'server_error' }, 'activation_unavailable'],
    [{ status: 'unexpected_response' }, 'activation_unavailable'],
    ['reject', 'activation_unavailable'],
  ];
  for (const [answer, sentence] of cases) {
    let release;
    const s = setup({ submission: { submit: () => new Promise((resolve, reject) => (release = () => (answer === 'reject' ? reject(new Error('x')) : resolve(answer)))) } });
    const { itemId } = s.runtime.widgets.ingest(envelope('kind-client-list'));
    const running = s.runtime.widgets.activate(itemId, 'intent:i1');
    await flush();
    assert.equal(s.item(itemId).display, 'pending');
    assert.equal(s.item(itemId).pending, 'intent:i1');
    assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i2'), { outcome: 'ignored', reason: 'in_flight' });
    release();
    assert.deepEqual(await running, { outcome: 'sentence', sentence, submitted: true });
    assert.equal(s.item(itemId).sentence, sentence);
    assert.equal(s.item(itemId).display, 'live');
    const c = s.runtime.widgets.counters();
    assert.deepEqual([c.activations, c.sentences, c.stateChanges], [1, 1, 0]);
  }
  // A disabled intent is drawn and explained; activating it sends nothing.
  const s = setup();
  const env = envelope('kind-client-list');
  env.intents[0].enabled = { state: 'UNAVAILABLE', value: null, label: 'Нельзя отправить: нет согласия', reason_code: 'PERMISSION', fact_ref: null, as_of: null, evidence_refs: [], next_intent_ref: null };
  const { itemId } = s.runtime.widgets.ingest(reseal(env));
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'sentence', sentence: 'activation_unavailable', submitted: false });
  assert.equal(s.submissions.length, 0);
  assert.deepEqual(await s.runtime.widgets.activate('w999', 'intent:i1'), { outcome: 'ignored', reason: 'unknown_item' });
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i7'), { outcome: 'ignored', reason: 'not_drawn' });
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'fs.client-card'), { outcome: 'ignored', reason: 'not_drawn' }, 'a bare key opens nothing');
});

// ── NAVIGATE(detail), R3.3.4, R7-E3 ────────────────────────────────────────────────────────────

test('NAVIGATE(detail): PROGRESS while the submission runs; the P1 binding closes it, returns to the opener and leaves a sentence', async () => {
  let release;
  const s = setup({ submission: { submit: (sub) => (s.submissions.push({ submission: sub }), new Promise((r) => (release = r))) } });
  const { itemId } = s.runtime.widgets.ingest(envelope('kind-schedule'));
  const running = s.runtime.widgets.activate(itemId, 'intent:i1');
  await flush();
  assert.deepEqual(s.runtime.shell.view().fullscreen, { phase: 'progress', itemId });
  assert.deepEqual(s.runtime.shell.state().opener, { itemId, ref: 'intent:i1' });
  assert.equal(s.history.pushes, 1);
  release({ status: 'unavailable' });
  assert.deepEqual(await running, { outcome: 'sentence', sentence: 'activation_unavailable', submitted: true });
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.runtime.shell.state().opener, null);
  assert.equal(s.history.backs, 1, 'the history entry is popped: the URL never changed');
  assert.equal(s.item(itemId).sentence, 'activation_unavailable');
  assert.equal(s.submissions.length, 1);
  assert.equal(s.counts.chat, 0);
});

test('R3.3.4 / R7-E3: a detail opens only for the envelope\'s own fullscreen_detail key, only for the nine fs.* keys, never from inside a detail', async () => {
  // kind-metric: a detail target with no fullscreen_detail at all.
  const m = setup();
  const metric = m.runtime.widgets.ingest(envelope('kind-metric'));
  assert.deepEqual(await m.runtime.widgets.activate(metric.itemId, 'intent:i2'), { outcome: 'sentence', sentence: 'route_refused', submitted: false });
  assert.equal(m.submissions.length, 0);
  assert.equal(m.history.pushes, 0);
  assert.equal(m.runtime.shell.view().fullscreen, null);

  const variant = (key, own) => {
    const env = envelope('kind-schedule');
    env.intents[0].target = { class: 'detail', ref: key };
    env.presentation.fullscreen_detail = own === null ? null : { ...env.presentation.fullscreen_detail, route_key: own };
    return reseal(env);
  };
  const outcome = async (env) => {
    const s = setup();
    const { itemId, verdict } = s.runtime.widgets.ingest(env);
    assert.equal(verdict, 'valid');
    const out = await s.runtime.widgets.activate(itemId, 'intent:i1');
    return { out, submissions: s.submissions.length, pushes: s.history.pushes };
  };
  for (const key of NINE) {
    const r = await outcome(variant(key, key));
    assert.deepEqual(r, { out: { outcome: 'sentence', sentence: 'activation_unavailable', submitted: true }, submissions: 1, pushes: 1 }, key);
  }
  for (const [key, own] of [['fs.unknown', 'fs.unknown'], ['fs.booking', 'fs.calendar'], ['shell.privacy', 'shell.privacy'], ['detail', 'detail'], ['fs.booking', null], ['FS.BOOKING', 'FS.BOOKING']]) {
    const r = await outcome(variant(key, own));
    assert.deepEqual(r, { out: { outcome: 'sentence', sentence: 'route_refused', submitted: false }, submissions: 0, pushes: 0 }, `${key} / ${own}`);
  }

  // Inside a detail, a detail target is refused; the detail closes and the opener carries the sentence.
  const s = setup();
  const opener = s.runtime.widgets.ingest(envelope('kind-schedule'));
  const presented = s.runtime.shell.presentDetail(envelope('kind-report'), { itemId: opener.itemId, ref: 'intent:i1' });
  assert.equal(presented.presented, true);
  assert.equal(s.runtime.shell.view().fullscreen.phase, 'open');
  assert.equal(s.runtime.shell.view().fullscreen.result.density, 'SHEET');
  const out = await s.runtime.widgets.activate(presented.itemId, 'intent:i1');
  assert.deepEqual(out, { outcome: 'sentence', sentence: 'route_refused', submitted: false });
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.item(opener.itemId).sentence, 'route_refused');
  assert.equal(s.submissions.length, 0);
});

test('shell targets: a class-s route resolves through the registry before anything is sent; the route switch waits for an outcome', async () => {
  const s = setup();
  const pay = s.runtime.widgets.ingest(envelope('kind-payment-handoff'));
  assert.deepEqual(await s.runtime.widgets.activate(pay.itemId, 'intent:i2'), { outcome: 'sentence', sentence: 'activation_unavailable', submitted: true });
  assert.equal(s.runtime.shell.view().primary, 'shell.root', 'P1: no route switch without a receipt');
  const connections = s.runtime.widgets.ingest(envelope('kind-source-status'));
  assert.equal((await s.runtime.widgets.activate(connections.itemId, 'intent:i1')).submitted, true);
  assert.equal(s.runtime.shell.view().primary, 'shell.root');

  const refused = async (mutate) => {
    const t = setup();
    const env = envelope('kind-payment-handoff');
    mutate(env.intents[1]);
    const { itemId, verdict } = t.runtime.widgets.ingest(reseal(env));
    assert.equal(verdict, 'valid');
    const out = await t.runtime.widgets.activate(itemId, 'intent:i2');
    assert.equal(t.submissions.length, 0);
    return out;
  };
  const refusal = { outcome: 'sentence', sentence: 'route_refused', submitted: false };
  assert.deepEqual(await refused((i) => (i.target = { class: 's', ref: { route: 'shell.pay', param: 'bad/handle' } })), refusal);
  assert.deepEqual(await refused((i) => (i.target = { class: 's', ref: { route: 'shell.privacy', param: 'abcdefgh' } })), refusal);
  assert.deepEqual(await refused((i) => (i.target = { class: 's', ref: 'shell.pay' })), refusal);
  assert.deepEqual(await refused((i) => (i.target = { class: 's', ref: { route: 'fs.payment', param: null } })), refusal);
  assert.deepEqual(await refused((i) => ((i.effect = 'HANDOFF'), (i.target = { class: 'w', ref: '01M2Q9G7AAAAAAAAAAAAAAAAAA' }))), refusal);
  assert.deepEqual(await refused((i) => (i.target = null)), refusal);
});

// ── expiry, environment, release ───────────────────────────────────────────────────────────────

test('expiry on screen follows on_expiry quietly; a collapsed item gives up its tokens', () => {
  for (const [onExpiry, display, sentence] of [['collapse_to_summary', 'collapsed', null], ['mark_stale', 'stale', null], ['re_resolve', 'collapsed', 'expired_not_resolved']]) {
    const s = setup();
    const env = envelope('kind-client-list');
    env.lifecycle.expires_at = new Date(NOW + 60_000).toISOString();
    env.lifecycle.on_expiry = onExpiry;
    const { itemId, verdict } = s.runtime.widgets.ingest(reseal(env));
    assert.equal(verdict, 'valid');
    assert.equal(s.item(itemId).display, 'live');
    const held = s.runtime.widgets.heldTokens();
    s.advance(59_000);
    assert.equal(s.item(itemId).display, 'live');
    s.advance(1_000);
    assert.equal(s.item(itemId).display, display, onExpiry);
    assert.equal(s.item(itemId).sentence, sentence);
    assert.equal(s.item(itemId).result.mode, 'frozen_prose');
    assert.equal(s.runtime.widgets.heldTokens(), display === 'collapsed' ? 0 : held);
    assert.equal(s.runtime.widgets.counters().stateChanges, 1);
    assert.equal(s.counts.chat, 0);
  }
});

test('an environment change redraws every item; sign-out releases every item and token', async () => {
  const s = setup();
  const a = s.runtime.widgets.ingest(envelope('kind-choice'));
  const opener = s.runtime.widgets.ingest(envelope('kind-report'));
  s.runtime.shell.presentDetail(envelope('kind-media-preview'), { itemId: opener.itemId, ref: 'intent:i1' });
  assert.equal(s.item(a.itemId).result.motion, 'standard');
  s.setA11y({ ...A11Y, reduced_motion: true });
  assert.equal(s.item(a.itemId).result.motion, 'none');
  assert.equal(s.runtime.shell.view().fullscreen.result.motion, 'none');

  assert.ok(s.runtime.widgets.heldTokens() > 0);
  assert.ok(s.runtime.widgets.lockSources().length >= 2, 'V6 reads the vault-side envelopes');
  assert.ok(s.runtime.widgets.lockSources().every((e) => typeof e.widget_id === 'string'));
  s.signOut();
  assert.equal(s.runtime.widgets.heldTokens(), 0);
  assert.deepEqual(s.runtime.widgets.lockSources(), []);
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.deepEqual(await s.runtime.widgets.activate(a.itemId, 'intent:i1'), { outcome: 'ignored', reason: 'unknown_item' });
  // The next session starts from an empty timeline: an emission it receives is drawn, not a duplicate.
  assert.equal(s.runtime.widgets.ingest(envelope('kind-choice')).ingested, 'added');
});

test('the display cap releases a dropped item\'s tokens but keeps P-25: the same emission redelivered still renders once', () => {
  const s = setup();
  const first = s.runtime.widgets.ingest(envelope('kind-choice'));
  assert.ok(s.runtime.widgets.heldTokens() > 0);
  for (let i = 0; i < 205; i += 1) s.runtime.conversation.timeline.appendNotice('deeplink_refused');
  assert.equal(s.item(first.itemId), undefined, 'dropped from the display');
  assert.equal(s.runtime.widgets.heldTokens(), 0, 'its tokens went with it');
  assert.deepEqual(s.runtime.widgets.ingest(envelope('kind-choice')), { ingested: 'duplicate' });
  assert.equal(s.runtime.conversation.view().dropped, 6);
});

test('intentRefFor: an action names its intent; a choice names the intent it selects; anything else names none', () => {
  const s = setup();
  const { itemId } = s.runtime.widgets.ingest(envelope('kind-choice'));
  const result = s.item(itemId).result;
  assert.equal(intentRefFor(result.nodes, 'intent:i2'), 'i2');
  const option = intentRefFor(result.nodes, 'option:o-cut');
  assert.ok(option !== null && envelope('kind-choice').intents.some((i) => i.intent_ref === option));
  assert.equal(intentRefFor(result.nodes, 'intent:nope'), null);
});

// ── I-SRC-1: cancel from the canonical SCHEDULE entry ─────────────────────────────────────────
//
// BS-1 emits one personal appointment whose ENTRY retains the exact cancellation proposal, while
// the body-level action is the reschedule. Activating the entry must therefore reach the
// submission boundary; the runtime refused it before HTTP, so the canonical owner never saw it.

/** A SCHEDULE whose entry selects a no-input intent, as the personal-schedule presenter emits. */
const personalSchedule = () => {
  const env = envelope('kind-schedule');
  // One lane, one entry; the entry retains the cancel proposal, the body action is the other one.
  env.body.lanes = [env.body.lanes[0]];
  env.body.entries = [{ ...env.body.entries[0], lane_id: env.body.lanes[0].lane_id, detail_intent: 'i2' }];
  env.body.detail_intent = 'i1';
  // i2 is the retained cancellation proposal: a no-input REFINE.
  const i2 = env.intents.find((i) => i.intent_ref === 'i2');
  i2.input_schema = null;
  i2.effect = 'REFINE';
  env.presentation.a11y.reading_order = [
    { k: 'entry', id: env.body.entries[0].entry_ref },
    { k: 'intent', id: 'i1' },
    { k: 'intent', id: 'i2' },
    { k: 'intent', id: 'i3' },
  ];
  return reseal(env);
};

test('I-SRC-1 — activating the SCHEDULE entry reaches the submission boundary', async () => {
  const s = setup();
  const env = personalSchedule();
  const { itemId } = s.runtime.widgets.ingest(env);
  const ref = `entry:${env.body.entries[0].entry_ref}`;
  // The entry really is drawn, and the server's own mapping points it at the retained proposal.
  assert.ok(s.item(itemId).result.readingOrder.includes(ref), 'the entry is drawn');

  await s.runtime.widgets.activate(itemId, ref);

  assert.equal(s.submissions.length, 1, 'the activation reached the submission port');
  const sent = s.submissions[0].submission;
  assert.equal(sent.widget_id, env.widget_id);
  assert.equal(sent.inputs, null, 'a no-input intent echoes nothing from the ref');
  assert.equal(typeof sent.intent_token, 'string');
  assert.ok(sent.intent_token.length > 0, 'the token came from the vault, not from the ref');
  // The ref's own text must not appear anywhere in what was sent.
  assert.ok(!JSON.stringify(sent.inputs ?? {}).includes(env.body.entries[0].entry_ref));
});

test('I-SRC-1 — a ref the server did not map to an intent is REFUSED, and never sent', async () => {
  const s = setup();
  const env = personalSchedule();
  // The same entry, but the server maps it to nothing: reachable, never activatable.
  env.body.entries[0].detail_intent = null;
  const { itemId } = s.runtime.widgets.ingest(reseal(env));
  const ref = `entry:${env.body.entries[0].entry_ref}`;

  const outcome = await s.runtime.widgets.activate(itemId, ref);

  assert.equal(outcome.outcome, 'sentence');
  assert.equal(outcome.sentence, 'activation_unavailable');
  assert.equal(s.submissions.length, 0, 'nothing reached the submission port');
});

test('I-SRC-1 — a ref outside the sealed reading order is REFUSED before anything else', async () => {
  const s = setup();
  const env = personalSchedule();
  const { itemId } = s.runtime.widgets.ingest(env);

  // A forged entry handle, and a real handle from no envelope at all.
  for (const ref of ['entry:forged-appointment-handle', `entry:${env.body.entries[0].entry_ref}x`]) {
    const outcome = await s.runtime.widgets.activate(itemId, ref);
    assert.equal(outcome.outcome, 'ignored', ref);
    assert.equal(outcome.reason, 'not_drawn', ref);
  }
  assert.equal(s.submissions.length, 0, 'nothing reached the submission port');
});

test('I-SRC-1 — the fix did not make a schema-bearing intent accept an entry ref', async () => {
  const s = setup();
  const env = personalSchedule();
  // The retained proposal now declares a closed input schema; an `entry:` ref may not fill it,
  // because only `option:`/`slot:` refs may echo a value.
  const i2 = env.intents.find((i) => i.intent_ref === 'i2');
  i2.input_schema = {
    fields: [{ name: 'choice', kind: 'enum', required: true, selection_min: 1, selection_max: 1, options: [] }],
  };
  const { itemId } = s.runtime.widgets.ingest(reseal(env));

  const outcome = await s.runtime.widgets.activate(itemId, `entry:${env.body.entries[0].entry_ref}`);

  assert.equal(outcome.outcome, 'sentence');
  assert.equal(s.submissions.length, 0, 'a value-bearing schema still refuses an entry ref');
});

// I-SRC-1: accepted NAVIGATE detail is a fullscreen result, never a timeline successor.
const detailPair = () => {
  const source = envelope('kind-schedule');
  const detail = structuredClone(source);
  detail.widget_id = '01M2Q9G7M0AAAAAAAAAAAAAAAA';
  detail.correlation.parent_widget_id = source.widget_id;
  return { source, detail: reseal(detail) };
};

test('I-SRC-1 NAVIGATE: live fs.calendar response resolves PROGRESS to fullscreen, without a timeline insertion or history bounce', async () => {
  const { source, detail } = detailPair();
  let reply;
  let calls = 0;
  const s = setup({ submission: createLiveSubmission({
    widgetIntent: async () => { calls += 1; return new Promise((resolve) => { reply = resolve; }); },
    resolveWidgets: async () => { throw new Error('detail must not query terminal receipts'); },
  }) });
  const { itemId } = s.runtime.widgets.ingest(source);
  const before = s.items().map((item) => item.id);
  const heldBefore = s.runtime.widgets.heldTokens();
  const phases = [];
  s.runtime.shell.subscribe((v) => phases.push(v.fullscreen?.phase ?? null));
  const running = s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.equal(s.runtime.shell.view().fullscreen.phase, 'progress');
  reply({ ok: true, value: { outcome: 'terminate', code: null, next_envelope: detail, receipt_outcome: 'ACCEPTED' } });
  assert.deepEqual(await running, { outcome: 'dismissed' });
  assert.equal(calls, 1);
  const open = s.runtime.shell.view().fullscreen;
  assert.equal(open.phase, 'open');
  assert.equal(open.result.density, 'SHEET');
  assert.deepEqual(s.items().map((item) => item.id), before, 'detail adds zero timeline items');
  assert.equal(s.item(itemId).display, 'live', 'the opener stops being pending');
  assert.equal(s.item(itemId).pending, null);
  assert.deepEqual(phases, ['progress', 'open'], 'PROGRESS resolves, never closes/reopens history');
  assert.deepEqual(s.runtime.shell.state().opener, { itemId, ref: 'intent:i1' }, 'same focus return owner');
  assert.equal(s.history.pushes, 1);
  assert.equal(s.history.backs, 0);
  s.runtime.widgetPort.closeDetail();
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.runtime.widgets.heldTokens(), heldBefore, 'only detail tokens are released');
  assert.deepEqual(phases, ['progress', 'open', null]);
  assert.equal(s.history.backs, 1);
  s.runtime.widgetPort.closeDetail();
  assert.equal(s.history.backs, 1, 'close remains idempotent');
  s.runtime.dispose();
});

for (const [name, mutate] of [
  ['undeclared route', (s) => { s.presentation.fullscreen_detail = null; }],
  ['forged route', (s) => { s.intents[0].target.ref = 'fs.booking'; }],
  ['unknown route', (s) => { s.intents[0].target.ref = 'fs.unknown'; s.presentation.fullscreen_detail.route_key = 'fs.unknown'; }],
]) test(`I-SRC-1 NAVIGATE: ${name} is route_refused before transport`, async () => {
  const { source, detail } = detailPair();
  mutate(source);
  let calls = 0;
  const s = setup({ submission: { submit: async () => { calls += 1; return { status: 'advanced', envelope: detail, accepted: true }; } } });
  const { itemId } = s.runtime.widgets.ingest(reseal(source));
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'sentence', sentence: 'route_refused', submitted: false });
  assert.equal(calls, 0);
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.items().length, 1);
  s.runtime.dispose();
});

for (const [name, mutate, seal = true] of [
  ['substituted parent', (d) => { d.correlation.parent_widget_id = 'unrelated-widget'; }],
  ['missing parent', (d) => { d.correlation.parent_widget_id = null; }],
  ['same widget', (d, s) => { d.widget_id = s.widget_id; }],
  ['wrong tenant', (d) => { d.tenant_id = 'other-tenant'; }],
  ['wrong principal', (d) => { d.integrity.principal_proof_hash = 'a'.repeat(64); }],
  ['wrong turn', (d) => { d.correlation.turn_id = 'other-turn'; }],
  ['wrong profile', (d) => { d.render.profile_id = 'other-profile'; }],
  ['wrong profile version', (d) => { d.render.profile_version += 1; }],
  ['substituted route', (d) => { d.presentation.fullscreen_detail.route_key = 'fs.booking'; }],
  ['missing returned route', (d) => { d.presentation.fullscreen_detail = null; }],
  ['tampered detail', (d) => { d.presentation.text_equivalent.headline = 'Substituted body'; }, false],
  ['expired detail', (d) => { d.lifecycle.expires_at = INDEX.now; }],
  ['terminal detail', (d) => { d.lifecycle.state = 'CONSUMED'; }],
]) test(`I-SRC-1 NAVIGATE: ${name} is refused without fullscreen or timeline pollution`, async () => {
  const { source, detail } = detailPair();
  mutate(detail, source);
  if (seal) reseal(detail);
  const s = setup({ submission: { submit: async () => ({ status: 'advanced', envelope: detail, accepted: true }) } });
  const { itemId } = s.runtime.widgets.ingest(source);
  const heldBefore = s.runtime.widgets.heldTokens();
  const phases = [];
  s.runtime.shell.subscribe((v) => phases.push(v.fullscreen?.phase ?? null));
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'sentence', sentence: 'route_refused', submitted: true });
  assert.deepEqual(phases, ['progress', null]);
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.items().length, 1);
  assert.equal(s.runtime.widgets.heldTokens(), heldBefore, 'refused response never enters the vault');
  assert.equal(s.item(itemId).pending, null);
  s.runtime.dispose();
});

for (const code of ['widget_principal_mismatch', 'tenant_mismatch']) {
  test(`I-SRC-1 NAVIGATE: canonical server ${code} refusal never opens a detail`, async () => {
    const { source } = detailPair();
    const s = setup({ submission: createLiveSubmission({
      widgetIntent: async () => ({ ok: true, value: { outcome: 'terminate', code, next_envelope: null, receipt_outcome: 'REFUSED' } }),
      resolveWidgets: async () => { throw new Error('refusal must not resolve a body'); },
    }) });
    const { itemId } = s.runtime.widgets.ingest(source);
    assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'sentence', sentence: 'activation_forbidden', submitted: true });
    assert.equal(s.runtime.shell.view().fullscreen, null);
    assert.equal(s.items().length, 1);
    s.runtime.dispose();
  });
}

for (const action of ['close', 'back', 'navigate', 'sign-out', 'another-detail']) {
  test(`I-SRC-1 NAVIGATE: ${action} while pending prevents a late response from taking chrome ownership`, async () => {
    const { source, detail } = detailPair();
    let reply;
    const s = setup({ submission: { submit: () => new Promise((r) => { reply = r; }) } });
    const { itemId } = s.runtime.widgets.ingest(source);
    const running = s.runtime.widgets.activate(itemId, 'intent:i1');
    if (action === 'close') s.runtime.widgetPort.closeDetail();
    if (action === 'back') s.history.onBack();
    if (action === 'navigate') s.runtime.shell.navigate('shell.privacy');
    if (action === 'sign-out') s.signOut();
    if (action === 'another-detail') {
      const other = envelope('kind-report');
      const otherItem = s.runtime.widgets.ingest(other);
      s.runtime.shell.openProgress({ itemId: otherItem.itemId, ref: 'intent:i1' });
    }
    const before = s.runtime.shell.view().fullscreen;
    const beforeIds = s.items().map((item) => item.id);
    reply({ status: 'advanced', envelope: detail, accepted: true });
    await running;
    assert.deepEqual(s.runtime.shell.view().fullscreen, before, 'late response cannot reopen or replace the current chrome');
    assert.deepEqual(s.items().map((item) => item.id), beforeIds, 'no fallback to timeline');
    s.runtime.dispose();
  });
}

test('I-SRC-1 NAVIGATE: ordinary non-detail advanced response keeps timeline semantics even with fs.calendar in its payload', async () => {
  const { source, detail } = detailPair();
  source.intents[0].effect = 'REFINE';
  source.intents[0].target = null;
  reseal(source);
  const s = setup({ submission: { submit: async () => ({ status: 'advanced', envelope: detail, accepted: true }) } });
  const { itemId } = s.runtime.widgets.ingest(source);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.items().length, 2, 'ordinary successor still appends');
  assert.equal(s.history.pushes, 0, 'payload kind/route alone never opens fullscreen');
  s.runtime.dispose();
});

for (const [name, outcome, code, receipt_outcome] of [
  ['refused principal even with an attached envelope', 'refuse', 'widget_principal_mismatch', 'REFUSED'],
  ['refused tenant even with an attached envelope', 'terminate', 'tenant_mismatch', 'REFUSED'],
  ['missing acceptance', 'terminate', null, null],
  ['verification required', 'terminate', null, 'NEEDS_VERIFICATION'],
  ['expired successor', 'expired', null, 'ACCEPTED'],
]) test(`I-SRC-1 NAVIGATE: ${name} cannot open fullscreen`, async () => {
  const { source, detail } = detailPair();
  const s = setup({ submission: createLiveSubmission({
    widgetIntent: async () => ({ ok: true, value: { outcome, code, next_envelope: detail, receipt_outcome } }),
    resolveWidgets: async () => { throw new Error('successor must not query receipts'); },
  }) });
  const { itemId } = s.runtime.widgets.ingest(source);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'sentence', sentence: 'route_refused', submitted: true });
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.items().length, 1);
  s.runtime.dispose();
});

// ── NS-1: detail → canonical parent return ─────────────────────────────────────────────────────
//
// A journal detail draws a return control. Its intent is a NAVIGATE to a server-re-resolved widget
// (class 'w'), so the client names no route and no parent: the server answers ACCEPTED and attaches
// the canonical parent as `resolved_widget`. That envelope — and nothing else — becomes the timeline
// item again, in place, and the detail closes through the controller that opened it.
//
// Nothing here may be reconstructed from the text already on screen, from the item the caller sent,
// from the current date, or from anything cached. Every case below that is not the server's own
// parent, bound to this detail, is refused with no restoration at all.

const RETURNED_HEADLINE = 'Журнал · родитель от сервера';

/** source → the detail it opens → the parent the server re-resolves for the detail's return. */
const returnTrio = ({ detail: mutateDetail, parent: mutateParent, sealParent = true } = {}) => {
  const { source, detail } = detailPair();
  // The return control: re-resolved server-side, so `targetRefusal` sends it and decides nothing.
  detail.intents[0].target = { class: 'w', ref: 'w.journal.parent' };
  mutateDetail?.(detail, source);
  reseal(detail);
  const parent = structuredClone(source);
  parent.presentation.text_equivalent.headline = RETURNED_HEADLINE;
  mutateParent?.(parent, source, detail);
  if (sealParent) reseal(parent);
  return { source, detail, parent };
};

/** One live submission for both legs: the detail opens, then the detail's own widget returns. */
const returnSubmission = (detail, reply) => {
  const sent = [];
  const port = createLiveSubmission({
    widgetIntent: async (submission) => {
      sent.push(submission);
      return { ok: true, value: submission.widget_id === detail.widget_id
        ? { outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED', ...reply }
        : { outcome: 'terminate', code: null, next_envelope: detail, resolved_widget: null, receipt_outcome: 'ACCEPTED' } };
    },
    resolveWidgets: async () => { throw new Error('a parent return must not query terminal receipts'); },
  });
  return { port, sent };
};

/** Drive the first leg: ingest the source, open its detail, and hand back both ids. */
const openDetailFrom = async (s, source) => {
  const { itemId } = s.runtime.widgets.ingest(source);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' });
  const open = s.runtime.shell.view().fullscreen;
  assert.equal(open?.phase, 'open', 'the detail is on screen before the return');
  return { itemId, detailItemId: open.itemId };
};

test('NS-1: parent → detail → parent, where the parent on the timeline is the server-returned `resolved_widget`', async () => {
  const { source, detail, parent } = returnTrio();
  const { port, sent } = returnSubmission(detail, { resolved_widget: parent });
  const s = setup({ submission: port });
  const held = s.runtime.widgets.heldTokens();
  const phases = [];
  s.runtime.shell.subscribe((v) => phases.push(v.fullscreen?.phase ?? null));

  const { itemId, detailItemId } = await openDetailFrom(s, source);
  const shownBefore = s.item(itemId).result.textEquivalent.headline;
  assert.notEqual(shownBefore, RETURNED_HEADLINE, 'the parent on screen is not yet the returned one');

  assert.deepEqual(await s.runtime.widgets.activate(detailItemId, 'intent:i1'), { outcome: 'dismissed' });

  // The parent that came back is the server's, byte for byte — not the one already on screen.
  const restored = s.item(itemId).result;
  assert.deepEqual(restored.textEquivalent, parent.presentation.text_equivalent);
  assert.equal(restored.textEquivalent.headline, RETURNED_HEADLINE);
  assert.equal(s.item(itemId).display, 'live');
  assert.equal(s.item(itemId).pending, null);
  assert.equal(s.item(itemId).sentence, null);

  // The old fullscreen detail does not remain open, and it closed through its own controller.
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.equal(s.runtime.shell.state().opener, null);
  assert.equal(phases.at(-1), null, 'the last thing the chrome did was close');
  assert.equal(phases.filter((p) => p === 'progress').length, 1, 'the return never opened a second PROGRESS');
  assert.equal(phases.filter((p) => p === null).length, 1, 'and the detail closed exactly once');
  assert.equal(s.history.pushes, 1);
  assert.equal(s.history.backs, 1, 'the detail popped its own history entry');
  assert.deepEqual(await s.runtime.widgets.activate(detailItemId, 'intent:i1'), { outcome: 'ignored', reason: 'unknown_item' }, 'the detail entry is released');

  // One journal in the lane: the parent came back in place, never as a second item.
  assert.deepEqual(s.items().map((i) => i.id), [itemId]);
  assert.equal(s.runtime.widgets.heldTokens(), held + 3, 'the returned parent re-vaults its own tokens; the detail drops its own');
  assert.equal(sent.length, 2, 'one submission opened the detail, one returned the parent');
  assert.equal(sent[1].widget_id, detail.widget_id, 'the return was sent by the detail, for the detail');
  assert.equal(s.counts.chat, 0);
  s.runtime.dispose();
});

test('NS-1: a return with no `resolved_widget` fails closed — nothing is reconstructed and no parent is restored', async () => {
  const { source, detail } = returnTrio();
  // ACCEPTED, with the member absent exactly as a server that re-resolved nothing would send it.
  const { port } = returnSubmission(detail, { resolved_widget: null });
  const s = setup({ submission: port });
  const { itemId, detailItemId } = await openDetailFrom(s, source);
  const before = s.item(itemId).result.textEquivalent;

  // The thread-page reread is what an accepted-with-nothing-attached reply does, and it throws here:
  // reaching it at all proves the return path was not taken, and the catch keeps this a sentence.
  const out = await s.runtime.widgets.activate(detailItemId, 'intent:i1');
  assert.equal(out.outcome, 'sentence');
  assert.equal(out.submitted, true);
  assert.deepEqual(s.item(itemId).result.textEquivalent, before, 'the parent on screen is untouched');
  assert.notEqual(s.item(itemId).result.textEquivalent.headline, RETURNED_HEADLINE);
  assert.deepEqual(s.items().map((i) => i.id), [itemId], 'no invented parent joins the timeline');
  s.runtime.dispose();
});

for (const [name, mutate] of [
  ['substituted parent widget', { parent: (p) => { p.widget_id = '01M2Q9G7M0BBBBBBBBBBBBBBBB'; } }],
  ['the detail itself returned as its own parent', { parent: (p, source, detail) => { p.widget_id = detail.widget_id; } }],
  ['wrong tenant', { parent: (p) => { p.tenant_id = 'other-tenant'; } }],
  ['wrong principal', { parent: (p) => { p.integrity.principal_proof_hash = 'a'.repeat(64); } }],
  ['wrong turn', { parent: (p) => { p.correlation.turn_id = 'other-turn'; } }],
  ['wrong profile', { parent: (p) => { p.render.profile_id = 'other-profile'; } }],
  ['wrong profile version', { parent: (p) => { p.render.profile_version += 1; } }],
  ['tampered parent body', { parent: (p) => { p.presentation.text_equivalent.headline = 'Подменённый журнал'; }, sealParent: false }],
  ['stale parent: expired', { parent: (p) => { p.lifecycle.expires_at = INDEX.now; } }],
  ['stale parent: superseded', { parent: (p) => { p.lifecycle.state = 'SUPERSEDED'; } }],
  ['stale parent: consumed', { parent: (p) => { p.lifecycle.state = 'CONSUMED'; } }],
]) test(`NS-1: ${name} is refused, with the detail closed and no parent restored`, async () => {
  const { source, detail, parent } = returnTrio(mutate);
  const { port } = returnSubmission(detail, { resolved_widget: parent });
  const s = setup({ submission: port });
  const { itemId, detailItemId } = await openDetailFrom(s, source);
  const before = s.item(itemId).result.textEquivalent;

  assert.deepEqual(
    await s.runtime.widgets.activate(detailItemId, 'intent:i1'),
    { outcome: 'sentence', sentence: 'route_refused', submitted: true },
  );
  assert.equal(s.runtime.shell.view().fullscreen, null, 'a refused return still closes the detail it came from');
  assert.equal(s.item(itemId).sentence, 'route_refused', 'the opener carries the sentence');
  assert.deepEqual(s.item(itemId).result.textEquivalent, before, 'the refused envelope never reaches the screen');
  assert.notEqual(s.item(itemId).result.textEquivalent.headline, RETURNED_HEADLINE);
  assert.deepEqual(s.items().map((i) => i.id), [itemId]);
  s.runtime.dispose();
});

test('NS-1: a parent return is admitted only from an open detail, and only for a NAVIGATE to a re-resolved widget', async () => {
  // Same accepted reply, same canonical parent — but sent by a timeline item, not by its detail.
  const { source, parent } = returnTrio();
  const timeline = structuredClone(source);
  timeline.intents[0].target = { class: 'w', ref: 'w.journal.parent' };
  reseal(timeline);
  const s = setup({ submission: createLiveSubmission({
    widgetIntent: async () => ({ ok: true, value: { outcome: 'terminate', code: null, next_envelope: null, resolved_widget: parent, receipt_outcome: 'ACCEPTED' } }),
    resolveWidgets: async () => { throw new Error('unreached'); },
  }) });
  const { itemId } = s.runtime.widgets.ingest(timeline);
  const out = await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.deepEqual(out, { outcome: 'sentence', sentence: 'route_refused', submitted: true });
  assert.equal(s.runtime.shell.view().fullscreen, null);
  assert.deepEqual(s.items().map((i) => i.id), [itemId], 'a returned parent never appends, wherever it arrives');
  assert.notEqual(s.item(itemId).result.textEquivalent.headline, RETURNED_HEADLINE, 'and never replaces the item that asked');
  s.runtime.dispose();

  // Inside the detail, a REFINE carrying the same parent is not a navigation and returns nothing.
  const r = returnTrio({ detail: (d) => { d.intents[0].effect = 'REFINE'; d.intents[0].target = null; } });
  const { port } = returnSubmission(r.detail, { resolved_widget: r.parent });
  const t = setup({ submission: port });
  const opened = await openDetailFrom(t, r.source);
  const before = t.item(opened.itemId).result.textEquivalent;
  const refine = await t.runtime.widgets.activate(opened.detailItemId, 'intent:i1');
  assert.equal(refine.outcome, 'sentence', 'the reread is reached, so no return was taken');
  assert.deepEqual(t.item(opened.itemId).result.textEquivalent, before);
  t.runtime.dispose();
});

test('NS-1: ordinary ACCEPTED responses are unchanged — the reread still settles, and a successor still advances', async () => {
  // 1. ACCEPTED with nothing re-resolved: the bounded thread-page reread, exactly as before.
  const source = envelope('kind-schedule');
  source.intents[0].effect = 'REFINE';
  source.intents[0].target = null;
  reseal(source);
  const lines = [{ outcome: 'CANCELLED', text: 'Запись отменена.', action_receipt_ref: 'ae-9' }];
  const s = setup({ submission: createLiveSubmission({
    widgetIntent: async () => ({ ok: true, value: { outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED' } }),
    resolveWidgets: async () => ({ ok: true, value: { tenant_bound: true, widgets: [{ envelope: source, terminal_lines: lines, reread_intent: null }] } }),
  }) });
  const { itemId } = s.runtime.widgets.ingest(source);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(s.item(itemId).display, 'terminal');
  assert.ok(s.items().some((i) => i.kind === 'assistant' && i.text === 'Запись отменена.'), 'the server line was appended');
  assert.equal(s.runtime.shell.view().fullscreen, null);
  s.runtime.dispose();

  // 2. A successor and a re-resolved widget in one reply: `next_envelope` still wins, so an
  //    ordinary advance keeps the timeline it always had and no chrome is taken.
  const { source: src2, detail, parent } = returnTrio();
  const successor = structuredClone(detail);
  successor.correlation.parent_widget_id = src2.widget_id;
  reseal(successor);
  const plain = structuredClone(src2);
  plain.intents[0].effect = 'REFINE';
  plain.intents[0].target = null;
  reseal(plain);
  const t = setup({ submission: createLiveSubmission({
    widgetIntent: async () => ({ ok: true, value: { outcome: 'terminate', code: null, next_envelope: successor, resolved_widget: parent, receipt_outcome: 'ACCEPTED' } }),
    resolveWidgets: async () => { throw new Error('a successor must not query receipts'); },
  }) });
  const first = t.runtime.widgets.ingest(plain);
  assert.deepEqual(await t.runtime.widgets.activate(first.itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(t.items().length, 2, 'the successor appends');
  assert.equal(t.runtime.shell.view().fullscreen, null);
  assert.notEqual(t.item(first.itemId).result.textEquivalent.headline, RETURNED_HEADLINE, 'the attached widget never replaced the opener');
  t.runtime.dispose();

  // 3. A reply that does not carry the member AT ALL — every reply before this release, and any
  //    transport that omits it. Absent must read as "nothing re-resolved", not as a return of
  //    nothing: this is the case that a `!== null` test admitted, from inside an open detail.
  const r = returnTrio();
  let reread = 0;
  const u = setup({ submission: createLiveSubmission({
    widgetIntent: async (submission) => ({ ok: true, value: submission.widget_id === r.detail.widget_id
      ? { outcome: 'terminate', code: null, next_envelope: null, receipt_outcome: 'ACCEPTED' }
      : { outcome: 'terminate', code: null, next_envelope: r.detail, receipt_outcome: 'ACCEPTED' } }),
    resolveWidgets: async () => (reread += 1, { ok: true, value: { tenant_bound: true, widgets: [] } }),
  }) });
  const opened = await openDetailFrom(u, r.source);
  const before = u.item(opened.itemId).result.textEquivalent;
  assert.deepEqual(await u.runtime.widgets.activate(opened.detailItemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(reread, 1, 'the bounded reread is what an acknowledgement still does');
  assert.deepEqual(u.item(opened.itemId).result.textEquivalent, before, 'and no parent was restored from an absent member');
  u.runtime.dispose();
});

// ── L27: one canonical terminal outcome, at most one visible terminal outcome ──────────────────
//
// COMMIT burns every control even if its result is lost. A later explicit bounded READ carries the
// current terminal set; it must publish each canonical outcome once without resubmitting anything.
//
// The rule these proofs pin is about canonical identity, never display text. A terminal line's
// `action_receipt_ref` is present iff its outcome is CONFIRMED (widget-contract §4.2) and it is the
// only pointer to a business fact (§4.3); the other six outcomes are terminal conditions OF A WIDGET.
// So two outcomes are the same outcome when they share a receipt reference, or when they are the
// same outcome class of the same widget — and nothing else makes them the same, least of all
// identical sentences.

const CONFIRMED_REF = '483ed7f8-6c1a-4f52-9b3d-70e2a5c81d94';
const CONFIRMED_TEXT = 'Запись подтверждена.';
const SUBMITTED_TEXT = 'Запрос принят. Подтверждение ожидается.';
const confirmed = (ref = CONFIRMED_REF, text = CONFIRMED_TEXT) => ({ outcome: 'CONFIRMED', text, action_receipt_ref: ref });
const submitted = (text = SUBMITTED_TEXT) => ({ outcome: 'SUBMITTED', text, action_receipt_ref: null });

/** Certified PWA confirmation; its NONE escape is never rewritten into tokened CONTROL. */
const terminalCard = (widgetId) => {
  const card = envelope('kind-booking-confirmation');
  if (widgetId !== undefined) card.widget_id = widgetId;
  return reseal(card);
};

/** A thread page that answers with each widget's terminal set as it stands now. */
const terminalStore = () => {
  const lines = new Map();
  const envelopes = new Map();
  let rereads = 0;
  const read = async (request) => {
    if (request.booking_receipt === undefined) assert.deepEqual(request, { thread_page: { limit: 20 } });
    else {
      assert.ok(envelopes.has(request.booking_receipt.widget_id));
      assert.deepEqual(request, { thread_page: { limit: 20 }, booking_receipt: { widget_id: request.booking_receipt.widget_id } });
    }
    rereads += 1;
    return { ok: true, value: {
      tenant_bound: true,
      widgets: [...envelopes.entries()].map(([id, env]) => ({ envelope: env, terminal_lines: (lines.get(id) ?? []).map((l) => ({ ...l })), reread_intent: null })),
    } };
  };
  return {
    lines,
    read,
    rereads: () => rereads,
    put(env, next) {
      envelopes.set(env.widget_id, env);
      lines.set(env.widget_id, next);
    },
    port(over = {}) {
      return createLiveSubmission({
        widgetIntent: async () => ({ ok: true, value: { outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED', ...over } }),
        resolveWidgets: read,
      });
    },
  };
};

const serverLines = (s) => s.items().filter((i) => i.kind === 'assistant').map((i) => i.text);

test('historical booking outcomes share live receipt dedupe without holding controls or tokens', async () => {
  const card = terminalCard(), store = terminalStore();
  store.put(card, [confirmed()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const pending = { outcome: 'SUBMITTED', text: 'Запрос принят. Подтверждение ожидается.', action_receipt_ref: null };
  const history = [
    { widgetId: card.widget_id, lines: [confirmed(), confirmed()] },
    { widgetId: 'another-widget', lines: [pending] },
  ];
  s.runtime.widgets.restoreBookingOutcomes(history);
  s.runtime.widgets.restoreBookingOutcomes(history);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT, pending.text]);
  assert.equal(s.items().filter(i => i.notice === 'booking_outcomes_restored').length, 1);
  assert.equal(s.items().some(i => i.kind === 'widget'), false);
  assert.equal(s.runtime.widgets.heldTokens(), 0);
  assert.equal(s.runtime.widgets.counters().submissions, 0);
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT, pending.text], 'a current live read of the same receipt does not duplicate it');
  s.signOut();
  assert.deepEqual(serverLines(s), []);
  assert.equal(s.runtime.widgets.heldTokens(), 0);
  s.runtime.dispose();
});

test('L27: COMMIT → CONFIRMED → explicit READ leaves one submission, one receipt and one visible outcome', async () => {
  const card = terminalCard();
  const store = terminalStore();
  // Counting double only: exactly one COMMIT reaches it, no Dismiss/resend after the receipt.
  const business = { bookings: 0, receipts: [] };
  const s = setup({ receiptRead: store.read, submission: createLiveSubmission({
    widgetIntent: async (submission) => {
      if (submission.intent_token === card.intents[0].intent_token) {
        business.bookings += 1;
        business.receipts.push(CONFIRMED_REF);
        store.put(card, [confirmed()]);
      } else business.receipts.push(null);
      return { ok: true, value: { outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED' } };
    },
    resolveWidgets: async () => ({ ok: true, value: { tenant_bound: true, widgets: [{ envelope: card, terminal_lines: (store.lines.get(card.widget_id) ?? []).map((l) => ({ ...l })), reread_intent: null }] } }),
  }) });

  const { itemId } = s.runtime.widgets.ingest(card);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' }, 'COMMIT');
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], 'the confirmation is written once');
  const afterCommit = s.runtime.widgets.counters();

  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], 'the READ does not write the outcome again');
  assert.deepEqual(s.runtime.widgets.counters(), afterCommit, 'READ is not activation or submission');
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i9'), { outcome: 'ignored', reason: 'not_drawn' });
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'ignored', reason: 'not_drawn' });
  assert.equal(s.item(itemId).display, 'terminal');
  assert.equal(s.item(itemId).receiptRefresh, 'available');
  assert.equal(s.runtime.widgets.heldTokens(), 0);

  // These count what the shell SENT, which is all a shell-side proof can honestly establish: the
  // booking and receipt rows are the double's own; actual effects require backend evidence.
  assert.equal(business.bookings, 1, 'exactly one COMMIT submission reached the server');
  assert.deepEqual(business.receipts, [CONFIRMED_REF], 'no escape or duplicate COMMIT was submitted');
  assert.deepEqual(store.lines.get(card.widget_id), [confirmed()], 'and the durable record still holds one line');
  s.runtime.dispose();
});

test('L27: repeated explicit READ keeps the visible terminal outcome at one', async () => {
  const card = terminalCard();
  const store = terminalStore();
  store.put(card, [confirmed()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const { itemId } = s.runtime.widgets.ingest(card);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' });
  const submissions = s.runtime.widgets.counters().submissions;
  for (let press = 0; press < 5; press += 1) {
    await s.runtime.widgets.refreshBookingReceipt(itemId);
    assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], `press ${press}`);
  }
  assert.equal(store.rereads(), 6, 'every press still re-read the thread page; only the append was suppressed');
  assert.equal(s.runtime.widgets.counters().submissions, submissions);
  s.runtime.dispose();
});

test('L27: two genuinely different terminal outcomes both remain representable', async () => {
  // (a) One widget, two outcome classes: the reconciliation transition below, in miniature.
  const card = terminalCard();
  const store = terminalStore();
  store.put(card, [submitted()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.deepEqual(serverLines(s), [SUBMITTED_TEXT]);
  store.put(card, [submitted(), confirmed()]);
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [SUBMITTED_TEXT, CONFIRMED_TEXT], 'the new outcome class is written; the old one is not rewritten');
  s.runtime.dispose();

  // (b) Two widgets, each with its own canonical receipt.
  const first = terminalCard();
  const second = terminalCard('01M2Q9G7M0ZZZZZZZZZZZZZZZZ');
  const two = terminalStore();
  two.put(first, [confirmed(CONFIRMED_REF)]);
  two.put(second, [confirmed('9c11baa0-2f74-4d6e-8a15-3ee6b0f7c2d1')]);
  const t = setup({ submission: two.port(), receiptRead: two.read });
  const a = t.runtime.widgets.ingest(first);
  const b = t.runtime.widgets.ingest(second);
  await t.runtime.widgets.activate(a.itemId, 'intent:i1');
  await t.runtime.widgets.activate(b.itemId, 'intent:i1');
  assert.equal(serverLines(t).length, 2, 'two business facts, two lines');
  t.runtime.dispose();

  // (c) A different receipt on the SAME immutable emission is inconsistent. Two distinct
  // canonical references remain representable through two widgets, proven above.
  const third = terminalCard();
  const again = terminalStore();
  again.put(third, [confirmed(CONFIRMED_REF)]);
  const u = setup({ submission: again.port(), receiptRead: again.read });
  const c = u.runtime.widgets.ingest(third);
  await u.runtime.widgets.activate(c.itemId, 'intent:i1');
  again.put(third, [confirmed('0f5d3c92-8b47-4e10-9a6f-c1d8e2b34507')]);
  await u.runtime.widgets.refreshBookingReceipt(c.itemId);
  assert.deepEqual(serverLines(u), [CONFIRMED_TEXT], 'the observed receipt is never replaced');
  assert.equal(u.item(c.itemId).receiptRefresh, 'unavailable');
  u.runtime.dispose();
});

test('L27: identity is the canonical reference, never the sentence — in BOTH directions', async () => {
  // Same text, two different canonical outcomes: both are written. A text-matching rule would
  // silently drop the second, which is exactly what this project forbids.
  const first = terminalCard();
  const second = terminalCard('01M2Q9G7M0YYYYYYYYYYYYYYYY');
  const store = terminalStore();
  store.put(first, [{ outcome: 'CANCELLED', text: 'Запись отменена.', action_receipt_ref: null }]);
  store.put(second, [{ outcome: 'CANCELLED', text: 'Запись отменена.', action_receipt_ref: null }]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const a = s.runtime.widgets.ingest(first);
  const b = s.runtime.widgets.ingest(second);
  await s.runtime.widgets.activate(a.itemId, 'intent:i1');
  await s.runtime.widgets.activate(b.itemId, 'intent:i1');
  assert.deepEqual(serverLines(s), ['Запись отменена.', 'Запись отменена.'], 'two widgets, two cancellations, two lines');
  s.runtime.dispose();

  // Different text, ONE canonical outcome: written once. The server re-minting the sentence does not
  // make it a second business fact.
  const card = terminalCard();
  const reminted = terminalStore();
  reminted.put(card, [confirmed(CONFIRMED_REF, CONFIRMED_TEXT)]);
  const t = setup({ submission: reminted.port(), receiptRead: reminted.read });
  const { itemId } = t.runtime.widgets.ingest(card);
  await t.runtime.widgets.activate(itemId, 'intent:i1');
  reminted.put(card, [confirmed(CONFIRMED_REF, 'Запись подтверждена. Ждём вас.')]);
  await t.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(t), [CONFIRMED_TEXT], 'one receipt, one line');
  t.runtime.dispose();
});

test('L27: an ordinary assistant message and a terminal outcome never deduplicate each other, in either order', async () => {
  const card = terminalCard();
  const store = terminalStore();
  store.put(card, [confirmed()]);
  const s = setup({
    submission: store.port(), receiptRead: store.read,
    chat: async () => ({ ok: true, value: { request_id: 'req-1', reply: CONFIRMED_TEXT, action_status: null, resolution: null } }),
  });
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT]);

  // MAYA says the same sentence in an ordinary turn. It is a different thing entirely — an assistant
  // reply, not a terminal receipt — and it appears.
  s.runtime.conversation.submitUserTurn('Всё получилось?', 'typed');
  await flush();
  await flush();
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT, CONFIRMED_TEXT], 'the reply is not suppressed by the receipt already on screen');

  // And the terminal line still is: the READ adds nothing.
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT, CONFIRMED_TEXT], 'still exactly the receipt and the reply');
  s.runtime.dispose();

  // The other order is the one a display-text rule would break, so it is the one that matters: MAYA
  // says the sentence FIRST, in an ordinary turn, and the server-authored receipt must still be
  // written when it arrives. A rule that compared sentences would swallow the receipt here.
  const t = setup({
    submission: store.port(), receiptRead: store.read,
    chat: async () => ({ ok: true, value: { request_id: 'req-2', reply: CONFIRMED_TEXT, action_status: null, resolution: null } }),
  });
  t.runtime.conversation.submitUserTurn('Записал?', 'typed');
  await flush();
  await flush();
  assert.deepEqual(serverLines(t), [CONFIRMED_TEXT], 'the ordinary reply is on screen first');
  const later = t.runtime.widgets.ingest(card);
  await t.runtime.widgets.activate(later.itemId, 'intent:i1');
  assert.deepEqual(serverLines(t), [CONFIRMED_TEXT, CONFIRMED_TEXT], 'the server-authored outcome is still written');
  t.runtime.dispose();
});

test('L27: UNKNOWN → reconciliation → CONFIRMED keeps the later canonical transition visible', async () => {
  const card = terminalCard();
  const store = terminalStore();
  // The COMMIT is accepted but the canonical outcome is not yet known: the widget is SUBMITTED.
  store.put(card, [submitted()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.deepEqual(serverLines(s), [SUBMITTED_TEXT], 'the unresolved outcome is shown');

  // Reconciliation resolves it. The thread page now carries the CONFIRMED line, with its reference.
  store.put(card, [confirmed()]);
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [SUBMITTED_TEXT, CONFIRMED_TEXT], 'the transition is visible, in order');

  // A further press adds nothing: the reconciled outcome is already represented.
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [SUBMITTED_TEXT, CONFIRMED_TEXT]);
  s.runtime.dispose();
});

test('L27: lost COMMIT response and refusal remain spent; only explicit READ can recover a receipt', async () => {
  // A transient failure never permits mutation retry; a bounded READ recovers the stored outcome.
  const card = terminalCard();
  const store = terminalStore();
  store.put(card, [confirmed()]);
  let attempts = 0;
  const s = setup({ receiptRead: store.read, submission: createLiveSubmission({
    widgetIntent: async () => (attempts += 1) === 1
      ? { ok: false, failure: { reason: 'no_connection' } }
      : { ok: true, value: { outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED' } },
    resolveWidgets: async () => ({ ok: true, value: { tenant_bound: true, widgets: [{ envelope: card, terminal_lines: [confirmed()], reread_intent: null }] } }),
  }) });
  const { itemId } = s.runtime.widgets.ingest(card);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(s.item(itemId).sentence, 'booking_unconfirmed');
  assert.deepEqual(serverLines(s), [], 'a failed submission writes nothing');
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'ignored', reason: 'not_drawn' });
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], 'READ writes it once');
  assert.equal(attempts, 1, 'the lost response never retries COMMIT');
  s.runtime.dispose();

  // Every non-settled mutation is spent and writes no fabricated receipt.
  for (const [status, expected] of [
    ['unavailable', 'booking_unconfirmed'],
    ['forbidden', 'activation_forbidden'],
    ['no_connection', 'booking_unconfirmed'],
    ['server_error', 'booking_unconfirmed'],
    ['unexpected_response', 'booking_unconfirmed'],
  ]) {
    const t = setup({ submission: { submit: async () => ({ status }) } });
    const item = t.runtime.widgets.ingest(terminalCard());
    assert.deepEqual(await t.runtime.widgets.activate(item.itemId, 'intent:i1'), { outcome: 'dismissed' }, status);
    assert.equal(t.item(item.itemId).sentence, expected, status);
    await t.runtime.widgets.refreshBookingReceipt(item.itemId);
    assert.equal(t.item(item.itemId).receiptRefresh, 'unavailable', status);
    assert.equal(t.item(item.itemId).sentence, expected, 'failed READ preserves known sentence');
    assert.equal(t.runtime.widgets.heldTokens(), 0);
    assert.equal(t.runtime.widgets.counters().submissions, 1);
    assert.deepEqual(serverLines(t), [], status);
    t.runtime.dispose();
  }
});

test('L27: a successor emission carrying its predecessor\'s confirmation states it once', async () => {
  // One booking, one receipt — and then a superseding emission of the card that still carries it.
  // The receipt is the business fact, so it is the same outcome under a different widget id, and the
  // person is told about the booking once. This is why a CONFIRMED key is not scoped by widget.
  const first = terminalCard();
  const second = terminalCard('01M2Q9G7M0WWWWWWWWWWWWWWWW');
  second.lifecycle.supersedes_widget_id = first.widget_id;
  reseal(second);
  const store = terminalStore();
  store.put(first, [confirmed()]);
  store.put(second, [confirmed()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });

  const { itemId } = s.runtime.widgets.ingest(first);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT]);

  const replaced = s.runtime.widgets.ingest(second);
  assert.equal(replaced.ingested, 'replaced', 'the successor takes the predecessor\'s place');
  await s.runtime.widgets.activate(replaced.itemId, 'intent:i1');
  await s.runtime.widgets.refreshBookingReceipt(replaced.itemId);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], 'one receipt, one statement, across the emission boundary');
  s.runtime.dispose();
});

test('L27: the record survives the display cap, on the path where that is reachable', async () => {
  // A timeline card is appended BEFORE its own line, and the cap evicts from the front, so a card
  // whose line has been evicted has itself been released — it cannot submit again, and this branch
  // would be unreachable. A DETAIL entry has no timeline item, so the cap never releases it: it can
  // still READ after its own line is gone. That is the case the ledger's lifetime is about.
  const card = terminalCard();
  const store = terminalStore();
  store.put(card, [confirmed()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const opener = s.runtime.widgets.ingest(terminalCard('01M2Q9G7M0OPENEROPENEROPEN'));
  const detail = s.runtime.shell.presentDetail(card, { itemId: opener.itemId, ref: 'intent:i1' });
  assert.equal(detail.presented, true);

  await s.runtime.widgets.activate(detail.itemId, 'intent:i1');
  assert.equal(serverLines(s).filter((t) => t === CONFIRMED_TEXT).length, 1, 'the confirmation is written once');

  for (let i = 0; i < DISPLAY_CAP + 10; i += 1) s.runtime.conversation.timeline.appendServerLine(`строка ${i}`);
  assert.equal(serverLines(s).filter((t) => t === CONFIRMED_TEXT).length, 0, 'the line has scrolled out of the conversation');
  assert.ok(s.runtime.shell.view().fullscreen !== null, 'the detail is still on screen');

  const before = s.runtime.widgets.counters().submissions;
  await s.runtime.widgets.refreshBookingReceipt(detail.itemId);
  assert.equal(s.runtime.widgets.counters().submissions, before, 'detail refresh is a READ');
  assert.equal(store.rereads(), 2, 'the explicit READ really ran');
  assert.equal(serverLines(s).filter((t) => t === CONFIRMED_TEXT).length, 0, 'an evicted outcome is not re-asserted at the bottom');
  s.runtime.widgetPort.closeDetail();
  assert.equal(s.runtime.shell.view().fullscreen, null);
  s.runtime.dispose();
});

test('L27: one canonical receipt is stated once ACROSS widgets, even after the first statement is evicted', async () => {
  // The same booking, reported by a second card. A per-widget receipt key would state it twice.
  const first = terminalCard();
  const second = terminalCard('01M2Q9G7M0VVVVVVVVVVVVVVVV');
  const store = terminalStore();
  store.put(first, [confirmed()]);
  store.put(second, [confirmed()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const a = s.runtime.widgets.ingest(first);
  await s.runtime.widgets.activate(a.itemId, 'intent:i1');
  assert.equal(serverLines(s).filter((t) => t === CONFIRMED_TEXT).length, 1);

  for (let i = 0; i < DISPLAY_CAP + 10; i += 1) s.runtime.conversation.timeline.appendServerLine(`строка ${i}`);
  assert.equal(serverLines(s).filter((t) => t === CONFIRMED_TEXT).length, 0, 'the first statement is gone from the conversation');

  const b = s.runtime.widgets.ingest(second);
  const before = s.runtime.widgets.counters().submissions;
  assert.deepEqual(await s.runtime.widgets.activate(b.itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(s.runtime.widgets.counters().submissions - before, 1, 'the settled branch really ran');
  assert.equal(serverLines(s).filter((t) => t === CONFIRMED_TEXT).length, 0, 'one receipt, one statement');
  s.runtime.dispose();
});

test('L27: a cleared conversation starts again', async () => {
  const card = terminalCard();
  const store = terminalStore();
  store.put(card, [confirmed()]);
  const t = setup({ submission: store.port(), receiptRead: store.read });
  const again = t.runtime.widgets.ingest(card);
  await t.runtime.widgets.activate(again.itemId, 'intent:i1');
  assert.deepEqual(serverLines(t), [CONFIRMED_TEXT]);
  t.signOut();
  assert.deepEqual(t.items(), [], 'sign-out clears the conversation');
  const fresh = t.runtime.widgets.ingest(card);
  await t.runtime.widgets.activate(fresh.itemId, 'intent:i1');
  assert.deepEqual(serverLines(t), [CONFIRMED_TEXT], 'the new conversation is told the outcome it is showing for the first time');
  t.runtime.dispose();
});

test('L27: ACCEPTED plus failed first page recovers through explicit READ without a second intent', async () => {
  // The intent succeeded and the server wrote the line, but the bounded re-read failed, so the port
  // answers `accepted` and no line is written. Nothing may be recorded as shown that was not shown:
  // the explicit READ must still write it, exactly once.
  const card = terminalCard();
  let pages = 0;
  let intents = 0;
  const read = async (request) => {
    assert.deepEqual(request, pages === 0 ? { thread_page: { limit: 20 } }
      : { thread_page: { limit: 20 }, booking_receipt: { widget_id: card.widget_id } });
    return (pages += 1) === 1
      ? { ok: false, failure: { reason: 'server_error' } }
      : { ok: true, value: { tenant_bound: true, widgets: [{ envelope: card, terminal_lines: [confirmed()], reread_intent: null }] } };
  };
  const s = setup({ receiptRead: read, submission: createLiveSubmission({
    widgetIntent: async () => { intents++; return { ok: true, value: { outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED' } }; },
    resolveWidgets: read,
  }) });
  const { itemId } = s.runtime.widgets.ingest(card);
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' }, 'an accepted intent is not a failure');
  assert.deepEqual(serverLines(s), [], 'and it carried no line to write');
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], 'the explicit READ writes it');
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], 'and only then stops');
  assert.equal(intents, 1);
  assert.equal(pages, 3);
  assert.equal(s.runtime.widgets.heldTokens(), 0);
  s.runtime.dispose();
});

test('L27: two identical lines inside ONE response are one outcome, and two different ones are two', async () => {
  // The wire allows a widget to carry several terminal lines. Two that name the same canonical
  // outcome are that outcome, however many times the page repeats it; two that do not are two.
  const card = terminalCard();
  const store = terminalStore();
  store.put(card, [confirmed(), confirmed(), submitted(), submitted()]);
  const s = setup({ submission: store.port(), receiptRead: store.read });
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT, SUBMITTED_TEXT], 'one line per canonical outcome, in the page\'s order');
  s.runtime.dispose();
});

test('L27: a reference identifies an outcome only on the line class the contract gives it to', async () => {
  // `action_receipt_ref` is present IFF the outcome is CONFIRMED (§4.2), and `projectWidgetResolve`
  // refuses a page that breaks the biconditional — so this shape cannot arrive over the wire. The
  // `SubmissionPort` is injected, though, and the key is written to survive an implementation that
  // hands it one anyway: a CANCELLED line is not a confirmation, whatever reference it carries.
  const ref = 'f2a71c40-58bd-4c9e-9a02-6b1d47e3f085';
  const s = setup({ submission: { submit: async () => ({ status: 'settled', lines: [
    { outcome: 'CANCELLED', text: 'Запись отменена.', action_receipt_ref: ref },
    { outcome: 'CONFIRMED', text: CONFIRMED_TEXT, action_receipt_ref: ref },
  ] }) } });
  const { itemId } = s.runtime.widgets.ingest(terminalCard());
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.deepEqual(serverLines(s), ['Запись отменена.', CONFIRMED_TEXT], 'two outcome classes are two outcomes');
  s.runtime.dispose();
});


const receiptPage = (card, lines = [confirmed()]) => ({ ok: true, value: { tenant_bound: true, widgets: [{ envelope: card, terminal_lines: lines, reread_intent: null }] } });

test('L27: only a spent booking admits refresh, and concurrent clicks perform one bounded READ', async () => {
  const card = terminalCard();
  let reads = 0, complete;
  const s = setup({ submission: { submit: async () => ({ status: 'accepted' }) }, receiptRead: (request) => {
    assert.deepEqual(request, { thread_page: { limit: 20 }, booking_receipt: { widget_id: card.widget_id } });
    reads++; return new Promise(resolve => { complete = resolve; });
  } });
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.refreshBookingReceipt('unknown');
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.equal(reads, 0, 'live controls cannot use receipt refresh');
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  const before = s.item(itemId).result;
  const first = s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.equal(s.item(itemId).receiptRefresh, 'pending');
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  s.runtime.widgetPort.refreshBookingReceipt(itemId);
  assert.equal(reads, 1);
  const returned = structuredClone(card);
  returned.intents[0].intent_token = 'must-never-be-ingested';
  complete(receiptPage(returned));
  await first;
  assert.equal(s.item(itemId).receiptRefresh, 'available');
  assert.deepEqual(s.item(itemId).result, before, 'returned envelope never replaces the stored presentation');
  s.setA11y({ ...A11Y, text_scale: 1.5 });
  assert.equal(s.item(itemId).display, 'terminal');
  assert.equal(s.item(itemId).result.readingOrder.length, 0);
  assert.equal(s.runtime.widgets.heldTokens(), 0);
  assert.equal(s.runtime.widgets.counters().submissions, 1);
  s.advance(24 * 60 * 60 * 1000);
  assert.equal(reads, 1, 'there is no polling or timer retry');
  s.runtime.dispose();
});

test('L27: missing, duplicate, foreign or uncorrelated receipt rows are unavailable without losing known receipt', async () => {
  const card = terminalCard();
  const changed = (edit) => { const copy = structuredClone(card); edit(copy); return receiptPage(copy); };
  const rows = [
    ['missing bounded row', { ok: true, value: { tenant_bound: true, widgets: Array.from({ length: 20 }, (_, i) => ({ envelope: { ...card, widget_id: `other-${i}` }, terminal_lines: [confirmed()], reread_intent: null })) } }],
    ['unbound tenant', { ...receiptPage(card), value: { ...receiptPage(card).value, tenant_bound: false } }],
    ['duplicate row', { ...receiptPage(card), value: { tenant_bound: true, widgets: [...receiptPage(card).value.widgets, ...receiptPage(card).value.widgets] } }],
    ['foreign widget', changed(c => { c.widget_id = 'another-widget'; })],
    ['foreign kind', changed(c => { c.kind = 'APPROVAL'; })],
    ['foreign tenant', changed(c => { c.tenant_id = 'foreign'; })],
    ['foreign principal', changed(c => { c.integrity.principal_proof_hash = 'foreign'; })],
    ['foreign turn', changed(c => { c.correlation.turn_id = 'foreign'; })],
    ['foreign parent', changed(c => { c.correlation.parent_widget_id = 'foreign'; })],
    ['empty terminal set', receiptPage(card, [])],
    ['transport denied', { ok: false, failure: { reason: 'forbidden' } }],
  ];
  for (const [label, reply] of rows) {
    const s = setup({ submission: { submit: async () => ({ status: 'settled', lines: [confirmed()] }) }, receiptRead: async () => reply });
    const { itemId } = s.runtime.widgets.ingest(card);
    await s.runtime.widgets.activate(itemId, 'intent:i1');
    await s.runtime.widgets.refreshBookingReceipt(itemId);
    assert.equal(s.item(itemId).receiptRefresh, 'unavailable', label);
    assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], label);
    assert.equal(s.item(itemId).sentence, null, label);
    assert.equal(s.item(itemId).result.readingOrder.length, 0, label);
    assert.equal(s.runtime.widgets.heldTokens(), 0, label);
    assert.equal(s.runtime.widgets.counters().submissions, 1, label);
    s.runtime.dispose();
  }
});

test('L27: failed or throwing READ remains manually retryable while confirmed facts never regress', async () => {
  const card = terminalCard();
  let read = () => { throw new Error('synthetic synchronous reader failure'); };
  const s = setup({ submission: { submit: async () => ({ status: 'settled', lines: [confirmed()] }) }, receiptRead: (...args) => read(...args) });
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  for (const next of [
    read,
    async () => { throw new Error('synthetic rejected read'); },
    async () => receiptPage(card, [submitted(), { outcome: 'NOT_CONFIRMED', text: 'Не подтверждено.', action_receipt_ref: null }]),
    async () => receiptPage(card, [confirmed('9c11baa0-2f74-4d6e-8a15-3ee6b0f7c2d1')]),
    async () => receiptPage(card, [confirmed(), confirmed('9c11baa0-2f74-4d6e-8a15-3ee6b0f7c2d1')]),
  ]) {
    read = next;
    await s.runtime.widgets.refreshBookingReceipt(itemId);
    assert.equal(s.item(itemId).receiptRefresh, 'unavailable');
    assert.deepEqual(serverLines(s), [CONFIRMED_TEXT]);
  }
  read = async () => receiptPage(card, [submitted(), confirmed(CONFIRMED_REF, 'Новая формулировка того же результата.')]);
  await s.runtime.widgets.refreshBookingReceipt(itemId);
  assert.equal(s.item(itemId).receiptRefresh, 'available');
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT], 'known confirmation suppresses older states and reminted text');
  assert.equal(s.runtime.widgets.counters().submissions, 1);
  s.runtime.dispose();
});

test('L27: cross-widget dedupe still records each emission confirmation for later stale READ rejection', async () => {
  const a = terminalCard(), b = terminalCard('01M2Q9G7M0ZZZZZZZZZZZZZZZZ');
  const s = setup({ submission: { submit: async () => ({ status: 'settled', lines: [confirmed()] }) }, receiptRead: async () => receiptPage(b, [submitted()]) });
  const first = s.runtime.widgets.ingest(a), second = s.runtime.widgets.ingest(b);
  await s.runtime.widgets.activate(first.itemId, 'intent:i1');
  await s.runtime.widgets.activate(second.itemId, 'intent:i1');
  await s.runtime.widgets.refreshBookingReceipt(second.itemId);
  assert.deepEqual(serverLines(s), [CONFIRMED_TEXT]);
  assert.equal(s.item(second.itemId).receiptRefresh, 'unavailable');
  s.runtime.dispose();
});

test('L27: sign-out, disposal or replacement aborts the READ and ignores a transport that resolves late', async () => {
  for (const change of ['signout', 'dispose', 'replace']) {
    const card = terminalCard();
    let complete, signal;
    const s = setup({ submission: { submit: async () => ({ status: 'accepted' }) }, receiptRead: (_request, suppliedSignal) => {
      signal = suppliedSignal; return new Promise(resolve => { complete = resolve; });
    } });
    const { itemId } = s.runtime.widgets.ingest(card);
    await s.runtime.widgets.activate(itemId, 'intent:i1');
    const pending = s.runtime.widgets.refreshBookingReceipt(itemId);
    if (change === 'signout') s.signOut();
    else if (change === 'dispose') s.runtime.dispose();
    else {
      const successor = terminalCard('01M2Q9G7M0WWWWWWWWWWWWWWWW');
      successor.lifecycle.supersedes_widget_id = card.widget_id; reseal(successor);
      assert.equal(s.runtime.widgets.ingest(successor).ingested, 'replaced');
    }
    assert.equal(signal.aborted, true, change);
    complete(receiptPage(card));
    await pending;
    assert.deepEqual(serverLines(s), [], change);
    if (change === 'replace') assert.equal(s.item(itemId).receiptRefresh, undefined, 'new live entry does not inherit receipt state');
    s.runtime.dispose();
  }
});

test('L27: privacy freeze aborts receipt READ and prevents erased content returning after completion', async () => {
  const card = terminalCard();
  let complete, readSignal;
  const s = setup({
    chat: async () => ({ ok: true, value: { request_id: 'synthetic-turn', reply: '', action_status: null, resolution: null, userTurn: { conversationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', turnId: '12345678-abcd-4def-8abc-123456789abc' } } }),
    submission: { submit: async () => ({ status: 'accepted' }) },
    receiptRead: (_request, signal) => { readSignal = signal; return new Promise(resolve => { complete = resolve; }); },
  });
  s.runtime.conversation.submitUserTurn('Сохранённая беседа', 'typed'); await flush();
  const { itemId } = s.runtime.widgets.ingest(card);
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  const pending = s.runtime.widgets.refreshBookingReceipt(itemId);
  const target = s.runtime.conversation.erasureTarget();
  assert.ok(target);
  assert.equal(s.runtime.conversation.freezeForErasure(target), true);
  assert.equal(readSignal.aborted, true);
  complete(receiptPage(card)); await pending;
  assert.deepEqual(s.items(), []);
  assert.equal(s.runtime.widgets.heldTokens(), 0);
  s.runtime.conversation.finishErasure();
  assert.deepEqual(s.items(), []);
  s.runtime.dispose();
});

test('L27: reentrant clear during pending publication prevents dispatch, and during receipt publication stops remaining lines', async () => {
  for (const when of ['pending', 'first-line']) {
    const card = terminalCard(); let reads = 0, cleared = false;
    const s = setup({ submission: { submit: async () => ({ status: 'accepted' }) }, receiptRead: async () => { reads++; return receiptPage(card, [submitted(), confirmed()]); } });
    const { itemId } = s.runtime.widgets.ingest(card);
    await s.runtime.widgets.activate(itemId, 'intent:i1');
    const off = s.runtime.conversation.subscribe(view => {
      if (cleared) return;
      const shouldClear = when === 'pending' ? view.items.some(i => i.kind === 'widget' && i.receiptRefresh === 'pending') : view.items.some(i => i.kind === 'assistant');
      if (shouldClear) { cleared = true; s.signOut(); }
    });
    await s.runtime.widgets.refreshBookingReceipt(itemId);
    assert.equal(cleared, true, when);
    assert.equal(reads, when === 'pending' ? 0 : 1, when);
    assert.deepEqual(s.items(), [], when);
    assert.equal(s.runtime.widgets.heldTokens(), 0, when);
    off(); s.runtime.dispose();
  }
});

test('L25: tap alone never observes rendering; explicit mounted callback is bounded, idempotent and gates selector REFINE', async () => {
  const calls = [];
  let acknowledge;
  const s = setup({ observe: request => { calls.push(request); return new Promise(r => { acknowledge = r; }); } });
  const env = envelope('kind-service-selector');
  const { itemId } = s.runtime.widgets.ingest(env);
  const ref = s.item(itemId).result.readingOrder.find(r => r.startsWith('option:'));
  assert.deepEqual(await s.runtime.widgets.activate(itemId, ref), { outcome: 'sentence', sentence: 'activation_unavailable', submitted: false });
  assert.equal(calls.length, 0);
  assert.equal(s.submissions.length, 0);
  s.runtime.widgetPort.rendered('foreign-item');
  assert.equal(calls.length, 0);
  s.runtime.widgetPort.rendered(itemId);
  s.runtime.widgetPort.rendered(itemId);
  await flush();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { thread_page: { limit: 1 }, rendered: { widget_id: env.widget_id, body_hash: env.integrity.body_hash, envelope_seal: env.integrity.envelope_seal } });
  const activating = s.runtime.widgets.activate(itemId, ref);
  assert.equal(s.submissions.length, 0, 'tap waits for the independent observation');
  acknowledge({ ok: true, value: { widgets: [] } });
  await activating;
  assert.equal(s.submissions.length, 1);
  s.runtime.dispose();
});

test('L25: refused render evidence never opens selector submission and can be retried only after a new mounted observation', async () => {
  let calls = 0;
  const s = setup({ observe: async () => { calls++; return { ok: false, failure: { reason: 'forbidden' } }; } });
  const { itemId } = s.runtime.widgets.ingest(envelope('kind-service-selector'));
  const ref = s.item(itemId).result.readingOrder.find(r => r.startsWith('option:'));
  s.runtime.widgetPort.rendered(itemId);
  await flush();
  await s.runtime.widgets.activate(itemId, ref);
  assert.equal(calls, 1);
  assert.equal(s.submissions.length, 0);
  s.runtime.widgetPort.rendered(itemId);
  await flush();
  assert.equal(calls, 2);
  assert.equal(s.submissions.length, 0);
  s.runtime.dispose();
});

test('schedule owner failure reads its canonical terminal line without treating it as authority denial', async () => {
  const source = envelope('kind-schedule');
  const lines = [{outcome:'NOT_CONFIRMED',text:'Изменение графика не подтверждено. Проверьте актуальное расписание.',action_receipt_ref:null}];
  const port = createLiveSubmission({
    widgetIntent: async () => ({ok:true,value:{outcome:'terminate',code:'effect_not_admissible',next_envelope:null,resolved_widget:null,receipt_outcome:'REFUSED',schedule_outcome:'FAILED'}}),
    resolveWidgets: async () => ({ok:true,value:{tenant_bound:true,widgets:[{envelope:source,terminal_lines:lines,reread_intent:null}]}}),
  });
  assert.deepEqual(await port.submit({widget_id:source.widget_id},new AbortController().signal),{status:'settled',lines});
});
const staleSourceRefusal = () => ({
  contract: 'maya.widget.intent/1', outcome: 'superseded', code: 'handle_stale',
  next_envelope: null, resolved_widget: null, receipt_outcome: null, owner_decision: null,
  reason_text: { phrase_key: 'widget.refusal.handle_stale', rendered: 'Данные изменились с момента показа. Откройте актуальную версию.' },
});
test('stale source witness: canonical superseded response projects the refusal without receipt read or acceptance', async () => {
  const value = projectWidgetIntent(staleSourceRefusal()); assert.ok(value);
  let submissions = 0, reads = 0;
  const port = createLiveSubmission({ widgetIntent: async () => { submissions++; return { ok: true, value }; }, resolveWidgets: async () => { reads++; throw new Error('No receipt exists before dispatch'); } });
  assert.deepEqual(await port.submit({ widget_id: 'synthetic-widget' }, new AbortController().signal), { status: 'refused', sentence: 'booking_stale' });
  assert.equal(submissions, 1); assert.equal(reads, 0);
});
test('stale source witness: missing, unknown or noncanonical reason remains generic and never reads or claims success', async () => {
  const cases = [
    { reason_text: undefined }, { reason_text: null },
    { reason_text: { phrase_key: 'widget.refusal.other', rendered: staleSourceRefusal().reason_text.rendered } },
    { reason_text: { phrase_key: 'widget.refusal.handle_stale', rendered: 'Invented reason' } },
    { code: 'other_refusal' }, { outcome: 'refuse' },
    { owner_decision: { state: 'UNKNOWN' } }, { receipt_outcome: 'ACCEPTED' },
  ];
  let reads = 0;
  for (const patch of cases) {
    const value = projectWidgetIntent({ ...staleSourceRefusal(), ...patch }); assert.ok(value);
    const port = createLiveSubmission({ widgetIntent: async () => ({ ok: true, value }), resolveWidgets: async () => { reads++; throw new Error('Unknown refusal has no receipt authority'); } });
    assert.deepEqual(await port.submit({ widget_id: 'synthetic-widget' }, new AbortController().signal), { status: 'forbidden' });
  }
  assert.equal(reads, 0);
});
test('stale source witness: submitted booking confirmation displays the canonical sentence and consumes its control once', async () => {
  let submissions = 0, reads = 0;
  const value = projectWidgetIntent(staleSourceRefusal()); assert.ok(value);
  const s = setup({ submission: createLiveSubmission({ widgetIntent: async () => { submissions++; return { ok: true, value }; }, resolveWidgets: async () => { reads++; throw new Error('No post-dispatch receipt'); } }) });
  const { itemId } = s.runtime.widgets.ingest(envelope('kind-booking-confirmation'));
  assert.deepEqual(await s.runtime.widgets.activate(itemId, 'intent:i1'), { outcome: 'dismissed' });
  assert.equal(s.item(itemId).sentence, 'booking_stale'); assert.equal(s.item(itemId).display, 'terminal');
  await s.runtime.widgets.activate(itemId, 'intent:i1');
  assert.equal(submissions, 1); assert.equal(reads, 0); s.runtime.dispose();
});
const pendingBookingDate = () => ({
  contract: 'maya.widget.intent/1', outcome: 'terminate', code: null,
  next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED',
  owner_decision: { kind: 'booking_selection_pending', next: 'date', reply: 'На какую дату проверить время у выбранного мастера?' },
});
test('booking selection pending: exact closed projection emits only the date discriminator and performs no receipt read', async () => {
  const value = projectWidgetIntent(pendingBookingDate()); assert.ok(value);
  assert.equal(value.booking_selection_pending, 'date'); assert.equal(value.owner_decision, undefined);
  assert.equal(JSON.stringify(value).includes('На какую дату'), false);
  let submits = 0, reads = 0;
  const port = createLiveSubmission({ widgetIntent: async () => { submits++; return { ok: true, value }; }, resolveWidgets: async () => { reads++; throw new Error('Preference is not an action receipt'); } });
  assert.deepEqual(await port.submit({ widget_id: 'synthetic' }, new AbortController().signal), { status: 'booking_selection_pending', next: 'date' });
  assert.equal(submits, 1); assert.equal(reads, 0);
});
test('booking selection pending: wrong next/reply and contradictory receipt/result/successor refuse projection', () => {
  const base = pendingBookingDate();
  for (const patch of [
    { outcome: 'superseded' }, { code: 'handle_stale' }, { receipt_outcome: null }, { receipt_outcome: 'REFUSED' },
    { next_envelope: envelope('kind-staff-selector') }, { resolved_widget: envelope('kind-staff-selector') },
    { owner_decision: { ...base.owner_decision, next: 'payment' } },
    { owner_decision: { ...base.owner_decision, reply: 'Запись подтверждена.' } },
    { owner_decision: { kind: 'booking_selection_pending', next: 'date' } },
    { owner_decision: { ...base.owner_decision, state: 'SUCCEEDED' } },
    { owner_decision: { ...base.owner_decision, state: 'UNKNOWN' } },
    { owner_decision: { ...base.owner_decision, outcome: { action_execution_id: 'synthetic' } } },
  ]) assert.equal(projectWidgetIntent({ ...base, ...patch }), null);
  const unknown = projectWidgetIntent({ ...base, owner_decision: { ...base.owner_decision, kind: 'other_pending' } });
  assert.ok(unknown); assert.equal(unknown.booking_selection_pending, undefined); assert.equal(JSON.stringify(unknown).includes('На какую дату'), false);
});
test('booking selection pending: injected contradictory projection cannot advance, accept or trigger a receipt read', async () => {
  const base = projectWidgetIntent(pendingBookingDate()); assert.ok(base);
  let reads = 0;
  for (const patch of [{ booking_selection_pending: 'payment' }, { code: 'handle_stale' }, { outcome: 'refuse' }, { receipt_outcome: 'REFUSED' }, { next_envelope: envelope('kind-staff-selector') }, { resolved_widget: envelope('kind-staff-selector') }, { owner_decision: { state: 'SUCCEEDED' } }]) {
    const port = createLiveSubmission({ widgetIntent: async () => ({ ok: true, value: { ...base, ...patch } }), resolveWidgets: async () => { reads++; throw new Error('No receipt read'); } });
    assert.deepEqual(await port.submit({ widget_id: 'synthetic' }, new AbortController().signal), { status: 'forbidden' });
  }
  assert.equal(reads, 0);
});
const pendingStaffSelector = () => {
  const e = envelope('kind-staff-selector'); e.intents[0].input_schema.fields[0].name = 'staff_ref'; return reseal(e);
};
test('booking selection pending: exact staff REFINE displays only canonical date question and consumes control across redraw', async () => {
  let submits = 0, reads = 0;
  const s = setup({ observe: async () => ({ ok: true, value: { widgets: [] } }), submission: createLiveSubmission({
    widgetIntent: async () => { submits++; return { ok: true, value: projectWidgetIntent(pendingBookingDate()) }; },
    resolveWidgets: async () => { reads++; throw new Error('No booking receipt'); },
  }) });
  const { itemId } = s.runtime.widgets.ingest(pendingStaffSelector());
  s.runtime.widgetPort.rendered(itemId); await flush();
  const ref = s.item(itemId).result.readingOrder.find(r => r.startsWith('option:'));
  assert.ok(ref); assert.deepEqual(await s.runtime.widgets.activate(itemId, ref), { outcome: 'dismissed' });
  assert.equal(s.item(itemId).sentence, 'booking_date_required'); assert.equal(s.item(itemId).display, 'terminal');
  assert.deepEqual(s.item(itemId).result.readingOrder, []); assert.equal(s.item(itemId).result.mode, 'frozen_prose');
  s.setA11y({ ...A11Y, text_scale: 1.2 });
  assert.deepEqual(s.item(itemId).result.readingOrder, []); assert.equal(s.item(itemId).sentence, 'booking_date_required');
  await s.runtime.widgets.activate(itemId, ref);
  assert.equal(submits, 1); assert.equal(reads, 0); s.runtime.dispose();
});
test('booking selection pending: wrong selector kind/effect/capability/template never displays date acknowledgement', async () => {
  for (const mutate of [
    e => { e.intents[0].effect = 'DRAFT'; },
    e => { e.intents[0].capability.key = 'catalog.services.read'; },
    e => { e.source.capability = 'catalog.services.read'; },
    e => { e.provenance.source_capability = 'catalog.services.read'; },
    e => { e.intents[0].input_schema.fields[0].name = 'selection'; },
    null,
  ]) {
    let submits = 0;
    const s = setup({ observe: async () => ({ ok: true, value: { widgets: [] } }), submission: {
      submit: async () => { submits++; return { status: 'booking_selection_pending', next: 'date' }; },
    } });
    const e = mutate === null ? envelope('kind-service-selector') : pendingStaffSelector();
    if (mutate !== null) mutate(e);
    reseal(e);
    const { itemId } = s.runtime.widgets.ingest(e); s.runtime.widgetPort.rendered(itemId); await flush();
    const ref = s.item(itemId).result.readingOrder.find(r => r.startsWith('option:')); assert.ok(ref);
    await s.runtime.widgets.activate(itemId, ref);
    assert.equal(submits, 1); assert.notEqual(s.item(itemId).sentence, 'booking_date_required'); s.runtime.dispose();
  }
});
test('personal receiver follows real Widgets integrity/expiry and survives accessibility redraw', async () => {
  const { source, detail } = detailPair();
  for (const e of [source, detail]) {
    e.provenance.source_capability = 'appointments.own.list';
    e.presentation.fullscreen_detail.route_key = 'fs.booking';
    e.intents[0].target = { class: 'detail', ref: 'fs.booking' };
    e.lifecycle.expires_at = new Date(NOW + 5000).toISOString(); reseal(e);
  }
  const s = setup({ submission: { submit: async () => ({ status: 'advanced', envelope: detail, accepted: true }) } });
  const personal = createPersonalBooking({ widgets: s.runtime.widgetPort, session: { view: () => ({ signedIn: true }), subscribe: () => () => {} }, newAbort: () => new AbortController(), transport: {
    personalBranches: async () => ({ ok: true, value: [] }),
    personalResults: async () => ({ ok: true, value: { results: [], hasPending: false, hasMore: false } }),
    personalServices: async () => ({ ok: true, value: [{ id: 's', name: 'Service' }] }),
    personalStaff: async () => ({ ok: true, value: [{ id: 'p', name: 'Staff' }] }),
  } });
  await openDetailFrom(s, source); await flush(); personal.chooseService('s');
  assert.equal(personal.view().phase, 'choose');
  s.setA11y({ ...A11Y, reduced_motion: true });
  assert.equal(personal.view().serviceId, 's');
  s.advance(5001); await flush();
  assert.equal(s.runtime.shell.view().fullscreen.receiver, undefined);
  assert.equal(personal.view().phase, 'closed'); assert.equal(personal.view().services.length, 0);
  personal.dispose(); s.runtime.dispose();
});
