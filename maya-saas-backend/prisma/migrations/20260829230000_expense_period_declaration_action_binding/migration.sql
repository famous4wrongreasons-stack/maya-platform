-- Cycle 06 Blocking Package 4 schema-only expense-period foundation.
-- Historical declarations remain valid with a null creation binding. Once a
-- declaration is bound, its tenant-qualified ActionExecution identity is
-- immutable. Later invalidation may delete the declaration row; the triggering
-- ActionExecution and audit remain the durable evidence, without a tombstone.

ALTER TABLE "ExpensePeriodDeclaration"
  ADD COLUMN "actionExecutionId" TEXT;

CREATE UNIQUE INDEX "ExpensePeriodDeclaration_actionExecutionId_tenantId_key"
  ON "ExpensePeriodDeclaration"("actionExecutionId", "tenantId");

ALTER TABLE "ExpensePeriodDeclaration"
  ADD CONSTRAINT "ExpensePeriodDeclaration_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_expense_period_declaration_action_binding"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD."actionExecutionId" IS NOT NULL
    AND (
      NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
      OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    )
  THEN
    RAISE EXCEPTION 'ExpensePeriodDeclaration ActionExecution binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ExpensePeriodDeclaration_action_binding_guard"
BEFORE UPDATE OF "actionExecutionId", "tenantId" ON "ExpensePeriodDeclaration"
FOR EACH ROW EXECUTE FUNCTION "guard_expense_period_declaration_action_binding"();
