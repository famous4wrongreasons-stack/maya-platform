# CYCLE 06 BLOCKING PACKAGE 4 — P4-09 OFFER REPLACEMENT LINEAGE SCHEMA PROPOSAL

Status: **PROPOSED — APPROVAL REQUIRED; NOT IMPLEMENTED**

Source checkpoint: `e4bba766`

Proposal date: 2026-09-02

## 1. Discovered contract conflict

The approved P4-09 authority contract requires both of these facts:

1. a `RETIRED` value version is terminal for its immutable internal
   `TenantCatalogItem.id`;
2. a later replacement for the same known server template receives a new
   immutable internal offer id.

The production-applied foundation currently also enforces unconditional
uniqueness of:

`(tenantId, kind, canonicalTemplateKey)`

That uniqueness remains occupied by the retained retired row. Physical delete
is forbidden and the version insert guard rejects a successor after
`RETIRED`. Therefore a later exact-template replacement cannot be represented:

```text
offer A / template T -> RETIRED
offer B / template T / new internal id -> rejected by unique constraint
offer A / template T -> reactivated -> rejected by terminal version guard
```

Choosing either behavior would change the approved business/identity contract.
Runtime must not invent that choice.

`CURRENT SCHEMA REPRESENTS TERMINAL RETIREMENT: YES`

`CURRENT SCHEMA REPRESENTS NEW-ID REPLACEMENT: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

## 2. Minimal additive lineage fact

Add one nullable-for-first-identity self-reference to `TenantCatalogItem`:

`supersedesOfferId String?`

Required relation:

- tenant-qualified FK `(supersedesOfferId, tenantId)` to
  `TenantCatalogItem(id, tenantId)`;
- unique `(supersedesOfferId, tenantId)` so one retired identity has at most
  one direct replacement;
- immutable after insert;
- nullable only for the first internal identity in a template lineage.

No external/provider alias participates. `externalRef` remains mutable and
outside identity and lineage.

## 3. Replace unconditional template uniqueness

Remove only the unconditional database unique index:

`TenantCatalogItem_tenantId_kind_canonicalTemplateKey_key`

Replace it with database guards enforcing:

- at most one **non-retired** canonical internal offer per
  `(tenantId, kind, canonicalTemplateKey)`;
- an inactive version still retains authority and therefore still blocks a
  second identity;
- a retired version remains immutable historical state but releases the live
  authority slot only to its one exact successor;
- historical rows with `canonicalTemplateKey = NULL` remain compatible.

Because PostgreSQL cannot express the current version's retirement state in a
single-table partial index, use a deferred constraint trigger over
`TenantCatalogItem.currentValueVersionId -> TenantCatalogItemValueVersion`.
The guard runs under a template-qualified advisory transaction lock.

## 4. Replacement insertion contract

For a first canonical identity:

- `supersedesOfferId = NULL`;
- no canonical identity for the same tenant/kind/template may already exist.

For a replacement identity:

- `supersedesOfferId` points to the exact prior internal id;
- predecessor tenant, kind and template match;
- predecessor current value version is exactly `RETIRED`;
- no row already supersedes that predecessor;
- no other non-retired authority exists for the template;
- initial value version is generation `1` for the new internal identity;
- the create ActionExecution identity includes the exact predecessor id,
  predecessor retirement version/execution and desired new snapshot.

The existing per-offer value-version chain remains unchanged. A replacement
starts a new chain because it is a genuinely new internal offer identity.

## 5. Concurrency and retry

The follow-up migration must extend the offer creation/version guard with an
advisory lock qualified by:

`tenant + kind + canonicalTemplateKey`

Under that lock:

- concurrent first creates have one winner;
- concurrent replacements of one retired predecessor have one winner;
- retry/restart resolves to the same new internal id and version-1 execution;
- two different new ids cannot fork from one retired predecessor;
- a stale predecessor or a predecessor that is not retired fails closed;
- cross-tenant, cross-kind and cross-template lineage fails closed.

## 6. Historical and production compatibility

The proposal is additive except for replacing the conflicting unique index:

- `supersedesOfferId` is nullable with no fake backfill;
- existing unversioned historical catalog rows remain readable;
- existing immutable value versions remain unchanged;
- existing issued subscriptions, certificates and referral rewards remain
  unchanged;
- the current production version tables contain zero rows, so no live
  canonical lineage needs inference during this proposal;
- no production materialization or configuration mutation is authorized.

## 7. Required PostgreSQL proof

A future foundation must prove:

1. first identity for a template succeeds once;
2. concurrent first identity creation has one winner;
3. second live identity for the same template is rejected;
4. inactive identity still blocks replacement;
5. retirement remains terminal for the old internal id;
6. replacement before retirement is rejected;
7. replacement after retirement receives a different immutable internal id;
8. replacement binds the exact retired predecessor;
9. retry/restart returns the same replacement identity;
10. concurrent replacement has one winner;
11. one predecessor cannot have two successors;
12. a second retirement/replacement cycle forms a contiguous identity lineage;
13. `externalRef` reuse/change does not affect the lineage;
14. cross-tenant/kind/template binding is rejected;
15. previous value versions and issued/frozen value remain unchanged;
16. historical null lineage remains compatible;
17. fake historical backfill is zero;
18. clean replay, Prisma validation and drift are green.

## 8. Scope exclusions

This proposal does not authorize:

- migration implementation or production apply;
- P4-09 runtime alignment, Shadow 7/7 or executable proof;
- offer materialization or any production configuration/value mutation;
- a change to approved templates, caps, approval or retirement semantics;
- provider writes, Package 5 or Chapter 7 work.

## 9. Proposal verdict

`TERMINAL RETIREMENT CONTRACT PRESERVED: YES`

`NEW INTERNAL ID ON REPLACEMENT PRESERVED: YES — PROPOSED`

`MINIMAL LINEAGE FIELD REQUIRED: supersedesOfferId`

`UNCONDITIONAL TEMPLATE UNIQUE CONSTRAINT CAN REMAIN: NO`

`ONE LIVE AUTHORITY PER TENANT/KIND/TEMPLATE REQUIRED: YES`

`INACTIVE OFFER RELEASES AUTHORITY SLOT: NO`

`RETIRED OFFER RELEASES AUTHORITY SLOT: YES — ONLY TO EXACT SUCCESSOR`

`externalRef PARTICIPATES IN IDENTITY/LINEAGE: NO`

`FAKE HISTORICAL LINEAGE BACKFILL: FORBIDDEN`

`ADDITIONAL SCHEMA REQUIRED: YES`

`READY FOR SCHEMA FOUNDATION: NO — EXPLICIT APPROVAL REQUIRED`
