-- Cycle 06 Blocking Package 4 schema-only customer-subscription foundation.
-- An activated term, its terminal lifecycle mutation, and append-only usage
-- claims remain distinct business operations. Legacy rows are not backfilled;
-- safely correlated historical rows retain null ActionExecution bindings.

CREATE TABLE "CustomerSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "activationExecutionId" TEXT,
  "endExecutionId" TEXT,
  "clientId" TEXT NOT NULL,
  "previousSubscriptionId" TEXT,
  "termIdentityHash" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "planSnapshotHash" TEXT NOT NULL,
  "serviceScopeHash" TEXT NOT NULL,
  "priceKopecks" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "visitsIncluded" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "provider" TEXT,
  "providerPaymentRefHash" TEXT,
  "activatedAt" TIMESTAMP(3) NOT NULL,
  "termStartsAt" TIMESTAMP(3) NOT NULL,
  "termEndsAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerSubscription_shape_check" CHECK (
    btrim("termIdentityHash") <> ''
    AND btrim("planCode") <> ''
    AND btrim("planSnapshotHash") <> ''
    AND btrim("serviceScopeHash") <> ''
    AND btrim("currency") <> ''
    AND "priceKopecks" > 0
    AND "visitsIncluded" > 0
    AND "termEndsAt" > "termStartsAt"
    AND "previousSubscriptionId" IS DISTINCT FROM "id"
    AND "status" IN ('active', 'expired', 'canceled', 'revoked')
    AND (
      (
        "status" = 'active'
        AND "endedAt" IS NULL
        AND "endExecutionId" IS NULL
      )
      OR (
        "status" IN ('expired', 'canceled', 'revoked')
        AND "endedAt" IS NOT NULL
      )
    )
    AND (
      ("provider" IS NULL AND "providerPaymentRefHash" IS NULL)
      OR (
        "provider" IS NOT NULL
        AND btrim("provider") <> ''
        AND "providerPaymentRefHash" IS NOT NULL
        AND btrim("providerPaymentRefHash") <> ''
      )
    )
    AND ("legacySourceRef" IS NULL OR btrim("legacySourceRef") <> '')
    AND (
      "activationExecutionId" IS NOT NULL
      OR "legacySourceRef" IS NOT NULL
    )
  )
);

