// NS-1 — the exact parent-return roundtrip, end to end.
//
//   node test/ns1-roundtrip-probe.mjs
//
// This is the probe the final certification ran, in the same vocabulary. It is NOT a unit test: the
// whole chain is the real one — an HTTP 200 body, `src/net/client.ts`, `projectWidgetIntent`,
// `createLiveSubmission`, `createShellRuntime`, the real renderer and the real fullscreen chrome.
// Only `fetch` is replaced, so the bodies below are the only thing standing in for the backend.
//
// The defect it measures: the backend answered ACCEPTED with the canonical parent in
// `resolved_widget`, the runtime projection dropped the member, and the open detail stayed on screen
// with no parent to return to.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SH = path.resolve(HERE, '..');

// ── the wire: one route table, nothing leaves the process ──────────────────────────────────────
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
const { projectWidgetIntent } = await import('../src/net/project.ts');

// ── the corpus: a journal parent, its detail, and the parent the server re-resolves ────────────
const FIXTURES = path.join(SH, 'dev', 'fixtures', 'envelopes');
const INDEX = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'index.json'), 'utf8'));
const reseal = (env) => ((env.integrity.body_hash = bodyHash(env)), env);
const load = (id) => JSON.parse(fs.readFileSync(path.join(FIXTURES, INDEX.fixtures.find((f) => f.id === id).file), 'utf8'));

const RETURNED_HEADLINE = 'Журнал · родитель от сервера';
const parentEnvelope = load('kind-schedule');
const detailEnvelope = reseal(Object.assign(structuredClone(parentEnvelope), {
  widget_id: '01M2Q9G7M0AAAAAAAAAAAAAAAA',
}));
detailEnvelope.correlation.parent_widget_id = parentEnvelope.widget_id;
// The return control the journal detail draws: a NAVIGATE the server re-resolves (class 'w'). The
// client names no parent and no route; it only says "this intent, from this widget".
detailEnvelope.intents[0].target = { class: 'w', ref: 'w.journal.parent' };
reseal(detailEnvelope);
const resolvedParent = structuredClone(parentEnvelope);
resolvedParent.presentation.text_equivalent.headline = RETURNED_HEADLINE;
reseal(resolvedParent);

// ── the backend, transcribed (auth-session.service.ts buildSessionTokens; widgets.controller.ts) ─
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
// widgets.controller.ts:108 — `resolved_widget: route?.resolved_widget ?? null`, beside the
// successor slot, on an ACCEPTED receipt.
const intentReply = (over) => ({ contract: 'maya.widget.intent/1', outcome: 'terminate', code: null, next_envelope: null, resolved_widget: null, receipt_outcome: 'ACCEPTED', ...over });

const served = [];
route = async (req) => {
  if (req.url === '/api/auth/login') return json(201, LOGIN_OK);
  if (req.url === '/api/widgets/intent') {
    const leg = req.body.widget_id === detailEnvelope.widget_id ? 'return' : 'open';
    const body = leg === 'return'
      ? intentReply({ resolved_widget: resolvedParent })
      : intentReply({ next_envelope: detailEnvelope });
    served.push({ leg, status: 200, body });
    return json(200, body);
  }
  throw new Error(`the probe sent an unexpected request: ${req.url}`);
};

// ── the runtime, composed as the entry composes it ─────────────────────────────────────────────
let clock = Date.parse(INDEX.now);
const net = createNet({ now: () => Date.parse('2026-09-17T10:00:00.000Z') });
assert.equal((await net.session.signInPassword('male-esthetic', 'owner@example.ru', 'correct-horse-9')).step, 'signed_in');

const history = { pushes: 0, backs: 0 };
const runtime = createShellRuntime({
  transport: net.transport,
  session: net.session,
  render,
  environment: { a11y: () => ({ reduced_motion: false, forced_colors: false, text_scale: 1, pointer: 'fine', keyboard_only_hint: false, caption_preference: false }), onA11yChange: () => () => undefined, fragment: () => '' },
  scheduler: { now: () => clock, after: () => () => undefined },
  history: { push: () => (history.pushes += 1), back: () => (history.backs += 1), onBack: () => () => undefined },
  newAbort: () => new AbortController(),
  submission: createLiveSubmission(net.transport),
  newId: () => 'nonce-probe-000001',
});

