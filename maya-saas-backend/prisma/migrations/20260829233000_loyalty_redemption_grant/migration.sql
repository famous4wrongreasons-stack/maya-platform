-- Cycle 06 Blocking Package 4 schema-only loyalty redemption foundation.
-- Issuance and redemption are distinct logical actions. Legacy Python rows are
-- not backfilled; safely correlated historical rows may retain null execution
-- bindings. Bearer codes are stored only as server-derived hashes.

CREATE TABLE "LoyaltyRedemptionGrant" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "issueExecutionId" TEXT,
  "clientId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "serviceRef" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoyaltyRedemptionGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoyaltyRedemptionGrant_value_shape_check" CHECK (
    btrim("codeHash") <> ''
    AND btrim("serviceRef") <> ''
    AND "points" > 0
    AND "expiresAt" > "issuedAt"
    AND ("legacySourceRef" IS NULL OR btrim("legacySourceRef") <> '')
  )
);

CREATE TABLE "LoyaltyRedemption" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "grantId" TEXT NOT NULL,
  "actionExecutionId" TEXT,
  "redeemedAt" TIMESTAMP(3) NOT NULL,
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LoyaltyRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LoyaltyRedemption_legacy_source_check" CHECK (
    "legacySourceRef" IS NULL OR btrim("legacySourceRef") <> ''
  )
);

CREATE UNIQUE INDEX "LoyaltyRedemptionGrant_id_tenantId_key"
  ON "LoyaltyRedemptionGrant"("id", "tenantId");

CREATE UNIQUE INDEX "LoyaltyRedemptionGrant_tenantId_codeHash_key"
  ON "LoyaltyRedemptionGrant"("tenantId", "codeHash");

CREATE UNIQUE INDEX "LoyaltyRedemptionGrant_issueExecutionId_tenantId_key"
  ON "LoyaltyRedemptionGrant"("issueExecutionId", "tenantId");

CREATE UNIQUE INDEX "LoyaltyRedemptionGrant_tenantId_legacySourceRef_key"
  ON "LoyaltyRedemptionGrant"("tenantId", "legacySourceRef");

CREATE INDEX "LoyaltyRedemptionGrant_tenantId_clientId_expiresAt_idx"
  ON "LoyaltyRedemptionGrant"("tenantId", "clientId", "expiresAt");

CREATE UNIQUE INDEX "LoyaltyRedemption_id_tenantId_key"
  ON "LoyaltyRedemption"("id", "tenantId");

CREATE UNIQUE INDEX "LoyaltyRedemption_grantId_tenantId_key"
  ON "LoyaltyRedemption"("grantId", "tenantId");

CREATE UNIQUE INDEX "LoyaltyRedemption_actionExecutionId_tenantId_key"
  ON "LoyaltyRedemption"("actionExecutionId", "tenantId");

CREATE UNIQUE INDEX "LoyaltyRedemption_tenantId_legacySourceRef_key"
  ON "LoyaltyRedemption"("tenantId", "legacySourceRef");

CREATE INDEX "LoyaltyRedemption_tenantId_redeemedAt_idx"
  ON "LoyaltyRedemption"("tenantId", "redeemedAt");

ALTER TABLE "LoyaltyRedemptionGrant"
  ADD CONSTRAINT "LoyaltyRedemptionGrant_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LoyaltyRedemptionGrant_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "LoyaltyRedemptionGrant_issueExecutionId_tenantId_fkey"
  FOREIGN KEY ("issueExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "LoyaltyRedemption"
  ADD CONSTRAINT "LoyaltyRedemption_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LoyaltyRedemption_grantId_tenantId_fkey"
  FOREIGN KEY ("grantId", "tenantId")
  REFERENCES "LoyaltyRedemptionGrant"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "LoyaltyRedemption_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "guard_loyalty_redemption_grant_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
    OR NEW."codeHash" IS DISTINCT FROM OLD."codeHash"
    OR NEW."serviceRef" IS DISTINCT FROM OLD."serviceRef"
    OR NEW."points" IS DISTINCT FROM OLD."points"
    OR NEW."issuedAt" IS DISTINCT FROM OLD."issuedAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."issueExecutionId" IS NOT NULL
      AND NEW."issueExecutionId" IS DISTINCT FROM OLD."issueExecutionId"
    )
  THEN
    RAISE EXCEPTION 'LoyaltyRedemptionGrant identity, value, and established issue binding are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LoyaltyRedemptionGrant_immutable_guard"
BEFORE UPDATE ON "LoyaltyRedemptionGrant"
FOR EACH ROW EXECUTE FUNCTION "guard_loyalty_redemption_grant_immutable"();

CREATE FUNCTION "guard_loyalty_redemption_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."grantId" IS DISTINCT FROM OLD."grantId"
    OR NEW."redeemedAt" IS DISTINCT FROM OLD."redeemedAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."actionExecutionId" IS NOT NULL
      AND NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    )
  THEN
    RAISE EXCEPTION 'LoyaltyRedemption identity and established action binding are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LoyaltyRedemption_immutable_guard"
BEFORE UPDATE ON "LoyaltyRedemption"
FOR EACH ROW EXECUTE FUNCTION "guard_loyalty_redemption_immutable"();
