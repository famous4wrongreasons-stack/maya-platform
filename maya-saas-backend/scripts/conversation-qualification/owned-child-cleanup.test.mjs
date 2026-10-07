import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { trackOwnedChild } from './owned-child-cleanup.mjs';
function child() {
  const c = new EventEmitter();
  c.exitCode = null;
  c.signalCode = null;
  c.signals = [];
  c.kill = (signal) => {
    c.signals.push(signal);
    return false;
  };
  return c;
}
test('spawn error without exit settles cleanup', async () => {
  const c = child(),
    stop = trackOwnedChild(c);
  c.emit('error', new Error('synthetic EAGAIN'));
  await stop();
  assert.deepEqual(c.signals, []);
});
test('live child gets TERM then KILL and settles on close', async () => {
  const c = child(),
    stop = trackOwnedChild(c);
  c.kill = (signal) => {
    c.signals.push(signal);
    if (signal === 'SIGKILL') c.emit('close');
    return true;
  };
  await stop({ graceMs: 5, killWaitMs: 5 });
  assert.deepEqual(c.signals, ['SIGTERM', 'SIGKILL']);
});
test('unconfirmed child termination rejects within a bound', async () => {
  const c = child(),
    stop = trackOwnedChild(c);
  await assert.rejects(
    stop({ graceMs: 5, killWaitMs: 5 }),
    /cleanup_unconfirmed/,
  );
  assert.deepEqual(c.signals, ['SIGTERM', 'SIGKILL']);
});
