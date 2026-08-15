INSERT INTO "Feature" (
  "key", "name", "description", "module", "status", "createdAt", "updatedAt"
) VALUES (
  'reviews.core',
  'Business reviews',
  'Privacy-safe review registry and rating analytics.',
  'reviews',
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "module" = EXCLUDED."module",
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "SubscriptionPlan"
SET
  "featuresJson" = COALESCE("featuresJson", '{}'::jsonb)
    || jsonb_build_object('reviews.core', true),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" IN ('business', 'business_plus', 'pro', 'max');

INSERT INTO "PlanEntitlement" (
  "id", "planId", "featureKey", "enabled", "createdAt", "updatedAt"
)
SELECT
  'reviews_' || md5(plan."id" || ':reviews.core'),
  plan."id",
  'reviews.core',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "SubscriptionPlan" AS plan
WHERE plan."name" IN ('business', 'business_plus', 'pro', 'max')
ON CONFLICT ("planId", "featureKey") DO UPDATE SET
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
