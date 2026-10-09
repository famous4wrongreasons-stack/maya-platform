// Early CLI refusals only. No preparation, permit, claim, terminal, socket, PG,
// service or model execution. Temporary files are nonsecret dry manifests.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { coreConversationProfile } from './core-conversation-profile.mjs';
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_FOLLOWUP_PROFILE,
} from './current-candidate-budget.mjs';

const backend = fileURLToPath(new URL('../../', import.meta.url));
const repository = path.resolve(backend, '..');
const entryPath = (entry) =>
  fileURLToPath(new URL('./core-' + entry + '.mjs', import.meta.url));

function refusal(entry, args, expected) {
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=64', entryPath(entry), ...args],
    {
      cwd: backend,
      env: { PATH: process.env.PATH, TZ: 'UTC' },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 32768,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(expected), result.stderr);
}

function manifestFixture(t, id) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'core-profile-cli-')),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const profile = coreConversationProfile(id);
  const dataset = JSON.parse(
    fs.readFileSync(path.join(repository, profile.datasetPath), 'utf8'),
  );
  const value = {
    contract: 'maya.core-conversation-run/1',
    mode: 'DRY_HTTP',
    profile: profile.id,
    candidateCommit: 'a'.repeat(40),
    sourceHashes: { 'synthetic/source.ts': 'b'.repeat(64) },
    datasetSha256: profile.datasetSha256,
    dialogs: profile.dialogs,
    userTurns: profile.userTurns,
    cases: dataset.cases,
    limits: profile.limits,
    limitsSha256: profile.limitsSha256,
    runId: '11111111-1111-4111-8111-111111111111',
    createdAt: '2026-10-09T00:00:00.000Z',
    paidAuthorized: false,
    upstreamAllowed: false,
    credentialAdmission: false,
    admissionContext: null,
  };
  const bytes = JSON.stringify(value, null, 2) + '\n';
  const manifest = path.join(root, 'manifest.json');
  const output = path.join(root, 'unused-output');
  fs.writeFileSync(manifest, bytes, { flag: 'wx', mode: 0o600 });
  const args = [
    '--mode',
    'dry',
    '--manifest',
    manifest,
    '--manifest-sha256',
    createHash('sha256').update(bytes).digest('hex'),
    '--output',
    output,
  ];
  return { root, output, args };
}

test('runner retains implicit A and accepts each exact profile before requiring output', () => {
  for (const action of ['--prepare', '--run'])
    for (const profile of [
      undefined,
      CORE_DIAGNOSTIC_PROFILE,
      CORE_FOLLOWUP_PROFILE,
    ])
      refusal(
        'conversation-runner',
        [action, '--mode', 'dry', ...(profile ? ['--profile', profile] : [])],
        'core_runner_new_output',
      );
});

test('unknown, empty and near-match profiles cannot fall back to A in either preparation entry', () => {
  for (const profile of ['', 'other-profile', CORE_FOLLOWUP_PROFILE + '\n']) {
    refusal(
      'conversation-runner',
      ['--prepare', '--mode', 'dry', '--profile', profile],
      'core_profile_refused',
    );
    refusal(
      'local-prepare',
      ['--prepare', '--profile', profile],
      'core_profile_refused',
    );
  }
});

test('B recorded replay refuses before output or manifest access, while A retains its dry path', () => {
  for (const action of ['--prepare', '--run'])
    refusal(
      'conversation-runner',
      [
        action,
        '--mode',
        'dry',
        '--profile',
        CORE_FOLLOWUP_PROFILE,
        '--recorded-replay',
      ],
      'core_runner_recorded_replay_profile',
    );
  refusal(
    'conversation-runner',
    ['--run', '--mode', 'dry', '--recorded-replay'],
    'core_runner_new_output',
  );
});

test('explicit B never weakens either paid-mode recorded-replay refusal', () => {
  for (const mode of ['admitted', 'admitted-local'])
    refusal(
      'conversation-runner',
      [
        '--run',
        '--mode',
        mode,
        '--profile',
        CORE_FOLLOWUP_PROFILE,
        '--recorded-replay',
      ],
      'core_runner_recorded_replay_dry_only',
    );
});

test('broker takes its profile from the validated manifest, never a CLI override', () => {
  refusal(
    'conversation-broker',
    ['--mode', 'dry', '--profile', CORE_FOLLOWUP_PROFILE],
    'Unknown option',
  );
});

test('broker rejects recorded replay for a valid B dry manifest before source or output work', (t) => {
  const fixture = manifestFixture(t, CORE_FOLLOWUP_PROFILE);
  refusal(
    'conversation-broker',
    [...fixture.args, '--recorded-replay'],
    'core_broker_recorded_replay_profile',
  );
  assert.equal(fs.existsSync(fixture.output), false);
  assert.deepEqual(fs.readdirSync(fixture.root), ['manifest.json']);
});

test('runner refuses explicit or implicit profile mismatch before source or service execution', (t) => {
  for (const [manifestProfile, requestedProfile] of [
    [CORE_FOLLOWUP_PROFILE, undefined],
    [CORE_FOLLOWUP_PROFILE, CORE_DIAGNOSTIC_PROFILE],
    [CORE_DIAGNOSTIC_PROFILE, CORE_FOLLOWUP_PROFILE],
  ]) {
    const fixture = manifestFixture(t, manifestProfile);
    refusal(
      'conversation-runner',
      [
        '--run',
        ...fixture.args,
        ...(requestedProfile ? ['--profile', requestedProfile] : []),
      ],
      'core_runner_manifest_profile',
    );
    // The existing fresh-output guard may claim an empty directory. Nothing is
    // prepared there and no broker, database, permit or ledger can be created.
    assert.deepEqual(fs.readdirSync(fixture.output), []);
    assert.deepEqual(fs.readdirSync(fixture.root).sort(), [
      'manifest.json',
      'unused-output',
    ]);
  }
});

test('local preparation keeps its explicit action and closed CLI without invoking the preparer', () => {
  refusal(
    'local-prepare',
    ['--profile', CORE_FOLLOWUP_PROFILE],
    'core_local_preparation_only',
  );
  refusal(
    'local-prepare',
    ['--prepare', '--profile', CORE_FOLLOWUP_PROFILE, '--permit', 'unused'],
    'Unknown option',
  );
});
