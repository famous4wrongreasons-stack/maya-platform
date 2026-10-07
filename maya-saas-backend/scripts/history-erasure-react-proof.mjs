// Finite owned-cluster/current-React proof. Explicit --run after parent resource approval.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { proofEnvironment, proofCommands, runCommand } from './c9-occupancy-proof.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.resolve(backend, '..');
const roots = ['maya-saas-backend', 'maya-carrier-react', 'maya-chat-shell'];
const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8', timeout: 5000 }).trim();
const clean = () => {
  git(['diff', '--quiet', 'HEAD', '--', ...roots]);
  assert.equal(git(['ls-files', '--others', '--exclude-standard', '--', ...roots]), '', 'Commit all proof/runtime sources before execution');
};
function artifacts(root) {
  const result = {};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, 'No artifact symlinks');
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) result[path.relative(root, file)] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  };
  walk(root); return result;
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: { run: { type: 'boolean' }, output: { type: 'string' }, 'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' } } });
  if (!values.run) { process.stdout.write('Preparation only: parent heavy slot required. --run --output=/absolute/new/path\n'); return; }
  assert.ok(values.output && path.isAbsolute(values.output) && !fs.existsSync(values.output), 'New absolute evidence directory required');
  for (const file of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, file)), false, 'No environment files');
  for (const name of ['initdb', 'pg_ctl', 'createdb']) fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  clean(); const commit = git(['rev-parse', 'HEAD']);
  const sourceTrees = Object.fromEntries(roots.map(root => [root, git(['rev-parse', `${commit}:${root}`])]));
  fs.mkdirSync(values.output, { mode: 0o700 });
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-erasure-react-')); fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'), port = await freePort();
  const database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(process.env, `postgresql://c9_proof@127.0.0.1:${port}/${database}`);
  const setup = proofCommands({ pgBin: values['pg-bin'], cluster, log: path.join(privateRoot, 'postgres-private.log'), port, database, receipt: path.join(privateRoot, 'unused.json'), output: values.output }).slice(0, 4);
  const stage = name => ({
    name, command: process.execPath, timeoutMs: 360000,
    args: ['--max-old-space-size=1536', 'node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--testRegex', 'history-erasure-react\\.probe-spec\\.ts$', '--runInBand', '--runTestsByPath', 'test/widgets-live/history-erasure-react.probe-spec.ts', '--json', '--outputFile=' + path.join(values.output, name + '-jest.json')],
    env: { JEST_HISTORY_ERASURE_STAGE: name, JEST_HISTORY_ERASURE_RECEIPT: path.join(privateRoot, 'private-restart.json'), JEST_HISTORY_ERASURE_OUTPUT: values.output },
  });
  const pgBase = ['-D', cluster, '-w', '-t', '30'];
  const manifest = {
    contract: 'maya.history-erasure-react-owned-restart/1', status: 'running', commit, sourceTrees,
    database, cluster, port, completed: [], clusterStopped: false,
    scope: 'current React and compiled dist/src/main.js in NODE_ENV=test, real HTTP; separate backend Node processes and PostgreSQL stop/start',
    authentication: 'existing debug email on synthetic fixture accounts; no credential/token injection into the browser',
    retryScope: 'UI manual same-UUID retry before restart; retained same-UUID HTTP replay after restart; no client retry journal',
    productionConfiguration: false, realModelAcceptance: false, externalProviderAcceptance: false, externalEgressMeasured: false,
    resources: { jestWorkers: 1, browserCount: 1, backendHeapMiB: 1536, probeHeapMiB: 1536, chromeHeapMiB: 256, pgSharedBuffersMiB: 64, pgMaxConnections: 30 },
  };
  const save = () => fs.writeFileSync(path.join(values.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const control = { cancelled: null, terminateActive: null, activeCleanup: false };
  const cancel = signal => { control.cancelled ??= signal; manifest.cancelledBy = signal; save(); if (!control.activeCleanup) control.terminateActive?.(); };
  const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  let started = false, artifactHashes;
  const run = async command => { console.log(command.name); await runCommand(command, env, values.output, control); manifest.completed.push(command.name); save(); };
  save();
  try {
    await run({ name: 'backend-build', command: process.execPath, args: ['--max-old-space-size=1536', 'node_modules/@nestjs/cli/bin/nest.js', 'build'] });
    await run({ name: 'react-build', command: process.execPath, cwd: path.join(repository, 'maya-carrier-react'), args: ['--max-old-space-size=1536', 'build.mjs', '--target=web'] });
    artifactHashes = { backend: artifacts(path.join(backend, 'dist')), react: artifacts(path.join(repository, 'maya-carrier-react/dist/web')) };
    assert.ok(artifactHashes.backend['src/main.js']);
    fs.writeFileSync(path.join(values.output, 'artifact-hashes.json'), JSON.stringify(artifactHashes, null, 2) + '\n', { mode: 0o600 });
    for (const command of setup) { if (command.name === 'pg-start') started = true; await run(command); }
    await run(stage('prepare'));
    const prepared = JSON.parse(fs.readFileSync(path.join(values.output, 'prepare.json'), 'utf8'));
    assert.equal(prepared.status, 'passed'); assert.equal(prepared.backendStopped, true);
    await run({ name: 'pg-stop-for-restart', command: path.join(values['pg-bin'], 'pg_ctl'), args: [...pgBase, '-m', 'fast', 'stop'] });
    await run({ ...setup[1], name: 'pg-start-after-restart' });
    await run(stage('resume'));
    for (const name of ['prepare', 'resume']) {
      const result = JSON.parse(fs.readFileSync(path.join(values.output, name + '-jest.json'), 'utf8'));
      assert.equal(result.numPassedTests, 1); assert.equal(result.numFailedTests, 0); assert.equal(result.numPendingTests, 0); assert.equal(result.success, true);
    }
    const resumed = JSON.parse(fs.readFileSync(path.join(values.output, 'resume.json'), 'utf8'));
    assert.equal(resumed.status, 'passed'); assert.equal(resumed.backendStopped, true);
    assert.notEqual(prepared.backendPid, resumed.backendPid); assert.notEqual(prepared.pgStarted, resumed.pgStarted);
    assert.equal(resumed.persistedSameCompletionTimestamp, true);
    assert.equal(resumed.noAdditionalTombstonesOnReplay, true);
    assert.equal(git(['rev-parse', 'HEAD']), commit); clean();
    assert.deepEqual({ backend: artifacts(path.join(backend, 'dist')), react: artifacts(path.join(repository, 'maya-carrier-react/dist/web')) }, artifactHashes, 'Built artifacts changed during proof');
    manifest.postRunSourcesAndArtifactsUnchanged = true; manifest.status = 'passed';
  } catch (error) { manifest.status = 'failed'; throw error; }
  finally {
    if (started) {
      try { await runCommand({ name: 'pg-stop', command: path.join(values['pg-bin'], 'pg_ctl'), args: [...pgBase, '-m', 'fast', 'stop'] }, env, values.output, control); manifest.clusterStopped = true; }
      catch { manifest.status = 'failed-owned-cluster-stop'; }
    }
    save(); process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
  }
  assert.equal(manifest.status, 'passed'); console.log('Current React / compiled entry restart proof passed; owned cluster stopped.');
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
