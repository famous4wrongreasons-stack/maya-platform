# Chapter 8 — consolidated Owner Decision Pack

Date: 2026-09-13. Baseline `bf042699`; C7 checkpoint `a7389950` accepted.
**16 decisions presented; 0 approved. Runtime/schema implementation is not authorized.**
This pack accompanies [preflight/scope](CYCLE-08-PREFLIGHT-AND-SCOPE.md). The S-A…S-J citations and F/L/M inventory IDs resolve there. Options are proposed product contracts, not claims that these choices already exist in repository.

After the owner chooses, perform **one combined schema/action mapping** for P01–P06. For every decision below: exact new models, physical fields, action classes, AC6 classes and migration count are **TBD at that mapping**. Existing owner reuse does not prove zero schema impact. No migrations/backfill/runtime are executed now.

## D01 — What counts as historical Client value

- **A — Recommended:** separate deterministic historical measures by exact interval/basis/currency. Primary monetary value may be confirmed cash less confirmed linked refunds only when supported; show booked value/provider-reported gross as distinct observed proxies with limitations. No single hidden “valuable Client” scalar.
- **B:** prioritize observed visit frequency/recency only; keep money outside Client ranking.
- **C:** a tenant-confirmed weighted historical business-value index with explicit labelled components; no claim it is cash/profit.
- **WHY:** C7 exposes several different monetary truths and missing Client-level cash/refund evidence; S-I/J forbid conflation.
- **GAINS:** defensible comparisons and visibility of unavailable money.
- **LOSES:** not every current CRM Client gets a money-value rank; a large provider check alone does not establish value.
- **OWNER / BOUNDARY:** C8 deterministic valuation consumes C7/source owners; AI explains only.
- **SCHEMA IMPACT:** basis/window/currency/qualification and source-ref representation to map; no new ledger.
- **DEPENDENCIES / PACKAGE:** Q01/F05/F06; D08, D10; P02.

## D02 — Predicted value, CLV and horizon

- **A — Recommended:** bounded expected future value on an explicitly confirmed tenant/model horizon and named monetary basis. Label “expected value over H,” with interval/model version; reserve “CLV” for a separately explicit finite-horizon definition including cost/discount assumptions where relevant. No infinite-lifetime CLV or lifetime-spend renaming. Unmodelled required assumptions → unavailable.
- **B:** only historical value in the first C8 release; future Client-value/CLV capability explicitly deferred by this owner decision.
- **C:** model full lifetime value now, requiring a separately justified lifetime/censoring/cost/discount contract and expanded data requirements.
- **WHY:** canonical sources assign valuation/CLV to C8 but approve no universal lifetime formula. A implements finite predictive value while making its scope honest.
- **GAINS:** comparable, testable prospective value linked to later C7 outcomes.
- **LOSES:** no attractive unlimited “this Client is worth X forever” number; no universal horizon silently selected for every vertical.
- **OWNER / BOUNDARY:** C8 hybrid: deterministic basis/eligibility; qualified predictive model for future outcomes. LLM cannot choose a probability.
- **SCHEMA IMPACT:** target/horizon/model/input-version/result/uncertainty references; no reuse of C7 measured-value fields as probability.
- **DEPENDENCIES / PACKAGE:** D01,D05,D08,D13; P02 with P03/P05. Horizon is a required named policy/model parameter before activation, not a new owner architecture cycle each tenant.

## D03 — Dormancy and loyalty signals

- **A — Recommended:** explicit confirmed tenant/service policy over proven visit evidence and tenant-local time. A duration is a policy; observed cadence can support a suggestion, not silently change it. Loyalty signals retain definitions/coverage; no universal loyal class. Unknown last visit is unknown.
- **B:** show only raw recency/frequency, with no dormant/loyal classification.
- **C:** learned individual cadence supplies a model-based “later than expected” flag, separately labelled and gated by D13; never equivalent to consent or deterministic policy.
- **WHY:** S-A/C/H prohibit universal 3 visits, 60 days or high-check rules.
- **GAINS:** one core supports different businesses and service cycles.
- **LOSES:** old instant “loyal/dormant” labels disappear until the policy and evidence qualify.
- **OWNER / BOUNDARY:** deterministic policy/feature owner under C8; optional probabilistic signal stays separately typed.
- **SCHEMA IMPACT:** typed duration/unit/service scope, policy/version/evidence refs; exact A22 mapping TBD.
- **DEPENDENCIES / PACKAGE:** D08,D09,D10; P01/P02. “45 days” or “>2 months” is an owner-confirmable example, not a pre-approved default.

