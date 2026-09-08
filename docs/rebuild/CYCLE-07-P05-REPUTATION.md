# C7 P05 — source-qualified reputation measurements

Status: implementation, focused tests, targeted typecheck and isolated PostgreSQL acceptance complete. Combined Wave 2 gate and production cutover remain parent-owned. No production deployment or additional schema is part of this package.

Authority: Q10 / D08 Option A under the [combined mapping](CYCLE-07-COMBINED-SCHEMA-ACTION-MAPPING.md), [owner approval receipt](evidence/chapter7-schema-mapping/owner-approval.json) and applied P01 shared `MeasurementRevision` foundation. The historical decision pack's PENDING labels do not override the approval receipt.

## Runtime contract

`MeasurementReputationReader.authorize(tenantId, normalizedIntent, tx)` and `read(tenantId, normalizedIntent, tx)` are read adapters. The existing `MeasurementService` alone admits and publishes `reputation_period` revisions. No Prisma schema, migration, business action, delivery, consent, source writer, reputation owner or period owner is added.

The requested period must be exactly one calendar month in the canonical tenant's `defaultTimezone`, including the local midnight boundaries. A branch timezone does not replace the approved tenant-local month. The previous comparison period is the immediately preceding local calendar month. UTC transport boundaries, leap/year boundaries and DST are resolved explicitly; missing local midnight is rejected instead of shifted. `asOf` must fall on or after the period start and cannot exceed source observation time. The existing shared admission constraint also forbids future `asOf`.

Scope is exact tenant plus the intersection of the optional branch and permitted branch set. Native feedback can additionally filter canonical Client, Appointment and Staff. An explicit branch outside the branch set is rejected. Legacy reviews have no proved canonical Client/Staff association; therefore Client/Appointment/Staff filters require explicit `source=native_feedback`. Configuration-owner scope, unrelated dimensions and all source-query overrides are rejected. The only supported dimensions are `source` and `scale=stored_rating_1_5`.

`source` is either `native_feedback` or `business_review/<stored-source>`. The latter preserves safe existing lowercase source identifiers, maximum 40 characters, without promoting the source label to canonical author evidence. Source labels outside this format are excluded with a qualification reason. A legacy source literally named `native_feedback` remains `business_review/native_feedback` and never acquires native authority.

Initial admission validates exact current Appointment/Client ownership through shared `MeasurementSources.authorize`. Receipt authorization retains exact Appointment/tenant/branch/Staff existence without rebinding its historical Client. Shared publication locks the Appointment and closes a corrected subject as explicit UNAVAILABLE; the source adapter does not strand that receipt by requiring the old Client association first.

## Source facts and evidence

| Source | Occurrence and current authority | Qualification |
| --- | --- | --- |
| `BusinessReview` | `occurredAt` in the selected source; stored integer scale 1–5 under existing DB constraint; source updates observed after `asOf` are disclosed | SOURCE_LABELLED; verified Client-author and Appointment counts are null |
| `NativeFeedbackRequest` + `NativeFeedbackRevision` | First accepted response timestamp assigns the stable month; only the exact `latestResponseVersion` supplies current rating. Exact tenant + Client + Appointment joins and canonical unmerged Client required | VERIFIED; author and Appointment counts equal the included response count |

Native corrections update the current rating in the original response month. Current withdrawal, expiry, payload erasure or an unproved latest revision removes that response; no older response is substituted. This is a current source observation with an explicit cutoff and observation time, not an invented historical view. Existing published snapshots remain immutable.

Anonymous community is never queried. Raw/encrypted text, names, contact details, User links, topic payloads, external Staff guesses and provider responses are never selected or retained by the reputation reader. Source consent, response acceptance, invitations, publication and retention continue under AC4/R08/B34 owners.

One SQL observation groups both owners and both months. The result retains at most two bounded receipts, not one copy per review:

- `BusinessReview / reputation_review_query`: source-separated aggregate values and update checkpoint hash.
- `NativeFeedbackRequest / reputation_native_query`: aggregate values plus latest revision/withdrawal/expiry checkpoint hash across the existing R08 rows.

Receipts retain exact tenant, derived query identity, normalized state hash, observation time, qualification and source coverage. Native revision rows remain with R08. The reader allows at most 16 source families and 240 metrics. SQL fetches at most 34 grouped source/month rows, enough to detect overflow. Known overflow publishes an empty UNAVAILABLE/UNQUALIFIED result with `reputation_source_bound_exceeded`; it neither truncates facts nor leaves a permanent PENDING retry. Authority errors and infrastructure failures still propagate.

## Measurements

Each source has its own `observed_review_count`, `rating_denominator`, `rating_sum` and `average_rating`, with the same four previous-month metrics. Average values use exact integer sums and denominators, rounded half away from zero to six decimals; `average_rounding` explicitly records that rule. An empty denominator produces null average, not zero.

`observed_count_delta` and `observed_average_delta` compare only that same source, stored scale, exact scope and consecutive complete local months. Average-delta numerator and denominator are retained explicitly. Partial current months yield null deltas with `partial_calendar_month_comparison_not_measured`. Counts and deltas describe observed stored facts; universal source coverage is not proved, so values remain PARTIAL. No reputation index, causal credit, generated trend claim, automatic reply or external publication is produced.

## Acceptance evidence

- Focused unit and ownership suites: 31 tests PASS on Node 22.
- Targeted TypeScript check: PASS for P05 runtime, specs and standalone proof, including their imported contracts.
- Isolated PostgreSQL proof: final nine scenarios PASS, including deterministic source overflow publication. The earlier eight-scenario passing run is superseded by the final run.
- The proof uses real existing R08 feedback commands and AC4 review acceptance for synthetic fixtures only, then verifies measurement causes zero new business executions, feedback requests/revisions, source reviews or invitation deliveries.
- The initial proof covered tenant-local half-open month boundaries; separate scales/source denominators; exact tenant/branch/Staff/Client/Appointment rejection; Client without Maya User; correction crossing a month boundary; withdrawal and unchanged old snapshots; 1,005 reviews producing two receipts; partial-month comparisons; and a real canonical Appointment source-owner correction closing a pending receipt as UNAVAILABLE.
- The final proof additionally verifies more than 16 source families publish an empty UNAVAILABLE result, supersede the prior successful aggregate, and leave no pending retry loop. The final run exercises explicit average rounding and delta numerator/denominator payloads through the shared publisher.

The [machine-readable Q10 proof map](evidence/chapter7-p05-reputation/proof-summary.json) and [sanitized final proof output](evidence/chapter7-p05-reputation/postgresql-proof.log) are retained with this package. The isolated harness initially needed a longer synthetic attestation constant before database connection; that setup error and a test-only TypeScript inference correction are recorded separately from the final PASS results.

The standalone proof is hard-bound to the disposable parent-owned local database on `127.0.0.1:55517`, database `maya_c7_replay`, user `maya_c7`. It refuses other destinations and does not clean up the shared database. This package does not claim production acceptance or whole-Chapter-7 closure.
