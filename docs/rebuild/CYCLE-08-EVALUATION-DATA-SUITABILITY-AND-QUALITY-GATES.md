# Chapter 8 — E01 data suitability and proposed quality gates

Date: 2026-09-13. Repository baseline: `12af40b2e5c99678ad94122b45907a337ea4a2c0`.

**E01 Option A: APPROVED. Assessment completed for T01–T08. Numeric prediction activation: DISABLED for all eight.** No model was fitted, trained, deployed or evaluated as production-ready. No source/runtime/schema/migration was changed. This is a bounded data assessment, not another infrastructure or Chapter 7 discovery cycle.

The assessment establishes **0 sufficient / 0 limited / 8 insufficient target datasets for a qualified temporal evaluation**. There are useful, partially available source facts. This does not mean Maya has no business history or that Chapter 8's unavailable state is an architectural failure.

**Numeric quality proposals are presented for 8/8 families, but complete numeric activation contracts are ready for approval: 0/8.** The matrix below specifies exact qualification/disable rules and proposes baseline-relative statistical tests. It does **not** fabricate a probability-error tolerance, monetary error budget or sample count from unqualified history. Calibration/error-budget cells that cannot yet be justified are explicitly unresolved. Consequently, **C8 EVALUATION MATRIX READY FOR OWNER APPROVAL: NO** for a complete production activation contract. E01 authorized assessment, not permission to fill those cells arbitrarily or to bypass them because a model beats a weak baseline.

Canonical definitions remain [combined mapping §8](CYCLE-08-COMBINED-SCHEMA-MODEL-EVALUATION-MAPPING.md), [D01–D16](CYCLE-08-OWNER-DECISION-PACK.md) and [frozen preflight](CYCLE-08-PREFLIGHT-AND-SCOPE.md). The proposed schema remains **3 models / 94 physical fields / 2 altered existing models / 0 Action Engine classes / 3 AC6 classes / 1 migration / no backfill**. It is not implemented or newly approved by this report. Requirements/packages/waves/surfaces remain **24 / 6 / 4 / 32**.

## 1. Evidence, scope and reproducibility

Committed evidence is in [chapter8-e01](evidence/chapter8-e01/access-summary.json):

| Evidence | Meaning |
| --- | --- |
| [Production aggregate](evidence/chapter8-e01/production-aggregate.json) | Snapshot at **09:21:43.853 UTC**, current canonical PostgreSQL only; tenant aliases rather than IDs/names. |
| [Follow-up aggregate](evidence/chapter8-e01/production-followup.json) | Exact joined Client/consistent attendance counts and other durable snapshot counts; no case records. |
| [Read-only query manifest](evidence/chapter8-e01/readonly-query-manifest.json) | 18 aggregate SELECT statements across two successful `REPEATABLE READ READ ONLY` transactions, connection default read-only, 15-second statement / 1-second lock timeout, ROLLBACK. |
| [Provider probe](evidence/chapter8-e01/provider-readonly-probe.json) | Existing deployed YClients adapter, verified active integration, **2026-08-31 through 2026-09-06, Europe/Moscow**; eight GETs, all HTTP 200. No individual identifiers, monetary amounts or raw rows exported. |
| [Source index](evidence/chapter8-e01/source-index.json) | Exact inspected repository files and hashes. |
| [Access summary](evidence/chapter8-e01/access-summary.json) | Unchanged release, health/readiness and effect counters. |

Production release remained `20260912-c7-p06-4058cd8c`; health and database readiness PASS at the two read-only checks. No production deployment, maintenance/PWA change, consent/booking/message/financial effect or database migration was attempted. Three initial aggregate attempts failed on SQL alias syntax and were rolled back read-only; these are assessment-query mistakes, not runtime regressions. The original subject query spelled `cancelled`; the follow-up instead requires exact `completed` and joins canonical Client. Its result is authoritative and leaves the subject counts unchanged.

Provider credentials were decrypted only inside the existing server environment. A GET-only allowlist and finite request budget constrained the provider probe. Returned payloads existed only in remote process memory; committed evidence contains presence/coverage/counts, not accounts, names, contact details, staff pay or transactions. None of the 17 protected old databases was accessed. This was not a provider-wide historical census, and absence from this bounded assessment must not be restated as proof that a provider cannot ever supply the information.

## 2. What actually exists

