// Explicit developer handoff: real current React + AppModule, synthetic native
// YCLIENTS transport only. No existing database, env file or provider credential.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { proofCommands, proofEnvironment, runCommand } from './c9-occupancy-proof.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(backend);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const LOCAL_SOURCE_PATHS = Object.freeze([
  'maya-saas-backend/scripts/crm-setup-local.mjs',
  'maya-saas-backend/scripts/crm-setup-local.test.mjs',
  'maya-saas-backend/scripts/c9-occupancy-proof.mjs',
  'maya-saas-backend/test/widgets-live/crm-a17-local-form.probe-spec.ts',
  'maya-saas-backend/test/widgets-live/support',
  'maya-saas-backend/test/jest-widgets-live.json',
  'maya-saas-backend/src',
  'maya-saas-backend/prisma',
  'maya-saas-backend/prisma.config.ts',
  'maya-saas-backend/package.json',
  'maya-saas-backend/package-lock.json',
  'maya-saas-backend/tsconfig.json',
  'maya-carrier-react/src',
  'maya-carrier-react/tools',
  'maya-carrier-react/test/crm-a17-local-form-server.mjs',
  'maya-carrier-react/test/crm-a17-setup-browser-guard.mjs',
  'maya-carrier-react/build.mjs',
  'maya-carrier-react/index.html',
  'maya-carrier-react/tsconfig.json',
  'maya-carrier-react/package.json',
  'maya-carrier-react/package-lock.json',
  'maya-chat-shell/src',
  'maya-chat-shell/dev/serve.mjs',
  'maya-chat-shell/build.mjs',
  'maya-chat-shell/package.json',
]);

export function localPlan(options) {
  const minutes = Number(options.minutes ?? 15);
  assert.ok(Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 15, 'Duration must be 1..15 whole minutes');
  assert.ok(path.isAbsolute(options.output), 'Fresh absolute output required');
  const setup = proofCommands({ ...options, crmSetup: true, receipt: path.join(options.output, 'unused-restart.json') }).slice(0, 5);
  return {
    durationMs: minutes * 60000,
    setup,
    stage: {
      name: 'local-form', command: process.execPath, cwd: backend,
      args: ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--testRegex', 'crm-a17-local-form\\.probe-spec\\.ts$', '--runInBand', '--runTestsByPath', 'test/widgets-live/crm-a17-local-form.probe-spec.ts', '--testTimeout=' + (minutes * 60000 + 60000), '--json', '--outputFile=' + path.join(options.output, 'local-form-jest.json')],
      env: { JEST_CRM_LOCAL_OUTPUT: options.output, JEST_CRM_LOCAL_DURATION_MS: String(minutes * 60000) },
    },
  };
}

