// Offline CLI integration: ephemeral test-only keys, no database, transport or real identity.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generateKeyPairSync, sign } = require('node:crypto');
const { ConfigService } = require('@nestjs/config');
const { WidgetReleasePolicy } = require('../dist/src/entitlements/widget-release-policy.service');
const { canonical, releaseHash } = require('../dist/src/entitlements/widget-release.contract');
const { WIDGET_RELEASE_CLAUSES } = require('../dist/src/entitlements/widget-release-clauses');
const { PROFILE_CERT, PROFILE_DIGEST, PROFILE_REGISTRY_DIGEST, NO_HANDOFF_PROFILE } = require('../dist/src/entitlements/widget-release-profile.contract');
const { PRODUCTION_RELEASE_AUTH, SINGLE_OPERATOR_RELEASE_AUTH } = require('../dist/src/entitlements/widget-release-production.contract');
const candidate = 'a'.repeat(40), tenant = 'test-tenant', operator = 'test-operator';
const keys = { owner: generateKeyPairSync('ed25519'), security: generateKeyPairSync('ed25519') };
const signed = (purpose, payload) => ({ payload, keyId: purpose, signature: sign(null, Buffer.from(canonical(payload)), keys[purpose].privateKey).toString('base64url') });
const env = { NODE_ENV: 'production', WIDGET_RELEASE_ENVIRONMENT: 'production', WIDGET_RELEASE_CANDIDATE_SHA: candidate,
  WIDGET_RELEASE_PRODUCTION_TENANTS_JSON: JSON.stringify([tenant]), WIDGET_RELEASE_PRODUCTION_TRUST_JSON: JSON.stringify(Object.fromEntries(Object.entries(keys).map(([purpose, key]) => [purpose, { purpose, principalId: 'test-'+purpose, publicKey: key.publicKey.export({ type: 'spki', format: 'pem' }) }])))};
function command(single=false) {
  const now=Date.now(), expiresAt=new Date(now+600000).toISOString();
  const matrix=WIDGET_RELEASE_CLAUSES.map(id=>({id,state:['G6-6','G13-R8'].includes(id)?'STOP':'L',evidenceDigest:releaseHash('synthetic '+id)}));
  const payload={contract:PROFILE_CERT,environment:'production',scope:NO_HANDOFF_PROFILE,certification:'CERTIFIED_FOR_PROFILE',candidateSha:candidate,
    profileDigest:PROFILE_DIGEST,registryDigest:PROFILE_REGISTRY_DIGEST,matrix,globalAuditDigest:releaseHash(matrix),
    issuedAt:new Date(now-1000).toISOString(),expiresAt,buildDigest:new WidgetReleasePolicy(new ConfigService(env)).buildDigest()};
  for(const k of ['carrierDigest','evidenceDigest','integrationDigest','fbe2eDigest','revocationProofDigest','isolationProofDigest','dependencyProofDigest'])payload[k]=releaseHash('synthetic '+k);
  const certificate=single?payload:signed('security',payload);
  const authorization=signed('owner',{contract:single?SINGLE_OPERATOR_RELEASE_AUTH:PRODUCTION_RELEASE_AUTH,...(single?{governance:'single-operator',independentHumanReview:false}:{}),authorizationId:'synthetic-operator-proof',operation:'grant',tenantId:tenant,environment:'production',
    candidateSha:candidate,buildDigest:payload.buildDigest,certificateDigest:releaseHash(certificate),operatorId:operator,approverId:single?operator:'test-owner',reviewerId:single?null:'test-security',rollbackOwnerId:operator,
    expectedVersion:'absent',notBefore:new Date(now-1000).toISOString(),expiresAt,grantExpiresAt:expiresAt,releaseId:'synthetic-only',profileId:NO_HANDOFF_PROFILE,profileDigest:PROFILE_DIGEST,evidenceDigest:payload.evidenceDigest});
  return {certificate,authorization};
}
function check(c, actor=operator) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maya-operator-offline-'));
  try {
    const settings=structuredClone(env); if(c.authorization?.payload?.contract===SINGLE_OPERATOR_RELEASE_AUTH) settings.WIDGET_RELEASE_PRODUCTION_TRUST_JSON=JSON.stringify({owner:{purpose:'owner',principalId:operator,publicKey:keys.owner.publicKey.export({type:'spki',format:'pem'})}});
    fs.writeFileSync(path.join(dir,'public.env'),Object.entries(settings).map(([k,v])=>k+"='"+v+"'").join('\n'),{mode:0o600});
    fs.writeFileSync(path.join(dir,'test-command.json'),JSON.stringify(c),{mode:0o600});
    return spawnSync(process.execPath,[path.join(__dirname,'widget-release-operator.cjs'),'check-command',path.join(dir,'public.env'),tenant,candidate,path.join(dir,'test-command.json'),actor],
      {cwd:path.resolve(__dirname,'..'),env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8'});
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
test('compiled operator CLI validates both signatures, exact compiled bytes and bindings without granting authority',()=>{
  const r=check(command());assert.equal(r.status,0,r.stderr);const p=JSON.parse(r.stdout);assert.equal(p.operation,'grant');assert.equal(p.authorityGranted,false);assert.equal(p.sessionVerified,false);
});
for(const [name,edit] of [
  ['missing execution signature',c=>delete c.authorization],
  ['forged certificate',c=>c.certificate.payload.carrierDigest='b'.repeat(64)],
  ['wrong candidate signed by owner',c=>c.authorization=signed('owner',{...c.authorization.payload,candidateSha:'b'.repeat(40)})],
  ['wrong compiled build signed by owner',c=>c.authorization=signed('owner',{...c.authorization.payload,buildDigest:'b'.repeat(64)})],
  ['expired authorization',c=>c.authorization=signed('owner',{...c.authorization.payload,notBefore:new Date(Date.now()-20000).toISOString(),expiresAt:new Date(Date.now()-10000).toISOString(),grantExpiresAt:new Date(Date.now()-10000).toISOString()})],
])test('compiled operator CLI refuses '+name,()=>{const c=command();edit(c);const r=check(c);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/REFUSED/);});
test('compiled operator CLI refuses substituted platform operator',()=>assert.equal(check(command(),'other-operator').status,1));

test('compiled single-operator CLI validates one execution signature and raw certificate; declares no independent review',()=>{
 const c=command(true),r=check(c);assert.equal(r.status,0,r.stderr);const p=JSON.parse(r.stdout);assert.equal(p.governance,'single-operator');assert.equal(p.independentHumanReview,false);assert.equal(p.keys.length,1);assert.equal(p.authorityGranted,false);assert.equal(p.sessionVerified,false);
 for(const edit of [x=>x.certificate.carrierDigest='b'.repeat(64),x=>x.authorization.signature='a'.repeat(86),x=>x.authorization=signed('owner',{...x.authorization.payload,independentHumanReview:true}),x=>x.authorization=signed('owner',{...x.authorization.payload,reviewerId:operator}),x=>x.certificate=signed('owner',x.certificate)]){const x=command(true);edit(x);assert.equal(check(x).status,1);}
 assert.equal(check(command(true),'other-operator').status,1);
});
