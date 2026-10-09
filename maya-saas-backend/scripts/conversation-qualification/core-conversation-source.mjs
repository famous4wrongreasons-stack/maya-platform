// Existing candidate/corpus ownership, narrowed to fixed frozen core profiles.
// A manifest binds source bytes; it never authorizes a model request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_OFFLINE_PROFILE,
} from './current-candidate-budget.mjs';
import { coreConversationProfile } from './core-conversation-profile.mjs';
export const coreBackend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const coreRepo = path.dirname(coreBackend);
export const coreHash = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const scopes = [
  'docs/rebuild/evidence/conversation-coverage-20261009/frozen-proposal.json',
  'maya-saas-backend/src',
  'maya-saas-backend/prisma',
  'maya-saas-backend/scripts/conversation-qualification',
  'maya-saas-backend/scripts/c9-occupancy-proof.mjs',
  'maya-saas-backend/datasets/conversation-intelligence',
  'maya-saas-backend/test/widgets-live',
  'maya-saas-backend/test/jest-core-conversation-http.json',
  'maya-saas-backend/test/jest-current-candidate-http.json',
  'maya-saas-backend/test/jest-widgets-live.json',
  'maya-saas-backend/test/tsconfig.widgets-live.json',
  'maya-saas-backend/package.json',
  'maya-saas-backend/package-lock.json',
  'maya-saas-backend/prisma.config.ts',
  'maya-saas-backend/tsconfig.json',
  'maya-saas-backend/tsconfig.build.json',
  'maya-carrier-react',
  'maya-chat-shell',
];
const git = (args, repository = coreRepo) =>
  execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
  });
// Refuse additions as well as changed known files, before migrate deploy or model I/O.
export function assertCoreInventory(
  candidateCommit,
  files,
  repository = coreRepo,
) {
  assert.equal(
    git(['rev-parse', 'HEAD'], repository).trim(),
    candidateCommit,
    'core_candidate_changed',
  );
  assert.equal(
    git(
      ['status', '--porcelain', '--untracked-files=all', '--', ...scopes],
      repository,
    ),
    '',
    'core_sources_uncommitted',
  );
  const actual = git(['ls-files', '-z', '--', ...scopes], repository)
    .split('\0')
    .filter(Boolean)
    .sort();
  assert.deepEqual(actual, [...files].sort(), 'core_source_inventory_changed');
}
export function assertCoreSources(manifest) {
  assert.equal(typeof manifest.profile, 'string', 'core_profile_required');
  const profile = coreConversationProfile(manifest.profile);
  assert.ok(
    profile.id !== CORE_OFFLINE_PROFILE || manifest.mode === 'DRY_HTTP',
    'core_profile_offline_only',
  );
  assert.equal(
    manifest.datasetSha256,
    profile.datasetSha256,
    'core_dataset_pin',
  );
  assert.equal(manifest.dialogs, profile.dialogs, 'core_dialog_scope');
  assert.equal(manifest.userTurns, profile.userTurns, 'core_turn_scope');
  assert.equal(manifest.limitsSha256, profile.limitsSha256, 'core_limits_pin');
  assert.deepEqual(manifest.limits, profile.limits, 'core_limits_changed');
  assert.equal(
    coreHash(JSON.stringify(manifest.cases)),
    profile.casesSha256,
    'core_cases_pin',
  );
  assertCoreInventory(
    manifest.candidateCommit,
    Object.keys(manifest.sourceHashes),
  );
  assert.ok(
    manifest.sourceHashes && Object.keys(manifest.sourceHashes).length > 1000,
    'core_source_binding_required',
  );
  for (const [name, expected] of Object.entries(manifest.sourceHashes)) {
    const resolved = path.resolve(coreRepo, name),
      relative = path.relative(coreRepo, resolved);
    assert.ok(
      !path.isAbsolute(relative) &&
        relative &&
        !relative.startsWith('..') &&
        name === relative,
      'core_source_path',
    );
    assert.match(expected, /^[a-f0-9]{64}$/);
    assert.equal(
      coreHash(fs.readFileSync(resolved)),
      expected,
      'core_source_changed',
    );
  }
  assert.equal(
    manifest.datasetSha256,
    manifest.sourceHashes[profile.datasetPath],
    'core_dataset_binding',
  );
  const dataset = JSON.parse(
    fs.readFileSync(path.join(coreRepo, profile.datasetPath), 'utf8'),
  );
  assert.deepEqual(manifest.cases, dataset.cases, 'core_cases_changed');
  if (profile.id === CORE_OFFLINE_PROFILE) {
    assert.equal(
      manifest.sourceHashes[dataset.sourceProposal.path],
      dataset.sourceProposal.sha256,
      'core_offline_proposal_pin',
    );
    for (const [name, expected] of Object.entries(dataset.sourceHashes))
      assert.equal(
        manifest.sourceHashes[name],
        expected,
        'core_offline_source_pin',
      );
  }
}
export function captureCoreManifest(
  mode,
  admissionContext = null,
  profileId = CORE_DIAGNOSTIC_PROFILE,
) {
  const profile = coreConversationProfile(profileId);
  assert.ok(
    profile.id !== CORE_OFFLINE_PROFILE ||
      (mode === 'DRY_HTTP' && admissionContext === null),
    'core_profile_offline_only',
  );
  assert.ok(
    ['DRY_HTTP', 'ADMITTED_MODEL_HTTP', 'ADMITTED_LOCAL_MODEL_HTTP'].includes(
      mode,
    ),
    'core_mode',
  );
  assert.equal(
    mode === 'DRY_HTTP',
    admissionContext === null,
    'core_admission_context',
  );
  const candidateCommit = git(['rev-parse', 'HEAD']).trim();
  assert.match(candidateCommit, /^[a-f0-9]{40}$/);
  assert.equal(
    git(['status', '--porcelain', '--untracked-files=normal', '--', ...scopes]),
    '',
    'core_sources_uncommitted',
  );
  const files = git(['ls-files', '-z', '--', ...scopes])
    .split('\0')
    .filter(Boolean)
    .sort();
  const sourceHashes = Object.fromEntries(
    files.map((name) => [
      name,
      coreHash(fs.readFileSync(path.join(coreRepo, name))),
    ]),
  );
  const dataset = JSON.parse(
    fs.readFileSync(path.join(coreRepo, profile.datasetPath), 'utf8'),
  );
  const manifest = {
    contract: 'maya.core-conversation-run/1',
    mode,
    profile: profile.id,
    candidateCommit,
    sourceHashes,
    datasetSha256: sourceHashes[profile.datasetPath],
    dialogs: profile.dialogs,
    userTurns: profile.userTurns,
    cases: dataset.cases,
    limits: profile.limits,
    limitsSha256: profile.limitsSha256,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    paidAuthorized: false,
    upstreamAllowed: false,
    credentialAdmission: false,
    admissionContext,
  };
  assertCoreSources(manifest);
  return manifest;
}
