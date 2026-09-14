-- Cycle 06 Blocking Package 4 P4-07 declaration re-assertion foundation.
-- A canonical period declaration is current only within one durable epoch.
-- Historical declarations remain nullable and no generation is backfilled.

ALTER TABLE "ExpensePeriodDeclaration"
  ADD COLUMN "declarationEpoch" INTEGER,
  ADD CONSTRAINT "ExpensePeriodDeclaration_epoch_check" CHECK (
    "declarationEpoch" IS NULL OR "declarationEpoch" >= 0
  );

CREATE TABLE "ExpensePeriodDeclarationInvalidation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "periodFromDay" TEXT NOT NULL,
  "periodToDay" TEXT NOT NULL,
  "invalidatedDeclarationId" TEXT NOT NULL,
  "invalidatedDeclarationActionExecutionId" TEXT NOT NULL,
  "invalidationActionExecutionId" TEXT NOT NULL,
  "previousDeclarationEpoch" INTEGER NOT NULL,
  "nextDeclarationEpoch" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExpensePeriodDeclarationInvalidation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExpensePeriodInvalidation_epoch_check" CHECK (
    "previousDeclarationEpoch" >= 0
    AND "nextDeclarationEpoch" = "previousDeclarationEpoch" + 1
  ),
  CONSTRAINT "ExpensePeriodInvalidation_reason_check" CHECK (
    "reasonCode" IN (
      'expense_ledger_changed:create',
      'expense_ledger_changed:delete'
    )
  ),
  CONSTRAINT "ExpensePeriodInvalidation_period_check" CHECK (
    "periodFromDay" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND "periodToDay" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND "periodFromDay" = to_char(to_date("periodFromDay", 'YYYY-MM-DD'), 'YYYY-MM-DD')
    AND "periodToDay" = to_char(to_date("periodToDay", 'YYYY-MM-DD'), 'YYYY-MM-DD')
    AND to_date("periodFromDay", 'YYYY-MM-DD') <= to_date("periodToDay", 'YYYY-MM-DD')
  )
);

CREATE UNIQUE INDEX "ExpensePeriodInvalidation_id_tenant_key"
  ON "ExpensePeriodDeclarationInvalidation"("id", "tenantId");

CREATE UNIQUE INDEX "ExpensePeriodInvalidation_decl_exec_key"
  ON "ExpensePeriodDeclarationInvalidation"(
    "tenantId",
    "invalidatedDeclarationActionExecutionId"
  );

CREATE UNIQUE INDEX "ExpensePeriodInvalidation_period_epoch_key"
  ON "ExpensePeriodDeclarationInvalidation"(
    "tenantId",
    "periodFromDay",
    "periodToDay",
    "nextDeclarationEpoch"
  );

CREATE UNIQUE INDEX "ExpensePeriodInvalidation_action_decl_key"
  ON "ExpensePeriodDeclarationInvalidation"(
    "tenantId",
    "invalidationActionExecutionId",
    "invalidatedDeclarationId"
  );

CREATE INDEX "ExpensePeriodInvalidation_period_epoch_idx"
  ON "ExpensePeriodDeclarationInvalidation"(
    "tenantId",
    "periodFromDay",
    "periodToDay",
    "nextDeclarationEpoch"
  );

