import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalAbBudget } from './core-local-ab-budget.mjs';
import {
  candidateReservation,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
} from './current-candidate-budget.mjs';

const body = (content) =>
  JSON.stringify({
    model: CORE_DIAGNOSTIC_LIMITS.model,
    messages: [{ role: 'user', content }],
    max_tokens: 2048,
    stream: false,
    thinking: { type: 'disabled' },
  });
const maximum = candidateReservation(
  'https://api.deepseek.com/chat/completions',
  {
    method: 'POST',
    body: body(
      'x'.repeat(
        CORE_DIAGNOSTIC_LIMITS.requestBytes - Buffer.byteLength(body('')),
      ),
    ),
  },
  CORE_DIAGNOSTIC_PROFILE,
);

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-ab-budget-'));
  const ledgerPath = path.join(root, 'budget.jsonl');
  let clock = 1000;
  const settings = { ledgerPath, now: () => clock };
  const budget = createLocalAbBudget(settings);
  t.after(() => {
    try {
      budget.close();
    } catch {
      /* Explicit I/O failure tests still clean their own directory. */
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    budget,
    settings,
    ledgerPath,
    set: (at) => {
      clock = at;
    },
    advance: (ms = 6000) => {
      clock += ms;
    },
    rows: () =>
      fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').map(JSON.parse),
  };
}

test('fresh A+B reserves all 36 bounded calls durably, never writes message or credentials', (t) => {
  const f = fixture(t),
    b = f.budget;
  let synced = 0;
  const realSync = fs.fsyncSync;
  const sync = t.mock.method(fs, 'fsyncSync', (fd) => {
    synced++;
    return realSync(fd);
  });
  for (const [stage, count] of [
    ['A', 12],
    ['B', 24],
  ]) {
    b.beginStage(stage);
    for (let i = 0; i < count; i++) {
      const before = synced;
      b.reserve(stage, maximum);
      assert.equal(synced, before + 1);
      assert.equal(f.rows().at(-1).event, 'reserved');
      assert.equal(f.rows().at(-1).attempt, b.stats.attempts);
      f.advance();
    }
    b.completeStage(stage, true);
  }
  const stats = b.close();
  sync.mock.restore();
  assert.equal(stats.attempts, 36);
  assert.equal(stats.stages.A.attempts, 12);
  assert.equal(stats.stages.B.attempts, 24);
  assert.equal(stats.reservedNanoUsd, maximum.nanoUsd * 36);
  assert.ok(stats.stages.A.reservedNanoUsd <= 2_000_000_000);
  assert.ok(stats.stages.B.reservedNanoUsd <= 4_000_000_000);
  assert.ok(stats.reservedNanoUsd <= 6_000_000_000);
  assert.equal(stats.halted, false);
  assert.equal(stats.closed, true);
  assert.ok(Object.isFrozen(stats.stages.A));
  assert.equal(fs.statSync(f.ledgerPath).mode & 0o777, 0o600);
  assert.deepEqual(f.rows()[0].limits, {
    attempts: 36,
    spendNanoUsd: 6_000_000_000,
    durationMs: 1_800_000,
    A: { attempts: 12, spendNanoUsd: 2_000_000_000, durationMs: 600_000 },
    B: { attempts: 24, spendNanoUsd: 4_000_000_000, durationMs: 1_200_000 },
  });
  const reserved = f.rows().filter((row) => row.event === 'reserved');
  assert.ok(
    reserved.every((row) =>
      Object.values(row).every(
        (v) => typeof v === 'number' || ['reserved', 'A', 'B'].includes(v),
      ),
    ),
  );
  assert.equal(f.rows().at(-1).event, 'closed');
  assert.equal(f.rows().at(-1).reservedNanoUsd, maximum.nanoUsd * 36);
});

test('A and B call ceilings are inclusive and an extra attempt irreversibly halts', (t) => {
  for (const stage of ['A', 'B']) {
    const f = fixture(t),
      b = f.budget;
    b.beginStage('A');
    if (stage === 'B') {
      for (let i = 0; i < 12; i++) {
        b.reserve('A', maximum);
        f.advance();
      }
      b.completeStage('A', true);
      b.beginStage('B');
    }
    for (let i = 0; i < (stage === 'A' ? 12 : 24); i++) {
      b.reserve(stage, maximum);
      f.advance();
    }
    const before = b.stats;
    assert.throws(() => b.reserve(stage, maximum), /local_ab_attempt_limit/);
    assert.equal(b.stats.reservedNanoUsd, before.reservedNanoUsd);
    assert.equal(b.stats.attempts, stage === 'A' ? 12 : 36);
    assert.equal(b.stats.halted, true);
    assert.throws(() => b.beginStage('B'), /local_ab_halted/);
  }
});

test('only A then explicitly clean B may start, each exactly once', (t) => {
  for (const setup of [
    (b) => b.beginStage('B'),
    (b) => {
      b.beginStage('A');
      b.beginStage('A');
    },
    (b) => {
      b.beginStage('A');
      b.completeStage('A', true);
      b.beginStage('A');
    },
    (b) => {
      b.beginStage('A');
      b.completeStage('A', 'true');
    },
    (b) => b.reserve('A', maximum),
    (b) => b.beginStage('C'),
  ]) {
    const f = fixture(t);
    assert.throws(() => setup(f.budget), /local_ab_stage_order/);
    assert.equal(f.budget.stats.halted, true);
    assert.throws(() => f.budget.beginStage('A'), /local_ab_halted/);
  }
});

test('failed or UNKNOWN A retains its reservation and permanently forbids B', (t) => {
  for (const ending of ['failed', 'unknown', 'private-error']) {
    const f = fixture(t),
      b = f.budget;
    b.beginStage('A');
    b.reserve('A', maximum);
    if (ending === 'failed') b.completeStage('A', false);
    else b.halt(ending);
    assert.equal(b.stats.reservedNanoUsd, maximum.nanoUsd);
    assert.equal(b.stats.attempts, 1);
    assert.throws(() => b.beginStage('B'), /local_ab_halted/);
    b.close();
    assert.equal(f.rows().at(-1).reservedNanoUsd, maximum.nanoUsd);
    assert.equal(
      fs.readFileSync(f.ledgerPath, 'utf8').includes('private-error'),
      false,
    );
    assert.equal(
      b.stats.haltReason,
      ending === 'failed'
        ? 'stage_failed'
        : ending === 'unknown'
          ? 'unknown'
          : 'explicit_halt',
    );
  }
});

test('the six-second interval crosses the clean A→B boundary and early reserve latches', (t) => {
  const f = fixture(t),
    b = f.budget;
  b.beginStage('A');
  b.reserve('A', maximum);
  b.completeStage('A', true);
  b.beginStage('B');
  assert.equal(b.stats.lastReservedAt, 1000);
  f.advance(5999);
  assert.throws(() => b.reserve('B', maximum), /local_ab_spacing_limit/);
  f.advance(1);
  assert.throws(() => b.reserve('B', maximum), /local_ab_halted/);
  assert.equal(b.stats.attempts, 1);
});

test('construction starts the 30-minute clock, each stage clamps, exact expiry halts', (t) => {
  const f = fixture(t),
    b = f.budget;
  assert.equal(b.startedAt, 1000);
  assert.equal(b.expiresAt, 1_801_000);
  f.advance(900_000);
  assert.deepEqual(b.beginStage('A'), {
    stage: 'A',
    startedAt: 901_000,
    expiresAt: 1_501_000,
  });
  b.completeStage('A', true);
  assert.equal(b.beginStage('B').expiresAt, b.expiresAt);
  f.set(b.expiresAt);
  assert.throws(() => b.reserve('B', maximum), /local_ab_wall_time_limit/);
  const g = fixture(t);
  g.budget.beginStage('A');
  g.advance(600_000);
  assert.throws(
    () => g.budget.completeStage('A', true),
    /local_ab_stage_time_limit/,
  );
  assert.throws(() => g.budget.beginStage('B'), /local_ab_halted/);
});

test('rollback, nonfinite and throwing clocks fail closed without logging raw errors', (t) => {
  for (const at of [999, NaN, Infinity]) {
    const f = fixture(t);
    f.budget.beginStage('A');
    f.set(at);
    assert.throws(
      () => f.budget.reserve('A', maximum),
      /local_ab_clock_invalid/,
    );
    assert.equal(f.budget.stats.halted, true);
  }
  assert.throws(
    () =>
      createLocalAbBudget({
        ledgerPath: '/never-created',
        now: () => {
          throw new Error('PRIVATE_CLOCK');
        },
      }),
    { message: 'local_ab_clock_invalid' },
  );
});

test('malformed or underpriced reservations cannot bypass the existing formula or leak fields', (t) => {
  for (const reservation of [
    { ...maximum, nanoUsd: maximum.nanoUsd - 1 },
    { ...maximum, input: maximum.input + 1 },
    { ...maximum, output: 2049 },
    { ...maximum, input: Infinity },
    { ...maximum, content: 'PRIVATE_SYNTHETIC_CONTENT' },
    Object.defineProperty({}, 'input', {
      get() {
        throw new Error('PRIVATE_GETTER');
      },
    }),
  ]) {
    const f = fixture(t);
    f.budget.beginStage('A');
    assert.throws(
      () => f.budget.reserve('A', reservation),
      /local_ab_reservation_invalid/,
    );
    assert.equal(f.budget.stats.attempts, 0);
    assert.equal(f.budget.stats.halted, true);
    assert.equal(
      fs.readFileSync(f.ledgerPath, 'utf8').includes('PRIVATE'),
      false,
    );
  }
});

test('fsync failure after reservation is UNKNOWN, retains counters, and cannot admit B', (t) => {
  const f = fixture(t),
    b = f.budget;
  b.beginStage('A');
  const sync = t.mock.method(fs, 'fsyncSync', () => {
    throw new Error('PRIVATE_IO_PATH');
  });
  try {
    assert.throws(() => b.reserve('A', maximum), {
      message: 'local_ab_ledger_io',
    });
  } finally {
    sync.mock.restore();
  }
  assert.equal(b.stats.reservedNanoUsd, maximum.nanoUsd);
  assert.equal(b.stats.lastReservedAt, 1000);
  assert.equal(b.stats.haltReason, 'ledger_io');
  assert.throws(() => b.beginStage('B'), /local_ab_halted/);
  assert.throws(() => b.close(), /local_ab_ledger_io/);
  assert.equal(b.stats.closed, true);
  assert.equal(
    fs.readFileSync(f.ledgerPath, 'utf8').includes('PRIVATE'),
    false,
  );
});

test('close is durable and idempotent, unfinished sessions halt, any restart refuses', (t) => {
  const f = fixture(t),
    b = f.budget;
  b.beginStage('A');
  b.reserve('A', maximum);
  b.close();
  assert.equal(b.stats.haltReason, 'incomplete');
  const before = fs.readFileSync(f.ledgerPath, 'utf8');
  assert.throws(() => createLocalAbBudget(f.settings), {
    message: 'local_ab_ledger_create_refused',
  });
  b.close();
  assert.equal(fs.readFileSync(f.ledgerPath, 'utf8'), before);
  assert.throws(() => b.beginStage('B'), /local_ab_closed/);
});

test('prior zero-input timeout deducts A active time and preserves original absolute deadline', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-ab-prior-budget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const b = createLocalAbBudget({
    ledgerPath: path.join(root, 'ledger'),
    now: () => 100000,
    priorInputMs: 30405,
    absoluteExpiresAt: 1000000,
  });
  assert.equal(b.expiresAt, 1000000);
  assert.equal(b.beginStage('A').expiresAt, 100000 + 600000 - 30405);
  assert.equal(b.stats.attempts, 0);
  assert.equal(b.stats.reservedNanoUsd, 0);
  b.close();
  const expired = path.join(root, 'expired');
  assert.throws(
    () =>
      createLocalAbBudget({
        ledgerPath: expired,
        now: () => 100000,
        priorInputMs: 30405,
        absoluteExpiresAt: 100000,
      }),
    /wall_time_limit/,
  );
  assert.equal(fs.existsSync(expired), false);
});