function sourceBinding() {
  const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  const head = git(['rev-parse', 'HEAD']);
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.equal(git(['status', '--porcelain', '--untracked-files=all', '--', ...LOCAL_SOURCE_PATHS]), '', 'Commit captured source before launching; dirty source is refused');
  const entries = git(['ls-tree', '-r', head, '--', ...LOCAL_SOURCE_PATHS]).split('\n').filter(Boolean).map(line => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    assert.ok(match, 'Only ordinary committed source files are allowed');
    const file = match[3], full = path.join(repo, file);
    assert.ok(fs.lstatSync(full).isFile() && !fs.lstatSync(full).isSymbolicLink());
    const bytes = fs.readFileSync(full);
    const blob = createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
    assert.equal(blob, match[2], 'Captured Git blob differs: ' + file);
    return { path: file, gitBlob: blob, sha256: hash(bytes) };
  });
  for (const file of LOCAL_SOURCE_PATHS.filter(name => /\.(?:mjs|ts|json|html)$/.test(name)))
    assert.ok(entries.some(entry => entry.path === file), 'Source path is not committed: ' + file);
  assert.ok(entries.length > 0);
  return { head, entries };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function groupAlive(pgid) {
  try { process.kill(-pgid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}
function signalGroup(pgid, signal) {
  try { process.kill(-pgid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function removeOwnedGroup(pgid) {
  if (!groupAlive(pgid)) return;
  signalGroup(pgid, 'SIGTERM');
  const deadline = Date.now() + 5000;
  while (groupAlive(pgid) && Date.now() < deadline) await delay(50);
  if (groupAlive(pgid)) signalGroup(pgid, 'SIGKILL');
  const killedDeadline = Date.now() + 5000;
  while (groupAlive(pgid) && Date.now() < killedDeadline) await delay(50);
  assert.equal(groupAlive(pgid), false, 'Owned local-form process group did not stop');
}

async function runForm(plan, env, output, control, manifest, save) {
  const fd = fs.openSync(path.join(output, 'local-form.log'), 'wx', 0o600);
  let child, finished = false, killTimer, deadline, poll;
  try {
    child = spawn(plan.stage.command, plan.stage.args, { cwd: backend, env: { ...env, ...plan.stage.env }, detached: true, stdio: ['ignore', fd, fd] });
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => { finished = true; resolve({ code, signal }); });
    });
    // Observe immediately, including a spawn failure before the handoff appears.
    void closed.catch(() => {});
    const terminate = () => {
      if (!child.pid) return;
      signalGroup(child.pid, 'SIGTERM');
      killTimer ??= setTimeout(() => signalGroup(child.pid, 'SIGKILL'), 5000);
    };
    control.terminateActive = terminate;
    manifest.ownedFormPgid = child.pid ?? null;
    const started = Date.now();
    let handedOff = false, timedOut = false, handoffError;
    const handoffFile = path.join(output, 'handoff.json');
    poll = setInterval(() => {
      if (handedOff || finished || !fs.existsSync(handoffFile)) return;
      try {
        const stat = fs.lstatSync(handoffFile);
        assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 16384 && (stat.mode & 0o777) === 0o600);
        const handoff = JSON.parse(fs.readFileSync(handoffFile, 'utf8'));
        assert.equal(handoff.contract, 'maya.crm-local-handoff/1'); assert.equal(handoff.status, 'ready');
        const url = new URL(handoff.landingUrl), form = new URL(handoff.formUrl);
        assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, '127.0.0.1'); assert.ok(url.port);
        assert.equal(url.username + url.password + url.search + url.hash, ''); assert.equal(url.pathname, '/__local-a17');
        assert.equal(form.origin, url.origin); assert.equal(form.pathname + form.search, '/?local_crm_setup=1');
        assert.match(handoff.email, /^wl-[a-f0-9]{8}@widgets-live\.test$/);
        handedOff = true; manifest.status = 'ready'; manifest.landingUrl = url.href; save();
        process.stdout.write(`\nMAYA: actual local React + AppModule + isolated PostgreSQL. Synthetic data only.\nOpen ${url.href}\nFixture email: ${handoff.email}\nUse only SYNTHETIC_A17_V1 or SYNTHETIC_A17_V2. Do not enter real credentials.\nExplicit form actions are required. No model, real YCLIENTS or iPhone HTTPS acceptance.\nThe form stops within ${plan.durationMs / 60000} minutes. Ctrl-C closes only this owned session.\n`);
      } catch (error) { handoffError = error; terminate(); }
    }, 200);
    deadline = setTimeout(() => { timedOut = true; terminate(); }, plan.durationMs + 60000);
    const result = await closed;
    manifest.formExit = result;
    manifest.handoffShown = handedOff;
    manifest.elapsedMs = Date.now() - started;
    if (handoffError) throw handoffError;
    assert.equal(timedOut, false, 'Local form exceeded its bounded lifetime');
    if (!control.cancelled) { assert.equal(result.code, 0, 'Local form failed; inspect private local-form.log'); assert.ok(handedOff, 'Form never became ready'); }
  } finally {
    clearTimeout(deadline); clearTimeout(killTimer); clearInterval(poll);
    if (child?.pid) { await removeOwnedGroup(child.pid); manifest.formGroupAbsent = true; }
    control.terminateActive = null;
    fs.closeSync(fd);
  }
}