## D04 — Ranking semantics

- **A — Recommended:** tenant-selected objective and a finite explicit ordered comparator over eligible named measures; same basis/currency/horizon cohort, then declared secondary criteria, then stable opaque subject key. Persist/reproduce input cohort, versions and tie ordering. Separate unknown/ineligible bucket with reasons; no arbitrary weighted “AI score.”
- **B:** grouped measures without a total order, letting the owner compare manually.
- **C:** a versioned learned ranker with its own outcome target, training/calibration/evaluation and bias review.
- **WHY:** makes “why above another?” answerable without hiding incompatible quantities in one score.
- **GAINS:** stable, auditable priority and clear unknown coverage.
- **LOSES:** no one-size-fits-all top list across currencies, financial bases or uncertain/missing inputs.
- **OWNER / BOUNDARY:** C8 ranking deterministic over facts/qualified estimates. AI cannot select or reorder subjects outside that contract.
- **SCHEMA IMPACT:** rank input/version/cohort/comparator identity to map, not a second Opportunity table.
- **DEPENDENCIES / PACKAGE:** D01–03,D08,D10,D13; P02.

## D05 — Return / churn / no-show prediction targets

- **A — Recommended:** explicit versioned targets: proven attended return within H after T0, and no-show for a specified future Appointment whose outcome can be authoritatively observed. “No proven return” is censored/unknown until the horizon matures with adequate coverage; not automatically churn. “Churn risk” must disclose the defined non-return target, not assert permanent loss. H comes from the confirmed policy and supported model domain.
- **B:** deterministic observed risk flags only; owner explicitly defers probability models.
- **C:** add separate service-specific response/retention/long-term churn targets now, with independent data and evaluation for each.
- **WHY:** S-C/D/E require probability ownership, uncertainty and calibration; current cancellations/counts are not probabilities.
- **GAINS:** outcomes that can be tested against later C7 facts.
- **LOSES:** no probability for sparse Clients, unobservable outcomes, unknown attendance, unsupported horizon or unqualified model.
- **OWNER / BOUNDARY:** probabilistic capability; deterministic admission/target/maturity/eligibility. No LLM-generated percent.
- **SCHEMA IMPACT:** prediction target, horizon, input/model version, uncertainty and label/evaluation linkage to map.
- **DEPENDENCIES / PACKAGE:** D03,D08,D09,D10,D13,D16; P03/P05.

## D06 — Forecast and anomaly methods

- **A — Recommended:** small versioned deterministic/statistical capability family for revenue, demand/occupancy and anomalies, with explicit basis/calendar/resources and a named baseline. Use an empirical time-aware model/interval only when evaluation qualifies; a deterministic scenario stays “scenario,” not confidence. Anomaly is either a named tenant-rule breach or a qualified statistical deviation, with those two outputs distinct.
- **B:** only owner-configured scenarios and threshold alerts; explicitly defer statistical forecasts/anomalies.
- **C:** more complex multivariate/ML models immediately, with broader input/evaluation/drift requirements.
- **WHY:** S-D assigns future capacity/demand, S-F revenue forecast and S-C anomaly policy; none authorizes +/-10% as statistical confidence.
- **GAINS:** useful forecasts with honest error and evidence limits across verticals/providers.
- **LOSES:** no forecast if finance/calendar/capacity or sample eligibility is absent; no unexplained dramatic anomaly.
- **OWNER / BOUNDARY:** hybrid C8 service; BusinessState/C7 remain source facts. No prediction agent.
- **SCHEMA IMPACT:** common model/rule/quality/output contracts to map. Exact estimator, supported horizons and numerical validation must be stated in combined mapping before coding, not chosen secretly by implementation.
- **DEPENDENCIES / PACKAGE:** D08–10,D13; P03. Salary goals remain C7 facts. Forecasted staff earnings/upside is included only as a separately typed conditional target under this same capability: qualified actual salary/terms, horizon, uncertainty and evaluation are required; missing lawful commission/contract inputs make that target unavailable. C8 creates no payroll contract and never infers default0.5.

