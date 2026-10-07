import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { qualifyProfileMetadata } from './current-candidate-profile-metadata.mjs';
import { freezeCurrentCandidate } from './current-candidate.mjs';

const backend = fileURLToPath(new URL('../..', import.meta.url));
const candidate = freezeCurrentCandidate(backend, 'a'.repeat(40));
const example = JSON.parse(
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
  paidAuthorized: false,
  remoteServerQualified: false,
  credentialsRead: false,
  resourcesCreated: false,
};
const qualify = (metadata, changes = {}) =>
  qualifyProfileMetadata({ metadata, candidate, localObservation, ...changes });
const populated = () => ({
  ...structuredClone(example),
  expectedCandidate: {
    candidateCommit: candidate.candidateCommit,
    manifestSha256: candidate.manifestSha256,
  },
  target: {
    host: 'synthetic-host',
    profile: 'synthetic-proof',
    platform: 'linux',
    architecture: 'x64',
    workDirectory: '/not-opened/synthetic/work',
  },
  principals: {
    backend: 'synthetic-runner',
    runner: 'synthetic-runner',
    broker: 'synthetic-broker',
    database: 'synthetic-db',
  },
  credentialSource: {
    kind: 'file',
    reference: '/not-opened/synthetic/credential',
    owner: 'synthetic-operator',
    reader: 'synthetic-broker',
  },
  isolationEvidence: Object.fromEntries(
    ['inventory', 'egress', 'credentialAccess'].map((key) => [
      key,
      { reference: `/not-opened/${key}`, sha256: 'b'.repeat(64) },
    ]),
  ),
});

test('unknown profile reports exact missing metadata and never admits a run', () => {
  const result = qualify(example);
  assert.equal(result.status, 'INCOMPLETE');
  assert.deepEqual(result.missingMetadata, [
    'EXACT_CANDIDATE_NOT_DECLARED',
    'TARGET_PROFILE_UNKNOWN',
    'PROCESS_PRINCIPALS_UNKNOWN',
    'CREDENTIAL_REFERENCE_OWNER_READER_UNKNOWN',
    'ISOLATION_INVENTORY_EVIDENCE_UNKNOWN',
    'ISOLATION_EGRESS_EVIDENCE_UNKNOWN',
    'ISOLATION_CREDENTIAL_ACCESS_EVIDENCE_UNKNOWN',
  ]);
  assert.deepEqual(result.candidate.proposedLimits, candidate.limits);
  assert.equal(result.candidate.currentPricesVerified, false);
  assert.equal(result.paidAuthorized, false);
  assert.equal(result.certificate, 'NOT_ISSUED');
});
test('fully declared metadata remains unverified, references unopened, all authority false', () => {
  const result = qualify(populated());
  assert.equal(result.status, 'METADATA_CHECKED_NOT_AUTHORIZED');
  assert.deepEqual(result.missingMetadata, []);
  assert.equal(result.requiredBeforeLive.length, 6);
  for (const key of [
    'referencesOpened',
    'credentialsRead',
    'resourcesCreated',
    'paidAuthorized',
    'upstreamAllowed',
    'realModelAcceptance',
    'remoteServerQualified',
  ])
    assert.equal(result[key], false);
  assert.equal(JSON.stringify(result).includes('/not-opened/'), false);
});
test('declared candidate drift and tampered frozen manifest refuse', () => {
  for (const key of ['candidateCommit', 'manifestSha256']) {
    const metadata = populated();
    metadata.expectedCandidate[key] = 'd'.repeat(
      key === 'candidateCommit' ? 40 : 64,
    );
    assert.throws(
      () => qualify(metadata),
      /candidate_profile_binding_mismatch/,
    );
  }
  assert.throws(
    () =>
      qualify(example, {
        candidate: {
          ...candidate,
          limits: { ...candidate.limits, attempts: 1000 },
        },
      }),
    /candidate_profile_binding_invalid/,
  );
});
test('metadata and observed install digests change independently', () => {
  const first = qualify(populated()),
    metadata = populated();
  metadata.target.host = 'other-synthetic-host';
  assert.notEqual(qualify(metadata).metadataSha256, first.metadataSha256);
  const other = qualify(populated(), {
    localObservation: { ...localObservation, platform: 'linux' },
  });
  assert.equal(other.metadataSha256, first.metadataSha256);
  assert.notEqual(other.localObservationSha256, first.localObservationSha256);
  assert.equal(
    first.localObservationSha256,
    createHash('sha256').update(JSON.stringify(localObservation)).digest('hex'),
  );
});
test('secret-shaped extras and malformed values fail without echoing input', () => {
  const mutations = [
    (m) => {
      m.env = { DEEPSEEK_API_KEY: 'PRIVATE_CANARY_NEVER_ECHO' };
    },
    (m) => {
      m.credentialSource.key = 'PRIVATE_CANARY_NEVER_ECHO';
    },
    (m) => {
      m.target.command = 'PRIVATE_CANARY_NEVER_ECHO';
    },
    (m) => {
      m.credentialSource.reference = 'Bearer PRIVATE_CANARY_NEVER_ECHO';
    },
    (m) => {
      m.isolationEvidence.egress = { isolated: true };
    },
    (m) => {
      m.target.workDirectory = 'relative';
    },
    (m) => {
      m.principals.broker = m.principals.backend;
    },
    (m) => {
      m.credentialSource.reader = 'wrong-reader';
    },
    (m) => {
      delete m.authority;
    },
  ];
  for (const mutate of mutations) {
    const metadata = populated();
    mutate(metadata);
    assert.throws(
      () => qualify(metadata),
      (error) => {
        assert.equal(error.message, 'candidate_profile_metadata_invalid');
        return true;
      },
    );
  }
});
test('metadata cannot enable any authority or bless a live local observation', () => {
  for (const key of Object.keys(example.authority)) {
    const metadata = populated();
    metadata.authority[key] = true;
    assert.throws(
      () => qualify(metadata),
      /candidate_profile_metadata_invalid/,
    );
  }
  for (const key of [
    'paidAuthorized',
    'credentialsRead',
    'resourcesCreated',
    'remoteServerQualified',
  ])
    assert.throws(
      () =>
        qualify(example, {
          localObservation: { ...localObservation, [key]: true },
        }),
      /candidate_profile_binding_invalid/,
    );
});

function cliFixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'maya-profile-metadata-test-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const metadata = path.join(directory, 'profile.json');
  fs.writeFileSync(metadata, JSON.stringify(example));
  for (const binary of ['postgres', 'initdb', 'pg_ctl', 'createdb'])
    fs.writeFileSync(
      path.join(directory, binary),
      `#!/bin/sh\n[ "$#" = 1 ] && [ "$1" = --version ] || exit 91\nprintf '${binary} (PostgreSQL) 16.14\\n'\n`,
      { mode: 0o700 },
    );
  const invoke = (args) =>
    spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./current-candidate-http.mjs', import.meta.url)),
        ...args,
      ],
      {
        cwd: backend,
        encoding: 'utf8',
        timeout: 15000,
        env: { PATH: process.env.PATH, LANG: 'C', TZ: 'UTC' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  return { directory, metadata, invoke };
}
test('CLI produces bounded metadata preflight without creating DB/output/ledger or opening references', (t) => {
  const f = cliFixture(t);
  const metadata = populated();
  metadata.expectedCandidate = null;
  fs.writeFileSync(f.metadata, JSON.stringify(metadata));
  const before = fs.readdirSync(f.directory);
  const result = f.invoke([
    '--preflight',
    '--profile-metadata',
    f.metadata,
    '--pg-bin',
    f.directory,
  ]);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'INCOMPLETE');
  assert.equal(
    report.sourceBinding,
    'FROZEN_SOURCE_HASHES_CHECKED_AGAINST_HEAD',
  );
  assert.deepEqual(report.missingMetadata, ['EXACT_CANDIDATE_NOT_DECLARED']);
  assert.equal(report.referencesOpened, false);
  assert.equal(report.localObservation.binaries.postgres.version, '16.14');
  assert.deepEqual(fs.readdirSync(f.directory), before);
  assert.equal(result.stdout.includes('/not-opened'), false);
});
test('CLI refuses run mode and malformed metadata without input disclosure or resources', (t) => {
  const f = cliFixture(t),
    output = path.join(f.directory, 'must-not-exist');
  fs.writeFileSync(f.metadata, '{"secret":"PRIVATE_CANARY_NEVER_ECHO"');
  for (const args of [
    ['--run', '--output', output, '--profile-metadata', ''],
    ['--preflight', '--profile-metadata', '', '--pg-bin', f.directory],
    ['--run', '--output', output, '--profile-metadata', f.metadata],
    ['--preflight', '--run', '--profile-metadata', f.metadata],
    ['--preflight', '--profile-metadata', f.metadata],
  ]) {
    const result = f.invoke(args);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(
      (result.stdout + result.stderr).includes('PRIVATE_CANARY_NEVER_ECHO'),
      false,
    );
    assert.equal(fs.existsSync(output), false);
  }
});
test('CLI refuses oversized and symlinked metadata before installed-binary reads', (t) => {
  const f = cliFixture(t),
    link = path.join(f.directory, 'link.json');
  fs.writeFileSync(f.metadata, ' '.repeat(16385));
  fs.symlinkSync(f.metadata, link);
  for (const metadata of [f.metadata, link]) {
    const result = f.invoke(['--preflight', '--profile-metadata', metadata]);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), 'candidate_profile_preflight_failed');
    assert.equal(result.stdout, '');
  }
});
