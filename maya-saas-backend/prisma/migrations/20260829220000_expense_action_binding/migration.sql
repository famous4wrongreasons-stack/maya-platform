-- Cycle 06 Blocking Package 4 schema-only expense foundation.
-- Historical expense rows remain valid with a null creation binding. Once an
-- expense is bound, its tenant-qualified ActionExecution identity is immutable.

ALTER TABLE "Expense"
  ADD COLUMN "actionExecutionId" TEXT;

CREATE UNIQUE INDEX "Expense_actionExecutionId_tenantId_key"
  ON "Expense"("actionExecutionId", "tenantId");

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_expense_action_binding"()
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
    RAISE EXCEPTION 'Expense ActionExecution binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Expense_action_binding_guard"
BEFORE UPDATE OF "actionExecutionId", "tenantId" ON "Expense"
FOR EACH ROW EXECUTE FUNCTION "guard_expense_action_binding"();