| Source | Observed result | Evaluation consequence |
| --- | --- | --- |
| Tenant/integration | Two active tenants; one data-bearing, explicitly barbershop, verified YClients. Other tenant has no qualified integration/vertical here. | Empirical coverage: **one tenant / one vertical / one provider**. No dental, auto-service, second-provider or cross-tenant generalization claim. |
| Canonical Client | 23 unmerged Clients; 23 CRM links; **22 Clients without Maya User**. | User absence is not missing Client authority. No User/phone matching or automatic identity creation for evaluation. |
| Appointment | 2,489 total; **36 exact current Client-linked rows / 17 Clients**; 2,453 missing Client. | Current Client-link missingness **98.5536% (2,453/2,489)**. Current association still does not prove association/features known at a historical T0. |
| Attendance | 1,312 NULL attendance; 1,032 consistent completed/arrived; seven consistent no-shows; one arrived/canceled conflict. | NULL **52.7119% (1,312/2,489)**, not negative. Ten rows have status=no_show but NULL attendance; exclude them. Status=completed alone is not attended evidence. |
| Exact Client outcomes | 23 consistent attended rows across 16 Clients; six Clients with multiple observed arrivals; **zero Client-linked no-show positives**. | These are source observations, not 23 qualified return/no-show evaluation cases. No H, input snapshot or mature-negative denominator is certified. |
| Other linked rows | Ten past awaiting/canceled; two past awaiting/completed; one future linked appointment. | Twelve unresolved/excluded past rows, one immature future row. Never turn them into no-show/non-return negatives. |
| Source window | Visit timestamps 2024-10-24 → 2026-10-03; first local mirror admission **2026-08-15**. 1,168 rows changed after first storage. | Old visit dates do not provide old feature snapshots. Future scheduled dates are not observed outcomes. |
| C7 derived history | **MeasurementRevision: 0**. OwnerReportRun: **9**; CashDeclaration: 0. | No retained C7 measurement revisions to use as a T0 feature archive. Nine reports are not ignored, but report existence alone is not a qualified per-target case dataset; report bodies were not exported/reinterpreted as features. |
| Domain events | 1,431 total, including 549 created observations, 504 attendance changes, 54 removals, 191 reschedules, 126 service and six staff changes. One older `attendance_recorded` row is excluded from the current event contract. | Counts are not independent training examples. Event `pending` is processing state, not automatic invalidity of accepted source evidence. |
| Event time | Watch began 2026-08-17. Created observations received 2026-08-17 → 2026-09-13. | `occurredAt` is explicitly **observation time**, not provider business-change time. Cannot silently certify T06 creation-time labels. |
| Ingestion | 1,428 completed reconciliations; two failed/unfinished runs; seven unresolved quarantined deliveries. 312,305 fetched observations include repeated scans. | Completed scan != complete historical observation window. Repeated fetch count cannot inflate N; unresolved gaps cannot become zero demand/no return. |
| Booking value | 2,444 price-present / 45 missing; RUB. Price missingness **1.8080%**. All Appointment branch IDs missing; 14 staff IDs missing. | Booked price != cash/net/refund/salary. Branch-qualified forecasts cannot borrow a guessed branch. Tenant-level scope does not automatically require branch ID, but cannot pretend to be branch-level. |
| Financial probe | One week: 179 provider transactions, staff attribution 100%, service attribution 57%; provider-reported revenue available. | This confirms a source exists. It is not 179 independent forecast periods, not Client-linked cash, and not certified net/profit. No negative transactions in this week does not establish refund support or zero refunds globally. |
| Payroll probe | Actual accrued/paid fields available for five staff rows in the same week. | Actual salary exists; independently archived lawful compensation terms at T0 and a temporal salary evaluation dataset were not established. No .5 assumption. |
| Other sources | Expenses/declarations 0; internal availability rules/exceptions 0; RecoveryConversion 0; C8 policy 0; C8 model table absent. | No current C8 H/model domain, source-linked expense series or qualified capacity history in this assessment. External capacity is not proved absent; it is not qualified here. |

Source constraints are executable, not inferred from report prose: `src/crm/appointment-change.service.ts::applyObservation` records observation time and limits the creation payload to schedule/staff/service; `src/domain/appointment-change.ts` does not archive every Client/price change. `measurement.sources.ts` labels Client history PARTIAL and cash/refund unavailable without qualified evidence; `measurement.finance.facts.ts` preserves provider gross as PARTIAL; `measurement.staff-goal.facts.ts` reads actual payroll without inventing compensation terms. See the pinned source index. No new bug/remediation is asserted merely because these intentionally bounded contracts cannot reconstruct C8 training data.

## 3. Qualification vocabulary and counts

