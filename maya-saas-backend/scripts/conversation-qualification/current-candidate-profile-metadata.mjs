// Declared metadata only. No file, secret-store, process, network or permit I/O.
import { createHash } from 'node:crypto';

const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = () => {
  throw new Error('candidate_profile_metadata_invalid');
};
const object = (value, keys) => {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    fail();
};
const label = (value) => {
  // Identifiers/references only: no commands, headers, environment maps or URLs
  // with query credentials. Values are never included in errors or the report.
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    !/^[a-zA-Z0-9_./:@-]+$/.test(value)
  )
    fail();
};
const sha = (value, size = 64) => {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^[a-f0-9]{${size}}$`).test(value)
  )
    fail();
};
const evidence = (value) => {
  if (value === null) return;
  object(value, ['reference', 'sha256']);
  label(value.reference);
  sha(value.sha256);
};

export function validateProfileMetadata(metadata) {
  object(metadata, [
    'contract',
    'expectedCandidate',
    'target',
    'principals',
    'credentialSource',
    'isolationEvidence',
    'authority',
  ]);
  if (metadata.contract !== 'maya.current-candidate-profile-metadata/1') fail();
  if (metadata.expectedCandidate !== null) {
    object(metadata.expectedCandidate, ['candidateCommit', 'manifestSha256']);
    sha(metadata.expectedCandidate.candidateCommit, 40);
    sha(metadata.expectedCandidate.manifestSha256);
  }
  if (metadata.target !== null) {
    object(metadata.target, [
      'host',
      'profile',
      'platform',
      'architecture',
      'workDirectory',
    ]);
    for (const value of Object.values(metadata.target)) label(value);
    if (
      !['darwin', 'linux'].includes(metadata.target.platform) ||
      !['arm64', 'x64'].includes(metadata.target.architecture) ||
      !metadata.target.workDirectory.startsWith('/')
    )
      fail();
  }
  if (metadata.principals !== null) {
    object(metadata.principals, ['backend', 'runner', 'broker', 'database']);
    for (const value of Object.values(metadata.principals)) label(value);
    if (
      [
        metadata.principals.backend,
        metadata.principals.runner,
        metadata.principals.database,
      ].includes(metadata.principals.broker)
    )
      fail();
  }
  if (metadata.credentialSource !== null) {
    object(metadata.credentialSource, ['kind', 'reference', 'owner', 'reader']);
    for (const value of Object.values(metadata.credentialSource)) label(value);
    if (!['secret-store', 'file'].includes(metadata.credentialSource.kind))
      fail();
    if (
      metadata.principals &&
      metadata.credentialSource.reader !== metadata.principals.broker
    )
      fail();
  }
  object(metadata.isolationEvidence, [
    'inventory',
    'egress',
    'credentialAccess',
  ]);
  for (const value of Object.values(metadata.isolationEvidence))
    evidence(value);
  object(metadata.authority, [
    'paidAuthorized',
    'credentialAdmission',
    'resourceCreation',
    'upstreamAllowed',
  ]);
  if (Object.values(metadata.authority).some((value) => value !== false))
    fail();
  return metadata;
}

export function qualifyProfileMetadata({
  metadata,
  candidate,
  localObservation,
}) {
  validateProfileMetadata(metadata);
  const { manifestSha256, ...manifest } = candidate;
  sha(candidate.candidateCommit, 40);
  sha(manifestSha256);
  if (
    digest(manifest) !== manifestSha256 ||
    candidate.paidAuthorized !== false ||
    candidate.currentPricesVerified !== false ||
    localObservation?.contract !==
      'maya.current-candidate-local-proof-profile/1' ||
    localObservation.mode !== 'NO_UPSTREAM_ONLY' ||
    localObservation.paidAuthorized !== false ||
    localObservation.credentialsRead !== false ||
    localObservation.resourcesCreated !== false ||
    localObservation.remoteServerQualified !== false
  )
    throw new Error('candidate_profile_binding_invalid');
  if (
    metadata.expectedCandidate &&
    (metadata.expectedCandidate.candidateCommit !== candidate.candidateCommit ||
      metadata.expectedCandidate.manifestSha256 !== manifestSha256)
  )
    throw new Error('candidate_profile_binding_mismatch');
  const missing = [];
  for (const [key, code] of [
    ['expectedCandidate', 'EXACT_CANDIDATE_NOT_DECLARED'],
    ['target', 'TARGET_PROFILE_UNKNOWN'],
    ['principals', 'PROCESS_PRINCIPALS_UNKNOWN'],
    ['credentialSource', 'CREDENTIAL_REFERENCE_OWNER_READER_UNKNOWN'],
  ])
    if (metadata[key] === null) missing.push(code);
  for (const [key, value] of Object.entries(metadata.isolationEvidence))
    if (value === null)
      missing.push(
        `ISOLATION_${key.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()}_EVIDENCE_UNKNOWN`,
      );
  return {
    contract: 'maya.current-candidate-profile-preflight/1',
    status: missing.length ? 'INCOMPLETE' : 'METADATA_CHECKED_NOT_AUTHORIZED',
    metadataSha256: digest(metadata),
    candidate: {
      candidateCommit: candidate.candidateCommit,
      manifestSha256,
      corpusSha256: candidate.sourceSha256,
      sourceHashes: candidate.sourceHashes,
      proposedLimits: candidate.limits,
      limitsSha256: digest(candidate.limits),
      currentPricesVerified: false,
    },
    localObservation,
    localObservationSha256: digest(localObservation),
    missingMetadata: missing,
    requiredBeforeLive: [
      'TARGET_INVENTORY_PRINCIPALS_AND_ISOLATION_NOT_VERIFIED',
      'TARGET_RESOURCE_HEADROOM_NOT_MEASURED',
      'LIVE_BROKER_AND_PROFILE_BINDING_NOT_IMPLEMENTED',
      'FINAL_TARGET_FULL_KEYLESS_PROOF_REQUIRED',
      'CURRENT_PRICE_AND_ACCOUNT_MODEL_UNCHECKED',
      'FRESH_OWNER_AUTHORIZATION_REQUIRED',
    ],
    referencesOpened: false,
    credentialsRead: false,
    resourcesCreated: false,
    paidAuthorized: false,
    upstreamAllowed: false,
    realModelAcceptance: false,
    remoteServerQualified: false,
    certificate: 'NOT_ISSUED',
  };
}
