-- Cycle 06 Blocking Package 4 P4-03 grant-revocation schema foundation.
-- Revocation is one append-only, execution-bound terminal fact. Existing
-- grants/redemptions are not backfilled or rewritten.

CREATE TABLE "LoyaltyRedemptionGrantRevocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "actionExecutionId" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoyaltyRedemptionGrantRevocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoyaltyRedemptionGrantRevocation_reason_check" CHECK (
    "reasonCode" IN (
      'client_request',
      'owner_or_admin_request',
      'service_withdrawn',
      'suspected_compromise',
      'policy_invalidated'
    )
  )
);

CREATE UNIQUE INDEX "LoyaltyRedemptionGrantRevocation_id_tenantId_key"
  ON "LoyaltyRedemptionGrantRevocation"("id", "tenantId");

CREATE UNIQUE INDEX "LoyaltyRedemptionGrantRevocation_grantId_tenantId_key"
  ON "LoyaltyRedemptionGrantRevocation"("grantId", "tenantId");

CREATE UNIQUE INDEX "LoyaltyRedemptionGrantRevocation_actionExecutionId_tenantId_key"
  ON "LoyaltyRedemptionGrantRevocation"("actionExecutionId", "tenantId");

CREATE INDEX "LoyaltyRedemptionGrantRevocation_tenantId_revokedAt_idx"
  ON "LoyaltyRedemptionGrantRevocation"("tenantId", "revokedAt");

ALTER TABLE "LoyaltyRedemptionGrantRevocation"
  ADD CONSTRAINT "LoyaltyRedemptionGrantRevocation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LoyaltyRedemptionGrantRevocation_grantId_tenantId_fkey"
  FOREIGN KEY ("grantId", "tenantId")
  REFERENCES "LoyaltyRedemptionGrant"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "LoyaltyGrantRevocation_execution_tenant_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_loyalty_redemption_grant_revocation_append_only"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'LoyaltyRedemptionGrantRevocation is append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "LoyaltyRedemptionGrantRevocation_append_only_guard"
BEFORE UPDATE OR DELETE ON "LoyaltyRedemptionGrantRevocation"
FOR EACH ROW EXECUTE FUNCTION "guard_loyalty_redemption_grant_revocation_append_only"();

CREATE FUNCTION "claim_active_loyalty_redemption_grant_revocation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  grant_issued_at TIMESTAMP(3);
  grant_expires_at TIMESTAMP(3);
BEGIN
  SELECT "issuedAt", "expiresAt"
  INTO grant_issued_at, grant_expires_at
  FROM "LoyaltyRedemptionGrant"
  WHERE "id" = NEW."grantId"
    AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  -- Let the tenant-qualified FK produce the canonical missing/cross-tenant
  -- rejection when the grant is not visible in this tenant.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF CURRENT_TIMESTAMP >= grant_expires_at
    OR NEW."revokedAt" < grant_issued_at
    OR NEW."revokedAt" >= grant_expires_at
  THEN
    RAISE EXCEPTION 'LoyaltyRedemptionGrantRevocation requires an active grant'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LoyaltyRedemption"
    WHERE "grantId" = NEW."grantId"
      AND "tenantId" = NEW."tenantId"
  )
  THEN
    RAISE EXCEPTION 'Consumed LoyaltyRedemptionGrant cannot be revoked'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LoyaltyRedemptionGrantRevocation_active_claim_guard"
BEFORE INSERT ON "LoyaltyRedemptionGrantRevocation"
FOR EACH ROW EXECUTE FUNCTION "claim_active_loyalty_redemption_grant_revocation"();

CREATE FUNCTION "claim_non_revoked_loyalty_redemption"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  grant_issued_at TIMESTAMP(3);
  grant_expires_at TIMESTAMP(3);
BEGIN
  SELECT "issuedAt", "expiresAt"
  INTO grant_issued_at, grant_expires_at
  FROM "LoyaltyRedemptionGrant"
  WHERE "id" = NEW."grantId"
    AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  -- Let the tenant-qualified FK produce the canonical missing/cross-tenant
  -- rejection when the grant is not visible in this tenant.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW."redeemedAt" < grant_issued_at
    OR NEW."redeemedAt" >= grant_expires_at
    OR (
      NEW."actionExecutionId" IS NOT NULL
      AND CURRENT_TIMESTAMP >= grant_expires_at
    )
  THEN
    RAISE EXCEPTION 'LoyaltyRedemption requires an unexpired grant'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "LoyaltyRedemptionGrantRevocation"
    WHERE "grantId" = NEW."grantId"
      AND "tenantId" = NEW."tenantId"
  )
  THEN
    RAISE EXCEPTION 'Revoked LoyaltyRedemptionGrant cannot be consumed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LoyaltyRedemption_non_revoked_claim_guard"
BEFORE INSERT ON "LoyaltyRedemption"
FOR EACH ROW EXECUTE FUNCTION "claim_non_revoked_loyalty_redemption"();
