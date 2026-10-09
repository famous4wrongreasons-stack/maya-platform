/** One fresh, sequential A+B accounting session. This journal grants no model
 * authority and handles no credentials, messages, transport or permit. */
import fs from 'node:fs';
import path from 'node:path';
import {
  CORE_DIAGNOSTIC_LIMITS,
  CORE_FOLLOWUP_LIMITS,
} from './current-candidate-budget.mjs';

const limits = Object.freeze({
  A: CORE_DIAGNOSTIC_LIMITS,
  B: CORE_FOLLOWUP_LIMITS,
});
const durationMs = limits.A.durationMs + limits.B.durationMs;
const externalReasons = new Set([
  'unknown',
  'cancelled',
  'stage_failed',
  'dispatch_failed',
  'timeout',
  'interrupted',
  'operator_stop',
]);
const counters = () => ({
  attempts: 0,
  inputTokens: 0,
  outputTokens: 0,
  reservedNanoUsd: 0,
});
const stageState = () => ({
  startedAt: null,
  expiresAt: null,
  completed: false,
  clean: null,
  ...counters(),
});
const safe = (n) => Number.isSafeInteger(n) && n >= 0;
function values(record, required, optional = []) {
  try {
    if (
      !record ||
      typeof record !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(record))
    )
      return null;
    const descriptors = Object.getOwnPropertyDescriptors(record);
    const keys = Reflect.ownKeys(descriptors);
    if (
      required.some((key) => !keys.includes(key)) ||
      keys.some(
        (key) =>
          ![...required, ...optional].includes(key) ||
          !Object.hasOwn(descriptors[key], 'value'),
      )
    )
      return null;
    return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
  } catch {
    return null;
  }
}

