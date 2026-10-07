// Finite RT6 PostgreSQL proof; reuse the existing owned-cluster command/cleanup owner.
// Requires the parent's heavy slot. Own loopback HTTP listener only; no browser, model or provider call.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { proofCommands, proofEnvironment, runCommand } from './c9-occupancy-proof.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { run: { type: 'boolean' }, output: { type: 'string' } }, strict: true });
assert.equal(values.run, true, 'Explicit --run and parent heavy-slot authorization required');
assert.ok(values.output && path.isAbsolute(values.output) && !fs.existsSync(values.output), 'New absolute output required');
for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false, 'No environment files');
const git = (args) => execFileSync('git', args, { cwd: backend, encoding: 'utf8', timeout: 5000 }).trim();
git(['diff', '--quiet', 'HEAD', '--', 'src', 'test', 'scripts', 'prisma']);
assert.equal(git(['ls-files', '--others', '--exclude-standard', '--', 'src', 'test', 'scripts', 'prisma']), '', 'Commit proof sources first');
const commit = git(['rev-parse', 'HEAD']);
const sourceTrees = Object.fromEntries(['src', 'test', 'scripts', 'prisma'].map((name) => [name, git(['rev-parse', `${commit}:maya-saas-backend/${name}`])]));
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
for (const name of ['initdb', 'pg_ctl', 'createdb']) fs.accessSync(path.join(pgBin, name), fs.constants.X_OK);
fs.mkdirSync(values.output, { mode: 0o700 });
const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-history-erasure-'));
fs.chmodSync(privateRoot, 0o700);
const cluster = path.join(privateRoot, 'pg');
const portServer = net.createServer();
await new Promise((resolve, reject) => { portServer.once('error', reject); portServer.listen(0, '127.0.0.1', resolve); });
const port = portServer.address().port;
await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));
const database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
const env = proofEnvironment(process.env, `postgresql://c9_proof@127.0.0.1:${port}/${database}`);
const allowedSetup = new Set(['initdb', 'pg-start', 'createdb', 'migrations']);
const setup = proofCommands({ pgBin, cluster, log: path.join(values.output, 'postgres.log'), port, database, receipt: path.join(privateRoot, 'unused-receipt.json'), output: values.output })
  .filter((command) => allowedSetup.has(command.name));
assert.equal(setup.length, 4);
const commands = [...setup, {
  name: 'erasure-pg', command: process.execPath, timeoutMs: 300_000,
  args: ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--runInBand', '--runTestsByPath', 'test/widgets-live/erasure-ordering.live-spec.ts', 'test/widgets-live/history-erasure-writers.live-spec.ts', 'test/widgets-live/history-erasure-http.live-spec.ts', '--json', '--outputFile=' + path.join(values.output, 'erasure-pg-jest.json')],
}];
const manifest = {
  contract: 'maya.history-erasure-owned-cluster/1', commit, sourceTrees, cluster, database, port,
  status: 'running', completed: [], clusterStopped: false,
  scope: 'RT6 storage/gateway, late writer and current privacy HTTP fixtures; fresh Nest application restart, not a deployed binary; RT8 UI/product acceptance remains open',
  sourceBinding: 'Committed src/test/scripts/prisma trees; installed dependencies are not hashed',
  expectedExternalProviderCalls: 0, expectedModelCalls: 0, externalEgressMeasured: false, fixtureData: 'synthetic-only',
  resources: { nodeHeapMiB: 3072, pgSharedBuffersMiB: 64, pgWorkMemMiB: 4, pgMaxConnections: 30, jestWorkers: 1 },
};
const save = () => fs.writeFileSync(path.join(values.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
const control = { cancelled: null, terminateActive: null, activeCleanup: false };
const cancel = (signal) => {
  control.cancelled ??= signal;
  manifest.cancelledBy = control.cancelled;
  save();
  if (!control.activeCleanup) control.terminateActive?.();
};
const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
let startAttempted = false;
save();
try {
  for (const command of commands) {
    if (command.name === 'pg-start') startAttempted = true;
    console.log(command.name);
    await runCommand(command, env, values.output, control);
    manifest.completed.push(command.name); save();
  }
  const result = JSON.parse(fs.readFileSync(path.join(values.output, 'erasure-pg-jest.json'), 'utf8'));
  assert.equal(result.numPassedTests, 17);
  assert.equal(result.numFailedTests, 0);
  assert.equal(result.numPendingTests, 0);
  assert.equal(result.success, true);
  manifest.observedTests = { passed: result.numPassedTests, failed: result.numFailedTests, pending: result.numPendingTests };
  assert.equal(git(['rev-parse', 'HEAD']), commit, 'Candidate changed during proof');
  git(['diff', '--quiet', 'HEAD', '--', 'src', 'test', 'scripts', 'prisma']);
  assert.equal(git(['ls-files', '--others', '--exclude-standard', '--', 'src', 'test', 'scripts', 'prisma']), '', 'New unbound source during proof');
  manifest.postRunSourcesUnchanged = true;
  manifest.status = 'passed';
} catch (error) {
  manifest.status = 'failed';
  throw error;
} finally {
  if (startAttempted) {
    try {
      await runCommand({ name: 'pg-stop', command: path.join(pgBin, 'pg_ctl'), args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'] }, env, values.output, control);
      manifest.clusterStopped = true;
    } catch {
      manifest.status = 'failed-owned-cluster-stop';
      process.stderr.write(`Owned cluster may need cleanup: ${cluster}\n`);
    }
  }
  save();
  process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
}
assert.equal(manifest.status, 'passed');
console.log('RT6 proof passed; owned cluster stopped: ' + values.output);
