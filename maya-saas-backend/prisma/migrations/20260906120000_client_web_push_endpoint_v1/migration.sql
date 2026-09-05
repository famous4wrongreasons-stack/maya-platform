-- B24 owner-approved V1. One empty additive model, no historical backfill.
CREATE TABLE "ClientWebPushEndpoint" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "tenantId" TEXT NOT NULL,
 "clientId" TEXT NOT NULL,
 "clientChannelLinkId" TEXT NOT NULL,
 "endpointHash" TEXT NOT NULL,
 "hashVersion" INTEGER NOT NULL DEFAULT 1,
 "subscriptionEncrypted" TEXT NOT NULL,
 "materialHash" TEXT NOT NULL,
 "registrationIdentityHash" TEXT NOT NULL,
 "policyVersion" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP),
 "registrationEvidenceJson" JSONB NOT NULL,
 "registrationEvidenceHash" TEXT NOT NULL,
 "supersedesEndpointId" TEXT,
 "endedAt" TIMESTAMP(3),
 "endReason" TEXT,
 "terminationIdentityHash" TEXT,
 "terminationEvidenceJson" JSONB,
 "terminationEvidenceHash" TEXT,
 CONSTRAINT "ClientWebPushEndpoint_versions_check" CHECK (
   "hashVersion" = 1 AND "policyVersion" = 1
   AND "endpointHash" ~ '^[0-9a-f]{64}$'
   AND "materialHash" ~ '^[0-9a-f]{64}$'
   AND "registrationIdentityHash" ~ '^[0-9a-f]{64}$'
   AND "registrationEvidenceHash" ~ '^[0-9a-f]{64}$'
   AND octet_length("subscriptionEncrypted") BETWEEN 42 AND 10963
   AND "subscriptionEncrypted" ~ '^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'
   AND ("supersedesEndpointId" IS NULL OR "supersedesEndpointId" <> "id")
 ),
 CONSTRAINT "ClientWebPushEndpoint_registration_check" CHECK ((
   jsonb_typeof("registrationEvidenceJson") = 'object'
   AND "registrationEvidenceJson" ?& ARRAY['contract','linkId','linkEvidenceHash','actorProofHash','materialHash','registrationIdentityHash']
   AND "registrationEvidenceJson" - ARRAY['contract','linkId','linkEvidenceHash','actorProofHash','materialHash','registrationIdentityHash'] = '{}'::jsonb
   AND "registrationEvidenceJson"->>'contract' = 'b24.web-push.registration.v1'
   AND "registrationEvidenceJson"->>'linkId' = "clientChannelLinkId"
   AND "registrationEvidenceJson"->>'linkEvidenceHash' ~ '^[0-9a-f]{64}$'
   AND "registrationEvidenceJson"->>'actorProofHash' ~ '^[0-9a-f]{64}$'
   AND "registrationEvidenceJson"->>'materialHash' = "materialHash"
   AND "registrationEvidenceJson"->>'registrationIdentityHash' = "registrationIdentityHash"
   AND octet_length("registrationEvidenceJson"::TEXT) <= 2048
 ) IS TRUE),
 CONSTRAINT "ClientWebPushEndpoint_terminal_check" CHECK ((
   ("endedAt" IS NULL AND "endReason" IS NULL AND "terminationIdentityHash" IS NULL
     AND "terminationEvidenceJson" IS NULL AND "terminationEvidenceHash" IS NULL)
   OR ("endedAt" IS NOT NULL AND "endedAt" >= "createdAt"
     AND "endReason" IN ('UNSUBSCRIBED','REPLACED','PERMANENT_ENDPOINT_INVALID')
     AND "terminationIdentityHash" ~ '^[0-9a-f]{64}$'
     AND "terminationEvidenceHash" ~ '^[0-9a-f]{64}$'
     AND jsonb_typeof("terminationEvidenceJson") = 'object'
     AND "terminationEvidenceJson" ?& ARRAY['contract','endpointId','reason','authorityRefHash','terminationIdentityHash']
     AND "terminationEvidenceJson" - ARRAY['contract','endpointId','reason','authorityRefHash','terminationIdentityHash'] = '{}'::jsonb
     AND "terminationEvidenceJson"->>'contract' = 'b24.web-push.termination.v1'
     AND "terminationEvidenceJson"->>'endpointId' = "id"
     AND "terminationEvidenceJson"->>'reason' = "endReason"
     AND "terminationEvidenceJson"->>'authorityRefHash' ~ '^[0-9a-f]{64}$'
     AND "terminationEvidenceJson"->>'terminationIdentityHash' = "terminationIdentityHash"
     AND octet_length("terminationEvidenceJson"::TEXT) <= 2048)
 ) IS TRUE)
);
CREATE UNIQUE INDEX "ClientWebPushEndpoint_id_tenantId_clientId_key" ON "ClientWebPushEndpoint"("id","tenantId","clientId");
CREATE UNIQUE INDEX "ClientWebPushEndpoint_tenantId_registrationIdentityHash_key" ON "ClientWebPushEndpoint"("tenantId","registrationIdentityHash");
CREATE UNIQUE INDEX "ClientWebPushEndpoint_supersedesEndpointId_key" ON "ClientWebPushEndpoint"("supersedesEndpointId");
CREATE UNIQUE INDEX "ClientWebPushEndpoint_terminationIdentityHash_key" ON "ClientWebPushEndpoint"("terminationIdentityHash");
CREATE UNIQUE INDEX "ClientWebPushEndpoint_active_endpoint_key" ON "ClientWebPushEndpoint"("endpointHash") WHERE "endedAt" IS NULL;
CREATE INDEX "ClientWebPushEndpoint_tenantId_clientId_endedAt_createdAt_i_idx" ON "ClientWebPushEndpoint"("tenantId","clientId","endedAt","createdAt","id");
CREATE INDEX "ClientWebPushEndpoint_endpointHash_idx" ON "ClientWebPushEndpoint"("endpointHash");
ALTER TABLE "ClientWebPushEndpoint" ADD CONSTRAINT "ClientWebPushEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientWebPushEndpoint" ADD CONSTRAINT "ClientWebPushEndpoint_clientId_tenantId_fkey" FOREIGN KEY ("clientId","tenantId") REFERENCES "Client"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientWebPushEndpoint" ADD CONSTRAINT "ClientWebPushEndpoint_clientChannelLinkId_tenantId_clientI_fkey" FOREIGN KEY ("clientChannelLinkId","tenantId","clientId") REFERENCES "ClientChannelLink"("id","tenantId","clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ClientWebPushEndpoint" ADD CONSTRAINT "ClientWebPushEndpoint_supersedesEndpointId_tenantId_client_fkey" FOREIGN KEY ("supersedesEndpointId","tenantId","clientId") REFERENCES "ClientWebPushEndpoint"("id","tenantId","clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Service performs cryptographic authentication; this trigger ratchets its exact
-- verified transaction binding and immutable schema/lifecycle, not raw credentials.
CREATE FUNCTION "guard_client_web_push_endpoint_v1"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  verified_link TEXT;
  verified_owner TEXT;
  evidence_hash TEXT;
  active_count INTEGER;
  previous "ClientWebPushEndpoint"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WEB_PUSH_HISTORY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  -- Global endpoint identity prevents cross-tenant ownership collisions.
  PERFORM pg_advisory_xact_lock(hashtextextended('b24.endpoint:' || NEW."endpointHash", 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array('b24.client', NEW."tenantId", NEW."clientId")::TEXT, 0));
  IF TG_OP = 'UPDATE' THEN
    IF OLD."endedAt" IS NOT NULL OR NEW."endedAt" IS NULL
       OR (to_jsonb(NEW) - ARRAY['endedAt','endReason','terminationIdentityHash','terminationEvidenceJson','terminationEvidenceHash'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['endedAt','endReason','terminationIdentityHash','terminationEvidenceJson','terminationEvidenceHash'])
       OR current_setting('maya.web_push.termination_identity', true) IS DISTINCT FROM NEW."terminationIdentityHash"
    THEN RAISE EXCEPTION 'WEB_PUSH_ONLY_VERIFIED_TERMINAL_TRANSITION' USING ERRCODE = '23514'; END IF;
    NEW."endedAt" := (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3);
    RETURN NEW;
  END IF;
  IF NEW."endedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'WEB_PUSH_NEW_EPISODE_MUST_BE_ACTIVE' USING ERRCODE = '23514';
  END IF;
  verified_link := current_setting('maya.web_push.verified_link', true);
  verified_owner := current_setting('maya.web_push.verified_client', true);
  IF verified_link IS DISTINCT FROM NEW."clientChannelLinkId"
     OR verified_owner IS DISTINCT FROM NEW."clientId" THEN
    RAISE EXCEPTION 'WEB_PUSH_VERIFIED_CLIENT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT l."verificationEvidenceHash" INTO evidence_hash
    FROM "ClientChannelLink" l JOIN "Client" c ON c."id"=l."clientId" AND c."tenantId"=l."tenantId"
    WHERE l."id"=NEW."clientChannelLinkId" AND l."tenantId"=NEW."tenantId" AND l."clientId"=NEW."clientId"
      AND l."revokedAt" IS NULL AND l."verificationVersion"=1 AND l."subjectHashVersion"=1
      AND c."mergedIntoClientId" IS NULL FOR SHARE OF l, c;
  IF evidence_hash IS NULL OR evidence_hash IS DISTINCT FROM NEW."registrationEvidenceJson"->>'linkEvidenceHash' THEN
    RAISE EXCEPTION 'WEB_PUSH_ACTIVE_VERIFIED_LINK_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "ClientWebPushEndpoint" e WHERE e."endpointHash"=NEW."endpointHash"
      AND (e."tenantId"<>NEW."tenantId" OR e."clientId"<>NEW."clientId")) THEN
    RAISE EXCEPTION 'WEB_PUSH_ENDPOINT_OWNERSHIP_CONFLICT' USING ERRCODE = '23514';
  END IF;
  IF NEW."supersedesEndpointId" IS NOT NULL THEN
    SELECT * INTO previous FROM "ClientWebPushEndpoint" WHERE "id"=NEW."supersedesEndpointId";
    IF previous."id" IS NULL OR previous."tenantId"<>NEW."tenantId" OR previous."clientId"<>NEW."clientId"
      OR previous."endedAt" IS NULL OR previous."endReason"<>'REPLACED' THEN
      RAISE EXCEPTION 'WEB_PUSH_EXPLICIT_REPLACEMENT_REQUIRED' USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "ClientWebPushEndpoint" WHERE "endpointHash"=NEW."endpointHash") THEN
    RAISE EXCEPTION 'WEB_PUSH_NO_IMPLICIT_RESURRECTION' USING ERRCODE = '23514';
  END IF;
  SELECT count(*) INTO active_count FROM "ClientWebPushEndpoint"
    WHERE "tenantId"=NEW."tenantId" AND "clientId"=NEW."clientId" AND "endedAt" IS NULL;
  IF active_count >= 5 THEN
    RAISE EXCEPTION 'CLIENT_WEB_PUSH_LIMIT_EXCEEDED' USING ERRCODE = '23514';
  END IF;
  NEW."createdAt" := (clock_timestamp() AT TIME ZONE 'UTC')::TIMESTAMP(3);
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ClientWebPushEndpoint_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ClientWebPushEndpoint"
FOR EACH ROW EXECUTE FUNCTION "guard_client_web_push_endpoint_v1"();
