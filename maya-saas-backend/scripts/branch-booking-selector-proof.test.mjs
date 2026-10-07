import assert from 'node:assert/strict';
import test from 'node:test';
import {
  proofCommands,
  proofEnvironment,
  main,
} from './branch-booking-selector-proof.mjs';
const url =
  'postgresql://c9_proof@127.0.0.1:45678/maya_widget_gate_proof_c9occ_abcdef';
test('branch selector driver retains guarded sterile environment', () => {
  const env = proofEnvironment(
    {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'forbidden',
      YCLIENTS_PARTNER_TOKEN: 'forbidden',
      NODE_OPTIONS: '--require=foreign',
      PGHOST: 'foreign',
    },
    url,
  );
  assert.deepEqual(Object.keys(env).sort(), [
    'DATABASE_URL',
    'LANG',
    'NODE_ENV',
    'NODE_OPTIONS',
    'PATH',
    'TZ',
  ]);
  for (const bad of [
    url.replace('45678', '5432'),
    url.replace('127.0.0.1', 'localhost'),
    url + '?host=remote',
  ])
    assert.throws(() => proofEnvironment({}, bad));
});
test('branch selector plan is serial native HTTP across fresh process/PG restart', () => {
  const plan = proofCommands({
    pgBin: '/owned/bin',
    cluster: '/tmp/owned/pg',
    log: '/tmp/evidence/pg.log',
    port: 45678,
    database: 'maya_widget_gate_proof_c9occ_abcdef',
    receipt: '/tmp/private/receipt.json',
    output: '/tmp/evidence',
  });
  assert.deepEqual(
    plan.map((s) => s.name),
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
  for (const index of [4, 6]) {
    assert.ok(plan[index].args.includes('--runInBand'));
    assert.ok(
      plan[index].args.includes(
        'test/widgets-live/branch-booking-selector.probe-spec.ts',
      ),
    );
    assert.equal(
      plan[index].env.JEST_BRANCH_BOOKING_RECEIPT,
      '/tmp/private/receipt.json',
    );
  }
  assert.equal(plan[4].env.JEST_BRANCH_BOOKING_STAGE, 'prepare');
  assert.equal(plan[6].env.JEST_BRANCH_BOOKING_STAGE, 'resume');
  assert.match(
    plan[1].args.join(' '),
    /shared_buffers=64MB.*work_mem=4MB.*max_connections=30/,
  );
});
test('driver refuses unknown live/network flags and non-absolute evidence before resources', async () => {
  await assert.rejects(main(['--live']));
  await assert.rejects(main(['--run', '--output=relative']), /absolute/);
});

test('browser uses five-case probe with bounded720s supervisor and actual Reactbuild', () => {
  const plan = proofCommands({
    pgBin: '/owned/bin',
    cluster: '/tmp/owned/pg',
    log: '/tmp/evidence/pg.log',
    port: 45678,
    database: 'maya_widget_gate_proof_c9occ_abcdef',
    receipt: '/tmp/private/receipt.json',
    output: '/tmp/evidence',
    browser: true,
  });
  assert.deepEqual(
    plan.map((s) => s.name),
    [
      'initdb',
      'pg-start',
      'createdb',
      'migrations',
      'react-web-build',
      'browser',
    ],
  );
  assert.equal(plan[5].timeoutMs, 720000);
  assert.equal(plan[5].env.JEST_BRANCH_BOOKING_STAGE, 'browser');
  assert.ok(plan[5].args.includes('--testTimeout=660000'));
  assert.ok(plan[4].cwd.endsWith('/maya-carrier-react'));
});
