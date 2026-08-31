-- Cycle 06 Blocking Package 4 P4-03 client-owned loyalty-account foundation.
-- This migration only makes tenant-qualified Client ownership representable.
-- It does not bind historical rows, create accounts, or move loyalty value.

ALTER TABLE "LoyaltyAccount"
  ADD COLUMN "clientId" TEXT,
  ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX "LoyaltyAccount_tenantId_clientId_key"
  ON "LoyaltyAccount"("tenantId", "clientId");

ALTER TABLE "LoyaltyAccount"
  DROP CONSTRAINT "LoyaltyAccount_userId_fkey",
  DROP CONSTRAINT "LoyaltyAccount_userId_tenantId_fkey",
  ADD CONSTRAINT "LoyaltyAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LoyaltyAccount_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId")
  REFERENCES "Membership"("userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "LoyaltyAccount_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_loyalty_account_client_binding"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD."clientId" IS NOT NULL
    AND (
      NEW."clientId" IS DISTINCT FROM OLD."clientId"
      OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    )
  THEN
    RAISE EXCEPTION 'LoyaltyAccount Client binding is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LoyaltyAccount_client_binding_guard"
BEFORE UPDATE ON "LoyaltyAccount"
FOR EACH ROW EXECUTE FUNCTION "guard_loyalty_account_client_binding"();
