import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PilotBudgetGate, PILOT_LIMITS } from './budget-gate.mjs';
const endpoint = 'https://api.deepseek.com/chat/completions';
const request = (text = 'Synthetic only') => ({
  method: 'POST',
  headers: { Authorization: 'TEST_SECRET' },
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    stream: false,
    thinking: { type: 'disabled' },
    max_tokens: 2048,
    messages: [{ role: 'user', content: text }],
  }),
});
function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'maya-budget-'));
  let clock = 0,
    calls = 0;
  const ledgerPath = join(dir, 'ledger.jsonl');
  const gate = new PilotBudgetGate({
    ledgerPath,
    approved: true,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    transport: async () => {
      calls++;
      return { status: 200 };
    },
    ...options,
  });
  gate.dialog();
  gate.turn();
  t.after(() => {
    gate.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    gate,
    ledgerPath,
    calls: () => calls,
    setClock: (v) => {
      clock = v;
    },
  };
}
test('refuses unapproved calls and foreign endpoints before transport', async (t) => {
  const f = fixture(t, { approved: false });
  await assert.rejects(
    f.gate.fetch(endpoint, request()),
    /owner_approval_required/,
  );
  assert.equal(f.calls(), 0);
  const g = fixture(t);
  await assert.rejects(
    g.gate.fetch('https://example.com', request()),
    /endpoint_refused/,
  );
  assert.equal(g.calls(), 0);
});
test('fsync reservation precedes dispatch; failures retain spend and secret/content never enter ledger', async (t) => {
  let f;
  f = fixture(t, {
    transport: async () => {
      assert.match(readFileSync(f.ledgerPath, 'utf8'), /reserved/);
      throw new Error('TEST_SECRET raw request');
    },
  });
  await assert.rejects(
    f.gate.fetch(endpoint, request('PRIVATE_SYNTHETIC_TEXT')),
  );
  const spent = f.gate.reservedNanoUsd;
  assert.ok(spent > 0);
  await assert.rejects(f.gate.fetch(endpoint, request()));
  assert.ok(f.gate.reservedNanoUsd > spent);
  assert.doesNotMatch(
    readFileSync(f.ledgerPath, 'utf8'),
    /TEST_SECRET|PRIVATE_SYNTHETIC_TEXT|raw request/,
  );
  assert.throws(
    () =>
      new PilotBudgetGate({
        ledgerPath: f.ledgerPath,
        transport: async () => ({ status: 200 }),
      }),
    /EEXIST/,
  );
});
test('enforces spend cap, request count, timeout horizon, turn/dialog ceilings and request spacing', async (t) => {
  const f = fixture(t);
  while (true) {
    try {
      await f.gate.fetch(endpoint, request('x'.repeat(100_000)));
    } catch (e) {
      assert.match(e.message, /spend_limit/);
      break;
    }
  }
  assert.ok(f.gate.reservedNanoUsd <= PILOT_LIMITS.maxSpendNanoUsd);
  const rows = readFileSync(f.ledgerPath, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .filter((r) => r.event === 'reserved');
  for (let i = 1; i < rows.length; i++)
    assert.ok(rows[i].at - rows[i - 1].at >= 6000);
  const g = fixture(t);
  g.gate.requests = 600;
  await assert.rejects(g.gate.fetch(endpoint, request()), /request_limit/);
  assert.equal(g.calls(), 0);
  const h = fixture(t);
  h.setClock(PILOT_LIMITS.durationMs);
  await assert.rejects(h.gate.fetch(endpoint, request()), /wall_time_limit/);
  assert.equal(h.calls(), 0);
  h.gate.endTurn();
  for (let i = 1; i < 50; i++) h.gate.dialog();
  assert.throws(() => h.gate.dialog(), /dialog_limit/);
  for (let i = 1; i < 200; i++) {
    h.gate.turn();
    h.gate.endTurn();
  }
  assert.throws(() => h.gate.turn(), /turn_limit/);
});
test('refuses concurrent dispatch and unexpected model/output contract', async (t) => {
  let release;
  const f = fixture(t, {
    transport: () =>
      new Promise((r) => {
        release = r;
      }),
  });
  const pending = f.gate.fetch(endpoint, request());
  await assert.rejects(f.gate.fetch(endpoint, request()), /concurrency_limit/);
  release({ status: 200 });
  await pending;
  const invalid = request();
  invalid.body = invalid.body.replace('2048', '8000');
  await assert.rejects(
    f.gate.fetch(endpoint, invalid),
    /model_contract_refused/,
  );
});

test('provider requests require an active counted turn, and dialogs cannot overlap it', async (t) => {
  const f = fixture(t);
  assert.throws(() => f.gate.dialog(), /turn_still_active/);
  f.gate.endTurn();
  await assert.rejects(
    f.gate.fetch(endpoint, request()),
    /turn_scope_required/,
  );
  assert.equal(f.calls(), 0);
});
