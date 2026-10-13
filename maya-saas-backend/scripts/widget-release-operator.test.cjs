const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { checkConfig } = require('./widget-release-operator.cjs');
// Ephemeral test public keys only. No production identities or persistent key files.
const publicKey = () => generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' });
const trust = { owner: { principalId: 'test-owner', purpose: 'owner', publicKey: publicKey() },
  security: { principalId: 'test-reviewer', purpose: 'security', publicKey: publicKey() } };
const valid = () => ({ NODE_ENV: 'production', WIDGET_RELEASE_ENVIRONMENT: 'production',
  WIDGET_RELEASE_CANDIDATE_SHA: 'a'.repeat(40), WIDGET_RELEASE_PRODUCTION_TENANTS_JSON: '["test-tenant"]',
  WIDGET_RELEASE_PRODUCTION_TRUST_JSON: JSON.stringify(trust) });
const check = (e) => checkConfig(e, 'test-tenant', 'a'.repeat(40));
test('operator preflight confirms narrow public provisioning and explicitly grants no authority/session', () => {
  const r = check(valid()); assert.equal(r.status, 'PASS'); assert.equal(r.authorityGranted, false); assert.equal(r.sessionVerified, false);
  assert.equal(r.keys.length, 2); assert.ok(!JSON.stringify(r).includes('PUBLIC KEY'));
});
for (const field of Object.keys(valid())) test('missing '+field+' refuses', () => {
  const e=valid(); delete e[field]; assert.throws(()=>check(e));
});
for (const [name, edit] of [
  ['staging', e=>e.WIDGET_RELEASE_ENVIRONMENT='staging'],
  ['wrong build', e=>e.WIDGET_RELEASE_CANDIDATE_SHA='b'.repeat(40)],
  ['wildcard tenant', e=>e.WIDGET_RELEASE_PRODUCTION_TENANTS_JSON='["*"]'],
  ['another tenant', e=>e.WIDGET_RELEASE_PRODUCTION_TENANTS_JSON='["other"]'],
  ['extra tenant', e=>e.WIDGET_RELEASE_PRODUCTION_TENANTS_JSON='["test-tenant","other"]'],
  ['duplicate tenant', e=>e.WIDGET_RELEASE_PRODUCTION_TENANTS_JSON='["test-tenant","test-tenant"]'],
  ['staging trust fallback', e=>{e.WIDGET_RELEASE_TRUST_JSON=e.WIDGET_RELEASE_PRODUCTION_TRUST_JSON;delete e.WIDGET_RELEASE_PRODUCTION_TRUST_JSON;}],
]) test(name+' refuses',()=>{const e=valid();edit(e);assert.throws(()=>check(e));});
for (const [name, edit] of [
  ['same identity', t=>t.security.principalId=t.owner.principalId],
  ['same key', t=>t.security.publicKey=t.owner.publicKey],
  ['no reviewer', t=>delete t.security],
  ['extra trust key', t=>t.extra=t.owner],
  ['caller key metadata', t=>t.owner.authorized=true],
  ['private key material', t=>t.owner.publicKey='-----BEGIN PRIVATE KEY-----'],
  ['invalid public key', t=>t.owner.publicKey='invalid'],
]) test(name+' refuses',()=>{const e=valid(),t=structuredClone(trust);edit(t);e.WIDGET_RELEASE_PRODUCTION_TRUST_JSON=JSON.stringify(t);assert.throws(()=>check(e));});

test('single-operator preflight accepts one real owner key and explicitly records absent independent review',()=>{
 const e=valid();e.WIDGET_RELEASE_PRODUCTION_TRUST_JSON=JSON.stringify({owner:trust.owner});
 const r=checkConfig(e,'test-tenant','a'.repeat(40),'single-operator');
 assert.equal(r.independentHumanReview,false);assert.equal(r.keys.length,1);assert.equal(r.authorityGranted,false);assert.equal(r.sessionVerified,false);
 for(const t of [{},trust,{security:trust.security}]) {e.WIDGET_RELEASE_PRODUCTION_TRUST_JSON=JSON.stringify(t);assert.throws(()=>checkConfig(e,'test-tenant','a'.repeat(40),'single-operator'));}
});

const stagingConfig = () => ({ NODE_ENV:'development', WIDGET_RELEASE_ENVIRONMENT:'staging',
 DATABASE_URL:'postgresql://test@127.0.0.1:55729/maya_widget_release_staging_synthetic',
 WIDGET_RELEASE_CANDIDATE_SHA:'a'.repeat(40), WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TENANTS_JSON:'["test-tenant"]',
 WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON:JSON.stringify({owner:trust.owner}) });
const stagingCheck = e => checkConfig(e,'test-tenant','a'.repeat(40),'single-operator','local-staging');
test('local staging preflight is separate, public-only and grants no authority',()=>{
 const r=stagingCheck(stagingConfig());assert.equal(r.execution,'local-staging');assert.equal(r.independentHumanReview,false);assert.equal(r.authorityGranted,false);assert.equal(r.sessionVerified,false);
 assert.throws(()=>checkConfig(stagingConfig(),'test-tenant','a'.repeat(40),'single-operator'));
});
for (const [name,edit] of [
 ['production runtime',e=>e.NODE_ENV='production'],
 ['production execution',e=>e.WIDGET_RELEASE_ENVIRONMENT='production'],
 ['owner database',e=>e.DATABASE_URL='postgresql://test@127.0.0.1:55729/maya_local_onboarding_x'],
 ['remote database',e=>e.DATABASE_URL=e.DATABASE_URL.replace('127.0.0.1','remote.example')],
 ['shared port',e=>e.DATABASE_URL=e.DATABASE_URL.replace('55729','5432')],
 ['wildcard',e=>e.WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TENANTS_JSON='["*"]'],
 ['production trust fallback',e=>{e.WIDGET_RELEASE_PRODUCTION_TRUST_JSON=e.WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON;delete e.WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON;}],
 ['legacy trust fallback',e=>{e.WIDGET_RELEASE_TRUST_JSON=e.WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON;delete e.WIDGET_RELEASE_STAGING_SINGLE_OPERATOR_TRUST_JSON;}],
]) test('local staging operator refuses '+name,()=>{const e=stagingConfig();edit(e);assert.throws(()=>stagingCheck(e));});
