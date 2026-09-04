-- Approved at 55380a90 + explicit ClientChannelLink Schema V1 approval.
-- One empty additive model. No application rows or historical links backfilled.
CREATE TABLE "ClientChannelLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerSubjectHash" TEXT NOT NULL,
  "subjectHashVersion" INTEGER NOT NULL DEFAULT 1,
  "verificationMethod" TEXT NOT NULL,
  "verificationVersion" INTEGER NOT NULL DEFAULT 1,
  "verificationIdentityHash" TEXT NOT NULL,
  "verificationEvidenceJson" JSONB NOT NULL,
  "verificationEvidenceHash" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
  "supersedesLinkId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revocationIdentityHash" TEXT,
  "revocationEvidenceJson" JSONB,
  "revocationEvidenceHash" TEXT,
  CONSTRAINT "ClientChannelLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientChannelLink_identity_check" CHECK (
    length(btrim("id")) > 0 AND length(btrim("tenantId")) > 0
    AND length(btrim("clientId")) > 0
    AND "provider" IN ('maya_user', 'telegram')
    AND "subjectHashVersion" = 1 AND "verificationVersion" = 1
    AND "verificationMethod" IN ('proven_user_client_link', 'explicit_verified_challenge')
    AND ("verificationMethod" <> 'proven_user_client_link' OR "provider" = 'maya_user')
    AND "providerSubjectHash" ~ '^[0-9a-f]{64}$'
    AND "verificationIdentityHash" ~ '^[0-9a-f]{64}$'
    AND "verificationEvidenceHash" ~ '^[0-9a-f]{64}$'
    AND ("supersedesLinkId" IS NULL OR "supersedesLinkId" <> "id")
  ),
  CONSTRAINT "ClientChannelLink_verification_evidence_check" CHECK ((
    jsonb_typeof("verificationEvidenceJson") = 'object'
    AND octet_length("verificationEvidenceJson"::TEXT) <= 8192
    AND "verificationEvidenceJson" ?& ARRAY[
      'contract', 'verifier', 'channelControlProofHash', 'clientAuthorityProofHash',
      'verificationIdentityHash', 'tenantId', 'provider', 'providerSubjectHash', 'clientId'
    ]
    AND "verificationEvidenceJson" - ARRAY[
      'contract', 'verifier', 'channelControlProofHash', 'clientAuthorityProofHash',
      'verificationIdentityHash', 'tenantId', 'provider', 'providerSubjectHash', 'clientId',
      'verifiedAt', 'validUntil'
    ] = '{}'::jsonb
    AND "verificationEvidenceJson"->>'contract' = 'a18.client-channel-verification.v1'
    AND length(btrim("verificationEvidenceJson"->>'verifier')) > 0
    AND "verificationEvidenceJson"->>'channelControlProofHash' ~ '^[0-9a-f]{64}$'
    AND "verificationEvidenceJson"->>'clientAuthorityProofHash' ~ '^[0-9a-f]{64}$'
    AND "verificationEvidenceJson"->>'verificationIdentityHash' = "verificationIdentityHash"
    AND "verificationEvidenceJson"->>'tenantId' = "tenantId"
    AND "verificationEvidenceJson"->>'provider' = "provider"
    AND "verificationEvidenceJson"->>'providerSubjectHash' = "providerSubjectHash"
    AND "verificationEvidenceJson"->>'clientId' = "clientId"
  ) IS TRUE),
  CONSTRAINT "ClientChannelLink_time_check" CHECK (
    "verifiedAt" <= "createdAt"
    AND ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
  ),
  CONSTRAINT "ClientChannelLink_revocation_check" CHECK ((
    ("revokedAt" IS NULL AND "revocationIdentityHash" IS NULL
      AND "revocationEvidenceJson" IS NULL AND "revocationEvidenceHash" IS NULL)
    OR
    ("revokedAt" IS NOT NULL AND "revocationIdentityHash" IS NOT NULL
      AND "revocationEvidenceJson" IS NOT NULL AND "revocationEvidenceHash" IS NOT NULL
      AND "revocationIdentityHash" ~ '^[0-9a-f]{64}$'
      AND "revocationEvidenceHash" ~ '^[0-9a-f]{64}$'
      AND jsonb_typeof("revocationEvidenceJson") = 'object'
      AND octet_length("revocationEvidenceJson"::TEXT) <= 8192
      AND "revocationEvidenceJson" ?& ARRAY[
        'contract', 'revocationIdentityHash', 'tenantId', 'linkId', 'actorProofHash', 'reason'
      ]
      AND "revocationEvidenceJson" - ARRAY[
        'contract', 'revocationIdentityHash', 'tenantId', 'linkId', 'actorProofHash', 'reason'
      ] = '{}'::jsonb
      AND "revocationEvidenceJson"->>'contract' = 'a18.client-channel-revocation.v1'
      AND "revocationEvidenceJson"->>'revocationIdentityHash' = "revocationIdentityHash"
      AND "revocationEvidenceJson"->>'tenantId' = "tenantId"
      AND "revocationEvidenceJson"->>'linkId' = "id"
      AND "revocationEvidenceJson"->>'actorProofHash' ~ '^[0-9a-f]{64}$'
      AND length(btrim("revocationEvidenceJson"->>'reason')) BETWEEN 1 AND 160)
  ) IS TRUE)
);

