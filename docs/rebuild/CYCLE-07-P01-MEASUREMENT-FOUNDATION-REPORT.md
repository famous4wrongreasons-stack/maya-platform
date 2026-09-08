# Chapter 7 — P01 measurement foundation

Status: **Option A implemented; P01 component acceptance PASS; final mandatory gate and production cutover pending.** The owner approved the [source-owner FK decision](CYCLE-07-P01-SOURCE-OWNER-FK-DECISION.md) after checkpoint `940ddd51`. Historical failure receipts are retained; fresh superseding evidence is below. This is a Wave 1 report, not Chapter 7 completion.

The owner accepted `7ed07b6c` and approved the exact [combined mapping](CYCLE-07-COMBINED-SCHEMA-ACTION-MAPPING.md). The [approval receipt](evidence/chapter7-p01/approval-receipt.json) records the latest authorization: P01 gated production cutover, then P02/P05, P03/P04 and P06. That latest execution order supersedes the mapping's older final-only cutover wording. No product/schema decision is reopened.

## Implemented foundation

One `MeasurementRevision` model, exactly 37 physical columns, eight inverse-only Prisma relation changes, eight restrictive FKs, 16 CHECK groups, four guard functions/triggers, one migration and one AC6 lifecycle class. [Exact envelope proof](evidence/chapter7-p01/schema-envelope-proof.json) compares all original models and column names with the approved mapping. Existing physical source schema and historical migrations are unchanged. Backfill and new business Action Engine classes: **0**.

`MeasurementService` is the sole derived-state publisher. Trusted tenant producers admit an immutable normalized intent and durable occurrence. Request and logical-identity locks serialize admission; generation/token/deadline claims fence publication. Same occurrence/intent returns the same receipt, changed intent conflicts, published retries return the immutable snapshot. Current selects the latest retained published admission generation; no source or A29 assignment is rewritten. An expired or missing resume receipt never falls into fresh admission.

P01 registers canonical Appointment/client-history readers. Booking, attendance and booked value remain separate; absent cash/refund evidence is not zero. Client history uses a single normalized aggregate-query receipt (proved with 1,101 visits), rather than copying every visit into a bounded derived payload. Known history has explicit partial coverage, and unknown last attendance is not classified as dormant. Attribution primitives accept only exact confirmed lineage, deduplicate an outcome and leave competing candidates ambiguous. P03 will supply the actual action/A29/funnel rule integration; P01 does not claim a marketing action caused revenue.

Every source descriptor uses a closed owner/kind contract. Evidence sets are normalized with metric-reference remapping; unknown fields and mismatched tenant refs are rejected. Current authority is checked before reading and again under database locks for admission/claim/publication. Client ownership never depends on Maya User, phone or a bridge slug. Measurement has no public writer, provider/delivery dependency or AI-generated result input.

The original AC6 coordinator owns `expire_measurement_revisions`, with exact durable run/item claims and the row's unchanged 365-day deadline. It can delete only expired derived rows, including for suspended tenants; it cannot cascade into source facts. PostgreSQL date boundaries are explicitly UTC even when the database server timezone is Europe/Moscow.

## Requirement-to-proof map

| P01-owned requirement | Executable proof | P01 scope |
| --- | --- | --- |
| Q01 common measured envelope | `measurement.contract.spec.ts`; PostgreSQL qualified-source / immutable revision checks | Deterministic normalization, unknown vs zero, explicit basis/currency/coverage/rule |
| Q02 exact Client/tenant lineage | PostgreSQL wrong Client/tenant/scope rejection, Client without User, exact receipt/attempt guard | Shared ownership/FK/evidence contract; actual attribution rules remain P03 |
| Q03 booking/attendance/payment distinction | PostgreSQL Appointment + client-history cases | Arrived is not confirmed cash; missing attendance is not a manufactured visit |
| Q17 permissions/retention boundary | PostgreSQL revoked authority, exact AC6 cleanup, source preservation; C7 architectural guards | Foundation portion PASS; consumer/AI/export portion remains P06 |
| Q18 durable concurrency/restart | Eight concurrent admissions, exclusive claim, forged fence rejection, reconstructed service, immutable retry/current | One logical observation, no business effect replay |
| Q22 qualified bridge admission | Unknown source-event rejection; closed source owner; no phone/time/legacy-bridge attribution; SQL invented receipt rejection | Bridge/global token is not measurement authority; wider credential migration remains deferred before L3 |