**SUFFICIENT** = a certified, scoped, T0-safe dataset can support the specified temporal derivation/validation/test protocol and quality uncertainty. **LIMITED** = at least some exact T0→mature-label pairs are certified, but not enough for activation. **INSUFFICIENT** = the required paired dataset or a mandatory label/input contract is not established. These classifications describe the *target dataset*, not whether source facts are useful.

`qualifiedCasesCertified=0` means **zero cases certified by this assessment**, not a claim that every historical record is invalid or that all possible read-only reconstruction has been exhausted. No case-level dataset was assembled. Aggregate source observations cannot be promoted to qualified examples without T0/label/coverage proof. A missing dataset denominator is **N/A / not established**, never 0% missingness. Positive/negative counts are meaningful only for binary labels; they are **N/A**, not zero, for money/count/minute targets.

No H is invented. Each H must be an explicit duration/window in the confirmed A22 policy AND supported model manifest; the current approved concept permits this parameter but production has **zero c8_valuation policies**. No universal 30/60/90-day forecast/dormancy threshold is introduced. Label lag L must come from authoritative finality/ingestion evidence, not an arbitrary day count. Unknown lag means not mature.

## 4. Eight target assessment sheets

All sheets inherit exact tenant/vertical/provider coverage above. The observed current-schema/source window and the certified evaluation window are separate; the latter is **none established** for every target. Missing inputs cannot be repaired by LLM, phone association, future edits, generic vertical priors or copying historical rows into new C8 records.

### T01 — attended_return / P03

- **Label:** at least one proven attended visit for exact Client/service scope in `(T0,T0+H]`. Mature 0 requires complete coverage through H; non-return over H is not permanent churn.
- **T0:** permitted covered recency/frequency/attendance/calendar facts and exact canonical subject as known by admission. Later attendance is label-only; later Client links cannot be inserted into features.
- **Available:** the Appointment window in §2; 17 currently linked subjects, 16 with arrivals, six repeat-arrival histories, 23 attended source observations. **Qualified subjects/events: 0 certified; positive 0 certified; negative 0 certified.** Fixed-H censored count is not computable without a T0 cohort/H; raw unresolved/future linked rows = 12/1, not that cohort's censor count.
- **Missingness:** Client link 98.5536% of Appointment rows; required T0/coverage-feature missing rate N/A because no eligible observation cohort exists. Label quality PARTIAL; absence cannot be labelled 0.
- **Suitability:** INSUFFICIENT. Regularized logistic only within the mapped feature/target scope; no personal cold-start prior or permanent churn model. Historical Client linkage, late outcomes and overlapping return windows are the main leakage risks.

### T02 — appointment_no_show / P03

- **Label:** exact admitted future Appointment → authoritative no_show=1 or arrived=0 after scheduled end plus supported maturity. Cancel/reschedule/unknown remain excluded/censored; conditional population and excluded denominator must be disclosed.
- **T0/H:** freeze the appointment schedule and permitted previous history before the event; H ends at that admitted scheduled end plus L. Rescheduling does not let a later schedule leak into old features.
- **Available:** seven consistent no-show observations globally, **none with canonical Client**; 23 consistent Client-linked arrivals. These are source counts, not scored cases. **Qualified subjects/events/positives/negatives: 0 certified.** Twelve linked unresolved/excluded past rows and one immature linked future row; ten status-only no-shows excluded globally.
- **Missingness:** same Client gap; among the seven consistent positive source rows Client linkage is missing **7/7**. Feature/history completeness and historical T0 feature rate N/A. A low observed unqualified incident count is not a trustworthy prevalence baseline.
- **Suitability:** INSUFFICIENT. Same bounded logistic class as T01; never past-count >=2 as risk probability. Outcome/status confusion, cancellation selection and later appointment edits are explicit leakage/label risks.

### T03 — client_expected_value / P02

- **Label:** exact Client's sum over H on one named monetary basis/currency. Cash, linked-refund net, booked value and provider gross are separate instances; no lifetime CLV, margin, causal gain or independence multiplication.
- **T0:** qualified past money and Client history, known conditions only; later refund/correction is a later label revision.
- **Available:** up to 36 currently linked Appointment rows; 2,444 global booked prices; one tenant-level provider week, **not exact Client money**. No certified Client cash/refund evaluation cohort. **Qualified subjects/events: 0 certified; +/- labels N/A; missing/censored monetary outcomes N/A, not zero.** Price missing 45/2,489 is not cash completeness.
- **Suitability:** INSUFFICIENT. Bounded regularized direct-H regression. **An expected amount is a conditional mean:** squared-error/RMSE evidence must accompany MAE, which alone rewards a median. Negative net values remain possible. Current lifetime/provider totals, later linkage and inferred refunds cannot supply T0 features/labels.

