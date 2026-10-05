import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
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

test('explicit resume retains failed-call reservation, lifetime and counters with exclusive lock', async (t) => {
  const f = fixture(t, { transport: async () => ({ status: 400 }) });
  await f.gate.fetch(endpoint, request());
  const reserved = f.gate.reservedNanoUsd;
  assert.throws(() => new PilotBudgetGate({ ledgerPath: f.ledgerPath, approved: true, resume: true, transport: async () => ({status:200}) }), /EEXIST/);
  f.gate.close();
  let clock = 7000;
  const g = new PilotBudgetGate({ ledgerPath: f.ledgerPath, approved: true, resume: true,
    now: () => clock, sleep: async ms => { clock += ms; }, transport: async () => ({status:200}) });
  assert.equal(g.startedAt, 0);
  assert.equal(g.requests, 1);
  assert.equal(g.dialogs, 1);
  assert.equal(g.turns, 1);
  assert.equal(g.reservedNanoUsd, reserved);
  g.dialog(); g.turn(); await g.fetch(endpoint, request());
  assert.equal(g.requests, 2); assert.equal(g.reservedNanoUsd, reserved * 2);
  g.close();
  assert.throws(() => new PilotBudgetGate({ledgerPath:f.ledgerPath,approved:true,resume:true,now:()=>PILOT_LIMITS.durationMs,transport:async()=>({status:200})}), /ledger_limit_exhausted/);
});


test('resume rejects truncated or altered budgets and never creates a replacement ledger', async (t) => {
  const f = fixture(t);
  await f.gate.fetch(endpoint, request()); f.gate.close();
  const original = readFileSync(f.ledgerPath, 'utf8');
  const options = {ledgerPath:f.ledgerPath,approved:true,resume:true,now:()=>7000,transport:async()=>({status:200})};
  writeFileSync(f.ledgerPath, original.trimEnd());
  assert.throws(() => new PilotBudgetGate(options), /ledger_truncated/);
  const rows = original.trim().split('\n').map(JSON.parse);
  rows.find(x => x.event === 'reserved').totalReservedNanoUsd = 0;
  writeFileSync(f.ledgerPath, rows.map(JSON.stringify).join('\n')+'\n');
  assert.throws(() => new PilotBudgetGate(options), /ledger_reservation_invalid/);
  rows[0].limits.maxSpendNanoUsd *= 2;
  writeFileSync(f.ledgerPath, rows.map(JSON.stringify).join('\n')+'\n');
  assert.throws(() => new PilotBudgetGate(options), /ledger_header_invalid/);
  writeFileSync(f.ledgerPath, original);
  assert.throws(() => new PilotBudgetGate({...options,resume:false}), /EEXIST/);
  assert.equal(readFileSync(f.ledgerPath,'utf8'),original);
});

test('broker compatibility handoff must bind the exact prior ledger and carried reserve', async (t) => {
  const { createHash } = await import('node:crypto');
  const f=fixture(t); await f.gate.fetch(endpoint,request()); f.gate.close();
  const prefix=readFileSync(f.ledgerPath,'utf8');
  const before={event:'broker_compatibility_before',prior_ledger_sha256:createHash('sha256').update(prefix).digest('hex'),totalReservedNanoUsd:f.gate.reservedNanoUsd,reserved_requests_carried:1,broker_calls_carried_conservatively:1,verified_upstream_calls_before:0,body_limit_before:65536,body_limit_after:98304,permit_closed:true};
  const after={event:'broker_compatibility_after',totalReservedNanoUsd:f.gate.reservedNanoUsd,body_limit_bytes:98304,broker_calls_carried_conservatively:1,max_remaining_broker_calls:29,permit_closed:true,proof_db_pid_unchanged:true,deadline_not_extended:true,paid_calls_by_setup_agent:0};
  const text=prefix+JSON.stringify(before)+'\n'+JSON.stringify(after)+'\n';
  writeFileSync(f.ledgerPath,text.replace(before.prior_ledger_sha256,'0'.repeat(64)));
  const options={ledgerPath:f.ledgerPath,approved:true,resume:true,now:()=>7000,transport:async()=>({status:200})};
  assert.throws(()=>new PilotBudgetGate(options),/ledger_broker_transition_invalid/);
  writeFileSync(f.ledgerPath,text);
  const g=new PilotBudgetGate(options);assert.equal(g.reservedNanoUsd,f.gate.reservedNanoUsd);assert.equal(g.requests,1);g.close();
});
