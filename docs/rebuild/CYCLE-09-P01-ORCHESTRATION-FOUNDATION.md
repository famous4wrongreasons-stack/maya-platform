# Chapter 9 — P01 / Wave 1: shared orchestration foundation

Date: 2026-09-14. Baseline: `cf05547b` (approved combined mapping), canonical
branch `codex/maya-brain-systemic-release-20260815`. Owner decisions D1–D16
approved 16/16. This package implements **Q02–Q07 and Q24** exactly inside the
approved envelope. No new product decision was taken here.

## 1. Envelope conformance — measured, not asserted

| Approved | Implemented | Evidence |
|---|---:|---|
| NEW MODELS: 5 | 5 | `C9Run`, `C9StrategyRevision`, `C9PlanStep`, `C9StepBinding`, `C9WorkReceipt` |
| NEW PHYSICAL FIELDS: 123 | **123** | 28 + 27 + 26 + 16 + 26, counted from `schema.prisma` and re-counted in SQL by proof check 27 |
| ALTERED MODELS: 2 | 2 | `Tenant` (5 reverse relations, 0 columns); `TenantBusinessConfigurationRevision` (`R11_config_contract_check` allowlist + `c9_orchestration`, 0 columns) |
| MIGRATIONS: 1 | 1 | `20260913160000_chapter9_orchestration_foundation` |
| BACKFILLS: 0 | 0 | migration contains no `UPDATE`/`INSERT` over existing rows |
| NEW ACTION CLASSES: 0 | 0 | no Action Engine class added |
| NEW AC6 CLASSES: 1 | 1 | `expire_c9_orchestration_runs`, policy `chapter9.orchestration-retention` v1 |
| CAPABILITY REGISTRY: HYBRID | hybrid | released code manifest + persisted `registryHash` only |
| CANONICAL ORCHESTRATOR / AGENTS | 1 / 4 | `ADMIN`, `CLIENT_LIFECYCLE`, `OCCUPANCY`, `BUSINESS_INTELLIGENCE`; `ORCHESTRATOR` is coordinator accounting, not a fifth agent |

Structural counts inside the one migration, measured from `migration.sql`:
5 tables, 5 PKs, **12 UNIQUE constraints + 1 partial UNIQUE index**, 46 `_ck`
CHECKs, 1 extended existing CHECK, 11 FKs (all `ON DELETE RESTRICT`), 7 extra
non-unique indexes, 8 functions, 10 triggers, 0 enums, 0 destructive statements.

## 2. Local gates

| Gate | Result |
|---|---|
| `prisma validate` | PASS |
| `prisma migrate status` (owned synthetic cluster) | up to date, pending 0 |
| Repository migrations | 96 (95 inherited + 1 C9) |
| `npm run typecheck` | PASS |
| `npm run typecheck:scripts` | PASS |
| `npm run lint` | PASS (0 errors) |
| `npm run build` | PASS |
| Mandatory backend regression (`jest`, unfiltered) | **453 suites / 3804 tests PASS** (C8 inherited 447/3752 + 6 C9 suites / 52 tests) |
| P01 PostgreSQL proof | **27/27 checks PASS**, `productionEffects: 0` |

## 3. Mandatory P01 proofs → evidence

Receipt contract `maya.c9-p01-postgresql-proof/1`, executed against the owned
synthetic cluster only (`127.0.0.1:55529/maya_c9_replay`, user `maya_c9`); the
script refuses any other database.

| Required proof | Proof checks |
|---|---|
| SAME REQUEST + SAME MATERIAL INTENT → SAME STRATEGY | 1, 5, 8, 10 |
| MATERIAL CHANGE → NEW REVISION | 2, 6, 9 |
| RESTART → SAME PLAN | 10, 16 |
| DUPLICATE BUSINESS EFFECT AFTER RESTART: NO | 14, 15, 16, 17, 19 |
| TENANT ISOLATION: PASS | 12, 21, 26 |
| 24H MAX STRATEGY VALIDITY | 3, 25 |
| RETRY DOES NOT EXTEND VALIDITY | 3, 24, 25 |
| 365D NEW C9 DERIVED RETENTION | 3, 23 |
| AGENTRESULT@1: BOUNDED | `c9.context-and-result.spec.ts` |
| SILENT ARRAY TRUNCATION: NO | `c9.context.spec.ts` — oversize arrays are rejected, never sliced |

Permanent specs wired into the unfiltered Jest run:
`c9.registry.architecture.spec.ts`, `c9.source-boundaries.architecture.spec.ts`,
`c9.identity.spec.ts`, `c9.context.spec.ts`, `c9.context-and-result.spec.ts`,
`c9.retention.spec.ts`.

## 4. Defects found and fixed inside approved scope

1. **`c9.retention.spec.ts` was missing.** The approved mapping §13 assigns it to
   P01. Added as a structural ratchet: 365d nonrenewal (no guard allowlist admits
   `retentionUntil`/`validUntil`/`admittedAt`), child deadlines capped by the
   root, the single AC6 class and policy key, leaf-to-root deletion order,
   `ON DELETE RESTRICT` ×11 with no CASCADE, scoped idempotent purge, purge stops
   the root instead of reviving reasoning, and no source table is ever written.
2. **Five lint errors in new C9 files** (two unnecessary type assertions, three
   `async` without `await`). Fixed; the release lint gate is green again.
3. **P01 proof could not complete on a non-UTC database session.** Root cause is
   environmental, not a schema or contract defect: the owned synthetic cluster
   runs `TimeZone = Europe/Moscow`, and this Prisma client parses `timestamptz`
   as naive local text, so every value read **outside** a
   `canonicalUtcTransaction` came back +3h. The proof compares a read-back lease
   with the JS clock, so it waited three hours instead of fifteen seconds.
   Measured: `clock_timestamp()` read outside a UTC transaction was
   `+10800.1 s`; with `options=-c TimeZone=UTC` the same read is `+0.1 s`, and
   SQL and JS agree on the lease (−211.7 s vs −211.6 s).
   Production code is unaffected because every C9 write and read of coordination
   state goes through `canonicalUtcTransaction`, which pins the session to UTC.
   **Requirement recorded:** the P01 proof must be run with a UTC session, e.g.
   `DATABASE_URL=…/maya_c9_replay?schema=public&options=-c%20TimeZone%3DUTC`.

No envelope field, model, action class, AC6 class or migration was added while
fixing these.

## 5. Boundaries preserved

`ORCHESTRATOR != ACTION ENGINE`, `AGENT != ACTION OWNER`,
`AGENT MEMORY != BUSINESS STATE`, `STRATEGY != PLAN != ACTION`,
`STRATEGY APPROVAL != BLANKET EFFECT AUTHORITY`, `UNKNOWN != FAILED`.
P01 adds no endpoint, no agent effect, no provider write and no scheduler.
BI cannot `OWNER_HANDOFF` (CHECK-enforced). C8 stays 0/8 active; nothing in P01
requires a numeric prediction.

```text
C9 P01 ENVELOPE CONFORMANCE: EXACT
LOCAL GATES: PASS
POSTGRESQL PROOF: 27/27
PRODUCTION EFFECTS: 0
```