### T04 — business_revenue / P03

- **Label:** future aggregate over exact H/scope/basis/currency; same basis on both sides of evaluation. Provider gross != confirmed cash/net; do not relabel a scheduled sum.
- **T0:** already-known past qualified periods/calendar. Independent aggregation and complete observation boundaries must be demonstrable.
- **Available:** one verified provider week, 179 transactions, partial service attribution; no C7 MeasurementRevision rows. Nine existing reports have not been qualified into a comparable feature/label series. **Qualified independent periods: 0 certified; binary +/- N/A; censored/unknown periods N/A.** Scope-feature missingness: branch ID 100% in Appointment mirror, service attribution absent 43% of the probed provider attribution measure; do not conflate that measure with a transaction-count missing rate.
- **Suitability:** INSUFFICIENT. Direct-H regularized forecast; tenant-level source facts useful, historical point-in-time and series completeness unproved. A complete week read today cannot establish a prediction made before it. Broader provider history may exist; this bounded probe neither assessed nor certified it.

### T05 — staff_earnings_conditional / P03

- **Label:** exact Staff confirmed accrued salary over H, conditioned on independently known lawful terms; not payroll execution, paid cash or revenue goal.
- **T0:** qualified prior salary and compensation conditions then in force. Future changes cannot retroactively supply an old contract.
- **Available:** five staff payroll source rows for one week, accrued and paid fields present. **Qualified Staff-period cases: 0 certified; binary +/- N/A; censored/unknown periods N/A.** Mandatory T0 terms and paired salary history are unestablished for all five candidate staff rows, not evidence that actual salary is missing.
- **Suitability:** INSUFFICIENT. Direct-H conditioned regression only if terms are independently available under an existing owner. No new salary authority or fixed commission. Current payroll/terms as past facts would leak future knowledge.

### T06 — observed_booking_demand / P03

- **Label:** later canonical booking-created count over H, exact scope, independently qualified event-time and ingestion coverage; not unserved market demand or visit-start count.
- **T0:** only the already-known event stream and permitted calendar context. Label clock must be explicit and consistent with the mapped business event.
- **Available:** **549 creation observations** (523 webhook, 26 reconciliation), Aug 17–Sep 13. Creation payload omits Client/price/provider creation timestamp. The adapter explicitly stamps **observation time**. Reconciliation can first observe an earlier booking after T0.
- **Qualified independent H-periods: 0 certified; binary +/- N/A; uncovered/censored windows N/A.** Independent business-event-time evidence missing from 549/549 creation payloads; required complete-ingestion-window denominator not established. Repeated 312,305 fetches do not increase N.
- **Suitability:** INSUFFICIENT. Direct-H nonnegative count model only after source/time qualification. Current observational counts may be displayed as such; silently changing this target to “webhooks received” is not allowed. Failed/quarantined input and observation lag cannot be learned as business demand.

### T07 — scheduled_utilization / P03

- **Label:** future scheduled occupied resource minutes divided by independently qualified available minutes over H, exact resource; delivered utilization separate. Overlap/closure handling must follow canonical capacity facts.
- **T0:** known schedule/capacity and covered past occupancy. Both numerator and denominator must be known on their appropriate sides of T0; today's corrected schedule is not yesterday's input.
- **Available:** Appointment start/end and 2,475 staff-present rows; **internal capacity rules/exceptions 0/0**, no certified historical external capacity snapshots. All branch IDs missing. **Qualified resource-periods: 0 certified; +/- labels N/A; unknown capacity periods N/A.** Required denominator missingness cannot be given as a percentage without a resource-period population; no denominator has been certified.
- **Suitability:** INSUFFICIENT. Bounded occupied-minute model evaluated after clipping/constraints, plus ratio error. Calendar appointments do not imply opening hours/capacity, and no provider-wide schedule census was performed.

### T08 — statistical_deviation / P03

- **Label/target:** future named same-basis metric relative to its qualified predictive distribution over H. Unsupervised unusualness, not incident/fraud/harm probability. An independently labelled incident task is not invented here.
- **T0:** frozen metric/forecast/residual contract and covered history; no threshold chosen after seeing the alleged anomaly.
- **Available:** the unqualified-for-forecast periods/observations in T04/T06/T07. **Qualified residual evaluation periods: 0 certified; independently qualified incident positives/negatives: N/A, no labelled incident dataset established.** Unknown/censored and missing-feature rates N/A for an undefined metric cohort.
- **Suitability:** INSUFFICIENT. Residual-quantile method only, with forecast qualification inherited. Apparent spikes caused by ingestion or a basis change are not proved business anomalies. Actual incidence/false-positive accuracy cannot be estimated without incident labels.

