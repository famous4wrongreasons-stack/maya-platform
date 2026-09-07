BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
ALTER TABLE "ActionExecution" ADD COLUMN "expenseReminderRunId" TEXT;

ALTER TABLE "ActionExecution" ADD COLUMN "expenseReminderSlotKey" TEXT;

CREATE TABLE "ExpenseReminderRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reminderType" TEXT NOT NULL,
    "periodStartLocalDate" CHAR(10) NOT NULL,
    "periodEndLocalDate" CHAR(10) NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "intentEncrypted" TEXT,
    "admittedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "payloadRetentionUntil" TIMESTAMPTZ(3) NOT NULL,
    "auditRetentionUntil" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExpenseReminderRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseIntakeBinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "authIdentityId" TEXT NOT NULL,
    "sourceNamespace" TEXT NOT NULL,
    "sourceEventHash" CHAR(64) NOT NULL,
    "itemIndex" INTEGER NOT NULL,
    "sourceItemCount" INTEGER NOT NULL,
    "sourceContentHash" CHAR(64) NOT NULL,
    "reminderRunId" TEXT,
    "reminderSlotKey" TEXT,
    "approvalRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "auditRetentionUntil" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExpenseIntakeBinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "R13_reminder_resume_idx" ON "ExpenseReminderRun"("tenantId", "expiresAt");

CREATE INDEX "R13_reminder_retention_idx" ON "ExpenseReminderRun"("payloadRetentionUntil");

CREATE UNIQUE INDEX "R13_ExpenseReminderRun_tenant_uq" ON "ExpenseReminderRun"("id", "tenantId");

CREATE UNIQUE INDEX "R13_reminder_identity_uq" ON "ExpenseReminderRun"("tenantId", "reminderType", "periodStartLocalDate", "periodEndLocalDate");

CREATE UNIQUE INDEX "R13_ExpenseIntakeBinding_tenant_uq" ON "ExpenseIntakeBinding"("id", "tenantId");

CREATE UNIQUE INDEX "R13_intake_source_uq" ON "ExpenseIntakeBinding"("tenantId", "sourceNamespace", "sourceEventHash", "itemIndex");

CREATE UNIQUE INDEX "R13_intake_approval_uq" ON "ExpenseIntakeBinding"("tenantId", "approvalRequestId");

CREATE UNIQUE INDEX "R13_execution_slot_uq" ON "ActionExecution"("tenantId", "expenseReminderRunId", "expenseReminderSlotKey");

