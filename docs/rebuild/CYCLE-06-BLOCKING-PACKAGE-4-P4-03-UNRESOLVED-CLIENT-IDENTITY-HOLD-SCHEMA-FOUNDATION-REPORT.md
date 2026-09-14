# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 UNRESOLVED CLIENT IDENTITY HOLD SCHEMA FOUNDATION REPORT

Status: **SCHEMA FOUNDATION COMPLETE; PRODUCTION MIGRATION NOT APPLIED**

Source checkpoint: `fc64ef52`

Report date: 2026-08-31

## 1. Scope and schema decision

This step implements only the minimal `UnresolvedClientIdentityHold` model
approved by the Unresolved Identity Continuity Exception Gate. It does not try
to resolve the `P02/P03` collision.

One row represents one tenant-qualified collision identity:

`tenantId + provider + externalId`.

The row does not store raw legacy principal identifiers or any phone, name,
bearer secret, balance, points, or ledger payload. Multiple principals inside
the collision group are represented by:

- immutable `unresolvedPrincipalCount` (`>= 2`); and
- immutable `sourceEvidenceHash`, a lowercase SHA-256 digest of the separately
  controlled source manifest.

No generic workflow, member table, guessed Client ownership, or loyalty value
container was introduced.

## 2. Additive migration

Migration:

`prisma/migrations/20260831110000_unresolved_client_identity_hold/migration.sql`

It performs only these additive operations:

- creates `UnresolvedClientIdentityHold`;
- adds the tenant FK;
- adds the optional tenant-qualified resolution FK to `ActionExecution`;
- adds the unique deterministic runtime lookup on
  `(tenantId, provider, externalId)`;
- adds the active-hold lookup index;
- restricts the reason to `loyalty_identity_unresolved`;
- requires a non-empty provider, external identity, and source namespace;
- requires a lowercase 64-character evidence hash;
- requires at least two unresolved principals;
- requires the resolution timestamp and execution binding to be both null or
  both non-null;
- requires every new hold to start active;
- makes collision identity, reason, evidence, cardinality, and creation time
  immutable;
- rejects deletion of an active hold;
- allows resolution only once and rejects clearing or replacing it.

The resolution relation is tenant-qualified. A resolution execution belonging
to another tenant is rejected by PostgreSQL.

The migration contains no identity registration, Client/CrmClientLink write,
loyalty write, fake backfill, merge, provider write, or historical correction.

## 3. PostgreSQL structural proof

All executable checks ran sequentially against disposable local PostgreSQL
databases created from a clean replay of all repository migrations.

| Check | Result |
| --- | --- |
| Valid two-principal collision hold | PASS |
| Deterministic P02/P03 representation in one group | PASS — count `2` plus evidence digest |
| Duplicate tenant/provider/external identity | REJECTED by unique constraint |
| Hold with missing tenant | REJECTED by FK |
| Cross-tenant resolution execution | REJECTED by composite FK |
| Same-tenant one-way resolution | PASS |
| Clear established resolution | REJECTED |
| Replace established resolution execution | REJECTED |
| Single-principal hold | REJECTED by count check |
| Rebind hold to another provider identity | REJECTED by immutable trigger |
| Replace evidence digest or principal count | REJECTED by immutable trigger |
| Delete active hold | REJECTED |
| Insert an already-resolved hold | REJECTED |
| Historical tenant with no hold | PRESERVED; zero inferred hold rows |
| Client rows created | `0` |
| CrmClientLink rows created | `0` |
| LoyaltyTransaction rows created | `0` |

The structural proof creates no production data and uses only synthetic opaque
references inside disposable databases.

## 4. Registration and mutation boundary

The unique active lookup makes a deterministic registration guard possible:

`tenantId + provider + externalId -> active hold`.

The existing Chapter 2 registration path and canonical loyalty ingress are
not changed by this schema-only step. Wiring those runtime guards requires a
separate approved step. Until that wiring and later production migration are
complete, this report proves representability and database integrity, not a
production runtime cutover.

The accepted fail-closed contract remains:

- automatic canonical registration for the held identity: forbidden;
- automatic loyalty mutation for the held identity: forbidden;
- legacy mutating fallback: forbidden;
- historical value: preserved read-only in the approved source partition.

## 5. Verification

| Verification | Result |
| --- | --- |
| Targeted schema ratchet | PASS — `1` suite / `7` tests |
| Targeted ESLint | PASS |
| Prisma validate | PASS |
| Clean migration replay | PASS — all `62` migrations |
| Migration status | up to date |
| Migrated database vs `schema.prisma` drift | NONE |
| Targeted PostgreSQL assertions | PASS |
| Tenant-qualified resolution proof | PASS |
| `git diff --check` | PASS |
| Temporary PostgreSQL databases created | `2` |
| Temporary PostgreSQL databases remaining | `0` |

The full backend suite, build, runtime tests, production migration, identity
establishment, FULL_LEDGER migration, and P4-03 cutover were intentionally not
run.

## 6. Safety and process hygiene

- Production migration applied: no.
- Production database accessed: no.
- `Client` or `CrmClientLink` created: `0`.
- Loyalty/value mutations: `0`.
- Provider writes: `0`.
- P02/P03 merge or reassignment: no.
- The 23 safe principal registrations were not started.
- Package 5 and Chapter 7 were not started.

`TEMP PROCESSES STARTED: 0 — no long-lived/background process`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

All verification commands were foreground, self-terminating, and awaited
before the next command. Both disposable databases were explicitly dropped
and their absence was verified.

## 7. Verdict

`UNRESOLVED IDENTITY HOLD DURABLE: YES`

`P02/P03 COLLISION REPRESENTABLE: YES`

`AUTOMATIC REGISTRATION CAN BE BLOCKED: YES — DETERMINISTIC LOOKUP READY; RUNTIME GUARD NOT WIRED IN THIS STEP`

`UNRESOLVED VALUE MUTATIONS ALLOWED: NO`

`CLIENT/CRMCLIENTLINK CREATED: 0`

`LOYALTY VALUE MUTATIONS: 0`

`PRODUCTION MIGRATION APPLIED: NO`

`READY FOR HOLD PRODUCTION MIGRATION GATE: YES`

STOP. Hold production migration, runtime guard wiring, canonical identity
establishment, FULL_LEDGER migration, P4-03 cutover, and later packages remain
separate explicitly approved steps.
