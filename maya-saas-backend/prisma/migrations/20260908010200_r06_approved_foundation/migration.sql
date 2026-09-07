BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
ALTER TABLE "ActionExecution" ADD COLUMN "operationalAlertRunId" TEXT;

ALTER TABLE "ActionExecution" ADD COLUMN "operationalAlertSlotKey" TEXT;

CREATE TABLE "OperationalAlertRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "occurrenceRef" TEXT NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "intentHash" TEXT NOT NULL,
    "intentEncrypted" TEXT,
    "admittedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "payloadRetentionUntil" TIMESTAMP(3) NOT NULL,
    "auditRetentionUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalAlertRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "R06_alert_resume_idx" ON "OperationalAlertRun"("tenantId", "expiresAt");

CREATE INDEX "R06_alert_payload_idx" ON "OperationalAlertRun"("payloadRetentionUntil");

CREATE INDEX "R06_alert_audit_idx" ON "OperationalAlertRun"("auditRetentionUntil");

CREATE UNIQUE INDEX "R06_OperationalAlertRun_tenant_uq" ON "OperationalAlertRun"("id", "tenantId");

CREATE UNIQUE INDEX "R06_alert_identity_uq" ON "OperationalAlertRun"("tenantId", "alertType", "occurrenceRef", "contractVersion");

CREATE UNIQUE INDEX "R06_execution_slot_uq" ON "ActionExecution"("tenantId", "operationalAlertRunId", "operationalAlertSlotKey");

ALTER TABLE "ActionExecution" ADD CONSTRAINT "R06_execution_run_fk" FOREIGN KEY ("operationalAlertRunId", "tenantId") REFERENCES "OperationalAlertRun"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "OperationalAlertRun" ADD CONSTRAINT "R06_OperationalAlertRun_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "OperationalAlertRun" ADD CONSTRAINT "R06_alert_contract_check" CHECK (
 "alertType" IN ('staff_shift_reminder','wanted_slot_admin_notice') AND "contractVersion"=1
 AND "occurrenceRef" ~ '^[a-f0-9]{64}$' AND "intentHash" ~ '^[a-f0-9]{64}$'
 AND "occurredAt" <= "admittedAt" AND "admittedAt" < "expiresAt"
 AND "expiresAt" <= "admittedAt"+interval '7 days'
 AND "payloadRetentionUntil"="admittedAt"+interval '7 days'
 AND "auditRetentionUntil"="admittedAt"+interval '365 days'
);
ALTER TABLE "ActionExecution" ADD CONSTRAINT "R06_execution_binding_check" CHECK (
 ("operationalAlertRunId" IS NULL AND "operationalAlertSlotKey" IS NULL) OR
 ("operationalAlertRunId" IS NOT NULL AND "operationalAlertSlotKey" IS NOT NULL AND "operationalAlertSlotKey" ~ '^[a-f0-9]{64}$')
);
CREATE FUNCTION "R06_alert_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW."intentEncrypted" IS NOT NULL AND length(NEW."intentEncrypted")>0 THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD."intentEncrypted" IS NOT NULL AND NEW."intentEncrypted" IS NULL
  AND (to_jsonb(NEW)-'intentEncrypted')=(to_jsonb(OLD)-'intentEncrypted')
  AND (OLD."expiresAt" AT TIME ZONE 'UTC')<=clock_timestamp()
  AND "RC_payload_claim"(OLD."tenantId",'OperationalAlertRun',OLD.id,OLD."intentHash",(OLD."payloadRetentionUntil" AT TIME ZONE 'UTC'),'purge_operational_alert_payloads','package5.r06.operational-alert-payload-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=OLD."tenantId" AND "operationalAlertRunId"=OLD.id))
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'R06 immutable alert / exact scoped payload claim required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "R06_alert_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OperationalAlertRun" FOR EACH ROW EXECUTE FUNCTION "R06_alert_guard"();
CREATE FUNCTION "R06_execution_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root "OperationalAlertRun"%ROWTYPE; root_xid xid;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."operationalAlertRunId" IS NOT NULL THEN RAISE EXCEPTION 'R06 slot tombstone retained' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."operationalAlertRunId" IS DISTINCT FROM OLD."operationalAlertRunId" OR NEW."operationalAlertSlotKey" IS DISTINCT FROM OLD."operationalAlertSlotKey" THEN
   RAISE EXCEPTION 'R06 immutable slot binding' USING ERRCODE='23514';
  END IF; RETURN NEW;
 END IF;
 IF NEW."operationalAlertRunId" IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO root FROM "OperationalAlertRun" WHERE id=NEW."operationalAlertRunId" AND "tenantId"=NEW."tenantId";
 SELECT xmin INTO root_xid FROM "OperationalAlertRun" WHERE id=root.id;
 IF root.id IS NULL OR root_xid<>pg_current_xact_id()::xid OR root."intentEncrypted" IS NULL OR NEW.state<>'READY'
  OR NEW."policyDecision"<>'ALLOW' OR NEW."dryRun" OR NEW."intentExpiresAt" IS DISTINCT FROM root."expiresAt"
  OR (root."alertType"='staff_shift_reminder' AND (NEW.capability<>'communication.appointment-reminders.execute.v1' OR NEW."actionClass"<>'deliver_appointment_reminder'))
  OR (root."alertType"='wanted_slot_admin_notice' AND (NEW.capability<>'communication.business-alerts.execute.v1' OR NEW."actionClass"<>'deliver_business_alert')) THEN
  RAISE EXCEPTION 'R06 exact type / complete same-transaction admission required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "R06_execution_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ActionExecution" FOR EACH ROW EXECUTE FUNCTION "R06_execution_guard"();

COMMIT;
