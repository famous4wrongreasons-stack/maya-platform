import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import {
  assertOwnedStageTimeout,
  runOwnedStage,
  trackOwnedChild,
} from './owned-child-cleanup.mjs';
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_FOLLOWUP_PROFILE,
} from './current-candidate-budget.mjs';
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

test('default and explicit A retain the existing inclusive 12-minute stage ceiling', () => {
  for (const profile of [undefined, CORE_DIAGNOSTIC_PROFILE]) {
    assertOwnedStageTimeout(1, profile);
    assertOwnedStageTimeout(720000, profile);
    assert.throws(() => assertOwnedStageTimeout(720001, profile), {
      message: 'owned_stage_timeout_invalid',
    });
  }
});

test('only explicit B admits its finite diagnostic and harness allowance', () => {
  assertOwnedStageTimeout(1200000, CORE_FOLLOWUP_PROFILE);
  assertOwnedStageTimeout(1260000, CORE_FOLLOWUP_PROFILE);
  assert.throws(() => assertOwnedStageTimeout(1260001, CORE_FOLLOWUP_PROFILE), {
    message: 'owned_stage_timeout_invalid',
  });
  for (const profile of [
    'unknown',
    CORE_FOLLOWUP_PROFILE + '\n',
    { maxMs: Infinity },
  ])
    assert.throws(() => assertOwnedStageTimeout(1200000, profile), {
      message: 'core_profile_refused',
    });
});

test('neither profile accepts zero, fractional, nonnumeric or unbounded stage durations', () => {
  for (const profile of [CORE_DIAGNOSTIC_PROFILE, CORE_FOLLOWUP_PROFILE])
    for (const value of [0, -1, 1.1, NaN, Infinity, '1200000', null])
      assert.throws(() => assertOwnedStageTimeout(value, profile), {
        message: 'owned_stage_timeout_invalid',
      });
});

test('an omitted B opt-in refuses before file creation or child spawn', async () => {
  await assert.rejects(
    runOwnedStage(
      { timeoutMs: 1200000 },
      {},
      '/NEVER_CREATED_STAGE_OUTPUT',
      { cancelled: null },
      {},
    ),
    { message: 'owned_stage_timeout_invalid' },
  );
});
