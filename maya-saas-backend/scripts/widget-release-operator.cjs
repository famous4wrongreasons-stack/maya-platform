#!/usr/bin/env node
/** Offline operator checks only. No key generation, signing, HTTP, login, DB or writes. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createPublicKey, createHash } = require('node:crypto');
const { parse } = require('dotenv');

const id = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v);
function checkConfig(env, tenantId, candidateSha, governance = 'independent-review', execution = 'production') {
  assert.ok(['independent-review', 'single-operator'].includes(governance), 'explicit governance required');
  const single = governance === 'single-operator';
  assert.ok(id(tenantId) && /^[0-9a-f]{40}$/.test(candidateSha), 'exact tenant and candidate required');
  assert.ok(['production', 'local-staging'].includes(execution), 'explicit execution environment required');
  const staging = execution === 'local-staging';
  if (staging) {
    assert.equal(single, true, 'local staging requires explicit single-operator governance');
    assert.ok(['test','development'].includes(env.NODE_ENV), 'local runtime required');
    assert.equal(env.WIDGET_RELEASE_ENVIRONMENT, 'staging', 'separate staging environment required');
    const db = new URL(env.DATABASE_URL);
    assert.ok(['postgres:', 'postgresql:'].includes(db.protocol) && db.hostname === '127.0.0.1' && db.port && db.port !== '5432'
      && /^\/maya_widget_release_staging_[a-z0-9_]+$/.test(db.pathname) && [...db.searchParams.keys()].every(k => k === 'schema'), 'dedicated local staging database required');
  } else {
    assert.equal(env.NODE_ENV, 'production', 'production runtime required');
    assert.equal(env.WIDGET_RELEASE_ENVIRONMENT, 'production', 'separate production environment required');
  }
  assert.equal(env.WIDGET_RELEASE_CANDIDATE_SHA, candidateSha, 'candidate mismatch');
  assert.deepEqual(JSON.parse(env[staging ? 'WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TENANTS_JSON' : 'WIDGET_RELEASE_PRODUCTION_TENANTS_JSON'] || '[]'), [tenantId], 'one exact production tenant required');
  const trust = JSON.parse(env[staging ? 'WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON' : 'WIDGET_RELEASE_PRODUCTION_TRUST_JSON'] || '{}');
  assert.ok(trust && !Array.isArray(trust) && typeof trust === 'object');
  assert.equal(Object.keys(trust).length, single ? 1 : 2, 'exact initial-launch trust set required');
  const entries = Object.entries(trust).map(([keyId, value]) => {
    assert.ok(id(keyId) && value && typeof value === 'object');
    assert.deepEqual(Object.keys(value).sort(), ['principalId', 'publicKey', 'purpose']);
    assert.ok(id(value.principalId) && ['owner', 'security'].includes(value.purpose));
    assert.ok(typeof value.publicKey === 'string' && !/PRIVATE KEY/.test(value.publicKey), 'public keys only');
    const key = createPublicKey(value.publicKey);
    assert.equal(key.asymmetricKeyType, 'ed25519', 'Ed25519 required');
    return { keyId, principalId: value.principalId, purpose: value.purpose,
      fingerprint: createHash('sha256').update(key.export({ format: 'der', type: 'spki' })).digest('hex') };
  });
  assert.deepEqual(entries.map((x) => x.purpose).sort(), single ? ['owner'] : ['owner', 'security']);
  assert.equal(new Set(entries.map((x) => x.principalId)).size, single ? 1 : 2, 'distinct configured identities required');
  assert.equal(new Set(entries.map((x) => x.fingerprint)).size, single ? 1 : 2, 'distinct configured keys required');
  return { status: 'PASS', execution, tenantId, candidateSha, keys: entries, governance,
    ...(single ? { independentHumanReview: false } : {}), authorityGranted: false, sessionVerified: false };
}

async function checkNative(argv) {
  const [, configFile, tenantId, candidateSha, commandFile, operatorId] = argv;
  assert.equal(argv.length, 6);
  const env = parse(fs.readFileSync(configFile));
  const mode =
    env.WIDGET_RELEASE_ENVIRONMENT === 'staging'
      ? 'local-staging'
      : 'production';
  const result = checkConfig(
    env,
    tenantId,
    candidateSha,
    'single-operator',
    mode,
  );
  const { ConfigService } = require('@nestjs/config');
  const {
    WidgetReleasePolicy,
  } = require('../dist/src/entitlements/widget-release-policy.service.js');
  const {
    fixedProfile,
  } = require('../dist/src/entitlements/widget-release-profile.contract.js');
  const { verifyExecutionAttachment, installedExecutorDigest, NATIVE_PROFILE } =
    await import('./phone-native-execution.mjs');
  const policy = new WidgetReleasePolicy(new ConfigService(env));
  const proof = verifyExecutionAttachment(
    JSON.parse(fs.readFileSync(commandFile, 'utf8')),
    JSON.parse(
      env[
        mode === 'production'
          ? 'WIDGET_RELEASE_PRODUCTION_TRUST_JSON'
          : 'WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON'
      ],
    ),
    {
      candidateSha,
      buildDigest: policy.buildDigest(true),
      executorDigest: installedExecutorDigest(__dirname),
      profileId: NATIVE_PROFILE,
      profileDigest: fixedProfile(NATIVE_PROFILE).digest,
      environment: policy.environment(),
      serverOrigin: env.MAYA_NATIVE_SERVER_ORIGIN,
      pricing: JSON.parse(
        fs.readFileSync(env.MAYA_NATIVE_PRICING_FILE, 'utf8'),
      ),
    },
  );
  assert.equal(proof.payload.tenantId, tenantId);
  assert.equal(proof.payload.operatorId, operatorId);
  console.log(
    JSON.stringify({
      ...result,
      contract: proof.payload.contract,
      runId: proof.payload.runId,
      attachmentDigest: proof.digest,
      note: 'Offline signature/bindings only. No session, entitlement, grant or execution authority is created. The ordinary runtime must await current canonical admission.',
    }),
  );
}
function main(argv) {
  if (argv[0] === 'check-native-execution') return checkNative(argv);
  const [mode, configFile, tenantId, candidateSha, commandFile, operatorId] = argv;
  const staging = mode === 'check-staging-config' || mode === 'check-staging-command';
  const configMode = mode === 'check-config' || mode === 'check-staging-config';
  const commandMode = mode === 'check-command' || mode === 'check-staging-command';
  assert.ok((configMode && [4, 5].includes(argv.length)) || (commandMode && argv.length === 6),
    'usage: check-config/check-staging-config ENV TENANT SHA [single-operator] | check-command/check-staging-command ENV TENANT SHA SIGNED_COMMAND PLATFORM_OPERATOR_ID');
  const env = parse(fs.readFileSync(configFile));
  const command = commandMode ? JSON.parse(fs.readFileSync(commandFile, 'utf8')) : null;
  const single = staging || command?.authorization?.payload?.contract === 'maya.widget-release-production-authorization/2';
  if (staging && commandMode) assert.equal(command?.authorization?.payload?.contract, 'maya.widget-release-staging-authorization/1');
  const result = checkConfig(env, tenantId, candidateSha,
    configMode ? (staging ? 'single-operator' : commandFile) : single ? 'single-operator' : 'independent-review', staging ? 'local-staging' : 'production');
  if (commandMode) {
    assert.ok(id(operatorId), 'exact operator required');
    const { ConfigService } = require('@nestjs/config');
    const { WidgetReleasePolicy } = require('../dist/src/entitlements/widget-release-policy.service.js');
    const operation = command?.authorization?.payload?.operation;
    assert.ok(['grant', 'revoke'].includes(operation));
    const policy = new WidgetReleasePolicy(new ConfigService(env));
    const parsed = policy.read(command, tenantId, operation, operatorId, new Date());
    result.operation = operation;
    result.authorizationId = parsed.a.authorizationId;
    result.authorizationHash = parsed.authorizationHash;
    result.note = 'Offline signatures/bindings only; canonical HTTP validate must recheck the real session, tenant, CAS and database clock. Revoke additionally rechecks stored release binding in its writer transaction.';
  }
  console.log(JSON.stringify(result));
}

module.exports = { checkConfig, main };
if (require.main === module) {
  try { const result = main(process.argv.slice(2)); if (result?.catch) result.catch(() => { console.error('AR1 NATIVE CHECK REFUSED — no secret values emitted'); process.exitCode = 1; }); }
  catch { console.error('AR1 OPERATOR CHECK REFUSED — no authority, secret values or signature bytes emitted'); process.exitCode = 1; }
}
