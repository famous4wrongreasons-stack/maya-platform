-- Owner-approved JSON V2 only. No new columns/models, backfill, data rewrite or activation.
-- The original V1 evidence branch and lifecycle immutability remain intact.
ALTER TABLE "ClientLinkChallenge" DROP CONSTRAINT "ClientLinkChallenge_identity_check";
ALTER TABLE "ClientLinkChallenge" ADD CONSTRAINT "ClientLinkChallenge_identity_check" CHECK (
  length(btrim("id")) > 0 AND length(btrim("tenantId")) > 0 AND length(btrim("clientId")) > 0
  AND "tokenHash" ~ '^[0-9a-f]{64}$' AND "issuanceEvidenceHash" ~ '^[0-9a-f]{64}$'
  AND (("policyVersion" = 1 AND "tokenHashVersion" = 1) OR ("policyVersion" = 2 AND "tokenHashVersion" = 2))
  AND "expiresAt" = "issuedAt" + INTERVAL '600 seconds'
);
ALTER TABLE "ClientLinkChallenge" DROP CONSTRAINT "ClientLinkChallenge_evidence_check";
ALTER TABLE "ClientLinkChallenge" ADD CONSTRAINT "ClientLinkChallenge_evidence_check" CHECK ((
  ("policyVersion" = 1 AND (
    jsonb_typeof("issuanceEvidenceJson") = 'object'
    AND octet_length("issuanceEvidenceJson"::TEXT) <= 8192
    AND "issuanceEvidenceJson" ?& ARRAY['contract', 'resolver', 'resolutionEvidenceRef',
      'resolutionEvidenceHash', 'issuerAuthorityHash', 'tenantId', 'clientId', 'issuedAt', 'policyVersion']
    AND "issuanceEvidenceJson" - ARRAY['contract', 'resolver', 'resolutionEvidenceRef',
      'resolutionEvidenceHash', 'issuerAuthorityHash', 'tenantId', 'clientId', 'issuedAt', 'policyVersion'] = '{}'::jsonb
    AND "issuanceEvidenceJson"->>'contract' = 'a18.client-link-challenge.issue.v1'
    AND "issuanceEvidenceJson"->>'resolver' ~ '^[a-zA-Z0-9._:-]{1,160}$'
    AND "issuanceEvidenceJson"->>'resolutionEvidenceRef' ~ '^[a-zA-Z0-9._:-]{1,240}$'
    AND "issuanceEvidenceJson"->>'resolutionEvidenceHash' ~ '^[0-9a-f]{64}$'
    AND "issuanceEvidenceJson"->>'issuerAuthorityHash' ~ '^[0-9a-f]{64}$'
    AND "issuanceEvidenceJson"->>'tenantId' = "tenantId"
    AND "issuanceEvidenceJson"->>'clientId' = "clientId"
    AND "issuanceEvidenceJson"->'policyVersion' = '1'::jsonb
    AND "issuanceEvidenceJson"->>'issuedAt' = to_char("issuedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )) OR ("policyVersion" = 2 AND (
    jsonb_typeof("issuanceEvidenceJson") = 'object'
    AND octet_length("issuanceEvidenceJson"::TEXT) <= 8192
    AND "issuanceEvidenceJson" ?& ARRAY['contract', 'resolver', 'resolutionEvidenceRef',
      'resolutionEvidenceHash', 'issuerAuthorityHash', 'tenantId', 'clientId', 'issuedAt', 'policyVersion',
      'mayaUserId', 'mayaSubjectHash', 'verificationChannel', 'predecessorLinkId']
    AND "issuanceEvidenceJson" - ARRAY['contract', 'resolver', 'resolutionEvidenceRef',
      'resolutionEvidenceHash', 'issuerAuthorityHash', 'tenantId', 'clientId', 'issuedAt', 'policyVersion',
      'mayaUserId', 'mayaSubjectHash', 'verificationChannel', 'predecessorLinkId'] = '{}'::jsonb
    AND "issuanceEvidenceJson"->>'contract' = 'a18.client-link-challenge.issue.v2'
    AND "issuanceEvidenceJson"->>'resolver' ~ '^[a-zA-Z0-9._:-]{1,160}$'
    AND "issuanceEvidenceJson"->>'resolutionEvidenceRef' ~ '^[a-zA-Z0-9._:-]{1,240}$'
    AND "issuanceEvidenceJson"->>'resolutionEvidenceHash' ~ '^[0-9a-f]{64}$'
    AND "issuanceEvidenceJson"->>'issuerAuthorityHash' ~ '^[0-9a-f]{64}$'
    AND "issuanceEvidenceJson"->>'tenantId' = "tenantId"
    AND "issuanceEvidenceJson"->>'clientId' = "clientId"
    AND "issuanceEvidenceJson"->'policyVersion' = '2'::jsonb
    AND "issuanceEvidenceJson"->>'issuedAt' = to_char("issuedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    AND jsonb_typeof("issuanceEvidenceJson"->'mayaUserId') = 'string'
    AND length(btrim("issuanceEvidenceJson"->>'mayaUserId')) BETWEEN 1 AND 240
    AND jsonb_typeof("issuanceEvidenceJson"->'mayaSubjectHash') = 'string'
    AND "issuanceEvidenceJson"->>'mayaSubjectHash' ~ '^[0-9a-f]{64}$'
    AND jsonb_typeof("issuanceEvidenceJson"->'predecessorLinkId') = 'string'
    AND length(btrim("issuanceEvidenceJson"->>'predecessorLinkId')) BETWEEN 1 AND 240
    AND "issuanceEvidenceJson"->>'resolver' = 'sb1.canonical-client-sms.v2'
    AND "issuanceEvidenceJson"->>'resolutionEvidenceRef' = 'client-channel-link:' || ("issuanceEvidenceJson"->>'predecessorLinkId')
    AND jsonb_typeof("issuanceEvidenceJson"->'verificationChannel') = 'object'
    AND ("issuanceEvidenceJson"->'verificationChannel') ?& ARRAY['kind','crmLinkId','addressHash']
    AND ("issuanceEvidenceJson"->'verificationChannel') - ARRAY['kind','crmLinkId','addressHash'] = '{}'::jsonb
    AND "issuanceEvidenceJson"->'verificationChannel'->>'kind' = 'sms'
    AND jsonb_typeof("issuanceEvidenceJson"->'verificationChannel'->'crmLinkId') = 'string'
    AND length(btrim("issuanceEvidenceJson"->'verificationChannel'->>'crmLinkId')) BETWEEN 1 AND 240
    AND jsonb_typeof("issuanceEvidenceJson"->'verificationChannel'->'addressHash') = 'string'
    AND "issuanceEvidenceJson"->'verificationChannel'->>'addressHash' ~ '^[0-9a-f]{64}$'
  ))
) IS TRUE);

-- Additional V2 guard. The existing lifecycle trigger still forbids any issuance mutation,
-- including all four new members; old V1 rows are never touched by this guard.
CREATE FUNCTION "guard_client_link_challenge_v2"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."policyVersion" <> 2 THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(
    'a18.client-channel.v1', NEW."tenantId", 'maya_user', NEW."issuanceEvidenceJson"->>'mayaSubjectHash')::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM "Client" c JOIN "User" u ON u."id" = c."userId"
    JOIN "CrmClientLink" r ON r."clientId" = c."id" AND r."tenantId" = c."tenantId"
    WHERE c."id" = NEW."clientId" AND c."tenantId" = NEW."tenantId"
      AND c."userId" = NEW."issuanceEvidenceJson"->>'mayaUserId' AND c."mergedIntoClientId" IS NULL
      AND u."status" = 'active' AND r."unlinkedAt" IS NULL
      AND r."id" = NEW."issuanceEvidenceJson"->'verificationChannel'->>'crmLinkId'
  ) THEN RAISE EXCEPTION 'V2 requires current exact User/Client/CRM lineage' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "ClientChannelLink" p WHERE p."id" = NEW."issuanceEvidenceJson"->>'predecessorLinkId'
      AND p."tenantId" = NEW."tenantId" AND p."clientId" = NEW."clientId"
      AND p."provider" = 'maya_user' AND p."providerSubjectHash" = NEW."issuanceEvidenceJson"->>'mayaSubjectHash'
      AND p."subjectHashVersion" = 1 AND p."verificationVersion" = 1 AND p."revokedAt" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "ClientChannelLink" s WHERE s."supersedesLinkId" = p."id"
        AND (TG_OP = 'INSERT' OR s."id" IS DISTINCT FROM NEW."consumedLinkId"))
  ) THEN RAISE EXCEPTION 'V2 requires exact latest revoked predecessor' USING ERRCODE = '23514'; END IF;
  IF NEW."consumedAt" IS NOT NULL AND (NEW."consumedProvider" IS DISTINCT FROM 'maya_user'
    OR NEW."consumedSubjectHash" IS DISTINCT FROM (NEW."issuanceEvidenceJson"->>'mayaSubjectHash'))
  THEN RAISE EXCEPTION 'V2 consume subject mismatch' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ClientLinkChallenge_v2_guard" BEFORE INSERT OR UPDATE ON "ClientLinkChallenge"
