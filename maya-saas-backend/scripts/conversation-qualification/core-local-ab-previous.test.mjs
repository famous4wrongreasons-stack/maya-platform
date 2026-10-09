// Synthetic temporary evidence only. No previous live directory, key, process,
// network, permit issuance or claim operation is used by this suite.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capturePreviousInputTimeout,
  assertPreviousInputTimeout,
} from './core-local-ab-previous.mjs';

const approval = 'synthetic-owner-approval';
const canonical = (value) => JSON.stringify(value, null, 2) + '\n';
const hash = (value) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const stamp = (n) => new Date(n).toISOString();
function fixture(t) {
  const root = fs.mkdtempSync('/private/tmp/maya-ab-previous-test-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['a', 'b', 'a/broker', 'a/channel', 'b/channel'])
    fs.mkdirSync(path.join(root, name), { mode: 0o700 });
  const start = Date.parse('2026-10-09T07:17:13.013Z'),
    aStart = start + 184,
    finish = start + 30405;
  const A = '0d90de11710e7212286a7e74755c8a12b55d116b',
    B = '82ea84c46c4a535aaba8aa4c549f7a0eb074dcfa';
  const zero = {
    attempts: 0,
    inputTokens: 0,
    outputTokens: 0,
    reservedNanoUsd: 0,
  };
  const state = {
    startedAt: null,
    expiresAt: null,
    completed: false,
    clean: null,
    ...zero,
  };
  const stats = {
    startedAt: start,
    expiresAt: start + 1800000,
    activeStage: 'A',
    ...zero,
    lastReservedAt: null,
    halted: true,
    haltReason: 'explicit_halt',
    closed: true,
    stages: {
      A: { ...state, startedAt: aStart, expiresAt: aStart + 600000 },
      B: { ...state },
    },
  };
  const target = (stage) => ({
    workDirectory: '/synthetic/candidate-' + stage,
    brokerSocket: {
      path: path.join(root, stage.toLowerCase(), 'channel/b.sock'),
    },
  });
  const permit = {
    contract: 'maya.core-conversation-permit/1',
    runId: 'synthetic-run',
    candidateCommit: A,
    manifestSha256: 'a'.repeat(64),
    profile: 'core-diagnostic-20261008/1',
    limitsSha256: 'c'.repeat(64),
    ownerApprovalRef: approval,
    revoked: false,
    startsAt: stamp(aStart),
    expiresAt: stamp(aStart + 600000),
    claimPath: path.join(root, 'a/permit.json.claim'),
    target: target('A'),
    credentialSource: {
      kind: 'terminal-stdin',
      reference: 'owner-terminal-stdin-once',
    },
  };
  const b = {
    contract: 'maya.core-conversation-run/1',
    candidateCommit: B,
    mode: 'ADMITTED_LOCAL_MODEL_HTTP',
    profile: 'core-followup-20261009/1',
    dialogs: 6,
    userTurns: 13,
    paidAuthorized: false,
    upstreamAllowed: false,
    credentialAdmission: false,
    admissionContext: { target: target('B') },
  };
  const plan = {
    contract: 'maya.local-ab-plan/1',
    output: root,
    ownerApprovalRef: approval,
    status: 'PREPARED_NO_PERMIT_NO_CREDENTIAL',
    limits: { spendNanoUsd: 6000000000, attempts: 36, durationMs: 1800000 },
    stages: ['A', 'B'].map((stage) => ({
      stage,
      manifestPath: path.join(
        root,
        stage.toLowerCase(),
        'candidate-manifest.json',
      ),
      manifestSha256: stage === 'A' ? permit.manifestSha256 : hash(b),
      workDirectory: target(stage).workDirectory,
    })),
  };
  const report = {
    contract: 'maya.local-ab-run/1',
    planSha256: hash(plan),
    status: 'failed-no-continuation',
    failureCode: 'core_local_credential_input_refused',
    launcherCredentialCleared: true,
    credentialInputs: 1,
    startedAt: stamp(start),
    finishedAt: stamp(finish),
    expiresAt: stamp(start + 1800000),
    stats,
    stages: [
      {
        stage: 'A',
        candidateCommit: A,
        manifestSha256: permit.manifestSha256,
        permitSha256: hash(permit),
        runnerPid: null,
        status: 'starting',
        usage: [],
        startsAt: permit.startsAt,
        expiresAt: permit.expiresAt,
      },
    ],
  };
  const claim = {
    contract: 'maya.core-conversation-claim/1',
    runId: permit.runId,
    permitSha256: hash(permit),
    manifestSha256: permit.manifestSha256,
    brokerPid: 314150,
    claimedAt: stamp(aStart + 100),
  };
  const broker = {
    contract: 'maya.core-conversation-broker/1',
    mode: 'ADMITTED_LOCAL_MODEL_HTTP',
    candidateCommit: A,
    runId: permit.runId,
    manifestSha256: permit.manifestSha256,
    profile: permit.profile,
    limitsSha256: permit.limitsSha256,
    stopped: true,
    inputAborted: true,
    stopReason: 'local_credential_input_refused',
    credentialsLoaded: false,
    upstreamCalls: 0,
    stats: null,
    requests: [],
    rejections: [],
    recordedReplay: false,
    startedAt: stamp(aStart + 101),
    stoppedAt: stamp(finish - 18),
  };
  const ledger = [
    {
      event: 'opened',
      contract: 'maya.local-ab-budget/1',
      startedAt: start,
      expiresAt: stats.expiresAt,
      limits: { attempts: 36, spendNanoUsd: 6000000000, durationMs: 1800000 },
    },
    {
      event: 'stage_started',
      stage: 'A',
      at: aStart,
      expiresAt: stats.stages.A.expiresAt,
    },
    { event: 'halted', reason: 'explicit_halt', at: aStart },
    { event: 'closed', ...stats },
  ];
  const cleanup = {
    checkedAt: stamp(finish + 1000),
    brokerPid: claim.brokerPid,
    brokerPidAbsent: true,
    claimPreserved: true,
    rearmed: false,
    aSocketAbsent: true,
    aRunnerDirectoryAbsent: true,
    bPermitAbsent: true,
    bClaimAbsent: true,
    bSocketAbsent: true,
    bRunnerDirectoryAbsent: true,
  };
  const data = {
    'ab-plan.json': plan,
    'ab-report.json': report,
    'ab-ledger.jsonl': ledger,
    'a/permit.json': permit,
    'a/permit.json.claim': claim,
    'a/broker/broker-report.json': broker,
    'input-refusal-cleanup.json': cleanup,
    'b/candidate-manifest.json': b,
  };
  const save = () => {
    plan.stages[1].manifestSha256 = hash(b);
    report.planSha256 = hash(plan);
    report.stages[0].permitSha256 = hash(permit);
    claim.permitSha256 = hash(permit);
    for (const [name, value] of Object.entries(data))
      fs.writeFileSync(
        path.join(root, name),
        name.endsWith('.jsonl')
          ? value.map((row) => JSON.stringify(row) + '\n').join('')
          : canonical(value),
        { mode: 0o600 },
      );
  };
  save();
  return {
    root,
    data,
    save,
    start,
    finish,
    report,
    broker,
    cleanup,
    claim,
    b,
    ledger,
  };
}

test('captures eight immutable file hashes, full 30405ms input time and original absolute expiry', (t) => {
  const f = fixture(t);
  fs.chmodSync(path.join(f.root, 'a/permit.json.claim'), 0o444);
  fs.chmodSync(path.join(f.root, 'input-refusal-cleanup.json'), 0o644);
  const p = capturePreviousInputTimeout(f.root, approval);
  assert.equal(p.inputElapsedMs, 30405);
  assert.equal(p.previousExpiresAt, f.start + 1800000);
  assert.equal(Object.keys(p.sha256ByFile).length, 8);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.sha256ByFile));
  assert.equal(assertPreviousInputTimeout(p, approval), 30405);
});

