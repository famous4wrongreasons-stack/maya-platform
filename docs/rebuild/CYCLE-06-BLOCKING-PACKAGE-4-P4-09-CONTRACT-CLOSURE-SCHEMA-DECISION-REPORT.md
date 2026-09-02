# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 CONTRACT CLOSURE SCHEMA DECISION REPORT

Status: **STOPPED AT APPROVED SCHEMA-DECISION BOUNDARY**

Source checkpoint: `fe79cd46`

Report date: 2026-09-02

## 1. Decision applied

The approved Option A clarification was applied to the contract documents:

- `TenantCatalogItem` is the tenant-specific canonical offer authority;
- `TenantCatalogItem.id` is the primary immutable internal Maya offer
  identity;
- `externalRef` remains an integration/provider alias and is excluded from
  logical identity;
- every value-bearing change requires a new immutable value version;
- every non-no-op value change requires exact same-tenant owner approval;
- approved one-target and monetary/liability caps remain unchanged;
- configuration is prospective and cannot rewrite issued/frozen value.

## 2. Schema decision

The current schema is not sufficient for the clarified contract. It stores
only a mutable current `TenantCatalogItem`/`ReferralProgram` projection and
does not durably bind an append-only current value version to its creator
ActionExecution. Runtime snapshots alone cannot enforce the required version
chain or prevent an unversioned direct value update.

The minimum additive proposal is documented in:

`CYCLE-06-BLOCKING-PACKAGE-4-P4-09-IMMUTABLE-OFFER-VALUE-VERSION-SCHEMA-PROPOSAL.md`.

No Prisma schema, SQL migration, runtime, controller, Shadow, executor, or
ratchet was changed. No local or production configuration/value row was
created or modified.

## 3. Stop verdict

`P4-09 CONTRACT CLOSURE: BLOCKED — SCHEMA FOUNDATION REQUIRED`

`CANONICAL OFFER AUTHORITY: TenantCatalogItem`

`PRIMARY OFFER IDENTITY: IMMUTABLE INTERNAL ID`

`externalRef PRIMARY IDENTITY: NO`

`VERSIONED OFFER VALUE: NOT ENFORCED BY CURRENT SCHEMA`

`RETROACTIVE VALUE MUTATION POSSIBLE: NO`

`OWNER APPROVAL FOR VALUE CHANGE: CONTRACT APPROVED / NOT IMPLEMENTED`

`BLAST-RADIUS CAPS: CONTRACT APPROVED / NOT IMPLEMENTED`

`P4-09 SHADOW ACTION CLASSES: 0/7`

`P4-09 EXECUTABLE PROOF: NOT RUN`

`LEGACY BYPASS RATCHET READY: NO`

`REAL PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`READY FOR P4-09 PRODUCTION CUTOVER: NO`

STOP.
