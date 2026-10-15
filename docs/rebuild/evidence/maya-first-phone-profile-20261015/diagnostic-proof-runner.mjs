// Offline first-operator bootstrap proof, using only artificial credentials. Never reuses a cluster, DB, env file or output.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const backend = '/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-local-crm-setup-20261010/maya-saas-backend';
const { values } = parseArgs({ options: { run: { type: 'boolean' }, output: { type: 'string' } } });
assert.equal(values.run, true, 'Explicit --run required');
assert.ok(values.output && path.isAbsolute(values.output) && !fs.existsSync(values.output), 'New absolute output required');
for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false);
fs.mkdirSync(values.output, { mode: 0o700 });
const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-approval-source-'));
const cluster = path.join(privateRoot, 'pg'), pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const portServer = net.createServer();
await new Promise((resolve, reject) => { portServer.once('error', reject); portServer.listen(0, '127.0.0.1', resolve); });
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const database = 'maya_widget_gate_proof_approval_source_' + randomBytes(6).toString('hex');
const env = { DATABASE_URL: `postgresql://staging_proof@127.0.0.1:${port}/${database}`, NODE_ENV: 'test', NODE_OPTIONS: '--max-old-space-size=3072', LANG: 'C', TZ: 'UTC' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
env.PATH = '/private/tmp/maya-cert-node22-20261013/node-v22.23.3-darwin-arm64/bin:/opt/homebrew/opt/python@3.11/libexec/bin:' + env.PATH;
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: backend, encoding: 'utf8' }).trim();
const sourceDirty = execFileSync('git', ['status', '--porcelain'], { cwd: backend, encoding: 'utf8' }).trim().length > 0;
const manifest = { productSourceSha256: execFileSync('/usr/bin/shasum', ['-a', '256', 'src/crm/yclients-goods-receipt.ts'], {cwd:backend,encoding:'utf8'}).trim().split(' ')[0], sourceFileSha256: execFileSync('/usr/bin/shasum', ['-a', '256', 'test/widgets-live/approval-source-boundary.live-spec.ts'], {cwd:backend,encoding:'utf8'}).trim().split(' ')[0], sourceHead, sourceDirty, kind: 'first-phone-restricted-profile-isolated-proof', cluster, database, port, status: 'running', completed: [], productionSigningKeysCreated: false, artificialEphemeralTestSigners: true, syntheticTenants: true, externalCalls: 0, externalProviderAcceptance: false, realModelAcceptance: false, certificate: 'NOT_ISSUED', resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, jestWorkers: 1, browserCount: 0 } };
const save = () => fs.writeFileSync(path.join(values.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
let cancelled = null, activeChild = null, activeCleanup = false;
const cancel = (signal) => {
  cancelled ??= signal;
  manifest.cancelledBy = cancelled;
  save();
  // Only the directly owned stage. Its browser receives IPC disconnect and
  // cleans its own Chrome child; PostgreSQL is stopped by the outer finally.
  if (!activeCleanup) activeChild?.kill('SIGTERM');
};
const onInt = () => cancel('SIGINT'), onTerm = () => cancel('SIGTERM');
process.on('SIGINT', onInt);
process.on('SIGTERM', onTerm);
async function run(name, command, args, extra = {}, cwd = backend) {
  const cleanup = name === 'pg-stop';
  if (cancelled && !cleanup) throw new Error('Proof cancelled: ' + cancelled);
  console.log(name);
  const fd = fs.openSync(path.join(values.output, name + '.log'), 'wx', 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: ['ignore', fd, fd] });
      activeChild = child; activeCleanup = cleanup;
      let killTimer;
      const terminate = () => {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      // Cancellation and timeout both have a bounded TERM → KILL path.
      const onCancel = () => { if (!cleanup) terminate(); };
      process.on('SIGINT', onCancel); process.on('SIGTERM', onCancel);
      const timer = setTimeout(terminate, cleanup ? 45_000 : name === 'scoped-mutations' ? 1200000 : 240_000);
      const done = () => {
        clearTimeout(timer); clearTimeout(killTimer);
        process.off('SIGINT', onCancel); process.off('SIGTERM', onCancel);
        activeChild = null; activeCleanup = false;
      };
      child.once('error', e => { done(); reject(e); });
      child.once('close', code => {
        done();
        code === 0 && (!cancelled || cleanup)
          ? resolve()
          : reject(new Error(`${name} exited ${code}${cancelled ? '; cancelled: ' + cancelled : ''}; inspect its log`));
      });
    });
    manifest.completed.push(name); save();
  } finally { fs.closeSync(fd); }
}
const pg = (name) => path.join(pgBin, name), pgArgs = ['-D', cluster, '-w', '-t', '30'];
const stage = (name) => run(name, '/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))', process.execPath, 'node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--runTestsByPath', 'test/widgets-live/approval-source-boundary.live-spec.ts', '--runInBand', '--json', '--outputFile=' + path.join(values.output, name + '-jest.json')]);
let startAttempted = false;
save();
try {
  await run('network-isolation', '/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))', '/opt/homebrew/opt/python@3.11/bin/python3.11', '-c', 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(); c=socket.socket(); c.connect(s.getsockname()); c.close(); s.close(); s=socket.socket(); s.settimeout(1);\ntry: s.connect(("192.0.2.1",443)); raise AssertionError("external admitted")\nexcept PermissionError: print("loopback PASS; external REFUSED")\nfinally: s.close()']);
  await run('live-types', process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'test/tsconfig.widgets-live.json']);
  await run('initdb', pg('initdb'), ['-D', cluster, '--auth=trust', '--username=staging_proof', '--encoding=UTF8', '--locale=C']);
  startAttempted = true;
  await run('pg-start', pg('pg_ctl'), [...pgArgs, '-l', path.join(values.output, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`, 'start']);
  await run('createdb', pg('createdb'), ['--host=127.0.0.1', '--port=' + port, '--username=staging_proof', database]);
  await run('migrations', process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await stage('first-phone-http-pg');
  await run('first-phone-unit', process.execPath, ['node_modules/jest/bin/jest.js', '--runTestsByPath', 'src/entitlements/widget-release-first-phone.spec.ts', 'src/entitlements/widget-release-source-scope.spec.ts', 'src/entitlements/widget-release-profile.contract.spec.ts', 'src/crm/adapters/yclients-goods-receipt.spec.ts', '--runInBand', '--json', '--outputFile=' + path.join(values.output, 'unit-jest.json')]);

  await run('scoped-mutations', '/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip \"localhost:*\"))', process.execPath, 'scripts/widgets-mutation-battery.mjs', '--gate', 'FP', '--unit-tests', 'entitlements/widget-release-(first-phone|source-scope)', '--live-tests', 'approval-source-boundary.live-spec.ts', '--out', path.join(values.output, 'scoped-mutations.json')]);

  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd:backend,encoding:'utf8'}).trim(), sourceHead);
  manifest.status = 'passed';
} catch (e) { manifest.status = 'failed'; throw e; }
finally {
  if (startAttempted) {
    try { await run('pg-stop', pg('pg_ctl'), [...pgArgs, '-m', 'fast', 'stop']); manifest.clusterStopped = true; }
    catch { manifest.status = 'failed-stop'; manifest.clusterStopped = false; }
  }
  save();
  process.off('SIGINT', onInt); process.off('SIGTERM', onTerm);
}
assert.equal(manifest.status, 'passed');
console.log('Proof passed; owned services stopped: ' + values.output);
