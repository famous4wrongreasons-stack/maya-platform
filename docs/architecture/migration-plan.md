# Migration Plan

## Strategy

Use a strangler migration with reversible route-by-route cutover. The existing Maya tenant must remain functional at every phase.

## Phase 0: audit and baseline

- Freeze critical booking, login, payment and AI behaviors in tests.
- Document data ownership and production dependencies.
- Record baseline commands and known technical debt.

## Phase 1: tenancy foundation

- Add Membership without removing `User.tenantId`/`role`.
- Add server-side tenant resolution and request context.
- Backfill memberships and create default Maya/demo tenants.
- Move Appointment persistence behind a tenant-scoped repository.
- Add cross-tenant security tests.

Exit: a tenant A session cannot read or mutate tenant B appointments, even when it knows their IDs.

## Phase 2: branding and entitlements

- Normalize Feature and PlanEntitlement records.
- Keep `featuresJson` as a compatibility projection.
- Add tenant-level overrides with explicit allow/deny semantics.
- Expand BrandingConfig and expose stable design tokens.
- Add backend feature guards before frontend navigation changes.

## Phase 3: universal domain

- Add Organization, Location, Customer, Provider, Service and Booking modules.
- Introduce compatibility adapters from legacy salon/master/client terminology.
- Define source-of-truth policy and external ID mappings.

## Phase 4: Solo

- Add internal scheduling, customers, expenses and analytics.
- Migrate only tenants that select Maya as source of truth.

## Phase 5: Business

- Complete CRM sync jobs, cursors, retries, webhooks and health.
- Move customer experience endpoints to normalized read models.

## Phase 6: Business+

- Add commerce ledger, certificates, memberships, referrals, team chat and expanded analytics.

## Phase 7: Maya AI Core

- Add typed tool registry, policy engine, approvals and channel-neutral orchestration.
- Migrate Telegram/native handlers tool by tool.

## Phase 8: hardening and cutover

- Add RLS, outbox, idempotency, observability, backup/restore and data export/deletion workflows.
- Run shadow reads, parity reports and tenant-by-tenant cutover.
- Retire legacy code only after rollback windows close.

## Data migration mechanics

- All migrations are additive until parity is proven.
- Backfills use stable slugs and idempotent upserts.
- Existing user tenant fields remain writable during compatibility period; membership is written in the same transaction.
- Dual-read is allowed temporarily; silent dual-write without reconciliation is not.
- Production migration requires backup, dry run, row-count/hash reconciliation and documented rollback.

## Rollback

- Before route cutover, legacy remains authoritative.
- Feature flags can return a route to legacy without deleting new data.
- Additive schema changes remain in place during rollback; dropping columns/tables requires a later reviewed migration.
