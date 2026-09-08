// Execute from the existing production release with its own dependencies.
// Read-only aggregate audit. No ids, credentials, decrypted input or PII emitted.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { realpathSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = realpathSync(process.cwd());
assert(root.startsWith('/opt/maya-saas/releases/'));
const req = createRequire(resolve(root, 'package.json'));
const { Client } = req('pg');
const env = req('dotenv').parse(execFileSync('sudo', ['-n', 'cat', '/etc/maya-saas/live-widgets.env']));
const { ActionIdentityService } = req(resolve(root, 'dist/src/action-engine/action-engine.identity.js'));
const { assertConsentChannelBinding } = req(resolve(root, 'dist/src/crm/client-consent-authority.js'));
// Match ActionEngineModule.requiredActionSecret, including its existing fallback.
const identity = new ActionIdentityService(
  env.ACTION_ENGINE_IDENTITY_SECRET?.trim() ?? env.CRM_ENCRYPTION_KEY?.trim(),
  env.ACTION_ENGINE_PAYLOAD_ENCRYPTION_SECRET?.trim() ?? env.CRM_ENCRYPTION_KEY?.trim(),
);
const db = new Client({ connectionString: env.DATABASE_URL });
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
(async () => {
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows } = await db.query(`SELECT c.id AS challenge_id,c."issuanceEvidenceHash" AS issuance_hash,
      c."tenantId",c."clientId",c."consumedAt", l.id,l.provider,l."providerSubjectHash",
      l."verificationEvidenceHash",l."verificationEvidenceJson",l."verificationVersion",
      l."subjectHashVersion",l."revokedAt"
      FROM "ClientLinkChallenge" c JOIN "ClientChannelLink" l
      ON l.id=c."consumedLinkId" AND l."tenantId"=c."tenantId"
      WHERE c."issuanceEvidenceJson"->>'resolver'='a18.maya-user-client-association.v1'`);
    const links = [];
    for (const link of rows) {
      assert.equal(link.verificationEvidenceJson.clientAuthorityProofHash, link.issuance_hash);
      const facts = await db.query(`SELECT f.id,f.kind,f.decision,f."sourceType",f."createdAt",
        e.id AS execution_id,e."actionClass",e.state,e."normalizedInputContract",
        e."normalizedInputHash",e."normalizedInputEncrypted"
        FROM "ClientConsentFact" f JOIN "ActionExecution" e
        ON e.id=f."actionExecutionId" AND e."tenantId"=f."tenantId"
        WHERE f."tenantId"=$1 AND f."clientId"=$2 ORDER BY f.kind,f.id`, [link.tenantId, link.clientId]);
      const receipts = [];
      for (const fact of facts.rows) {
        if (!fact.normalizedInputEncrypted) {
          receipts.push({ kind: fact.kind, payloadAvailable: false });
          continue;
        }
        const input = JSON.parse(identity.decryptNormalizedPayload(fact.normalizedInputEncrypted));
        assert.equal(identity.normalizedInputHash(fact.normalizedInputContract, input), fact.normalizedInputHash);
        const usesAffectedLink = input.consentChannel?.linkId === link.id && input.clientId === link.clientId;
        let currentBindingPredicateAccepts = false;
        if (usesAffectedLink) {
          await assertConsentChannelBinding({ clientChannelLink: { findUnique: async () => link } }, link.tenantId, link.clientId, input.consentChannel);
          currentBindingPredicateAccepts = true;
        }
        receipts.push({ kind: fact.kind, decision: fact.decision, sourceType: fact.sourceType,
          actionClass: fact.actionClass, state: fact.state, trustedInputHashValid: true,
          usesAffectedLink, currentBindingPredicateAccepts,
          receiptFingerprint: fingerprint([link.tenantId, link.clientId, fact.id, fact.execution_id, fact.normalizedInputHash]) });
      }
      links.push({ active: link.revokedAt === null, challengeEvidenceMatchesLink: true,
        targetFingerprint: fingerprint([link.tenantId, link.clientId, link.id, link.challenge_id, link.issuance_hash, link.verificationEvidenceHash]),
        consentReceipts: receipts });
    }
    console.log(JSON.stringify({ auditedAt: new Date().toISOString(), release: root.split('/').pop(),
      resolver: 'a18.maya-user-client-association.v1', affectedLinks: links.length,
      links, transaction: 'REPEATABLE READ READ ONLY', productionWrites: 0,
      messages: 0, providerEffects: 0, rawIdsOrPayloadsEmitted: false }, null, 2));
  } finally { await db.query('ROLLBACK'); await db.end(); }
})().catch((error) => { console.error(error.code || error.name); process.exitCode = 1; });
