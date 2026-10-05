import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertProofBrokerBody } from './proof-broker-contract.mjs';
test('broker preflight admits canonical request within 96KiB and refuses excess UTF8 bytes', () => {
  assert.doesNotThrow(() => assertProofBrokerBody('x'.repeat(79230)));
  assert.throws(() => assertProofBrokerBody('x'.repeat(98305)), /proof_broker_body_limit/);
  assert.throws(() => assertProofBrokerBody('я'.repeat(49153)), /proof_broker_body_limit/);
  assert.doesNotThrow(() => assertProofBrokerBody('x'.repeat(98304)));
  assert.throws(() => assertProofBrokerBody(''), /proof_broker_body_limit/);
});