ALTER TABLE "ExpensePeriodDeclarationInvalidation"
  ADD CONSTRAINT "ExpensePeriodInvalidation_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExpensePeriodInvalidation_decl_exec_fkey"
  FOREIGN KEY ("invalidatedDeclarationActionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ExpensePeriodInvalidation_action_exec_fkey"
  FOREIGN KEY ("invalidationActionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_expense_period_declaration_epoch"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_epoch INTEGER;
  execution_action_class TEXT;
  execution_state TEXT;
  execution_policy TEXT;
  execution_dry_run BOOLEAN;
  execution_target_kind TEXT;
  execution_target_ref TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD."declarationEpoch" IS NOT NULL
    AND (
      NEW."declarationEpoch" IS DISTINCT FROM OLD."declarationEpoch"
      OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
      OR NEW."periodFromDay" IS DISTINCT FROM OLD."periodFromDay"
      OR NEW."periodToDay" IS DISTINCT FROM OLD."periodToDay"
      OR NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    )
  THEN
    RAISE EXCEPTION 'Established ExpensePeriodDeclaration epoch binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."declarationEpoch" IS NULL THEN
    IF (
      TG_OP = 'INSERT'
      AND NEW."actionExecutionId" IS NOT NULL
    ) OR (
      TG_OP = 'UPDATE'
      AND OLD."actionExecutionId" IS NULL
      AND NEW."actionExecutionId" IS NOT NULL
    )
    THEN
      RAISE EXCEPTION 'New canonical ExpensePeriodDeclaration requires declarationEpoch'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."tenantId" || ':expense-ledger', 0)
  );

  SELECT COALESCE(MAX("nextDeclarationEpoch"), 0)
  INTO expected_epoch
  FROM "ExpensePeriodDeclarationInvalidation"
  WHERE "tenantId" = NEW."tenantId"
    AND "periodFromDay" = NEW."periodFromDay"
    AND "periodToDay" = NEW."periodToDay";

  IF NEW."declarationEpoch" IS DISTINCT FROM expected_epoch THEN
    RAISE EXCEPTION 'ExpensePeriodDeclaration epoch is stale or forged'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."actionExecutionId" IS NULL THEN
    RAISE EXCEPTION 'Canonical ExpensePeriodDeclaration requires ActionExecution binding'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    "actionClass",
    "state"::TEXT,
    "policyDecision"::TEXT,
    "dryRun",
    "targetKind",
    "targetRef"
  INTO
    execution_action_class,
    execution_state,
    execution_policy,
    execution_dry_run,
    execution_target_kind,
    execution_target_ref
  FROM "ActionExecution"
  WHERE "id" = NEW."actionExecutionId"
    AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR execution_action_class <> 'declare_expense_period_complete'
    OR execution_state NOT IN ('EXECUTING', 'SUCCEEDED')
    OR execution_policy <> 'ALLOW'
    OR execution_dry_run
    OR execution_target_kind <> 'expense_period'
    OR execution_target_ref <> (
      'expense-period:' || NEW."periodFromDay" || ':' || NEW."periodToDay"
    )
  THEN
    RAISE EXCEPTION 'ExpensePeriodDeclaration epoch requires its exact canonical execution'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ExpensePeriodDeclarationInvalidation"
    WHERE "tenantId" = NEW."tenantId"
      AND "invalidatedDeclarationActionExecutionId" = NEW."actionExecutionId"
  )
  THEN
    RAISE EXCEPTION 'Invalidated declaration execution cannot be rebound to a later epoch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ExpensePeriodDeclaration_epoch_insert_guard"
BEFORE INSERT ON "ExpensePeriodDeclaration"
FOR EACH ROW EXECUTE FUNCTION "guard_expense_period_declaration_epoch"();

CREATE TRIGGER "ExpensePeriodDeclaration_epoch_update_guard"
BEFORE UPDATE OF
  "declarationEpoch",
  "tenantId",
  "periodFromDay",
  "periodToDay",
  "actionExecutionId"
ON "ExpensePeriodDeclaration"
FOR EACH ROW EXECUTE FUNCTION "guard_expense_period_declaration_epoch"();

