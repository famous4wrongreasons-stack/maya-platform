# CYCLE 06 — PACKAGE 5 WAVE 4 A27/A28 RUNTIME CONTRACT GATE

Status: **PASS — exact scope and 12 governed actions fixed; common schema is sufficient**

Accepted checkpoint: `59fc9787`

Gate date: 2026-09-03

## 1. Exact Wave 4 scope

The approved implementation plan and the post-Wave-3 checkpoint fix Wave 4
as reduced `A27` plus `A28`.

- reduced A27 owns ordinary `TenantCatalogItem(kind=inventory)` lifecycle and
  authenticated business-review fact acceptance;
- A28 owns Maya internal-calendar service/provider configuration, weekly
  availability, time off and provider-avatar object storage;
- P4-09 remains the sole authority for certificate, membership and referral
  value configuration;
- onboarding-only internal-calendar provisioning remains the already closed
  A26 bootstrap protocol and is not reclassified as a Wave 4 user command.

## 2. Exact governed action inventory

The twelve Action Engine action classes are:

1. `create_inventory_item`;
2. `update_inventory_item`;
3. `archive_inventory_item`;
4. `create_internal_service`;
5. `update_internal_service`;
6. `archive_internal_service`;
7. `create_internal_provider`;
8. `update_internal_provider`;
9. `replace_weekly_availability`;
10. `create_time_off`;
11. `delete_time_off`;
12. `upload_provider_avatar`.

Review ingestion is deliberately not a thirteenth action. An authenticated
external review is an AC4 source fact: its provider-qualified identity is
accepted once and identical replay converges. Changed evidence under the same
source identity fails closed. No actor or `ActionExecution` is fabricated.

`WAVE 4 FAMILIES: reduced A27, A28`

`WAVE 4 ACTION CLASSES: 12`

## 3. Authority and ownership

### reduced A27

Inventory commands are AC1 local governed commands. The target is tenant plus
immutable inventory item id and generation. Current production mutation
ownership remains in `BusinessContentService` until the separately approved
cutover. D4-A means delete is durable archive (`active=false`), never physical
deletion.

Certificate and membership rows, canonical templates, current offer versions
and replacement lineage are rejected/delegated to P4-09. Wave 4 never writes
`TenantCatalogItemValueVersion`.

Review acceptance is AC4. The exact source identity is tenant + provider
source + external review id. Source facts are append-only/idempotent; text
remains encrypted and Action evidence receives no review text.

### A28

All calendar configuration actions are exact-target AC1 local commands except
provider-avatar upload, which is AC2 because the object store can commit while
the caller loses the response. Current production owners remain
`InternalCalendarService` and `BrandingService` until cutover.

Actor authority is resolved from the active tenant membership. One command
targets one inventory item, service, provider, provider-week, time-off record
or provider avatar. Bulk mutation is forbidden.

## 4. Deterministic identities and concurrency

- create actions derive their internal target id from tenant and the bounded
  source occurrence;
- existing-target actions bind tenant, target kind, immutable target id and
  next `ActionTargetMutation` generation;
- `ActionExecution` stores only normalized hashes and internal references;
- one target generation can have one committed mutation fact;
- retry and restart reuse the same source identity and execution;
- target advisory locking plus serializable transactions and database
  uniqueness make concurrent duplicates converge or fail closed;
- cross-tenant item, branch, service, provider and time-off bindings are
  rejected by tenant-qualified lookups/FKs.

## 5. D4-A and D5-A

D4-A is executable without additional schema: inventory removal sets the
existing `active` field to false and preserves the immutable item identity and
mutation history.

D5-A is executable without effective-dated version models: calendar changes
affect future availability/configuration only. Existing Appointment rows,
including accepted service ids, time, duration boundaries, price and currency
snapshots, are never updated by Wave 4.

The existing `ActionTargetMutation`, tenant-qualified calendar relations,
Appointment snapshots and P4-09 offer/version models are sufficient.

`ADDITIONAL SCHEMA REQUIRED: NO`

## 6. External outcome contract

Local inventory/calendar mutations use PostgreSQL commit/rollback truth and
do not invent `UNKNOWN`.

Provider-avatar upload fixes a content hash and deterministic object request
identity before dispatch. Loss of response after object creation is
`UNKNOWN`; blind upload under a new key is forbidden. Reconciliation performs
an exact HEAD/read by the same request identity and content hash, then commits
the provider URL once. A proven missing object may return to a retryable
non-executed state; a conflicting object remains unresolved.

`UNKNOWN/RECONCILIATION: REQUIRED ONLY FOR upload_provider_avatar`

`BLIND RETRY AFTER UNKNOWN: NO`

## 7. Schema verdict and boundaries

No family-specific field or model is missing. No migration is authorized or
created. No historical rows are backfilled. The common Package 5 foundation
is reused exactly as approved.

The current production owners intentionally remain active until the separate
Wave 4 production cutover cycle. The local ratchet pins those owners and is
ready to invert at cutover without broad directory exclusions.

`PACKAGE 5 WAVE 4 RUNTIME CONTRACT GATE: PASS`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`NEW BUSINESS DECISION REQUIRED: NO`

`PRODUCTION BUSINESS/PROVIDER MUTATIONS: 0`

`CHAPTER 7 STARTED: NO`
