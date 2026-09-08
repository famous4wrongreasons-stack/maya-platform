-- CreateTable
CREATE TABLE "ClientConsentInvalidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "consentFactId" TEXT NOT NULL,
    "invalidatedLinkId" TEXT NOT NULL,
    "actionExecutionId" TEXT NOT NULL,
    "authorizedByUserId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "evidenceSetHash" TEXT NOT NULL,
    "authorityEvidenceJson" JSONB NOT NULL,
    "invalidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientConsentInvalidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientConsentInvalidation_tenantId_clientId_invalidatedAt_idx" ON "ClientConsentInvalidation"("tenantId", "clientId", "invalidatedAt");

-- CreateIndex
CREATE INDEX "ClientConsentInvalidation_tenantId_actionExecutionId_idx" ON "ClientConsentInvalidation"("tenantId", "actionExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientConsentInvalidation_tenantId_consentFactId_key" ON "ClientConsentInvalidation"("tenantId", "consentFactId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentInvalidation_fact_reference_key" ON "ClientConsentInvalidation"("consentFactId", "tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentFact_client_reference_key" ON "ClientConsentFact"("id", "tenantId", "clientId");

-- AddForeignKey
ALTER TABLE "ClientConsentInvalidation" ADD CONSTRAINT "ClientConsentInvalidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientConsentInvalidation" ADD CONSTRAINT "ClientConsentInvalidation_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientConsentInvalidation" ADD CONSTRAINT "ClientConsentInvalidation_consentFactId_tenantId_clientId_fkey" FOREIGN KEY ("consentFactId", "tenantId", "clientId") REFERENCES "ClientConsentFact"("id", "tenantId", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientConsentInvalidation" ADD CONSTRAINT "ClientConsentInvalidation_invalidatedLinkId_tenantId_clien_fkey" FOREIGN KEY ("invalidatedLinkId", "tenantId", "clientId") REFERENCES "ClientChannelLink"("id", "tenantId", "clientId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientConsentInvalidation" ADD CONSTRAINT "ClientConsentInvalidation_actionExecutionId_tenantId_fkey" FOREIGN KEY ("actionExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientConsentInvalidation" ADD CONSTRAINT "ClientConsentInvalidation_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Approved subsequent security facts only. No data backfill or history updates.
ALTER TABLE "ClientConsentInvalidation"
  ADD CONSTRAINT "ConsentInvalidation_reason_version_check" CHECK (
    "reasonCode" = 'UNPROVEN_CLIENT_PROVENANCE' AND "policyVersion" = 1
    AND "evidenceSetHash" ~ '^[0-9a-f]{64}$');

-- Flat closed authority object: identical ASCII key ordering and primitive JSON
-- encoding to the versioned TypeScript canonical hash, without lossy whitespace removal.
CREATE FUNCTION a18_security_authority_hash(value JSONB) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT SET search_path=public,pg_temp AS $$
  SELECT encode(sha256(convert_to('maya.a18.consent-security-invalidation/1' || E'\n' ||
    '{' || string_agg(to_json(key)::text || ':' || val::text, ',' ORDER BY key COLLATE "C") || '}', 'UTF8')), 'hex')
  FROM jsonb_each(value) AS parts(key,val)
$$;

CREATE FUNCTION a18_guard_consent_invalidation() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE e "ActionExecution"%ROWTYPE; f "ClientConsentFact"%ROWTYPE;
  original "ActionExecution"%ROWTYPE; authority JSONB;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'ClientConsentInvalidation is append-only' USING ERRCODE='23514';
  END IF;
  PERFORM p5_require_governed_execution(NEW."tenantId", NEW."actionExecutionId");
  SELECT * INTO e FROM "ActionExecution" WHERE id=NEW."actionExecutionId" AND "tenantId"=NEW."tenantId";
  SELECT * INTO f FROM "ClientConsentFact" WHERE id=NEW."consentFactId" AND "tenantId"=NEW."tenantId" AND "clientId"=NEW."clientId";
  SELECT * INTO original FROM "ActionExecution" WHERE id=f."actionExecutionId" AND "tenantId"=f."tenantId";
  authority := NEW."authorityEvidenceJson";
  IF e."actionClass" <> 'invalidate_client_consent_authority' OR
    e.capability <> 'package5.a18.consent-security-invalidation.execute.v1' OR
    e."targetKind" <> 'client_consent_security' OR e."targetRef" <> NEW."clientId" OR
    e."normalizedInputContract" <> 'maya.a18.consent-security-invalidation/1' OR
    e.state::text <> 'EXECUTING' OR e."leaseTokenHash" IS NULL OR e."leaseExpiresAt" IS NULL OR e."leaseExpiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::timestamp(3) OR
    f.id IS NULL OR f.decision <> 'grant' OR f.kind NOT IN ('privacy','marketing') OR
    original.id IS NULL OR original.state::text <> 'SUCCEEDED' OR original."actionClass" <> 'record_client_consent' OR
    NOT (e."evidenceRefsJson" @> jsonb_build_array(
      'security-evidence:'||NEW."evidenceSetHash", 'security-link:'||NEW."invalidatedLinkId",
      'security-target:'||NEW."clientId", 'security-actor:'||NEW."authorizedByUserId",
      'security-fact:'||f.id||':'||original.id||':'||original."normalizedInputHash")) OR
    jsonb_array_length(e."evidenceRefsJson") <> 7 OR
    NOT (e."evidenceRefsJson" @> jsonb_build_array('security-authority:'||a18_security_authority_hash(authority))) OR
    NOT COALESCE(authority->>'contract'='maya.a18.security-actor/1' AND authority->>'policyVersion'='1'
      AND authority->>'userId'=NEW."authorizedByUserId" AND authority->>'role'='platform_owner'
      AND authority->>'scope'='platform' AND authority->>'sessionIdentityHash' ~ '^[a-f0-9]{64}$'
      AND authority->>'approvalMaterialHash' ~ '^[a-f0-9]{64}$'
      AND authority->>'approvalRef'='owner-approval:fdecfbb4:consent-security-invalidation-v1', false) OR
    NOT (authority ?& ARRAY['contract','policyVersion','userId','role','scope','sessionIdentityHash','verifiedAt','approvalRef','approvalMaterialHash']) OR
    jsonb_typeof(authority->'policyVersion') <> 'number' OR
    NOT COALESCE(authority->>'verifiedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$', false) OR
    (SELECT count(*) FROM jsonb_object_keys(authority)) <> 9 OR
    NOT EXISTS(SELECT 1 FROM "User" WHERE id=NEW."authorizedByUserId" AND role='platform_owner' AND status='active' AND "tenantId" IS NULL) OR
    NEW."invalidatedAt" <> (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::timestamp(3)
  THEN RAISE EXCEPTION 'Exact admitted A18 security evidence required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ConsentInvalidation_insert_guard" BEFORE INSERT ON "ClientConsentInvalidation"
  FOR EACH ROW EXECUTE FUNCTION a18_guard_consent_invalidation();
CREATE TRIGGER "ConsentInvalidation_append_only_guard" BEFORE UPDATE OR DELETE ON "ClientConsentInvalidation"
  FOR EACH ROW EXECUTE FUNCTION a18_guard_consent_invalidation();

-- Deferred across the entire transaction: neither half can commit by itself.
CREATE FUNCTION a18_assert_security_outcome(tenant_ref TEXT, execution_ref TEXT) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE e "ActionExecution"%ROWTYPE; n INTEGER; kinds INTEGER; links INTEGER; hashes INTEGER;
BEGIN
  SELECT * INTO e FROM "ActionExecution" WHERE id=execution_ref AND "tenantId"=tenant_ref;
  SELECT count(*), count(DISTINCT f.kind), count(DISTINCT i."invalidatedLinkId"), count(DISTINCT i."evidenceSetHash")
    INTO n,kinds,links,hashes FROM "ClientConsentInvalidation" i JOIN "ClientConsentFact" f
      ON f.id=i."consentFactId" AND f."tenantId"=i."tenantId"
    WHERE i."tenantId"=tenant_ref AND i."actionExecutionId"=execution_ref;
  IF e.id IS NULL OR e.state::text <> 'SUCCEEDED' OR n<>2 OR kinds<>2 OR links<>1 OR hashes<>1 OR
    EXISTS(SELECT 1 FROM "ClientConsentInvalidation" i JOIN "ClientChannelLink" l
      ON l.id=i."invalidatedLinkId" AND l."tenantId"=i."tenantId" WHERE i."tenantId"=tenant_ref
      AND i."actionExecutionId"=execution_ref AND (l."revokedAt" IS NULL OR
        l."revocationIdentityHash" IS DISTINCT FROM i."evidenceSetHash" OR
        l."revocationEvidenceJson"->>'reason' IS DISTINCT FROM 'UNPROVEN_CLIENT_PROVENANCE'))
  THEN RAISE EXCEPTION 'A18 security outcome must atomically revoke one link and invalidate both grants' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION a18_guard_security_outcome() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE execution_ref TEXT;
BEGIN
  IF TG_TABLE_NAME='ClientConsentInvalidation' THEN
    PERFORM a18_assert_security_outcome(NEW."tenantId",NEW."actionExecutionId");
  ELSIF TG_TABLE_NAME='ActionExecution' THEN
    IF NEW."actionClass"='invalidate_client_consent_authority' AND NEW.state::text='SUCCEEDED' THEN
      PERFORM a18_assert_security_outcome(NEW."tenantId",NEW.id);
    END IF;
  ELSIF NEW."revocationEvidenceJson"->>'reason'='UNPROVEN_CLIENT_PROVENANCE' THEN
    SELECT i."actionExecutionId" INTO execution_ref FROM "ClientConsentInvalidation" i
      WHERE i."tenantId"=NEW."tenantId" AND i."invalidatedLinkId"=NEW.id LIMIT 1;
    PERFORM a18_assert_security_outcome(NEW."tenantId",execution_ref);
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "ConsentInvalidation_atomic_outcome" AFTER INSERT ON "ClientConsentInvalidation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION a18_guard_security_outcome();
CREATE CONSTRAINT TRIGGER "ConsentSecurity_execution_outcome" AFTER UPDATE ON "ActionExecution"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION a18_guard_security_outcome();
CREATE CONSTRAINT TRIGGER "ConsentSecurity_link_outcome" AFTER UPDATE ON "ClientChannelLink"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION a18_guard_security_outcome();

CREATE FUNCTION a18_preserve_incident_execution_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM "ClientConsentInvalidation" i LEFT JOIN "ClientConsentFact" f
    ON f.id=i."consentFactId" AND f."tenantId"=i."tenantId"
    WHERE i."tenantId"=OLD."tenantId" AND (i."actionExecutionId"=OLD.id OR f."actionExecutionId"=OLD.id)) THEN
    IF TG_OP='DELETE' OR NEW."normalizedInputEncrypted" IS DISTINCT FROM OLD."normalizedInputEncrypted" OR
      NEW."normalizedInputHash" IS DISTINCT FROM OLD."normalizedInputHash" OR
      NEW."normalizedInputContract" IS DISTINCT FROM OLD."normalizedInputContract" OR
      NEW."evidenceRefsJson" IS DISTINCT FROM OLD."evidenceRefsJson" THEN
      RAISE EXCEPTION 'Pinned consent incident evidence must be preserved' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ConsentSecurity_preserve_execution" BEFORE UPDATE OR DELETE ON "ActionExecution"
  FOR EACH ROW EXECUTE FUNCTION a18_preserve_incident_execution_evidence();