CREATE TABLE "CustomerSubscriptionUsage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "actionExecutionId" TEXT,
  "usageIdentityHash" TEXT NOT NULL,
  "targetKind" TEXT NOT NULL,
  "targetRefHash" TEXT NOT NULL,
  "units" INTEGER NOT NULL DEFAULT 1,
  "usedAt" TIMESTAMP(3) NOT NULL,
  "legacySourceRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerSubscriptionUsage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerSubscriptionUsage_shape_check" CHECK (
    btrim("usageIdentityHash") <> ''
    AND btrim("targetKind") <> ''
    AND btrim("targetRefHash") <> ''
    AND "units" > 0
    AND ("legacySourceRef" IS NULL OR btrim("legacySourceRef") <> '')
    AND (
      "actionExecutionId" IS NOT NULL
      OR "legacySourceRef" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "CustomerSubscription_id_tenantId_key"
  ON "CustomerSubscription"("id", "tenantId");
CREATE UNIQUE INDEX "CustomerSubscription_tenantId_termIdentityHash_key"
  ON "CustomerSubscription"("tenantId", "termIdentityHash");
CREATE UNIQUE INDEX "CustomerSubscription_activationExecutionId_tenantId_key"
  ON "CustomerSubscription"("activationExecutionId", "tenantId");
CREATE UNIQUE INDEX "CustomerSubscription_endExecutionId_tenantId_key"
  ON "CustomerSubscription"("endExecutionId", "tenantId");
CREATE UNIQUE INDEX "CustomerSubscription_previousSubscriptionId_tenantId_key"
  ON "CustomerSubscription"("previousSubscriptionId", "tenantId");
CREATE UNIQUE INDEX "CustomerSubscription_tenantId_provider_providerPaymentRefHa_key"
  ON "CustomerSubscription"("tenantId", "provider", "providerPaymentRefHash");
CREATE UNIQUE INDEX "CustomerSubscription_tenantId_legacySourceRef_key"
  ON "CustomerSubscription"("tenantId", "legacySourceRef");
CREATE INDEX "CustomerSubscription_tenantId_clientId_status_termEndsAt_idx"
  ON "CustomerSubscription"("tenantId", "clientId", "status", "termEndsAt");
CREATE INDEX "CustomerSubscription_tenantId_status_termEndsAt_idx"
  ON "CustomerSubscription"("tenantId", "status", "termEndsAt");

CREATE UNIQUE INDEX "CustomerSubscriptionUsage_id_tenantId_key"
  ON "CustomerSubscriptionUsage"("id", "tenantId");
CREATE UNIQUE INDEX "CustomerSubscriptionUsage_subscriptionId_tenantId_usageIden_key"
  ON "CustomerSubscriptionUsage"("subscriptionId", "tenantId", "usageIdentityHash");
CREATE UNIQUE INDEX "CustomerSubscriptionUsage_tenantId_legacySourceRef_key"
  ON "CustomerSubscriptionUsage"("tenantId", "legacySourceRef");
CREATE INDEX "CustomerSubscriptionUsage_actionExecutionId_tenantId_idx"
  ON "CustomerSubscriptionUsage"("actionExecutionId", "tenantId");
CREATE INDEX "CustomerSubscriptionUsage_subscriptionId_tenantId_usedAt_idx"
  ON "CustomerSubscriptionUsage"("subscriptionId", "tenantId", "usedAt");

ALTER TABLE "CustomerSubscription"
  ADD CONSTRAINT "CustomerSubscription_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerSubscription_clientId_tenantId_fkey"
  FOREIGN KEY ("clientId", "tenantId")
  REFERENCES "Client"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "CustomerSubscription_activationExecutionId_tenantId_fkey"
  FOREIGN KEY ("activationExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "CustomerSubscription_endExecutionId_tenantId_fkey"
  FOREIGN KEY ("endExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "CustomerSubscription_previousSubscriptionId_tenantId_fkey"
  FOREIGN KEY ("previousSubscriptionId", "tenantId")
  REFERENCES "CustomerSubscription"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "CustomerSubscriptionUsage"
  ADD CONSTRAINT "CustomerSubscriptionUsage_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerSubscriptionUsage_subscriptionId_tenantId_fkey"
  FOREIGN KEY ("subscriptionId", "tenantId")
  REFERENCES "CustomerSubscription"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "CustomerSubscriptionUsage_actionExecutionId_tenantId_fkey"
  FOREIGN KEY ("actionExecutionId", "tenantId")
  REFERENCES "ActionExecution"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE FUNCTION "validate_customer_subscription_renewal"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  previous_client_id TEXT;
  previous_term_starts_at TIMESTAMP(3);
BEGIN
  IF NEW."previousSubscriptionId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "clientId", "termStartsAt"
  INTO previous_client_id, previous_term_starts_at
  FROM "CustomerSubscription"
  WHERE "id" = NEW."previousSubscriptionId"
    AND "tenantId" = NEW."tenantId";

  -- Let the tenant-qualified FK produce the canonical missing/cross-tenant
  -- rejection when the predecessor is not visible in this tenant.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF previous_client_id IS DISTINCT FROM NEW."clientId"
    OR NEW."termStartsAt" <= previous_term_starts_at
  THEN
    RAISE EXCEPTION 'CustomerSubscription renewal must preserve client identity and advance the term'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerSubscription_renewal_guard"
BEFORE INSERT ON "CustomerSubscription"
FOR EACH ROW EXECUTE FUNCTION "validate_customer_subscription_renewal"();

CREATE FUNCTION "guard_customer_subscription_immutable_facts"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
    OR NEW."previousSubscriptionId" IS DISTINCT FROM OLD."previousSubscriptionId"
    OR NEW."termIdentityHash" IS DISTINCT FROM OLD."termIdentityHash"
    OR NEW."planCode" IS DISTINCT FROM OLD."planCode"
    OR NEW."planSnapshotHash" IS DISTINCT FROM OLD."planSnapshotHash"
    OR NEW."serviceScopeHash" IS DISTINCT FROM OLD."serviceScopeHash"
    OR NEW."priceKopecks" IS DISTINCT FROM OLD."priceKopecks"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."visitsIncluded" IS DISTINCT FROM OLD."visitsIncluded"
    OR NEW."provider" IS DISTINCT FROM OLD."provider"
    OR NEW."providerPaymentRefHash" IS DISTINCT FROM OLD."providerPaymentRefHash"
    OR NEW."activatedAt" IS DISTINCT FROM OLD."activatedAt"
    OR NEW."termStartsAt" IS DISTINCT FROM OLD."termStartsAt"
    OR NEW."termEndsAt" IS DISTINCT FROM OLD."termEndsAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."activationExecutionId" IS NOT NULL
      AND NEW."activationExecutionId" IS DISTINCT FROM OLD."activationExecutionId"
    )
    OR (
      OLD."endExecutionId" IS NOT NULL
      AND NEW."endExecutionId" IS DISTINCT FROM OLD."endExecutionId"
    )
    OR (
      OLD."status" <> 'active'
      AND (
        NEW."status" IS DISTINCT FROM OLD."status"
        OR NEW."endedAt" IS DISTINCT FROM OLD."endedAt"
        OR NEW."endExecutionId" IS DISTINCT FROM OLD."endExecutionId"
      )
    )
    OR (
      OLD."status" = 'active'
      AND NEW."status" <> 'active'
      AND NEW."endExecutionId" IS NULL
    )
  THEN
    RAISE EXCEPTION 'CustomerSubscription immutable term facts or established execution binding changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerSubscription_immutable_facts_guard"
BEFORE UPDATE ON "CustomerSubscription"
FOR EACH ROW EXECUTE FUNCTION "guard_customer_subscription_immutable_facts"();

CREATE FUNCTION "claim_customer_subscription_usage_capacity"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  allowed_units INTEGER;
  already_used_units INTEGER;
  allowed_from TIMESTAMP(3);
  allowed_until TIMESTAMP(3);
BEGIN
  SELECT "visitsIncluded", "termStartsAt", "termEndsAt"
  INTO allowed_units, allowed_from, allowed_until
  FROM "CustomerSubscription"
  WHERE "id" = NEW."subscriptionId"
    AND "tenantId" = NEW."tenantId"
  FOR UPDATE;

  -- Let the composite FK reject a missing or cross-tenant subscription.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW."usedAt" < allowed_from OR NEW."usedAt" > allowed_until THEN
    RAISE EXCEPTION 'CustomerSubscriptionUsage falls outside the immutable term'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(SUM("units"), 0)
  INTO already_used_units
  FROM "CustomerSubscriptionUsage"
  WHERE "subscriptionId" = NEW."subscriptionId"
    AND "tenantId" = NEW."tenantId";

  IF already_used_units + NEW."units" > allowed_units THEN
    RAISE EXCEPTION 'CustomerSubscription usage exceeds the immutable term allowance'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerSubscriptionUsage_capacity_guard"
BEFORE INSERT ON "CustomerSubscriptionUsage"
FOR EACH ROW EXECUTE FUNCTION "claim_customer_subscription_usage_capacity"();

CREATE FUNCTION "guard_customer_subscription_usage_immutable"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."subscriptionId" IS DISTINCT FROM OLD."subscriptionId"
    OR NEW."usageIdentityHash" IS DISTINCT FROM OLD."usageIdentityHash"
    OR NEW."targetKind" IS DISTINCT FROM OLD."targetKind"
    OR NEW."targetRefHash" IS DISTINCT FROM OLD."targetRefHash"
    OR NEW."units" IS DISTINCT FROM OLD."units"
    OR NEW."usedAt" IS DISTINCT FROM OLD."usedAt"
    OR NEW."legacySourceRef" IS DISTINCT FROM OLD."legacySourceRef"
    OR (
      OLD."actionExecutionId" IS NOT NULL
      AND NEW."actionExecutionId" IS DISTINCT FROM OLD."actionExecutionId"
    )
  THEN
    RAISE EXCEPTION 'CustomerSubscriptionUsage identity, value, and established execution binding are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "CustomerSubscriptionUsage_immutable_guard"
BEFORE UPDATE ON "CustomerSubscriptionUsage"
FOR EACH ROW EXECUTE FUNCTION "guard_customer_subscription_usage_immutable"();