## D07 — Expected recovery, lost revenue and upsell money

- **A — Recommended:** distinguish measured money, conditional scenario value, expected outcome value and incremental causal uplift. A return/upsell scenario may carry a qualified conditional amount; expected value additionally needs the correct conditional/joint outcome model. Without causal evidence do not call it revenue caused by Maya or money that was certainly lost.
- **B:** omit all monetary opportunity estimates; show only fact-based opportunities and non-monetary priority.
- **C:** include counterfactual causal uplift in C8 with an explicitly approved experimental/causal evidence contract.
- **WHY:** S-C/E assign valuation, while S-I forbids causal credit by correlation/action success. Empty capacity × average price is not proven lost money.
- **GAINS:** honest economic context for later strategy without corrupting A29/C7.
- **LOSES:** no “Maya can recover X” promise or automatic annual upsell earning from old heuristics.
- **OWNER / BOUNDARY:** hybrid C8 valuation; C7 actual attribution unchanged; intervention strategy C9.
- **SCHEMA IMPACT:** typed valuation kind/assumptions/target/joint-model lineage; no source-money mutation.
- **DEPENDENCIES / PACKAGE:** D01,D02,D05,D06,D13; P02/P04.

## D08 — Incomplete and unsupported data

- **A — Recommended:** per-measure eligibility. Keep source-labelled partial facts visible with coverage, but do not promote them to complete value/probability. Missing required input → unavailable for that measure; known zero and unknown remain different. Partial data can feed a model only under an explicitly qualified missing-data contract.
- **B:** all-or-nothing suppression of the whole Client/business result if any required family is incomplete.
- **C:** explicit versioned statistical imputation with separately evaluated uncertainty and disclosed imputed fields.
- **WHY:** current C7 mirror history is PARTIAL and per-Client cash/refunds may be absent. A does not hide useful facts or manufacture certainty.
- **GAINS:** clear reasons and usable known evidence.
- **LOSES:** fewer complete ranks/monetary outputs than legacy zero-filled estimates.
- **OWNER / BOUNDARY:** deterministic source/eligibility, probabilistic missing-data treatment only if separately qualified.
- **SCHEMA IMPACT:** completeness, coverage, unsupported/censored states and evidence refs.
- **DEPENDENCIES / PACKAGE:** D01,D05,D06,D13; P01 and all consumers.

## D09 — New tenant / Client cold start

- **A — Recommended:** facts and explicit policy defaults only; no individual probability or value score until minimum evidence/model eligibility qualifies. A vertical default can suggest configuration, not become a personal prediction. Show what is missing.
- **B:** approved versioned cohort priors, prominently labelled as prior estimates rather than individual evidence.
- **C:** display experimental estimates to the owner in a separately marked sandbox, excluded from ranking/Opportunity admission.
- **WHY:** avoids transferring a barbershop's habits to dental or inventing loyalty from no visits.
- **GAINS:** safe onboarding and an honest path to readiness.
- **LOSES:** a new business may initially see no predictions.
- **OWNER / BOUNDARY:** deterministic eligibility; no silent online learning.
- **SCHEMA IMPACT:** policy/default provenance and readiness metadata; no assumed vertical-profile table.
- **DEPENDENCIES / PACKAGE:** D03,D08,D10,D13; P01/P03.

## D10 — Tenant overrides and conversational configuration

