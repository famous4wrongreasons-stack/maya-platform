# Chapter 8 P06 — bounded consumers and legacy retirement

Authority: D1–D16, the approved combined mapping, and the limited-data implementation decision. P01–P05 were certified in `20260913-c8-wave3-66e83891`. This package adds no schema, migrations, Action Engine actions or lifecycle owners. Numerical targets T01–T08 remain disabled; statistical calibration is UNAVAILABLE.

## Four remaining requirements

| Requirement | Implementation and executable proof |
| --- | --- |
| Q20 authority/privacy | `C8ReadService` reuses current C7 User/Membership/tenant/branch/Staff/finance authority. Whole financial-derived rankings require finance access even if amounts are hidden. Branch scope cannot read whole-tenant results or the old whole-tenant CRM registry. Staff may read only their own permitted salary-target state. The PostgreSQL consumer proof exercises these boundaries, revocation, wrong subjects and source correction; AI tests prove rejection precedes provider reads. |
| Q22 legacy numerical claims | The finite L01–L08 disposition below removes old scorers and their actual consumers. Mandatory Python AST/executable guards inspect source and exact production candidates without importing bot modules. The active refresh loop retires without adding a scheduler. Immutable source histories are not edited. |
| Q23 consistent consumers | One C8 reader serves bounded HTTP and AI projections. The existing PWA analytics area shows basis, as-of, coverage, reasons and unavailable status. OwnerReport/C7 reports retain their existing fact/snapshot/download owners; they are not silently relabelled as C8 predictions. No contact export, model-fit endpoint or automatic strategy is introduced. |
| Q24 release/acceptance | Existing unfiltered mandatory Jest discovery includes the new C8 consumer ratchet. The normal deployment runs C8 PWA/Python verification at all three existing finite R01/C7 checkpoints. Exact-base patch proofs and pinned recovery prevent a stale production copy restoring a numerical fallback. The final report maps all 24 Qs and 32 inherited surfaces. |

## Read and admission contract

`GET /api/analytics/valuations`, `GET /api/analytics/valuations/:id` and `GET /api/analytics/valuation-models/readiness` are read-only. They do not create model/result/evaluation rows, source facts, business actions or deliveries. List pages are bounded to 100; ranking member pages are bounded to 100 with an explicit continuation offset. Unknown query fields and invalid bounds are rejected. Current-result projection rechecks policy/model/source references; stale results expose unavailable values while their historical persisted bytes remain intact.

`POST /api/analytics/valuations/compute` is an explicit derived calculation using the existing C8 producer/ranking owner. Its closed request names only subject, capability and branch scope; the caller cannot supply T0, features, values, model parameters or evidence. Server authority and confirmed current A22 capability are checked before and after admission. Reading a page does not invoke this command. No configured policy means no guessed objective, threshold or automatic production test admission.

`valuations.read` and the existing high-value/dormant/revenue tools delegate to the same safe reader. The AI projection bounds results, strips stable Client/model/evidence IDs and contact data, and supplies ephemeral presentation labels plus deterministic facts/reasons. Tool arguments cannot reinstate the old lifetime-spend comparator or a universal dormant period. The CRM calendar-month registry remains a labelled observation, with no loyalty/value conclusion; current scope is checked before its broad provider read. AI may phrase reasons, not produce or activate a numeric prediction.

## L01–L08 final disposition

| Legacy group | Disposition |
| --- | --- |
| L01 universal visit-count loyalty | RETIRED. No `clientLoyaltySegment` or 3/6/12 classification. Raw permitted source visit facts remain distinguishable. |
| L02 registry loyalty/lifetime amount | ADAPT SOURCE FACTS. Calendar buckets, observed counts and missingness remain; loyalty/cohorts and unqualified aggregate lifetime value are unavailable. Calendar buckets do not establish dormancy. |
| L03 no-show thresholds | RETIRED INTERPRETATION. Provider attendance/no-show observations remain labelled; historical marks do not become a future probability or high/low risk. |
| L04 linear revenue forecast | RETIRED. Existing tool delegates to qualified C8 prediction projection; no run-rate, assumed currency or invented confidence interval fallback. |
| L05 money-motivation helper | KEEP RETIRED. Only tests/negative guards reference it; no production consumer reconnects it. |
| L06 Python money pitch | RETIRED. No default commission, visit-cycle clamp or yearly add-on extrapolation. Existing retired push/goal actions remain retired. |
| L07 Python retention | RETIRED INTERPRETATION. No 90-day cohort score, 40/60/25 thresholds, previous-minus-current churn or cached scored snapshot revival. Registry observations are available through the qualified existing source/read path. |
| L08 growth/economic recommendation | RETIRED. Growth planner, money-opportunity and downstream financial-director/goal/advisor/growth/KPI/briefing numerical helpers return unavailable. Actual command-center/daily-briefing projections cannot revive cached numeric fields. Raw source-labelled appointment/schedule observations remain. No C9 strategy replaces the removed legacy strategy in this chapter. |

The six nested L08 numerical helpers are internal paths of the already inventoried group, not new surfaces or Q requirements. Their output could otherwise recalculate values after retirement of the parent calculators. Pure Python guards cover both direct calls and the final public projections, including unavailable capacity rather than a fabricated zero-slot statement. Existing C7 finance, payroll, report, audit, download and source ownership is preserved.

## PWA and production artifact discipline

The panel extends the existing cabinet typography/layout. A synthetic browser harness tested desktop and 390px mobile layouts, ranked facts, explicit calculation, unavailable model state, and a tenant without confirmed policy. Opening/refreshing the panel performs GET only; unconfigured state has no compute button. The component is keyed to the current session and rejects a response if that session changes. No native checkout or visual-identity asset is changed.

The repository and active production PWA bundles differ. `build-pwa.cjs` applies only the three owned consumer edits to each exact baseline and preserves C7 structural guards. Four Python artifacts likewise receive zero-context patches against individually pinned production hashes; newer repository-only registry functions are not invented in the older production copy. No full production source, credential or private payload enters Git.

`deploy/platform/chapter8-consumers/manifest.json` pins five before/after artifacts. All predecessor hashes are checked before any replacement; all backups are retained before the first write. Publication and recovery are atomic per file and fenced to owned hashes. Only the existing Python service is restarted. Beget maintenance pages, protected PWA backups and PHP relays are verified, never modified by P06. The coordinated backend release immediately follows consumer publication; an unavailable endpoint fails closed during the transition. Failed backend publication uses the documented exact-candidate recovery, not a broad rollback of upstream state.

## Acceptance evidence

Real isolated PostgreSQL consumer proof: 14 scenarios; foundation/value/prospective/evaluation preservation proofs run against the same owned disposable database. Exact-base Python patch applications and semantic guards pass for all four artifacts; the PWA candidate parses all 27 production scripts and preserves C7 markers. Synthetic visual proof and private evidence hashes are recorded under `evidence/chapter8-wave4` after the mandatory gate. Synthetic fixtures establish implementation safety, not real-world calibration.

Production certification and final counts are recorded only after the actual coordinated cutover in `CYCLE-08-FINAL-COMPLETION-REPORT.md`. This report does not independently assert a deployment before that receipt exists.

P06 LOCAL ACCEPTANCE: PASS. Mandatory gate: 447 suites / 3752 tests; lint, both typechecks, build and Prisma PASS. Fresh production preflight: pending0, drift NONE, health/readiness PASS on Wave3. Production P06 cutover is the next authorized step.
