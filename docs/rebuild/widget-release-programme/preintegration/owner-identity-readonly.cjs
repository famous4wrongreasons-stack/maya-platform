const fs = require('node:fs');
const {Client}=require('pg');
const env=require('dotenv').parse(fs.readFileSync('/etc/maya-saas/live-widgets.env'));
const {EncryptionService}=require('./dist/src/encryption/encryption.service.js');
const {clientChannelSubjectHash}=require('./dist/src/crm/client-channel-subject.js');
(async()=>{
 const db=new Client({connectionString:env.DATABASE_URL,options:'-c default_transaction_read_only=on -c statement_timeout=10000',application_name:'widget-release-owner-readonly-proof'});
 try {
  await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const ro=(await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
  if(ro!=='on') throw Error('READ_ONLY_REQUIRED');
  const owners=(await db.query(`SELECT m."tenantId", m."userId" FROM "Membership" m JOIN "User" u ON u.id=m."userId" WHERE m.role='tenant_owner' AND m.status='active' AND u.status='active'`)).rows;
  const report={contract:'maya.owner-identity-readonly/1',observed_at:new Date().toISOString(),transaction_read_only:ro,selection:'unique active TENANT_OWNER membership; refuse ambiguity',active_owner_memberships:owners.length};
  if(owners.length!==1){report.status='AMBIGUOUS_OWNER';console.log(JSON.stringify(report));return;}
  const o=owners[0];const encryption=new EncryptionService({get:k=>env[k]});
  const subject=clientChannelSubjectHash(encryption,'maya_user',o.userId);
  const counts=(await db.query(`SELECT
   (SELECT count(*)::int FROM "AuthIdentity" WHERE "tenantId"=$1 AND "userId"=$2 AND provider='telegram') AS telegram_identities,
   (SELECT count(*)::int FROM "Client" WHERE "tenantId"=$1 AND "userId"=$2 AND "mergedIntoClientId" IS NULL) AS direct_active_clients,
   (SELECT count(*)::int FROM "ClientChannelLink" WHERE "tenantId"=$1 AND provider='maya_user' AND "providerSubjectHash"=$3) AS maya_user_link_history,
   (SELECT count(*)::int FROM "ClientChannelLink" l JOIN "Client" c ON c.id=l."clientId" AND c."tenantId"=l."tenantId" WHERE l."tenantId"=$1 AND l.provider='maya_user' AND l."providerSubjectHash"=$3 AND l."revokedAt" IS NOT NULL AND c."userId"=$2) AS matching_revoked_maya_user_links,
   (SELECT count(*)::int FROM "ClientChannelLink" l JOIN "Client" c ON c.id=l."clientId" AND c."tenantId"=l."tenantId" WHERE l."tenantId"=$1 AND l.provider='maya_user' AND l."providerSubjectHash"=$3 AND l."verificationVersion"=1 AND l."subjectHashVersion"=1 AND c."userId"=$2) AS version_one_same_client_link_history,
   (SELECT count(*)::int FROM "ClientChannelLink" l JOIN "Client" c ON c.id=l."clientId" AND c."tenantId"=l."tenantId" WHERE l."tenantId"=$1 AND l.provider='maya_user' AND l."providerSubjectHash"=$3 AND l."revokedAt" IS NULL AND l."verificationVersion"=1 AND l."subjectHashVersion"=1 AND c."mergedIntoClientId" IS NULL) AS verified_active_maya_user_links,
   (SELECT count(*)::int FROM "CrmClientLink" r JOIN "Client" c ON c.id=r."clientId" AND c."tenantId"=r."tenantId" WHERE c."tenantId"=$1 AND c."userId"=$2 AND c."mergedIntoClientId" IS NULL AND r."unlinkedAt" IS NULL) AS direct_client_active_crm_links,
   (SELECT count(*)::int FROM "ClientChannelLink" l JOIN "Client" c ON c.id=l."clientId" AND c."tenantId"=l."tenantId" WHERE c."tenantId"=$1 AND c."userId"=$2 AND c."mergedIntoClientId" IS NULL AND l."revokedAt" IS NULL) AS direct_client_active_channel_links`,[o.tenantId,o.userId,subject])).rows[0];
  console.log(JSON.stringify({...report,status:'READ_ONLY_PROOF',user_exists:true,...counts,same_human_binding_exists:counts.direct_active_clients===1&&counts.version_one_same_client_link_history===1,active_verified_booking_binding:counts.verified_active_maya_user_links===1,pii_returned:false}));
 } finally {await db.query('ROLLBACK').catch(()=>{});await db.end();}
})().catch(e=>{console.log(JSON.stringify({contract:'maya.owner-identity-readonly/1',status:'ERROR',code:e.code??'PROOF_FAILED'}));process.exitCode=1;});