[PostgreSQL executable proof](evidence/chapter7-p01/p01-postgres-proof.txt): **41 checks PASS**, in a new isolated cluster/database only. [Targeted regression and ratchets](evidence/chapter7-p01/p01-unit-ratchets.txt): **4 suites / 49 tests PASS**. This includes exact C6 AC6 allowlist updates for the single approved C7 class while preserving the six original auth-policy hash and all eight R-C policies.

[Clean migration replay](evidence/chapter7-p01/clean-replay.txt), [Prisma validation](evidence/chapter7-p01/prisma-validate.txt), [schema drift](evidence/chapter7-p01/local-drift.txt), lint, application/scripts typechecks and build: **PASS**. The first full backend run passed 411 suites and exposed two old AC6 allowlist expectations; [original evidence](evidence/chapter7-p01/mandatory-first-pass.txt) is retained. Both expectations were corrected to the approved exact set and passed in the targeted rerun. **A fresh full mandatory run in the documented deployment gate must pass before any upload/migration/cutover.**

## Coordinated P01 cutover

Use unchanged `maya-saas-backend/deploy/vps/deploy.sh`. Its mandatory validation/lint/typecheck/test/build gates precede upload; production migration precedes runtime activation; strict pending/drift and health gates remain blocking. Immediately before cutover verify canonical HEAD/origin and production release `20260908-p5-rc-8bc03454` still match the certified baseline.

Expected migration delta: only `20260908153000_chapter7_measurement_foundation`. It creates the empty derived table/guards, changes no source rows and performs no backfill. A failed migration or drift check prevents runtime activation. Recovery uses the existing previous-release mechanism; retain the additive schema and immutable migration history rather than deleting or rewriting them.

Production verification is structural/read-only: exact migration, 37 columns, eight restrictive FKs, CHECKs/triggers, compiled artifact hashes, empty prospective table, health/readiness. No booking, provider, message, consent, expense/cash/team/community/feedback or measurement business scenario is executed in production for proof. Existing PWA/Python/edge artifacts are not part of this backend foundation deployment.

## Progress and protected state

P01 production acceptance is pending until the release receipt is added below. P02–P06 have not started in this report. Q17 remains globally open for P06; later packages must complete their rule/consumer proofs. Chapter 7 Final Gate has not run; Chapter 7 is not complete; Chapter 8 has not started.

Main worktree: 24 entries preserved, protected hashes unchanged. Seventeen old databases untouched. The only temporary database/cluster is owned by this implementation and will be closed and removed at the wave cleanup boundary. No owned browser or watcher was opened.

## Source-owner Option A acceptance (after 940ddd51)

Stable Appointment FK `(appointmentId,tenantId)` preserves the separate immutable Client reference. Admission validates and locks the exact current source Client. Publication reads under the Appointment row lock used by the canonical source correction owner. If correction wins, the same old receipt closes PUBLISHED / UNAVAILABLE with empty facts/evidence, no credit and `source_subject_changed`; its Client never changes. If publication wins, correction may follow and the historical snapshot remains immutable. A new Client occurrence advances the same Appointment measurement identity by one revision. Current reads never skip a newer different-Client result to resurrect an older matching revision. Only historical tenant-authorized receipt reads can return the old as-reported snapshot.

[41 original PostgreSQL checks](evidence/chapter7-p01/option-a/p01-postgres-proof.txt), [18 source-owner/SQL/concurrency checks](evidence/chapter7-p01/option-a/source-owner-proof.txt), and [4 suites / 54 targeted tests](evidence/chapter7-p01/option-a/targeted-tests.txt): PASS. The 54 include all former 49 tests plus five permanent source-owner ratchets wired into the existing mandatory Jest gate. Both real correction/publication lock orders were exercised, with no mock source owner or production effect. The only provider fixture is synthetic qualified CRM source data.

Clean replay, Prisma, lint, both typechecks, build, owned-database pending=0/drift=NONE: PASS. The PostgreSQL server uses Europe/Moscow; derived read/claim/publication transaction boundaries use UTC. No additional model/column/migration/action/AC6 class was added, and no canonical source runtime file was changed.

The fresh read-only production preflight still matches `20260908-p5-rc-8bc03454`: C6 schema pending=0/drift=NONE/health/readiness PASS. C7 candidate delta is exactly one unapplied migration. Final mandatory regression and the documented deployment gate must finish before production acceptance is recorded.
