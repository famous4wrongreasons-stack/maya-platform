# Tenancy Foundation Runbook

## Scope

This vertical slice changes only the NestJS/PostgreSQL strangler-backend. It does not deploy, restart or migrate the production Python/SQLite Maya runtime.

## Local setup

```bash
cd maya-saas-backend
npm ci
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run start:dev
```

Set strong local values for `JWT_SECRET`, `CRM_ENCRYPTION_KEY`, `SEED_PLATFORM_OWNER_PASSWORD` and `SEED_DEMO_TENANT_ADMIN_PASSWORD`. Do not commit `.env` or paste provider secrets into issue/PR text.

`TENANT_BASE_DOMAIN` enables verified subdomain resolution. Localhost uses the explicit public config route slug and authenticated membership.

## Migration contents

Migration `20260711120000_multi_tenant_foundation`:

- adds Tenant locale/timezone/currency, industry preset and domain fields;
- expands persisted BrandingConfig fields in the compatible `BrandingSettings` table;
- creates Membership and backfills one row for every legacy tenant user;
- creates Feature, PlanEntitlement and TenantEntitlement;
- converts existing `featuresJson=true` entries into plan entitlements;
- creates/normalizes the default `malesthetic` tenant and Maya Aurora branding;
- adds a composite Appointment key used by tenant/client-scoped updates.

The migration is additive. `User.tenantId`, `User.role`, `SubscriptionPlan.featuresJson` and existing public response keys remain available during the compatibility period.

## Verify seed

Seed is idempotent and may be run repeatedly:

```bash
npm run prisma:seed
npm run prisma:seed
```

Expected database invariants:

```sql
SELECT slug, status, "defaultTimezone" FROM "Tenant"
WHERE slug IN ('malesthetic', 'demo-salon');

SELECT "tenantId", "userId", role, status FROM "Membership";

SELECT count(*) FROM "Feature";
SELECT count(*) FROM "PlanEntitlement" WHERE enabled = true;
```

Public configuration and registry:

```bash
curl http://localhost:3000/api/mobile/config/malesthetic
curl http://localhost:3000/api/mobile/config/demo-salon
curl http://localhost:3000/api/features/registry
```

## Verify tenant isolation

```bash
npm test -- --runInBand src/appointments/tenant-appointment.repository.spec.ts
npm test -- --runInBand src/tenancy/tenant-context.service.spec.ts
npm test -- --runInBand src/tenancy/tenant-resolver.service.spec.ts
```

The critical assertions are:

- tenant A list predicates always include tenant A;
- tenant A receives no result for a known tenant B appointment ID;
- tenant A update uses `(id, tenantId, clientId)` and cannot mutate tenant B;
- repository access without TenantContext fails closed;
- a member cannot select a different route tenant;
- conflicting trusted domain and route signals are rejected.

## Create a tenant

Use the existing platform admin endpoint with a platform JWT:

```bash
curl -X POST http://localhost:3000/api/admin/tenants \
  -H 'Authorization: Bearer <platform-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"Demo Clinic",
    "slug":"demo-clinic",
    "subdomain":"demo-clinic",
    "industryPresetId":"dental_clinic",
    "defaultCurrency":"RUB",
    "defaultTimezone":"Europe/Moscow",
    "defaultLocale":"ru-RU",
    "planId":"<plan-id>"
  }'
```

Creating a tenant user through `/api/admin/tenants/:id/users` writes both the legacy compatibility fields and Membership in one nested database write.

## Add or change a plan

1. Upsert `SubscriptionPlan`; it remains the Plan persistence model during compatibility.
2. Use only keys from `src/common/feature-catalog.ts`.
3. Upsert `PlanEntitlement(planId, featureKey)` for enabled capabilities.
4. Keep `featuresJson` populated until all old clients read effective entitlements.
5. Add entitlement precedence/dependency tests. Never add plan-name checks to controllers or UI.

Tenant-specific temporary allow/deny uses `TenantEntitlement` with reason and optional expiry.

## Add an industry preset

1. Add the neutral terminology/defaults to the future preset registry described in `docs/product/industry-presets.md`.
2. Reference only registered feature keys.
3. Seed `Tenant.industryPresetId`; do not copy a frontend or backend module.
4. Add fixture/snapshot tests for terminology and defaults.

Phase 1 persists the preset ID and default/demo values; the full runtime preset registry is a later slice.

## Add a CRM adapter

1. Implement `src/crm/crm-adapter.interface.ts` under `src/crm/adapters`.
2. Register it in `src/crm/crm-adapter.factory.ts`.
3. Keep credentials encrypted and loaded by trusted tenant context.
4. Add normalized contract tests, tenant-separated fixtures, source-of-truth and conflict rules.
5. Do not import provider payloads into UI/domain code.

## Required checks

```bash
npm run prisma:generate
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
```

For schema changes, also apply all migrations and run seed twice against a disposable PostgreSQL database.

## Production rollout restriction

Do not run this migration against production until PR review, backup, dry-run on a recent sanitized snapshot, membership backfill reconciliation and an explicit cutover approval. The current production application continues to use its existing runtime until a separate route-level migration plan is approved.
