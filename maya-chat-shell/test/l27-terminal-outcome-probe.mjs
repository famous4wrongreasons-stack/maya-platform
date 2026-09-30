// L27 — the exact certification probe: one canonical terminal outcome, one visible terminal outcome.
//
//   node test/l27-terminal-outcome-probe.mjs
//
// This is the clause-4 measurement of WIDGET-GATE-FBE2E-CLOSURE.md §7.3, run headlessly. The real
// shell runtime presses **Confirm booking** and then **Dismiss** on the same card, over the real
// `createLiveSubmission`, the real renderer and the real fullscreen chrome. The certified backend is
// transcribed as a store double, so the numbers it reports about business state — booking records
// and receipts — are the store's own counts, not assertions about a display.
//
// What §7.3 measured with the fix applied:
//   assistantLines: ['Запись подтверждена.', 'Запись подтверждена.']   ← L27
//   display: 'terminal';  activations 4→5, submissions 4→5, stateChanges 4→5, sentences 0
//
// NOTE ON METHOD. This probe counts visible outcomes by TEXT, because that is what the certification
// read off the screen and what the owner reported. The FIX may not: deduplicating by display text is
// prohibited. The probe measures the symptom; `test/intents.test.mjs` proves the rule.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const { bodyHash } = await import('../src/integrity/h7.ts');
const { createShellRuntime } = await import('../src/shell/shell.ts');
const { createLiveSubmission } = await import('../src/shell/intents.ts');
const { createNet } = await import('../src/net/session.ts');

const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const reseal = (env) => ((env.integrity.body_hash = bodyHash(env)), env);
const load = (id) => JSON.parse(fs.readFileSync(path.join(FIXTURES, INDEX.fixtures.find((f) => f.id === id).file), 'utf8'));

// ── the card: the certified booking confirmation, whose escape is the canonical CONTROL dismiss ──
//
// The fixture's own `i9` is the NONE escape (dismissed locally, nothing sent). The production card
// the certification pressed carries the submitting escape: effect CONTROL, the closed capability
// `CONTROL:control.widget.dismiss`, its own minted token. Its receipt is written and is ACCEPTED,
// and it adjudicates only itself — `action_receipt_ref: null`.
const card = load('kind-booking-confirmation');
const dismiss = card.intents.find((i) => i.intent_ref === 'i9');
dismiss.effect = 'CONTROL';
dismiss.intent_token = 'q4Lm2Xv8-TbN7eR1_wY6pK0sHgZcD3fA';
dismiss.capability = { space: 'CONTROL', key: 'control.widget.dismiss' };
reseal(card);

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
    if (req.body.intent_token === tokenOf(DISMISS_REF)) {
      // The escape: admitted, its own receipt row, adjudicating only itself. It writes NO new line —
      // clause 3 measured `terminalLinesJson` as still exactly the COMMIT's one element. Its
      // `resolved_widget` is the control acknowledgement, which is not an envelope, so the
      // projection carries it as null and this reply is an ordinary ACCEPTED.
      store.receipts.push({ outcome: 'ACCEPTED', action_receipt_ref: null });
      return json(200, { contract: 'maya.widget.intent/1', outcome: 'terminate', code: null, next_envelope: null, resolved_widget: { control: 'dismissed' }, receipt_outcome: 'ACCEPTED' });
    }
    throw new Error('the probe sent an unexpected intent token');
  }
  if (req.url === '/api/widgets/resolve') {
    // POST /api/widgets/resolve returns the HistorisedWidget: the widget's terminal-line SET as it
    // stands now. It is answered identically for the COMMIT and for the dismiss.
    store.rereads += 1;
    return json(200, { contract: 'maya.widget.resolve/1', tenant_bound: true, widgets: [{ envelope: card, terminal_lines: store.terminalLines.map((l) => ({ ...l })), reread_intent: null }] });
  }
  throw new Error(`the probe sent an unexpected request: ${req.url}`);
};

const net = createNet({ now: () => Date.parse('2026-09-17T10:00:00.000Z') });
const signIn = await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9');
if (signIn.step !== 'signed_in') throw new Error(`the probe could not sign in: ${JSON.stringify(signIn)}`);

