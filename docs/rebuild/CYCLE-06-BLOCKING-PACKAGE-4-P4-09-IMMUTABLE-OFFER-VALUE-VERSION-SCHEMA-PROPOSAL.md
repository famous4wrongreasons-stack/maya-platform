# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 IMMUTABLE OFFER VALUE VERSION SCHEMA PROPOSAL

Status: **PROPOSED — APPROVAL REQUIRED; NOT IMPLEMENTED**

Source decision: `fe79cd46` plus the approved Option A identity clarification

Proposal date: 2026-09-02

## 1. Why the current schema is insufficient

The approved contract requires:

- `TenantCatalogItem` as tenant-specific canonical offer authority;
- an internal immutable Maya offer identity;
- `externalRef` only as an integration/provider alias;
- a new immutable offer version for every value-bearing change;
- no overwrite of an existing version;
- an exact version binding from P4-05/P4-06 checkout and from P4-04 referral
  issuance.

The current schema cannot enforce that contract:

1. `TenantCatalogItem.id` exists, but there is no DB guard preventing identity,
   tenant, or kind reassignment.
2. `priceKopecks`, `currency`, and `active` are overwritten in place.
3. No append-only version row, contiguous predecessor claim, current-version
   pointer, or tenant-qualified ActionExecution binding exists.
4. `updatedAt` identifies only the current projection and does not retain an
   immutable typed previous version.
5. ActionExecution can retain evidence, but no FK proves that one exact
   execution created the currently authoritative offer version.
6. `externalRef` is optional and historically integration-owned; using it as
   primary identity would violate the approved clarification.
7. `ReferralProgram` is likewise overwritten in place even though future
   referral value must use a precise immutable policy version.

Therefore runtime-only alignment would leave direct/unversioned value writes
possible and would not satisfy the approved DB-level contract.