## 5. Baselines first — no measured performance fabricated

All baseline performances below are **NOT ESTIMABLE ON A QUALIFIED TEMPORAL TEST SET**, not zero loss and not FAIL. No baseline was fitted or model trained in this assessment. Source counts above are not a substitute for a held-out score. Baselines are offline comparators, never a cold-start production fallback.

| Target | Baseline method and rationale | Known limitation |
| --- | --- | --- |
| T01 | Empirical attended-return prevalence from earlier **qualified same-H/scope** cases; simple no-feature probability. | No mature complete non-return cohort now; raw repeated visits do not define prevalence. |
| T02 | Earlier qualified same-scope no-show prevalence for the admitted Appointment target. | Zero canonical-linked positive source cases; all-unlinked/global status counts cannot form this baseline. |
| T03 | Earlier qualified matching-H Client monetary mean on exact basis/currency; estimates the target's mean without complex features. | No qualified Client monetary/time cohort; no tenant allocation or zero refunds. |
| T04 | Last complete comparable period; seasonal naive only if a season is supported by earlier data. Choose comparator using validation before final test. | One probed week cannot establish a seasonal cycle or held-out forecast error. No universal weekly season. |
| T05 | Last complete comparable actual accrued-salary period under the same known terms. | Conditions/history unestablished; neither half of revenue nor goal amount is salary. |
| T06 | Last comparable complete booking-created count window; supported seasonal comparator only if qualified. | Observation clock and gap recovery invalidate a naive business creation-time reconstruction. |
| T07 | Last comparable qualified occupied minutes/available minutes with known resource/capacity scope. | Missing denominators; never divide by guessed hours. |
| T08 | Predeclared empirical residual distribution of the qualified simple forecast baseline; fixed tail comparator. | Neither qualified residual sequence nor labelled incident reference exists. No “accuracy” from unlabeled spikes. |

