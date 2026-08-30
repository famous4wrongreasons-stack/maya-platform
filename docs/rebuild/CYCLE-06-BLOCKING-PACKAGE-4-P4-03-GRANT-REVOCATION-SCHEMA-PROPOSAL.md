# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 GRANT REVOCATION SCHEMA PROPOSAL

Status: **PROPOSAL ONLY — NOT IMPLEMENTED OR APPLIED**
Source contract checkpoint: `9b7bd4eb`
Report date: 2026-08-30

## 1. Gap

`LoyaltyRedemptionGrant` currently represents immutable issue facts, expiry,
and an optional one-time `LoyaltyRedemption`. It cannot distinguish an active
grant from an explicitly revoked grant. `expiresAt` is immutable and must not
be rewritten as revocation. An audit string or unbound `ActionExecution` is
not a tenant-qualified claim on the grant.

P4-03 therefore cannot prove `revoked grant -> consume rejected` without one
additional durable domain fact.

## 2. Minimal Additive Model

Add one domain-specific append-only model:

`LoyaltyRedemptionGrantRevocation`

| Field               | Nullability      | Contract                                                   |
| ------------------- | ---------------- | ---------------------------------------------------------- |
| `id`                | required         | immutable row identity                                     |
| `tenantId`          | required         | authoritative tenant                                       |
| `grantId`           | required         | exact grant being revoked                                  |
| `actionExecutionId` | required         | canonical revoke execution; no invented historical binding |
| `reasonCode`        | required         | bounded server-derived reason code; no free-form payload   |
| `revokedAt`         | required         | server timestamp of accepted revoke                        |
| `createdAt`         | required/default | append timestamp                                           |

Required relations and constraints:

- tenant-qualified FK `(grantId, tenantId)` ->
  `LoyaltyRedemptionGrant(id, tenantId)`, `RESTRICT` update/delete;
- tenant-qualified FK `(actionExecutionId, tenantId)` ->
  `ActionExecution(id, tenantId)`, `RESTRICT` update/delete;
- unique `(grantId, tenantId)`: zero or one revoke fact per grant;
- unique `(actionExecutionId, tenantId)`: one revoke execution cannot revoke
  several grants;
- unique/indexable `(id, tenantId)` plus lookup index
  `(tenantId, revokedAt)`;
- check/enum restricting `reasonCode` to `client_request`,
  `owner_or_admin_request`, `service_withdrawn`, `suspected_compromise`, or
  `policy_invalidated`;
- immutable trigger rejecting clear/change/transfer of grant, tenant,
  execution, reason, or timestamp after insert.

Add the optional `revocation` relation to `LoyaltyRedemptionGrant` and the
corresponding one-to-one relation to `ActionExecution`. Do not add a generic
financial workflow, mutable `status`, raw code, free-form reason, provider
state, or duplicated actor authority.

## 3. Terminal-State Concurrency Guard

Uniqueness inside each terminal table is insufficient because a grant could
otherwise acquire one redemption and one revocation concurrently. The
migration must add symmetric DB guards:

1. before inserting a revocation, lock the parent grant row with
   `SELECT ... FOR UPDATE`, reject expired or already redeemed grants, then
   allow the unique revocation claim;
2. before inserting a redemption, lock the same parent grant row, reject
   expired or already revoked grants, then allow the existing unique
   redemption claim.

The common parent-row lock serializes consume/revoke races. Exactly one
terminal fact may commit; the loser fails closed. Runtime prechecks are useful
for error messages but do not replace this DB invariant.

The existing grant and redemption immutable guards remain in force. A
revocation row is never updated or deleted to reactivate a grant.

## 4. Compatibility And Migration Shape

The change is additive:

- create one empty table, indexes, FKs, check/enum, and triggers;
- add Prisma relations only;
- do not alter or backfill existing grant/redemption rows;
- do not invent revocation facts or `ActionExecution` bindings;
- historical grants remain active/expired/consumed according to their existing
  issue, expiry, and redemption facts;
- no production migration is authorized by this proposal.

Because `actionExecutionId` is required, every future revocation must enter
through Canonical Action Ingress and the Action Engine. There is intentionally
no nullable legacy escape hatch: the repository contains no accepted durable
legacy revocation source to backfill.

## 5. Required Structural Proof Before Acceptance

The eventual Schema Gate/migration must prove on PostgreSQL:

- valid active grant revoke succeeds;
- same logical revoke converges on one execution/fact;
- second revoke is rejected;
- consume after revoke is rejected;
- revoke after consume is rejected;
- expired grant revoke/consume is rejected without rewriting expiry;
- concurrent consume/revoke commits exactly one terminal fact;
- wrong-tenant grant or execution binding is rejected;
- replacing, clearing, or transferring the binding is rejected;
- existing rows replay unchanged and no fake backfill appears;
- clean migration replay, Prisma validation, and zero drift.

## 6. Decision

`PROPOSED MODEL: LoyaltyRedemptionGrantRevocation`

`RELATION SEMANTICS: GRANT 0..1 REVOCATION; EXECUTION 1..1 REVOCATION`

`TENANT-QUALIFIED FK: REQUIRED`

`IMMUTABLE AFTER INSERT: YES`

`CONSUME/REVOKE RACE DB-SERIALIZED: REQUIRED`

`HISTORICAL BACKFILL: NONE`

`ADDITIVE MIGRATION REQUIRED: YES`

`MIGRATION AUTHORED: NO`

`PRODUCTION MIGRATION APPLIED: NO`

STOP. This proposal requires explicit acceptance before any schema or runtime
implementation.
