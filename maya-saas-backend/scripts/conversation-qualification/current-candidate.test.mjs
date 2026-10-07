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
import {
  CandidateBudgetGate,
  CANDIDATE_LIMITS,
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
