BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '3s';
SELECT CURRENT_TIMESTAMP AS observed_at,
       t.id AS tenant_id, t.status AS tenant_status,
       t."calendarSource" AS calendar_source,
       t."defaultTimezone" AS tenant_timezone,
       i.id AS integration_id, i.provider, i.status AS integration_status,
       i."updatedAt" AS integration_updated_at,
       i."verifiedAt" AS integration_verified_at,
       i."lastCheckedAt" AS integration_last_checked_at,
       i."settingsJson"->>'companyId' AS configured_company_id,
       i."settingsJson"->'branchBinding'->>'contract' AS binding_contract,
       i."settingsJson"->'branchBinding'->>'companyId' AS binding_company_id,
       i."settingsJson"->'branchBinding'->>'branchId' AS binding_branch_id,
       b.id AS owned_bound_branch_id, b."tenantId" AS branch_tenant_id,
       b.timezone AS branch_timezone, b."updatedAt" AS branch_updated_at
FROM "Tenant" t
LEFT JOIN "CrmIntegration" i ON i."tenantId" = t.id
LEFT JOIN "Branch" b
  ON b.id = i."settingsJson"->'branchBinding'->>'branchId'
 AND b."tenantId" = t.id
WHERE t.id = 'cmsuavtar0003bjyrfngxsne6';
ROLLBACK;
