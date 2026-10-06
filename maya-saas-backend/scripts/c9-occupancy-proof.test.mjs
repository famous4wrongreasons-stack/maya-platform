import assert from 'node:assert/strict';
import test from 'node:test';
import { proofCommands, proofEnvironment } from './c9-occupancy-proof.mjs';
import { occupancyFixtureEdge } from '../test/widgets-live/support/c9-occupancy-fixture-edge.ts';

test('synthetic CRM adapter survives actual Promise assimilation and refuses any extra method', async () => {
  const attempts = [];
  const adapter = occupancyFixtureEdge({ getStaffScheduleDay: () => 'read' }, (key) => attempts.push(key));
  assert.equal(await Promise.resolve(adapter), adapter);
  assert.equal((await (async () => adapter)()).getStaffScheduleDay(), 'read');
  assert.deepEqual(attempts, []);
  assert.throws(() => adapter.createAppointment(), /Unapproved synthetic CRM operation/);
  assert.deepEqual(attempts, ['createAppointment']);
});

const url = 'postgresql://c9_proof@127.0.0.1:45678/maya_widget_gate_proof_c9occ_abcdef';
test('driver environment excludes inherited provider/model and shared DB authority', () => {
  const env = proofEnvironment({ PATH: '/usr/bin', HOME: '/synthetic', DATABASE_URL: 'foreign', OPENAI_API_KEY: 'forbidden', YCLIENTS_PARTNER_TOKEN: 'forbidden', NODE_OPTIONS: '--require=foreign', PGHOST: 'foreign', CI: 'true' }, url);
  assert.deepEqual(env, { DATABASE_URL: url, NODE_ENV: 'test', LANG: 'C', TZ: 'UTC', PATH: '/usr/bin', HOME: '/synthetic' });
});
test('driver refuses shared, nonlocal, redirected or foreign database names', () => {
  for (const bad of [url.replace('45678', '5432'), url.replace('127.0.0.1', 'localhost'), url.replace('c9occ_abcdef', 'local'), url + '?host=remote', url.replace('c9_proof@', 'c9_proof:secret@')]) assert.throws(() => proofEnvironment({}, bad));
});
test('plan has sequential fresh processes around PG restart and a private restart receipt', () => {
  const plan = proofCommands({ pgBin: '/owned/bin', cluster: '/tmp/owned/pg', log: '/tmp/evidence/pg.log', port: 45678, database: 'maya_widget_gate_proof_c9occ_abcdef', receipt: '/tmp/private/receipt.json', output: '/tmp/evidence' });
  assert.deepEqual(plan.map((step) => step.name), ['initdb', 'pg-start', 'createdb', 'migrations', 'carrier-bundle', 'prepare', 'pg-restart', 'resume']);
  assert.equal(plan[5].command, process.execPath);
  assert.equal(plan[7].command, process.execPath);
  assert.equal(plan[5].env.JEST_C9_OCCUPANCY_STAGE, 'prepare');
  assert.equal(plan[7].env.JEST_C9_OCCUPANCY_STAGE, 'resume');
  assert.equal(plan[5].env.JEST_C9_OCCUPANCY_RECEIPT, plan[7].env.JEST_C9_OCCUPANCY_RECEIPT);
  assert.ok(plan[5].args.includes('--runInBand'));
  assert.ok(plan[5].args.includes('test/widgets-live/c9-occupancy-restart.probe-spec.ts'));
  assert.ok(plan[5].args.includes('--testRegex'));
  assert.ok(plan[1].args.includes('-h 127.0.0.1 -p 45678 -k \'\''));
});