- **A — Recommended:** compact typed C8 policy under existing A22 revision/confirmation authority. Vertical defaults are proposals; tenant chooses objective/basis, supported horizon, cadence, evidence/exclusions and rank/Opportunity policy. System security is not overrideable. A bounded existing initiator may produce a validated draft; full Orchestrator/onboarding remains C9.
- **B:** versioned operator-managed policies only in C8; owner conversational/config UI deferred.
- **C:** full self-service profile editor/onboarding experience now, explicitly expanding beyond the current C8 capability scope.
- **WHY:** current A22 business_rules free text is not a durable typed calculation contract. Conversation history cannot be system of record.
- **GAINS:** small understandable settings, tenant isolation and auditable changes.
- **LOSES:** no silent policy inference, arbitrary unsupported horizons/thresholds or unrestricted natural-language execution.
- **OWNER / BOUNDARY:** A22 deterministic validation/commit; LLM interpretation only; changed draft needs confirmation.
- **SCHEMA IMPACT:** typed namespace/validation/revision and action mapping required; existing owner reused, exact schema/action delta TBD.
- **DEPENDENCIES / PACKAGE:** all model/policy choices; P01/P06. Model-derived parameters live in model version, never raw secret or mutable prompt.

## D11 — Opportunity admission and thresholds

- **A — Recommended:** only explicitly enabled tenant policy admits a qualifying C8 evidence result into the existing Opportunity lifecycle. Require exact tenant/subject, nonexpired input/model/policy, admitted threshold/comparator and evidence qualification. No default automatic admission. Low confidence/unknown produces informational unavailability, not actionable Client selection. Reuse dedup/supersession/task boundaries.
- **B:** valuation/ranking view only; no new Opportunity evidence admission in C8.
- **C:** auto-admit all eligible C8 results using system defaults; requires owner acceptance of that workload/policy.
- **WHY:** existing Opportunity v1 rejects predictive money/churn fields. A needs an explicit typed integration, not JSON bypass or second owner.
- **GAINS:** later C9 can consume accountable candidate evidence.
- **LOSES:** a high rank alone does not create a campaign, task execution, channel selection or outreach permission.
- **OWNER / BOUNDARY:** existing Opportunity owner and deterministic admission. AE/CD remain downstream, untouched.
- **SCHEMA IMPACT:** evidence/version/reference integration and policy gate to map. No assumed new Opportunity model.
- **DEPENDENCIES / PACKAGE:** D04,D07,D08,D10,D13; P04.

## D12 — Explanation and comparison

- **A — Recommended:** deterministic reason bundle with permitted facts, basis/window, rule/model/policy version, uncertainty, exclusions and comparator tie-break. Optional LLM wording must be entailed by that bundle; deterministic fallback always available.
- **B:** deterministic explanations only, no LLM paraphrase.
- **C:** open-ended AI interpretation of raw Client histories; broader privacy and faithfulness risk, not recommended.
- **WHY:** enables “why above another?” without invented motives or causes.
- **GAINS:** grounded, readable explanations and reproducible comparisons.
- **LOSES:** no speculative psychological narrative or explanation stronger than the evidence.
- **OWNER / BOUNDARY:** deterministic explanation facts; probabilistic language generation is presentation only.
- **SCHEMA IMPACT:** bounded safe reason/evidence refs; no duplicated contacts/message histories.
- **DEPENDENCIES / PACKAGE:** D01–08,D14; P04/P06.

## D13 — Evaluation, calibration, drift and activation

