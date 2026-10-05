import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertProofBrokerBody } from './proof-broker-contract.mjs';
test('broker preflight rejects observed request before transport and counts UTF8 bytes', () => {
  assert.throws(() => assertProofBrokerBody('x'.repeat(79230)), /proof_broker_body_limit/);
  assert.throws(() => assertProofBrokerBody('я'.repeat(32769)), /proof_broker_body_limit/);
  assert.doesNotThrow(() => assertProofBrokerBody('x'.repeat(65536)));
  assert.throws(() => assertProofBrokerBody(''), /proof_broker_body_limit/);
});
