import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CandidateBudgetGate,
  candidateReservation,
  CORE_UNION_PROFILE,
  CORE_UNION_LIMITS,
  CORE_UNION_LIMITS_SHA256,
} from './current-candidate-budget.mjs';
const endpoint = 'https://api.deepseek.com/chat/completions';
const request = (text = 'synthetic') => ({
  method: 'POST',
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: text }],
    max_tokens: 2048,
    stream: false,
    thinking: { type: 'disabled' },
  }),
});
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-union-budget-'));
  let clock = 0,
    calls = 0;
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  const options = {
    profile: CORE_UNION_PROFILE,
    mode: 'OFFLINE_SYNTHETIC_ONLY',
    manifestSha256: 'a'.repeat(64),
    candidateCommit: 'b'.repeat(40),
    ledgerPath,
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    transport: async () => {
      calls++;
      return new Response('{}');
    },
  };
  const gate = new CandidateBudgetGate(options);
  t.after(() => {
    gate.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return {
    gate,
    options,
    rows: () =>
      fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').map(JSON.parse),
    setClock: (n) => {
      clock = n;
    },
    calls: () => calls,
  };
}
test('union uses one exclusive ledger across 9 dialogs/18 turns with no per-case reset', async (t) => {
  const f = fixture(t),
    r = request();
  for (let c = 0; c < 9; c++) {
    f.gate.dialog();
    for (let turn = 0; turn < 2; turn++) {
      f.gate.turn();
      await f.gate.fetch(endpoint, r);
      f.gate.endTurn();
    }
  }
  assert.equal(f.gate.stats.attempts, 18);
  assert.equal(f.gate.stats.turns, 18);
  assert.equal(f.gate.stats.dialogs, 9);
  assert.throws(() => f.gate.dialog(), /dialog_limit/);
  assert.throws(() => f.gate.turn(), /turn_limit/);
  assert.equal(f.rows()[0].limitsSha256, CORE_UNION_LIMITS_SHA256);
  assert.deepEqual(f.rows()[0].limits, CORE_UNION_LIMITS);
  f.gate.close();
  assert.throws(() => new CandidateBudgetGate(f.options), /EEXIST/);
});
test('union allows exactly 36 maximal reservations with durable spacing and no more than six dollars', async (t) => {
  const f = fixture(t),
    r = request('x'.repeat(98304 - Buffer.byteLength(request('').body))),
    reserve = candidateReservation(endpoint, r, CORE_UNION_PROFILE);
  f.gate.dialog();
  f.gate.turn();
  for (let i = 0; i < 36; i++) await f.gate.fetch(endpoint, r);
  assert.equal(f.gate.stats.reservedNanoUsd, 5158010880);
  assert.equal(f.gate.stats.inputTokens, 3686400);
  assert.equal(f.gate.stats.outputTokens, 73728);
  assert.equal(f.gate.stats.reservedNanoUsd, 36 * reserve.nanoUsd);
  await assert.rejects(f.gate.fetch(endpoint, r), /attempt_limit/);
  assert.equal(f.calls(), 36);
  const rows = f.rows().filter((r) => r.event === 'reserved');
  assert.equal(rows.length, 36);
  for (let i = 1; i < rows.length; i++)
    assert.equal(rows[i].at - rows[i - 1].at, 6000);
});
test('union wall horizon is exactly thirty minutes and input overrun still refuses before dispatch', async (t) => {
  const f = fixture(t);
  f.gate.dialog();
  f.gate.turn();
  f.setClock(1799999);
  await f.gate.fetch(endpoint, request());
  f.setClock(1800000);
  await assert.rejects(f.gate.fetch(endpoint, request()), /wall_time_limit/);
  assert.equal(f.calls(), 1);
  assert.throws(
    () =>
      candidateReservation(
        endpoint,
        request('x'.repeat(98304)),
        CORE_UNION_PROFILE,
      ),
    /body_limit/,
  );
});