test('any nonzero, unknown, unclosed, wrong commit or unmatched claim refuses capture', (t) => {
  for (const change of [
    (f) => {
      f.report.stats.attempts = 1;
    },
    (f) => {
      f.report.stats.inputTokens = 1;
    },
    (f) => {
      f.report.stats.outputTokens = 1;
    },
    (f) => {
      f.report.stats.reservedNanoUsd = 1;
    },
    (f) => {
      f.report.stats.closed = false;
    },
    (f) => {
      f.broker.stats = {};
    },
    (f) => {
      f.broker.upstreamCalls = 1;
    },
    (f) => {
      f.broker.credentialsLoaded = true;
    },
    (f) => {
      f.broker.inputAborted = false;
    },
    (f) => {
      f.cleanup.brokerPidAbsent = false;
    },
    (f) => {
      f.claim.manifestSha256 = 'd'.repeat(64);
    },
    (f) => {
      f.b.candidateCommit = 'b'.repeat(40);
    },
    (f) => {
      f.report.stages[0].candidateCommit = 'a'.repeat(40);
    },
    (f) => {
      f.ledger.splice(2, 0, { event: 'reserved', nanoUsd: 0 });
    },
  ]) {
    const f = fixture(t);
    change(f);
    f.save();
    assert.throws(
      () => capturePreviousInputTimeout(f.root, approval),
      /core_ab_previous_input_refused/,
    );
  }
});

