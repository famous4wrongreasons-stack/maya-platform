-- Cycle 06 Blocking Package 4 schema-only foundation.
-- Historical billing rows remain valid with a null binding. Once a billing
-- payment is bound, the tenant-qualified ActionExecution identity is immutable.

ALTER TABLE "BillingPayment"
  ADD COLUMN "actionExecutionId" TEXT;

CREATE UNIQUE INDEX "BillingPayment_actionExecutionId_tenantId_key"
  ON "BillingPayment"("actionExecutionId", "tenantId");

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_billing_payment_action_binding"()
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
    RAISE EXCEPTION 'BillingPayment ActionExecution binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "BillingPayment_action_binding_guard"
BEFORE UPDATE OF "actionExecutionId", "tenantId" ON "BillingPayment"
FOR EACH ROW EXECUTE FUNCTION "guard_billing_payment_action_binding"();
