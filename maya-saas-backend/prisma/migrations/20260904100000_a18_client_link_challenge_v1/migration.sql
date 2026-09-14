-- Approved after 84696bc9: exactly one empty model; no historical backfill.
CREATE TABLE "ClientLinkChallenge" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenHashVersion" INTEGER NOT NULL DEFAULT 1,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "issuanceEvidenceJson" JSONB NOT NULL,
  "issuanceEvidenceHash" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "consumedLinkId" TEXT,
  "consumedProvider" TEXT,
  "consumedSubjectHash" TEXT,
  CONSTRAINT "ClientLinkChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientLinkChallenge_identity_check" CHECK (
    length(btrim("id")) > 0 AND length(btrim("tenantId")) > 0 AND length(btrim("clientId")) > 0
    AND "tokenHash" ~ '^[0-9a-f]{64}$' AND "issuanceEvidenceHash" ~ '^[0-9a-f]{64}$'
    AND "tokenHashVersion" = 1 AND "policyVersion" = 1
    AND "expiresAt" = "issuedAt" + INTERVAL '600 seconds'
  ),
  CONSTRAINT "ClientLinkChallenge_evidence_check" CHECK ((
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
  ) IS TRUE),
  CONSTRAINT "ClientLinkChallenge_consumption_check" CHECK ((
    ("consumedAt" IS NULL AND "consumedLinkId" IS NULL AND "consumedProvider" IS NULL AND "consumedSubjectHash" IS NULL)
    OR ("consumedAt" IS NOT NULL AND "consumedLinkId" IS NOT NULL AND "consumedProvider" IS NOT NULL AND "consumedSubjectHash" IS NOT NULL
      AND length(btrim("consumedLinkId")) > 0 AND "consumedProvider" IN ('maya_user', 'telegram')
      AND "consumedSubjectHash" ~ '^[0-9a-f]{64}$'
      AND "issuedAt" <= "consumedAt" AND "consumedAt" < "expiresAt")
  ) IS TRUE)
);
CREATE UNIQUE INDEX "ClientLinkChallenge_id_tenantId_key" ON "ClientLinkChallenge"("id", "tenantId");
CREATE UNIQUE INDEX "ClientLinkChallenge_tenantId_tokenHash_key" ON "ClientLinkChallenge"("tenantId", "tokenHash");
CREATE UNIQUE INDEX "ClientLinkChallenge_consumedLinkId_key" ON "ClientLinkChallenge"("consumedLinkId");
CREATE INDEX "ClientLinkChallenge_tenantId_clientId_idx" ON "ClientLinkChallenge"("tenantId", "clientId");
CREATE INDEX "ClientLinkChallenge_tenantId_expiresAt_idx" ON "ClientLinkChallenge"("tenantId", "expiresAt");
ALTER TABLE "ClientLinkChallenge" ADD CONSTRAINT "ClientLinkChallenge_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientLinkChallenge" ADD CONSTRAINT "ClientLinkChallenge_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientLinkChallenge" ADD CONSTRAINT "ClientLinkChallenge_outcome_fkey"
  FOREIGN KEY ("consumedLinkId", "tenantId", "consumedProvider", "consumedSubjectHash")
  REFERENCES "ClientChannelLink"("id", "tenantId", "provider", "providerSubjectHash") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_client_link_challenge_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE server_now TIMESTAMP(3) := (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ClientLinkChallenge evidence cleanup is not authorized' USING ERRCODE = '23514';
  END IF;
  IF NEW."issuedAt" > server_now OR NEW."expiresAt" <> NEW."issuedAt" + INTERVAL '600 seconds' THEN
    RAISE EXCEPTION 'ClientLinkChallenge requires server time and exact TTL V1' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "Client" WHERE "id" = NEW."clientId" AND "tenantId" = NEW."tenantId"
    AND "mergedIntoClientId" IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ClientLinkChallenge requires exact unmerged tenant Client' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."consumedAt" IS NOT NULL OR NEW."consumedLinkId" IS NOT NULL OR NEW."consumedProvider" IS NOT NULL OR NEW."consumedSubjectHash" IS NOT NULL THEN
      RAISE EXCEPTION 'ClientLinkChallenge must start unconsumed' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['consumedAt', 'consumedLinkId', 'consumedProvider', 'consumedSubjectHash']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['consumedAt', 'consumedLinkId', 'consumedProvider', 'consumedSubjectHash'])
       OR OLD."consumedAt" IS NOT NULL OR NEW."consumedAt" IS NULL THEN
      RAISE EXCEPTION 'ClientLinkChallenge permits first consume only; issuance evidence is immutable' USING ERRCODE = '23514';
    END IF;
    IF server_now >= NEW."expiresAt" THEN
      RAISE EXCEPTION 'ClientLinkChallenge expired at actual consume time' USING ERRCODE = '23514';
    END IF;
    NEW."consumedAt" := server_now;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ClientLinkChallenge_lifecycle_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "ClientLinkChallenge"
FOR EACH ROW EXECUTE FUNCTION "guard_client_link_challenge_v1"();

CREATE FUNCTION "check_client_link_challenge_outcome_v1"() RETURNS TRIGGER
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
      AND l."supersedesLinkId" IS NULL
      AND l."verifiedAt" >= NEW."issuedAt" AND l."verifiedAt" <= NEW."consumedAt"
      AND l."createdAt" >= NEW."issuedAt" AND l."createdAt" <= NEW."consumedAt"
  ) THEN
    RAISE EXCEPTION 'ClientLinkChallenge consumption requires exact correlated verified link outcome' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "ClientLinkChallenge_outcome_guard"
AFTER INSERT OR UPDATE ON "ClientLinkChallenge" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_client_link_challenge_outcome_v1"();
