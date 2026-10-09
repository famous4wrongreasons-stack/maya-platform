import assert from 'node:assert/strict';
import test from 'node:test';
import {
  proofCommands,
  proofEnvironment,
} from './lifecycle-calendar-read-proof.mjs';

const url =
  'postgresql://lifecycle_calendar_proof@127.0.0.1:55471/maya_widget_gate_proof_lifecyclecalendar_abc123';
test('owned lifecycle calendar proof strips ambient production/provider/model settings', () => {
  const env = proofEnvironment(
    {
      PATH: '/synthetic',
      OPENAI_API_KEY: 'must-not-pass',
      DATABASE_URL: 'must-not-pass',
      YCLIENTS_PARTNER_TOKEN: 'must-not-pass',
      DEEPSEEK_API_KEY: 'must-not-pass',
      NODE_OPTIONS: '--require=unapproved.cjs',
      PGOPTIONS: '-c shared_buffers=2GB',
    },
    url,
  );
  assert.equal(env.DATABASE_URL, url);
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.PATH, '/synthetic');
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.YCLIENTS_PARTNER_TOKEN, undefined);
  assert.equal(env.DEEPSEEK_API_KEY, undefined);
  assert.equal(env.PGOPTIONS, undefined);
  assert.equal(env.NODE_OPTIONS, '--max-old-space-size=1536');
});
test('owned lifecycle calendar proof refuses shared, remote, credentialed and ambiguous databases', () => {
  for (const unsafe of [
    url.replace('127.0.0.1', 'example.invalid'),
    url.replace('55471', '5432'),
    url.replace('_lifecyclecalendar_abc123', '_existing'),
    url.replace('lifecycle_calendar_proof@', 'root:secret@'),
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
    database: 'maya_widget_gate_proof_lifecyclecalendar_abc123',
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
  assert.equal(commands[4].env.JEST_LIFECYCLE_CALENDAR_STAGE, 'prepare');
  assert.equal(commands[6].env.JEST_LIFECYCLE_CALENDAR_STAGE, 'resume');
  assert.ok(commands[4].args.includes('--runInBand'));
  assert.equal(commands[4].command, process.execPath);
  assert.equal(commands[6].command, process.execPath);
  assert.ok(
    commands[1].args.includes(
      "-h 127.0.0.1 -p 55471 -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30",
    ),
  );
  assert.deepEqual(commands[5].args, [
    '-D',
    '/tmp/owned/pg',
    '-w',
    '-t',
    '30',
    '-m',
    'fast',
    'restart',
  ]);
  for (const index of [4, 6]) {
    assert.equal(
      commands[index].env.JEST_LIFECYCLE_CALENDAR_RECEIPT,
      '/tmp/owned/private.json',
    );
    assert.ok(
      commands[index].args.includes(
        'test/widgets-live/lifecycle-calendar-read-restart.probe-spec.ts',
      ),
    );
  }
});
test('finite runner rejects shell-sensitive cluster paths and default PG port', () => {
  const args = {
    pgBin: '/synthetic/pg',
    cluster: '/tmp/owned/pg',
    log: '/tmp/owned/pg.log',
    port: 55471,
    database: 'maya_widget_gate_proof_lifecyclecalendar_abc123',
    receipt: '/tmp/owned/private.json',
    output: '/tmp/owned/results',
  };
  assert.throws(() => proofCommands({ ...args, port: 5432 }));
  assert.throws(() => proofCommands({ ...args, cluster: '/tmp/bad path' }));
  assert.throws(() => proofCommands({ ...args, cluster: "/tmp/bad'path" }));
});
