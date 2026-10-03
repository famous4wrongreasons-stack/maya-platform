#!/usr/bin/env node
/** Offline operator checks only. No key generation, signing, HTTP, login, DB or writes. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createPublicKey, createHash } = require('node:crypto');
const { parse } = require('dotenv');

const id = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(v);
function checkConfig(env, tenantId, candidateSha) {
  assert.ok(id(tenantId) && /^[0-9a-f]{40}$/.test(candidateSha), 'exact tenant and candidate required');
  assert.equal(env.NODE_ENV, 'production', 'production runtime required');
  assert.equal(env.WIDGET_RELEASE_ENVIRONMENT, 'production', 'separate production environment required');
  assert.equal(env.WIDGET_RELEASE_CANDIDATE_SHA, candidateSha, 'candidate mismatch');
  assert.deepEqual(JSON.parse(env.WIDGET_RELEASE_PRODUCTION_TENANTS_JSON || '[]'), [tenantId], 'one exact production tenant required');
  const trust = JSON.parse(env.WIDGET_RELEASE_PRODUCTION_TRUST_JSON || '{}');
  assert.ok(trust && !Array.isArray(trust) && typeof trust === 'object');
  assert.equal(Object.keys(trust).length, 2, 'narrow initial installation requires exactly owner and security keys');
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
  assert.deepEqual(entries.map((x) => x.purpose).sort(), ['owner', 'security']);
  assert.equal(new Set(entries.map((x) => x.principalId)).size, 2, 'independent reviewer identity required');
  assert.equal(new Set(entries.map((x) => x.fingerprint)).size, 2, 'independent reviewer key required');
  return { status: 'PASS', tenantId, candidateSha, keys: entries, authorityGranted: false, sessionVerified: false };
}

function main(argv) {
  const [mode, configFile, tenantId, candidateSha, commandFile, operatorId] = argv;
  assert.ok((mode === 'check-config' && argv.length === 4) || (mode === 'check-command' && argv.length === 6),
    'usage: check-config ENV TENANT SHA | check-command ENV TENANT SHA SIGNED_COMMAND PLATFORM_OPERATOR_ID');
  const env = parse(fs.readFileSync(configFile));
  const result = checkConfig(env, tenantId, candidateSha);
  if (mode === 'check-command') {
    assert.ok(id(operatorId), 'exact operator required');
    const { ConfigService } = require('@nestjs/config');
    const { WidgetReleasePolicy } = require('../dist/src/entitlements/widget-release-policy.service.js');
    const command = JSON.parse(fs.readFileSync(commandFile, 'utf8'));
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
  try { main(process.argv.slice(2)); }
  catch { console.error('AR1 OPERATOR CHECK REFUSED — no authority, secret values or signature bytes emitted'); process.exitCode = 1; }
}
