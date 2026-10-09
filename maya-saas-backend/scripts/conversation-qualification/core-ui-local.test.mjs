import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readUiLaunchFile, finishUiLaunch } from './core-ui-local.mjs';
function file(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-ui-launch-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = path.join(dir, 'plan.json');
  fs.writeFileSync(p, '{"synthetic":true}\n', { mode: 0o600 });
  return p;
}
test('launcher reads a bounded owner file; symlink, hardlink, oversized or writable input refuses', (t) => {
  const p = file(t);
  assert.equal(readUiLaunchFile(p).toString(), '{"synthetic":true}\n');
  const link = p + '.link';
  fs.symlinkSync(p, link);
  assert.throws(() => readUiLaunchFile(link));
  fs.unlinkSync(link);
  fs.linkSync(p, link);
  assert.throws(() => readUiLaunchFile(p));
  fs.unlinkSync(link);
  fs.chmodSync(p, 0o666);
  assert.throws(() => readUiLaunchFile(p));
  fs.chmodSync(p, 0o600);
  fs.writeFileSync(p, 'x'.repeat(16385));
  assert.throws(() => readUiLaunchFile(p));
});
test('a pathname replaced during read cannot pass checks on the original opened fd', (t) => {
  const p = file(t),
    read = fs.readSync;
  let replaced = false;
  t.mock.method(fs, 'readSync', (...args) => {
    const n = read(...args);
    if (!replaced) {
      replaced = true;
      fs.renameSync(p, p + '.old');
      fs.writeFileSync(p, '{"synthetic":true}\n', { mode: 0o600 });
    }
    return n;
  });
  assert.throws(() => readUiLaunchFile(p), /core_ui_launch_file_changed/);
});
test('cancellation arriving during cleanup cannot report completion and every finalizer still runs', async () => {
  const calls = [];
  let cancelled = false;
  await assert.rejects(
    finishUiLaunch({
      stopRunner: async () => {
        calls.push('runner');
      },
      stopBroker: async () => {
        calls.push('broker');
        cancelled = true;
      },
      closeLog: () => calls.push('log'),
      removeSignals: () => calls.push('signals'),
      cancelled: () => cancelled,
    }),
    /core_ui_cancelled/,
  );
  assert.deepEqual(calls, ['runner', 'broker', 'log', 'signals']);
});
test('runner, broker and log cleanup failures do not skip remaining independent finalizers', async () => {
  for (const failing of ['runner', 'broker', 'log']) {
    const calls = [];
    const finish = (name) => () => {
      calls.push(name);
      if (name === failing) throw new Error('synthetic failure');
    };
    await assert.rejects(
      finishUiLaunch({
        stopRunner: finish('runner'),
        stopBroker: finish('broker'),
        closeLog: finish('log'),
        removeSignals: finish('signals'),
        cancelled: () => false,
      }),
      /core_ui_cleanup_unconfirmed/,
    );
    assert.deepEqual(calls, ['runner', 'broker', 'log', 'signals']);
  }
});
