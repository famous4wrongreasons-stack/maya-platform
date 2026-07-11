# Test Strategy

## Quality gates

Every backend change runs production typecheck, lint, unit/integration tests and build. Schema changes also run Prisma validation/generation and migration smoke tests against disposable PostgreSQL.

## Test layers

| Layer | Purpose |
|---|---|
| unit/domain | status transitions, entitlement resolution, metric formulas, policy decisions |
| repository integration | real PostgreSQL constraints, tenant filters, transactions and idempotency |
| API contract | DTO validation, stable errors, auth and version compatibility |
| adapter contract | every CRM connector against the same normalized behavior suite |
| security | cross-tenant IDOR, permissions, webhook signatures, secret redaction |
| end-to-end smoke | signup, login, config, preview/live booking and admin flows |

## Critical tenant matrix

Create tenant A and B with users, memberships, branches, appointments, CRM configs and branding. For every tenant-scoped aggregate test list/get/create/update/delete using:

- correct tenant and owner;
- correct tenant but wrong owner/scope;
- foreign resource ID;
- forged route/body/header tenant ID;
- stale/suspended membership;
- platform actor with and without an explicitly allowed platform endpoint.

No test may reuse the same fixture IDs/data for both tenants because shared fixtures can hide missing filters.

## Required suites

- TenantContext lifecycle and fail-closed behavior.
- Public-auth tenant conflict, one-time phone challenge and OAuth state replay behavior.
- Database rejection of a social identity linked to a user from another tenant.
- Membership activation/suspension.
- Tenant-scoped Appointment repository read/update isolation.
- Feature registry validation and entitlement precedence.
- Branding token defaults and tenant overrides.
- CRM adapter contract and tenant-specific fixtures.
- Webhook verification/idempotency.
- Analytics formula/version fixtures.
- Commerce ledger and reversal invariants.
- AI tool permission/feature/confirmation policy.

## Migration testing

1. Apply migrations to an empty database.
2. Apply them to a snapshot-shaped pre-migration schema.
3. Verify membership backfill row counts and uniqueness.
4. Run seed twice to prove idempotency.
5. Validate default Maya and demo tenant have independent config/data.
6. Run down/rollback procedure where the migration technology supports it; otherwise document forward recovery.

## CI expectations

- No live provider credentials.
- Mock CRM, SMS, payment and AI transports are deterministic.
- Flaky network tests are separated from required checks.
- Coverage is used to identify blind spots, not as a substitute for isolation scenarios.
