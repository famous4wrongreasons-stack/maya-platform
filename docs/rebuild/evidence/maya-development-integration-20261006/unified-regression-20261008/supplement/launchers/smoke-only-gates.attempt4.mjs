import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration';
const backend = path.join(root, 'maya-saas-backend');
const output = '/tmp/maya-unified-smoke-20261008-attempt4';
const pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const cluster = path.join(output, 'pg');
const database = 'maya_gates_smoke_unified_attempt3';
const fenceSource = '/tmp/maya-unified-regression-20261008/loopback-only.cjs';
const launcher = fileURLToPath(import.meta.url);
const caps = Object.freeze({
  nodeHeapMb: 3072, pgSharedBuffersMb: 64, pgWorkMemMb: 4, pgMaxConnections: 30,
  pgStageMs: 90000, nodeStageMs: 180000, smokeMs: 300000,
  smokeTermGraceMs: 3000, smokeKillWaitMs: 1000, pgCleanupMs: 45000,
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', timeout: 10000,
}).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One scratch-only owner for the canonical smoke and its ordinary, non-detached
// compiled server child. No PID discovery, name matching or port-based killing.
async function runSmokeGroup(spec, env, control, evidence, own) {
  if (control.cancelled) throw new Error('smoke_cancelled_before_spawn');
  assert.equal(env.HTTP_SMOKE_EXTERNAL_SERVER, undefined);
  assert.equal(control.terminateActive, null);
  const fd = fs.openSync(path.join(output, 'http-smoke-private.log'), 'wx', 0o600);
  let child = null, pgid = null, closed = false, childError = null;
  let closeResolve;
  const close = new Promise((resolve) => { closeResolve = resolve; });
  let interruptResolve;
  const interrupted = new Promise((resolve) => { interruptResolve = resolve; });
  let interruption = null, timer = null, stopPromise = null;
  evidence.smokeGroup = {
    detached: true, pid: null, pgid: null, closed: false, groupAbsent: false,
    exitCode: null, signal: null, error: null, termSent: false, killSent: false,
  };
  const state = evidence.smokeGroup;
  const groupAlive = () => {
    if (pgid === null) return false;
    try { process.kill(-pgid, 0); return true; }
    catch (error) { if (error.code === 'ESRCH') return false; throw error; }
  };
  const signalGroup = (signal) => {
    if (!groupAlive()) return;
    try {
      process.kill(-pgid, signal);
      state[signal === 'SIGTERM' ? 'termSent' : 'killSent'] = true;
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  const waitGone = async (ms) => {
    const deadline = performance.now() + ms;
    do {
      state.groupAbsent = !groupAlive();
      if (closed && state.groupAbsent) return true;
      await sleep(Math.min(25, Math.max(1, deadline - performance.now())));
    } while (performance.now() < deadline);
    state.groupAbsent = !groupAlive();
    return closed && state.groupAbsent;
  };
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (child === null) return; // synchronous spawn refusal created no child
      if (closed && !groupAlive()) { state.groupAbsent = true; return; }
      signalGroup('SIGTERM');
      if (!await waitGone(caps.smokeTermGraceMs)) {
        signalGroup('SIGKILL');
        assert.ok(await waitGone(caps.smokeKillWaitMs), 'owned_smoke_group_cleanup_unconfirmed');
      }
      assert.ok(state.closed && state.groupAbsent, 'owned_smoke_group_cleanup_unconfirmed');
    })();
    return stopPromise;
  };
  own.stop = stop; // install cleanup before any child or post-spawn I/O
  const interrupt = (reason = control.cancelled ?? 'smoke_interrupted') => {
    if (interruption !== null) return;
    interruption = reason;
    interruptResolve(reason);
  };
  control.terminateActive = interrupt;
  try {
    try {
      child = spawn(spec.command, spec.args, {
        cwd: backend, env, detached: true, stdio: ['ignore', fd, fd],
      });
      // Listeners are registered immediately; callbacks perform no file I/O.
      child.on('error', (error) => { childError = error; state.error = error.message; });
      child.once('close', (code, signal) => {
        closed = true; state.closed = true; state.exitCode = code; state.signal = signal;
        closeResolve();
      });
      if (child.pid !== undefined) {
        assert.ok(Number.isSafeInteger(child.pid) && child.pid > 1, 'owned_smoke_pid_invalid');
        pgid = child.pid; state.pid = child.pid; state.pgid = pgid;
      }
    } finally { fs.closeSync(fd); }
    timer = setTimeout(() => interrupt('smoke_timeout'), caps.smokeMs);
    await Promise.race([close, interrupted]);
    if (interruption !== null) throw new Error(interruption);
    if (childError !== null) throw childError;
    assert.equal(state.exitCode, 0, `canonical_smoke_exit_${state.exitCode}_${state.signal}`);
  } finally {
    clearTimeout(timer);
    // Even a normal smoke exit is insufficient while a member of its group lives.
    try { await stop(); }
    finally { if (control.terminateActive === interrupt) control.terminateActive = null; }
  }
}

