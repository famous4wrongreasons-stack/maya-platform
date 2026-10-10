// Real owned child/IPC/loopback relay only: no AppModule, credentials, DB or upstream.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import test from 'node:test';
import { runReadRuntime, createDiagnostic } from './local-yclients-read.mjs';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function exercise({ cancel = false, repeat = false, summary = true, hang = false } = {}) {
  const apiPort = await freePort(), webPort = await freePort();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-read-lifecycle-'));
  const pidFile = path.join(directory, 'child.pid');
  const fixture = `
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    const keep = setInterval(() => {}, 1000);
    process.once('SIGTERM', () => {
      if (${hang}) return;
      setTimeout(() => {
        const finish = () => { clearInterval(keep); process.disconnect(); };
        if (${summary}) process.send({type:'read-summary',contract:'maya.local-yclients-read/1',calls:0,refused:0,routes:{}}, finish);
        else finish();
      }, 150);
    });
    process.send({type:'ready',contract:'maya.local-yclients-read/1',origin:'http://127.0.0.1:${apiPort}',providerAdmission:'explicit_setup_reads_only'});
  `;
  const plan = { diagnosticNoProvider: false, providerAdmission: 'explicit_setup_reads_only', durationMs: 100,
    runtime: { command: process.execPath, args: ['-e', fixture] } };
  const control = { cancelled: null, terminate: null };
  const manifest = { diagnostic: createDiagnostic(false) };
  let scheduled = false, error;
  const save = () => {
    if (cancel && !scheduled && manifest.status === 'ready') {
      scheduled = true;
      setImmediate(() => {
        control.cancelled = 'SIGINT';
        const terminate = control.terminate;
        terminate();
        if (repeat) { terminate(); setTimeout(terminate, 25); }
      });
    }
  };
  try {
    try {
      await runReadRuntime(plan, { PORT: String(apiPort), CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`, PATH: '/usr/bin:/bin' }, directory, control, manifest, save);
    } catch (caught) { error = caught; }
    assert.equal(manifest.runtimeGroupAbsent, true);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal(control.terminate, null);
    return { manifest, error };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

for (const [name, options] of [
  ['TTL', {}], ['owner cancel', { cancel: true }],
  ['repeated owner cancel', { cancel: true, repeat: true }],
]) test(`${name} preserves one clean IPC summary and removes the owned process`, async () => {
  const { manifest, error } = await exercise(options);
  assert.equal(error, undefined, JSON.stringify(manifest));
  assert.equal(manifest.providerReadSummaryStatus, 'reported_at_clean_stop');
  assert.deepEqual(manifest.providerReadSummary, { calls: 0, refused: 0, routes: {} });
  assert.equal(manifest.diagnostic.firstFailure, null);
  assert.deepEqual(manifest.diagnostic.cleanupFailures, []);
});

test('a genuinely absent receipt stays a failure even after clean process exit', async () => {
  const { manifest, error } = await exercise({ cancel: true, summary: false });
  assert.ok(error);
  assert.equal(manifest.providerReadSummary, null);
  assert.equal(manifest.diagnostic.firstFailure.code, 'runtime_summary_missing');
});

test('a transient denied existence probe waits for actual absence without a second signal', async (t) => {
  const kill = process.kill.bind(process);
  let signals = 0, denied = false;
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid < 0 && signal === 'SIGTERM') signals++;
    if (pid < 0 && signal === 0 && signals > 0 && !denied) {
      denied = true;
      throw Object.assign(new Error('Synthetic denied existence probe'), { code: 'EPERM' });
    }
    return kill(pid, signal);
  });
  const { manifest, error } = await exercise({ cancel: true });
  assert.equal(denied, true);
  assert.equal(signals, 1);
  assert.equal(error, undefined, JSON.stringify(manifest));
  assert.equal(manifest.providerReadSummaryStatus, 'reported_at_clean_stop');
});

test('unresponsive child still hits the existing finite kill deadline; no false summary', { timeout: 15000 }, async () => {
  const { manifest, error } = await exercise({ cancel: true, hang: true });
  assert.ok(error);
  assert.equal(manifest.providerReadSummary, null);
  assert.equal(manifest.providerReadSummaryStatus, 'missing_or_unclean');
  assert.equal(manifest.diagnostic.firstFailure.code, 'runtime_summary_missing');
});
