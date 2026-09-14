# C8 Wave 3 — P04 Opportunity/explanation and P05 evaluation

Authority: approved D1–D16, the combined 3-model/94-field mapping and limited-data activation decision. Predecessor: `20260913-c8-wave2-57b677a1`. No additional schema, migration, Action Engine class or lifecycle owner.

## Canonical ownership and Q16–Q19

| Requirement | Implementation / executable proof |
| --- | --- |
| Q16 / P04 | `C8OpportunityBridge` supplies typed exact result/hash/model/policy references to existing Opportunity admission. Current enabled A22 rule, current subject/source and qualified result are rechecked inside existing serializable lifecycle persistence. No action intent, Task, delivery, provider operation or consent authority. PG covers disabled policy, concurrent first admission, source correction, refresh/resolution and policy revocation. |
| Q17 / P04 | `c8Explanation` preserves kind, basis, currency, period, rule, completeness, limitations and all six fact/policy/authority boundaries. Comparison requires identical qualified dimensions. LLM wording cannot create facts or change order. Unit tests cover ambiguity, incompatible basis/scope, disabled prediction and safe reason bundles. |
| Q18 / P05 | `C8LabelCollector` links durable T0 captures to later exact C7 labels; `C8EvaluationService` admits/resumes shared evaluation revisions. Immature, unknown and excluded cases are distinct, never zero labels. Real PostgreSQL covers no-show, attended return, late correction, reassignment, no future outcome at T0, same Client clustering, concurrent polling and restart. |
| Q19 / P05 | Numeric quality gate remains disabled. Prospective cases/counts are durable, metrics/calibration/drift remain null; no fit, invented threshold, holdout claim, model promotion or quality PASS. These synthetic implementation proofs do not establish statistical calibration. |

## Detailed lifetime boundaries

C8 Opportunity references use one closed `valuation_result_v1` envelope. They contain no copied feature values, contact data or invented money. Client reactivation requires both qualified current historical value and the exact confirmed dormancy rule; multiple possible cadence rules are not arbitrarily chosen. Business metric rules preserve named scope. Supersession and resolution use the existing Opportunity lifecycle. Its original fact-only branches and their prohibition on invented valuation remain enforced.

The C7 Appointment measurement identity is the Appointment, not a C8 consumer's report window. The shared capture helper reuses an existing snapshot only after the existing C7 owner rereads its complete original evidence and current metrics. Corrected source facts invalidate reuse. A pending/new authoritative observation uses normal C7 admission. Historical published bytes remain immutable. This prevents two legitimate value/dormancy consumers from needlessly invalidating each other's identical source evidence.

Prospective input-only captures remain `INSUFFICIENT_DATA` while a model is unqualified. That state does not erase an observation. Unsupported source capabilities stay excluded, missing inputs stay frozen and later labels still require exact C7 qualification. A future Appointment already carrying a known outcome is refused before T0 capture. A partial historical mirror can prove an exact positive attended event; it cannot prove whole-window absence. Unknown money does not erase a separately proven attendance metric. Generic monetary/demand/capacity labels require full named basis/currency/period/source qualification; missing independent sources remain unknown.

Same case evidence plus a new poll clock reuses the existing evaluation and retention deadline. Exact immutable retry returns its original receipt. A new current observation must requalify current label references/schedule/attendance before deduplication; source correction cannot return an old qualified result as newly verified. Changed labels create a next revision and never edit frozen T0 or historical evaluations. Cases for the same Client share a cluster identity; multiple observations do not pretend to be independent quality evidence.

The existing bounded operational worker performs evaluation and Opportunity refresh. No new daemon, timer, notification, source writer, training process or business action is introduced. No configured A22 policy means no fabricated defaults or production test rows.

## Acceptance and release

Package proof: `scripts/chapter8-wave3-proof.ts` (13 PostgreSQL scenarios); preserved Wave 2 proof (13); P01 foundation (24). Release-discoverable tests include `c8.opportunity.spec.ts`, `c8.prospective.spec.ts`, `c8.wave3.architecture.spec.ts` and all inherited C8/Opportunity/Chapter 6/7 guards. Full mandatory gates and production evidence are recorded after the coordinated release.

P04 PRODUCTION: PASS
P05 PRODUCTION: PASS
RELEASE: 20260913-c8-wave3-66e83891
WAVE 3 MANDATORY RELEASE GATE: PASS — 446 suites / 3745 tests
LINT / BOTH TYPECHECKS / BUILD / PRISMA: PASS
PENDING MIGRATIONS: 0
DRIFT: NONE
HEALTH/READINESS: PASS
T01–T08 ACTIVE: 0/8
T01–T08 DISABLED: 8/8
REAL-WORLD CALIBRATION: UNAVAILABLE
PRODUCTION PROOF EFFECTS: 0

Verified accounting: Q20/24, packages5/6, waves3/4. P06 consumer/legacy retirement and the frozen final gate remain. No Chapter 9 work.
