# Chapter 8 — preflight and scope reconstruction

Date: 2026-09-13. Status: **PREFLIGHT COMPLETE; OWNER DECISIONS AND SCHEMA/ACTION MAPPING PENDING.**
Chapter 6 and Chapter 7 remain complete. This document proposes a finite C8 acceptance manifest; it is not implementation approval and does not invent an already-approved detailed Chapter 8 specification.

## 1. Baseline and bounded reconciliation

Canonical branch: `codex/maya-brain-systemic-release-20260815`. Fetched origin; inspected HEAD `bf0426996fe4eee6ca6ab6668fa91360a7a701b7` equals that remote branch, ahead/behind 0/0. Work was performed in the existing clean isolated checkout `work/maya-identity-consent`, local branch `codex/maya-identity-consent-20260913`. The canonical main checkout was not edited or reset/stashed/cleaned.

Accepted C7 checkpoint: `a7389950`. There are seven later commits; the [exact commit/file inventory](evidence/chapter8-preflight/late-commits.json) preserves their complete hashes and paths.

| Commit | Change and reconciliation |
| --- | --- |
| b6b9c5ae | Visual identity assets, bundled PWA/native consent client and release/proof tooling. Keyed command and verified provenance remain the existing backend owners; no backend runtime/schema migration. Accepted release in [identity report](../product/maya-identity/IMPLEMENTATION-REPORT.md). |
| b70f761c | Isolated native consent visual proof; no new mutation owner. |
| bdaac825 | Identity/consent release certification documentation. |
| be35f82f | Motion and Client mode chooser repair. A Client preview is not verified private Client authority. Existing authenticated server authority remains required. |
| f0147bfe | [Motion/Client mode build 12 certification](../product/maya-identity/SMOOTH-MOTION-AND-CLIENT-MODE.md). |
| 8132fea6 | Owner source artwork rendering and bounded static publication; no backend/schema change. |
| bf042699 | [Exact-source motion build 13 delivery receipt](../product/maya-identity/OWNER-REFERENCE-MOTION.md#delivery-receipt). |

The only changed backend-tree files are three test suites and one historical test fixture; no backend runtime, Prisma schema, or migration differs from C7. This is compatible, already-authorized UI/consent presentation evolution, not an unreviewed C8 dependency or a reason to reopen C7. The current production backend remains **20260912-c7-p06-4058cd8c**.

Fresh read-only checks on 2026-09-13:

- [Health/readiness and migration/drift preflight](evidence/chapter8-preflight/production-preflight.txt): PASS; 94 repository migrations, 97 recognized applied entries including three historical entries, pending 0; Prisma diff reports no difference.
- [Production artifact identities](evidence/chapter8-preflight/production-artifacts.txt): VPS app HTML SHA256 `dae6c0b057bf4fc05d26393da13dbd0dafb38a6ba38359244a7870ee495d8715`; reference PNG `b57b04948f6b029ba9eb10ed186cf03e408cb78ea8911103eed83eb4f35ef385`. Both match the accepted build 13 delivery.
- [Live C7 consumer guard](evidence/chapter8-preflight/live-c7-consumer.txt): PASS, 27 inline scripts parsed; no business effects. An initial command used a nonexistent remote guard filename; it made no changes. The actual committed local live verifier subsequently passed.
- C7's structural 680-file proof, 32-surface coverage, migration replay, and release ownership remain recorded in [C7 final report](CYCLE-07-FINAL-COMPLETION-REPORT.md#executed-final-gates-and-production-verification). The latest UI release records 437 suites / 3667 tests PASS. Those full regressions are inherited evidence, **not rerun or relabelled as C8 acceptance**.
- Beget maintenance pages and protected backup/PHP artifacts retain their accepted disposition from the latest release. No Beget/PWA restoration, private-vhost discovery, production mutation or deployment occurs in this cycle.

**CHAPTER 7 BASELINE CERTIFIED: YES** for starting this documentation-only preflight. All future C8 releases require fresh release gates; this is not perpetual certification.

## 2. Canonical specification and precedence

No single pre-existing, implementation-ready C8 specification or approved formula/model/schema envelope was found. **Canonical C8 scope is distributed and was found.** The requirements below normalize that scope plus the explicit preflight acceptance requested by the owner. They are not falsely attributed to 24 numbered paragraphs in an older document.

Precedence: accepted completion/contracts and later normative architecture addenda → explicit chapter carry-forward assignments → current implementation → historical audit/roadmap aspirations. Historical statements such as “Client identity empty,” unresolved old EventStore defects, or old C7 status are not current facts merely because an early report contains them.

| Ref | Exact repository source and section | C8 implication |
| --- | --- | --- |
| S-A | [Architecture README, service-business principles §§1–6, Chapter 7–10 prerequisites, permanent ratchets](../architecture/README.md#service-business-principles) | Provider-neutral core; confirmed tenant/vertical policy; conversation proposes, canonical configuration persists; secret/source/consent boundaries. |
| S-B | [Orchestrator architecture gate §§18, 19, 20](MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md#18-переработка-глав-510) | C8 PREDICT is deterministic/statistical capability with explicit error, not a prediction agent. C9 registry/runtime and C10 autonomy stay separate. |
| S-C | [Carry-forward register, Chapter 8 — Prediction & Valuation](CARRY-FORWARD-REGISTER.md#service-business-c8) | No-show/churn, statistical anomaly, version/calibration/uncertainty; valuation of lost revenue, expected recovery and CLV requires its own canonical model. |
| S-D | [C5 Phase A §§9.4–9.6](CYCLE-05-PHASE-A-OPPORTUNITIES-AGENT-TASKING.md#94-chapter-8--predict) | Future occupancy/demand and error bounds; upsell/expected-recovery valuation; C9 orchestration and C10 autonomy. |
| S-E | [C5 Phase B §6 and Phase C Chapter 8 carry-forward](CYCLE-05-PHASE-B-OPPORTUNITY-ENGINE-REPORT.md#6-rejected--deferred-rules), [lifecycle report](CYCLE-05-PHASE-C-OPPORTUNITY-LIFECYCLE-REPORT.md) | Preserve Opportunity lifecycle. Existing v1 rejects predictive money/risk; do not silently smuggle these into evidence JSON. |
| S-F | [C4 remainder §2, finding 4.32](CYCLE-04-REMAINDER-REVIEW.md), [P9 recency deferred semantics](CYCLE-04-P9-VISIT-RECENCY-REPORT.md) | Linear revenue forecast, no-show interpretation and money/cadence heuristics are carry-forward, not trusted C8 models. |
| S-G | [C5 completion §8 and carry-forward](CYCLE-05-CHAPTER-5-COMPLETION-REPORT.md#8-fact-opportunity-and-prediction-boundary) | Existing Opportunity/AgentTask owner, fact/risk separation; no parallel queue or prediction agent. |
| S-H | [C6 final report](CYCLE-06-FINAL-COMPLETION-REPORT.md), [C7 final report — deferred capabilities](CYCLE-07-FINAL-COMPLETION-REPORT.md#deferred-capabilities-and-non-blocking-boundaries) | C8 value/CLV/ranking; C9 strategy; C10 autonomy; preserve AE/CD, security, consent and source owners. |
| S-I | [C7 decisions D2–D13](CYCLE-07-OWNER-DECISION-PACK.md), [combined mapping](CYCLE-07-COMBINED-SCHEMA-ACTION-MAPPING.md) | One measured-result foundation, money/attribution/retention authority; no causal uplift from correlation, no lifetime-spend-as-CLV. |
| S-J | [C7 financial truth](CYCLE-07-P02-FINANCIAL-TRUTH.md), [consumers/acceptance](CYCLE-07-P06-CONSUMERS-AND-ACCEPTANCE.md) | Current money completeness limits, safe AI/finance/audit reads, exact source and stable snapshot references. |

[General data-model notes, Analytics Model / Constraints](../architecture/data-model.md) also name forecast_log/customer_cadence/segment_snapshot and require avoiding analytics dependence on live CRM reads. These are target concepts, not evidence of existing runtime tables or permission to duplicate C7/Opportunity owners. Q01/Q02 map admitted source-qualified snapshots and replayable inputs; an unavailable capture does not fall back to an unqualified live estimate. No current forecast_log writer was found in the backend/Python source search. [Historical rebuild baseline §3](BASELINE.md#3-готовность-по-главам) and [AI-native roadmap](../../Документация/MAYA_AI_NATIVE_ROADMAP.md) supply context, not current approval for old SQLite/director/campaign formulas or materialized-table names. The current schema and accepted owners take precedence. The candidate document list and applicable source locations are retained in the source index.

The older gate's dependency discussion lists C9 before C8 for agent consumption. This does not require building C9 agents to implement C8 capabilities: the same document explicitly defines C8 as a service consumed by later agents, and the later normative addendum/C7 handoff places valuation next. C8 exposes bounded existing consumers and typed capability contracts; it does not claim the C9 router/registry is implemented.

## 3. Product objective and chapter boundaries

**После Chapter 8 Maya сможет по проверенным данным и правилам конкретного бизнеса объяснимо оценивать ценность и приоритет клиентов/возможностей, показывать проверенные на качество прогнозы возврата, неявки, выручки и загрузки, а при нехватке данных честно сообщать об ограничениях.**

“Проверенный на качество прогноз” не означает гарантированный исход. Each enabled probabilistic capability must pass its declared evaluation; otherwise its probability/amount is unavailable.

| Layer | Owns | Does not own |
| --- | --- | --- |
| C7 FACT | What was observed, source/coverage/asOf/current result vs immutable report, exact action attribution | Future probability, CLV, arbitrary loyalty rule |
| C8 POLICY + VALUATION/PREDICTION | Named policy, eligible feature sets, deterministic valuation/ranking, qualified forecasts/uncertainty and quality evidence | Business fact authorship, strategy, new booking/delivery owner |
| C9 STRATEGY | Choice of return strategy, orchestration, agent registry/context, broad conversational onboarding | Permission by score, invented facts |
| C10 AUTONOMY | Repeated/proactive execution within tenant/action limits and current AE/CD policy | Global autonomous permission or bypass of UNKNOWN/consent |

After C8 the loyal/dormant flow may show an **authorized, bounded ranked view** of exact Clients whose value and return-cadence evidence meet the confirmed policy, including why each is included, compared basis/window, uncertainty, and exclusions. It does not promise every tenant has enough data for a monetary score or return probability. Unknown last visit is not dormant. There is no newly established universal “>2 months”; the owner may confirm such a threshold for that tenant.

Strategy selection and owner-approved campaign orchestration remain C9. Autonomously repeating it remains C10. Contact lists/PDF mass export, PushSMS integration, campaign creation/sending, automatic pricing or rescheduling are not C8 capabilities. Existing authorized OwnerReport snapshot downloads remain. Valuation eligibility, Opportunity admission, marketing eligibility, approval, and execution are different gates.

## 4. Current foundation inventory

Counts are capability groups, not model counts. **24 reusable groups (EXISTS or PARTIAL), eight legacy/conflicting groups, six missing C8 foundations.** PARTIAL is not sufficient for implementation without the listed mapping. Missing groups may reuse parts of those 24 owners; these counts must not be summed into a schema estimate.

All code links below refer to the inspected current revision. Source hashes are in [source index](evidence/chapter8-preflight/source-index.json).

| ID | Foundation / status | Current source / exact reuse limit |
| --- | --- | --- |
| F01 | Canonical Client — EXISTS | [schema Client](../../maya-saas-backend/prisma/schema.prisma), [Client initiator boundary](../../maya-saas-backend/src/crm/client-initiator-boundary.architecture.spec.ts): exact tenant/Client; no User requirement where binding contract permits. |
| F02 | Identity/source bindings — EXISTS | [ClientChannelLink service](../../maya-saas-backend/src/crm/client-channel-link.service.ts), schema CrmClientLink/ClientChannelLink. User, phone, provider ID or row existence alone is not authority. |
| F03 | Appointment/attendance — EXISTS | Schema Appointment, [outcome facts](../../maya-saas-backend/src/measurement/measurement.outcomes.facts.ts): source owner's mutable current state remains authoritative. |
| F04 | MeasurementRevision — EXISTS | [contract](../../maya-saas-backend/src/measurement/measurement.contract.ts), [service](../../maya-saas-backend/src/measurement/measurement.service.ts): seven measured kinds, immutable versioned snapshots, leases/retries. No prediction kind/model/confidence contract. |
| F05 | Financial facts — PARTIAL | [financial facts](../../maya-saas-backend/src/measurement/measurement.finance.facts.ts), CrmFinancialSummary: booked/provider gross/cash/salary/expenses and currency remain separate; current provider gross is not verified cash/net. |
| F06 | Refund evidence — PARTIAL | [finance reader](../../maya-saas-backend/src/measurement/measurement.finance.ts), [outcome facts](../../maya-saas-backend/src/measurement/measurement.outcomes.facts.ts): unsupported refunds stay NOT_MEASURED; zero discarded negatives does not prove no refunds. |
| F07 | P407 expenses — EXISTS | [expense period reader](../../maya-saas-backend/src/expenses/expense-period.reader.ts): durable source dedup, declarations/coverage; no fuzzy match or new ledger. |
| F08 | Review/NativeFeedback — EXISTS | [reputation reader](../../maya-saas-backend/src/measurement/measurement.reputation.ts): source/scale/denominator distinguishable; anonymous community not Client review. |
| F09 | A29 assignment and C7 outcome — EXISTS | [recovery owner](../../maya-saas-backend/src/recovery/recovery.service.ts), [outcomes](../../maya-saas-backend/src/measurement/measurement.outcomes.ts): one exact credit, immutable assignment/window, current revisions. Not counterfactual uplift. |
| F10 | Opportunity/AgentTask — EXISTS | [contract](../../maya-saas-backend/src/opportunities/opportunity.contract.ts), [engine](../../maya-saas-backend/src/opportunities/opportunity.engine.ts), [lifecycle](../../maya-saas-backend/src/opportunities/opportunity.lifecycle.ts): durable identity/dedup/routing, no execution. |
| F11 | Opportunity ordering — PARTIAL | Same engine: evidence ordering/semantic dedup exists; no canonical client-value ranking, scalar CLV or predictive priority. |
| F12 | CRM history — PARTIAL | [adapter contract](../../maya-saas-backend/src/crm/crm-adapter.interface.ts), [CRM service](../../maya-saas-backend/src/crm/crm.service.ts): bounded provider-qualified reads/capabilities; cannot assert missing pre-cutover lineage or complete history. |
| F13 | Recency/frequency — PARTIAL | [C7 history](../../maya-saas-backend/src/measurement/measurement.sources.ts), [provider recency reader](../../maya-saas-backend/src/business-facts/client-recency-facts.service.ts): exact canonical observed history vs provider-space history separate. C7 marks mirror coverage PARTIAL; no universal frequency/cadence. |
| F14 | Cancellation/no-show observations — EXISTS | C7 outcome/history readers; counts/attendance are facts, prediction/risk interpretation is not. Cancellation reason/timing cannot be invented. |
| F15 | Service affinity inputs — PARTIAL | Appointment services and qualified CRM history exist; repeat service evidence can be derived within coverage, but no canonical predictive preference/affinity score exists. |
| F16 | Staff affinity inputs — PARTIAL | Appointment.staffId and StaffProviderLink exist; observed visits per permitted staff scope do not prove preference or future response. |
| F17 | AE/CD outcomes — EXISTS | [Action Engine](../../maya-saas-backend/src/action-engine/action-engine.runtime.ts), [execution funnel](../../maya-saas-backend/src/measurement/measurement.outcomes.funnel.ts): confirmed/failed/UNKNOWN separate; delivery success not return or causal credit. |
| F18 | Campaign outcomes — PARTIAL | [canonical bulk](../../maya-saas-backend/src/marketing/canonical-bulk.service.ts), C7 execution funnel: immutable recipients/attempt evidence; sparse outcomes, no response probability or lift dataset. |
| F19 | Consent/preferences — EXISTS | [effective consent](../../maya-saas-backend/src/crm/client-effective-consent.ts), existing CD/B6/B25/B35 policy. Security invalidation is respected; valuation cannot grant consent. |
| F20 | A22 tenant policy — PARTIAL | [governed contract](../../maya-saas-backend/src/package5-wave1/governed-settings.contract.ts), schema TenantBusinessConfigurationRevision: canonical owner exists; only business_rules/client_capabilities/staff_ai_provider namespaces. No typed C8 horizons/model/ranking policy. Free text is not a typed valuation rule. |
| F21 | BusinessState — EXISTS | [service](../../maya-saas-backend/src/business-state/business-state.service.ts): canonical facts/change/coverage composition, not a new persistence model or probability owner. |
| F22 | AI reasoning/access — EXISTS | [tool policy](../../maya-saas-backend/src/ai-tools/ai-tool-policy.service.ts), [core model](../../maya-saas-backend/src/ai-tools/ai-core-model.service.ts): permitted read initiator/explanation, not statistical model. |
| F23 | Qualified measurement reads — EXISTS | [read service](../../maya-saas-backend/src/measurement/measurement.read.service.ts), [presentation](../../maya-saas-backend/src/measurement/measurement.presentation.ts): source qualification, tenant/role/branch/Staff and safe values; manager not automatically finance. |
| F24 | Audit/retention/report — EXISTS | [C7 AC6](../../maya-saas-backend/src/package5-wave6/chapter7-measurement-retention.ts), OwnerReportRun/AuditLog; lifecycle techniques reusable but existing 365-day rule applies to C7 artifacts, not automatically every future C8 model. |

Missing C8 capabilities: **M01** durable prediction/valuation admission, version and input identity; **M02** typed tenant/vertical valuation configuration under A22; **M03** qualified return/no-show/revenue/demand/anomaly models; **M04** reproducible value and rank projection; **M05** temporal evaluation/calibration/drift and activation evidence; **M06** typed valuation evidence integration with existing Opportunity/consumers. No physical table/action count is inferred.

## 5. Legacy and conflicting implementations

This is a bounded code inventory within the inherited surfaces, not a new infrastructure discovery. “Legacy” does not itself mean a newly discovered C7 regression: the relevant predictive/interpretive gaps were explicitly carried to C8. Existing retired entry points must stay retired.

| ID | Exact code/family | Classification and C8 treatment |
| --- | --- | --- |
| L01 | [ai-tool-handler.service.ts](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts) `clientLoyaltySegment` (line 1569) | LEGACY — DO NOT REUSE: 3–5 loyal, 6–11 regular, 12+ core without tenant value policy. Preserve raw allowed visit facts; replace canonical value/loyalty claims. |
| L02 | [client-registry-analysis.ts](../../maya-saas-backend/src/ai-tools/client-registry-analysis.ts) `LOYAL_VISIT_THRESHOLD=3`, `analyzeClientRegistry` | PARTS REUSABLE, SEMANTICS LEGACY: calendar-month counts/unknown handling are labelled CRM aggregates; universal loyal classification and lifetime_sold_amount as value/CLV are forbidden. 1/2/3/4/5/6/12 calendar-month reporting buckets are not dormancy policy. |
| L03 | AI handler `readNoShowRiskClients` (line 978, risk assignment 1121) | LEGACY heuristic: >=2 no-shows or >=3 combined cancellations → high. Provider marks and aliases do not create canonical probability. Replace interpretation through C8; retain qualified raw observations only. |
| L04 | AI handler `forecastBusinessRevenue` (line 2422) | LEGACY: linear run rate, RUB output, +/-10% scenarios, confidence based on 14 days. Scenario text does not make this calibrated; replace through typed basis/currency/model/quality contract. |
| L05 | [master-money-motivation.ts](../../maya-saas-backend/src/ai-tools/master-money-motivation.ts) `computePeriodMoneyMotivation` | LEGACY helper, current references are tests and negative guards, not active C7 measured consumers. 60-day lookback, top40%, 1.3 fallback, default0.5 are not C8 value/payroll policy. Do not reconnect. |
| L06 | [masters_ai.py](../../ai%20администратор/masters_ai.py) `money_pitch` (line 672) | LEGACY: .5 salary fallback, 7–120-day cycle, .5–4 monthly frequency clamp and annual add-on extrapolation. No canonical CLV/expected recovery. Retired push/goal writers remain retired. |
| L07 | [owner_ai.py](../../ai%20администратор/owner_ai.py) `client_retention` (line 1220) | LEGACY interpretation: 90-day cohort/returned counts, 40/60 retention and 25 forward-booking thresholds, previous-minus-current “churn_candidates.” Not calibrated churn or canonical Client valuation; use C7 qualified facts instead. |
| L08 | [growth_planner.py](../../ai%20администратор/growth_planner.py), owner_ai `money_opportunities` / `_money_at_stake` | LEGACY planning/economic recommendations; sample-count/average-check assumptions do not establish canonical value or strategy. C8 replaces numerical claims in its consumers; C9 strategy and already-retired direct sends/writes are not revived. |

Conversation taxonomy words “churn” are intent labels, not prediction models. MarketingPolicy minimum_visits is campaign selection, not consent or universal loyalty. P4 loyalty points/certificates remain value instruments under their existing owners, not C8 scores. Pure branch metric sorting is not a trained ranker. Historical removed `moneyPitchForClient`/`collectUpsellOpportunities` references in old reports are not current functions to resurrect.

## 6. Data and valuation contract to settle before mapping

Inputs are read from source owners with exact tenant, subject, time cutoff, coverage, qualification and source versions. Appointment/Client corrections must not be blocked by derived result FKs. A new authoritative source revision may invalidate pending computation or create a new current result; previously published as-reported evidence is not silently rewritten. Retry of the same admitted input/rule/policy/model must preserve identity. Later observations are not silently treated as facts known at prediction time.

| Required data | Canonical source and limitation |
| --- | --- |
| Exact Client, visit recency/frequency, booking/attendance/cancellation/no-show | Client + Appointment + C7 client_history/outcomes. C7 current history exposes observed counts/last proven visit and explicitly PARTIAL mirror coverage; completeness is not fabricated. |
| Money, refunds, expenses, salary | C7 financial/expense/staff-goal readers and qualified CRM/P407 sources. Per-Client cash/refund linkage may be absent even if tenant revenue exists. No allocation by phone, average bill, date or amount similarity. |
| Service/staff patterns and future capacity | Exact Appointment/service/Staff plus canonical schedule/capacity and qualified adapter facts. Observed affinity is distinct from predicted choice; missing schedule/resources means unknown capacity. |
| Communication/campaign/action results | AE/ActionAttempt, CD, immutable MarketingCampaignRecipient and C7 funnel/outcomes. UNKNOWN is neither failure nor negative training label; no-show is not “no reply.” |
| Reputation | Review/NativeFeedback with source/scale/denominator. Anonymous text and unverified identity excluded from client-level value inputs. |
| Configuration and exclusions | Typed C8 policy to be mapped to A22; current consent/preferences and authority read separately. Tenant defaults cannot claim observed personal behavior. |
| Evaluation labels | Later qualified C7 results, with label maturity and revision/asOf. No future-data leakage or invented historical predictions. |

The following are **proposed semantic distinctions**, with business choices in D01/D02/D07; exact formula/model mapping follows approval:

| Value term | Inputs / formula-model / horizon | Currency, coverage, uncertainty / explanation |
| --- | --- | --- |
| Historical observed value | Qualified monetary facts within explicit past interval; deterministic aggregation on one named basis | Cash net of confirmed refunds only when both evidenced; otherwise booked/provider gross separately labelled. Not CLV, profit or prediction. |
| Predicted value | Versioned forecast of a named future outcome, on declared input snapshot and horizon | Basis/currency explicit; probabilistic interval and eligibility required. No whole-business revenue allocated to a Client. |
| CLV | Must define finite horizon, monetary basis, cost/discount assumptions and model. Repository does not approve an infinite-lifetime formula. | Recommendation: bounded expected value by horizon, not label lifetime spend “CLV”; unavailable where required source/model qualification is missing. |
| Expected opportunity value | Probability of defined outcome × conditional value on same basis/horizon, only if joint/conditional model is justified | Not independent multiplication by default; no invented correlation/causality. Exact versions and assumptions visible. |
| Retention value / expected recovery | Value of a specified return scenario, distinct from value caused by an intervention | Counterfactual incremental lift unavailable without separately evidenced causal contract; no marketing action implied. |
| Lost revenue / upsell uplift | Counterfactual quantities require counterfactual evidence/model, not empty-slot price or high-check extrapolation | Without such evidence return unavailable or explicitly owner-specified scenario, never actual money “lost”/“earned by Maya.” |

Ranking is a server-owned deterministic projection of admitted facts/policy/qualified estimates, never a second Opportunity owner or an LLM selecting people. Proposed D04 uses a declared ordered comparison rather than an invented universal weighted score; exact eligible cohort/basis/horizon and tie key remain reproducible. Unknown candidates are disclosed separately, not assigned zero or dropped invisibly. Predicted ranking is permitted only when its component models qualify.

## 7. Finite requirements / gap / owner / proof manifest

**24 requirements, six proposed packages, four proposed waves.** Q identifiers below are C8-local. S-A…S-J refer to §2; U means an explicit acceptance constraint from this preflight request. Classification: D deterministic; P probabilistic; H hybrid. Canonical “C8 valuation/prediction capability” is required but not implemented; names here designate responsibility, not approved new class/table names.

| ID | Requirement; source | Package / owner; existing → gap | Kind / schema-action impact / required proof |
| --- | --- | --- | --- |
| Q01 | Qualified canonical feature inputs; S-A,H,I,J,U | P01; source owners → C8 reader. F01–09,12–19,23 → versioned feature admissibility/coverage | D; reuse refs, durability TBD; cross-tenant/Client, correction, unknown/refund/affinity fixtures |
| Q02 | Durable input/model/rule/policy identity, asOf/revision/retry; S-C,I,U | P01; C8 derived owner, reuse F04/F24 techniques | D; new persistence mapping TBD; same input retry, changed evidence, crash/concurrent admission, immutable publication |
| Q03 | Fact/policy/prediction/strategy typed separation; S-A–D,I | P01; C7/C8 boundary | D; contract mapping TBD; no probabilistic value in C7 fact fields, no LLM-authorized truth |
| Q04 | Typed confirmed tenant/profile policy under A22; S-A,C,U | P01; A22/F20 → typed C8 policy, no prompt-only values | D; namespace/validation/action reuse mapping TBD; draft/confirmation/revision/revocation tests |
| Q05 | One core, multiple vertical/provider semantics; S-A,B,U | P01; profile/adapter readers | D; no per-vertical engine; four contrasting vertical fixtures and second provider fixture |
| Q06 | Missing data/cold start/no fabricated certainty; S-C,J,U | P01; all C8 consumers | H; state/prior mapping TBD; unknown last visit, sparse Client/tenant, missing money/outcomes |
| Q07 | Historical value by basis/window/currency; S-H–J,U | P02; C8 valuation consuming C7 money | D; no new ledger; exact-money/currency/coverage tests, lifetime spend != CLV |
| Q08 | Future Client value and bounded CLV semantics; S-C,E,H,U | P02; C8 valuation/model | H; durable result/model refs TBD; horizon/conditional-value/version/uncertainty, unavailable without model |
| Q09 | Opportunity/retention/upsell/lost-money distinctions; S-C–E,I | P02; valuation not A29 or execution | H; no causal-money shortcut; scenario vs expected vs actual, ambiguous linkage, missing counterfactual |
| Q10 | Tenant-specific dormancy/loyalty/value signals; S-A,C,H,U | P02; policy + qualified Client facts | D; F13/F20 reuse; no 3/60/high-check universal, unknown != dormant |
| Q11 | Return/churn and no-show probabilities; S-C–G,U | P03; prediction capability | P; models/input/output refs TBD; exact target/horizon, censored/unknown labels, calibration |
| Q12 | Revenue / conditioned earnings forecast with named basis/error; S-B,F,I,U | P03; prediction consuming C7 finance/actual salary | H; model refs TBD; currency/refund/completeness, no fixed +/-10 confidence or .5 commission assumption |
| Q13 | Demand/occupancy forecast; S-D | P03; prediction consuming capacity/schedule | H; no source owner replacement; resource bounds, missing schedule, horizon and error |
| Q14 | Revenue/operational anomaly; S-C–G | P03; named deterministic policy or evaluated detector | H; rule/model mapping TBD; no unnamed threshold/LLM anomaly, seasonality/coverage limitations |
| Q15 | Reproducible eligible ranking; S-A,H,U | P02; C8 ranking, reuse F11 identity only | H; immutable comparison manifest TBD; tie/retry/changed policy/unknown bucket tests |
| Q16 | Valuation evidence → existing Opportunity admission; S-C–G,U | P04; F10 canonical lifecycle | D; typed integration mapping TBD, no parallel owner; threshold/expiry/supersession/dedup/zero effects |
| Q17 | Grounded explanation and comparison; S-A,U | P04; deterministic evidence bundle, AI wording only | H; safe derived rationale refs TBD; every reason supported, no PII or invented causes |
| Q18 | Prediction T0 → later C7 outcomes → evaluation; S-C–E,U | P05; C8 evaluation consuming C7 truth | H; maturity/version/evaluation receipt TBD; temporal holdout, censored/unknown labels, no leakage |
| Q19 | Calibration/drift/model activation gates; S-B–E,U | P05; C8 quality lifecycle, no automatic retraining | H; activation evidence mapping TBD; failed/insufficient evaluation unavailable, old prediction immutable |
| Q20 | Exact authority/privacy/fairness/finance/AI/exports; S-A,H–J,U | P06; existing authority + C8 reads | D; reuse F02/F19/F23/F24; no manager auto-finance, sensitive-feature or cross-tenant leak |
| Q21 | Derived retention/hold/cleanup and source independence; S-I,U | P01; AC6 + source owners | D; C8 duration/hold schema TBD; retry no extension, no source delete/blocked correction |
| Q22 | Replace scoped legacy numerical claims; S-C,F,H,U | P06; canonical C8 consumers | D; L01–L08 disposition, no new writer; Python/PWA/AI/retired-launcher guards |
| Q23 | Consistent bounded UI/AI/report/read consumers; S-A,H–J,U | P06; existing surfaces, C8 safe projection | H; read API mapping TBD; actual vs forecast/unknown/version consistent, no mass export |
| Q24 | Mandatory release wiring, 32-surface acceptance and handoff; S-A,H,U | P06; release owner | D; no schema implied; all proofs/gates/preservation, unresolved decisions/WIP0 |

Every requirement has one accepting package. Cross-package contributors do not inflate completion counts. [Machine-readable manifest](evidence/chapter8-preflight/manifest.json) mirrors IDs, packages, decision dependencies and surfaces.

## 8. Model evaluation, cold start and multi-vertical proof

C8 completion includes evaluation/calibration infrastructure for its probabilistic outputs. A numeric forecast is not acceptable merely because a service returned a number. Before model implementation, D05/D06/D13 and combined mapping must bind target/event, horizon, point-in-time feature policy, algorithm/version, training/evaluation input identity, metrics, reference baseline, tolerance and availability rules. Model binaries/parameters are not LLM prompts.

T0 prediction freezes features known by T0, policy/model/horizon. Later C7 labels carry source qualification, maturity and revisions. UNKNOWN delivery, incomplete attendance, unresolved refund or absent history are not negative/zero labels. Evaluate held-out later periods, avoid overlapping Client/event leakage, retain segment/provider/vertical coverage and compare with a named naive baseline. Prediction reliability and explanation faithfulness are separate checks. Current label corrections produce a new evaluation; original prediction and earlier evaluation stay auditable.

No automatic online self-training/model promotion. Drift or failed quality/coverage closes affected model outputs, not just hides a warning beside an unqualified percentage. Offline/prospective evaluation is allowed only through approved access/retention; absence of suitable real labels must be reported. Synthetic fixtures prove plumbing, never real-world calibration. D13 explicitly decides capability-complete versus data-qualified activation; acceptance must not misrepresent unavailable models as production calibrated.

Cold start: no proven visit → unknown recency, not dormant; partial history → observed facts only; no linked money → monetary value unavailable; no campaign outcomes → no response/lift probability. A vertical prior may be offered only as a labelled prior if approved, not as personal evidence. Recommendation D09 keeps individual probability unavailable until eligible.

| Vertical fixture (illustrative; no default threshold approved) | Different policy/data example | Shared proof |
| --- | --- | --- |
| Barbershop | Repeat visits may be frequent; service mix and resource/staff history | Cadence is confirmed policy, not a hair-cutting constant in core. |
| Beauty | Different services may have different cycles and combined visits | Service-conditioned policy, explicit unsupported mixed-cycle ambiguity. |
| Dental | Episodic courses/checkups; health information is sensitive | No diagnosis/health profiling, no short-gap-as-churn assumption; incomplete course facts unavailable. |
| Auto service | Longer/usage-dependent cycles; visitor may be payer rather than resource/vehicle | No invented vehicle identity/usage from Client row; only supported canonical subject, otherwise unavailable. |

These are contract fixtures, not four new integrations or vertical engines. A second provider fixture must map canonical facts without YClients-shaped business logic; unsupported capabilities stay unavailable.

## 9. Policy, access and retention boundary

System constants cover authority, money units/currency discipline, versioning, safe bounds and no effects from prediction. Vertical defaults are recommendations needing explicit tenant confirmation, not implicit business truth. Tenant-configurable values are a compact policy: objective/basis, horizon, visit cadence, minimum evidence, ranking comparator, Opportunity threshold/exclusions. Learned/model parameters belong to the versioned model, not editable facts or tenant secrets.

“Для нас давно не приходил — после 45 дней” may become a structured candidate policy; deterministic validation and exact owner confirmation are required before A22 persists it. C8 needs typed storage/validation and a bounded existing initiator; the broad conversational router/onboarding experience remains C9. No hundred mandatory settings and no rule persisted only in history. A22 currently needs a C8 typed mapping; its free-text business_rules namespace is insufficient proof of executable policy.

C8 must recheck tenant/User/Membership/branch/Staff/feature entitlements on reads. Finance-derived ranking/explanation reveals financial information even if currency amounts are hidden, so it uses finance access. Manager does not automatically receive finance; staff see only permitted own scope. Tenant audit remains owner/business-owner, bounded safe fields; no platform audit rows/raw payloads. AI receives minimal opaque subjects, allowed aggregate/features, basis, reasons and uncertainty, never raw contacts, credentials, free-text provider payloads or unnecessary identifying histories. Protected/sensitive characteristics, inferred health/ethnicity/religion or proxy sensitive targeting are not admitted by default.

External sources require an existing user-bound provider/integration, actual connector capability and independently checked access. A URL is not data authority or automatic monitoring; a credential belongs in the secure connector flow, never a prompt, model input or tenant business-policy text. Broader connector onboarding and bridge credential migration before L3 remain outside this C8 implementation scope.

An authorized bounded on-screen Client result is not mass contact export. Existing authorized OwnerReport snapshot download remains under its owner. Score/rank/audience does not grant marketing consent; current effective consent/security invalidation/preferences are checked by AE/CD if a later chapter requests action.

Retention for **new C8 derived artifacts** is a pending D15 decision; recommendation 365 days from admission with non-renewing retries, minimal facts/refs and scoped AC6 cleanup. It must not alter source financial/security/consent/C7/AE retention. Model training data, model artifacts and evaluation metadata need separate classification in combined mapping; avoid indefinite raw per-Client feature copies. Holds cannot become an ungoverned forever retention flag, tenant deletion cannot cascade into canonical evidence, and source correction cannot be blocked by derived associations.

## 10. Packages and execution waves

These are six capability packages, not six persistence systems. Physical model/field/enum/index/action counts are **TBD until one combined schema/action mapping after the decisions**. No C7 kind expansion or new A22 namespace/action is approved by this preflight. Pure reads/calculation are not automatically business actions; durable lifecycle and AC6/configuration authority must be mapped before code.

| Package | After this package Maya can… | Q ownership | Expected schema/actions; dependencies; acceptance |
| --- | --- | --- | --- |
| P01 Qualified foundation & policy | Tell which facts/policies support an estimate and why data are insufficient; preserve input identity safely. | Q01–06,Q21 (7) | Shared C8 durability and typed A22 mapping expected, counts TBD; AC6 mapping. Depends on completed C6/C7 and approved C8 decisions/mapping. Exact tenant/source/current-vs-snapshot/cold-start/four-vertical/retry/retention proof. |
| P02 Client value & ranking | Explain value on a named basis, long absence by tenant rule, and reproducible candidate order. | Q07–10,Q15 (5) | Reuse shared foundation; model/result/rank mapping TBD, no new ledger/Opportunity owner. P01; predictive value depends on qualified P03/P05 output and is unavailable before it. |
| P03 Risk, demand & financial forecasts | Return qualified forecasts/uncertainty or explicit unavailability for return/no-show, revenue/qualified earnings, capacity and anomalies. | Q11–14 (4) | Shared model/result interfaces; no prediction agent/business executor. P01. Runs with P02; activation awaits P05, no uncalibrated user probability. |
| P04 Opportunity & explanation | Explain ranked evidence and offer a safe existing-owner Opportunity for review. | Q16–17 (2) | Typed evidence extension/reuse mapping TBD, not parallel Opportunity. P02/P03 outputs and P01; can run with P05. No campaign/action execution. |
| P05 Evaluation & model release | Compare predictions with later facts, expose quality and suppress unqualified/drifting models. | Q18–19 (2) | Shared durable evidence/evaluation mapping TBD, not new source facts. P02/P03; runs with P04. Evaluation acceptance design is frozen before model coding, even though this package implements it in Wave 3. |
| P06 Consumers, security & final gate | Read consistent permitted facts versus estimates in existing Maya surfaces and reach a fully guarded release. | Q20,Q22–24 (4) | Reuse all owners; consumer contracts/guard wiring, counts TBD. P01–05. All 24 Qs, eight legacy dispositions, 32-surface preservation and production acceptance. |

**Wave 1:** P01. **Wave 2:** P02 + P03, with unqualified predictions disabled. **Wave 3:** P04 + P05, coordinated qualification/activation; this is not C9 strategy. **Wave 4:** P06 and one Chapter 8 final gate. Existing canonical release process remains mandatory for each runtime cutover; shared schema goes first, expected-only migrations, no mixed-owner release.

Policy/model readiness is part of package acceptance, not permission to omit tests. Cross-package interfaces and evaluation rules must be settled in combined mapping before Wave 1. Owner decisions may change this proposed envelope once before freezing; implementation must not discover known choices one at a time.

## 11. Bounded production-surface manifest

Use the existing [C7 32-surface manifest](evidence/chapter7-final/surfaces.json) as the coverage universe; retain exact S01–S32 identities and inherited ratchets. **32 in scope does not mean 32 new endpoints or that C8 has already been verified.** C8 direct change groups, source-read groups and unchanged preservation groups are distinguished in the [C8 manifest](evidence/chapter8-preflight/manifest.json).

- Direct consumer/config/integration review: S01 HTTP, S02 salon PWA (respect current maintenance disposition), S03 VPS PWA, S06 chat/stream/history, S07 realtime/voice, S08 AI, S09 journal, S10 Python, S14 installed workers/operator CLIs, S15 Telegram initiators, S20 panel/admin, S24 finance, S27 bounded policy initiator.
- Source/authority read and owner preservation: S19 CD, S21 calendar, S22 CRM, S23 bulk, S25 loyalty/value, S26 reviews, S28 identity.
- Unchanged surface preservation plus release guards: S04 public site/shop, S05 relay/proxy, S11 schedulers, S12 VPS cron/timers, S13 Beget cron, S16 Inbox, S17 APNS, S18 Web Push, S29 maintenance.
- Cross-cutting violation guards: S30 writers, S31 provider/delivery effects, S32 identity/projection fallbacks.

No new scheduled outreach, model-training cron, public relay, contact export or connector launcher is inferred. If mapping needs an endpoint within S01, record its exact path before coding. A genuinely new surface outside this bounded universe requires an explicit manifest amendment with evidence; a known legacy helper detail does not create an infinite Bxx sequence. Full private provider-vhost configuration is not a new requirement.

## 12. Completion gate, defined before implementation

C8 can be COMPLETE only against the owner-approved frozen manifest and combined mapping:

1. Q01–Q24 24/24; P01–P06 6/6; four waves; all source/deferred assignments have a disposition, no silently omitted capacity/anomaly/monetary capability.
2. Source/fact independence, exact tenant/Client/branch/Staff/finance authority, four-vertical/provider-neutral and cold-start proofs PASS.
3. Every enabled probability/expected amount has fixed target/horizon/model/input/policy versions and P05 evaluation evidence. Unavailable outputs explicitly marked. Synthetic proof is not calibration. D13 governs data-unavailable activation without disguising it as success of a numeric model.
4. Permanent guards cover: LLM-created fact/probability; universal value/cadence threshold; unknown-as-zero/dormant; unqualified money/CLV/causal uplift; cross-currency sum; phone/time lineage; unstable retry/rank; stale source/policy publication; privacy/finance leakage; score-as-consent/action authority; source deletion via retention; revival of retired Python/PHP/UI writers; C9/C10 behavior in C8.
5. Each guard has a positive scoped case and negative bypass case and is wired into unfiltered mandatory regression/release. Current Jest `src/.*.spec.ts` selection and standard deployment remain the base; do not rely on optional standalone files.
6. Synthetic executable persistence/concurrency/restart/cleanup proof, model evaluation fixtures, cross-package consumers and explicit legacy L01–L08 dispositions PASS. No old DB touched.
7. Lint, application and scripts typechecks, build, Prisma validation, expected-only additive/prospective migration proof, clean replay, pre/post-deploy drift NONE, pending 0, health/readiness PASS. Exact schema/actions/backfill policy frozen only at mapping approval.
8. Structural/read-only production verification across S01–S32, preserving maintenance/backups and finite R01 relay guard. No real booking/provider/message/consent/expense/Client mutation for proof.
9. Owner/schema decisions unresolved 0; package WIP0; owned processes/watchers/browsers/temp DB0; canonical HEAD=origin; completion report/commit/push. Chapter 9 not automatically started.

Do not call C8 COMPLETE if an approved mandatory model quality requirement failed. Classify failure as implementation defect, data-readiness limitation under D13, unresolved contract/mapping, or concrete manifest defect. Do not widen discovery because a theoretical unknown infrastructure path might exist.

## 13. Owner decisions and next authorized step

The [single Owner Decision Pack](CYCLE-08-OWNER-DECISION-PACK.md) presents **D01–D16, none approved**. It settles value, horizons, dormancy, ranking, probabilistic methods/quality, missing data, cold start, policy overrides, Opportunity admission, explanations, security, retention and prospective legacy cutover. Expected new models/actions remain TBD, not zero.

After decisions, the next proposed step is **one combined schema/action mapping for all six packages**, including C8 source/model/evaluation durability, typed A22 policy, Opportunity evidence extension, AC6 retention and input coverage. No implementation follows this preflight automatically.

```text
CHAPTER 8 REQUIREMENTS IDENTIFIED: 24
EXISTING FOUNDATIONS REUSABLE: 24
LEGACY/CONFLICTING FOUNDATIONS: 8
MISSING FOUNDATIONS: 6
OWNER DECISIONS REQUIRED: 16
EXPECTED IMPLEMENTATION PACKAGES: 6
EXPECTED IMPLEMENTATION WAVES: 4
PRODUCTION SURFACES IN SCOPE: 32
EXPECTED NEW MODELS / ACTION CLASSES: TBD UNTIL COMBINED MAPPING
CHAPTER 8 COMPLETION GATE DEFINED: YES
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
PRODUCTION MUTATIONS: 0
CHAPTER 8 IMPLEMENTATION STARTED: NO
```

Scope/manifest consistency and exact main-checkout preservation are recorded in [documentation verification](evidence/chapter8-preflight/documentation-verification.json) and [hygiene](evidence/chapter8-preflight/hygiene.json). Report-only publication goes to the canonical branch; STOP after commit/push.