CREATE UNIQUE INDEX "ClientChannelLink_id_tenantId_key" ON "ClientChannelLink"("id", "tenantId");
CREATE UNIQUE INDEX "ClientChannelLink_identity_reference_key"
  ON "ClientChannelLink"("id", "tenantId", "provider", "providerSubjectHash");
CREATE UNIQUE INDEX "ClientChannelLink_verification_identity_key"
  ON "ClientChannelLink"("tenantId", "verificationIdentityHash");
CREATE UNIQUE INDEX "ClientChannelLink_revocation_identity_key"
  ON "ClientChannelLink"("tenantId", "revocationIdentityHash");
CREATE UNIQUE INDEX "ClientChannelLink_supersedesLinkId_key" ON "ClientChannelLink"("supersedesLinkId");
CREATE UNIQUE INDEX "ClientChannelLink_active_subject_key"
  ON "ClientChannelLink"("tenantId", "provider", "providerSubjectHash") WHERE "revokedAt" IS NULL;
CREATE INDEX "ClientChannelLink_tenantId_clientId_idx" ON "ClientChannelLink"("tenantId", "clientId");

ALTER TABLE "ClientChannelLink" ADD CONSTRAINT "ClientChannelLink_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientChannelLink" ADD CONSTRAINT "ClientChannelLink_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientChannelLink" ADD CONSTRAINT "ClientChannelLink_predecessor_fkey"
  FOREIGN KEY ("supersedesLinkId", "tenantId", "provider", "providerSubjectHash")
  REFERENCES "ClientChannelLink"("id", "tenantId", "provider", "providerSubjectHash")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Shape/identity consistency is not a cryptographic verification mechanism.
-- Only the verified command boundary may produce a new binding receipt.
CREATE FUNCTION "guard_client_channel_link_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  prior_id TEXT;
  prior_revoked TIMESTAMP(3);
  latest_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ClientChannelLink historical evidence cannot be deleted' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array('a18.client-channel.v1', NEW."tenantId", NEW."provider", NEW."providerSubjectHash")::TEXT, 0));

  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['revokedAt', 'revocationIdentityHash', 'revocationEvidenceJson', 'revocationEvidenceHash'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['revokedAt', 'revocationIdentityHash', 'revocationEvidenceJson', 'revocationEvidenceHash'])
      OR OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL
    THEN
      RAISE EXCEPTION 'ClientChannelLink permits only first complete revocation; original evidence is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."revokedAt" > (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3) THEN
      RAISE EXCEPTION 'ClientChannelLink revocation cannot be future-dated' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."revokedAt" IS NOT NULL OR NEW."createdAt" > (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3)
     OR NEW."verifiedAt" > (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3) THEN
    RAISE EXCEPTION 'ClientChannelLink must start as a currently verified episode' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM "Client" WHERE "id" = NEW."clientId" AND "tenantId" = NEW."tenantId"
    AND "mergedIntoClientId" IS NULL FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ClientChannelLink requires an exact unmerged tenant Client' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO latest_count FROM "ClientChannelLink" p
    WHERE p."tenantId" = NEW."tenantId" AND p."provider" = NEW."provider"
      AND p."providerSubjectHash" = NEW."providerSubjectHash"
      AND NOT EXISTS (SELECT 1 FROM "ClientChannelLink" s WHERE s."supersedesLinkId" = p."id");
  IF latest_count = 0 THEN
    IF NEW."supersedesLinkId" IS NOT NULL THEN
      RAISE EXCEPTION 'Initial ClientChannelLink cannot claim a predecessor' USING ERRCODE = '23514';
    END IF;
  ELSIF latest_count = 1 THEN
    SELECT p."id", p."revokedAt" INTO prior_id, prior_revoked FROM "ClientChannelLink" p
      WHERE p."tenantId" = NEW."tenantId" AND p."provider" = NEW."provider"
        AND p."providerSubjectHash" = NEW."providerSubjectHash"
        AND NOT EXISTS (SELECT 1 FROM "ClientChannelLink" s WHERE s."supersedesLinkId" = p."id");
    IF NEW."supersedesLinkId" IS DISTINCT FROM prior_id OR prior_revoked IS NULL THEN
      RAISE EXCEPTION 'ClientChannelLink re-link requires the latest explicitly revoked predecessor' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Ambiguous ClientChannelLink history requires explicit repair' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClientChannelLink_lifecycle_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "ClientChannelLink"
FOR EACH ROW EXECUTE FUNCTION "guard_client_channel_link_v1"();