FOR EACH ROW EXECUTE FUNCTION "guard_client_link_challenge_v2"();

CREATE OR REPLACE FUNCTION "check_client_link_challenge_outcome_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."consumedAt" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ClientChannelLink" l WHERE l."id" = NEW."consumedLinkId"
      AND l."tenantId" = NEW."tenantId" AND l."clientId" = NEW."clientId"
      AND l."provider" = NEW."consumedProvider" AND l."providerSubjectHash" = NEW."consumedSubjectHash"
      AND l."subjectHashVersion" = 1 AND l."verificationVersion" = 1
      AND l."verificationMethod" = 'explicit_verified_challenge'
      AND l."verificationIdentityHash" = NEW."tokenHash"
      AND l."verificationEvidenceJson"->>'clientAuthorityProofHash' = NEW."issuanceEvidenceHash"
      AND ((NEW."policyVersion" = 1 AND l."supersedesLinkId" IS NULL)
        OR (NEW."policyVersion" = 2
          AND l."supersedesLinkId" = NEW."issuanceEvidenceJson"->>'predecessorLinkId'
          AND l."provider" = 'maya_user'
          AND l."providerSubjectHash" = NEW."issuanceEvidenceJson"->>'mayaSubjectHash'
          AND l."verificationEvidenceJson"->>'verifier' = 'a18.client-link-challenge.sms.v2'
          AND EXISTS (SELECT 1 FROM "ClientChannelLink" p WHERE p."id" = l."supersedesLinkId"
            AND p."tenantId" = l."tenantId" AND p."clientId" = l."clientId" AND p."revokedAt" IS NOT NULL)))
      AND l."verifiedAt" >= NEW."issuedAt" AND l."verifiedAt" <= NEW."consumedAt"
      AND l."createdAt" >= NEW."issuedAt" AND l."createdAt" <= NEW."consumedAt"
  ) THEN
    RAISE EXCEPTION 'ClientLinkChallenge consumption requires exact correlated verified link outcome' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
