import assert from 'node:assert/strict';
import test from 'node:test';
import { proofCommands, proofEnvironment } from './staff-schedule-source-proof.mjs';

const url = 'postgresql://staff_schedule_proof@127.0.0.1:55471/maya_widget_gate_proof_staffschedule_abc123';
test('owned schedule proof strips ambient production/provider/model settings', () => {
  const env = proofEnvironment({ PATH: '/synthetic', OPENAI_API_KEY: 'must-not-pass', DATABASE_URL: 'must-not-pass', YCLIENTS_PARTNER_TOKEN: 'must-not-pass' }, url);
  assert.equal(env.DATABASE_URL, url);
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PATH, '/synthetic');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.YCLIENTS_PARTNER_TOKEN, undefined);
});
test('owned schedule proof refuses shared, remote, credentialed and ambiguous databases', () => {
  for (const unsafe of [url.replace('127.0.0.1', 'example.invalid'), url.replace('55471', '5432'), url.replace('_staffschedule_abc123', '_existing'), url.replace('staff_schedule_proof@', 'root:secret@'), url + '?sslmode=disable', url + '#fragment'])
    assert.throws(() => proofEnvironment({}, unsafe));
});
test('finite sequence restarts its own PG between distinct prepare/resume processes', () => {
  const commands = proofCommands({ pgBin: '/synthetic/pg', cluster: '/tmp/owned/pg', log: '/tmp/owned/pg.log', port: 55471, database: 'maya_widget_gate_proof_staffschedule_abc123', receipt: '/tmp/owned/private.json', output: '/tmp/owned/results' });
  assert.deepEqual(commands.map(c => c.name), ['initdb', 'pg-start', 'createdb', 'migrations', 'carrier-bundle', 'prepare', 'pg-restart', 'resume']);
  assert.match(commands[1].args.join(' '), /-h 127\.0\.0\.1 -p 55471/);
  assert.equal(commands[5].env.JEST_STAFF_SCHEDULE_STAGE, 'prepare');
  assert.equal(commands[7].env.JEST_STAFF_SCHEDULE_STAGE, 'resume');
  assert.ok(commands[5].args.includes('--runInBand'));
});
test('finite runner rejects shell-sensitive cluster paths and default PG port', () => {
  const args = { pgBin: '/synthetic/pg', cluster: '/tmp/owned/pg', log: '/tmp/owned/pg.log', port: 55471, database: 'maya_widget_gate_proof_staffschedule_abc123', receipt: '/tmp/owned/private.json', output: '/tmp/owned/results' };
  assert.throws(() => proofCommands({ ...args, port: 5432 }));
  assert.throws(() => proofCommands({ ...args, cluster: '/tmp/bad path' }));
  assert.throws(() => proofCommands({ ...args, cluster: "/tmp/bad'path" }));
});
