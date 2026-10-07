// Explicit narrow local proof. Never reuses a cluster, DB, env file or output.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { run: { type: 'boolean' }, output: { type: 'string' }, 'browser-only': {type: 'boolean', default: false} } });
assert.equal(values.run, true, 'Explicit --run and parent heavy-slot authorization required');
assert.ok(values.output && path.isAbsolute(values.output) && !fs.existsSync(values.output), 'New absolute output required');
for (const name of ['.env', '.env.local']) assert.equal(fs.existsSync(path.join(backend, name)), false);
fs.mkdirSync(values.output, { mode: 0o700 });
const privateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-booking-confirmation-'));
const cluster = path.join(privateRoot, 'pg'), pgBin = '/opt/homebrew/opt/postgresql@16/bin';
const portServer = net.createServer();
await new Promise((resolve, reject) => { portServer.once('error', reject); portServer.listen(0, '127.0.0.1', resolve); });
const port = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));
const database = 'maya_widget_gate_proof_bookingconfirmation_' + randomBytes(6).toString('hex');
const env = { DATABASE_URL: `postgresql://booking_confirmation_proof@127.0.0.1:${port}/${database}`, NODE_ENV: 'test', NODE_OPTIONS: '--max-old-space-size=3072', LANG: 'C', TZ: 'UTC' };
for (const key of ['PATH', 'HOME', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
const manifest = { kind: 'booking-confirmation-http-react-local-proof', browserOnly: values['browser-only'], cluster, database, port, status: 'running', completed: [], syntheticModel: true, syntheticInternalCatalog: true, syntheticLocalProvider: true, externalProviderAcceptance: false, realModelAcceptance: false, certificate: 'NOT_ISSUED', resources: { nodeHeapMb: 3072, pgSharedBuffersMb: 64, jestWorkers: 1, browserCount: 1 } };
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
      const timer = setTimeout(terminate, cleanup ? 45_000 : 240_000);
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
const probe = () => run('browser', process.execPath, ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--testRegex', 'booking-confirmation-react\\.probe-spec\\.ts$', '--runInBand', '--runTestsByPath', 'test/widgets-live/booking-confirmation-react.probe-spec.ts', '--json', '--outputFile=' + path.join(values.output, 'browser-jest.json')], { JEST_BOOKING_CONFIRMATION_OUTPUT: values.output });
let startAttempted = false;
save();
try {
  await run('initdb', pg('initdb'), ['-D', cluster, '--auth=trust', '--username=booking_confirmation_proof', '--encoding=UTF8', '--locale=C']);
  startAttempted = true;
  await run('pg-start', pg('pg_ctl'), [...pgArgs, '-l', path.join(values.output, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=64MB -c work_mem=4MB -c max_connections=30`, 'start']);
  await run('createdb', pg('createdb'), ['--host=127.0.0.1', '--port=' + port, '--username=booking_confirmation_proof', database]);
  await run('migrations', process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  await run('react-web-build', process.execPath, ['build.mjs', '--target=web'], {}, path.resolve(backend, '../maya-carrier-react'));
  if (!values['browser-only']) await run('http-booking', process.execPath, ['node_modules/jest/bin/jest.js', '--config', 'test/jest-widgets-live.json', '--runInBand', '--runTestsByPath', 'test/widgets-live/chat-catalog-booking.live-spec.ts', 'test/widgets-live/provider-unknown.live-spec.ts', '--json', '--outputFile=' + path.join(values.output, 'http-booking-jest.json')]);
  await probe();
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
