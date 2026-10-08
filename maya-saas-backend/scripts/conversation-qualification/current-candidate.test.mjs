import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  CandidateBudgetGate,
  CANDIDATE_LIMITS,
  CORE_DIAGNOSTIC_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_LIMITS_SHA256,
  candidateReservation,
} from './current-candidate-budget.mjs';
import {
  freezeCurrentCandidate,
  CURRENT_CORPUS,
} from './current-candidate.mjs';
import { replayPilot } from './replay.mjs';
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const endpoint = 'https://api.deepseek.com/chat/completions';
const request = (text = 'SYNTHETIC', patch = {}) => ({
  method: 'POST',
  headers: { Authorization: 'PRIVATE_TEST_TOKEN' },
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: text }],
    max_tokens: 2048,
    stream: false,
    thinking: { type: 'disabled' },
    ...patch,
  }),
});
function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'maya-current-candidate-'));
  let clock = 0,
    calls = 0;
  const ledgerPath = join(dir, 'ledger.jsonl');
  const settings = {
    ledgerPath,
    manifestSha256: 'a'.repeat(64),
    candidateCommit: 'b'.repeat(40),
    mode: 'OFFLINE_SYNTHETIC_ONLY',
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    transport: async () => {
      calls++;
      return new Response('{}');
    },
    ...options,
  };
  const gate = new CandidateBudgetGate(settings);
  gate.dialog();
  gate.turn();
  t.after(() => {
    gate.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    gate,
    settings,
    ledgerPath,
    calls: () => calls,
    setClock: (n) => {
      clock = n;
    },
    rows: () =>
      readFileSync(ledgerPath, 'utf8').trim().split('\n').map(JSON.parse),
  };
}
test('offline binding is mandatory, no default/live transport or old ledger resume', (t) => {
  assert.throws(
    () => new CandidateBudgetGate({ mode: 'LIVE', transport: () => {} }),
    /offline_transport_required/,
  );
  const f = fixture(t);
  f.gate.endTurn();
  f.gate.close();
  assert.throws(() => new CandidateBudgetGate(f.settings), /EEXIST/);
  assert.throws(() => f.gate.dialog(), /gate_closed/);
});
test('reserves/fsyncs before every attempt; never forwards or journals secrets/content', async (t) => {
  let f;
  f = fixture(t, {
    transport: async (_u, init) => {
      assert.equal(f.rows().at(-1).event, 'reserved');
      assert.equal(init.headers, undefined);
      assert.equal(init.redirect, 'error');
      return new Response('{}', { status: 503 });
    },
  });
  await f.gate.fetch(endpoint, request('PRIVATE_TEST_TEXT'));
  const before = f.gate.stats;
  await f.gate.fetch(endpoint, request('PRIVATE_TEST_TEXT'));
  assert.equal(f.gate.stats.attempts, 2);
  assert.equal(f.gate.stats.reservedNanoUsd, before.reservedNanoUsd * 2);
  const reserves = f.rows().filter((r) => r.event === 'reserved');
  assert.equal(reserves[1].at - reserves[0].at, 6000);
  assert.doesNotMatch(readFileSync(f.ledgerPath, 'utf8'), /PRIVATE_TEST/);
});
test('failed/unknown attempt keeps reservations and halts further dispatch', async (t) => {
  const f = fixture(t, {
    transport: async () => {
      throw new Error('PRIVATE_TEST_TOKEN');
    },
  });
  await assert.rejects(
    f.gate.fetch(endpoint, request()),
    /^Error: candidate_attempt_unresolved$/,
  );
  assert.equal(f.gate.stats.attempts, 1);
  assert.ok(f.gate.stats.reservedNanoUsd > 0);
  await assert.rejects(f.gate.fetch(endpoint, request()), /gate_halted/);
  assert.doesNotMatch(readFileSync(f.ledgerPath, 'utf8'), /PRIVATE_TEST_TOKEN/);
});
test('short writes are completed before dispatch and zero progress fails closed', async (t) => {
  const f = fixture(t),
    original = fs.writeSync;
  const partial = t.mock.method(fs, 'writeSync', (fd, buf, offset, length) =>
    original(fd, buf, offset, Math.min(length, 7)),
  );
  try {
    await f.gate.fetch(endpoint, request());
  } finally {
    partial.mock.restore();
  }
  assert.equal(f.rows().filter((r) => r.event === 'reserved').length, 1);
  assert.equal(f.calls(), 1);
  const g = fixture(t);
  let writes = 0;
  const stalled = t.mock.method(fs, 'writeSync', (fd, buf, offset, length) =>
    ++writes === 1 ? original(fd, buf, offset, 3) : 0,
  );
  try {
    await assert.rejects(
      g.gate.fetch(endpoint, request()),
      /ledger_incomplete_write/,
    );
  } finally {
    stalled.mock.restore();
  }
  assert.equal(g.calls(), 0);
  assert.equal(g.gate.stats.halted, true);
  await assert.rejects(g.gate.fetch(endpoint, request()), /gate_halted/);
  g.gate.close();
  assert.throws(() => new CandidateBudgetGate(g.settings), /EEXIST/);
});
test('reservation/dispatch retain the validated URL/body despite caller mutation during spacing', async (t) => {
  const r = request('original'),
    original = r.body,
    url = new URL(endpoint),
    observed = [];
  const f = fixture(t, {
    wait: async () => {
      r.body = request('x'.repeat(200_000), {
        model: 'foreign',
        max_tokens: 99999,
      }).body;
      url.hostname = 'example.com';
      f.setClock(6000);
    },
    transport: async (u, init) => {
      observed.push({ url: u, body: init.body });
      return new Response('{}');
    },
  });
  await f.gate.fetch(endpoint, request());
  await f.gate.fetch(url, r);
  assert.deepEqual(observed[1], { url: endpoint, body: original });
  assert.equal(
    f.rows().filter((x) => x.event === 'reserved')[1].bytes,
    Buffer.byteLength(original),
  );
});
test('early wakeup cannot dispatch before the minimum interval', async (t) => {
  const f = fixture(t, { wait: async () => {} });
  await f.gate.fetch(endpoint, request());
  await assert.rejects(
    f.gate.fetch(endpoint, request()),
    /spacing_not_elapsed/,
  );
  assert.equal(f.calls(), 1);
});
test('aggregate input reservation stops before overrun and charges no refused attempt', async (t) => {
  const f = fixture(t),
    r = request('x'.repeat(96_000));
  let successes = 0;
  while (true) {
    try {
      await f.gate.fetch(endpoint, r);
      successes++;
    } catch (e) {
      assert.match(e.message, /input_token_limit/);
      break;
    }
  }
  const reserve = candidateReservation(endpoint, r);
  assert.equal(f.calls(), successes);
  assert.equal(f.gate.stats.attempts, successes);
  assert.ok(f.gate.stats.inputTokens <= 8_000_000);
  assert.ok(f.gate.stats.inputTokens + reserve.input > 8_000_000);
  assert.ok(f.gate.stats.reservedNanoUsd <= 12_000_000_000);
});
test('96 attempts include retries and output reservations reach their aggregate ceiling exactly', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 96; i++) await f.gate.fetch(endpoint, request());
  assert.equal(f.gate.stats.outputTokens, 196_608);
  await assert.rejects(f.gate.fetch(endpoint, request()), /attempt_limit/);
  assert.equal(f.calls(), 96);
  assert.ok(
    CANDIDATE_LIMITS.inputTokens * CANDIDATE_LIMITS.inputNanoUsdPerToken +
      CANDIDATE_LIMITS.outputTokens * CANDIDATE_LIMITS.outputNanoUsdPerToken <=
      CANDIDATE_LIMITS.spendNanoUsd,
  );
});
test('body/endpoint/model/output/shape refusals happen before any dispatch', async (t) => {
  const f = fixture(t);
  for (const r of [
    request('x'.repeat(98_304)),
    request('x', { model: 'other' }),
    request('x', { max_tokens: 2049 }),
    request('x', { tools: [] }),
    request('x', { stream: true }),
    request('x', {
      messages: [{ role: 'user', content: 'x', reviewChecks: ['SECRET'] }],
    }),
  ])
    await assert.rejects(f.gate.fetch(endpoint, r));
  await assert.rejects(
    f.gate.fetch('https://example.com', request()),
    /endpoint_refused/,
  );
  assert.equal(f.calls(), 0);
  assert.equal(f.gate.stats.attempts, 0);
});
test('24 dialog and 64 turn caps apply independently', (t) => {
  const f = fixture(t);
  f.gate.endTurn();
  for (let i = 1; i < 24; i++) f.gate.dialog();
  assert.throws(() => f.gate.dialog(), /dialog_limit/);
  for (let i = 1; i < 64; i++) {
    f.gate.turn();
    f.gate.endTurn();
  }
  assert.throws(() => f.gate.turn(), /turn_limit/);
});
test('wall time and clock reversal cannot reopen budget', async (t) => {
  const f = fixture(t);
  f.setClock(3_600_000);
  await assert.rejects(f.gate.fetch(endpoint, request()), /wall_time_limit/);
  assert.equal(f.calls(), 0);
  const g = fixture(t);
  g.setClock(-1);
  await assert.rejects(g.gate.fetch(endpoint, request()), /clock_invalid/);
  g.setClock(0);
  await assert.rejects(g.gate.fetch(endpoint, request()), /gate_halted/);
});
test('aborted before admission consumes no reservation, including cancellation during spacing', async (t) => {
  const controller = new AbortController();
  controller.abort();
  const f = fixture(t);
  await assert.rejects(
    f.gate.fetch(endpoint, { ...request(), signal: controller.signal }),
  );
  assert.equal(f.gate.stats.attempts, 0);
  const later = new AbortController();
  const g = fixture(t, { wait: async () => later.abort() });
  await g.gate.fetch(endpoint, request());
  await assert.rejects(
    g.gate.fetch(endpoint, { ...request(), signal: later.signal }),
  );
  assert.equal(g.gate.stats.attempts, 1);
});
test('concurrency covers response body; cancellation halts even an uncooperative transport', async (t) => {
  let started;
  const ready = new Promise((r) => {
    started = r;
  });
  const cancel = new AbortController();
  const f = fixture(t, {
    transport: async () => {
      started();
      return new Promise(() => {});
    },
  });
  const p = f.gate.fetch(endpoint, { ...request(), signal: cancel.signal });
  await ready;
  await assert.rejects(f.gate.fetch(endpoint, request()), /concurrency_limit/);
  cancel.abort();
  await assert.rejects(p, /attempt_unresolved/);
  assert.equal(f.gate.stats.halted, true);
  await assert.rejects(f.gate.fetch(endpoint, request()), /gate_halted/);
});
test('remaining wall deadline cancels an unread body and no second call is possible', async (t) => {
  let cancelled = false;
  const f = fixture(t, {
    transport: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  f.setClock(3_599_995);
  await assert.rejects(f.gate.fetch(endpoint, request()), /attempt_unresolved/);
  assert.equal(cancelled, true);
  assert.equal(f.gate.stats.attempts, 1);
});
test('oversized output is unresolved, with full reservation kept', async (t) => {
  const f = fixture(t, {
    transport: async () => new Response('x'.repeat(1_048_577)),
  });
  await assert.rejects(f.gate.fetch(endpoint, request()), /attempt_unresolved/);
  assert.ok(f.gate.stats.reservedNanoUsd > 0);
  assert.equal(f.gate.stats.halted, true);
});

test('core profile is closed, frozen and restrictive; the existing offline defaults stay unchanged', (t) => {
  const f = fixture(t),
    g = fixture(t, { profile: CORE_DIAGNOSTIC_PROFILE });
  assert.deepEqual(f.rows()[0].limits, CANDIDATE_LIMITS);
  assert.equal(f.rows()[0].profile, undefined);
  assert.equal(f.rows()[0].paidAuthorized, false);
  assert.equal(CANDIDATE_LIMITS.dialogs, 24);
  assert.equal(CANDIDATE_LIMITS.turns, 64);
  assert.equal(CANDIDATE_LIMITS.attempts, 96);
  assert.equal(CANDIDATE_LIMITS.spendNanoUsd, 12_000_000_000);
  assert.equal(CANDIDATE_LIMITS.durationMs, 3_600_000);
  assert.ok(Object.isFrozen(CORE_DIAGNOSTIC_LIMITS));
  assert.equal(CORE_DIAGNOSTIC_LIMITS.dialogs, 3);
  assert.equal(CORE_DIAGNOSTIC_LIMITS.turns, 5);
  assert.equal(CORE_DIAGNOSTIC_LIMITS.attempts, 12);
  assert.equal(CORE_DIAGNOSTIC_LIMITS.spendNanoUsd, 2_000_000_000);
  assert.equal(CORE_DIAGNOSTIC_LIMITS.durationMs, 600_000);
  assert.equal(CORE_DIAGNOSTIC_LIMITS.concurrency, 1);
  for (const key of [
    'requestBytes',
    'outputPerAttempt',
    'timeoutMs',
    'intervalMs',
  ])
    assert.equal(CORE_DIAGNOSTIC_LIMITS[key], CANDIDATE_LIMITS[key]);
  assert.equal(
    CORE_DIAGNOSTIC_LIMITS_SHA256,
    createHash('sha256')
      .update(JSON.stringify(CORE_DIAGNOSTIC_LIMITS))
      .digest('hex'),
  );
  assert.equal(g.rows()[0].profile, CORE_DIAGNOSTIC_PROFILE);
  assert.equal(g.rows()[0].limitsSha256, CORE_DIAGNOSTIC_LIMITS_SHA256);
  assert.equal(g.rows()[0].paidAuthorized, false);
  for (const profile of [
    null,
    '',
    'core-diagnostic-unknown/1',
    {},
    { ...CORE_DIAGNOSTIC_LIMITS },
  ])
    assert.throws(
      () => candidateReservation(endpoint, request(), profile),
      /profile_refused/,
    );
});

test('core independently caps three dialogs and five turns', (t) => {
  const f = fixture(t, { profile: CORE_DIAGNOSTIC_PROFILE });
  f.gate.endTurn();
  f.gate.dialog();
  f.gate.dialog();
  assert.throws(() => f.gate.dialog(), /dialog_limit/);
  for (let i = 1; i < 5; i++) {
    f.gate.turn();
    f.gate.endTurn();
  }
  assert.throws(() => f.gate.turn(), /turn_limit/);
  assert.equal(f.gate.stats.dialogs, 3);
  assert.equal(f.gate.stats.turns, 5);
});

test('core reserves every retry, admits at most twelve full-size attempts and stays below two dollars', async (t) => {
  const f = fixture(t, {
    profile: CORE_DIAGNOSTIC_PROFILE,
    transport: async () => new Response('{}', { status: 503 }),
  });
  const r = request(
    'x'.repeat(
      CORE_DIAGNOSTIC_LIMITS.requestBytes - Buffer.byteLength(request('').body),
    ),
  );
  const reservation = candidateReservation(
    endpoint,
    r,
    CORE_DIAGNOSTIC_PROFILE,
  );
  assert.equal(reservation.bytes, 98_304);
  for (let i = 0; i < 12; i++)
    assert.equal((await f.gate.fetch(endpoint, r)).status, 503);
  assert.equal(f.gate.stats.attempts, 12);
  assert.equal(f.gate.stats.inputTokens, 1_228_800);
  assert.equal(f.gate.stats.outputTokens, 24_576);
  assert.equal(f.gate.stats.reservedNanoUsd, 12 * reservation.nanoUsd);
  assert.ok(f.gate.stats.reservedNanoUsd <= 2_000_000_000);
  const rows = f.rows().filter((row) => row.event === 'reserved');
  assert.equal(rows.length, 12);
  for (let i = 1; i < rows.length; i++)
    assert.equal(rows[i].at - rows[i - 1].at, 6000);
  await assert.rejects(f.gate.fetch(endpoint, r), /attempt_limit/);
  assert.equal(f.rows().filter((row) => row.event === 'reserved').length, 12);
});

test('core expiry uses ten minutes and aborts the complete pending response body', async (t) => {
  const f = fixture(t, { profile: CORE_DIAGNOSTIC_PROFILE });
  f.setClock(600_000);
  await assert.rejects(f.gate.fetch(endpoint, request()), /wall_time_limit/);
  assert.equal(f.calls(), 0);
  let cancelled = false;
  const g = fixture(t, {
    profile: CORE_DIAGNOSTIC_PROFILE,
    transport: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  g.setClock(599_995);
  await assert.rejects(g.gate.fetch(endpoint, request()), /attempt_unresolved/);
  assert.equal(cancelled, true);
  assert.equal(g.gate.stats.attempts, 1);
  await assert.rejects(g.gate.fetch(endpoint, request()), /gate_halted/);
});

test('core remains single-flight through response-body consumption and halts after cancellation', async (t) => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const abort = new AbortController();
  let calls = 0;
  const f = fixture(t, {
    profile: CORE_DIAGNOSTIC_PROFILE,
    transport: async () => {
      calls++;
      return new Response(
        new ReadableStream({
          start() {
            started();
          },
        }),
      );
    },
  });
  const pending = f.gate.fetch(endpoint, {
    ...request(),
    signal: abort.signal,
  });
  await ready;
  await assert.rejects(f.gate.fetch(endpoint, request()), /concurrency_limit/);
  abort.abort();
  await assert.rejects(pending, /attempt_unresolved/);
  assert.equal(calls, 1);
  assert.equal(f.gate.stats.attempts, 1);
  assert.equal(f.gate.stats.halted, true);
});

function admittedFixture(t, patch = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'maya-core-admitted-unit-'));
  const settings = {
    ledgerPath: join(dir, 'ledger.jsonl'),
    candidateCommit: 'b'.repeat(40),
    manifestSha256: 'a'.repeat(64),
    mode: 'ADMITTED_MODEL_ONLY',
    profile: CORE_DIAGNOSTIC_PROFILE,
    assertAdmission: () => {},
    transport: async () => new Response('{}'),
    ...patch,
  };
  let gate;
  t.after(() => {
    gate?.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    settings,
    create() {
      gate = new CandidateBudgetGate(settings);
      return gate;
    },
    rows: () =>
      readFileSync(settings.ledgerPath, 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse),
  };
}

test('admitted mode refuses missing/foreign admission and custom clocks before creating any ledger', async (t) => {
  for (const patch of [
    { profile: undefined },
    { profile: 'foreign' },
    { assertAdmission: undefined },
    { now: Date.now },
    { wait: async () => {} },
    { mode: 'LIVE' },
    { mode: 'OFFLINE_SYNTHETIC_ONLY' },
    { manifestSha256: { toString: () => 'a'.repeat(64) } },
    { assertAdmission: () => false },
    { assertAdmission: async () => {} },
    {
      assertAdmission: async () => {
        throw new Error('PRIVATE_ADMISSION');
      },
    },
    {
      assertAdmission: () => {
        throw new Error('PRIVATE_ADMISSION');
      },
    },
  ]) {
    const f = admittedFixture(t, patch);
    assert.throws(
      () => f.create(),
      (error) => {
        assert.match(error.message, /^candidate_/);
        assert.doesNotMatch(error.message, /PRIVATE_ADMISSION/);
        return true;
      },
    );
    assert.equal(fs.existsSync(f.settings.ledgerPath), false);
  }
  await Promise.resolve(); // Rejected async validators are refused and contained.
});

test('synthetic admitted callback receives exact immutable binding at construction and immediately before transport', async (t) => {
  const bindings = [];
  let calls = 0;
  const f = admittedFixture(t, {
    assertAdmission: (binding) => {
      assert.ok(Object.isFrozen(binding));
      bindings.push(binding);
    },
    transport: async (_url, init) => {
      calls++;
      assert.equal(bindings.length, 3);
      assert.equal(f.rows().at(-1).event, 'reserved');
      assert.equal(init.headers, undefined);
      assert.equal(init.redirect, 'error');
      return new Response('{}');
    },
  });
  const gate = f.create();
  gate.dialog();
  gate.turn();
  await gate.fetch(endpoint, request());
  assert.equal(calls, 1);
  assert.deepEqual(bindings[0], {
    candidateCommit: f.settings.candidateCommit,
    manifestSha256: f.settings.manifestSha256,
    profile: CORE_DIAGNOSTIC_PROFILE,
    limitsSha256: CORE_DIAGNOSTIC_LIMITS_SHA256,
  });
  assert.ok(bindings.every((binding) => binding === bindings[0]));
  assert.equal(f.rows()[0].mode, 'ADMITTED_MODEL_ONLY');
  assert.equal(f.rows()[0].paidAuthorized, true); // Synthetic validator only, zero paid calls.
  assert.doesNotMatch(
    readFileSync(f.settings.ledgerPath, 'utf8'),
    /PRIVATE_TEST/,
  );
});

test('a synthetic permit for another candidate or manifest refuses before ledger creation', (t) => {
  for (const field of ['candidateCommit', 'manifestSha256']) {
    const expected =
      field === 'candidateCommit' ? 'b'.repeat(40) : 'a'.repeat(64);
    const f = admittedFixture(t, {
      [field]: 'c'.repeat(expected.length),
      assertAdmission: (binding) => {
        assert.equal(binding[field], expected);
      },
    });
    assert.throws(() => f.create(), /^Error: candidate_admission_refused$/);
    assert.equal(fs.existsSync(f.settings.ledgerPath), false);
  }
});

test('revoked synthetic admission stops before reservation and cannot reopen by restoring a callback flag', async (t) => {
  let allowed = true,
    calls = 0;
  const f = admittedFixture(t, {
    assertAdmission: () => {
      if (!allowed) throw new Error('PRIVATE_REVOCATION');
    },
    transport: async () => {
      calls++;
      return new Response('{}');
    },
  });
  const gate = f.create();
  gate.dialog();
  gate.turn();
  allowed = false;
  await assert.rejects(
    gate.fetch(endpoint, request()),
    /^Error: candidate_admission_refused$/,
  );
  assert.equal(calls, 0);
  assert.equal(gate.stats.attempts, 0);
  assert.equal(gate.stats.halted, true);
  allowed = true;
  await assert.rejects(gate.fetch(endpoint, request()), /gate_halted/);
});

test('revocation during durable reservation dispatches nothing, retains charge and cannot reuse a closed ledger', async (t) => {
  let allowed = true,
    calls = 0;
  const f = admittedFixture(t, {
    assertAdmission: () => {
      if (!allowed) throw new Error('PRIVATE_REVOKED_AFTER_FSYNC');
    },
    transport: async () => {
      calls++;
      return new Response('{}');
    },
  });
  const gate = f.create();
  gate.dialog();
  gate.turn();
  const original = fs.writeSync;
  const write = t.mock.method(fs, 'writeSync', (fd, buffer, offset, length) => {
    const written = original(fd, buffer, offset, length);
    if (
      buffer
        .toString('utf8', offset, offset + length)
        .includes('"event":"reserved"')
    )
      allowed = false;
    return written;
  });
  try {
    await assert.rejects(
      gate.fetch(endpoint, request()),
      /^Error: candidate_attempt_unresolved$/,
    );
  } finally {
    write.mock.restore();
  }
  assert.equal(calls, 0);
  assert.equal(gate.stats.attempts, 1);
  assert.ok(gate.stats.reservedNanoUsd > 0);
  assert.equal(gate.stats.halted, true);
  assert.equal(f.rows().at(-1).event, 'halted_after_attempt');
  assert.doesNotMatch(
    readFileSync(f.settings.ledgerPath, 'utf8'),
    /PRIVATE_REVOKED/,
  );
  gate.close();
  allowed = true;
  assert.throws(() => new CandidateBudgetGate(f.settings), /EEXIST/);
});
test('frozen manifest binds all 24 development variants, source proofs and pending HTTP status', () => {
  const m = freezeCurrentCandidate(backend, 'b'.repeat(40));
  assert.equal(m.dialogs, 24);
  assert.equal(m.families, 8);
  assert.equal(m.independentFamilies, 0);
  assert.equal(m.userTurns, 33);
  assert.ok(m.roles.includes('employee'));
  assert.equal(m.paidAuthorized, false);
  assert.equal(m.currentPricesVerified, false);
  assert.ok(Object.keys(m.sourceHashes).length >= 17);
  assert.ok(
    m.cases.every(
      (c) => c.fixture.httpBinding === 'NOT_IMPLEMENTED_FOR_THIS_MANIFEST',
    ),
  );
});
test('corpus coverage changes are refused rather than silently reducing scope', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'maya-corpus-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(dirname(join(dir, CURRENT_CORPUS)), { recursive: true });
  const c = JSON.parse(readFileSync(join(backend, CURRENT_CORPUS), 'utf8'));
  c.cases[0].variant = 'negative';
  writeFileSync(join(dir, CURRENT_CORPUS), JSON.stringify(c));
  assert.throws(
    () => freezeCurrentCandidate(dir, 'b'.repeat(40)),
    /group_coverage/,
  );
});
test('existing replay rejects tampered manifest before opening a dialog', async () => {
  const m = freezeCurrentCandidate(backend, 'b'.repeat(40));
  m.cases[0].userTurns[0] = 'changed';
  await assert.rejects(
    replayPilot(m, {
      openDialog: () => {
        throw new Error('must not open');
      },
    }),
    /manifest_hash_mismatch/,
  );
});
test('offline executable runs new corpus without HTTP, paid calls or gold history, and refuses reset', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'maya-candidate-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'new');
  const run = () =>
    spawnSync(
      process.execPath,
      [
        '--max-old-space-size=256',
        join(
          backend,
          'scripts/conversation-qualification/current-candidate-offline.mjs',
        ),
        out,
      ],
      { encoding: 'utf8', env: { PATH: process.env.PATH } },
    );
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
  assert.equal(report.stats.dialogs, 24);
  assert.equal(report.stats.turns, 33);
  assert.equal(report.injectedTransportCalls, 33);
  assert.equal(report.actualPaidCalls, 0);
  assert.equal(report.actualHttpCalls, 0);
  assert.equal(report.blockedNetworkCalls, 0);
  assert.equal(report.actualModelSerializer, 'NOT_EXERCISED');
  assert.equal(report.qualification, 'not_evaluated');
  assert.notEqual(run().status, 0);
});
