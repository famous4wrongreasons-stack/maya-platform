# Tenant Data Isolation Runbook

## Scope

This slice extends the NestJS/PostgreSQL strangler backend only. It does not change the website, PWA, iOS bundle, Python/SQLite runtime or production infrastructure. It adds no database migration.

## Enforced paths

- `CrmService` validates every tenant argument against `TenantContext` before reading encrypted CRM credentials or invoking an adapter.
- `BranchesService` derives its Prisma predicate from the confirmed request context.
- Authenticated tenant profile reads require matching `User.id`, legacy `tenantId` and an active Membership for the current tenant.
- Authenticated tenant profile updates use the same tenant and Membership predicates in `updateMany`; a known foreign user ID is returned as not found and is not mutated.
- Appointment create and preview load the client through the tenant-scoped user path.
- Self-serve onboarding runs initial CRM setup inside an isolated system context bound to the tenant ID returned by the server-side create operation.

Explicit tenant arguments remain temporarily for service-call compatibility. They are assertions, not authority: a different context tenant is rejected before Prisma or an external adapter is called.

## Trusted system context

`TenantContextService.runAsSystemTenant` is only for backend-controlled bootstrap and job work. The tenant ID must come from a freshly created database entity or a trusted job partition, never from an unverified request header, body or query parameter. Nested execution preserves the request ID and restores the parent context afterward.

## Verification

```bash
cd maya-saas-backend
npm run prisma:generate
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
```

Focused security regression tests:

```bash
npm test -- --runInBand \
  src/tenancy/tenant-context.service.spec.ts \
  src/crm/crm.service.spec.ts \
  src/branches/branches.service.spec.ts \
  src/users/users.service.spec.ts \
  src/appointments/appointments.service.spec.ts \
  src/appointments/tenant-appointment.repository.spec.ts \
  src/onboarding/onboarding.service.spec.ts
```

## Remaining isolation work

- Move branding writes, billing persistence and audit persistence behind context-aware tenant repositories while preserving dedicated platform and webhook entry points.
- Separate global Identity from tenant-specific Customer/Provider records in the universal domain model.
- Add explicit system-context partitioning for background sync jobs and provider webhooks.
- Add PostgreSQL RLS only after all request, webhook and job transactions reliably set transaction-local tenant context.

Production remains on the existing runtime until a separately reviewed migration and cutover is approved.
