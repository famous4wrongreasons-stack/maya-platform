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
import { createShellRuntime } from '../src/shell/shell.ts';
import { createTokenVault, createUnavailableSubmission, displayOf, intentRefFor } from '../src/shell/intents.ts';
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
      chat: () => ((counts.chat += 1), new Promise(() => undefined)),
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
    const extra = original.replace("      inputs: null,\n", "      inputs: null,\n      audience_hint: 'owner',\n");
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
