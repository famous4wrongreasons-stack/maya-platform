// Controls for successor-verify.mjs. A verifier that only ever agrees proves nothing, so each branch
// is shown refusing, and each refusal is paired with a positive control that the same branch accepts.
//
// Run: node --test docs/rebuild/evidence/maya-chat-first-ux/successor-verify.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImplementation, verifySuccessor, isPresentation } from './successor-verify.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const impl = loadImplementation(repo);

// S-013 is a pwa screen; S-339 is a backend controller. Both kinds come from the signed dossier.
const SCREEN = 'S-013';
const CONTROLLER = 'S-339';

test('C9: a registered key with a policy row resolves; an unregistered key does not', () => {
  assert.equal(verifySuccessor(impl, { id: SCREEN, successorType: 'C9', ref: 'catalog.services.read' }).resolved, true);
  const v = verifySuccessor(impl, { id: SCREEN, successorType: 'C9', ref: 'catalog.services.list' });
  assert.equal(v.resolved, false);
  assert.match(v.why, /not a registered C9 capability/);
});

test('ROUTE: a registered route resolves for a presentation surface', () => {
  assert.equal(verifySuccessor(impl, { id: SCREEN, successorType: 'ROUTE', ref: 'fs.catalogue' }).resolved, true);
  assert.match(verifySuccessor(impl, { id: SCREEN, successorType: 'ROUTE', ref: 'fs.shop' }).why, /not a shell route/);
});

test('ROUTE: refused as the successor of a non-presentation component', () => {
  assert.equal(isPresentation(impl.surfaces[CONTROLLER]), false);
  const v = verifySuccessor(impl, { id: CONTROLLER, successorType: 'ROUTE', ref: 'account' });
  assert.equal(v.resolved, false);
  assert.match(v.why, /a route cannot succeed/);
  // The same controller may be succeeded by a capability.
  assert.equal(verifySuccessor(impl, { id: CONTROLLER, successorType: 'C9', ref: 'catalog.services.read' }).resolved, true);
});

test('MULTI: one ABSENT served function leaves the whole row unresolved', () => {
  const ok = [{ function: 'services', type: 'C9', ref: 'catalog.services.read' }, { function: 'team', type: 'C9', ref: 'catalog.staff.read' }];
  assert.equal(verifySuccessor(impl, { id: SCREEN, successorType: 'MULTI', components: ok }).resolved, true);
  const v = verifySuccessor(impl, { id: SCREEN, successorType: 'MULTI', components: [...ok, { function: 'shop', type: 'ABSENT', ref: null }] });
  assert.equal(v.resolved, false);
  assert.match(v.why, /1\/3 served functions have no successor: shop/);
});

test('AE_BOOKING: only allowlisted commit keys resolve', () => {
  assert.equal(verifySuccessor(impl, { id: SCREEN, successorType: 'AE_BOOKING', ref: 'crm.appointment.create.v1' }).resolved, true);
  assert.equal(verifySuccessor(impl, { id: SCREEN, successorType: 'AE_BOOKING', ref: 'crm.appointment.delete.v1' }).resolved, false);
});

test('FENCE: symbol must exist, refuse, and be bound by a test that reaches its module', () => {
  const good = { id: 'S-635', successorType: 'FENCE', file: 'maya-saas-backend/src/crm/client-channel-runtime.service.ts', symbol: 'submitConsent', line: 187 };
  assert.equal(verifySuccessor(impl, good).resolved, true);
  assert.match(verifySuccessor(impl, { ...good, symbol: 'submitConsentEverywhere' }).why, /does not appear/);
  assert.match(verifySuccessor(impl, { ...good, file: 'maya-saas-backend/src/crm/nope.ts' }).why, /does not exist/);
  assert.match(verifySuccessor(impl, { ...good, file: 'ai администратор/webhook_server.py', symbol: 'consent_submit_handler', line: null }).why, /must live in maya-saas-backend\/src/);
});

test('LEGACY_ONLY_FENCE, NONE_SIGNED, ABSENT and AMBIGUOUS never resolve', () => {
  for (const successorType of ['NONE_SIGNED', 'ABSENT', 'AMBIGUOUS', 'SOMETHING_ELSE'])
    assert.equal(verifySuccessor(impl, { id: SCREEN, successorType }).resolved, false);
  assert.equal(verifySuccessor(impl, undefined).resolved, false);
});

// ── controls a mutation battery showed were missing ──────────────────────────────────────────────
// With today's data every C9 key HAS a policy row and every good fence IS tested, so deleting either
// check changed no verdict above. An injected implementation makes each check the only thing between
// a proposal and a green row.

test('C9: a registered key WITHOUT a policy row does not resolve', () => {
  const v = verifySuccessor({ ...impl, policy: {} }, { id: SCREEN, successorType: 'C9', ref: 'catalog.services.read' });
  assert.equal(v.resolved, false);
  assert.match(v.why, /no WIDGET_CAPABILITY_POLICY row/);
});

test('FENCE: a real, refusing fence that no test binds is located, not proven', () => {
  const good = { id: 'S-635', successorType: 'FENCE', file: 'maya-saas-backend/src/crm/client-channel-runtime.service.ts', symbol: 'submitConsent', line: 187 };
  const v = verifySuccessor({ ...impl, tests: [] }, good);
  assert.equal(v.resolved, false);
  assert.equal(v.located, true);
  assert.match(v.why, /located is not proven/);
  // A test that names the symbol but never reaches the module does not bind it either.
  const unbound = verifySuccessor({ ...impl, tests: [{ file: 'x.spec.ts', text: 'submitConsent' }] }, good);
  assert.equal(unbound.resolved, false);
  assert.equal(verifySuccessor(impl, good).successor, 'FENCE:maya-saas-backend/src/crm/client-channel-runtime.service.ts#submitConsent');
});

test('LEGACY_ONLY_FENCE: even a located, refusing, tested legacy fence does not resolve', () => {
  const legacy = { id: 'S-635', successorType: 'LEGACY_ONLY_FENCE', file: 'maya-saas-backend/src/crm/client-channel-runtime.service.ts', symbol: 'submitConsent', line: 187 };
  const v = verifySuccessor(impl, legacy);
  assert.equal(v.resolved, false);
  assert.match(v.why, /enforced only in legacy/);
});

test('FENCE: a tested symbol whose code refuses nothing is not a fence', () => {
  // principal.util.ts hashes a principal and refuses nothing. With a test injected that binds it, the
  // refusal check is the only thing left to say no.
  const hashOnly = { id: 'S-635', successorType: 'FENCE', file: 'maya-saas-backend/src/widgets/principal.util.ts', symbol: 'principalProofHash', line: 14 };
  const v = verifySuccessor({ ...impl, tests: [{ file: 'x.spec.ts', text: 'principalProofHash from principal.util' }] }, hashOnly);
  assert.equal(v.resolved, false);
  assert.match(v.why, /no refusal within 60 lines/);
});