CREATE FUNCTION "claim_expense_period_declaration_invalidation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  current_declaration "ExpensePeriodDeclaration"%ROWTYPE;
  expected_previous_epoch INTEGER;
  declaration_execution_action TEXT;
  declaration_execution_state TEXT;
  invalidation_execution_action TEXT;
  invalidation_execution_state TEXT;
  invalidation_execution_policy TEXT;
  invalidation_execution_dry_run BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."tenantId" || ':expense-ledger', 0)
  );

  SELECT *
  INTO current_declaration
  FROM "ExpensePeriodDeclaration"
  WHERE "id" = NEW."invalidatedDeclarationId"
    AND "tenantId" = NEW."tenantId"
    AND "periodFromDay" = NEW."periodFromDay"
    AND "periodToDay" = NEW."periodToDay"
  FOR UPDATE;

  IF NOT FOUND
    OR current_declaration."declarationEpoch" IS NULL
    OR current_declaration."actionExecutionId" IS NULL
    OR current_declaration."actionExecutionId" IS DISTINCT FROM
      NEW."invalidatedDeclarationActionExecutionId"
    OR current_declaration."declarationEpoch" IS DISTINCT FROM
      NEW."previousDeclarationEpoch"
  THEN
    RAISE EXCEPTION 'Invalidation must claim one exact canonical current declaration'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(MAX("nextDeclarationEpoch"), 0)
  INTO expected_previous_epoch
  FROM "ExpensePeriodDeclarationInvalidation"
  WHERE "tenantId" = NEW."tenantId"
    AND "periodFromDay" = NEW."periodFromDay"
    AND "periodToDay" = NEW."periodToDay";

  IF NEW."previousDeclarationEpoch" IS DISTINCT FROM expected_previous_epoch
    OR NEW."nextDeclarationEpoch" IS DISTINCT FROM expected_previous_epoch + 1
  THEN
    RAISE EXCEPTION 'ExpensePeriodDeclaration invalidation generation is non-contiguous'
      USING ERRCODE = '23514';
  END IF;

  SELECT "actionClass", "state"::TEXT
  INTO declaration_execution_action, declaration_execution_state
  FROM "ActionExecution"
  WHERE "id" = NEW."invalidatedDeclarationActionExecutionId"
    AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR declaration_execution_action <> 'declare_expense_period_complete'
    OR declaration_execution_state <> 'SUCCEEDED'
  THEN
    RAISE EXCEPTION 'Invalidated declaration execution is not canonical and terminal'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    "actionClass",
    "state"::TEXT,
    "policyDecision"::TEXT,
    "dryRun"
  INTO
    invalidation_execution_action,
    invalidation_execution_state,
    invalidation_execution_policy,
    invalidation_execution_dry_run
  FROM "ActionExecution"
  WHERE "id" = NEW."invalidationActionExecutionId"
    AND "tenantId" = NEW."tenantId"
  FOR KEY SHARE;

  IF NOT FOUND
    OR invalidation_execution_action NOT IN ('create_expense', 'delete_expense')
    OR invalidation_execution_state NOT IN ('EXECUTING', 'SUCCEEDED')
    OR invalidation_execution_policy <> 'ALLOW'
    OR invalidation_execution_dry_run
    OR NEW."reasonCode" <> (
      CASE invalidation_execution_action
        WHEN 'create_expense' THEN 'expense_ledger_changed:create'
        WHEN 'delete_expense' THEN 'expense_ledger_changed:delete'
      END
    )
  THEN
    RAISE EXCEPTION 'Invalidation requires the exact canonical expense mutation execution'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ExpensePeriodInvalidation_claim_guard"
BEFORE INSERT ON "ExpensePeriodDeclarationInvalidation"
FOR EACH ROW EXECUTE FUNCTION "claim_expense_period_declaration_invalidation"();

CREATE FUNCTION "guard_expense_period_invalidation_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'ExpensePeriodDeclarationInvalidation is append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "ExpensePeriodInvalidation_append_only_guard"
BEFORE UPDATE OR DELETE ON "ExpensePeriodDeclarationInvalidation"
FOR EACH ROW EXECUTE FUNCTION "guard_expense_period_invalidation_append_only"();

CREATE FUNCTION "require_expense_period_invalidation_before_delete"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD."declarationEpoch" IS NULL THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "ExpensePeriodDeclarationInvalidation"
    WHERE "tenantId" = OLD."tenantId"
      AND "periodFromDay" = OLD."periodFromDay"
      AND "periodToDay" = OLD."periodToDay"
      AND "invalidatedDeclarationId" = OLD."id"
      AND "invalidatedDeclarationActionExecutionId" = OLD."actionExecutionId"
      AND "previousDeclarationEpoch" = OLD."declarationEpoch"
      AND "nextDeclarationEpoch" = OLD."declarationEpoch" + 1
  )
  THEN
    RAISE EXCEPTION 'Canonical ExpensePeriodDeclaration delete requires durable invalidation'
      USING ERRCODE = '23514';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER "ExpensePeriodDeclaration_invalidation_delete_guard"
BEFORE DELETE ON "ExpensePeriodDeclaration"
FOR EACH ROW EXECUTE FUNCTION "require_expense_period_invalidation_before_delete"();

CREATE FUNCTION "require_expense_period_invalidation_consumed"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ExpensePeriodDeclaration"
    WHERE "id" = NEW."invalidatedDeclarationId"
      AND "tenantId" = NEW."tenantId"
  )
  THEN
    RAISE EXCEPTION 'ExpensePeriodDeclarationInvalidation must atomically remove its declaration'
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "ExpensePeriodInvalidation_consumed_guard"
AFTER INSERT ON "ExpensePeriodDeclarationInvalidation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "require_expense_period_invalidation_consumed"();
