// Fixed operational attachment to AR-1. No issuer, signing, grant, endpoint or
// business authority. Only installed trust and current canonical services admit.
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export const NATIVE_EXECUTION = 'maya.phone-native-execution/1';
export const NATIVE_PROFILE = 'closed-input.no-handoff.no-price-goods@1';
const id = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v);
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const exact = (v, keys) => {
  assert(v && typeof v === 'object' && !Array.isArray(v));
  assert.deepEqual(Object.keys(v).sort(), [...keys].sort());
};
export const canonicalExecution = (v) => {
  if (
    v === null ||
    ['string', 'boolean'].includes(typeof v) ||
    (typeof v === 'number' && Number.isFinite(v))
  )
    return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalExecution).join(',') + ']';
  assert(v && typeof v === 'object');
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalExecution(v[k]))
      .join(',') +
    '}'
  );
};
export const executionHash = (v) =>
  createHash('sha256').update(canonicalExecution(v)).digest('hex');
const instant = (v) => {
  assert(
    typeof v === 'string' &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString() === v,
  );
  return Date.parse(v);
};
export const EXECUTOR_FILES = Object.freeze([
  'phone-native-execution.mjs',
  'phone-native-run-guard.mjs',
  'phone-native-create-egress.mjs',
  'phone-native-runtime.mjs',
  'phone-native-entry.mjs',
  'phone-native-model.mjs',
  'phone-native-channel.mjs',
  'phone-native-forwarder.mjs',
  'local-yclients-read-transport.mjs',
  'local-yclients-read-profile.mjs',
  'local-yclients-read-status.mjs',
  'local-onboarding-profile.mjs',
  'conversation-qualification/current-candidate-budget.mjs',
  'conversation-qualification/core-local-ab-checks.mjs',
]);
export function installedExecutorDigest(scripts) {
  const h = createHash('sha256');
  for (const name of [...EXECUTOR_FILES].sort()) {
    const file = path.join(scripts, name),
      s = fs.lstatSync(file);
    assert(s.isFile() && !s.isSymbolicLink());
    h.update(name).update('\0').update(fs.readFileSync(file)).update('\0');
  }
  return h.digest('hex');
}

export function verifyExecutionAttachment(
  value,
  trust,
  installed,
  now = Date.now(),
) {
  // Defensive snapshot before any asynchronous work; no caller-owned mutable proof.
  const text = JSON.stringify(value);
  assert(Buffer.byteLength(text) <= 16384);
  const signed = JSON.parse(text);
  exact(signed, ['payload', 'keyId', 'signature']);
  const a = signed.payload;
  exact(a, [
    'contract',
    'runId',
    'candidateSha',
    'buildDigest',
    'executorDigest',
    'certificateDigest',
    'evidenceDigest',
    'profileId',
    'profileDigest',
    'grantAuthorizationDigest',
    'entitlementVersion',
    'environment',
    'serverOrigin',
    'tenantId',
    'companyId',
    'userId',
    'operatorId',
    'platformSessionId',
    'independentHumanReview',
    'notBefore',
    'expiresAt',
    'model',
    'pricing',
    'maxModelAttempts',
    'maxSpendNanoUsd',
    'maxReads',
    'maxCreates',
    'maxReschedules',
    'maxCancels',
  ]);
  assert.equal(a.contract, NATIVE_EXECUTION);
  for (const key of [
    'runId',
    'tenantId',
    'userId',
    'operatorId',
    'platformSessionId',
  ])
    assert(id(a[key]));
  assert(
    /^[1-9][0-9]{0,14}$/.test(a.companyId) &&
      Number.isSafeInteger(Number(a.companyId)),
  );
  assert(/^[a-f0-9]{40}$/.test(a.candidateSha));
  for (const key of [
    'buildDigest',
    'executorDigest',
    'certificateDigest',
    'evidenceDigest',
    'profileDigest',
    'grantAuthorizationDigest',
    'entitlementVersion',
  ])
    assert(digest(a[key]));
  assert.equal(a.profileId, NATIVE_PROFILE);
  assert.equal(a.independentHumanReview, false);
  assert(['production', 'staging'].includes(a.environment));
  const origin = new URL(a.serverOrigin);
  assert(
    origin.protocol === 'https:' &&
      !origin.username &&
      !origin.password &&
      !origin.search &&
      !origin.hash &&
      origin.origin === a.serverOrigin,
  );
  assert(!origin.hostname.includes('*'));
  assert(
    instant(a.notBefore) <= now &&
      now < instant(a.expiresAt) &&
      instant(a.expiresAt) - instant(a.notBefore) <= 1800000,
  );
  assert.equal(a.model, 'deepseek-v4-pro');
  assert(
    Number.isSafeInteger(a.maxModelAttempts) &&
      a.maxModelAttempts > 0 &&
      a.maxModelAttempts <= 12,
  );
  assert(
    Number.isSafeInteger(a.maxSpendNanoUsd) &&
      a.maxSpendNanoUsd > 0 &&
      a.maxSpendNanoUsd <= 2_000_000_000,
  );
  assert(
    Number.isSafeInteger(a.maxReads) && a.maxReads > 0 && a.maxReads <= 256,
  );
  for (const key of ['maxCreates', 'maxReschedules', 'maxCancels'])
    assert.equal(a[key], 1);
  exact(a.pricing, [
    'model',
    'inputNanoUsdPerToken',
    'outputNanoUsdPerToken',
    'evidenceDigest',
    'verifiedAt',
    'validUntil',
  ]);
  assert.equal(a.pricing.model, a.model);
  assert(digest(a.pricing.evidenceDigest));
  for (const key of ['inputNanoUsdPerToken', 'outputNanoUsdPerToken'])
    assert(
      Number.isSafeInteger(a.pricing[key]) &&
        a.pricing[key] > 0 &&
        a.pricing[key] <= 1_000_000,
    );
  assert(
    instant(a.pricing.verifiedAt) <= instant(a.notBefore) &&
      instant(a.notBefore) - instant(a.pricing.verifiedAt) <= 86400000 &&
      instant(a.pricing.validUntil) >= instant(a.expiresAt) &&
      instant(a.pricing.validUntil) - instant(a.pricing.verifiedAt) <= 86400000,
  );
  // Installed pricing evidence must independently match; the signed JSON alone
  // cannot declare a price to be currently verified.
  for (const key of [
    'candidateSha',
    'buildDigest',
    'executorDigest',
    'profileId',
    'profileDigest',
    'environment',
    'serverOrigin',
  ])
    assert.equal(a[key], installed[key]);
  assert.deepEqual(a.pricing, installed.pricing);
  assert(
    id(signed.keyId) &&
      typeof signed.signature === 'string' &&
      /^[A-Za-z0-9_-]{86}$/.test(signed.signature),
  );
  const key = trust?.[signed.keyId];
  exact(key, ['principalId', 'purpose', 'publicKey']);
  assert.equal(key.purpose, 'owner');
  assert.equal(key.principalId, a.operatorId);
  assert(
    typeof key.publicKey === 'string' && !key.publicKey.includes('PRIVATE KEY'),
  );
  const pub = createPublicKey(key.publicKey);
  assert.equal(pub.asymmetricKeyType, 'ed25519');
  assert(
    verify(
      null,
      Buffer.from(canonicalExecution(a)),
      pub,
      Buffer.from(signed.signature, 'base64url'),
    ),
  );
  return Object.freeze({
    payload: Object.freeze({ ...a, pricing: Object.freeze(a.pricing) }),
    digest: executionHash(signed),
  });
}