`CAN EXISTING SCHEMA ENFORCE IMMUTABLE OFFER VERSIONS: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

## 2. Minimal additive model

The foundation adds two domain-specific append-only version models. A generic
JSON configuration ledger is rejected because it could not enforce the
different subscription/certificate and referral denomination contracts.

### 2.1 `TenantCatalogItemValueVersion`

Proposed fields:

| Field | Contract |
| --- | --- |
| `id` | immutable internal Maya value-version id |
| `tenantId` | exact tenant; part of every FK and uniqueness claim |
| `offerId` | immutable `TenantCatalogItem.id`; primary offer identity |
| `actionExecutionId` | unique tenant-qualified creator execution |
| `previousVersionId` | nullable only for version 1; same offer/tenant |
| `version` | positive contiguous integer starting at 1 |
| `templateKey` | immutable server-owned known P4-05/P4-06 template key; not an external identity |
| `offerKind` | `membership` or `certificate`; must match parent kind |
| `priceKopecks` | positive frozen value inside the approved kind cap |
| `currency` | frozen `RUB` for version 1 |
| `availabilityState` | `ACTIVE`, `INACTIVE`, or terminal `RETIRED` |
| `valueSnapshotHash` | deterministic hash of exact typed version facts |
| `createdAt` | immutable database timestamp |

Required relations and claims:

- unique `(id, tenantId)`;
- unique `(offerId, tenantId, version)`;
- unique `(actionExecutionId, tenantId)`;
- unique `(previousVersionId, tenantId)` so one version has at most one
  successor;
- tenant-qualified FK to `TenantCatalogItem`;
- tenant-qualified FK to `ActionExecution`;
- self-FK for the predecessor;
- append-only trigger rejecting UPDATE/DELETE;
- trigger requiring predecessor version `n-1`, same tenant, offer, kind, and
  template key;
- trigger requiring an approved same-tenant P4-09 ActionExecution for the
  exact action class and offer target;
- checks enforcing membership `<= 600000` kopecks, certificate `<= 500000`
  kopecks, and one non-bulk target.

### 2.2 Current catalog pointer and identity guard

Add nullable-for-history fields to `TenantCatalogItem`:

- `canonicalTemplateKey` — server-owned template classification, never a
  provider/external identity;
- `currentValueVersionId` — exact current authoritative version.

Add the tenant-qualified current-version relation and these guards:

- `id`, `tenantId`, and `kind` are immutable after insert;
- once established, `canonicalTemplateKey` is immutable;
- a non-null current version must belong to the same tenant, offer, kind, and
  template key;
- the pointer moves only to the unique direct successor;
- value-bearing projection columns may change only in the same transaction as
  that pointer and must exactly match the pointed version;
- a `RETIRED` version is terminal for the internal offer identity;
- API delete becomes a `RETIRED` version, not physical row deletion;
- `externalRef` remains outside all version identity/FK claims and keeps its
  historical alias semantics.

Historical catalog rows retain nullable template/version fields until a later
controlled materialization gate. No fake version is backfilled.

### 2.3 `ReferralProgramValueVersion`

Proposed fields:

| Field | Contract |
| --- | --- |
| `id` | immutable internal referral-policy version id |
| `tenantId` | exact tenant |
| `programId` | exact tenant `ReferralProgram.id` |
| `actionExecutionId` | unique creator execution |
| `previousVersionId` | nullable only for version 1 |
| `version` | positive contiguous integer |
| `enabled` | frozen policy enablement |
| fixed/percent reward fields | exact inviter/invitee denomination facts |
| liability cap fields | exact P4-04 maximum liability per slot |
| `currency` | frozen version currency |
| `valueSnapshotHash` | deterministic typed policy hash |
| `createdAt` | immutable database timestamp |

It has the equivalent tenant-qualified offer/program, execution, predecessor,
contiguous-version, one-successor, and append-only constraints.

The existing P4-04 checks remain and are repeated at the version boundary:

- one slot is absent, fixed money, or percentage with explicit cap;
- mixed denomination facts fail;
- liability is at most `50000` kopecks per slot;
- total configured liability is at most `100000` kopecks;
- there are at most two recipient slots;
- no implicit points conversion exists.

Add nullable-for-history `ReferralProgram.currentValueVersionId`. Value fields
may change only with a matching direct successor version. `terms` and
`codePrefix` remain non-value presentation fields and do not define version
identity unless a request also changes value-bearing facts.

## 3. Approval and ActionExecution binding

Every non-no-op version references one unique ActionExecution whose immutable
contract proves:

- the exact internal offer/program id;
- previous version id and snapshot hash;
- desired typed version facts;
- one-target blast radius;
- active same-tenant requester and owner approver;
- approval bound to the exact desired snapshot;
- approved P4-09 action class;
- local-only retry/reconciliation policy.

The version insert and current-pointer/projection update occur in the same
serializable PostgreSQL transaction as the domain mutation. The execution is
finalized from the exact committed version. A crash after commit reconciles
from the execution-version binding; a rollback leaves neither a version nor a
projection change.

No-op requests return the exact current version and create no version or value
effect. A stale predecessor fails closed with `configuration_conflict`.

## 4. Consumer binding

After later controlled materialization and runtime convergence:

- P4-05 purchase binds `offerId`, exact `currentValueVersionId`,
  `valueSnapshotHash`, template facts, price, and currency before provider
  dispatch;
- P4-06 purchase binds the equivalent certificate facts before provider
  dispatch;
- activation trusts the paid checkout snapshot, never a later current version;
- P4-04 reward issuance binds the exact
  `ReferralProgramValueVersion.id`/snapshot and writes its already immutable
  reward facts;
- downstream aggregates keep their existing immutable snapshot hashes and
  value columns; no historical row is rewritten and no additional downstream
  FK is required for historical compatibility.

An absent, inactive, retired, unversioned, cross-tenant, or mismatched current
version fails closed. Static P4-05/P4-06 fallback is forbidden after a tenant
is switched to canonical offer authority.

## 5. Historical compatibility and materialization

The migration is additive and performs no fake backfill:

- existing `TenantCatalogItem` rows remain readable with null template/current
  version pointers;
- existing `ReferralProgram` rows remain readable with a null current version;
- existing subscriptions, certificates, referrals, rewards, checkouts, and
  payments are untouched;
- unversioned historical configuration is not canonical future-value
  authority until a separate read-first production materialization gate;
- materialization creates exact initial version 1 rows only after source
  reconciliation and explicit production approval.

## 6. PostgreSQL proof required before production migration

The future foundation must prove at least:

1. internal offer id is immutable and `externalRef` is not identity;
2. version 1 binds one exact tenant/offer/template/execution;
3. value update appends version 2 and does not update version 1;
4. retry returns the same version;
5. concurrent version creation has one winner;
6. stale predecessor is rejected;
7. version numbers are contiguous;
8. one predecessor cannot have two successors;
9. pointer cannot skip, move backward, or cross offer/tenant/kind;
10. projection cannot change without a matching version;
11. logical retirement is terminal and preserves history;
12. referral versions enforce denomination and aggregate caps;
13. ActionExecution/value-version bindings are immutable;
14. non-owner or changed approval snapshot is rejected;
15. historical null pointers remain compatible;
16. fake historical version backfill is zero;
17. existing issued/frozen customer value remains byte/value unchanged;
18. clean replay, Prisma validation, and drift are green.

## 7. Scope exclusions

This proposal does not authorize:

- schema implementation or migration apply;
- catalog/referral configuration materialization;
- P4-09 Shadow or executable runtime;
- new product templates, currencies, terms, service scopes, or value types;
- provider writes, payments, customer-value issuance, or retroactive updates;
- Package 5 or Chapter 7 work.

## 8. Proposal verdict

`P4-09 CONTRACT CLOSURE: BLOCKED — SCHEMA FOUNDATION REQUIRED`

`CANONICAL OFFER AUTHORITY: TenantCatalogItem`

`PRIMARY OFFER IDENTITY: IMMUTABLE INTERNAL TenantCatalogItem.id`

`externalRef PRIMARY IDENTITY: NO`

`VERSIONED OFFER VALUE ENFORCED BY CURRENT SCHEMA: NO`

`MINIMAL APPEND-ONLY OFFER VERSION MODEL REQUIRED: YES`

`MINIMAL APPEND-ONLY REFERRAL POLICY VERSION MODEL REQUIRED: YES`

`OWNER APPROVAL FOR VALUE CHANGE: CONTRACT APPROVED / SCHEMA BINDING NOT IMPLEMENTED`

`BLAST-RADIUS CAPS: CONTRACT APPROVED / SCHEMA CONSTRAINTS NOT IMPLEMENTED`

`RETROACTIVE VALUE MUTATION POSSIBLE: NO`

`P4-09 SHADOW ACTION CLASSES: 0/7`

`P4-09 EXECUTABLE PROOF: NOT RUN`

`LEGACY BYPASS RATCHET READY: NO`

`PRODUCTION CONFIG/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`READY FOR P4-09 SCHEMA FOUNDATION: NO — EXPLICIT SCHEMA PROPOSAL APPROVAL REQUIRED`

`READY FOR P4-09 PRODUCTION CUTOVER: NO`

STOP.
