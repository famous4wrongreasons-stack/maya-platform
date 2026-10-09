import assert from 'node:assert/strict';
import test from 'node:test';
import {
  proofCommands,
  proofEnvironment,
} from './employee-journal-read-proof.mjs';

const url =
  'postgresql://employee_journal_proof@127.0.0.1:55471/maya_widget_gate_proof_employeejournal_abc123';
test('owned journal proof strips ambient production/provider/model settings', () => {
  const env = proofEnvironment(
    {
      PATH: '/synthetic',
      OPENAI_API_KEY: 'must-not-pass',
      DATABASE_URL: 'must-not-pass',
      YCLIENTS_PARTNER_TOKEN: 'must-not-pass',
    },
    url,
  );
  assert.equal(env.DATABASE_URL, url);
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PATH, '/synthetic');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.YCLIENTS_PARTNER_TOKEN, undefined);
});
test('owned journal proof refuses shared, remote, credentialed and ambiguous databases', () => {
  for (const unsafe of [
    url.replace('127.0.0.1', 'example.invalid'),
    url.replace('55471', '5432'),
    url.replace('_employeejournal_abc123', '_existing'),
    url.replace('employee_journal_proof@', 'root:secret@'),
    url + '?sslmode=disable',
    url + '#fragment',
  ])
    assert.throws(() => proofEnvironment({}, unsafe));
});
test('finite sequence restarts its own PG between distinct prepare/resume processes', () => {
  const commands = proofCommands({
    pgBin: '/synthetic/pg',
    cluster: '/tmp/owned/pg',
    log: '/tmp/owned/pg.log',
    port: 55471,
    database: 'maya_widget_gate_proof_employeejournal_abc123',
    receipt: '/tmp/owned/private.json',
    output: '/tmp/owned/results',
  });
  assert.deepEqual(
    commands.map((c) => c.name),
    [
      'initdb',
      'pg-start',
      'createdb',
      'migrations',
      'prepare',
      'pg-restart',
      'resume',
    ],
  );
  assert.match(commands[1].args.join(' '), /-h 127\.0\.0\.1 -p 55471/);
  assert.equal(commands[4].env.JEST_EMPLOYEE_JOURNAL_STAGE, 'prepare');
  assert.equal(commands[6].env.JEST_EMPLOYEE_JOURNAL_STAGE, 'resume');
  assert.ok(commands[4].args.includes('--runInBand'));
});
test('finite runner rejects shell-sensitive cluster paths and default PG port', () => {
  const args = {
    pgBin: '/synthetic/pg',
    cluster: '/tmp/owned/pg',
    log: '/tmp/owned/pg.log',
    port: 55471,
    database: 'maya_widget_gate_proof_employeejournal_abc123',
    receipt: '/tmp/owned/private.json',
    output: '/tmp/owned/results',
  };
  assert.throws(() => proofCommands({ ...args, port: 5432 }));
  assert.throws(() => proofCommands({ ...args, cluster: '/tmp/bad path' }));
  assert.throws(() => proofCommands({ ...args, cluster: "/tmp/bad'path" }));
});
