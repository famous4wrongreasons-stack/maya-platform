BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved B36: one model, twelve root fields and two existing execution fields.
-- Prospective only: no UPDATE/backfill of historical communication.
CREATE TABLE "OwnerReportRun" (
 "id" TEXT NOT NULL,
 "tenantId" TEXT NOT NULL,
 "reportType" TEXT NOT NULL,
 "periodLocalDate" TEXT NOT NULL,
 "reportVersion" INTEGER NOT NULL,
 "timezone" TEXT NOT NULL,
 "intentHash" TEXT NOT NULL,
 "intentEncrypted" TEXT,
 "admittedAt" TIMESTAMP(3) NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "payloadRetentionUntil" TIMESTAMP(3) NOT NULL,
 "auditRetentionUntil" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "OwnerReportRun_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "B36_report_contract_check" CHECK (
  "reportType" = 'daily_report' AND "reportVersion" = 1
  AND "periodLocalDate" ~ '^\d{4}-\d{2}-\d{2}$'
  AND length(btrim("timezone")) > 0
  AND "intentHash" ~ '^[a-f0-9]{64}$'
  AND "expiresAt" > "admittedAt"
  AND "payloadRetentionUntil" = "admittedAt" + interval '7 days'
  AND "auditRetentionUntil" = "admittedAt" + interval '365 days'
 )
);
ALTER TABLE "ActionExecution" ADD COLUMN "ownerReportRunId" TEXT, ADD COLUMN "ownerReportSlotKey" TEXT;
CREATE UNIQUE INDEX "B36_report_identity_key" ON "OwnerReportRun"("tenantId","reportType","periodLocalDate","reportVersion");
CREATE UNIQUE INDEX "B36_report_tenant_key" ON "OwnerReportRun"("id","tenantId");
CREATE UNIQUE INDEX "B36_execution_slot_key" ON "ActionExecution"("tenantId","ownerReportRunId","ownerReportSlotKey");
CREATE INDEX "B36_report_resume_idx" ON "OwnerReportRun"("tenantId","expiresAt");
CREATE INDEX "B36_report_payload_retention_idx" ON "OwnerReportRun"("payloadRetentionUntil");
CREATE INDEX "B36_report_audit_retention_idx" ON "OwnerReportRun"("auditRetentionUntil");
ALTER TABLE "OwnerReportRun" ADD CONSTRAINT "B36_report_tenant_fkey"
 FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ActionExecution" ADD CONSTRAINT "B36_execution_run_fkey"
 FOREIGN KEY ("ownerReportRunId","tenantId") REFERENCES "OwnerReportRun"("id","tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ActionExecution" ADD CONSTRAINT "B36_execution_binding_check" CHECK (
 ("ownerReportRunId" IS NULL AND "ownerReportSlotKey" IS NULL) OR
 ("ownerReportRunId" IS NOT NULL AND "ownerReportSlotKey" IS NOT NULL
  AND "ownerReportSlotKey" ~ '^[a-f0-9]{64}$'
  AND "capability" = 'communication.reports-briefings.execute.v1'
  AND "actionClass" = 'deliver_report_briefing')
);

CREATE FUNCTION "B36_report_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW."intentEncrypted" IS NULL OR length(NEW."intentEncrypted") = 0 THEN
   RAISE EXCEPTION 'B36 recoverable immutable plan required' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP = 'DELETE' THEN
  IF OLD."auditRetentionUntil" > clock_timestamp() THEN
   RAISE EXCEPTION 'B36 report identity retention' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF NEW."intentEncrypted" IS NULL AND OLD."intentEncrypted" IS NOT NULL
  AND OLD."payloadRetentionUntil" <= clock_timestamp()
  AND (to_jsonb(NEW) - 'intentEncrypted') = (to_jsonb(OLD) - 'intentEncrypted') THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'B36 immutable report identity/manifest' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "B36_report_immutable_guard" BEFORE INSERT OR UPDATE OR DELETE ON "OwnerReportRun"
 FOR EACH ROW EXECUTE FUNCTION "B36_report_immutable"();

CREATE FUNCTION "B36_execution_binding"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "OwnerReportRun"; root_xid xid;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF (NEW."ownerReportRunId",NEW."ownerReportSlotKey") IS DISTINCT FROM
     (OLD."ownerReportRunId",OLD."ownerReportSlotKey") THEN
   RAISE EXCEPTION 'B36 execution binding immutable; historical promotion forbidden' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP = 'DELETE' THEN
  IF OLD."ownerReportRunId" IS NOT NULL AND EXISTS (
   SELECT 1 FROM "OwnerReportRun" WHERE id=OLD."ownerReportRunId" AND "auditRetentionUntil">clock_timestamp()
  ) THEN RAISE EXCEPTION 'B36 durable execution retention' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF NEW."ownerReportRunId" IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO r FROM "OwnerReportRun" WHERE id=NEW."ownerReportRunId" AND "tenantId"=NEW."tenantId";
 SELECT xmin INTO root_xid FROM "OwnerReportRun" WHERE id=NEW."ownerReportRunId" AND "tenantId"=NEW."tenantId";
 -- New slots can only join the transaction that first inserts the immutable root.
 IF r.id IS NULL OR root_xid IS DISTINCT FROM pg_current_xact_id()::xid
  OR r."intentEncrypted" IS NULL OR NEW.state <> 'READY'
  OR NEW."intentExpiresAt" IS DISTINCT FROM r."expiresAt"
  OR NEW."dryRun" OR NEW."policyDecision" <> 'ALLOW' THEN
  RAISE EXCEPTION 'B36 atomic accepted report admission required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "B36_execution_binding_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ActionExecution"
 FOR EACH ROW EXECUTE FUNCTION "B36_execution_binding"();
COMMIT;
