INSERT INTO "Tenant" (
  "id",
  "name",
  "slug",
  "status",
  "industryPresetId",
  "calendarSource",
  "allowSelfRegistration",
  "trialFullAccess",
  "createdAt",
  "updatedAt"
)
VALUES (
  'maya-os-bootstrap-tenant-v1',
  'MAYA OS',
  'maya-os',
  'active'::"TenantStatus",
  'general_service',
  'external'::"CalendarSource",
  false,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = EXCLUDED."status",
  "industryPresetId" = EXCLUDED."industryPresetId",
  "calendarSource" = EXCLUDED."calendarSource",
  "allowSelfRegistration" = EXCLUDED."allowSelfRegistration",
  "trialFullAccess" = EXCLUDED."trialFullAccess",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "BrandingSettings" (
  "id",
  "tenantId",
  "appName",
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textPrimaryColor",
  "textSecondaryColor",
  "fontFamily",
  "headingFontFamily",
  "buttonRadius",
  "buttonStyle",
  "themeMode",
  "themeJson",
  "createdAt",
  "updatedAt"
)
SELECT
  'maya-os-bootstrap-branding-v1',
  tenant."id",
  'MAYA OS',
  '#000000',
  '#FFFFFF',
  '#000000',
  '#FFFFFF',
  '#FFFFFF',
  '#000000',
  'rgba(0,0,0,0.58)',
  'Manrope',
  'Montserrat',
  18,
  'rounded',
  'system',
  '{"appearance":"maya-monochrome","platform_bootstrap":true}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant" AS tenant
WHERE tenant."slug" = 'maya-os'
ON CONFLICT ("tenantId") DO UPDATE SET
  "appName" = EXCLUDED."appName",
  "primaryColor" = EXCLUDED."primaryColor",
  "secondaryColor" = EXCLUDED."secondaryColor",
  "accentColor" = EXCLUDED."accentColor",
  "backgroundColor" = EXCLUDED."backgroundColor",
  "surfaceColor" = EXCLUDED."surfaceColor",
  "textPrimaryColor" = EXCLUDED."textPrimaryColor",
  "textSecondaryColor" = EXCLUDED."textSecondaryColor",
  "fontFamily" = EXCLUDED."fontFamily",
  "headingFontFamily" = EXCLUDED."headingFontFamily",
  "buttonRadius" = EXCLUDED."buttonRadius",
  "buttonStyle" = EXCLUDED."buttonStyle",
  "themeMode" = EXCLUDED."themeMode",
  "themeJson" = EXCLUDED."themeJson",
  "updatedAt" = CURRENT_TIMESTAMP;
