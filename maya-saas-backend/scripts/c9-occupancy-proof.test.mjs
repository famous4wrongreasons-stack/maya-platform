import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { proofCommands, proofEnvironment, runCommand } from './c9-occupancy-proof.mjs';
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
  assert.deepEqual(env, { DATABASE_URL: url, NODE_ENV: 'test', NODE_OPTIONS: '--max-old-space-size=3072', LANG: 'C', TZ: 'UTC', PATH: '/usr/bin', HOME: '/synthetic' });
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
  assert.ok(plan[1].args.includes('-h 127.0.0.1 -p 45678 -k \'\' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30'));
});
test('browser plan builds the actual web carrier, reuses owned HTTP/PG probe and omits old SSR/restart stages', () => {
  const plan = proofCommands({ pgBin: '/owned/bin', cluster: '/tmp/owned/pg', log: '/tmp/evidence/pg.log', port: 45678, database: 'maya_widget_gate_proof_c9occ_abcdef', receipt: '/tmp/private/receipt.json', output: '/tmp/evidence', browser: true });
  assert.deepEqual(plan.map((step) => step.name), ['initdb', 'pg-start', 'createdb', 'migrations', 'react-web-build', 'browser']);
  assert.deepEqual(plan[4].args, ['build.mjs', '--target=web']);
  assert.ok(plan[4].cwd.endsWith('/maya-carrier-react'));
  assert.equal(plan[5].env.JEST_C9_OCCUPANCY_STAGE, 'browser');
  assert.ok(plan[5].args.includes('--runInBand'));
  assert.ok(plan[5].args.includes('test/widgets-live/c9-occupancy-restart.probe-spec.ts'));
});

test('cancellation bounds a TERM-ignoring owned child and still permits cleanup only', async () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-c9-driver-test-'));
  const control = { cancelled: null, terminateActive: null, activeCleanup: false };
  let running;
  try {
    running = runCommand({ name: 'ignores-term', command: process.execPath, args: ['--max-old-space-size=64', '-e', 'process.on("SIGTERM",()=>{}); process.stdout.write("ready\\n"); setInterval(()=>{},1000);'] }, {}, output, control);
    // Install rejection handling before sending the cancellation signal.
    const completed = running.then(() => ({ ok: true }), error => ({ ok: false, error }));
    const deadline = Date.now() + 5000;
    while (!fs.readFileSync(path.join(output, 'ignores-term.log'), 'utf8').includes('ready')) {
      assert.ok(Date.now() < deadline, 'Owned child readiness bounded');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    control.cancelled = 'SIGTERM';
    control.terminateActive();
    const failure = await completed;
    assert.equal(failure.ok, false);
    assert.match(failure.error.message, /cancelled: SIGTERM/);
    assert.equal(control.terminateActive, null);
    await assert.rejects(runCommand({ name: 'resume', command: process.execPath, args: ['-e', 'process.exit(0)'] }, {}, output, control), /Proof cancelled/);
    assert.equal(fs.existsSync(path.join(output, 'resume.log')), false);
    // Test the cleanup exemption with a harmless child; this test starts no PostgreSQL.
    await runCommand({ name: 'pg-stop', command: process.execPath, args: ['--max-old-space-size=64', '-e', 'process.stdout.write("cleanup-ran")'] }, {}, output, control);
    assert.equal(fs.readFileSync(path.join(output, 'pg-stop.log'), 'utf8'), 'cleanup-ran');
  } finally {
    control.terminateActive?.();
    await running?.catch(() => {});
    fs.rmSync(output, { recursive: true });
  }
});


test('branch binding uses the same owned serial restart driver without a carrier build', () => {
 const args={pgBin:'/owned/bin',cluster:'/tmp/owned/pg',log:'/tmp/evidence/pg.log',port:45678,database:'maya_widget_gate_proof_c9occ_abcdef',receipt:'/tmp/private/receipt.json',output:'/tmp/evidence',branchBinding:true};
 const plan=proofCommands(args);
 assert.deepEqual(plan.map(s=>s.name),['initdb','pg-start','createdb','migrations','prepare','pg-restart','resume']);
 assert.ok(plan[4].args.includes('test/widgets-live/crm-branch-binding-restart.probe-spec.ts'));
 assert.throws(()=>proofCommands({...args,browser:true}),/exclusive/);
});
