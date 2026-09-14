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
| Gate runtime | certified Node **22.23.2**, checksums re-verified; production Node unchanged |
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

4. **The deployment gate aborted with `Segmentation fault: 11`** in
   `npm test -- --runInBand` under local Node 24.15.0 — the documented V8
   `ClearStaleLeftTrimmedPointerVisitor` GC crash already recorded for C7 P01 and
   C8 P01. That run is **not** PASS. The gate was re-run unchanged on the
   already-certified Node 22.23.2, whose archive `61130f39…85c6` and binary
   `18e387c9…f572` were re-verified against the stored receipts before use.
   No test, assertion, flag or configuration was weakened, and the production
   runtime stays `/opt/node-v24`. [Runtime receipt](evidence/chapter9-p01/local-node-runtime.json).

No envelope field, model, action class, AC6 class or migration was added while
fixing these.

## 5. Production deployment and read-only P01 production proof

Release **`20260914-c9-p01-336d270d`** deployed through the unchanged documented
process (`deploy/vps/deploy.sh`), all ten steps, exit 0.
[Deployment transcript](evidence/chapter9-p01/deployment.txt) ·
[release acceptance](evidence/chapter9-p01/release-acceptance.json).

| Production gate | Result |
|---|---|
| Repository migrations in release | 96 |
| Pending migrations before cutover | **1** — only `20260913160000_chapter9_orchestration_foundation` |
| `prisma migrate deploy` | applied, `All migrations have been successfully applied` |
| Applied migrations after | **99**, pending **0** |
| `migrate diff --exit-code` (drift) | **NONE** — `No difference detected` |
| `release-preflight` strict, after migration, before cutover | PASS, `config: safe` |
| Package 4 / Package 5 active PWA runtime guards | PASS / PASS |
| Port-3199 smoke on `/api/health/ready` | PASS, probe reaped |
| `/api/health` after cutover | `ok`, release `20260914-c9-p01-336d270d` |
| `/api/health/ready` after cutover | `ready`, `database: ready` |
| `journalctl -p err` over the following 2 minutes | empty |
| R01 live relay verification, before preflight and after cutover | PASS (42 entries, 10 active PHP, 16 blocked archives, 0 provider/message effects) |

Structural proof `maya.c9-p01-production-structural/1`, executed read-only against
the production database from inside the active release
([probe](evidence/chapter9-p01/production-structural.probe.cjs) ·
[result](evidence/chapter9-p01/production-structural.json)):

| Measured in production | Value |
|---|---:|
| C9 tables | 5 |
| Physical fields (28+27+26+16+26) | **123** |
| Guard/shared functions | 8 |
| Triggers | 10 |
| PRIMARY KEY / UNIQUE / CHECK / FOREIGN KEY constraints | 5 / 12 / 46 / 11 |
| All constraints validated | true |
| `ON DELETE RESTRICT` references | **11** |
| `CASCADE` references | **0** |
| Indexes, of which partial UNIQUE | 25, 1 (`C9StepBinding_one_execution_idx`) |
| Rows in all five C9 tables | 0 |
| **Production proof effects** | **0** |

The deployed schema equals the certified local schema exactly
([comparison](evidence/chapter9-p01/schema-comparison.json)): **8/8 function
definition hashes**, **74/74 constraint definitions**, **25/25 index definitions**
and an identical trigger set match the owned synthetic replay cluster that the
27/27 PostgreSQL proof ran against. The replay cluster still holds that proof's
synthetic rows; production holds none, so no business, provider or message effect
was performed to prove anything.

## 6. Boundaries preserved

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
PRODUCTION RELEASE: 20260914-c9-p01-336d270d
PENDING MIGRATIONS: 0
DRIFT: NONE
HEALTH: PASS
READINESS: PASS
PRODUCTION EFFECTS: 0
WAVE 1: COMPLETE
```
