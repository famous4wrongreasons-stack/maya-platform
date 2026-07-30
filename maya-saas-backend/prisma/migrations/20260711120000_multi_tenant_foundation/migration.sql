-- Additive Phase 1 tenancy foundation. Legacy User.tenantId/User.role and
-- SubscriptionPlan.featuresJson remain in place as compatibility projections.

ALTER TABLE "Tenant"
  ADD COLUMN "industryPresetId" TEXT,
  ADD COLUMN "defaultCurrency" TEXT NOT NULL DEFAULT 'RUB',
  ADD COLUMN "defaultTimezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
  ADD COLUMN "defaultLocale" TEXT NOT NULL DEFAULT 'ru-RU',
  ADD COLUMN "customDomain" TEXT,
  ADD COLUMN "subdomain" TEXT;

CREATE UNIQUE INDEX "Tenant_customDomain_key" ON "Tenant"("customDomain");
CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");

ALTER TABLE "BrandingSettings"
  ADD COLUMN "iconUrl" TEXT,
  ADD COLUMN "faviconUrl" TEXT,
  ADD COLUMN "accentColor" TEXT,
  ADD COLUMN "backgroundColor" TEXT,
  ADD COLUMN "surfaceColor" TEXT,
  ADD COLUMN "textPrimaryColor" TEXT,
  ADD COLUMN "textSecondaryColor" TEXT,
  ADD COLUMN "headingFontFamily" TEXT,
  ADD COLUMN "buttonStyle" TEXT,
  ADD COLUMN "themeMode" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "borderRadiusJson" JSONB,
  ADD COLUMN "contactDetailsJson" JSONB,
  ADD COLUMN "socialLinksJson" JSONB,
  ADD COLUMN "mapLinksJson" JSONB,
  ADD COLUMN "legalLinksJson" JSONB,
  ADD COLUMN "splashScreenJson" JSONB,
  ADD COLUMN "onboardingJson" JSONB,
  ADD COLUMN "storeListingJson" JSONB,
  ADD COLUMN "emailBrandingJson" JSONB,
  ADD COLUMN "telegramBrandingJson" JSONB;

INSERT INTO "Tenant" (
  "id", "name", "slug", "status", "industryPresetId",
  "defaultCurrency", "defaultTimezone", "defaultLocale", "subdomain",
  "allowSelfRegistration", "createdAt", "updatedAt"
)
SELECT
  'tenant_maya_default',
  'Мужская Эстетика',
  'malesthetic',
  'active',
  'barbershop',
  'RUB',
  'Europe/Moscow',
  'ru-RU',
  'malesthetic',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Tenant" WHERE "slug" = 'malesthetic'
);

UPDATE "Tenant"
SET
  "industryPresetId" = COALESCE("industryPresetId", 'barbershop'),
  "defaultCurrency" = COALESCE("defaultCurrency", 'RUB'),
  "defaultTimezone" = COALESCE("defaultTimezone", 'Europe/Moscow'),
  "defaultLocale" = COALESCE("defaultLocale", 'ru-RU'),
  "subdomain" = COALESCE("subdomain", 'malesthetic'),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'malesthetic';

INSERT INTO "BrandingSettings" (
  "id", "tenantId", "appName", "primaryColor", "secondaryColor",
  "accentColor", "backgroundColor", "surfaceColor", "textPrimaryColor",
  "textSecondaryColor", "fontFamily", "headingFontFamily", "buttonRadius",
  "buttonStyle", "themeMode", "borderRadiusJson", "themeJson",
  "createdAt", "updatedAt"
)
SELECT
  'branding_maya_default',
  tenant."id",
  tenant."name",
  '#aaa69d',
  '#7d7970',
  '#aaa69d',
  '#f4f0eb',
  '#fffdf9',
  '#18160f',
  'rgba(24,22,15,0.55)',
  'Montserrat',
  'Montserrat',
  999,
  'pill',
  'system',
  '{"sm":12,"md":18,"lg":28,"full":999}'::jsonb,
  '{"preset":"maya-aurora","appearance":"aurora","booking":{"mode":"live"}}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
WHERE tenant."slug" = 'malesthetic'
ON CONFLICT ("tenantId") DO NOTHING;

