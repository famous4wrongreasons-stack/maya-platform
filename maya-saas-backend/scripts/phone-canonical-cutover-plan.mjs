// Offline deployment preparation, not an executor, certificate or AR-1 owner.
// The intermediate main-process draft deliberately keeps providers closed/read-only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const FROM = '7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3';
export const TO = '6356db1875545337e34b6c8888b7ca858bb64361';
export const PROFILE = 'closed-input.no-handoff.no-price-goods@1';
const ROOT = '/srv/maya-phone-staging';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exactKeys = (value, keys) => assert.ok(value && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'unexpected preparation field');
const digest = value => assert.match(value, /^[a-f0-9]{64}$/, 'digest required');

// Preserve every old migration checksum. This compares Git inventories, NOT the
// server migration table; an empty difference never authorizes migrate deploy.
export function migrationDifference(previous, next) {
  const check = rows => {
    assert.ok(Array.isArray(rows) && rows.length > 0, 'migration inventory missing');
    const names = new Set();
    for (const row of rows) {
      exactKeys(row, ['path', 'sha256']);
      assert.match(row.path, /^maya-saas-backend\/prisma\/migrations\/[a-zA-Z0-9_-]+\/migration\.sql$/);
      digest(row.sha256); assert.ok(!names.has(row.path), 'duplicate migration'); names.add(row.path);
    }
    return new Map(rows.map(row => [row.path, row.sha256]));
  };
  const old = check(previous), current = check(next);
  for (const [name, checksum] of old) assert.ok(current.get(name) === checksum, 'removed or rewritten historical migration');
  return next.filter(row => !old.has(row.path)).map(row => ({ ...row }));
}

export function cutoverOrder() {
  return [
    'inspect-live-artifacts-schema-durable-grant-cas-and-key-references',
    'obtain-separate-owner-execution-authorization',
    'verify-backup-and-compatible-rollback-without-dropping-new-effects',
    'close-new-guest-post-admission-retain-status-and-original-receipts',
    'revoke-active-old-grant-on-matching-old-runtime-through-ar1',
    'verify-durable-disabled-row-and-atomic-revoke-audit',
    'apply-only-explicitly-approved-pending-migrations-if-any',
    'start-pinned-canonical-main-with-providers-closed',
    'verify-running-bytes-readiness-schema-and-retained-identity-state',
    'verify-new-transport-proof-and-bounded-provider-execution-authorization',
    'grant-through-existing-ar1-with-exact-certificate-tenant-profile-cas-expiry',
    'verify-effective-profile-and-handoff-price-goods-refusals',
  ];
}

export function rollbackOrder() {
  return [
    'close-new-guest-post-admission-retain-status-and-original-receipts',
    'revoke-new-grant-on-matching-new-runtime-through-ar1',
    'verify-durable-disabled-row-and-atomic-revoke-audit',
    'restore-recorded-compatible-runtime-and-carrier-artifacts',
    'retain-current-database-encryption-keys-and-action-engine-receipts',
    'verify-retained-identity-and-unknown-reconciliation-no-create-retry',
  ];
}

