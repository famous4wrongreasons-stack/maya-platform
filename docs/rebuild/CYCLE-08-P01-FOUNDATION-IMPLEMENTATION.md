# C8 P01 — limited-data foundation implementation

Owner approval: accepted checkpoint `8c185b75`, recorded in [limited-data decision](CYCLE-08-LIMITED-DATA-IMPLEMENTATION-DECISION.md). D1–D16 and the combined envelope remain unchanged. This report records P01 local implementation; production acceptance is pending the mandatory release gate and cutover. P02–P06 are not claimed complete.

## Implemented owner boundary

One C8 store owns derived model definitions, result revisions and evaluation revisions. Existing A22 owns confirmed `c8_valuation` policy; the existing Action Engine command validates the typed payload and exact service/branch scope at both admission and execution. No new business action/executor, client authority, provider operation or communication sender is introduced.

The additive migration creates exactly C8ModelVersion (22 fields), C8ResultRevision (41) and C8EvaluationRevision (31). Tenant receives only reverse Prisma relations; the existing A22 namespace CHECK is extended forward. Three tenant FKs are RESTRICT; source facts acquire no C8 FK. The 24 CHECK groups, 10 non-PK unique indexes, 10 ordinary indexes and five shared guard functions protect the approved identities/lifecycle. The same three row guards also reject TRUNCATE.

Immutable server admissions fix normalized input, rule/version, tenant/subject, T0, explicit policy, basis/currency, source references and nonrenewing expiry. Concurrent admissions deduplicate under serializable transactions and series locks. Fenced claims can resume the same revision after restart. A stale worker cannot publish. Current-source/policy validation closes pending work unavailable; confirmed history is immutable. Current results never silently fall back behind a newer unavailable revision.

C7 source reads use the existing UTC transaction boundary. Source references require exact tenant/Client/hash/coverage; current Appointment Client correction is not blocked by C8. Superseded source revisions and changed source provenance cannot qualify current use. Identifying data, contacts, raw provider payloads and message text are outside the feature contract.

## Honest limited-data operation

All eight targets have versioned semantic definitions and explicit unavailable capability states. Registry rows admitted by this release are **unfitted definitions**, with no coefficients, training observations or statistical quality assertion. Optional model references on input-only prospective captures do not manufacture a fitted predictor. Evaluation infrastructure stores exact later-label references, exclusions, maturity and immutable revisions; absent labels are not zero/negative observations.

SQL and runtime reject numeric prediction publication, unqualified activation and calibration PASS. Future fitted methods/quality thresholds require the separately grounded activation contract; this release supplies none. No arbitrary AUC, sample size, probability, personal prior or universal dormancy cadence is selected.

A22 policies preserve explicit tenant/service windows. Days are elapsed days; calendar months retain tenant-local wall time with month-end clamping under a versioned deterministic helper. Facts, evidence requirements and provider support govern deterministic eligibility; complete facts never imply a qualified probabilistic model.

| Targets | Contract | Qualified data | Calibration | Activation | Numeric output |
| --- | --- | --- | --- | --- | --- |
| T01–T08 | Shared foundation implemented; producers/evaluator remain P03/P05 scope | INSUFFICIENT | UNAVAILABLE | DISABLED | HIDDEN |

## P01 requirements / local proof

| Q | Implementation | Executable evidence |
| --- | --- | --- |
| Q01 | c8.contract, c8.sources | Exact tenant/Client, real C7 snapshot/hash, wrong subject denied; Client without Maya User |
| Q02 | c8.store + SQL guards | Eight concurrent admissions; single claim winner; immutable input; next revision; stale fence and restart |
| Q03 | Closed result/feature/model contracts | Owner/write ratchets; expected numeric value denied; no LLM/provider/source writes |
| Q04 | Existing governed settings owner + c8.policy | Real A22 ActionExecution and confirmed configuration; exact canonical scope validator |
| Q05 | Typed provider/vertical/service policy | Four explicit vertical fixtures, unsupported source state; no universal rule |
| Q06 | c8.eligibility, c8.targets | Observed zero distinct from unknown; missing/partial source, disabled model and explicit evidence-floor tests |
| Q21 | Existing AC6 + three C8 leaves | Real PostgreSQL expiry purge of all three derived leaves; live history and canonical sources retained |

Local PostgreSQL: **24 checks PASS**. Targeted suite including shared AC6 ratchets: **6 suites / 52 tests PASS**. Clean replay: **95 repository migrations PASS**. Local Prisma schema comparison: **NONE**. No migration backfill and no source mutation in migration. The synthetic fixture inserts occur only in a new isolated local cluster; they are not real-world model evaluation.

Permanent tests live under `src/valuation/*.spec.ts` and the existing mandatory `src` Jest discovery. The deployment script runs the complete suite. The historical AC6 policy tests retain the original auth-policy fingerprint and exact old classes, adding only the three approved C8 leaves.

The first full local run crashed in Node 24.15.0 V8 `ClearStaleLeftTrimmedPointerVisitor`, matching documented C7 incidents; it is not PASS. The checksum-verified previously certified Node 22.23.2 runtime is used for gates without changing tests or production Node. A subsequent full run found only the two expected exact AC6 allowlist assertions (439 suites passed); both were updated to include precisely the approved classes and targeted rerun passed. Complete mandatory rerun is still required before upload/migration and is enforced by `deploy/vps/deploy.sh`.

## Pre-upload label proof correction

The first deployment attempt was intentionally terminated during its local Jest gate, before upload, migration or release change. A cross-package review found that requiring whole-C7-snapshot COMPLETE would suppress an independently proven attendance label when cash/refunds were unknown. The same unapplied migration now checks the exact binary target, completed Appointment, unchanged admitted schedule and COMPLETE attendance metric. Complete horizon coverage remains mandatory for a non-return negative. The executable proof admits a real later C7 no-show label from a PARTIAL financial snapshot, rejects an opposite label and changed schedule, and admits an early proven attended-return positive while rejecting a fabricated negative. The real Appointment-backed C7 reference also exposed an SQL variable/column ambiguity, repaired in the shared validator before production. No model/field/constraint budget or numeric activation changes.

## Production baseline before cutover

Read-only preflight: release `20260912-c7-p06-4058cd8c`, health/readiness PASS, pending migrations 0, drift NONE, C8 tables absent, no incompatible existing A22 namespace rows. P01 requires exactly the one new migration; the historical production migration ledger's three previously reconciled entries are unchanged. No production rows were changed for these proofs.

Evidence: [local manifest](evidence/chapter8-p01/local-manifest.json), [PostgreSQL proof](evidence/chapter8-p01/postgres-proof-final.txt), [schema artifact](evidence/chapter8-p01/schema-artifact.json), [runtime receipt](evidence/chapter8-p01/local-node-runtime.json), [production preflight](evidence/chapter8-p01/production-preflight.txt).

P01 PRODUCTION: NOT DEPLOYED
C8 PACKAGES COMPLETE: 0/6
C8 WAVES COMPLETE: 0/4
T01–T08 ACTIVE: 0/8
CHAPTER 8 COMPLETE: NO
CHAPTER 9 STARTED: NO
PRODUCTION PROOF EFFECTS: 0

Next: mandatory documented release gate → P01 schema/runtime cutover → structural verification → automatically continue P02/P03. No further owner decision is needed for approved scope.
