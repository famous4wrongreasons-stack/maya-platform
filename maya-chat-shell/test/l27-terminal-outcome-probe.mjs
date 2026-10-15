// L27 — current certification probe: one canonical outcome, one visible outcome.
//
//   node test/l27-terminal-outcome-probe.mjs
//
// Provenance: fed5f7df measured COMMIT then submitting Dismiss. 3135cafb deliberately froze
// submitted confirmations; 97bab7ab / 59d6e46c established explicit receipt READ instead.
// MAYA-HISTORY-RETENTION-CHECKPOINT-20261008.md documents that contract and the corresponding
// update of intents.test.mjs. This standalone probe was missed: at 7d6aac8c it still expected
// three mutations and failed five assertions, while the visible result remained exactly one.
//
// Current path: real transport/projector/runtime/renderer; COMMIT, refused stale controls,
// then two explicit receipt READs. The backend is a store double. Its one booking is synthetic,
// not evidence of a real provider effect. Counting visible text measures the symptom only;
// intents.test.mjs separately proves identity is action_receipt_ref, never display text.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');

// The wire: only `fetch` is replaced, so the production transport (`src/net/client.ts`) and both
// production projections run for real between the backend body and the runtime.
const wire = [];
let route = () => {
  throw new Error('no route installed');
};
globalThis.fetch = async (url, init = {}) => {
  const req = { url: String(url), body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined, signal: init.signal };
  wire.push(req);
  return route(req);
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const { render } = await import('../src/renderer/render.ts');
const { createShellRuntime } = await import('../src/shell/shell.ts');
const { createLiveSubmission } = await import('../src/shell/intents.ts');
const { createNet } = await import('../src/net/session.ts');

const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const load = (id) => JSON.parse(fs.readFileSync(path.join(FIXTURES, INDEX.fixtures.find((f) => f.id === id).file), 'utf8'));

// Keep the actual fixture's NONE escape. Do not invent a tokened CONTROL for a spent PWA card.
const card = load('kind-booking-confirmation');

const COMMIT_REF = 'i1';
const DISMISS_REF = 'i9';
const CONFIRMED_TEXT = 'Запись подтверждена.';
const RECEIPT_UUID = '483ed7f8-6c1a-4f52-9b3d-70e2a5c81d94';

// ── the backend, as a store (widgets.controller.ts + the intent-audit store, transcribed) ───────
const store = {
  bookings: [],               // the canonical business effect
  receipts: [],               // {outcome, action_receipt_ref} rows, in order
  terminalLines: [],          // terminalLinesJson: the widget's CURRENT terminal set, not a log
  rereads: 0,
};
const tokenOf = (ref) => card.intents.find((i) => i.intent_ref === ref).intent_token;

const TENANT_ID = 'c1a4f0de-0b8e-4a55-9d0e-7a1d2f3e4b5c';
const LOGIN_OK = {
  access_token: 'eyJhbGciOiJIUzI1NiJ9.access-2.sig',
  refresh_token: `maya_rt_00000000-0000-4000-8000-000000000002.${'s'.repeat(42)}2`,
  token_type: 'Bearer',
  expires_in: 900,
  refresh_expires_at: '2026-10-17T10:00:00.000Z',
  session: { id: '4b3a2c1d-0e9f-48a7-b6c5-d4e3f2a1b0c9', device_name: 'Chrome on macOS', status: 'active', is_current: true, created_at: '2026-09-17T09:59:59.000Z', last_used_at: '2026-09-17T09:59:59.000Z', expires_at: '2026-10-17T10:00:00.000Z', revoked_at: null, revoke_reason: null },
  user: { id: '9e8d7c6b-5a49-4f3e-8d2c-1b0a99887766', tenant_id: TENANT_ID, branch_id: null, email: 'owner@example.ru', phone: '+79990001122', name: 'Стас', role: 'owner', status: 'active', profile_completed: true, missing_profile_fields: [], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', tenant: { id: TENANT_ID, name: 'Мужская Эстетика', slug: 'male-esthetic', status: 'active' }, branch: null },
};

route = async (req) => {
  if (req.url === '/api/auth/login') return json(201, LOGIN_OK);
  if (req.url === '/api/widgets/intent') {
    if (req.body.intent_token === tokenOf(COMMIT_REF)) {
      // AE COMMIT: one booking, one receipt carrying the canonical reference, one CONFIRMED line.
      store.bookings.push({ id: 'appt-1' });
      store.receipts.push({ outcome: 'ACCEPTED', action_receipt_ref: RECEIPT_UUID });
      store.terminalLines = [{ outcome: 'CONFIRMED', text: CONFIRMED_TEXT, action_receipt_ref: RECEIPT_UUID }];
      return json(200, { contract: 'maya.widget.intent/1', outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED' });
    }
    throw new Error('the probe sent an unexpected intent token');
  }
  if (req.url === '/api/widgets/resolve') {
    // POST /api/widgets/resolve returns the HistorisedWidget: the widget's terminal-line SET as it
    // stands now. COMMIT's initial read and explicit receipt READ see the same canonical fact.
    store.rereads += 1;
    return json(200, { contract: 'maya.widget.resolve/1', tenant_bound: true, widgets: [{ envelope: card, terminal_lines: store.terminalLines.map((l) => ({ ...l })), reread_intent: null }] });
  }
  throw new Error(`the probe sent an unexpected request: ${req.url}`);
};

const net = createNet({ now: () => Date.parse('2026-09-17T10:00:00.000Z') });
const signIn = await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9');
if (signIn.step !== 'signed_in') throw new Error(`the probe could not sign in: ${JSON.stringify(signIn)}`);

let rerender = () => {};
const runtime = createShellRuntime({
  transport: net.transport,
  session: net.session,
  render,
  environment: { a11y: () => ({ reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false }), onA11yChange: callback => { rerender = callback; return () => {}; }, fragment: () => '' },
  scheduler: { now: () => Date.parse(INDEX.now), after: () => () => undefined },
  history: { push: () => undefined, back: () => undefined, onBack: () => () => undefined },
  newAbort: () => new AbortController(),
  submission: createLiveSubmission(net.transport),
  newId: () => 'nonce-l27-000001',
});

// ── Confirm, refuse spent controls, explicitly read the same receipt twice ────────────────────────
const items = () => runtime.conversation.view().items;
const assistantLines = () => items().filter((i) => i.kind === 'assistant').map((i) => i.text);
const widgetItem = (id) => items().find((i) => i.id === id);

const originalHash = card.integrity.body_hash;
const originalLifecycle = JSON.stringify(card.lifecycle);
const { itemId } = runtime.widgets.ingest(card);
const commit = await runtime.widgets.activate(itemId, `intent:${COMMIT_REF}`);
const afterCommit = { lines: assistantLines(), display: widgetItem(itemId).display, counters: runtime.widgets.counters(), mode: widgetItem(itemId).result.mode };
const dismissOutcome = await runtime.widgets.activate(itemId, `intent:${DISMISS_REF}`);
const afterDismiss = { lines: assistantLines(), display: widgetItem(itemId).display, counters: runtime.widgets.counters() };
// Accessibility rerender cannot revive the original controls or spendable tokens.
rerender();
const again = await runtime.widgets.activate(itemId, `intent:${DISMISS_REF}`);
const afterAgain = { lines: assistantLines(), display: widgetItem(itemId).display, counters: runtime.widgets.counters() };
const duplicateCommit = await runtime.widgets.activate(itemId, `intent:${COMMIT_REF}`);
const readsBefore = store.rereads;
const wireBeforeRead = wire.length;
await runtime.widgets.refreshBookingReceipt(itemId);
await runtime.widgets.refreshBookingReceipt(itemId);
const readWire = wire.slice(wireBeforeRead);
const afterRead = { lines: assistantLines(), counters: runtime.widgets.counters(),
  refresh: widgetItem(itemId).receiptRefresh, mode: widgetItem(itemId).result.mode,
  controls: widgetItem(itemId).result.readingOrder, tokens: runtime.widgets.heldTokens() };

runtime.dispose();

// ── the report ──────────────────────────────────────────────────────────────────────────────────
const steps = [];
const step = (label, actual, expected) => steps.push({ label, actual, ok: isDeepStrictEqual(actual, expected), expected });

step('COMMIT activation', commit.outcome, 'dismissed');
step('after COMMIT: visible terminal outcomes', afterCommit.lines.length, 1);
step('after COMMIT: display', afterCommit.display, 'terminal');

step('after COMMIT: static factual preview', afterCommit.mode, 'frozen_prose');
step('spent DISMISS refused', dismissOutcome, { outcome: 'ignored', reason: 'not_drawn' });
step('spent DISMISS: no lifecycle transition', afterDismiss.counters.stateChanges - afterCommit.counters.stateChanges, 0);
step('spent DISMISS: no submission', afterDismiss.counters.submissions - afterCommit.counters.submissions, 0);
step('DISMISS leaves no silent outcome (sentences)', afterDismiss.counters.sentences, 0);
step('after DISMISS: display', afterDismiss.display, 'terminal');
step('after DISMISS: assistant lines', afterDismiss.lines, [CONFIRMED_TEXT]);
step('after DISMISS: visible terminal outcome count', afterDismiss.lines.length, 1);

step('repeated DISMISS: visible terminal outcome count', afterAgain.lines.length, 1);
step('rerendered DISMISS remains refused', again, { outcome: 'ignored', reason: 'not_drawn' });
step('duplicate COMMIT remains refused', duplicateCommit, { outcome: 'ignored', reason: 'not_drawn' });
step('explicit receipt reads', store.rereads - readsBefore, 2);
step('explicit reads use exact existing widget route', readWire.map(r => ({ url: r.url, body: r.body })),
  [0, 1].map(() => ({ url: '/api/widgets/resolve', body: { thread_page: { limit: 20 }, booking_receipt: { widget_id: card.widget_id } } })));
step('READ leaves one visible terminal outcome', afterRead.lines, [CONFIRMED_TEXT]);
step('READ does not activate or submit', afterRead.counters, afterCommit.counters);
step('receipt remains manually readable', afterRead.refresh, 'available');
step('READ retains frozen preview', afterRead.mode, 'frozen_prose');
step('READ never restores card controls', afterRead.controls, []);
step('no spendable tokens retained', afterRead.tokens, 0);
step('sealed body hash unchanged', card.integrity.body_hash, originalHash);
step('sealed lifecycle unchanged', JSON.stringify(card.lifecycle), originalLifecycle);

step('BUSINESS EFFECT COUNT (booking records)', store.bookings.length, 1);
step('RECEIPT COUNT (canonical, with a reference)', store.receipts.filter((r) => r.action_receipt_ref !== null).length, 1);
step('exactly one mutation receipt', store.receipts, [{ outcome: 'ACCEPTED', action_receipt_ref: RECEIPT_UUID }]);
step('durable terminal lines (terminalLinesJson)', store.terminalLines.length, 1);
step('no contradictory line reached the conversation', afterAgain.lines.every((t) => t === CONFIRMED_TEXT), true);

const pad = (s) => `${s} ${'.'.repeat(Math.max(2, 54 - s.length))}`;
console.log('L27 PROBE — COMMIT → frozen preview → explicit READ, one canonical outcome\n');
for (const s of steps) console.log(`  ${pad(s.label)} ${JSON.stringify(s.actual)}  ${s.ok ? 'PASS' : `FAIL (expected ${JSON.stringify(s.expected)})`}`);
const failed = steps.filter((s) => !s.ok);
console.log(`\nL27: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length} of ${steps.length})`}`);
process.exit(failed.length === 0 ? 0 : 1);