// ── the roundtrip ──────────────────────────────────────────────────────────────────────────────
const steps = [];
const step = (label, actual, expected) => {
  const ok = actual === expected;
  steps.push({ label, actual, ok });
  return ok;
};
const items = () => runtime.conversation.view().items;
const widgetItem = (id) => items().find((i) => i.id === id);

const { itemId, verdict } = runtime.widgets.ingest(parentEnvelope);
step('journal parent ingested', verdict, 'valid');
const shownBefore = widgetItem(itemId).result.textEquivalent.headline;

const opening = await runtime.widgets.activate(itemId, 'intent:i1');
step('1. NAVIGATE parent → detail', opening.outcome, 'dismissed');
const open = runtime.shell.view().fullscreen;
step('2. fullscreen opens', open?.phase ?? 'none', 'open');
const detailItemId = open.itemId;

const returning = await runtime.widgets.activate(detailItemId, 'intent:i1');
const leg = served.find((s) => s.leg === 'return');
step('3. detail → parent: backend HTTP', leg.status, 200);
step('4. backend result', leg.body.receipt_outcome, 'ACCEPTED');
step('5. resolved_widget parent', leg.body.resolved_widget === null ? 'ABSENT' : 'PRESENT', 'PRESENT');
// Measured on the boundary itself, not inferred from what happened afterwards: this is the member
// the certification watched disappear.
const projected = projectWidgetIntent(leg.body);
step('6. runtime projection', projected?.resolved_widget == null ? 'DROPS resolved_widget' : 'PRESERVES resolved_widget', 'PRESERVES resolved_widget');
// The discriminator between a return and an ordinary acknowledgement: the return path answers from
// `resolved_widget` and stops, while an acknowledgement goes on to reread the thread page.
const reread = wire.some((r) => r.url === '/api/widgets/resolve');
step('7. parent restored through the return path', returning.outcome === 'dismissed' && !reread ? 'RETURNED' : reread ? 'NOT TAKEN (fell through to the thread-page reread)' : `NOT TAKEN (${returning.sentence ?? returning.reason ?? returning.outcome})`, 'RETURNED');
step('8. fullscreen detail after return', runtime.shell.view().fullscreen === null ? 'CLOSED' : 'STILL OPEN', 'CLOSED');
const after = widgetItem(itemId).result.textEquivalent.headline;
step('9. timeline parent is the server result', after === RETURNED_HEADLINE ? 'SERVER resolved_widget' : `NOT the server's (${after === shownBefore ? 'unchanged' : 'other'})`, 'SERVER resolved_widget');
step('10. timeline widget items', items().filter((i) => i.kind === 'widget').length, 1);
step('11. detail entry released', (await runtime.widgets.activate(detailItemId, 'intent:i1')).reason ?? 'still live', 'unknown_item');
step('12. focus owner released', runtime.shell.state().opener, null);
step('13. history: one push, one back', `${history.pushes}/${history.backs}`, '1/1');
step('14. submissions sent', wire.filter((r) => r.url === '/api/widgets/intent').length, 2);
step('15. no chat or reread traffic', wire.filter((r) => r.url !== '/api/widgets/intent' && r.url !== '/api/auth/login').length, 0);

runtime.dispose();

const pad = (s) => `${s} ${'.'.repeat(Math.max(2, 48 - s.length))}`;
console.log('NS-1 ROUNDTRIP PROBE — detail → canonical parent return\n');
for (const s of steps) console.log(`  ${pad(s.label)} ${String(s.actual)}  ${s.ok ? 'PASS' : 'FAIL'}`);
const failed = steps.filter((s) => !s.ok);
console.log(`\nNS-1 ROUNDTRIP: ${failed.length === 0 ? 'PASS' : `FAIL (${failed.length} of ${steps.length})`}`);
process.exit(failed.length === 0 ? 0 : 1);