export function canonicalCutoverPlan({ historical, bindings, previousMigrations, targetMigrations }) {
  exactKeys(bindings, ['sourceCandidate', 'targetCandidate', 'profile', 'profileDigest', 'buildDigest', 'webTreeDigest', 'capacitorTreeDigest']);
  assert.equal(bindings.sourceCandidate, FROM); assert.equal(bindings.targetCandidate, TO);
  assert.equal(bindings.profile, PROFILE);
  for (const field of ['profileDigest', 'buildDigest', 'webTreeDigest', 'capacitorTreeDigest']) digest(bindings[field]);
  exactKeys(historical, ['compose', 'environment', 'privateEnvironmentKeys']);
  const old = historical.compose;
  assert.equal(old.name, 'maya-phone-staging');
  assert.equal(old.services.backend.image, 'maya-phone-backend:' + FROM);
  assert.deepEqual(old.services.backend.entrypoint, ['node', '/app/scripts/phone-ai-entry.mjs']);
  assert.deepEqual(old.services.backend.command, []);
  assert.deepEqual(old.services.backend.networks, ['private', 'catalog_private', 'model_private']);
  assert.equal(old.services.backend.environment.MAYA_RELEASE, FROM);
  assert.ok(old.networks.private.internal && old.networks.catalog_private.internal && old.networks.model_private.internal);
  assert.ok(old.services['model-egress'] && old.services['catalog-egress']);
  assert.equal(historical.environment.AI_CORE_PROVIDER, 'safe');
  assert.equal(historical.environment.YCLIENTS_BASE_URL, 'http://catalog-egress:8080/api/v1');
  // An offline expected baseline is reconstructed by existing plan owners. An
  // observed server configuration must later match it in full, or be reviewed.
  const draft = structuredClone(old);
  const backend = draft.services.backend;
  backend.image = 'maya-phone-backend:' + TO;
  backend.entrypoint = ['node', '--enable-source-maps', '/app/dist/src/main.js'];
  backend.command = []; // Suppress Dockerfile's automatic migrate-deploy CMD.
  backend.env_file = [ROOT + '/private/canonical-readonly.env'];
  backend.environment = { MAYA_RELEASE: TO, AI_CORE_PROVIDER: 'safe' };
  backend.networks = ['private', 'catalog_private'];
  backend.volumes = ['staging_uploads:/app/uploads'];
  delete draft.services['model-egress']; delete draft.networks.model_private;
  // Keep the finite read-only catalogue boundary until a separate bounded
  // canonical provider transport is implemented and proven. Never open edge.
  draft.services.gateway.volumes = draft.services.gateway.volumes.map(value =>
    value.replace(ROOT + '/candidates/' + FROM + '/', ROOT + '/candidates/' + TO + '/'));
  const environment = { ...historical.environment, MAYA_RELEASE: TO, AI_CORE_PROVIDER: 'safe' };
  return {
    contract: 'maya.phone-canonical-cutover-preparation/1', status: 'PREPARED_ONLY',
    target: { ...bindings }, baseline: { historicalOnly: true, compose: structuredClone(old), sha256: hash(old) },
    currentServerVerified: false, certificate: 'NOT_ISSUED', authorityGranted: false,
    readyForExecution: false, readyForBooking: false,
    // These are inspectable drafts, deliberately not written as deployable files.
    canonicalReadonlyDraft: { compose: draft, environment, privateEnvironmentKeys: [...historical.privateEnvironmentKeys] },
    migrations: { previous: structuredClone(previousMigrations), target: structuredClone(targetMigrations),
      addedInGit: migrationDifference(previousMigrations, targetMigrations),
      livePending: null, applyAuthorized: false },
    cutover: cutoverOrder(), rollback: rollbackOrder(),
    preserved: ['database-volume', 'uploads-volume', 'encrypted-history', 'client-identity',
      'action-engine-intents-nonces-receipts', 'unknown-outcomes', 'catalogue-read-budget'],
    forbidden: ['seed', 'reset', 'down-migration', 'restore-over-new-effects', 'mirror-writer',
      'new-create-for-unknown', 'tenant-owner-as-platform-authority', 'direct-provider-booking',
      'handoff', 'price-change', 'goods-receipt', 'plan-or-trial-widget-grant'],
    remaining: [
      'fresh complete canonical certificate/admission for the exact target bytes',
      'fresh live image/config/schema/grant/CAS and encryption-key-reference inventory',
      'inspectable image digest matching target compiled bytes; a candidate tag is not sufficient',
      'ordinary model client compatible bounded HTTPS transport and its synthetic proof',
      'bounded CRM transport through canonical Client -> confirmation -> Action Engine -> adapter, with synthetic lost-response/retry proof',
      'rehearsed rollback for the actual previous/next runtime and current durable data',
      'platform operator session and external signing through existing AR-1; no tenant role substitution',
      'one explicit operational authorization for exact update/grant and bounded real provider effects',
    ],
    effects: { network: 0, database: 0, deployment: 0, grants: 0, provider: 0, phoneInstallation: 0 },
  };
}

export function verifyCutoverPlan(plan, input) {
  assert.deepEqual(plan, canonicalCutoverPlan(input), 'cutover preparation changed; no inferred execution authority');
}

export function verifyHistoricalObservation(plan, observedCompose) {
  // Do not log either value: the operator's observation could contain a secret.
  assert.ok(hash(observedCompose) === plan.baseline.sha256, 'live configuration differs; explicit reconciliation required');
  return { matchesHistoricalComposeOnly: true, readyForExecution: false, authorityGranted: false };
}
