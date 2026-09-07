BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Approved Wave R-C Option A. Prospective only; no historical backfill.
CREATE TABLE "CashDeclaration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "businessDay" CHAR(10) NOT NULL,
    "timezone" TEXT NOT NULL,
    "countedAt" TIMESTAMPTZ(3) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "countedCashKopecks" INTEGER,
    "declarationKind" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousDeclarationId" TEXT,
    "actionExecutionId" TEXT NOT NULL,
    "declaredByUserId" TEXT NOT NULL,
    "declaredByMembershipId" TEXT NOT NULL,
    "contractVersion" INTEGER NOT NULL,
    "intentHash" CHAR(64) NOT NULL,
    "encryptedReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CashDeclaration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "R14_CashDeclaration_tenant_uq" ON "CashDeclaration"("id", "tenantId");

CREATE UNIQUE INDEX "R14_cash_version_uq" ON "CashDeclaration"("tenantId", "branchId", "businessDay", "revision");

CREATE UNIQUE INDEX "R14_cash_execution_uq" ON "CashDeclaration"("tenantId", "actionExecutionId");

ALTER TABLE "CashDeclaration" ADD CONSTRAINT "R14_CashDeclaration_tenant_fk" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "CashDeclaration" ADD CONSTRAINT "R14_cash_branch_fk" FOREIGN KEY ("branchId", "tenantId") REFERENCES "Branch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "CashDeclaration" ADD CONSTRAINT "R14_cash_member_fk" FOREIGN KEY ("declaredByMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "CashDeclaration" ADD CONSTRAINT "R14_cash_execution_fk" FOREIGN KEY ("actionExecutionId", "tenantId") REFERENCES "ActionExecution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "CashDeclaration" ADD CONSTRAINT "R14_cash_previous_fk" FOREIGN KEY ("previousDeclarationId", "tenantId") REFERENCES "CashDeclaration"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "CashDeclaration" ADD CONSTRAINT "R14_cash_contract_check" CHECK (
 "contractVersion"=1 AND currency='RUB' AND revision>0 AND "intentHash" ~ '^[a-f0-9]{64}$'
 AND "businessDay" ~ '^\d{4}-\d{2}-\d{2}$' AND "countedAt" <= "createdAt"
 AND to_char("countedAt" AT TIME ZONE timezone,'YYYY-MM-DD')="businessDay"
 AND (("declarationKind"='COUNT' AND "countedCashKopecks" IS NOT NULL AND "countedCashKopecks" BETWEEN 0 AND 1000000000)
  OR ("declarationKind"='WITHDRAWAL' AND "countedCashKopecks" IS NULL))
 AND ((revision=1 AND "previousDeclarationId" IS NULL AND "declarationKind"='COUNT') OR (revision>1 AND "previousDeclarationId" IS NOT NULL))
);
CREATE FUNCTION "R14_cash_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous "CashDeclaration"%ROWTYPE; class text;
BEGIN
 IF TG_OP='INSERT' THEN
  class=CASE WHEN NEW.revision=1 THEN 'declare_cash_position' ELSE 'correct_cash_position' END;
  IF NEW."countedAt">clock_timestamp() OR (NEW.revision>1 AND (NEW."encryptedReason" IS NULL OR length(NEW."encryptedReason")=0)) OR NOT EXISTS (
   SELECT 1 FROM "Membership" m JOIN "User" u ON u.id=m."userId" JOIN "ActionExecution" e ON e.id=NEW."actionExecutionId" AND e."tenantId"=NEW."tenantId"
   WHERE m.id=NEW."declaredByMembershipId" AND m."tenantId"=NEW."tenantId" AND m."userId"=NEW."declaredByUserId"
    AND m.status='active' AND u.status='active' AND m.role IN ('tenant_owner','business_owner','accountant')
    AND (m."branchId" IS NULL OR m."branchId"=NEW."branchId")
    AND e."actorUserId"=NEW."declaredByUserId" AND e."actionClass"=class AND e.state='EXECUTING' AND NOT e."dryRun" AND e."policyDecision"='ALLOW') THEN
   RAISE EXCEPTION 'R14 exact admitted declaration actor/observation required' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('r14/'||NEW."tenantId"||'/'||NEW."branchId"||'/'||NEW."businessDay",0));
  SELECT * INTO previous FROM "CashDeclaration" WHERE "tenantId"=NEW."tenantId" AND "branchId"=NEW."branchId" AND "businessDay"=NEW."businessDay" ORDER BY revision DESC LIMIT 1;
  IF (previous.id IS NULL AND (NEW.revision<>1 OR NEW."previousDeclarationId" IS NOT NULL)) OR
    (previous.id IS NOT NULL AND (NEW."previousDeclarationId" IS DISTINCT FROM previous.id OR NEW.revision<>previous.revision+1)) THEN
   RAISE EXCEPTION 'R14 stale exact branch/day predecessor' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD."encryptedReason" IS NOT NULL AND NEW."encryptedReason" IS NULL
  AND (to_jsonb(NEW)-'encryptedReason')=(to_jsonb(OLD)-'encryptedReason')
  AND "RC_payload_claim"(OLD."tenantId",'CashDeclaration',OLD.id,OLD."intentHash",OLD."createdAt"+interval '7 years','purge_cash_declaration_reason_payloads','package5.r14.cash-declaration-retention')
  AND "RC_execution_set_resolved"(OLD."tenantId",ARRAY[OLD."actionExecutionId"])
 THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'R14 immutable cash history / exact scoped reason claim required' USING ERRCODE='23514';
END $$;
CREATE TRIGGER "R14_cash_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CashDeclaration" FOR EACH ROW EXECUTE FUNCTION "R14_cash_guard"();
CREATE CONSTRAINT TRIGGER "R14_cash_receipt" AFTER INSERT ON "CashDeclaration" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "RC_confirmed_owner_receipt"('actionExecutionId');

ALTER TABLE "ActionExecution" ADD CONSTRAINT "RC_one_delivery_owner_check" CHECK (num_nonnulls("ownerReportRunId","operationalAlertRunId","nativeFeedbackRequestId","teamMessageId","expenseReminderRunId")<=1);

COMMIT;
