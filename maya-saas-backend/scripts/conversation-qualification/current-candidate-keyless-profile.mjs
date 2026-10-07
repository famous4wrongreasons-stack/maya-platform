// One immutable local NO_UPSTREAM_ONLY binding, not a permit or target attestation.
// Declared references are never opened; the bounded reader opens only its explicit
// JSON argument. This module has no network, credentials, process or write API.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROFILE_REQUIRED_BEFORE_LIVE,
  qualifyProfileMetadata,
  validateProfileMetadata,
} from './current-candidate-profile-metadata.mjs';

const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const authority = Object.freeze({
  paidAuthorized: false,
  credentialAdmission: false,
  resourceCreation: false,
  upstreamAllowed: false,
});

export function readBoundedProfileJson(file, maxBytes = 65536) {
  try {
    assert.ok(path.isAbsolute(file) && file.endsWith('.json'));
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
      const stat = fs.fstatSync(fd);
      assert.ok(stat.isFile() && stat.size <= maxBytes);
      const bytes = Buffer.alloc(maxBytes + 1);
      const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
      assert.ok(count <= maxBytes);
      return JSON.parse(bytes.subarray(0, count).toString('utf8'));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    throw new Error('candidate_profile_json_invalid');
  }
}

export function createKeylessProfileBinding({
  metadata,
  candidate,
  localObservation,
}) {
  validateProfileMetadata(metadata);
  // Exact candidate is engineering data, not missing operator input. A supplied
  // expectation is still checked by the existing metadata owner without repair.
  const effectiveMetadata = {
    ...metadata,
    expectedCandidate: metadata.expectedCandidate ?? {
      candidateCommit: candidate.candidateCommit,
      manifestSha256: candidate.manifestSha256,
    },
  };
  const report = qualifyProfileMetadata({
    metadata: effectiveMetadata,
    candidate,
    localObservation,
  });
  const unsigned = {
    contract: 'maya.current-candidate-keyless-profile/1',
    mode: 'NO_UPSTREAM_ONLY',
    candidateCommit: report.candidate.candidateCommit,
    candidateManifestSha256: report.candidate.manifestSha256,
    corpusSha256: report.candidate.corpusSha256,
    limitsSha256: report.candidate.limitsSha256,
    suppliedMetadataSha256: hash(metadata),
    effectiveMetadataSha256: report.metadataSha256,
    expectedCandidateBinding:
      metadata.expectedCandidate === null
        ? 'CAPTURED_CURRENT_CANDIDATE'
        : 'CHECKED_DECLARED_CANDIDATE',
    localObservation: structuredClone(localObservation),
    localObservationSha256: report.localObservationSha256,
    metadataStatus: report.status,
    missingMetadata: report.missingMetadata,
    requiredBeforeLive: report.requiredBeforeLive,
    authority: { ...authority },
    referencesOpened: false,
    remoteServerQualified: false,
    realModelAcceptance: false,
  };
  return { ...unsigned, keylessProfileSha256: hash(unsigned) };
}

export function verifyKeylessProfileBinding({
  binding,
  candidate,
  expectedSha256,
}) {
  try {
    assert.ok(sha(expectedSha256));
    assert.deepEqual(
      Object.keys(binding).sort(),
      [
        'contract',
        'mode',
        'candidateCommit',
        'candidateManifestSha256',
        'corpusSha256',
        'limitsSha256',
        'suppliedMetadataSha256',
        'effectiveMetadataSha256',
        'expectedCandidateBinding',
        'localObservation',
        'localObservationSha256',
        'metadataStatus',
        'missingMetadata',
        'requiredBeforeLive',
        'authority',
        'referencesOpened',
        'remoteServerQualified',
        'realModelAcceptance',
        'keylessProfileSha256',
      ].sort(),
    );
    const { keylessProfileSha256, ...unsigned } = binding;
    assert.equal(hash(unsigned), expectedSha256);
    assert.equal(keylessProfileSha256, expectedSha256);
    assert.equal(binding.contract, 'maya.current-candidate-keyless-profile/1');
    assert.equal(binding.mode, 'NO_UPSTREAM_ONLY');
    assert.deepEqual(binding.authority, authority);
    for (const key of [
      'referencesOpened',
      'remoteServerQualified',
      'realModelAcceptance',
    ])
      assert.equal(binding[key], false);
    const { manifestSha256, ...base } = candidate;
    assert.equal(hash(base), manifestSha256);
    assert.equal(candidate.paidAuthorized, false);
    assert.equal(candidate.currentPricesVerified, false);
    assert.equal(binding.candidateCommit, candidate.candidateCommit);
    assert.equal(binding.candidateManifestSha256, manifestSha256);
    assert.equal(binding.corpusSha256, candidate.sourceSha256);
    assert.equal(binding.limitsSha256, hash(candidate.limits));
    assert.ok(
      sha(binding.suppliedMetadataSha256) &&
        sha(binding.effectiveMetadataSha256),
    );
    assert.ok(
      ['CAPTURED_CURRENT_CANDIDATE', 'CHECKED_DECLARED_CANDIDATE'].includes(
        binding.expectedCandidateBinding,
      ),
    );
    assert.equal(
      hash(binding.localObservation),
      binding.localObservationSha256,
    );
    const observation = binding.localObservation;
    assert.equal(
      observation.contract,
      'maya.current-candidate-local-proof-profile/1',
    );
    assert.equal(observation.mode, 'NO_UPSTREAM_ONLY');
    for (const key of [
      'paidAuthorized',
      'credentialsRead',
      'resourcesCreated',
      'remoteServerQualified',
    ])
      assert.equal(observation[key], false);
    assert.ok(Array.isArray(binding.missingMetadata));
    assert.ok(
      binding.missingMetadata.every(
        (code) => typeof code === 'string' && /^[A-Z_]{1,96}$/.test(code),
      ),
    );
    assert.equal(
      binding.metadataStatus,
      binding.missingMetadata.length
        ? 'INCOMPLETE'
        : 'METADATA_CHECKED_NOT_AUTHORIZED',
    );
    assert.deepEqual(binding.requiredBeforeLive, PROFILE_REQUIRED_BEFORE_LIVE);
    return keylessProfileSha256;
  } catch {
    throw new Error('candidate_keyless_profile_binding_invalid');
  }
}
