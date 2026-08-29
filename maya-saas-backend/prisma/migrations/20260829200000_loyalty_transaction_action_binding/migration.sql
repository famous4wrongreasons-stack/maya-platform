-- Cycle 06 Blocking Package 4 schema-only loyalty foundation.
-- Historical ledger rows remain valid with a null binding. Multiple loyalty
-- entries may belong to one logical execution, but each established row-level
-- tenant-qualified ActionExecution binding is immutable.

ALTER TABLE "LoyaltyTransaction"
  ADD COLUMN "actionExecutionId" TEXT;

CREATE INDEX "LoyaltyTransaction_tenantId_actionExecutionId_idx"
  ON "LoyaltyTransaction"("tenantId", "actionExecutionId");

ALTER TABLE "LoyaltyTransaction"
  ADD CONSTRAINT "LoyaltyTransaction_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_loyalty_transaction_action_binding"()
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
    RAISE EXCEPTION 'LoyaltyTransaction ActionExecution binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LoyaltyTransaction_action_binding_guard"
BEFORE UPDATE OF "actionExecutionId", "tenantId" ON "LoyaltyTransaction"
FOR EACH ROW EXECUTE FUNCTION "guard_loyalty_transaction_action_binding"();
