BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
CREATE TABLE "TenantBusinessConfigurationRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousRevisionId" TEXT,
    "actionExecutionId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "encryptedContent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TenantBusinessConfigurationRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "R11_TenantBusinessConfigurationRevision_tenant_uq" ON "TenantBusinessConfigurationRevision"("id", "tenantId");

CREATE UNIQUE INDEX "R11_config_version_uq" ON "TenantBusinessConfigurationRevision"("tenantId", "namespace", "revision");

CREATE UNIQUE INDEX "R11_config_execution_uq" ON "TenantBusinessConfigurationRevision"("tenantId", "actionExecutionId");

ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_TenantBusinessConfigurationRevision_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_config_member_fk" FOREIGN KEY ("actorMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_config_execution_fk" FOREIGN KEY ("actionExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_config_previous_fk" FOREIGN KEY ("previousRevisionId", "tenantId") REFERENCES "TenantBusinessConfigurationRevision"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "TenantBusinessConfigurationRevision" ADD CONSTRAINT "R11_config_contract_check" CHECK (
 "namespace" IN ('business_rules','client_capabilities','staff_ai_provider') AND "contractVersion"=1 AND "revision">0
 AND "contentHash" ~ '^[a-f0-9]{64}$' AND (("revision"=1 AND "previousRevisionId" IS NULL) OR ("revision">1 AND "previousRevisionId" IS NOT NULL))
);
CREATE FUNCTION "R11_config_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous "TenantBusinessConfigurationRevision"%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW."encryptedContent" IS NULL OR length(NEW."encryptedContent")=0 OR NOT EXISTS (
   SELECT 1 FROM "Membership" m JOIN "User" u ON u.id=m."userId" JOIN "ActionExecution" e ON e.id=NEW."actionExecutionId" AND e."tenantId"=NEW."tenantId"
   WHERE m.id=NEW."actorMembershipId" AND m."tenantId"=NEW."tenantId" AND m."userId"=NEW."actorUserId"
    AND m.status='active' AND u.status='active' AND m.role IN ('tenant_owner','business_owner')
    AND e."actorUserId"=NEW."actorUserId" AND e."actionClass"='update_tenant_business_configuration'
    AND e.state='EXECUTING' AND NOT e."dryRun" AND e."policyDecision"='ALLOW') THEN
   RAISE EXCEPTION 'R11 exact admitted actor/configuration required' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('r11/'||NEW."tenantId"||'/'||NEW.namespace,0));
  SELECT * INTO previous FROM "TenantBusinessConfigurationRevision" WHERE "tenantId"=NEW."tenantId" AND namespace=NEW.namespace ORDER BY revision DESC LIMIT 1;
  IF (previous.id IS NULL AND (NEW.revision<>1 OR NEW."previousRevisionId" IS NOT NULL)) OR
    (previous.id IS NOT NULL AND (NEW."previousRevisionId" IS DISTINCT FROM previous.id OR NEW.revision<>previous.revision+1)) THEN
   RAISE EXCEPTION 'R11 stale namespace predecessor' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD."encryptedContent" IS NOT NULL AND NEW."encryptedContent" IS NULL
  AND (to_jsonb(NEW)-'encryptedContent')=(to_jsonb(OLD)-'encryptedContent')
  AND EXISTS (SELECT 1 FROM "TenantBusinessConfigurationRevision" r WHERE r."tenantId"=OLD."tenantId" AND r.namespace=OLD.namespace AND r.revision>OLD.revision)
  AND "RC_payload_claim"(OLD."tenantId",'TenantBusinessConfigurationRevision',OLD.id,OLD."contentHash",OLD."createdAt"+interval '365 days','purge_superseded_business_configuration_payloads','package5.r11.business-configuration-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY[OLD."actionExecutionId"])
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'R11 append-only configuration / scoped superseded payload claim required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "R11_config_guard" BEFORE INSERT OR UPDATE OR DELETE ON "TenantBusinessConfigurationRevision" FOR EACH ROW EXECUTE FUNCTION "R11_config_guard"();
CREATE CONSTRAINT TRIGGER "R11_config_receipt" AFTER INSERT ON "TenantBusinessConfigurationRevision" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('actionExecutionId');

COMMIT;
