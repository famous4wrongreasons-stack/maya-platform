import assert from 'node:assert/strict';
import test from 'node:test';
import { check } from '../../evidence/maya-chat-first-ux/gate-audit-check.mjs';
import { CHANGED_CLAUSES, HANDOFF_STOP, loadV13Audit, prepareAudit, prepareUProofs, V14_HASH, WITHDRAWN_APPROVAL_U } from './prepare-audit.mjs';

test('historical receipts still validate only with their historical contract', () => {
  const prior = loadV13Audit();
  const fresh = prepareAudit();
  assert.deepEqual(check(prior), []);
  assert.notDeepEqual(check({ ...prior, contractBytes: fresh.contractBytes }), []);
  assert.notEqual(prior.audit.against.sha256, V14_HASH);
});

test('V1.4 preserves every obligation ID and updates the nine reviewed summaries only', () => {
  const prior = loadV13Audit().inventory.gates.flatMap(g => g.clauses);
  const fresh = prepareAudit().inventory.gates.flatMap(g => g.clauses);
  assert.deepEqual(fresh.map(c => c.key), prior.map(c => c.key));
  assert.equal(fresh.length, 165);
  assert.deepEqual(fresh.filter((c, i) => c.text !== prior[i].text).map(c => c.key).sort(), Object.keys(CHANGED_CLAUSES).sort());
  assert.equal(Object.keys(CHANGED_CLAUSES).length, 9);
});

test('fresh baseline inherits no conformance, evidence, mutation result or release authority', () => {
  const { audit } = prepareAudit();
  const clauses = audit.gates.flatMap(g => Object.entries(g.clauses));
  assert.equal(clauses.filter(([, c]) => c.state === 'false').length, 163);
  assert.deepEqual(clauses.filter(([, c]) => c.state.startsWith('STOPPED:')).map(([id]) => id), HANDOFF_STOP);
  for (const [, c] of clauses) {
    assert.equal(c.conforms, false);
    assert.deepEqual(c.evidence, []);
    assert.deepEqual(c.mutants, []);
  }
  assert.equal(audit.activation.certificate_for_current_release, 'NOT_ISSUED');
  assert.equal(audit.activation.fullContractCertified, false);
  assert.equal(audit.activation.scheduleEditor, 'NOT_USER_REACHABLE');
});

test('reachable F74a approval cannot inherit a whole-clause absence claim', () => {
  const clauses = new Map(prepareAudit().audit.gates.flatMap(g => Object.entries(g.clauses)));
  const { map, e1 } = prepareUProofs();
  for (const id of WITHDRAWN_APPROVAL_U) {
    assert.equal(clauses.get(id).u_candidate, undefined);
    assert.equal(clauses.get(id).u_basis, undefined);
    assert.equal(clauses.get(id).state, 'false');
    assert.equal(map.proofs.some(p => p.clause === id), false);
    assert.equal(e1.proofs.some(p => p.clause === id), false);
  }
  assert.equal(map.proofs.length, 16);
  assert.equal(e1.proofs.length, 11);
  for (const proof of map.proofs) {
    const row = clauses.get(proof.clause);
    assert.equal(row.u_candidate, true);
    assert.ok(proof.basis.includes(row.u_basis ?? row.u_candidate_scope));
  }
});
