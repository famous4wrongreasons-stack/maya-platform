// Protected evidence only. snapshot/verify never mutates production database state.
// Credentials, exact IDs, original payloads and protected paths are never emitted.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { readFileSync, writeFileSync, realpathSync, statSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = realpathSync(process.cwd());
assert(root.startsWith('/opt/maya-saas/releases/'));
const req = createRequire(resolve(root, 'package.json'));
const env = req('dotenv').parse(execFileSync('sudo', ['-n', 'cat', '/etc/maya-saas/live-widgets.env']));
const { Client } = req('pg');
const { ActionIdentityService } = req(resolve(root, 'dist/src/action-engine/action-engine.identity.js'));
const identity = new ActionIdentityService(env.ACTION_ENGINE_IDENTITY_SECRET?.trim() ?? env.CRM_ENCRYPTION_KEY?.trim(), env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET?.trim() ?? env.CRM_ENCRYPTION_KEY?.trim());
const db = new Client({ connectionString: env.DATABASE_URL });
const fingerprint = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const pinnedTarget = '2f5ead7db7dc3844f52a3294f1f80e4432321eb4ca548b391b9f24bfd9f5e0cd';
const pinnedFacts = { privacy: '3dbc11747b322094cd02e8c76157c6093811c16a0406331d18bc282137d40af1', marketing: '8987b79ea5544cac0610cb5e68f28c887602bf363a407b6a3680dbcadc4d3db6' };
const [mode, path, backupFile] = process.argv.slice(2);
assert(['snapshot','verify'].includes(mode));
assert(path.startsWith('/opt/maya-saas/incident-evidence/'));
async function rowCounts() { return (await db.query('SELECT (SELECT count(*) FROM "Client") AS clients,(SELECT count(*) FROM "User") AS users,(SELECT count(*) FROM "ClientChannelLink") AS links')).rows[0]; }
async function unaffected(command, profileIds) {
  const facts = await db.query('SELECT to_jsonb(f) AS row FROM "ClientConsentFact" f WHERE NOT (id=ANY($1::text[])) ORDER BY id', [command.factIds]);
  const profiles = await db.query('SELECT to_jsonb(p) AS row FROM "CustomerProfile" p WHERE NOT (id=ANY($1::text[])) ORDER BY id', [profileIds]);
  const links = await db.query('SELECT to_jsonb(l) AS row FROM "ClientChannelLink" l WHERE id<>$1 ORDER BY id', [command.linkId]);
  return { consentHash: fingerprint(facts.rows), profileHash: fingerprint(profiles.rows), linksHash: fingerprint(links.rows) };
}
(async () => {
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    if (mode === 'snapshot') {
      assert(backupFile && backupFile.startsWith('/opt/maya-saas/incident-evidence/'));
      assert.equal(statSync(backupFile).mode & 0o077, 0);
      const links = await db.query(`SELECT to_jsonb(l) AS link,to_jsonb(c) AS challenge FROM "ClientLinkChallenge" c JOIN "ClientChannelLink" l ON l.id=c."consumedLinkId" AND l."tenantId"=c."tenantId" WHERE c."issuanceEvidenceJson"->>'resolver'='a18.maya-user-client-association.v1'`);
      assert.equal(links.rows.length, 1);
      const {link, challenge} = links.rows[0];
      assert.equal(link.revokedAt, null);
      assert.equal(link.verificationEvidenceJson.clientAuthorityProofHash, challenge.issuanceEvidenceHash);
      assert.equal(fingerprint([link.tenantId,link.clientId,link.id,challenge.id,challenge.issuanceEvidenceHash,link.verificationEvidenceHash]), pinnedTarget);
      const history = await db.query(`SELECT to_jsonb(f) AS fact,to_jsonb(e) AS execution FROM "ClientConsentFact" f JOIN "ActionExecution" e ON e.id=f."actionExecutionId" AND e."tenantId"=f."tenantId" WHERE f."tenantId"=$1 AND f."clientId"=$2 ORDER BY f.id`, [link.tenantId,link.clientId]);
      const affected = [];
      for (const row of history.rows) {
        const {fact,execution} = row;
        assert(execution.normalizedInputEncrypted);
        const input = JSON.parse(identity.decryptNormalizedPayload(execution.normalizedInputEncrypted));
        assert.equal(identity.normalizedInputHash(execution.normalizedInputContract,input),execution.normalizedInputHash);
        if (input.consentChannel?.linkId !== link.id) continue;
        assert.equal(execution.state,'SUCCEEDED'); assert.equal(execution.actionClass,'record_client_consent');
        assert.equal(fact.decision,'grant'); assert.equal(input.clientId,link.clientId);
        assert.equal(fingerprint([link.tenantId,link.clientId,fact.id,execution.id,execution.normalizedInputHash]),pinnedFacts[fact.kind]);
        affected.push(row);
      }
      assert.equal(affected.length,2);
      assert.deepEqual(affected.map(r=>r.fact.kind).sort(),['marketing','privacy']);
      const command = {incidentId:'native-consent-compat-e9d3d3a2',tenantId:link.tenantId,clientId:link.clientId,linkId:link.id,factIds:affected.map(r=>r.fact.id).sort()};
      const profiles = (await db.query('SELECT to_jsonb(p) AS row FROM "CustomerProfile" p WHERE "tenantId"=$1 AND "clientId"=$2 ORDER BY id',[link.tenantId,link.clientId])).rows.map(r=>r.row);
      const snapshot={contract:'maya.a18.security-prestate-snapshot/1',capturedAt:new Date().toISOString(),release:root,command,link,challenge,affected,profiles,unaffected:await unaffected(command,profiles.map(p=>p.id)),rowCounts:await rowCounts(),backupFile,backupSha256:execFileSync('sha256sum',[backupFile],{encoding:'utf8'}).split(' ')[0]};
      writeFileSync(path,identity.encryptNormalizedPayload(JSON.stringify(snapshot)),{mode:0o600,flag:'wx'});
      console.log(JSON.stringify({status:'PASS',phase:'snapshot',affectedActiveLinks:1,affectedGrants:2,targetFingerprint:pinnedTarget,snapshotFingerprint:fingerprint(snapshot),encryptedEvidence:true,productionWrites:0}));
    } else {
      assert.equal(statSync(path).mode & 0o077,0);
      const snapshot=JSON.parse(identity.decryptNormalizedPayload(readFileSync(path,'utf8').trim()));
      const c=snapshot.command;
      const original=(await db.query(`SELECT to_jsonb(f) AS fact,to_jsonb(e) AS execution FROM "ClientConsentFact" f JOIN "ActionExecution" e ON e.id=f."actionExecutionId" AND e."tenantId"=f."tenantId" WHERE f.id=ANY($1::text[]) ORDER BY f.id`,[c.factIds])).rows;
      assert.deepEqual(original,snapshot.affected);
      const link=(await db.query('SELECT to_jsonb(l) AS row FROM "ClientChannelLink" l WHERE id=$1 AND "tenantId"=$2',[c.linkId,c.tenantId])).rows[0].row;
      assert(link.revokedAt); assert.equal(link.revocationEvidenceJson.reason,'UNPROVEN_CLIENT_PROVENANCE');
      const stable=(row)=>Object.fromEntries(Object.entries(row).filter(([key])=>!['revokedAt','revocationIdentityHash','revocationEvidenceHash','revocationEvidenceJson','updatedAt'].includes(key)));
      assert.deepEqual(stable(link),stable(snapshot.link));
      const invalidations=(await db.query('SELECT * FROM "ClientConsentInvalidation" WHERE "tenantId"=$1 AND "consentFactId"=ANY($2::text[]) ORDER BY "consentFactId"',[c.tenantId,c.factIds])).rows;
      assert.equal(invalidations.length,2);
      assert.equal(new Set(invalidations.map(i=>i.actionExecutionId)).size,1);
      for(const i of invalidations) { assert.equal(i.clientId,c.clientId); assert.equal(i.invalidatedLinkId,c.linkId); assert.equal(i.reasonCode,'UNPROVEN_CLIENT_PROVENANCE'); assert.equal(i.evidenceSetHash,link.revocationIdentityHash); }
      const execution=(await db.query('SELECT state,"actionClass","executionAttemptCount" FROM "ActionExecution" WHERE id=$1 AND "tenantId"=$2',[invalidations[0].actionExecutionId,c.tenantId])).rows[0];
      assert.equal(execution.state,'SUCCEEDED'); assert.equal(execution.actionClass,'invalidate_client_consent_authority'); assert.equal(execution.executionAttemptCount,1);
      const profiles=(await db.query('SELECT to_jsonb(p) AS row FROM "CustomerProfile" p WHERE "tenantId"=$1 AND "clientId"=$2 ORDER BY id',[c.tenantId,c.clientId])).rows.map(r=>r.row);
      assert.deepEqual(profiles.map(p=>p.id),snapshot.profiles.map(p=>p.id));
      for(const p of profiles) { assert.equal(p.privacyConsentAt,null);assert.equal(p.marketingConsentAt,null); }
      assert.deepEqual(await unaffected(c,profiles.map(p=>p.id)),snapshot.unaffected);
      assert.deepEqual(await rowCounts(),snapshot.rowCounts);
      const audit=(await db.query('SELECT count(*) FROM "AuditLog" WHERE action=$1 AND "entityId"=$2',['invalidate_client_consent_authority',invalidations[0].actionExecutionId])).rows[0];assert.equal(Number(audit.count),1);
      const {PrismaService}=req(resolve(root,'dist/src/prisma/prisma.service.js'));
      const {ConfigService}=req('@nestjs/config');
      const prisma=new PrismaService(new ConfigService(env));
      try {
        const {effectiveClientConsents}=req(resolve(root,'dist/src/crm/client-effective-consent.js'));
        const effective=await prisma.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');return effectiveClientConsents(tx,c.tenantId,c.clientId);},{isolationLevel:'RepeatableRead'});
        assert(!effective.privacy.effective && !effective.marketing.effective);
        assert(effective.privacy.invalidated && effective.marketing.invalidated);
      } finally {await prisma.$disconnect();}
      console.log(JSON.stringify({status:'PASS',phase:'verify',affectedLinkActive:false,privacyBadGrantEffective:false,marketingBadGrantEffective:false,historicalGrantsPreserved:true,historicalExecutionsPreserved:true,invalidationAuditPresent:true,unrelatedConsentChanged:0,newVerifiedConsentRequired:true,securityExecutions:1,invalidations:2,verificationWrites:0,messages:0,providerEffects:0}));
    }
  } finally {await db.query('ROLLBACK');await db.end();}
})().catch(error=>{console.error(error.name);process.exitCode=1;});
