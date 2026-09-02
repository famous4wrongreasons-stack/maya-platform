-- Transactional notifications, owner reports and operational briefs are
-- core delivery capabilities for every standard MAYA plan.
INSERT INTO "PlanEntitlement" (
  "id",
  "planId",
  "featureKey",
  "enabled",
  "createdAt",
  "updatedAt"
)
SELECT
  'core_notifications_' || md5(plan."id" || ':notifications.core'),
  plan."id",
  'notifications.core',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "SubscriptionPlan" AS plan
WHERE plan."name" IN ('solo', 'business', 'business_plus')
ON CONFLICT ("planId", "featureKey") DO UPDATE SET
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