async function freePort(excluded) {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    assert.ok(!excluded.has(port), 'selected_port_conflict');
    return port;
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function main() {
  assert.ok(process.platform !== 'win32', 'requires_posix_owned_process_groups');
  assert.equal(fs.existsSync(output), false, 'fresh_output_required');
  assert.equal(git('status', '--porcelain'), '', 'clean_source_required');
  for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false);
  for (const name of ['initdb', 'pg_ctl', 'createdb']) fs.accessSync(path.join(pgBin, name), fs.constants.X_OK);
  const compiledEntry = path.join(backend, 'dist/src/main.js');
  const source = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  const sourceFiles = [
    'scripts/http-smoke.ts', 'scripts/http-smoke-fixtures.ts', 'scripts/c9-occupancy-proof.mjs',
    'test/widgets-live/support/environment.ts', 'prisma/schema.prisma', 'prisma/seed.ts',
  ];
  const sourceHashes = Object.fromEntries(sourceFiles.map((name) => [name, sha(fs.readFileSync(path.join(backend, name)))]));
  const compiledEntrySha256 = sha(fs.readFileSync(compiledEntry));
  const fenceBytes = fs.readFileSync(fenceSource);
  const require = createRequire(path.join(backend, 'package.json'));
  require('ts-node').register({ transpileOnly: true, project: path.join(backend, 'tsconfig.json') });
  const { WIDGETS_LIVE_TEST_LITERALS } = require(path.join(backend, 'test/widgets-live/support/environment.ts'));
  const { runCommand } = await import(pathToFileURL(path.join(backend, 'scripts/c9-occupancy-proof.mjs')).href);
  const excluded = new Set([5432, 55611, 4177]);
  const port = await freePort(excluded); excluded.add(port);
  const httpPort = await freePort(excluded);
  fs.mkdirSync(output, { mode: 0o700 }); // execution only; no reuse or earlier evidence overwrite
  fs.writeFileSync(path.join(output, 'loopback-only.cjs'), fenceBytes, { flag: 'wx', mode: 0o600 });
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
    ...WIDGETS_LIVE_TEST_LITERALS, LANG: 'C', LC_ALL: 'C',
    NODE_OPTIONS: `--max-old-space-size=${caps.nodeHeapMb} --require=${output}/loopback-only.cjs`,
    PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1',
    DATABASE_URL: `postgresql://maya_gate@127.0.0.1:${port}/${database}`,
    HTTP_SMOKE_PORT: String(httpPort),
  };
  const report = {
    contract: 'maya.local-canonical-smoke-rerun/1', status: 'RUNNING', source, tree,
    started: new Date().toISOString(), output, cluster, port, httpPort, database, caps,
    launcherSha256: sha(fs.readFileSync(launcher)), nodeFenceSha256: sha(fenceBytes),
    sourceHashes, compiledEntrySha256, compiledEntryBinding: 'byte hash only; source build qualification is separate',
    qualification: 'Canonical local smoke only; no schema-diff, release, language, real-model or real-provider acceptance',
    externalNodeNetwork: 'loopback-only TCP preload; not a measured external call count',
    commands: [], completed: [], failures: [], clusterStopped: false,
  };
  const reportPath = path.join(output, 'manifest.json');
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const control = { cancelled: null, terminateActive: null, activeCleanup: false };
  const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
  function cancel(signal) {
    control.cancelled ??= signal;
    if (!control.activeCleanup) control.terminateActive?.();
  }
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  const pg = (name, executable, args) => ({ name, command: path.join(pgBin, executable), args, cwd: backend, timeoutMs: name === 'pg-stop' ? caps.pgCleanupMs : caps.pgStageMs });
  const node = (name, args) => ({ name, command: process.execPath, args, cwd: backend, timeoutMs: caps.nodeStageMs });
  const ownedSmoke = { stop: null };
  async function run(spec, smoke = false) {
    report.commands.push(spec);
    if (spec.name === 'pg-stop') { try { save(); } catch (error) { report.manifestWriteError = error.message; } }
    else save();
    const started = performance.now();
    process.stdout.write(`START ${spec.name}\n`);
    try {
      if (smoke) await runSmokeGroup(spec, env, control, report, ownedSmoke);
      else await runCommand(spec, env, output, control);
      report.completed.push({ name: spec.name, elapsedMs: Math.round(performance.now() - started) });
      process.stdout.write(`PASS ${spec.name}\n`);
    } catch (error) {
      report.failures.push({ name: spec.name, error: error.message, elapsedMs: Math.round(performance.now() - started) });
      throw error;
    } finally { save(); }
  }
  let startAttempted = false;
  try {
    save();
    await run(pg('pg-init', 'initdb', ['-D', cluster, '--auth=trust', '--username=maya_gate', '--encoding=UTF8', '--locale=C']));
    startAttempted = true;
    await run(pg('pg-start', 'pg_ctl', ['-D', cluster, '-w', '-t', '30', '-l', path.join(output, 'postgres-private.log'), '-o', `-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`, 'start']));
    await run(pg('db-create', 'createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', 'maya_gate', database]));
    await run(node('prisma-validate', ['node_modules/prisma/build/index.js', 'validate']));
    await run(node('prisma-migrate', ['node_modules/prisma/build/index.js', 'migrate', 'deploy']));
    await run(node('prisma-status', ['node_modules/prisma/build/index.js', 'migrate', 'status']));
    await run(node('smoke-seed', ['node_modules/ts-node/dist/bin.js', '--transpile-only', 'prisma/seed.ts']));
    await run({ ...node('http-smoke', ['node_modules/ts-node/dist/bin.js', '--project', 'tsconfig.scripts.json', '--transpile-only', 'scripts/http-smoke.ts']), timeoutMs: caps.smokeMs }, true);
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL'; report.error = error.message; process.exitCode = 1;
  } finally {
    // Smoke failure, cancellation or logging errors never skip the independent PG cleanup attempt.
    try { await ownedSmoke.stop?.(); }
    catch (error) { report.status = 'FAIL'; report.smokeCleanupError = error.message; process.exitCode = 1; }
    if (startAttempted) {
      try {
        await run(pg('pg-stop', 'pg_ctl', ['-D', cluster, '-m', 'fast', '-w', '-t', '30', 'stop']));
        report.pidfileAbsent = !fs.existsSync(path.join(cluster, 'postmaster.pid'));
        report.clusterStopped = report.pidfileAbsent;
        assert.ok(report.clusterStopped, 'owned_pg_cleanup_unconfirmed');
      } catch (error) { report.status = 'FAIL'; report.pgCleanupError = error.message; process.exitCode = 1; }
    }
    try {
      report.sourceAtEnd = git('rev-parse', 'HEAD');
      report.treeAtEnd = git('rev-parse', 'HEAD^{tree}');
      report.dirtyAtEnd = git('status', '--porcelain');
      report.compiledEntrySha256AtEnd = sha(fs.readFileSync(compiledEntry));
      report.launcherSha256AtEnd = sha(fs.readFileSync(launcher));
      report.nodeFenceSha256AtEnd = sha(fs.readFileSync(path.join(output, 'loopback-only.cjs')));
      report.sourceUnchanged = report.sourceAtEnd === source && report.treeAtEnd === tree && !report.dirtyAtEnd;
      report.compiledEntryUnchanged = report.compiledEntrySha256AtEnd === compiledEntrySha256;
      report.harnessUnchanged = report.launcherSha256AtEnd === report.launcherSha256 && report.nodeFenceSha256AtEnd === report.nodeFenceSha256;
      if (!report.sourceUnchanged || !report.compiledEntryUnchanged || !report.harnessUnchanged) { report.status = 'FAIL_SOURCE_CHANGED'; process.exitCode = 1; }
    } catch (error) { report.status = 'FAIL'; report.sourceCheckError = error.message; process.exitCode = 1; }
    report.cancelled = control.cancelled;
    if (control.cancelled && report.status === 'PASS') { report.status = 'FAIL_CANCELLED'; process.exitCode = 1; }
    report.finished = new Date().toISOString();
    try { save(); }
    finally { process.off('SIGINT', onInt); process.off('SIGTERM', onTerm); }
    if (report.status !== 'PASS') process.exitCode = 1;
  }
}

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === '--describe')) {
  process.stdout.write(JSON.stringify({ status: 'PREPARED_NOT_RUN', output, pgBin, database, caps, activation: '--run after parent serial-slot handoff' }, null, 2) + '\n');
} else if (args.length === 1 && args[0] === '--run') {
  await main();
} else {
  process.stderr.write('Unsupported arguments; use --describe or --run.\n');
  process.exitCode = 2;
}