UPDATE "BrandingSettings" AS branding
SET
  "appName" = COALESCE(branding."appName", tenant."name"),
  "primaryColor" = COALESCE(branding."primaryColor", '#aaa69d'),
  "secondaryColor" = COALESCE(branding."secondaryColor", '#7d7970'),
  "accentColor" = COALESCE(branding."accentColor", '#aaa69d'),
  "backgroundColor" = COALESCE(branding."backgroundColor", '#f4f0eb'),
  "surfaceColor" = COALESCE(branding."surfaceColor", '#fffdf9'),
  "textPrimaryColor" = COALESCE(branding."textPrimaryColor", '#18160f'),
  "textSecondaryColor" = COALESCE(
    branding."textSecondaryColor",
    'rgba(24,22,15,0.55)'
  ),
  "fontFamily" = COALESCE(branding."fontFamily", 'Montserrat'),
  "headingFontFamily" = COALESCE(
    branding."headingFontFamily",
    'Montserrat'
  ),
  "buttonRadius" = COALESCE(branding."buttonRadius", 999),
  "buttonStyle" = COALESCE(branding."buttonStyle", 'pill'),
  "borderRadiusJson" = COALESCE(
    branding."borderRadiusJson",
    '{"sm":12,"md":18,"lg":28,"full":999}'::jsonb
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
WHERE branding."tenantId" = tenant."id"
  AND tenant."slug" = 'malesthetic';

INSERT INTO "Branch" (
  "id", "tenantId", "name", "timezone", "createdAt", "updatedAt"
)
SELECT
  'branch_maya_default',
  tenant."id",
  tenant."name",
  tenant."defaultTimezone",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
WHERE tenant."slug" = 'malesthetic'
  AND NOT EXISTS (
    SELECT 1 FROM "Branch" WHERE "tenantId" = tenant."id"
  );

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "invitedAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Membership_userId_tenantId_key"
  ON "Membership"("userId", "tenantId");
CREATE INDEX "Membership_tenantId_status_idx"
  ON "Membership"("tenantId", "status");
CREATE INDEX "Membership_userId_status_idx"
  ON "Membership"("userId", "status");

ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Membership" (
  "id", "tenantId", "userId", "role", "status", "invitedAt",
  "joinedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || md5("tenantId" || ':' || "id"),
  "tenantId",
  "id",
  "role",
  "status",
  CASE WHEN "status" = 'invited' THEN "createdAt" ELSE NULL END,
  CASE WHEN "status" = 'active' THEN "createdAt" ELSE NULL END,
  "createdAt",
  "updatedAt"
FROM "User"
WHERE "tenantId" IS NOT NULL
ON CONFLICT ("userId", "tenantId") DO NOTHING;

CREATE TABLE "Feature" (
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "module" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Feature_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "PlanEntitlement" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "configJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanEntitlement_planId_featureKey_key"
  ON "PlanEntitlement"("planId", "featureKey");
CREATE INDEX "PlanEntitlement_featureKey_enabled_idx"
  ON "PlanEntitlement"("featureKey", "enabled");

ALTER TABLE "PlanEntitlement"
  ADD CONSTRAINT "PlanEntitlement_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanEntitlement"
  ADD CONSTRAINT "PlanEntitlement_featureKey_fkey"
  FOREIGN KEY ("featureKey") REFERENCES "Feature"("key")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TenantEntitlement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "configJson" JSONB,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantEntitlement_tenantId_featureKey_key"
  ON "TenantEntitlement"("tenantId", "featureKey");
CREATE INDEX "TenantEntitlement_tenantId_enabled_expiresAt_idx"
  ON "TenantEntitlement"("tenantId", "enabled", "expiresAt");

ALTER TABLE "TenantEntitlement"
  ADD CONSTRAINT "TenantEntitlement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantEntitlement"
  ADD CONSTRAINT "TenantEntitlement_featureKey_fkey"
  FOREIGN KEY ("featureKey") REFERENCES "Feature"("key")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Feature" ("key", "name", "module", "updatedAt") VALUES
  ('booking', 'Legacy booking', 'bookings', CURRENT_TIMESTAMP),
  ('branding', 'Legacy branding', 'branding', CURRENT_TIMESTAMP),
  ('client_app', 'Legacy client app', 'client-app', CURRENT_TIMESTAMP),
  ('loyalty', 'Legacy loyalty', 'commerce', CURRENT_TIMESTAMP),
  ('shop', 'Legacy shop', 'commerce', CURRENT_TIMESTAMP),
  ('tg_basic', 'Legacy Telegram basics', 'messaging', CURRENT_TIMESTAMP),
  ('tg_marketing', 'Legacy Telegram marketing', 'messaging', CURRENT_TIMESTAMP),
  ('journal', 'Legacy booking journal', 'bookings', CURRENT_TIMESTAMP),
  ('staff_cabinet', 'Legacy staff cabinet', 'workforce', CURRENT_TIMESTAMP),
  ('analytics', 'Legacy analytics', 'analytics', CURRENT_TIMESTAMP),
  ('video_analytics', 'Legacy video analytics', 'analytics', CURRENT_TIMESTAMP),
  ('cutmatch', 'CutMatch', 'ai', CURRENT_TIMESTAMP),
  ('ai_chatbot', 'Legacy AI chatbot', 'ai', CURRENT_TIMESTAMP),
  ('priority_support', 'Priority support', 'platform', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PlanEntitlement" (
  "id", "planId", "featureKey", "enabled", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || md5(plan."id" || ':' || feature."key"),
  plan."id",
  feature."key",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "SubscriptionPlan" AS plan
CROSS JOIN LATERAL jsonb_object_keys(
  COALESCE(plan."featuresJson", '{}'::jsonb)
) AS enabled_keys("key")
JOIN "Feature" AS feature ON feature."key" = enabled_keys."key"
WHERE plan."featuresJson" ->> enabled_keys."key" = 'true'
ON CONFLICT ("planId", "featureKey") DO NOTHING;

CREATE UNIQUE INDEX "Appointment_id_tenantId_clientId_key"
  ON "Appointment"("id", "tenantId", "clientId");