export async function main(args) {
  const { values } = parseArgs({ args, strict: true, options: { run: { type: 'boolean' }, output: { type: 'string' }, minutes: { type: 'string', default: '15' }, 'pg-bin': { type: 'string', default: '/opt/homebrew/opt/postgresql@16/bin' } } });
  if (!values.run) { process.stdout.write('After the assigned local execution slot: node scripts/crm-setup-local.mjs --run --output=/absolute/new/directory [--minutes=15]\nSynthetic-only actual local form; no real credentials or remote endpoint.\n'); return; }
  assert.equal(process.platform, 'darwin', 'This handoff is bounded to the approved local Mac');
  assert.ok(values.output && path.isAbsolute(values.output));
  assert.equal(fs.existsSync(values.output), false, 'Output must be fresh');
  for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false, 'Env files are refused');
  for (const name of ['initdb', 'pg_ctl', 'createdb']) fs.accessSync(path.join(values['pg-bin'], name), fs.constants.X_OK);
  const source = sourceBinding();
  fs.mkdirSync(values.output, { mode: 0o700 });
  const output = fs.realpathSync(values.output);
  const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-local-a17-')); fs.chmodSync(privateRoot, 0o700);
  const cluster = path.join(privateRoot, 'pg'), port = await freePort(), database = 'maya_widget_gate_proof_c9occ_' + randomBytes(6).toString('hex');
  const env = proofEnvironment(process.env, `postgresql://c9_proof@127.0.0.1:${port}/${database}`);
  const plan = localPlan({ minutes: values.minutes, pgBin: values['pg-bin'], output, cluster, port, database, log: path.join(output, 'postgres.log') });
  const manifest = { contract: 'maya.crm-local-owned-session/1', status: 'starting', qualification: 'Actual AppModule/current React; finite synthetic native GET transport; no real provider/model', source, cluster, database, port, completed: [], resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30, jestWorkers: 1 }, durationMs: plan.durationMs };
  const save = () => fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  const control = { cancelled: null, terminateActive: null, activeCleanup: false };
  const cancel = signal => { control.cancelled ??= signal; manifest.cancelledBy = signal; save(); if (!control.activeCleanup) control.terminateActive?.(); };
  const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  let startAttempted = false;
  save();
  try {
    for (const command of plan.setup) {
      if (command.name === 'pg-start') startAttempted = true;
      process.stdout.write(command.name + '\n');
      await runCommand(command, env, output, control);
      manifest.completed.push(command.name); save();
    }
    assert.equal(control.cancelled, null, 'Session cancelled');
    await runForm(plan, env, output, control, manifest, save);
    manifest.status = control.cancelled ? 'cancelled' : 'stopped';
  } catch (error) { manifest.status = 'failed'; throw error; }
  finally {
    if (startAttempted) {
      try { await runCommand({ name: 'pg-stop', command: path.join(values['pg-bin'], 'pg_ctl'), args: ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop'] }, env, output, control); manifest.clusterStopped = true; }
      catch { manifest.status = 'failed-owned-cluster-stop'; manifest.clusterStopped = false; process.stderr.write(`Owned cluster requires cleanup: ${cluster}\n`); }
    }
    try { manifest.sourceUnchanged = JSON.stringify(sourceBinding()) === JSON.stringify(source); }
    catch { manifest.sourceUnchanged = false; }
    if (!manifest.sourceUnchanged) manifest.status = 'failed-source-changed';
    if (manifest.status === 'stopped' && control.cancelled) manifest.status = 'cancelled';
    save(); process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
  }
  assert.ok(['stopped', 'cancelled'].includes(manifest.status));
  process.stdout.write(`Owned local session stopped. Private metadata: ${output}\n`);
}
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url)
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