export function createLocalAbBudget(options) {
  const settings = values(options, ['ledgerPath'], ['now']);
  if (
    !settings ||
    typeof settings.ledgerPath !== 'string' ||
    !path.isAbsolute(settings.ledgerPath) ||
    path.normalize(settings.ledgerPath) !== settings.ledgerPath ||
    /[\u0000-\u001f\u007f]/.test(settings.ledgerPath) ||
    (settings.now !== undefined && typeof settings.now !== 'function')
  )
    throw new Error('local_ab_options_invalid');
  const now = settings.now ?? Date.now;
  let startedAt;
  try {
    startedAt = now();
  } catch {
    throw new Error('local_ab_clock_invalid');
  }
  if (!safe(startedAt) || !safe(startedAt + durationMs))
    throw new Error('local_ab_clock_invalid');
  const expiresAt = startedAt + durationMs;
  let lastCheck = startedAt,
    lastReservedAt = null,
    activeStage = null;
  let halted = false,
    haltReason = null,
    closed = false,
    ioFailed = false;
  const total = counters(),
    stages = { A: stageState(), B: stageState() };
  let fd;
  try {
    fd = fs.openSync(settings.ledgerPath, 'wx', 0o600);
  } catch {
    throw new Error('local_ab_ledger_create_refused');
  }

  const snapshot = () =>
    Object.freeze({
      startedAt,
      expiresAt,
      activeStage,
      ...total,
      lastReservedAt,
      halted,
      haltReason,
      closed,
      stages: Object.freeze({
        A: Object.freeze({ ...stages.A }),
        B: Object.freeze({ ...stages.B }),
      }),
    });
  function append(row) {
    try {
      const bytes = Buffer.from(JSON.stringify(row) + '\n');
      let offset = 0;
      while (offset < bytes.length) {
        const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
        if (
          !Number.isSafeInteger(written) ||
          written <= 0 ||
          written > bytes.length - offset
        )
          throw new Error('incomplete');
        offset += written;
      }
      fs.fsyncSync(fd);
    } catch {
      halted = true;
      haltReason = 'ledger_io';
      ioFailed = true;
      throw new Error('local_ab_ledger_io');
    }
  }
  function latch(reason) {
    if (halted || closed) return;
    halted = true;
    haltReason = reason;
    append({ event: 'halted', reason, at: lastCheck });
  }
  function refuse(reason) {
    latch(reason);
    throw new Error('local_ab_' + reason);
  }
  function check() {
    if (closed) throw new Error('local_ab_closed');
    if (halted) throw new Error('local_ab_halted');
    let at;
    try {
      at = now();
    } catch {
      refuse('clock_invalid');
    }
    if (!safe(at) || at < lastCheck) refuse('clock_invalid');
    lastCheck = at;
    if (at >= expiresAt) refuse('wall_time_limit');
    if (activeStage && at >= stages[activeStage].expiresAt)
      refuse('stage_time_limit');
    return at;
  }
  try {
    append({
      event: 'opened',
      contract: 'maya.local-ab-budget/1',
      startedAt,
      expiresAt,
      limits: {
        attempts: limits.A.attempts + limits.B.attempts,
        spendNanoUsd: limits.A.spendNanoUsd + limits.B.spendNanoUsd,
        durationMs,
        A: {
          attempts: limits.A.attempts,
          spendNanoUsd: limits.A.spendNanoUsd,
          durationMs: limits.A.durationMs,
        },
        B: {
          attempts: limits.B.attempts,
          spendNanoUsd: limits.B.spendNanoUsd,
          durationMs: limits.B.durationMs,
        },
      },
    });
    const parent = fs.openSync(path.dirname(settings.ledgerPath), 'r');
    try {
      fs.fsyncSync(parent);
    } finally {
      fs.closeSync(parent);
    }
  } catch {
    try {
      fs.closeSync(fd);
    } catch {
      /* The fresh journal remains a restart fence. */
    }
    throw new Error('local_ab_ledger_io');
  }

  return Object.freeze({
    startedAt,
    expiresAt,
    get stats() {
      return snapshot();
    },
    beginStage(stage) {
      const at = check();
      if (
        !['A', 'B'].includes(stage) ||
        activeStage ||
        stages[stage].startedAt !== null ||
        (stage === 'B' && (!stages.A.completed || stages.A.clean !== true))
      )
        refuse('stage_order');
      const current = stages[stage];
      current.startedAt = at;
      current.expiresAt = Math.min(expiresAt, at + limits[stage].durationMs);
      activeStage = stage;
      append({
        event: 'stage_started',
        stage,
        at,
        expiresAt: current.expiresAt,
      });
      return Object.freeze({
        stage,
        startedAt: at,
        expiresAt: current.expiresAt,
      });
    },
    reserve(stage, reservation) {
      const at = check();
      if (!['A', 'B'].includes(stage) || activeStage !== stage)
        refuse('stage_order');
      const current = stages[stage],
        bound = limits[stage];
      const r = values(reservation, ['input', 'output', 'nanoUsd'], ['bytes']);
      if (
        !r ||
        !safe(r.input) ||
        r.input < 4096 ||
        r.input > bound.requestBytes + 4096 ||
        !safe(r.output) ||
        r.output < 1 ||
        r.output > bound.outputPerAttempt ||
        !safe(r.nanoUsd) ||
        r.nanoUsd !==
          r.input * bound.inputNanoUsdPerToken +
            r.output * bound.outputNanoUsdPerToken ||
        (r.bytes !== undefined &&
          (!safe(r.bytes) ||
            r.bytes > bound.requestBytes ||
            r.input !== r.bytes + 4096))
      )
        refuse('reservation_invalid');
      if (lastReservedAt !== null && at - lastReservedAt < bound.intervalMs)
        refuse('spacing_limit');
      if (
        current.attempts >= bound.attempts ||
        total.attempts >= limits.A.attempts + limits.B.attempts
      )
        refuse('attempt_limit');
      if (
        current.inputTokens + r.input > bound.inputTokens ||
        current.outputTokens + r.output > bound.outputTokens
      )
        refuse('token_limit');
      if (
        current.reservedNanoUsd + r.nanoUsd > bound.spendNanoUsd ||
        total.reservedNanoUsd + r.nanoUsd >
          limits.A.spendNanoUsd + limits.B.spendNanoUsd
      )
        refuse('spend_limit');
      // Count a validated reservation even if subsequent write/fsync is UNKNOWN.
      // No caller may dispatch until this append succeeds; nothing is refunded.
      for (const count of [current, total]) {
        count.attempts++;
        count.inputTokens += r.input;
        count.outputTokens += r.output;
        count.reservedNanoUsd += r.nanoUsd;
      }
      lastReservedAt = at;
      append({
        event: 'reserved',
        stage,
        at,
        input: r.input,
        output: r.output,
        nanoUsd: r.nanoUsd,
        stageAttempt: current.attempts,
        attempt: total.attempts,
        stageNanoUsd: current.reservedNanoUsd,
        totalNanoUsd: total.reservedNanoUsd,
      });
      return snapshot();
    },
    completeStage(stage, clean) {
      const at = check();
      if (
        !['A', 'B'].includes(stage) ||
        activeStage !== stage ||
        typeof clean !== 'boolean'
      )
        refuse('stage_order');
      stages[stage].completed = true;
      stages[stage].clean = clean;
      activeStage = null;
      append({ event: 'stage_completed', stage, at, clean });
      if (!clean) latch('stage_failed');
      return snapshot();
    },
    halt(reason) {
      latch(externalReasons.has(reason) ? reason : 'explicit_halt');
      return snapshot();
    },
    close() {
      if (closed) return snapshot();
      let failed = false;
      try {
        if (ioFailed) throw new Error('local_ab_ledger_io');
        if (!halted && !(stages.B.completed && stages.B.clean))
          latch('incomplete');
        append({ event: 'closed', ...snapshot(), closed: true });
      } catch {
        failed = true;
      } finally {
        closed = true;
        try {
          fs.closeSync(fd);
        } catch {
          halted = true;
          haltReason = 'ledger_io';
          ioFailed = true;
          failed = true;
        }
      }
      if (failed) throw new Error('local_ab_ledger_io');
      return snapshot();
    },
  });
}
