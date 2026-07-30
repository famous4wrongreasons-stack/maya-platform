-- Keep production plan data aligned with the code catalog without requiring
-- the demo seed during a normal rollout.
INSERT INTO "Feature" (
  "key", "name", "description", "module", "status", "createdAt", "updatedAt"
) VALUES
  ('booking', 'Legacy booking', 'Compatibility flag.', 'bookings', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('branding', 'Legacy branding', 'Compatibility flag.', 'branding', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('client_app', 'Legacy client app', 'Compatibility flag.', 'client-app', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('loyalty', 'Legacy loyalty', 'Compatibility flag.', 'commerce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('shop', 'Legacy shop', 'Compatibility flag.', 'commerce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tg_basic', 'Legacy Telegram basics', 'Compatibility flag.', 'messaging', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('tg_marketing', 'Legacy Telegram marketing', 'Compatibility flag.', 'messaging', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('journal', 'Legacy booking journal', 'Compatibility flag.', 'bookings', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('staff_cabinet', 'Legacy staff cabinet', 'Compatibility flag.', 'workforce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('analytics', 'Legacy analytics', 'Compatibility flag.', 'analytics', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('video_analytics', 'Legacy video analytics', 'Compatibility flag.', 'analytics', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cutmatch', 'CutMatch', 'AI appearance consultation.', 'ai', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ai_chatbot', 'Legacy AI chatbot', 'Compatibility flag.', 'ai', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('priority_support', 'Priority support', 'Priority support queue.', 'platform', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar.internal', 'Internal calendar', 'Maya-managed availability and calendar.', 'scheduling', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('calendar.external', 'External calendar', 'Calendar backed by an external CRM.', 'crm-integrations', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('booking.public', 'Public booking', 'Public booking entry point.', 'bookings', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('booking.customer_app', 'Customer app booking', 'Authenticated booking inside the customer app.', 'bookings', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('customers.core', 'Customer records', 'Core tenant customer records.', 'customers', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('expenses.core', 'Expenses', 'Tenant expense records.', 'finance', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('analytics.solo', 'Solo analytics', 'Analytics for an independent provider.', 'analytics', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('analytics.employee', 'Employee analytics', 'Employee-scoped performance analytics.', 'analytics', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('analytics.location', 'Location analytics', 'Location-scoped analytics.', 'analytics', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('analytics.business', 'Business analytics', 'Organization and tenant analytics.', 'analytics', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('crm.integration', 'CRM integration', 'External CRM connector support.', 'crm-integrations', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('commerce.store', 'Store', 'Tenant product storefront.', 'commerce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('commerce.certificates', 'Certificates', 'Certificate purchase and ownership.', 'commerce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('commerce.memberships', 'Customer memberships', 'Customer membership plans and subscriptions.', 'commerce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('commerce.redemption', 'Commerce redemption', 'Ledger-based certificate and membership redemption.', 'commerce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('referrals', 'Referrals', 'Tenant referral programs.', 'commerce', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('team.chat', 'Team chat', 'Internal team messaging.', 'messaging', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('notifications.core', 'Notifications', 'Transactional notification delivery.', 'notifications', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('customer.portal', 'Customer portal', 'Customer profile, history and upcoming visits.', 'client-app', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ai.owner', 'Maya OS', 'Owner AI capabilities.', 'ai', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ai.admin', 'Maya Admin', 'Administrator AI tools.', 'ai', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ai.consultant', 'Maya Consult', 'Customer consultation capabilities.', 'ai', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('telegram.owner', 'Telegram owner', 'Owner channel adapter.', 'telegram', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('telegram.admin', 'Telegram admin', 'Administrator channel adapter.', 'telegram', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('telegram.consultant', 'Telegram consultant', 'Customer channel adapter.', 'telegram', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('branding.custom', 'Custom branding', 'Tenant-managed white-label tokens and assets.', 'branding', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('domain.custom', 'Custom domain', 'Verified custom tenant domain.', 'branding', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "module" = EXCLUDED."module",
  "status" = EXCLUDED."status",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH direct_plan_features (plan_name, feature_key) AS (
  VALUES
    ('solo', 'booking'),
    ('solo', 'branding'),
    ('solo', 'client_app'),
    ('solo', 'loyalty'),
    ('solo', 'tg_basic'),
    ('solo', 'calendar.internal'),
    ('solo', 'customers.core'),
    ('solo', 'expenses.core'),
    ('solo', 'analytics.solo'),
    ('business', 'booking'),
    ('business', 'branding'),
    ('business', 'client_app'),
    ('business', 'loyalty'),
    ('business', 'tg_basic'),
    ('business', 'calendar.internal'),
    ('business', 'customers.core'),
    ('business', 'expenses.core'),
    ('business', 'analytics.solo'),
    ('business', 'shop'),
    ('business', 'tg_marketing'),
    ('business', 'journal'),
    ('business', 'staff_cabinet'),
    ('business', 'analytics'),
    ('business', 'priority_support'),
    ('business_plus', 'booking'),
    ('business_plus', 'branding'),
    ('business_plus', 'client_app'),
    ('business_plus', 'loyalty'),
    ('business_plus', 'tg_basic'),
    ('business_plus', 'calendar.internal'),
    ('business_plus', 'customers.core'),
    ('business_plus', 'expenses.core'),
    ('business_plus', 'analytics.solo'),
    ('business_plus', 'shop'),
    ('business_plus', 'tg_marketing'),
    ('business_plus', 'journal'),
    ('business_plus', 'staff_cabinet'),
    ('business_plus', 'analytics'),
    ('business_plus', 'priority_support'),
    ('business_plus', 'video_analytics'),
    ('business_plus', 'ai.owner'),
    ('business_plus', 'ai.admin'),
    ('business_plus', 'ai.consultant')
), plan_flags AS (
  SELECT plan_name, jsonb_object_agg(feature_key, true) AS flags
  FROM direct_plan_features
  GROUP BY plan_name
)
UPDATE "SubscriptionPlan" AS plan
SET
  "featuresJson" = plan_flags.flags,
  "updatedAt" = CURRENT_TIMESTAMP
FROM plan_flags
WHERE plan."name" = plan_flags.plan_name;

WITH expanded_plan_features (plan_name, feature_key) AS (
  VALUES
    ('solo', 'booking'), ('solo', 'branding'),
    ('solo', 'client_app'), ('solo', 'loyalty'),
    ('solo', 'tg_basic'), ('solo', 'calendar.internal'),
    ('solo', 'booking.public'), ('solo', 'booking.customer_app'),
    ('solo', 'customers.core'), ('solo', 'expenses.core'),
    ('solo', 'analytics.solo'), ('solo', 'customer.portal'),
    ('solo', 'telegram.consultant'), ('solo', 'branding.custom'),
    ('business', 'booking'), ('business', 'branding'),
    ('business', 'client_app'), ('business', 'loyalty'),
    ('business', 'shop'), ('business', 'tg_basic'),
    ('business', 'tg_marketing'), ('business', 'journal'),
    ('business', 'staff_cabinet'), ('business', 'analytics'),
    ('business', 'priority_support'), ('business', 'calendar.internal'),
    ('business', 'calendar.external'), ('business', 'booking.public'),
    ('business', 'booking.customer_app'), ('business', 'customers.core'),
    ('business', 'expenses.core'), ('business', 'analytics.solo'),
    ('business', 'analytics.employee'), ('business', 'analytics.location'),
    ('business', 'analytics.business'), ('business', 'crm.integration'),
    ('business', 'commerce.store'), ('business', 'commerce.certificates'),
    ('business', 'commerce.memberships'), ('business', 'commerce.redemption'),
    ('business', 'customer.portal'), ('business', 'telegram.consultant'),
    ('business', 'branding.custom'),
    ('business_plus', 'booking'), ('business_plus', 'branding'),
    ('business_plus', 'client_app'), ('business_plus', 'loyalty'),
    ('business_plus', 'shop'), ('business_plus', 'tg_basic'),
    ('business_plus', 'tg_marketing'), ('business_plus', 'journal'),
    ('business_plus', 'staff_cabinet'), ('business_plus', 'analytics'),
    ('business_plus', 'video_analytics'),
    ('business_plus', 'priority_support'),
    ('business_plus', 'calendar.internal'),
    ('business_plus', 'calendar.external'),
    ('business_plus', 'booking.public'),
    ('business_plus', 'booking.customer_app'),
    ('business_plus', 'customers.core'),
    ('business_plus', 'expenses.core'),
    ('business_plus', 'analytics.solo'),
    ('business_plus', 'analytics.employee'),
    ('business_plus', 'analytics.location'),
    ('business_plus', 'analytics.business'),
    ('business_plus', 'crm.integration'),
    ('business_plus', 'commerce.store'),
    ('business_plus', 'commerce.certificates'),
    ('business_plus', 'commerce.memberships'),
    ('business_plus', 'commerce.redemption'),
    ('business_plus', 'customer.portal'),
    ('business_plus', 'ai.owner'), ('business_plus', 'ai.admin'),
    ('business_plus', 'ai.consultant'),
    ('business_plus', 'telegram.consultant'),
    ('business_plus', 'branding.custom')
)
INSERT INTO "PlanEntitlement" (
  "id", "planId", "featureKey", "enabled", "createdAt", "updatedAt"
)
SELECT
  'catalog_' || md5(plan."id" || ':' || matrix.feature_key),
  plan."id",
  matrix.feature_key,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM expanded_plan_features AS matrix
JOIN "SubscriptionPlan" AS plan ON plan."name" = matrix.plan_name
ON CONFLICT ("planId", "featureKey") DO UPDATE SET
  "enabled" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
