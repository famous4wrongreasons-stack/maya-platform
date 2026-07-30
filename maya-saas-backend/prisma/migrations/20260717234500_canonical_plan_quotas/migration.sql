-- Canonicalize the public plan matrix while retaining IDs and entitlements.
-- If a canonical row already exists, references and entitlements are merged
-- before the legacy row is removed.
CREATE OR REPLACE FUNCTION pg_temp.merge_maya_plan(
  legacy_name TEXT,
  canonical_name TEXT,
  default_price INTEGER,
  max_branches INTEGER,
  max_staff INTEGER,
  white_label BOOLEAN
) RETURNS VOID AS $$
DECLARE
  legacy_id TEXT;
  canonical_id TEXT;
BEGIN
  SELECT "id" INTO legacy_id
  FROM "SubscriptionPlan"
  WHERE "name" = legacy_name;

  SELECT "id" INTO canonical_id
  FROM "SubscriptionPlan"
  WHERE "name" = canonical_name;

  IF canonical_id IS NULL AND legacy_id IS NOT NULL THEN
    UPDATE "SubscriptionPlan"
    SET "name" = canonical_name
    WHERE "id" = legacy_id;
    canonical_id := legacy_id;
  ELSIF canonical_id IS NULL THEN
    canonical_id := 'plan_' || canonical_name;
    INSERT INTO "SubscriptionPlan" (
      "id", "name", "priceMonthly", "maxBranches", "maxStaff",
      "featuresJson", "isWhiteLabelEnabled", "createdAt", "updatedAt"
    ) VALUES (
      canonical_id, canonical_name, default_price, max_branches, max_staff,
      '{}'::jsonb, white_label, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  ELSIF legacy_id IS NOT NULL AND legacy_id <> canonical_id THEN
    UPDATE "Tenant" SET "planId" = canonical_id WHERE "planId" = legacy_id;
    UPDATE "BillingPayment" SET "planId" = canonical_id WHERE "planId" = legacy_id;

    INSERT INTO "PlanEntitlement" (
      "id", "planId", "featureKey", "enabled", "configJson",
      "createdAt", "updatedAt"
    )
    SELECT
      'merged_' || md5(canonical_id || ':' || legacy."featureKey"),
      canonical_id,
      legacy."featureKey",
      legacy."enabled",
      legacy."configJson",
      legacy."createdAt",
      CURRENT_TIMESTAMP
    FROM "PlanEntitlement" AS legacy
    WHERE legacy."planId" = legacy_id
    ON CONFLICT ("planId", "featureKey") DO UPDATE
    SET
      "enabled" = EXCLUDED."enabled",
      "configJson" = COALESCE(EXCLUDED."configJson", "PlanEntitlement"."configJson"),
      "updatedAt" = CURRENT_TIMESTAMP;

    DELETE FROM "PlanEntitlement" WHERE "planId" = legacy_id;
    DELETE FROM "SubscriptionPlan" WHERE "id" = legacy_id;
  END IF;

  UPDATE "SubscriptionPlan"
  SET
    "maxBranches" = max_branches,
    "maxStaff" = max_staff,
    "isWhiteLabelEnabled" = white_label,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = canonical_id;
END;
$$ LANGUAGE plpgsql;

SELECT pg_temp.merge_maya_plan('start', 'solo', 990, 1, 5, false);
SELECT pg_temp.merge_maya_plan('pro', 'business', 1990, 3, 25, false);
SELECT pg_temp.merge_maya_plan('max', 'business_plus', 2990, 10, 100, true);