const runtime = createShellRuntime({
  transport: net.transport,
  session: net.session,
  render,
  environment: { a11y: () => ({ reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false }), onA11yChange: () => () => undefined, fragment: () => '' },
  scheduler: { now: () => Date.parse(INDEX.now), after: () => () => undefined },
  history: { push: () => undefined, back: () => undefined, onBack: () => () => undefined },
  newAbort: () => new AbortController(),
  submission: createLiveSubmission(net.transport),
  newId: () => 'nonce-l27-000001',
});

// ── press Confirm, then Dismiss ─────────────────────────────────────────────────────────────────
const items = () => runtime.conversation.view().items;
const assistantLines = () => items().filter((i) => i.kind === 'assistant').map((i) => i.text);
const widgetItem = (id) => items().find((i) => i.id === id);

const { itemId } = runtime.widgets.ingest(card);
const commit = await runtime.widgets.activate(itemId, `intent:${COMMIT_REF}`);
const afterCommit = { lines: assistantLines(), display: widgetItem(itemId).display, counters: runtime.widgets.counters() };
const dismissOutcome = await runtime.widgets.activate(itemId, `intent:${DISMISS_REF}`);
const afterDismiss = { lines: assistantLines(), display: widgetItem(itemId).display, counters: runtime.widgets.counters() };
// Repeated dismiss: the owner requires the count to stay at one.
const again = await runtime.widgets.activate(itemId, `intent:${DISMISS_REF}`);
const afterAgain = { lines: assistantLines(), display: widgetItem(itemId).display, counters: runtime.widgets.counters() };

runtime.dispose();

// ── the report ──────────────────────────────────────────────────────────────────────────────────
const steps = [];
const step = (label, actual, expected) => steps.push({ label, actual, ok: JSON.stringify(actual) === JSON.stringify(expected), expected });

step('COMMIT activation', commit.outcome, 'dismissed');
step('after COMMIT: visible terminal outcomes', afterCommit.lines.length, 1);
step('after COMMIT: display', afterCommit.display, 'terminal');

step('DISMISS activation', dismissOutcome.outcome, 'dismissed');
step('DISMISS still moves lifecycle (stateChanges)', afterDismiss.counters.stateChanges - afterCommit.counters.stateChanges, 1);
step('DISMISS still submits', afterDismiss.counters.submissions - afterCommit.counters.submissions, 1);
step('DISMISS leaves no silent outcome (sentences)', afterDismiss.counters.sentences, 0);
step('after DISMISS: display', afterDismiss.display, 'terminal');
step('after DISMISS: assistant lines', afterDismiss.lines, [CONFIRMED_TEXT]);
step('after DISMISS: visible terminal outcome count', afterDismiss.lines.length, 1);

step('repeated DISMISS: visible terminal outcome count', afterAgain.lines.length, 1);
step('repeated DISMISS: still dismissed', again.outcome, 'dismissed');

step('BUSINESS EFFECT COUNT (booking records)', store.bookings.length, 1);
step('RECEIPT COUNT (canonical, with a reference)', store.receipts.filter((r) => r.action_receipt_ref !== null).length, 1);
step('receipt rows in order', store.receipts, [{ outcome: 'ACCEPTED', action_receipt_ref: RECEIPT_UUID }, { outcome: 'ACCEPTED', action_receipt_ref: null }, { outcome: 'ACCEPTED', action_receipt_ref: null }]);
step('durable terminal lines (terminalLinesJson)', store.terminalLines.length, 1);
step('no contradictory line reached the conversation', afterAgain.lines.every((t) => t === CONFIRMED_TEXT), true);

const pad = (s) => `${s} ${'.'.repeat(Math.max(2, 54 - s.length))}`;
console.log('L27 PROBE — COMMIT → CONFIRMED → DISMISS, one canonical outcome\n');
for (const s of steps) console.log(`  ${pad(s.label)} ${JSON.stringify(s.actual)}  ${s.ok ? 'PASS' : `FAIL (expected ${JSON.stringify(s.expected)})`}`);
const failed = steps.filter((s) => !s.ok);
console.log(`\nL27: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length} of ${steps.length})`}`);
process.exit(failed.length === 0 ? 0 : 1);