test('every projection field and any later byte change are revalidated', (t) => {
  const f = fixture(t),
    p = capturePreviousInputTimeout(f.root, approval);
  for (const changed of [
    { ...p, inputElapsedMs: p.inputElapsedMs - 1 },
    { ...p, previousExpiresAt: p.previousExpiresAt + 1 },
    {
      ...p,
      sha256ByFile: { ...p.sha256ByFile, 'ab-report.json': 'a'.repeat(64) },
    },
    { ...p, root: f.root + '/..' },
    { ...p, additional: true },
  ])
    assert.throws(
      () => assertPreviousInputTimeout(changed, approval),
      /core_ab_previous_input_refused/,
    );
  f.report.extraMetadata = 'synthetic changed bytes';
  f.save();
  assert.throws(
    () => assertPreviousInputTimeout(p, approval),
    /core_ab_previous_input_refused/,
  );
  assert.equal(
    capturePreviousInputTimeout(f.root, approval).inputElapsedMs,
    30405,
  );
});

test('a runner, socket, B permit or claim appearing after capture blocks continuation', (t) => {
  for (const name of [
    'a/runner',
    'a/channel/b.sock',
    'b/permit.json',
    'b/permit.json.claim',
    'b/runner',
    'b/channel/b.sock',
  ]) {
    const f = fixture(t),
      p = capturePreviousInputTimeout(f.root, approval);
    fs.writeFileSync(path.join(f.root, name), 'synthetic presence', {
      mode: 0o600,
    });
    assert.throws(
      () => assertPreviousInputTimeout(p, approval),
      /core_ab_previous_input_refused/,
    );
  }
});

test('noncanonical, linked, oversized, missing or writable evidence refuses before acceptance', (t) => {
  for (const change of [
    (f) => fs.chmodSync(f.root, 0o755),
    (f) => fs.chmodSync(path.join(f.root, 'ab-report.json'), 0o666),
    (f) => fs.unlinkSync(path.join(f.root, 'b/candidate-manifest.json')),
    (f) =>
      fs.writeFileSync(path.join(f.root, 'ab-report.json'), 'x'.repeat(32769)),
    (f) => {
      const file = path.join(f.root, 'ab-report.json');
      fs.renameSync(file, file + '.original');
      fs.symlinkSync(file + '.original', file);
    },
    (f) =>
      fs.linkSync(
        path.join(f.root, 'a/permit.json.claim'),
        path.join(f.root, 'claim-linked'),
      ),
  ]) {
    const f = fixture(t);
    change(f);
    assert.throws(
      () => capturePreviousInputTimeout(f.root, approval),
      /core_ab_previous_input_refused/,
    );
  }
});

test('wrong approval and zero, reversed or ten-minute elapsed proof refuse', (t) => {
  const f = fixture(t);
  assert.throws(
    () => capturePreviousInputTimeout(f.root, 'different-owner'),
    /core_ab_previous_input_refused/,
  );
  for (const elapsed of [0, -1, 600000]) {
    const g = fixture(t);
    g.report.finishedAt = stamp(g.start + elapsed);
    g.save();
    assert.throws(
      () => capturePreviousInputTimeout(g.root, approval),
      /core_ab_previous_input_refused/,
    );
  }
});
