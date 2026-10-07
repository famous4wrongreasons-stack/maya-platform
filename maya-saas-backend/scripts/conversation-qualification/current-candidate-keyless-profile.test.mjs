import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freezeCurrentCandidate } from './current-candidate.mjs';
import {
  createKeylessProfileBinding,
  readBoundedProfileJson,
  verifyKeylessProfileBinding,
} from './current-candidate-keyless-profile.mjs';

const backend = fileURLToPath(new URL('../..', import.meta.url));
const candidate = freezeCurrentCandidate(backend, 'a'.repeat(40));
const metadata = JSON.parse(
  fs.readFileSync(
    new URL(
      './current-candidate-profile-metadata.example.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const localObservation = {
  contract: 'maya.current-candidate-local-proof-profile/1',
  mode: 'NO_UPSTREAM_ONLY',
  platform: 'darwin',
  architecture: 'arm64',
  binaries: { postgres: { version: '16.14', sha256: 'b'.repeat(64) } },
  paidAuthorized: false,
  remoteServerQualified: false,
  credentialsRead: false,
  resourcesCreated: false,
};
const create = (changes = {}) =>
  createKeylessProfileBinding({
    metadata,
    candidate,
    localObservation,
    ...changes,
  });
const verify = (binding, changes = {}) =>
  verifyKeylessProfileBinding({
    binding,
    candidate,
    expectedSha256: binding.keylessProfileSha256,
    ...changes,
  });
const resign = (binding) => {
  const { keylessProfileSha256: _old, ...unsigned } = binding;
  return {
    ...unsigned,
    keylessProfileSha256: createHash('sha256')
      .update(JSON.stringify(unsigned))
      .digest('hex'),
  };
};

test('keyless binding captures exact candidate without requiring operator input or authority', () => {
  const binding = create();
  assert.equal(verify(binding), binding.keylessProfileSha256);
  assert.equal(binding.expectedCandidateBinding, 'CAPTURED_CURRENT_CANDIDATE');
  assert.equal(binding.candidateManifestSha256, candidate.manifestSha256);
  assert.equal(binding.metadataStatus, 'INCOMPLETE');
  assert.equal(
    binding.missingMetadata.includes('EXACT_CANDIDATE_NOT_DECLARED'),
    false,
  );
  assert.equal(
    binding.missingMetadata.includes(
      'CREDENTIAL_REFERENCE_OWNER_READER_UNKNOWN',
    ),
    true,
  );
  assert.deepEqual(Object.values(binding.authority), [
    false,
    false,
    false,
    false,
  ]);
  assert.equal(binding.referencesOpened, false);
  assert.equal(binding.realModelAcceptance, false);
  assert.equal(binding.requiredBeforeLive.length, 6);
  assert.equal(metadata.expectedCandidate, null);
});

test('a declared wrong candidate is not repaired and incomplete input is not normalized into validity', () => {
  assert.throws(
    () =>
      create({
        metadata: {
          ...metadata,
          expectedCandidate: {
            candidateCommit: 'b'.repeat(40),
            manifestSha256: candidate.manifestSha256,
          },
        },
      }),
    /candidate_profile_binding_mismatch/,
  );
  const { expectedCandidate: _old, ...missingField } = metadata;
  assert.throws(
    () => create({ metadata: missingField }),
    /candidate_profile_metadata_invalid/,
  );
});

test('metadata and installation changes refuse an earlier launch pin', () => {
  const original = create();
  for (const changed of [
    create({
      metadata: {
        ...metadata,
        expectedCandidate: {
          candidateCommit: candidate.candidateCommit,
          manifestSha256: candidate.manifestSha256,
        },
      },
    }),
    create({ localObservation: { ...localObservation, platform: 'linux' } }),
  ]) {
    assert.notEqual(
      changed.keylessProfileSha256,
      original.keylessProfileSha256,
    );
    assert.throws(
      () => verify(changed, { expectedSha256: original.keylessProfileSha256 }),
      /candidate_keyless_profile_binding_invalid/,
    );
  }
  const changed = structuredClone(original);
  changed.localObservation.binaries.postgres.version = '16.15';
  assert.equal(original.localObservation.binaries.postgres.version, '16.14');
  assert.throws(
    () => verify(changed),
    /candidate_keyless_profile_binding_invalid/,
  );
});

test('changed code, corpus or limits cannot reuse a profile binding', () => {
  const binding = create();
  for (const change of [
    { candidateCommit: 'b'.repeat(40) },
    { sourceSha256: 'c'.repeat(64) },
    { limits: { ...candidate.limits, attempts: 97 } },
  ]) {
    const { manifestSha256: _old, ...base } = candidate;
    const next = { ...base, ...change };
    next.manifestSha256 = createHash('sha256')
      .update(JSON.stringify(next))
      .digest('hex');
    assert.throws(
      () => verify(binding, { candidate: next }),
      /candidate_keyless_profile_binding_invalid/,
    );
  }
});

test('a recomputed digest cannot admit authority, omit live blockers or attach extra fields', () => {
  const mutations = [
    (b) => {
      b.authority.upstreamAllowed = true;
    },
    (b) => {
      b.localObservation.credentialsRead = true;
    },
    (b) => {
      b.requiredBeforeLive = [];
    },
    (b) => {
      b.metadataStatus = 'READY_FOR_PAID';
    },
    (b) => {
      b.extra = 'PRIVATE_CANARY_NEVER_ECHO';
    },
  ];
  for (const mutate of mutations) {
    const binding = create();
    mutate(binding);
    assert.throws(
      () => verify(resign(binding)),
      (error) => {
        assert.equal(
          error.message,
          'candidate_keyless_profile_binding_invalid',
        );
        return true;
      },
    );
  }
});

test('declared credential and evidence references are not opened or emitted by binding', () => {
  const declared = {
    ...metadata,
    credentialSource: {
      kind: 'file',
      reference: '/never-open/synthetic',
      owner: 'operator',
      reader: 'broker',
    },
    isolationEvidence: {
      ...metadata.isolationEvidence,
      inventory: { reference: '/never-open/inventory', sha256: 'a'.repeat(64) },
    },
  };
  const open = fs.openSync;
  fs.openSync = () => {
    throw new Error('reference_open_forbidden');
  };
  try {
    const binding = create({ metadata: declared });
    assert.equal(verify(binding), binding.keylessProfileSha256);
    assert.equal(JSON.stringify(binding).includes('/never-open/'), false);
  } finally {
    fs.openSync = open;
  }
});

test('bounded binding reader refuses symlinks, oversized and malformed files without disclosure', (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-keyless-binding-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'binding.json'),
    link = path.join(directory, 'link.json');
  fs.writeFileSync(file, JSON.stringify(create()));
  assert.equal(
    verify(readBoundedProfileJson(file)),
    create().keylessProfileSha256,
  );
  fs.symlinkSync(file, link);
  assert.throws(
    () => readBoundedProfileJson(link),
    /candidate_profile_json_invalid/,
  );
  for (const value of ['x'.repeat(65537), '{"PRIVATE_CANARY_NEVER_ECHO":']) {
    fs.writeFileSync(file, value);
    assert.throws(
      () => readBoundedProfileJson(file),
      (error) => {
        assert.equal(error.message, 'candidate_profile_json_invalid');
        return true;
      },
    );
  }
});

test('new CLI flag is keyless-run-only and malformed input creates no output', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maya-keyless-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'metadata.json'),
    output = path.join(directory, 'absent');
  fs.writeFileSync(file, '{"PRIVATE_CANARY_NEVER_ECHO":');
  for (const args of [
    ['--preflight', '--keyless-profile-metadata', file],
    ['--run', '--output', output, '--keyless-profile-metadata', file],
    [
      '--run',
      '--broker-preflight',
      '--output',
      output,
      '--keyless-profile-metadata',
      '',
    ],
    [
      '--run',
      '--broker-preflight',
      '--output',
      output,
      '--keyless-profile-metadata',
      file,
    ],
    [
      '--run',
      '--broker-preflight',
      '--output',
      output,
      '--keyless-profile-metadata',
      file,
      '--profile-metadata',
      file,
    ],
  ]) {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./current-candidate-http.mjs', import.meta.url)),
        ...args,
      ],
      {
        cwd: backend,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          NODE_OPTIONS: '--max-old-space-size=256',
          TZ: 'UTC',
        },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(
      (result.stdout + result.stderr).includes('PRIVATE_CANARY_NEVER_ECHO'),
      false,
    );
    assert.equal(fs.existsSync(output), false);
  }
});

test('Jest ESM adapter admits only the four exact qualification modules', () => {
  const require = createRequire(import.meta.url);
  const transformer = require('../../test/widgets-live/support/current-candidate-mjs-transform.cjs');
  for (const name of [
    'current-candidate',
    'current-candidate-budget',
    'current-candidate-keyless-profile',
    'current-candidate-profile-metadata',
  ])
    assert.match(
      transformer.process(
        'export const synthetic = true;',
        `/scripts/conversation-qualification/${name}.mjs`,
      ).code,
      /synthetic/,
    );
  for (const name of [
    'current-candidate-dry-broker',
    'current-candidate-other',
    'budget-gate',
  ])
    assert.throws(
      () =>
        transformer.process(
          'throw new Error("never executed");',
          `/scripts/conversation-qualification/${name}.mjs`,
        ),
      /candidate_mjs_transform_outside_finite_modules/,
    );
});
