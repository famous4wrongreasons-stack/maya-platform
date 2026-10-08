// Existing candidate/corpus ownership, narrowed to the frozen core diagnostic.
// A manifest binds source bytes; it never authorizes a model request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CORE_DIAGNOSTIC_PROFILE,
  CORE_DIAGNOSTIC_LIMITS,
  CORE_DIAGNOSTIC_LIMITS_SHA256,
} from './current-candidate-budget.mjs';
export const coreBackend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const coreRepo = path.dirname(coreBackend);
export const coreHash = (bytes) =>
  createHash('sha256').update(bytes).digest('hex');
const datasetPath =
  'maya-saas-backend/datasets/conversation-intelligence/core-diagnostic-20261008.json';
const scopes = [
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
const git = (args) =>
  execFileSync('git', args, {
    cwd: coreRepo,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
  });
export function assertCoreSources(manifest) {
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
    manifest.sourceHashes[datasetPath],
    'core_dataset_binding',
  );
  assert.deepEqual(
    manifest.cases,
    JSON.parse(fs.readFileSync(path.join(coreRepo, datasetPath), 'utf8')).cases,
    'core_cases_changed',
  );
}
export function captureCoreManifest(mode, admissionContext = null) {
  assert.ok(['DRY_HTTP', 'ADMITTED_MODEL_HTTP'].includes(mode), 'core_mode');
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
    fs.readFileSync(path.join(coreRepo, datasetPath), 'utf8'),
  );
  const manifest = {
    contract: 'maya.core-conversation-run/1',
    mode,
    profile: CORE_DIAGNOSTIC_PROFILE,
    candidateCommit,
    sourceHashes,
    datasetSha256: sourceHashes[datasetPath],
    dialogs: 3,
    userTurns: 5,
    cases: dataset.cases,
    limits: CORE_DIAGNOSTIC_LIMITS,
    limitsSha256: CORE_DIAGNOSTIC_LIMITS_SHA256,
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