ALTER TABLE "ActionExecution" ADD CONSTRAINT "R13_execution_reminder_fk" FOREIGN KEY ("expenseReminderRunId", "tenantId") REFERENCES "ExpenseReminderRun"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ExpenseReminderRun" ADD CONSTRAINT "R13_ExpenseReminderRun_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ExpenseIntakeBinding" ADD CONSTRAINT "R13_ExpenseIntakeBinding_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ExpenseIntakeBinding" ADD CONSTRAINT "R13_intake_member_fk" FOREIGN KEY ("actorMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ExpenseIntakeBinding" ADD CONSTRAINT "R13_intake_identity_fk" FOREIGN KEY ("authIdentityId", "tenantId") REFERENCES "AuthIdentity"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ExpenseIntakeBinding" ADD CONSTRAINT "R13_intake_approval_fk" FOREIGN KEY ("approvalRequestId", "tenantId") REFERENCES "AiApprovalRequest"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ExpenseIntakeBinding" ADD CONSTRAINT "R13_intake_slot_fk" FOREIGN KEY ("tenantId", "reminderRunId", "reminderSlotKey") REFERENCES "ActionExecution"("tenantId", "expenseReminderRunId", "expenseReminderSlotKey") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ExpenseReminderRun" ADD CONSTRAINT "R13_reminder_contract_check" CHECK (
 "reminderType"='weekly_expense_reminder' AND "contractVersion"=1 AND "intentHash" ~ '^[a-f0-9]{64}$'
 AND "periodStartLocalDate" ~ '^\d{4}-\d{2}-\d{2}$' AND "periodEndLocalDate" ~ '^\d{4}-\d{2}-\d{2}$'
 AND extract(isodow FROM "periodStartLocalDate"::date)=1 AND "periodEndLocalDate"::date="periodStartLocalDate"::date+6
 AND "expiresAt"=(("periodEndLocalDate"::date+8)::timestamp AT TIME ZONE timezone)
 AND "admittedAt"<"expiresAt" AND "payloadRetentionUntil"="expiresAt" AND "auditRetentionUntil"="admittedAt"+interval '7 years'
);
ALTER TABLE "ExpenseIntakeBinding" ADD CONSTRAINT "R13_intake_contract_check" CHECK (
 "sourceEventHash" ~ '^[a-f0-9]{64}$' AND "sourceContentHash" ~ '^[a-f0-9]{64}$'
 AND length(btrim("sourceNamespace"))>0 AND "sourceItemCount" BETWEEN 1 AND 10 AND "itemIndex">=0 AND "itemIndex"<"sourceItemCount"
 AND (("reminderRunId" IS NULL AND "reminderSlotKey" IS NULL) OR ("reminderRunId" IS NOT NULL AND "reminderSlotKey" IS NOT NULL AND "reminderSlotKey" ~ '^[a-f0-9]{64}$'))
 AND "auditRetentionUntil"="createdAt"+interval '7 years'
);
ALTER TABLE "ActionExecution" ADD CONSTRAINT "R13_execution_binding_check" CHECK (
 ("expenseReminderRunId" IS NULL AND "expenseReminderSlotKey" IS NULL) OR
 ("expenseReminderRunId" IS NOT NULL AND "expenseReminderSlotKey" IS NOT NULL AND "expenseReminderSlotKey" ~ '^[a-f0-9]{64}$'
  AND capability='communication.business-alerts.execute.v1' AND "actionClass"='deliver_business_alert')
);
CREATE FUNCTION "R13_reminder_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW."intentEncrypted" IS NOT NULL AND length(NEW."intentEncrypted")>0 THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD."intentEncrypted" IS NOT NULL AND NEW."intentEncrypted" IS NULL
  AND (to_jsonb(NEW)-'intentEncrypted')=(to_jsonb(OLD)-'intentEncrypted')
  AND "RC_payload_claim"(OLD."tenantId",'ExpenseReminderRun',OLD.id,OLD."intentHash",OLD."payloadRetentionUntil",'purge_expense_reminder_payloads','package5.r13.expense-reminder-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY(SELECT id FROM "ActionExecution" WHERE "tenantId"=OLD."tenantId" AND "expenseReminderRunId"=OLD.id))
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'R13 immutable weekly intent / exact scoped payload claim required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "R13_reminder_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseReminderRun" FOR EACH ROW EXECUTE FUNCTION "R13_reminder_guard"();
CREATE FUNCTION "R13_execution_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root "ExpenseReminderRun"%ROWTYPE; root_xid xid;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD."expenseReminderRunId" IS NOT NULL THEN RAISE EXCEPTION 'R13 slot tombstone retained' USING ERRCODE='23514'; END IF; RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW."expenseReminderRunId" IS DISTINCT FROM OLD."expenseReminderRunId" OR NEW."expenseReminderSlotKey" IS DISTINCT FROM OLD."expenseReminderSlotKey" THEN
   RAISE EXCEPTION 'R13 immutable slot binding' USING ERRCODE='23514';
  END IF; RETURN NEW;
 END IF;
 IF NEW."expenseReminderRunId" IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO root FROM "ExpenseReminderRun" WHERE id=NEW."expenseReminderRunId" AND "tenantId"=NEW."tenantId";
 SELECT xmin INTO root_xid FROM "ExpenseReminderRun" WHERE id=root.id;
 IF root.id IS NULL OR root_xid<>pg_current_xact_id()::xid OR root."intentEncrypted" IS NULL OR NEW.state<>'READY'
  OR NEW."policyDecision"<>'ALLOW' OR NEW."dryRun" OR NEW."intentExpiresAt" IS DISTINCT FROM (root."expiresAt" AT TIME ZONE 'UTC') THEN
  RAISE EXCEPTION 'R13 complete same-transaction weekly admission required' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER "R13_execution_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ActionExecution" FOR EACH ROW EXECUTE FUNCTION "R13_execution_guard"();
CREATE FUNCTION "R13_intake_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior "ExpenseIntakeBinding"%ROWTYPE; prior_xid xid; approval_xid xid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'R13 source binding is immutable' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('r13-intake/'||NEW."tenantId"||'/'||NEW."sourceNamespace"||'/'||NEW."sourceEventHash",0));
 SELECT * INTO prior FROM "ExpenseIntakeBinding" WHERE "tenantId"=NEW."tenantId" AND "sourceNamespace"=NEW."sourceNamespace" AND "sourceEventHash"=NEW."sourceEventHash" LIMIT 1;
 IF prior.id IS NOT NULL THEN
  SELECT xmin INTO prior_xid FROM "ExpenseIntakeBinding" WHERE id=prior.id;
  IF prior_xid<>pg_current_xact_id()::xid OR
   (to_jsonb(prior)-ARRAY['id','itemIndex','approvalRequestId'])<>(to_jsonb(NEW)-ARRAY['id','itemIndex','approvalRequestId']) THEN
   RAISE EXCEPTION 'R13 no late append / conflicting source bundle' USING ERRCODE='23514';
  END IF;
 END IF;
 SELECT xmin INTO approval_xid FROM "AiApprovalRequest" WHERE id=NEW."approvalRequestId" AND "tenantId"=NEW."tenantId";
 IF approval_xid IS NULL OR approval_xid<>pg_current_xact_id()::xid OR NOT EXISTS (
  SELECT 1 FROM "Membership" m JOIN "User" u ON u.id=m."userId"
   JOIN "AuthIdentity" a ON a.id=NEW."authIdentityId" AND a."tenantId"=m."tenantId" AND a."userId"=m."userId" AND a.provider='telegram'
   JOIN "AiApprovalRequest" q ON q.id=NEW."approvalRequestId" AND q."tenantId"=m."tenantId" AND q."requestedByUserId"=m."userId"
  WHERE m.id=NEW."actorMembershipId" AND m."tenantId"=NEW."tenantId" AND m."userId"=NEW."actorUserId"
   AND m.status='active' AND u.status='active' AND m.role IN ('tenant_owner','business_owner')
   AND q."toolName"='expenses.create' AND q.status='pending' AND q."encryptedArguments" IS NOT NULL
   AND q."expiresAt"=q."createdAt"+interval '10 minutes') THEN
  RAISE EXCEPTION 'R13 exact source principal and atomic existing approval required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "R13_intake_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseIntakeBinding" FOR EACH ROW EXECUTE FUNCTION "R13_intake_guard"();
CREATE FUNCTION "R13_intake_complete"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; lo integer; hi integer;
BEGIN
 SELECT count(*),min("itemIndex"),max("itemIndex") INTO n,lo,hi FROM "ExpenseIntakeBinding"
  WHERE "tenantId"=NEW."tenantId" AND "sourceNamespace"=NEW."sourceNamespace" AND "sourceEventHash"=NEW."sourceEventHash";
 IF n<>NEW."sourceItemCount" OR lo<>0 OR hi<>n-1 THEN RAISE EXCEPTION 'R13 full frozen card bundle required' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "R13_intake_complete" AFTER INSERT ON "ExpenseIntakeBinding" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "R13_intake_complete"();

COMMIT;