- **A — Recommended:** versioned offline/prospective evaluation with point-in-time inputs and later qualified C7 labels. Prediction targets/horizons, baseline and acceptance metrics are frozen in combined mapping before model code. Probability uses proper-loss/reliability evidence; monetary/capacity forecasts use error and empirical interval coverage; anomaly uses declared detection/false-positive or explicitly unsupervised deviation semantics. Evaluate temporal holdout and applicable cohort/vertical/provider limitations. No automatic retraining/promotion.
- **B:** keep all probabilistic output experimental and excluded from production ranking/Opportunity; C8 ships deterministic capabilities only with an explicit probabilistic deferral.
- **C:** continuous online training and automatic deployment, requiring an expanded lifecycle/security contract.
- **WHY:** calibration and uncertainty are mandatory S-B–E, not optional polish after a number is shown.
- **GAINS:** predictions can be compared with reality; stale/drifting/failed models fail closed.
- **LOSES:** rollout may be unavailable for a tenant lacking qualified mature evidence; synthetic tests cannot claim live predictive accuracy.
- **COMPLETION / DATA READINESS:** A accepts an implemented, evaluated capability with honest per-tenant unavailability; it does not guarantee predictions for every tenant. Every model version declared production-enabled must pass its approved quality criteria on qualified evaluation data. If no qualified data exist, release may carry the disabled capability/readiness path, explicitly reporting **real-world calibration unavailable**, not “calibration PASS.” This limited-data disposition must be visible in the final capability matrix. Failing an approved quality threshold is not bypassed by relabelling the failed model as successful. This is a product acceptance choice being requested now.
- **OWNER / BOUNDARY:** C8 evaluation/activation owner, source labels C7; deterministic gates over statistical results.
- **SCHEMA IMPACT:** model/input/target/evaluation/activation and drift evidence lifecycle TBD; no new C7 facts, raw prompt logs or assumed MLOps platform.
- **DEPENDENCIES / PACKAGE:** D02,D05–09,D15,D16; P05 and P03/P02 activation. Exact estimator, thresholds, test datasets and metrics are one combined mapping/review, not eight later design cycles.

## D14 — Access, privacy, sensitive features and exports

- **A — Recommended:** reuse exact C7 tenant/role/branch/Staff/finance entitlements. Finance-derived ordering is finance data. Minimal permitted facts to AI, no contacts/raw provider text/secrets. No sensitive/inferred protected personal traits, diagnoses or personal hardship in ranking. Bounded existing on-screen results; no new mass contact/PDF export. Existing authorized report snapshot download remains.
- **B:** owner-only C8 reads for first release, excluding staff/manager views entirely.
- **C:** expanded manager/staff/export access under a separately explicit authority/retention matrix.
- **WHY:** permission to read a score may expose hidden money or private Client facts; masking amounts alone is insufficient.
- **GAINS:** predictable authority and reduced profiling risk.
- **LOSES:** fewer features and convenience exports; staff cannot see arbitrary other Clients/team finance.
- **OWNER / BOUNDARY:** existing authority/entitlements plus C8 safe projection; AI cannot broaden scope. Score/rank never consent.
- **SCHEMA IMPACT:** safe-field and subject-scope mapping, audit references; no contact duplication.
- **DEPENDENCIES / PACKAGE:** D01,D04,D12,D15; P06 plus P01 input validation.

## D15 — C8 derived retention and historical integrity

- **A — Recommended:** new per-Client C8 prediction/valuation/rank/evaluation artifacts expire 365 days from original admission, retry does not extend. Retain minimal source refs, versions, necessary values/uncertainty and audit; no raw training/contact/message duplication. Shared nonpersonal model/version manifests have a separately enumerated lifecycle in mapping. No model may require longer identifiable retention silently; long horizons must fit evaluation/retention or be unavailable.
- **B:** 90 days for new per-Client derived artifacts, accepting fewer long-horizon evaluation capabilities.
- **C:** differentiated longer retention by target, with explicit justification, holds and revised privacy requirements.
- **WHY:** provides a bounded policy compatible with C7 without pretending C7 retention automatically governs all future data.
- **GAINS:** predictable deletion and reproducibility while evidence remains available.
- **LOSES:** some long-horizon recalibration cannot use expired per-Client observations; no indefinite feature store.
- **OWNER / BOUNDARY:** scoped AC6; canonical source/security/consent/financial/AE retention unchanged. Preserve audit/approved holds; do not invent new hold authority.
- **SCHEMA IMPACT:** expiry/hold/tenant deletion/FK behavior and model/evaluation classification must be mapped; no cascade to source facts or source-correction obstruction.
- **DEPENDENCIES / PACKAGE:** D02,D05,D13,D14,D16; P01/P05.

## D16 — Prospective cutover and legacy disposition

