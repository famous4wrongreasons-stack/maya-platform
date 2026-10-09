// Synthetic metadata/clock/early-refusal checks only. No server or credential.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { coreConversationProfile } from './core-conversation-profile.mjs';
import {
  CORE_OFFLINE_PROFILE,
  CORE_OFFLINE_LIMITS,
  CORE_UNION_PROFILE,
  CandidateBudgetGate,
  candidateReservation,
} from './current-candidate-budget.mjs';
import {
  readCoreManifest,
  assertCoreAdmission,
  claimCorePermit,
} from './core-conversation-admission.mjs';
import {
  captureCoreManifest,
  assertCoreSources,
} from './core-conversation-source.mjs';
import { prepareLocalCore } from './core-local-prepare.mjs';
import { assertOwnedStageTimeout } from './owned-child-cleanup.mjs';
const backend = fileURLToPath(new URL('../../', import.meta.url)),
  repo = path.dirname(backend.replace(/\/$/, ''));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const read = (n) => fs.readFileSync(path.join(repo, n));
const profile = coreConversationProfile(CORE_OFFLINE_PROFILE),
  dataset = JSON.parse(read(profile.datasetPath));
const endpoint = 'https://api.deepseek.com/chat/completions';
const request = {
  method: 'POST',
  body: JSON.stringify({
    model: 'deepseek-v4-pro',
    messages: [{ role: 'user', content: 'SYNTHETIC_OFFLINE' }],
    max_tokens: 2048,
    stream: false,
    thinking: { type: 'disabled' },
  }),
};
function root(t) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'core-offline-unit-')),
  );
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function manifestFixture(t, mode = 'DRY_HTTP') {
  const dir = root(t),
    local = mode === 'ADMITTED_LOCAL_MODEL_HTTP';
  const target = {
    host: local ? 'localhost' : 'SYNTHETIC.invalid',
    workDirectory: backend,
    brokerUid: process.getuid(),
    runnerUid: process.getuid() + (local ? 0 : 1),
    brokerSocket: {
      path: path.join(dir, 'channel', 'b.sock'),
      gid: process.getgid(),
    },
  };
  const credentialSource = {
    kind: local ? 'terminal-stdin' : 'file',
    reference: local
      ? 'owner-terminal-stdin-once'
      : '/NEVER_OPENED/SYNTHETIC/key',
    owner: process.getuid(),
    reader: process.getuid(),
  };
  const value = {
    contract: 'maya.core-conversation-run/1',
    mode,
    profile: profile.id,
    candidateCommit: 'a'.repeat(40),
    sourceHashes: { 'synthetic/source.ts': 'b'.repeat(64) },
    datasetSha256: profile.datasetSha256,
    dialogs: 48,
    userTurns: 81,
    cases: dataset.cases,
    limits: profile.limits,
    limitsSha256: profile.limitsSha256,
    runId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-10-09T00:00:00.000Z',
    paidAuthorized: false,
    upstreamAllowed: false,
    credentialAdmission: false,
    admissionContext: mode === 'DRY_HTTP' ? null : { target, credentialSource },
  };
  const bytes = JSON.stringify(value, null, 2) + '\n',
    file = path.join(dir, 'manifest.json');
  fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  return { dir, value, file, pin: sha(bytes), local };
}
function refuses(entry, args, code) {
  const child = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=64',
      path.join(
        backend,
        'scripts/conversation-qualification/' + entry + '.mjs',
      ),
      ...args,
    ],
    {
      cwd: backend,
      env: { PATH: process.env.PATH, TZ: 'UTC' },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 32768,
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert.ok(child.stderr.includes(code), child.stderr);
}
test('48/81 is exactly the frozen ordered proposal with every current source pin retained', () => {
  const proposalBytes = read(dataset.sourceProposal.path),
    proposal = JSON.parse(proposalBytes);
  assert.equal(
    sha(proposalBytes),
    '7e3e94694b98c9ad56f7aa7f7ff63a835058621d3ca159b4458421da95399ba8',
  );
  assert.equal(dataset.sourceProposal.sha256, sha(proposalBytes));
  assert.deepEqual(dataset.cases, proposal.cases);
  assert.deepEqual(dataset.sourceHashes, proposal.sourceHashes);
  for (const [name, expected] of Object.entries(dataset.sourceHashes))
    assert.equal(sha(read(name)), expected);
  assert.equal(sha(read(profile.datasetPath)), profile.datasetSha256);
  assert.equal(sha(JSON.stringify(dataset.cases)), profile.casesSha256);
  assert.equal(new Set(dataset.cases.map((c) => c.id)).size, 48);
  assert.equal(
    dataset.cases.reduce((n, c) => n + c.userTurns.length, 0),
    81,
  );
  assert.equal(dataset.admittedModesAllowed, false);
  assert.equal(dataset.credentialAdmission, false);
  assert.equal(dataset.paidAuthorized, false);
  assert.deepEqual(
    [
      coreConversationProfile(CORE_UNION_PROFILE).dialogs,
      coreConversationProfile(CORE_UNION_PROFILE).userTurns,
    ],
    [9, 18],
  );
  assert.equal(
    coreConversationProfile(CORE_UNION_PROFILE).limits.spendNanoUsd,
    6000000000,
  );
});
test('offline mechanical reservation has zero money, bounded requests and finite stage duration', () => {
  assert.ok(Object.isFrozen(profile) && Object.isFrozen(profile.limits));
  assert.equal(profile.limitsSha256, sha(JSON.stringify(profile.limits)));
  assert.equal(
    candidateReservation(endpoint, request, CORE_OFFLINE_PROFILE).nanoUsd,
    0,
  );
  assert.equal(CORE_OFFLINE_LIMITS.attempts, 324);
  assert.equal(CORE_OFFLINE_LIMITS.durationMs, 1800000);
  assert.equal(CORE_OFFLINE_LIMITS.intervalMs, 0);
  assert.equal(
    coreConversationProfile(CORE_UNION_PROFILE).limits.intervalMs,
    6000,
  );
  assertOwnedStageTimeout(1860000, CORE_OFFLINE_PROFILE);
  assert.throws(
    () => assertOwnedStageTimeout(1860001, CORE_OFFLINE_PROFILE),
    /owned_stage_timeout_invalid/,
  );
  assert.throws(
    () =>
      candidateReservation(
        endpoint,
        { ...request, body: 'x'.repeat(98305) },
        CORE_OFFLINE_PROFILE,
      ),
    /body_limit/,
  );
});
test('one synthetic ledger accommodates all81 turns/48 dialogs and three model stages per turn', async (t) => {
  const dir = root(t);
  let now = 0,
    calls = 0;
  const options = {
    profile: CORE_OFFLINE_PROFILE,
    mode: 'OFFLINE_SYNTHETIC_ONLY',
    ledgerPath: path.join(dir, 'ledger.jsonl'),
    manifestSha256: 'a'.repeat(64),
    candidateCommit: 'b'.repeat(40),
    now: () => now,
    wait: async (ms) => {
      now += ms;
    },
    transport: async () => {
      calls++;
      return new Response('{}');
    },
  };
  const gate = new CandidateBudgetGate(options);
  t.after(() => gate.close());
  for (const c of dataset.cases) {
    gate.dialog();
    for (const text of c.userTurns) {
      assert.ok(text);
      gate.turn();
      for (let n = 0; n < 3; n++) await gate.fetch(endpoint, request);
      gate.endTurn();
    }
  }
  assert.equal(calls, 243);
  assert.equal(gate.stats.dialogs, 48);
  assert.equal(gate.stats.turns, 81);
  assert.equal(gate.stats.reservedNanoUsd, 0);
  assert.ok(now < 1800000);
  assert.throws(() => gate.dialog(), /dialog_limit/);
  assert.throws(() => gate.turn(), /turn_limit/);
  gate.close();
  assert.throws(() => new CandidateBudgetGate(options), /EEXIST/);
  const rows = fs.readFileSync(options.ledgerPath, 'utf8');
  assert.doesNotMatch(rows, /SYNTHETIC_OFFLINE/);
  assert.match(rows, /"paidAuthorized":false/);
});
test('admitted gate refuses offline before admission callback or ledger creation', (t) => {
  const dir = root(t),
    ledgerPath = path.join(dir, 'never-ledger');
  let admitted = 0;
  assert.throws(
    () =>
      new CandidateBudgetGate({
        profile: CORE_OFFLINE_PROFILE,
        mode: 'ADMITTED_MODEL_ONLY',
        ledgerPath,
        manifestSha256: 'a'.repeat(64),
        candidateCommit: 'b'.repeat(40),
        transport: async () => {
          throw Error('MUST_NOT_CALL');
        },
        assertAdmission: () => {
          admitted++;
        },
      }),
    /candidate_profile_offline_only/,
  );
  assert.equal(admitted, 0);
  assert.equal(fs.existsSync(ledgerPath), false);
});
test('manifest accepts only DRY_HTTP for48 even with structurally valid admitted context', (t) => {
  const f = manifestFixture(t);
  assert.equal(readCoreManifest(f.file, f.pin).profile, CORE_OFFLINE_PROFILE);
  for (const mode of ['ADMITTED_MODEL_HTTP', 'ADMITTED_LOCAL_MODEL_HTTP']) {
    const x = manifestFixture(t, mode);
    assert.throws(
      () => readCoreManifest(x.file, x.pin, { localStdin: x.local }),
      /core_admission_refused/,
    );
  }
});
test('offline manifest cannot inspect a permit or create a claim via either admission owner', (t) => {
  const f = manifestFixture(t),
    manifest = readCoreManifest(f.file, f.pin);
  let accessed = 0;
  const options = {
    get path() {
      accessed++;
      throw Error('MUST_NOT_READ');
    },
    sha256: 'a'.repeat(64),
    manifest,
    claimPath: path.join(f.dir, 'never.claim'),
    role: 'broker',
    target: null,
    credentialSource: null,
    ownerApprovalRef: 'SYNTHETIC_NOT_AUTHORIZED',
  };
  for (const action of [assertCoreAdmission, claimCorePermit])
    assert.throws(() => action(options), /core_admission_refused/);
  assert.equal(accessed, 0);
  assert.deepEqual(fs.readdirSync(f.dir), ['manifest.json']);
});
test('capture/source and local live preparer reject offline before Git, path creation or credential metadata', () => {
  for (const mode of ['ADMITTED_MODEL_HTTP', 'ADMITTED_LOCAL_MODEL_HTTP'])
    assert.throws(
      () => captureCoreManifest(mode, {}, CORE_OFFLINE_PROFILE),
      /core_profile_offline_only/,
    );
  assert.throws(
    () =>
      assertCoreSources({
        profile: CORE_OFFLINE_PROFILE,
        mode: 'ADMITTED_MODEL_HTTP',
      }),
    /core_profile_offline_only/,
  );
  assert.throws(
    () => prepareLocalCore('/NEVER_CREATED/offline', CORE_OFFLINE_PROFILE),
    /core_local_profile_offline_only/,
  );
});
test('runner early gate refuses every live mode and any permit/admission hint before output creation', (t) => {
  const dir = root(t),
    output = path.join(dir, 'never-output');
  for (const mode of ['admitted', 'admitted-local'])
    for (const action of ['--run', '--prepare'])
      refuses(
        'core-conversation-runner',
        [
          action,
          '--mode',
          mode,
          '--profile',
          CORE_OFFLINE_PROFILE,
          '--output',
          output,
        ],
        'core_runner_profile_offline_only',
      );
  for (const key of [
    '--permit',
    '--permit-sha256',
    '--owner-approval-ref',
    '--admission-context',
  ])
    refuses(
      'core-conversation-runner',
      [
        '--run',
        '--mode',
        'dry',
        '--profile',
        CORE_OFFLINE_PROFILE,
        '--output',
        output,
        key,
        'unused',
      ],
      'core_runner_profile_offline_only',
    );
  assert.equal(fs.existsSync(output), false);
});
test('broker offline gate refuses admitted dispatch and unused permit hints before source/socket/claim', (t) => {
  const f = manifestFixture(t),
    output = path.join(f.dir, 'never-output');
  const args = [
    '--manifest',
    f.file,
    '--manifest-sha256',
    f.pin,
    '--output',
    output,
  ];
  refuses(
    'core-conversation-broker',
    ['--mode', 'admitted', ...args],
    'core_broker_profile_offline_only',
  );
  refuses(
    'core-conversation-broker',
    ['--mode', 'admitted-local', ...args],
    'core_admission_refused',
  );
  for (const key of ['--permit', '--permit-sha256', '--owner-approval-ref'])
    refuses(
      'core-conversation-broker',
      ['--mode', 'dry', ...args, key, 'unused'],
      'core_broker_profile_offline_only',
    );
  assert.deepEqual(fs.readdirSync(f.dir), ['manifest.json']);
});
test('local live preparation and recorded replay cannot reinterpret48 as another profile', () => {
  refuses(
    'core-local-prepare',
    ['--prepare', '--profile', CORE_OFFLINE_PROFILE],
    'core_local_profile_offline_only',
  );
  refuses(
    'core-conversation-runner',
    [
      '--run',
      '--mode',
      'dry',
      '--profile',
      CORE_OFFLINE_PROFILE,
      '--recorded-replay',
    ],
    'core_runner_recorded_replay_profile',
  );
  refuses(
    'core-conversation-runner',
    ['--run', '--mode', 'dry', '--profile', CORE_OFFLINE_PROFILE],
    'core_runner_new_output',
  );
});
