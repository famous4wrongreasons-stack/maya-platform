import assert from 'node:assert/strict';
import test from 'node:test';
import { proofCommands, proofEnvironment } from './c9-occupancy-proof.mjs';

const input = {
  pgBin: '/owned/bin', cluster: '/tmp/owned/pg', log: '/tmp/evidence/pg.log',
  port: 45678, database: 'maya_widget_gate_proof_c9occ_abcdef',
  receipt: '/tmp/private/receipt.json', output: '/tmp/evidence', crmSetup: true,
};
test('A17 operation proof has only two serial HTTP stages and a real PG restart', () => {
  const commands = proofCommands(input);
  assert.deepEqual(commands.map(command => command.name), ['initdb', 'pg-start', 'createdb', 'migrations', 'react-web-build', 'prepare', 'pg-restart', 'resume']);
  for (const index of [5, 7]) {
    assert.ok(commands[index].args.includes('test/widgets-live/crm-a17-operation-restart.probe-spec.ts'));
    assert.ok(commands[index].args.includes('--runInBand'));
    assert.equal(commands[index].env.JEST_C9_OCCUPANCY_RECEIPT, input.receipt);
  }
  assert.equal(commands[5].env.JEST_C9_OCCUPANCY_STAGE, 'prepare');
  assert.equal(commands[7].env.JEST_C9_OCCUPANCY_STAGE, 'resume');
  assert.equal(commands[5].timeoutMs, 270000);
  assert.ok(commands[6].args.includes('restart'));
  const env = proofEnvironment({ UNRELATED_SECRET: 'must-not-copy' }, 'postgresql://c9_proof@127.0.0.1:45678/maya_widget_gate_proof_c9occ_abcdef');
  assert.equal(env.NODE_OPTIONS, '--max-old-space-size=3072');
  assert.equal(env.UNRELATED_SECRET, undefined);
});
test('A17 operation proof cannot broaden into another proof mode', () => {
  for (const option of ['browser', 'branchBinding', 'compound']) {
    assert.throws(() => proofCommands({ ...input, [option]: true }), /isolated HTTP mode/);
  }
});