- **A — Recommended:** prospective admitted C8 results, no fake historical prediction/Client/action lineage. Replace scoped legacy claims L01–L08 through the new owner or explicit unavailable/source-labelled fact. Existing retired writers stay retired. Historical qualified observations may support an explicitly labelled offline backtest only when point-in-time inputs and later outcomes are independently reconstructable; do not write it as a prediction actually made in the past.
- **B:** prospective-only data for both evaluation and prediction; wait for enough future labels and keep models unavailable meanwhile.
- **C:** bounded historical reconstruction with broader source-qualification work; requires explicit evidence/mapping and never fabricated lineage.
- **WHY:** keeps useful source data without turning retrospective hindsight into foresight.
- **GAINS:** controlled migration from heuristics and auditable model evaluation.
- **LOSES:** no automatic historical CLV/churn backfill, no reuse of unqualified SQLite/person matching or old campaign success claims.
- **OWNER / BOUNDARY:** C8 result/evaluation owner consumes canonical C7 facts; source owners untouched.
- **SCHEMA IMPACT:** prospective cutover/version/source-qualification mapping; **recommended backfill 0**, subject to owner decision. No source correction or migration now.
- **DEPENDENCIES / PACKAGE:** all; P01/P05/P06.

## Consolidated impact and approval block

All recommendations form one coherent proposal; none is approved by this document.

```text
D01: APPROVE A — historical value by exact basis/window/currency
D02: APPROVE A — bounded expected value; no fake lifetime CLV
D03: APPROVE A — tenant-confirmed dormancy/loyalty policy
D04: APPROVE A — explicit reproducible comparator and unknown bucket
D05: APPROVE A — qualified return/no-show targets and horizon
D06: APPROVE A — versioned forecast/anomaly capabilities
D07: APPROVE A — scenario/expected/actual/causal money separated
D08: APPROVE A — per-measure incomplete-data eligibility
D09: APPROVE A — honest cold start, no personal prior-as-fact
D10: APPROVE A — typed A22 policy and bounded confirmed initiator
D11: APPROVE A — explicit policy-gated existing Opportunity admission
D12: APPROVE A — grounded explanation bundle; optional safe wording
D13: APPROVE A — evaluation-gated activation; explicit data-unavailable disposition
D14: APPROVE A — existing scoped access, minimal AI, no mass export
D15: APPROVE A — 365 days for new per-Client C8 derived artifacts
D16: APPROVE A — prospective results, qualified backtest, no fake backfill
```

| Item | Proposed total |
| --- | --- |
| C8 requirements | 24 |
| Packages / waves / bounded surface groups | 6 / 4 / 32 |
| Owner decisions | 16 |
| New models / physical fields / action / AC6 classes | **TBD until combined mapping** |
| Migrations | **TBD until combined mapping** |
| Historical backfill | Recommended 0; no operation in this step |
| Parallel owners | No replacement Client, money, Measurement, Opportunity, A22, AE or CD owner |
| Implemented this cycle | None |

P01 qualifies inputs/policy; P02 values/ranks; P03 predicts; P04 explains/adopts evidence into Opportunity; P05 evaluates/controls availability; P06 connects permitted consumers and final release coverage. Wave order is P01 → P02+P03 → P04+P05 → P06.

The next approval after these product decisions is the **single combined schema/action/algorithm-evaluation mapping**. It must specify minimal durable C8 representations, typed A22 policy, exact estimator/quality eligibility rules, Opportunity evidence, retention/AC6, source-safe FKs and prospective migrations across all packages. It must not misuse MeasurementRevision as a prediction fact, create per-package duplicate owners, or implement before approval.

```text
OWNER DECISIONS PRESENTED: 16/16
OWNER DECISIONS APPROVED: 0/16
CHAPTER 8 IMPLEMENTATION READY NOW: NO
COMBINED MAPPING CAN START AFTER DECISIONS: YES
RUNTIME/SCHEMA/MIGRATION CHANGES THIS STEP: 0
PRODUCTION MUTATIONS: 0
CHAPTER 8 IMPLEMENTATION STARTED: NO
```