// All arguments come from the private process bootstrap, never HTTP/JSON fields.
// readAuthorization/readPricing/operatorToken reread immutable operator files.
export function createNativeExecutionVerifier({
  app,
  backend,
  readAuthorization,
  readPricing,
  operatorToken,
}) {
  const require = createRequire(path.join(backend, 'package.json'));
  const load = (name) => require(path.join(backend, 'dist/src', name));
  const config = app.get(require('@nestjs/config').ConfigService);
  const policy = app.get(
    load('entitlements/widget-release-policy.service.js').WidgetReleasePolicy,
  );
  const release = app.get(
    load('entitlements/widget-release.service.js').WidgetReleaseService,
  );
  const p = app.get(load('prisma/prisma.service.js').PrismaService);
  const jwt = app.get(require('@nestjs/jwt').JwtService);
  const strategy = app.get(load('auth/jwt.strategy.js').JwtStrategy);
  const context = app.get(
    load('tenancy/tenant-context.service.js').TenantContextService,
  );
  const { entitlementVersion } = load('entitlements/widget-release.service.js');
  const { fixedProfile } = load(
    'entitlements/widget-release-profile.contract.js',
  );
  let pinned,
    closed = false;
  const check = async (requestActor = false) => {
    try {
      assert(!closed);
      // Capture the authenticated request context before awaits, never headers.
      const actor = requestActor ? { ...context.get() } : null;
      const environment = policy.environment();
      assert.equal(
        config.get('MAYA_RELEASE'),
        config.get('WIDGET_RELEASE_CANDIDATE_SHA'),
      );
      const namespace =
        environment === 'production'
          ? 'WIDGET_RELEASE_PRODUCTION_TRUST_JSON'
          : 'WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON';
      const proof = verifyExecutionAttachment(
        readAuthorization(),
        JSON.parse(config.get(namespace) ?? '{}'),
        {
          candidateSha: config.get('WIDGET_RELEASE_CANDIDATE_SHA'),
          buildDigest: policy.buildDigest(true),
          executorDigest: installedExecutorDigest(
            path.join(backend, 'scripts'),
          ),
          profileId: NATIVE_PROFILE,
          profileDigest: fixedProfile(NATIVE_PROFILE).digest,
          environment,
          serverOrigin: config.get('MAYA_NATIVE_SERVER_ORIGIN'),
          pricing: readPricing(),
        },
      );
      const a = proof.payload;
      if (pinned) assert.equal(proof.digest, pinned);
      else pinned = proof.digest;
      const token = operatorToken();
      const payload = await jwt.verifyAsync(token, {
        secret: config.get('JWT_SECRET'),
        algorithms: ['HS256'],
      });
      const operator = await strategy.validate(payload);
      assert.equal(operator.userId, a.operatorId);
      assert.equal(operator.sessionId, a.platformSessionId);
      assert.equal(operator.tenantId, null);
      assert.equal(operator.membershipId, null);
      assert.equal(operator.role, 'platform_owner');
      // Canonical AR-1 rechecks the real global user/session and database clock.
      const status = await release.status(operator, a.tenantId);
      assert(
        status.enabled &&
          status.version === a.entitlementVersion &&
          status.scope === a.profileId &&
          status.independentHumanReview === false,
      );
      await p.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'widget-release:tenant:' + a.tenantId}, 0))::text`;
        const [time] =
          await tx.$queryRaw`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`;
        assert(
          time.now.getTime() >= instant(a.notBefore) &&
            time.now.getTime() < instant(a.expiresAt),
        );
        const row = await tx.tenantEntitlement.findUnique({
          where: {
            tenantId_featureKey: {
              tenantId: a.tenantId,
              featureKey: 'widgets.runtime',
            },
          },
        });
        assert(
          row &&
            entitlementVersion(row) === a.entitlementVersion &&
            row.enabled &&
            row.expiresAt > time.now,
        );
        const view = policy.view(a.tenantId, row, time.now);
        assert(
          view &&
            view.scope === a.profileId &&
            view.profileDigest === a.profileDigest &&
            view.certificateDigest === a.certificateDigest &&
            view.independentHumanReview === false,
        );
        const state = row.configJson,
          command = state.command,
          grant = command.authorization.payload;
        assert.equal(
          executionHash(command.authorization),
          a.grantAuthorizationDigest,
        );
        assert.equal(executionHash(command.certificate), a.certificateDigest);
        for (const key of [
          'candidateSha',
          'buildDigest',
          'evidenceDigest',
          'profileId',
          'profileDigest',
          'environment',
        ])
          assert.equal(grant[key], a[key]);
        assert.equal(command.certificate.evidenceDigest, a.evidenceDigest);
        const audit = await tx.auditLog.findUnique({
          where: {
            id: 'widget-release:' + executionHash(grant.authorizationId),
          },
        });
        assert(
          audit &&
            audit.scope === 'platform' &&
            audit.action === 'widget.release' &&
            audit.entityId === a.tenantId &&
            audit.userId === grant.operatorId,
        );
        assert.equal(
          audit.metadataJson.authorizationHash,
          a.grantAuthorizationDigest,
        );
        assert.equal(audit.metadataJson.receipt.version, a.entitlementVersion);
        for (const [key, value] of Object.entries({
          contract: 'maya.widget-release-receipt/1',
          operation: 'grant',
          tenantId: a.tenantId,
          candidateSha: a.candidateSha,
          certificateDigest: a.certificateDigest,
          authorizationId: grant.authorizationId,
          actorId: grant.operatorId,
          independentHumanReview: false,
        }))
          assert.equal(audit.metadataJson.receipt[key], value);
        const tenant = await tx.tenant.findUnique({
          where: { id: a.tenantId },
        });
        assert(tenant && ['trial', 'active'].includes(tenant.status));
        const crm = await tx.crmIntegration.findUnique({
          where: { tenantId: a.tenantId },
        });
        assert(
          crm?.provider === 'yclients' &&
            crm.status === 'active' &&
            String(crm.settingsJson?.companyId) === a.companyId,
        );
        // A queued network dispatch may run outside AsyncLocalStorage. It still
        // rereads the already-bound target User and membership; this alone never
        // replaces the authenticated context required at runtime.fetch ingress.
        const targetUser = await tx.user.findUnique({
          where: { id: a.userId },
        });
        const targetMembership = await tx.membership.findFirst({
          where: { userId: a.userId, tenantId: a.tenantId, status: 'active' },
        });
        assert(targetUser?.status === 'active' && targetMembership);
        if (actor) {
          assert(
            actor.source === 'membership' &&
              actor.tenantId === a.tenantId &&
              actor.userId === a.userId &&
              actor.membershipId,
          );
          const user = await tx.user.findUnique({ where: { id: a.userId } });
          const membership = await tx.membership.findUnique({
            where: { id: actor.membershipId },
          });
          assert(
            user?.status === 'active' &&
              membership?.status === 'active' &&
              membership.userId === a.userId &&
              membership.tenantId === a.tenantId &&
              membership.role === actor.role,
          );
        }
      });
      assert(!closed && Date.now() < instant(a.expiresAt));
      assert.equal(policy.buildDigest(true), a.buildDigest);
      assert.equal(
        installedExecutorDigest(path.join(backend, 'scripts')),
        a.executorDigest,
      );
      assert.equal(executionHash(readAuthorization()), proof.digest);
      return proof;
    } catch {
      closed = true;
      throw new Error('phone_native_execution_refused');
    }
  };
  return {
    check,
    close() {
      closed = true;
    },
  };
}