Point errors must come from forecasts made without the test outcome, and MAPE breaks down at zero/near-zero values; see [forecast accuracy methodology](https://otexts.com/fpp3/accuracy.html). The source supports the methodology, **not a Maya-specific acceptable loss or sample count**.

## 6. Proposed quantitative matrix — complete safety rules, incomplete activation budgets

### 6.1 Exact proposed shared gates

These values are proposals, not passed results or owner-approved model operating points:

1. **100% of included cases** must have exact authorized scope, source/label contract, provable T0 features, mature outcome and supported H/basis; **0** critical leakage/false-label/identity violations. Report exclusions and full eligible-population denominator. This is qualification of included cases, not a requirement that every business Client has complete history; excluded cohorts receive no numeric claim.
2. **0 certified eligible cases, missing target/H or unqualified label/feature contract → DISABLED.** Synthetic tests validate implementation only; they contribute **0** real evaluation cases.
3. Proposed statistical false-certification budget: **5% per frozen target-version evaluation**, explicitly a risk-budget proposal rather than an observed business tolerance. For a joint release of K separately tested target/horizon/cohort variants use Bonferroni **alpha=0.05/K**, and divide further among separately asserted performance/calibration claims. K is fixed before test access, never reported as eight when more variants were tried. Valid dependence-aware tests are still required; adjustment cannot repair biased data.
4. Proposed added-value boundary: one-sided adjusted-confidence **upper bound of paired mean loss difference (model − frozen baseline) < 0** on the same later cases. Equivalent loss-ratio bound `<1` only when its denominator is nonzero. No arbitrary 10% gain. If baseline loss is zero, a strictly improved model cannot qualify under this gate; keep numeric output disabled rather than adding epsilon or loosening the target.
5. **Baseline improvement alone is insufficient.** Calibration precision, usable error/interval width and sample/coverage gates must also have approved values and pass. Missing budget is not infinity or a waiver. No quality override by tenant, owner request, AI or another target's PASS.
6. No unit-free pooling across currencies/bases/verticals/providers; **0** unsupported numeric transfers. Same Client without Maya User is admissible if existing exact lineage is valid. Value/rank never supplies consent, contact permission or action authority.

The 5% statistical risk proposal and loss boundary 0 are numerical recommendations with stated meanings. They do not mean “a forecast is within 5% of reality” or “95% of money predictions are right.” No such empirical assertion is supported. The owner has not approved this risk budget.

### 6.2 Target-specific metrics, minimum sample and activation

`N*` below is an explicit *precision/power-derived sample requirement*, not “100 rows.” It cannot presently be reduced to a defensible integer because the required error budget and qualified variance/prevalence/dependence are unavailable. **Current accepted N is zero for every target; current activation threshold is not satisfied.** Mathematical degrees of freedom / having one positive and one negative are necessary sanity checks, never adequate sample criteria.

| Target | Primary / secondary and calibration | Proposed numerical acceptance + unresolved budget | Minimum qualified sample / scope / business meaning |
| --- | --- | --- | --- |
| T01 | Brier primary; log loss non-degradation, reliability by predeclared probability/cohort bins; ROC/PR-AUC descriptive, not pass by accuracy. | Paired Brier loss UCB `<0`; log-loss UCB `<=0`; calibration-error simultaneous UCB must be `<=epsilon_return`. **epsilon_return and supported probability precision cannot be justified now.** | N* from event/non-event support and calibration CI precision for each exposed bin/scope; cases clustered by Client/time. PASS would allow a numeric attended-return probability for exact H/domain, not causal return lift/permanent churn. Now show facts/unavailable. |
| T02 | Brier + log loss; rare-event reliability, PR-AUC with prevalence, ROC-AUC secondary; no operational precision/recall threshold without approved operating policy. | Same loss gates, calibration UCB `<=epsilon_no_show`; this tolerance cannot simply be borrowed from return probability. **No justified numeric epsilon with zero qualified positives.** | N* needs independently qualified positives and negatives in later partitions and sufficient precision in the rare-risk region. PASS would permit exact Appointment no-show probability, not a contact/penalty decision. Current past-count labels cannot substitute. |
| T03 | Conditional-mean squared error/RMSE primary; MAE, signed bias, interval score/coverage and scaled error secondary. Preserve expected-mean semantics. | Paired squared-loss UCB `<0`, MAE non-degradation `<=0`; interval score vs baseline `<=0`. Mean-bias, amount-error and interval usefulness/calibration budgets **unresolved**, separately for cash/net/booked/gross/currency/H. | N* from independent Client-period loss variability and required CI/interval precision; no universal ruble/percent cutoff. PASS could expose expected amount with uncertainty/basis, never certified CLV/profit/incremental gain. |
| T04 | MAE primary (plus squared loss if presented as an expected mean); signed bias, valid MASE, interval coverage/score/width. | MAE-difference UCB `<0`; scaled ratio `<1` only with valid denominator; interval-score non-degradation `<=0`. **No supported absolute revenue error, nominal interval level, coverage shortfall or width budget.** | N* is independent complete H-periods, not transactions; season-specific coverage required for a seasonal claim. PASS would support a named-basis forecast with measured error, not imply incomplete cash/refunds are known. |
| T05 | Accrued-salary MAE; mean loss if an expectation; bias, interval score/coverage; condition-change cohorts separate. | Same relative loss criteria; missing independently known terms → **DISABLED regardless of loss**. **Salary-unit error and calibrated interval budgets unresolved.** | N* is qualified Staff-periods under known terms with Staff/time dependence accounted for, not five payroll rows. PASS would allow conditional salary forecast, never payroll mutation or revenue target progress as earnings. |
| T06 | Count MAE primary; valid scaled error, bias, count interval score/coverage. | Count-loss UCB `<0`; interval-score non-degradation `<=0`; creation clock/ingestion gap violation count **0**. **Count error/interval budget cannot be derived from 549 observation-time events.** | N* is independent, completely observed H-windows; exclude gap windows rather than zero-fill. PASS would allow observed booking-demand forecast in bookings/H; no latent market demand claim. |
| T07 | Occupied-minute MAE and utilization percentage-point error, interval score/coverage; numerator/denominator and bounding assessed together. | Minute-loss UCB `<0`; ratio loss no worse than baseline `<=0`; invalid capacity/overlap/unknown denominator cases **0 included**. **Minute/ratio-error and interval budgets unresolved.** | N* is independent resource-periods with qualified capacity; resource/date clustering. PASS would allow scheduled utilization forecast, not assume full capacity from bookings or predict delivered occupancy. |
| T08 | Qualified forecast interval/tail exceedance rate and interval score/stability; incident precision/recall **N/A** without incident labels. | Interval-score difference UCB `<0`; adjusted tail-rate UCB `<=approved_tail_burden`. **Tail burden/nominal level not selected from the observed spikes.** No labelled incident case → incident accuracy claims **0**. | N* derived from tail-frequency uncertainty over independent metric periods. Without labelled incidents this measures unusualness frequency, not false-positive incident rate. PASS would permit a scoped statistical-deviation signal; it cannot assert fraud/harm or initiate alerts/actions. |

For probabilities, Brier includes both discrimination and calibration; a lower loss is not a substitute for reliability analysis. [Primary implementation documentation on calibration](https://scikit-learn.org/stable/modules/calibration.html) explains that distinction. For forecasts, interval score measures both width and misses; see [distributional forecast evaluation](https://otexts.com/fpp3/distaccuracy.html). Neither reference supplies business tolerance for Maya.

### 6.3 Sample derivation and why no fabricated N appears

For a *qualified independent* binomial proportion, Wilson or exact binomial limits quantify uncertainty. For rare/zero events, use exact bounds; do not report perfect calibration from no observed positives. As a planning approximation only, a desired half-width `epsilon` and adjusted z imply `N >= z² p(1-p)/epsilon²`; unknown p needs a conservative bound or qualified pilot. Actual activation uses the predeclared appropriate interval, not this planning approximation. Correlated Clients/overlapping H-periods require cluster-aware effective evidence; raw N cannot be substituted. [NIST's proportion intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) supplies the statistical method, not epsilon or an approved independent-case count.

For monetary/count/minute losses, N* depends on variance/tails/dependence of **paired later-period errors**, the meaningful detectable improvement and allowed uncertainty. None was measured here; an unqualified 179-transaction total is not a variance estimate for independent forecast periods. With no agreed amount/width utility budget, reporting “N=30/100/1,000 is enough” would invent adequacy. For tails, N* follows the binomial/cluster interval at the approved burden; unknown anomalies cannot become labelled normal cases.

Thus this report does not claim the user requested a new schema/business owner. It identifies the still-missing **single combined quantitative risk/utility budget plus qualifying evidence**. No arbitrary accuracy 80%, AUC .7, MAPE 10%, default season or epsilon is proposed as if production data established it. Approving current disabled dispositions alone would not approve the unresolved numeric cells.

## 7. Temporal protocol, limited data and leakage review

Future evaluation must register one exact target instance (tenant/vertical/provider/subject/basis/currency/H/label lag/feature cut-off/coverage/model-rule-policy versions) before labels or test losses are accessed. No fitting or split assignment happened now.

1. **Derivation:** only features knowable by each original T0. Earlier training labels must have matured and been available before validation begins. Feature transforms/model/season choice fit earlier data only. Reconstructable old inputs require independent archives; no model-generated reconstruction.
2. **Validation/calibration:** temporally later windows used for declared candidate/regularization/calibrator/baseline choice. No final-test outcome enters those choices. If the available data cannot support a candidate comparison, do not try multiple methods until one passes.
3. **Locked later test:** another strictly later window; calendar boundaries fixed before its outcome access. Purge overlapping label intervals and embargo by **at least the exact H plus source maturity lag L**; use the actual maximum support interval if longer. Client/Appointment duplicates and the same outcome must not appear as independent cases across partitions. Cluster by Client and correlated time/resource periods; a later observation of the same Client may use legitimately known past facts but not duplicate future labels or a memorized Client identifier. Any claimed new-Client generalization requires a separately held-out Client cohort as well as time separation.
4. **Independence:** recurring Client windows, staff in the same shift, overlapping resources and shared business shocks reduce effective sample. IID random splitting or IID error intervals on these rows is forbidden. Choose/document dependence-aware intervals from derivation data; absent a defensible dependence model, uncertainty/activation remain unavailable.
5. **Maturity/coverage:** immature and corrected outcomes receive proper censoring/revision. Unknown observation coverage does not establish an all-zero period. Report total eligible, excluded by reason, mature and independent test counts. Test subset is selected by pre-outcome eligibility, not favourable loss.
6. **Limited-data fallback:** source-labelled facts and readiness only. No live numeric “experimental” output, generic personal prior, backfill or synthetic-data calibration certificate. Collecting prospective inputs would require later authorized implementation; nothing was collected into new runtime tables now. The evaluated scope is never expanded by pooling tenants or providers without an approved, evidenced domain.

Temporal rolling-origin evaluation follows [time-series cross-validation](https://otexts.com/fpp3/tscv.html). No 80/10/10 split is imposed on this data: the relevant unit is complete, independent, mature H-windows, not a convenient percentage of rows.

**LEAKAGE REVIEW: PASS as an assessment**, because identified unsafe reconstructions were excluded and no target was certified with them. This is **not** a PASS for a future dataset/model. Main risks: modern Client links applied to old visits; current Appointment status/price/Client used as pre-visit features; NULL attendance mapped from status; observation timestamp treated as provider creation time; post-T0 refund/payroll terms; reschedule outcome reused across partitions; repeated scans inflating N; partial current finance passed off as historical complete net.

## 8. Scope, drift and retention

Activation, if a later complete quality contract is approved and passed, is only for its exact tenant/vertical/provider/basis/H/eligible cohort. One barbershop cannot calibrate dental procedure cadence or auto-service returns. Tenant policy may tighten eligibility; it cannot waive missing inputs, change a model horizon out of domain or override quality. No scoring/ranking/Opportunity permission implies consent or execution.

Hard source/identity/permission/basis violations disable affected numeric outputs **immediately at use**. Statistical drift must be measured on predeclared non-overlapping mature batches using the same approved loss/calibration/burden gates. The batch size is N*, not an invented calendar duration. A model-age/coverage deadline and test frequency must be frozen in its complete contract; currently absent → OFF. Repeated unadjusted testing, monitoring until a lucky PASS, and automatic retraining/promotion are prohibited. New evaluation or model attempts need multiplicity accounting and a genuinely later untouched test window, not reuse of exposed holdout labels.

Existing 365-day C8 derived-artifact policy remains unchanged: usable evaluation must fit within the earliest retained input/case deadline. Retry/wrapping/aggregate recopy cannot extend personal retention. Long H, maturity lag and independent-period requirements may make calibration impossible in that retention window. The correct result is unavailable; do not silently extend retention, use the 17 old DBs, or shrink H to pass. Qualified source-labelled historical facts remain under their source contracts; C8 creates no fictional historic prediction lineage.

Confirmed historical predictions/evaluations, once implemented, remain immutable; later corrections produce another evaluation revision and may revoke current eligibility. They do not rewrite T0 or historical model success. Disabled means facts/readiness remain available under existing authority, not fallback to the eight legacy scoring implementations.

## 9. Owner-facing conclusion and approval boundary

There are real source facts: visits, current canonical Clients, provider transactions and actual payroll. There is **not yet a certified T0-safe dataset** for any of the eight probabilistic targets. It would be misleading to convert source-row counts into training counts, compute a pseudo-baseline, and select error thresholds that it happens to pass.

The owner can review all eight unavailable dispositions and the baseline/statistical framework together. A complete numeric activation matrix still needs a single target-specific precision/error/interval-utility budget and corresponding qualified sample/temporal evidence; this report does not claim those are now known. No eight separate schema proposals or new target families are required. The structural schema/model proposal and approved D01–D16 remain intact. **Do not interpret this assessment as permission to implement schema, fit models or emit predictions.**

Until then Maya may report authorized C7 facts, limitations and deterministic approved policy signals; it may not supply numeric return/no-show/value/revenue/earnings/demand/utilization/deviation probabilities or forecasts from this unqualified evidence. Cold-start/unavailable is the correct product result and does not itself fail Chapter 8 architecture.

## 10. Final status

```text
E01 APPROVED: A
PROBABILISTIC TARGETS ASSESSED: 8/8
TARGETS WITH SUFFICIENT DATA: 0
TARGETS WITH LIMITED DATA: 0
TARGETS WITH INSUFFICIENT DATA: 8
BASELINES DEFINED: 8/8
NUMERIC QUALITY GATES PROPOSED: 8/8 — qualification/disable + relative-loss framework; complete activation budgets NOT established
COMPLETE NUMERIC ACTIVATION CONTRACTS: 0/8
LEAKAGE REVIEW: PASS — assessment exclusions, not a trained-model certificate
REAL-WORLD CALIBRATION CURRENTLY POSSIBLE: 0/8 — none certified in the bounded assessment
PREDICTIONS THAT MUST REMAIN DISABLED: T01,T02,T03,T04,T05,T06,T07,T08
C8 EVALUATION MATRIX READY FOR OWNER APPROVAL: NO — complete activation contract
C8 SCHEMA/MODEL ENVELOPE OTHERWISE UNCHANGED: YES
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
MODEL TRAINING/DEPLOYMENT: 0
PRODUCTION MUTATIONS: 0
CHAPTER 8 IMPLEMENTATION STARTED: NO
PROCESS HYGIENE: 0
```

Git equality is verified after the documentation commit/push; [documentation verification](evidence/chapter8-e01/documentation-verification.json) and [hygiene evidence](evidence/chapter8-e01/hygiene.json) cover owned scope. Main dirty files and old DBs remain protected. No owned processes/watchers/browsers/temp databases remain. STOP after report/evidence push.
