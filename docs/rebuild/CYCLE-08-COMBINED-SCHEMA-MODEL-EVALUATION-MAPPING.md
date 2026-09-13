# Chapter 8 — combined schema / model / evaluation mapping

**2026-09-13 owner approval after `8c185b75`: the 3-model / 94-field / 2-altered-model / 0-AE / 3-AC6 / 1-migration / no-backfill envelope below is APPROVED for limited-data implementation.** See [limited-data decision](CYCLE-08-LIMITED-DATA-IMPLEMENTATION-DECISION.md). D01–D16 remain approved. Historical proposal/STOP text below describes the earlier mapping checkpoint; it no longer blocks safe foundation implementation. Numeric activation budgets remain future per-model evidence, not assumed approved. T01–T08 stay disabled; unavailable is never calibration PASS. No new fields or owners are authorized.

Date: 2026-09-13. Inspected canonical origin and isolated checkout: `0cdf45fd6a12622f5071967a02214cb526f5ebe8`. Local branch `codex/maya-identity-consent-20260913` tracks canonical `codex/maya-brain-systemic-release-20260815`; fetch: ahead 0 / behind 0, initially clean.

**D01–D16 Option A: APPROVED by the owner's request accepting 0cdf45fd.** This supersedes the *pending approval* status of the original [decision pack](CYCLE-08-OWNER-DECISION-PACK.md), without rewriting that historical proposal. Product boundaries, 24 requirements / 6 packages / 4 waves / 32 surfaces remain unchanged.

**This is a proposed implementation mapping, not schema/runtime implementation. Structural mapping is complete; the combined envelope is NOT ready for approval because numerical evaluation operating points remain ungrounded.** One narrow decision E01 (§9) is presented as the owner explicitly requested when defensible numeric criteria cannot be established. No product decisions are reopened. No model code, schema, migrations, tests of new runtime, production data extraction, training or deployment occurred.

Proposed structural envelope: **3 new models / 94 physical fields / 2 altered existing models / 0 new Action Engine classes / 3 scoped AC6 classes / 1 migration / backfill 0**. All counts below are proposal counts, not approved or implemented counts. Evaluation semantics cover 8 target families; **numeric acceptance contracts frozen: 0/8**. Model/horizon variants require their own qualified manifest under those families; “8” is not a claim of eight trained models.

## 1. Existing foundation evidence and reuse

Repository source of truth: [C8 scope §§2–12](CYCLE-08-PREFLIGHT-AND-SCOPE.md), [D01–D16](CYCLE-08-OWNER-DECISION-PACK.md), [C7 combined mapping](CYCLE-07-COMBINED-SCHEMA-ACTION-MAPPING.md), [C7 completion](CYCLE-07-FINAL-COMPLETION-REPORT.md). The [machine-readable mapping](evidence/chapter8-mapping/mapping.json) preserves Q/F/L/P/S identities from the frozen preflight; [source hashes](evidence/chapter8-mapping/source-index.json) pin inspected files. Reuse count is **24 preflight capability groups**, including partial sources, not 24 fully sufficient models.

| Groups reused | Exact implementation / limitation | Mapping decision |
| --- | --- | --- |
| F01–03 Client / bindings / Appointment | `prisma/schema.prisma`: Client, ClientChannelLink, CrmClientLink, Appointment; `src/crm/client-channel-link.service.ts` and canonical identity readers | Exact tenant-qualified subject, no User/phone shortcut. Source ownership unchanged. Client without Maya User remains an admissible subject. |
| F04 MeasurementRevision | `src/measurement/measurement.contract.ts`, `measurement.service.ts`, schema MeasurementRevision: 37 fields, seven measured kinds; canonical normalization, leases, immutable publication | Reuse source snapshots, normalization and lifecycle techniques. **Do not add prediction kinds to MeasurementRevision.** It stays factual measurement, not a model registry. |
| F05–07 financial/refund/P407 | `src/measurement/measurement.finance.ts`, `measurement.finance.facts.ts`, `src/expenses/expense-period.reader.ts` | Qualified basis/currency and exact expense links. Missing cash/refund linkage is unavailable, not allocated from tenant totals. |
| F08 reviews / NativeFeedback | `measurement.reputation.ts` and source readers, BusinessReview / NativeFeedbackRequest | Qualified source/scale/denominator only. No review text, diagnosis or anonymous content in Client scoring. Reputation may be reported; not silently a value feature. |
| F09 A29 + outcomes | `src/recovery/recovery.service.ts`, `measurement.outcomes.ts`, `measurement.outcomes.facts.ts` | Exact existing attribution, max one credit. No counterfactual revenue owner. |
| F10–11 Opportunity / ordering | `src/opportunities/opportunity.contract.ts`, `opportunity.engine.ts`, `opportunity.lifecycle.ts` | Existing dedup/supersession/tasks. New typed evidence branch only; existing fact branches continue to reject predictive money/churn. No OpportunityV2/table. |
| F12–16 provider history / recency / attendance / affinities | `src/crm/crm-adapter.interface.ts`, `src/business-facts/client-recency-facts.service.ts`, `measurement.sources.ts`, Appointment/StaffProviderLink | Input facts with coverage. C7 client history is explicitly PARTIAL; provider-card recency is not proof of attended visit. Observed service/staff patterns are not inferred preference. |
| F17–18 AE/CD/campaign outcomes | `src/action-engine/action-engine.runtime.ts`, `measurement.outcomes.funnel.ts`, `src/marketing/canonical-bulk.service.ts` | Exact outcome evidence, UNKNOWN separate. No reply/delivery/booking-success substituted for attended return. |
| F19 consent/preferences | `src/crm/client-effective-consent.ts`, CD policy | Access/permission source only. Value/rank creates neither consent nor contact authority. |
| F20 A22 | `src/package5-wave1/governed-settings.contract.ts`, `governed-settings.controller.ts`, `package5-wave1.service.ts`; TenantBusinessConfigurationRevision | Existing `update_tenant_business_configuration` action; add typed namespace. Existing DB CHECK currently permits only three namespaces and must be extended forward. Free-text business_rules is insufficient. |
| F21 BusinessState | `src/business-state/business-state.service.ts` | Qualified fact/coverage composition, not another table or prediction owner. |
| F22–23 AI and permitted reads | `src/ai-tools/ai-tool-policy.service.ts`, `src/measurement/measurement.read.service.ts`, `measurement.presentation.ts` | Reuse current authority and minimal projection; model facts/eligibility/ranking never delegated to LLM. |
| F24 audit / AC6 / reports | `src/audit-log/tenant-audit-read.service.ts`; `src/package5-wave6/package5-wave6.service.ts`, `package5-wave6.policy.ts`, `chapter7-measurement-retention.ts`; OwnerReportRun | Existing claims, fencing and safe audit. New C8 leaf classes only; no source-retention extension. |

**Registry / evaluation search:** current Prisma models contain no statistical model/version/evaluation registry. `forecast_log` in `docs/architecture/data-model.md` is conceptual, not implemented persistence. Bounded search in backend/Python runtime for calibration/Brier/log-loss/backtest/model registry found no C8 evaluator. Existing `scripts/evaluate-conversation-intelligence.ts` is language/intent evaluation, not attended-return/no-show/financial calibration; do not reuse its thresholds. Existing model-provider selection and billing tables are LLM configuration, not C8 statistical versions.

**Workers:** `src/crm/opportunity-lifecycle.runner.ts` already coordinates bounded source reads and Opportunity lifecycle. C7 MeasurementRevision and AC6 MaintenanceRun/MaintenanceItemClaim demonstrate durable claims; no generic trained-model job owner exists. Reuse those fencing patterns with the new C8 rows. Add no training daemon/cron or automatic promotion. Extend existing backend bounded worker/authorized operator surface S14; no new infrastructure surface. A per-process `busy` flag is an optimization, never the durable claim.

## 2. Q01–Q24 mapping

“Sufficient” means sufficient for the **entire Q today**, not whether its source owner exists. D/P/H = deterministic / probabilistic / hybrid. Names below are proposed modules/responsibilities, not new Action Engine classes.

| Q / package | Requirement | Existing owner/model/field | Sufficient | Exact gap → proposed reuse/delta / owner | Kind |
| --- | --- | --- | --- | --- | --- |
| Q01 / P01 | Qualified features | Client, Appointment, MeasurementRevision evidenceRefsJson/qualification; F01–09,12–19,23 | NO | C8 feature allowlist + T0 knowledge boundary/coverage; C8 result embeds minimal input snapshot referencing source owners | D |
| Q02 / P01 | Identity/version/retry | C7 identityHash/revision/leases; F04/F24 | NO | C8ResultRevision + C8ModelVersion; deterministic identities and fenced publication, independent of C7 fact kinds | D |
| Q03 / P01 | Fact/policy/prediction/strategy separation | C7 kinds, A22 contentHash | NO | Closed C8 result kind and target contracts; facts remain source-owned; no strategy payload | D |
| Q04 / P01 | Typed tenant policy | A22 namespace/content/revision/execution | NO | Add `c8_valuation` namespace and strict validator; reuse A22 action, forward namespace CHECK extension | D |
| Q05 / P01 | Multi-vertical/provider | Tenant/defaultTimezone, adapter capabilities | NO | Provider-neutral feature policy and four vertical fixtures; unsupported vehicle/course facts unavailable | D |
| Q06 / P01 | Missing/cold start | C7 completeness/qualification | NO | Per-target eligibility + reason codes; no hidden imputation or personal cohort prior | H |
| Q07 / P02 | Historical value | C7 financial basis/currency/metrics; P407 | NO | Deterministic C8 value output by exact interval/basis; no new ledger | D |
| Q08 / P02 | Expected value over H | F05/06 sources, no predictive owner | NO | T03 under shared model/result/evaluation contracts, no lifetime-spend CLV | H |
| Q09 / P02 | Actual/scenario/expected/causal | A29 + C7 outcomes, no joint forecast | NO | Typed conditional scenario/expected outputs; missing joint evidence unavailable; no C8 causal model | H |
| Q10 / P02 | Dormancy/loyalty signals | C7 observed visits; A22 | NO | Exact confirmed service/tenant policy; unknown≠dormant, no universal labels | D |
| Q11 / P03 | Return/no-show | Appointment attendance + C7 outcome | NO | T01/T02, mature qualified labels; non-return complement not permanent churn | P |
| Q12 / P03 | Revenue/earnings | C7 finance/salary/goal facts | NO | T04/T05 with basis/terms/horizon/error; unsupported salary terms unavailable | H |
| Q13 / P03 | Demand/occupancy | Existing schedule/capacity evidence | NO | T06/T07; denominator/exposure/calendar frozen, no future usage/vehicle invention | H |
| Q14 / P03 | Anomaly | BusinessState metric changes, tenant rules | NO | Separate deterministic threshold from T08 statistical deviation, no invented incident label | H |
| Q15 / P02 | Stable ranking | Opportunity evidence ordering only | NO | RANKING kind in shared result; frozen cohort + comparator + exclusions + tie order | H |
| Q16 / P04 | C8→Opportunity | Opportunity evidenceRefsJson/policyVersion/semanticKey | NO | Typed `c8_result` evidence checked by existing lifecycle; A22 default OFF | D |
| Q17 / P04 | Reasons/comparison | C7 presentation, AI safe reads | NO | Deterministic reasons/comparator provenance; optional entailed wording only | H |
| Q18 / P05 | Evaluation | Later MeasurementRevision outcomes | NO | C8EvaluationRevision, T0/label qualification, immutable subsequent evaluation revision | H |
| Q19 / P05 | Quality/drift/activation | A22 permission, no statistical quality owner | NO | Evaluation quality evidence + A22 requested model binding + fresh effective gate; E01 remains open | H |
| Q20 / P06 | Authority/privacy | Membership/CrmStaffAccess, C7 viewer, safe audit | NO | Reuse existing entitlements; apply to new result, input-derived finance rank, AI payloads | D |
| Q21 / P01 | Retention/hold | AC6 runs/claims + C7 leaf | NO | Three C8 leaf classes; 365-day cap; source-safe references, no new hold authority | D |
| Q22 / P06 | Legacy cutover | L01–L08 | NO | Exact disposition §11; entrypoint/consumer guard prevents parallel scorer | D |
| Q23 / P06 | Consistent consumers | Existing HTTP/UI/AI/report readers | NO | C8 safe read adapter and current-vs-historical projection §12 | H |
| Q24 / P06 | Release/coverage | Mandatory Jest src specs and 32-surface manifest | NO | Extend inherited release tests with C8 proofs; no new discovery loop | D |

All 24 Qs map to their frozen accepting package. Q18/Q19 are **mapped but not numerically closed**. This document does not claim any Q implemented/PASS. Existing foundations are reused even though every full C8 requirement still needs C8 behavior or proof.

## 3. One result owner, distinct persisted concepts

| Concept | Durable representation | Why / owner |
| --- | --- | --- |
| Model definition / feature and evaluation contract | Versioned nonpersonal release manifest in repository; digest-addressed, no data/weights/contacts | Algorithm/target/type definitions are code/release artifacts; no table per definition. E01 must freeze evaluation manifest values before code. |
| Fitted model version | **C8ModelVersion** | Exact tenant, method/parameters, training boundary/evidence digest, model/evaluation hashes and expiry; immutable candidate. Presence is not activation. |
| Input snapshot | Embedded immutable **C8ResultRevision.inputSnapshotJson**, hash and refs | Necessary numeric features + missingness/coverage only; no parallel feature store. Admission freezes T0-known inputs. Shared result has a bounded typed dependency manifest. |
| Valuation/prediction/policy result | **C8ResultRevision** tagged union | One revision foundation across P02/P03/P04, not tables per target. Does not own source money/history. |
| Ranking run | Same **C8ResultRevision**, kind RANKING | One immutable bounded cohort/order/comparator manifest, members reference exact C8 result versions; no rank-member value duplication or new campaign audience. |
| Evaluation / drift evidence | **C8EvaluationRevision** | Different T0→later-label lifecycle, distinct from user prediction result. Bounded cases + aggregate metrics, immutable revisions; not new source labels. |
| Requested activation | Existing **TenantBusinessConfigurationRevision**, `c8_valuation.modelUse` | Explicit A22 owner configuration binds exact model/evaluation digests. Quality is non-overridable. No mutable active flag on model row. |
| Effective activation | Computed intersection of current A22 + qualified unexpired model/evaluation + current authority/data eligibility | No new table. DENY/expired/missing/failed drift defeats earlier request to use a model. A config row is not a quality PASS. |
| Opportunity | Existing **Opportunity / AgentTask** | Typed evidence admission with current validation, dedup/supersession. No execution or new owner. |

C7 MeasurementRevision, A29, Client, Appointment, payment/refund/expense/salary, Review, AE/CD remain unchanged source owners. P02/P03/P04 reuse the same period/evidence/revision format; P05's evaluation row is an assessment of results, not a competing valuation representation.

The three-table proposal deliberately avoids hard FKs from expiring derived rows to other expiring derived rows or mutable source associations. These would block C7 cleanup or source correction. **Only tenant existence is a physical FK.** Exact source/result/model/policy references are typed `(tenant, owner, id, version/digest, asOf, expiry)` and are independently checked at admission/publication/read; they are not arbitrary JSON links. SQL publication guard and executable proofs must verify tenant/subject integrity, alongside the canonical repository validator. No Client ownership is inferred from userId, phone, provider text or row existence.

## 4. Exact proposed physical fields

JSONB is a physical field, not permission for arbitrary keys. All JSON variants below are closed, versioned and bounded; unknown keys/PII/features are rejected. Decimal values use canonical decimal strings, timestamps canonical UTC; no unstable float/JSON serialization in identity. None of these fields is implemented now.

### C8ModelVersion — 22 fields

| # | Field | PostgreSQL / nullability | Purpose |
| --- | --- | --- | --- |
| 1 | `id` | UUID; otherwise NOT NULL | Primary identity |
| 2 | `tenantId` | TEXT; otherwise NOT NULL | Exact existing Tenant.id |
| 3 | `modelKey` | TEXT; otherwise NOT NULL | Versioned method/target family key |
| 4 | `version` | INTEGER; otherwise NOT NULL | Positive tenant/model version |
| 5 | `contractVersion` | INTEGER; otherwise NOT NULL | 1; closed typed payload contract |
| 6 | `manifestHash` | CHAR(64); otherwise NOT NULL | All immutable model manifest content |
| 7 | `artifactHash` | CHAR(64); otherwise NOT NULL | Canonical fitted parameters/method digest |
| 8 | `featureContractHash` | CHAR(64); otherwise NOT NULL | Exact feature allowlist, units, transforms and missingness contract |
| 9 | `evaluationContractHash` | CHAR(64); otherwise NOT NULL | Approved numeric quality manifest digest; absent contract forbids model activation |
| 10 | `targetKey` | TEXT; otherwise NOT NULL | One of T01–T08 target identifiers |
| 11 | `targetJson` | JSONB; otherwise NOT NULL | Target event, H, unit/basis/currency scope, label maturity and coverage |
| 12 | `scopeJson` | JSONB; otherwise NOT NULL | Typed tenant/branch/staff/service/provider domain and authority scope |
| 13 | `methodJson` | JSONB; otherwise NOT NULL | Method identifier/version, fit settings, preprocessing, seed/numeric precision |
| 14 | `parametersJson` | JSONB; otherwise NOT NULL | Bounded fitted numeric parameters only; no raw training cases/identifiers |
| 15 | `trainingEvidenceJson` | JSONB; otherwise NOT NULL | Dataset/split digests, aggregate qualification and T0 ranges; no per-Client history |
| 16 | `informationCutoffAt` | TIMESTAMPTZ(3); otherwise NOT NULL | Latest information available to model training/admission |
| 17 | `trainingMode` | TEXT; otherwise NOT NULL | PROSPECTIVE or QUALIFIED_BACKTEST; never fabricated historical live prediction |
| 18 | `releaseDigest` | CHAR(64); otherwise NOT NULL | Allowlisted reviewed code/definition artifact digest |
| 19 | `requestKeyHash` | CHAR(64); otherwise NOT NULL | Hash of tenant/modelKey/version/releaseDigest; not arbitrary transport key; changed manifest conflicts |
| 20 | `intentHash` | CHAR(64); otherwise NOT NULL | Immutable complete admission intent digest |
| 21 | `admittedAt` | TIMESTAMPTZ(3); otherwise NOT NULL | Server initial admission; never changed on retry |
| 22 | `expiresAt` | TIMESTAMPTZ(3); otherwise NOT NULL | Nonrenewing retention cap / dependency deadline |

### C8ResultRevision — 41 fields

| # | Field | PostgreSQL / nullability | Purpose |
| --- | --- | --- | --- |
| 1 | `id` | UUID; otherwise NOT NULL | Primary identity |
| 2 | `tenantId` | TEXT; otherwise NOT NULL | Exact existing Tenant.id |
| 3 | `kind` | TEXT; otherwise NOT NULL | OBSERVED_VALUE / POLICY_SIGNAL / PREDICTION / SCENARIO / RANKING |
| 4 | `subjectKind` | TEXT; otherwise NOT NULL | client / appointment / staff / branch / tenant / cohort |
| 5 | `subjectId` | TEXT; otherwise NOT NULL | Opaque canonical subject; cohort is frozen query digest, not new Client |
| 6 | `identityHash` | CHAR(64); otherwise NOT NULL | Stable logical series identity; canonical normalization |
| 7 | `revision` | INTEGER; otherwise NOT NULL | Positive fenced sequence within tenant/series |
| 8 | `intentHash` | CHAR(64); otherwise NOT NULL | Immutable complete admission intent digest |
| 9 | `contractVersion` | INTEGER; otherwise NOT NULL | 1; closed typed payload contract |
| 10 | `ruleKey` | TEXT; otherwise NOT NULL | Deterministic rule/input contract key |
| 11 | `ruleVersion` | INTEGER; otherwise NOT NULL | Positive released rule version |
| 12 | `modelVersionId` | UUID, nullable; otherwise NOT NULL | Required only for probabilistic result; exact checked ref |
| 13 | `modelManifestHash` | CHAR(64), nullable; otherwise NOT NULL | Paired with model ref; deterministic result has neither |
| 14 | `policyRevisionId` | TEXT; otherwise NOT NULL | Exact A22 c8_valuation revision ref |
| 15 | `policyContentHash` | CHAR(64); otherwise NOT NULL | Exact confirmed configuration hash |
| 16 | `t0` | TIMESTAMPTZ(3); otherwise NOT NULL | Information boundary fixed at admission |
| 17 | `horizonEnd` | TIMESTAMPTZ(3), nullable; otherwise NOT NULL | Required future target endpoint; never inferred from transport time |
| 18 | `periodFrom` | TIMESTAMPTZ(3); otherwise NOT NULL | Observed feature/value window start |
| 19 | `periodTo` | TIMESTAMPTZ(3); otherwise NOT NULL | Observed window end ≤ T0 |
| 20 | `timezone` | TEXT; otherwise NOT NULL | Validated canonical IANA timezone / calendar semantics |
| 21 | `scopeJson` | JSONB; otherwise NOT NULL | Typed tenant/branch/staff/service/provider domain and authority scope |
| 22 | `basis` | TEXT; otherwise NOT NULL | Named monetary/count/policy/comparator basis |
| 23 | `currency` | TEXT, nullable; otherwise NOT NULL | Exact source currency only for money; no FX |
| 24 | `inputHash` | CHAR(64); otherwise NOT NULL | Canonical frozen input + evidence identity |
| 25 | `inputSnapshotJson` | JSONB; otherwise NOT NULL | Minimal normalized features, missingness, versions and dependency deadlines |
| 26 | `evidenceRefsJson` | JSONB; otherwise NOT NULL | Typed qualified C7/source references; no raw provider payload |
| 27 | `completeness` | TEXT; otherwise NOT NULL | COMPLETE / PARTIAL / UNAVAILABLE / NOT_MEASURED |
| 28 | `qualification` | TEXT; otherwise NOT NULL | VERIFIED / SOURCE_LABELLED / UNQUALIFIED |
| 29 | `eligibility` | TEXT; otherwise NOT NULL | ELIGIBLE / INSUFFICIENT_DATA / UNSUPPORTED / INELIGIBLE |
| 30 | `admittedAt` | TIMESTAMPTZ(3); otherwise NOT NULL | Server initial admission; never changed on retry |
| 31 | `expiresAt` | TIMESTAMPTZ(3); otherwise NOT NULL | Nonrenewing retention cap / dependency deadline |
| 32 | `state` | TEXT; otherwise NOT NULL | PENDING / PUBLISHED / UNAVAILABLE |
| 33 | `leaseGeneration` | INTEGER; otherwise NOT NULL | Monotonic fence, initially 0 |
| 34 | `leaseTokenHash` | CHAR(64), nullable; otherwise NOT NULL | Current claim capability digest |
| 35 | `leaseExpiresAt` | TIMESTAMPTZ(3), nullable; otherwise NOT NULL | Claim deadline |
| 36 | `publishedAt` | TIMESTAMPTZ(3), nullable; otherwise NOT NULL | Terminal publication time |
| 37 | `snapshotHash` | CHAR(64), nullable; otherwise NOT NULL | Immutable terminal payload hash |
| 38 | `valuesJson` | JSONB, nullable; otherwise NOT NULL | Typed decimal-string values; never unknown as zero |
| 39 | `uncertaintyJson` | JSONB, nullable; otherwise NOT NULL | Method/level/interval/error scope or explicit unavailable; no invented confidence |
| 40 | `reasonsJson` | JSONB, nullable; otherwise NOT NULL | Bounded deterministic codes and permitted parameters |
| 41 | `rankingJson` | JSONB, nullable; otherwise NOT NULL | RANKING only: objective, exact member refs/order/ties/exclusions; no contacts |

### C8EvaluationRevision — 31 fields

| # | Field | PostgreSQL / nullability | Purpose |
| --- | --- | --- | --- |
| 1 | `id` | UUID; otherwise NOT NULL | Primary identity |
| 2 | `tenantId` | TEXT; otherwise NOT NULL | Exact existing Tenant.id |
| 3 | `modelVersionId` | UUID; otherwise NOT NULL | Exact model ref, qualified soft reference |
| 4 | `modelManifestHash` | CHAR(64); otherwise NOT NULL | Exact immutable model manifest digest |
| 5 | `identityHash` | CHAR(64); otherwise NOT NULL | Stable logical series identity; canonical normalization |
| 6 | `revision` | INTEGER; otherwise NOT NULL | Positive fenced sequence within tenant/series |
| 7 | `intentHash` | CHAR(64); otherwise NOT NULL | Immutable complete admission intent digest |
| 8 | `contractVersion` | INTEGER; otherwise NOT NULL | 1; closed typed payload contract |
| 9 | `evaluationContractHash` | CHAR(64); otherwise NOT NULL | Approved numeric quality manifest digest; absent contract forbids model activation |
| 10 | `mode` | TEXT; otherwise NOT NULL | OFFLINE_BACKTEST / PROSPECTIVE / DRIFT |
| 11 | `targetKey` | TEXT; otherwise NOT NULL | One of T01–T08 target identifiers |
| 12 | `scopeJson` | JSONB; otherwise NOT NULL | Typed tenant/branch/staff/service/provider domain and authority scope |
| 13 | `t0From` | TIMESTAMPTZ(3); otherwise NOT NULL | Earliest frozen prediction/qualified backtest origin |
| 14 | `t0To` | TIMESTAMPTZ(3); otherwise NOT NULL | Latest frozen prediction origin in this evaluation |
| 15 | `labelsAsOf` | TIMESTAMPTZ(3); otherwise NOT NULL | Later outcome information boundary |
| 16 | `admittedAt` | TIMESTAMPTZ(3); otherwise NOT NULL | Server initial admission; never changed on retry |
| 17 | `expiresAt` | TIMESTAMPTZ(3); otherwise NOT NULL | Nonrenewing retention cap / dependency deadline |
| 18 | `state` | TEXT; otherwise NOT NULL | PENDING / PUBLISHED / UNAVAILABLE |
| 19 | `leaseGeneration` | INTEGER; otherwise NOT NULL | Monotonic fence, initially 0 |
| 20 | `leaseTokenHash` | CHAR(64), nullable; otherwise NOT NULL | Current claim capability digest |
| 21 | `leaseExpiresAt` | TIMESTAMPTZ(3), nullable; otherwise NOT NULL | Claim deadline |
| 22 | `publishedAt` | TIMESTAMPTZ(3), nullable; otherwise NOT NULL | Terminal publication time |
| 23 | `snapshotHash` | CHAR(64), nullable; otherwise NOT NULL | Immutable terminal payload hash |
| 24 | `casesJson` | JSONB; otherwise NOT NULL | Bounded case refs: prediction/hash, later C7 label/hash, maturity/exclusion; no raw identifiers beyond necessary opaque refs |
| 25 | `evidenceHash` | CHAR(64); otherwise NOT NULL | Exact case/label/split qualification fingerprint |
| 26 | `countsJson` | JSONB; otherwise NOT NULL | Qualified/immature/unknown/excluded counts, independent cluster/cohort coverage |
| 27 | `metricsJson` | JSONB, nullable; otherwise NOT NULL | Named baseline/candidate metric values, uncertainty and denominators |
| 28 | `calibrationJson` | JSONB, nullable; otherwise NOT NULL | Reliability / interval coverage evidence, never synthetic-as-real |
| 29 | `driftJson` | JSONB, nullable; otherwise NOT NULL | Fixed monitoring window / threshold / evidence / result |
| 30 | `outcome` | TEXT, nullable; otherwise NOT NULL | PASS / FAIL / INSUFFICIENT_DATA / NOT_YET_OBSERVED; unavailable is not pass |
| 31 | `reasonsJson` | JSONB, nullable; otherwise NOT NULL | Bounded deterministic codes and permitted parameters |

**Physical total: 22 + 41 + 31 = 94.** No new scalar fields on existing models. `Tenant` receives three reverse Prisma relations only; `TenantBusinessConfigurationRevision` receives a forward CHECK extension only. Thus **2 altered existing models**, but only one has a physical constraint change. No C7/source/Opportunity/AuditLog model alteration.

### Closed JSON payload mapping

These are schema contract keys, not an extensible metadata bag. Nested numeric values/parameters are constrained by the digest-addressed released method contract. New target/feature/parameter semantics require review; JSON does not evade the envelope.

| Payload | Closed content |
| --- | --- |
| Model targetJson | `version,targetKey,eventDefinition,horizon,basis,currency,unit,labelMaturity,requiredCoverage,conditioning` — resolved from the reviewed target manifest and confirmed supported domain. |
| Model scopeJson | `version,tenantId,branchIds,serviceScope,providerCapability,verticalDomain,cohortDefinitionHash` — current tenant only; no cross-tenant pooled fit. |
| Model methodJson | `version,methodKey,implementationDigest,hyperparameters,transforms,seed,numberFormat,intervalMethod` — finite keys/parameter names for the released method, not executable code. |
| Model parametersJson | `version,coefficientNames,coefficients,intercept,scaleParameters,calibrationParameters,residualSummary` — method-appropriate subsets only; no raw rows, free text or contact identifiers. |
| Model trainingEvidenceJson | `version,datasetHash,splitHash,sourceContractHashes,qualifiedCounts,excludedCounts,originFrom,originTo,labelsAsOf,knowledgeEvidenceHash` — no individual training dataset copied into registry. |
| Result scopeJson | `version,capabilityKey,branchIds,serviceScope,staffScope,providerCapability,featureContractHash,targetKey,targetContractHash,cohortDefinitionHash` — explicit null for nonapplicable target/cohort; subject columns independently checked. |
| Result inputSnapshotJson | `version,features,missingness,coverage,dependencies` — feature entries `{key,value,unit,basis,currency,sourceRefs}`; only released nonsensitive features, canonical decimal strings and exact source refs. Dependencies `{owner,tenantId,id,hash,asOf,expiresAt}`. |
| Result valuesJson | `version,values,limitations` — values `{key,type,value,unit,basis,currency}`; type is observed/scenario/expected/policy, never causal uplift; complete/current status cannot be supplied by LLM. |
| Result uncertaintyJson | `version,state,methodKey,level,lower,upper,errorSummary,evaluationRef,limitations` — nonapplicable/unsupported explicit; no mandatory numeric filler. Evaluation ref contains tenant/id/hash/deadline. |
| Result reasonsJson | Array of `{code,featureRefs,evidenceRefs,parameters}`; finite code/parameter allowlist; no free psychological narrative. |
| Result rankingJson | `version,objectiveKey,queryHash,coverage,comparators,tieBreak,members,excluded,dependencyDeadline` — member `{subjectRef,resultRef,position,tieKey}`; excluded `{subjectRef,reasonCodes}`. No phone/contact/value copy. |
| Evaluation scopeJson | `version,targetContractHash,tenantId,providerCapability,verticalDomain,cohortDefinitionHash,splitHash,baselineKey,featureContractHash` — exact tested applicability. |
| Evaluation casesJson | Array `{caseKey,predictionRef,backtestInputRef,labelRefs,labelState,labelValue,exclusionCodes,clusterRef,dependencyDeadline}`; predictionRef or qualified backtest ref, never both; labelValue only minimal qualified scalar needed for evaluation, not new source fact. |
| Evaluation counts/metrics/calibration/drift | Closed named metrics defined in §8 and approved quality manifest; each value has denominator/unit/window/method. Counts retain immature/unknown/excluded/independent cluster counts. No caller-supplied PASS field accepted as evidence. |
| Evaluation reasonsJson | Finite quality/coverage/expiry/revocation reason codes, not model-generated explanations. |

All refs and cases use opaque identities under current tenant authorization; opaque is still potentially personal, not automatically anonymous. JSON bounds: rank and evaluation case arrays ≤5,000, source/dependency arrays ≤5,000, individual safe output pages ≤100; over-limit calculations explicitly unavailable or partitioned into independently defined scoped runs. Every feature name, coefficient shape and metric name must be allowlisted by its approved manifest. Retention covers every field above. No shared long-lived raw feature cache.

## 5. Constraints, identities and lifecycle

### Exact structural constraint budget

Names below are proposed migration identifiers; no migration file is created now. Use TEXT + CHECK, consistent with C7/R11, rather than new PostgreSQL enums: **new database enums 0**. Closed runtime values are explicitly listed in §4; T01–T08 keys below and the one A22 namespace are additions to runtime allowlists, not new action identifiers.

| Table | New PK | New UNIQUE (excluding PK) | New FK | Ordinary indexes (excluding PK/UNIQUE) |
| --- | --- | --- | --- | --- |
| C8ModelVersion (`C8_model_*`) | id | id+tenant; tenant+modelKey+version; tenant+requestKeyHash; tenant+manifestHash | tenantId→Tenant.id, RESTRICT/RESTRICT | tenant+targetKey+admittedAt; expiresAt+id |
| C8ResultRevision (`C8_result_*`) | id | id+tenant; tenant+identityHash+revision; tenant+intentHash | tenantId→Tenant.id, RESTRICT/RESTRICT | tenant+subjectKind+subjectId+t0; tenant+kind+periodFrom+periodTo; tenant+state+leaseExpiresAt; expiresAt+id; tenant+modelVersionId |
| C8EvaluationRevision (`C8_eval_*`) | id | id+tenant; tenant+identityHash+revision; tenant+intentHash | tenantId→Tenant.id, RESTRICT/RESTRICT | tenant+modelVersionId+t0From+t0To; tenant+state+leaseExpiresAt; expiresAt+id |
| **Total** | **3** | **10** | **3** | **10** |

**24 new CHECK constraints**, plus **1 changed existing CHECK**:

- Model, 6: `C8_model_contract_ck` (version/contract/key); `hashes_ck` (all digest formats); `time_ck` (knowledge cutoff ≤ admission; expiry > admission and ≤ admission+365d); `target_ck` (T01–T08); `mode_ck` (two training modes); `payload_ck` (required JSON objects, nonempty method/feature/evaluation identifiers).
- Result, 10: `C8_result_contract_ck`; `hashes_ck`; `subject_ck` (closed kind/opaque identity); `kind_ck`; `state_ck`; `time_ck` (periodFrom < periodTo ≤ T0 ≤ admission; future horizon when applicable; retention cap); `lease_ck` (generation nonnegative, paired token/deadline, only PENDING can be claimed); `publication_ck` (terminal has time/hash/reasons and no live lease); `payload_ck` (typed kind, paired model reference/hash, ranking-only manifest, monetary currency requirement); `eligibility_ck` (closed completeness/qualification/eligibility; unavailable/ineligible cannot expose a numeric prediction).
- Evaluation, 8: `C8_eval_contract_ck`; `hashes_ck`; `mode_ck`; `target_ck`; `time_ck` (t0From ≤ t0To ≤ labelsAsOf ≤ admission, retention bound); `state_lease_ck`; `publication_ck`; `outcome_ck` (finite outcome and required denominators/reasons; FAIL/insufficient cannot be activation evidence).
- Extend existing **`R11_config_contract_check`** in `20260908010500_r11_approved_foundation/migration.sql` forward to additionally permit `c8_valuation`, preserving every existing condition/namespace and contractVersion=1. The typed inner C8 content has its own version=1. Existing A22 actor, execution and append-only triggers remain in force.

CHECKs do not prove foreign source identity or model quality. Three C8 write guards must enforce admission, immutable content and publication; a shared source/dependency validator enforces exact tenant/reference/subject semantics, and an AC6 deletion guard requires the existing durable item claim. Proposed functions: `C8_model_guard`, `C8_result_guard`, `C8_eval_guard`, `C8_validate_refs`, `C8_retention_claim`; three BEFORE INSERT/UPDATE/DELETE triggers call the appropriate guard. Typed payload validation is mirrored in the repository and executable PostgreSQL proof. No source-table trigger/FK is added; no source owner is blocked by a derived Client assertion.

### Admission / current result / restart

1. Server authenticates current actor/system-tenant, scopes permitted sources and selects released deterministic capability; caller cannot upload an arbitrary feature vector, source hash or fitted model through a business read API.
2. Resolve exact canonical subjects and C7 evidence; freeze minimal T0 input and A22/model digests. Hash canonical NFC strings, UTC instants, decimal strings, sorted object keys; sets sort explicitly, comparator/member order remains significant. No random request metadata in the hash.
3. Result/evaluation logical intent is server-derived from the **entire frozen normalized intent**; tenant+intentHash dedups identical admissions. Return stable row ID; resume uses this ID and expected intent hash. Same row ID with changed input is a conflict. There is no new user-chosen keyless business command or transport idempotency system. A newly admitted changed authoritative observation is a new intent/revision, not a retry of an old row.
4. `identityHash` identifies the series (tenant, kind/target, exact subject, objective/basis/currency/period/T0/horizon and scope). Input/evidence/model/policy versions go into intentHash. Under a tenant+series advisory transaction lock, check dedup then allocate next revision. Current means highest admitted revision's state; never silently fall back to an older numeric success when the newest is unavailable.
5. Model upload/admission is a bounded reviewed operator artifact on existing S14, no automatic training. Stable request identity + same manifest → same version; changed manifest under that identity → conflict. Artifact must reference an allowlisted released algorithm/feature/evaluation manifest and exact tenant. Admission does not activate it; unknown or unapproved evaluation manifest rejects admission of a usable fitted model.
6. Worker claims PENDING with fenced generation/token/deadline. Reclaim after lease expiry retains row/intent/expiry. CAS publication by the current fence only. Retry of terminal row returns the same snapshot; no provider or business effect is involved.
7. Before publication, validate current tenant/subject, relevant source hashes, policy head and model quality. For a live prediction, the released model and every training/feature information cutoff must precede its server-fixed T0; model availability and issuance must precede the target outcome. Callers cannot choose a past T0 to manufacture foresight. Offline backtest cases remain evaluation-mode artifacts, never live PREDICTION rows. Lock exact mutable source rows/current policy ordering in a serializable transaction compatible with existing owners. Concurrent source correction either precedes validation (UNAVAILABLE) or follows a valid publication (historical snapshot preserved). Never rebind pending Client A to B. Hash-only “validation” without authoritative re-read is insufficient.
8. Published snapshots immutable; later source correction produces current unavailability or a newly admitted result. Evaluation labels can revise an evaluation; they never rewrite an earlier prediction. A live read rechecks current policy/authority/source freshness and quality before presenting an old snapshot as a current usable estimate. Historical authorized views explicitly label old model/policy/asOf and current unusability.
9. Failure/unavailable/expired sources fail closed; old ALLOW/config cannot revive expired business inputs. Model/evaluation expiry disables new prediction and predictive rank/Opportunity use. Existing AE/CD UNKNOWN/reconciliation is untouched; a delivery UNKNOWN is excluded from outcome labels, never retried by C8.

Typed refs contain `{owner, tenantId, id, revisionOrStateHash, observedAt, asOf, qualification, coverage, expiresAt?}`. Qualified query evidence additionally fixes its query/cutoff digest and completeness proof. Id-only reads, phone matching, date/amount matching and live CRM queries pretending to reconstruct earlier T0 are forbidden. Mutable query populations need transactional/revision-stable source evidence; unsupported point-in-time reconstruction → unavailable. A source disappearing at lawful cleanup does not block cleanup and does not grant permission to keep using an unverifiable current prediction.

Ranking stores an explicit eligible cohort manifest, its query/coverage hash, objective, compatible basis/currency/horizon, comparator sequence, exact member result IDs/hashes, ordered opaque subject refs, tie rule, unknown/ineligible reasons and dependency deadlines. It never stores contacts. Bounded cohort admission must reject/truthfully segment an oversized request, never truncate and call it the full business top list. Bound proposed: 5,000 members per complete scoped run, matching existing bounded Opportunity scan scale; authorized pages ≤100. These are resource limits, not loyalty/minimum-evidence rules. Retry uses the original order; new Client/device/recipient is not silently added. Rank retention cannot extend underlying per-Client artifacts. Every probabilistic member dependency is requalified for current use; a failed dependency invalidates current rank use, not an in-place reordering or fallback to legacy scores. An updated cohort/order requires a new admitted run.

## 6. Typed A22 policy and effective model use

**Namespace: `c8_valuation`; inner contract `maya.c8-policy/1`.** Reuse existing `POST /api/governed-settings/tenant`, GET tenant namespace, stable caller identity, confirmed command, expectedRevision/previousRevisionId, owner/business-owner roles and `update_tenant_business_configuration` executor. New AE classes **0**. Same current policy namespace lock protects publish/admission against concurrent configuration changes.

| Exact top-level key | Closed content / restrictions |
| --- | --- |
| `version` | Integer 1. |
| `valueMeasures` | List of `{key,basis,currency,window,serviceScope}`. Basis allowlist: confirmed_cash, confirmed_refunds, confirmed_cash_net_linked_refunds, booked_value, provider_reported_gross, observed_attended_count. Non-money currency null. Window `{unit:day/calendar_month,count}` positive, exact timezone; no cross-currency aggregate. Gross explicitly source-labelled. |
| `predictionTargets` | List `{targetKey,modelKey,horizon,basis,currency,serviceScope}`. Horizon `{unit:day/calendar_month,count}` positive or T02 `{unit:appointment_outcome}`; exact supported model domain required. Expiry/label delay must fit ≤365-day evidence lifecycle. No global 60/90-day default. |
| `dormancyRules` | List `{ruleKey,serviceScope,elapsed:{unit:day/calendar_month,count},comparison:gt/gte,evidence:proven_attendance,minimumCoverage}`. Rule uses exact time semantics and independently established coverage. No policy → no dormant label. Service mix ambiguity → unavailable. |
| `rankingObjectives` | List `{key,scope,comparators:[{measureKey,direction:asc/desc}],tieBreak:opaque_subject_id,unknownBucket:separate}`. No weighted formula, arbitrary SQL, prompt, income/health proxy or automatic value×probability. All measures must be compatible with declared objective. |
| `minimumEvidence` | Per-feature/target `{targetKey,minimumObservedEvents,requiredCoverage,maximumInputAge}`. Tenant may tighten released model eligibility, never weaken its quality/feature contract or turn sample count into proof. No universal numeric sample floor is silently supplied; E01 must settle model-domain floors. |
| `exclusions` | Typed service/branch/subject-state exclusions and explicit required-feature restrictions. Only existing canonical IDs in exact tenant scope; no raw text, contacts, diagnoses or sensitive categories. No permission grant. |
| `opportunityAdmission` | `{enabled:false, rules:[]}` initially. Each explicitly enabled rule fixes existing Opportunity type, eligible result kind/target, threshold/comparator/basis, max result age and permitted existing read domain. Threshold is business policy, not a calibration bypass. |
| `modelUse` | List `{targetKey,modelVersionId,manifestHash,evaluationRevisionId,evaluationSnapshotHash,requested:enabled/disabled}`. Exact approved quality manifest, scope and evaluation required. Empty list disables numeric predictions. No editable quality metrics, model coefficients, auto-training or auto-promotion flag. |

Lists have finite bounded validators; proposed upper bounds: 40 named measures/rules/objectives/targets each (existing A22 rule bound), 8 comparator entries per objective, 100 scoped exclusion references; these are API resource limits only. No valid business need outside bounds is silently truncated. All service/branch scope items use known canonical IDs; raw provider IDs require existing independently proven bindings.

**Activation is not an owner quality override:** requested=enabled AND exact released method/model/evaluation AND PASS for that target/horizon/provider/vertical/cohort AND not expired/drifting AND current eligible sources/authority. Fresh qualifying evaluation does not auto-promote a previously disabled model. A failure/expired evidence closes it immediately on effective use; background monitoring cannot leave stale enabled predictions visible until its next timer. A new owner-confirmed use request is required to enable a new version. A fixed evaluator can deterministically disable effective use without writing fake owner config.

No arbitrary “system says ALLOW” can enter encrypted config; typed validation occurs before A22 admission and again in executor. LLM can draft only the allowed policy keys, followed by existing exact owner confirmation. Audit retains A22 receipt; no extra prediction action or manual SQL setting writer.

## 7. Retention and source independence

| Entity/field group | Classification | Lifetime / owner | Hold / tenant deletion / cleanup |
| --- | --- | --- | --- |
| C7 source facts and MeasurementRevision | Existing source/derived contracts | Unchanged existing owners | No C8 cascade, delete, rewrite or shortened retention. |
| Nonpersonal algorithm/feature/quality definition manifest in code | Release manifest; no fitted personal parameters or cases | Existing versioned release history, not a new personal DB retention store | No per-Client content; no raw data/weights uploaded to Git. Definition changes are a new digest. |
| C8ModelVersion all 22 fields | Tenant-derived fitted manifest, conservatively restricted even if aggregate parameters appear anonymous | Proposed ≤365 days from original admission, scoped AC6. No claim that fitted parameters are automatically anonymous. Dependency deadlines may shorten usability. | Not a new indefinite model store. No automatic refit/clone to reset expiry. Tenant delete remains blocked until canonical purge/hold disposition; no source deletes. |
| C8ResultRevision all 41 fields | Personal derived when subject/cohort identifies Clients; other results treated with same restrictive policy | ≤365 days from initial admission, capped at the earliest retained identifiable dependency deadline | Retry/new wrapper cannot extend old Client feature retention. AC6 deletes leaf row with exact claim; source refs are non-owning. All values/uncertainty/rank/input/reason JSON covered. |
| C8EvaluationRevision all 31 fields | Derived assessment; case refs treated as personal, not automatically anonymized | ≤365 days from original admission and ≤earliest retained case/input deadline | No copying old predictions into a new evaluation to reset clock. Metrics/cases erased together. Missing mature labels before deadline → insufficient, not longer silent retention. |
| A22 c8_valuation policy/model-use refs | Existing configuration/audit, not per-Client predictions | Existing R11 config and AC6 superseded-payload rules | Store no per-Client rows/features here. Stale model/eval refs become unusable; never reanimate deleted payloads or reset their clock. |
| Opportunity evidence | Existing canonical Opportunity history | Existing lifecycle/retention | C8 ref+digest only; no copied per-Client prediction/rank payload under longer retention. Missing/expired ref stops new use; historical evidence remains a ref. |

Proposed AC6 classes: **`expire_c8_result_revisions`**, **`expire_c8_evaluation_revisions`**, **`expire_c8_model_versions`**. Each maps one exact table to its admittedAt/expiresAt under existing MaintenanceRun/ItemClaim, central bounded batch and fencing. Shared coordinator, not three retention owners. C7 cleanup cannot be blocked by C8 FKs. C8 cleanup cannot delete any canonical source row.

**No new hold field/authority.** A failed/unresolved canonical maintenance claim retains the exact row fail-closed and reports the hold; it is not a configurable forever hold. Existing security/legal lifecycle takes precedence where applicable, via its own owner; C8 cannot invent such an authority or copy audit/source records into a derived hold. Derivation/result use still stops at expiry even if deletion is held. Do not promise source removal on tenant deletion when existing source/security contracts retain it. Tenant deletion coordinates C8 leaf cleanup after holds, then follows existing tenant lifecycle; hard tenant FKs are RESTRICT, never cascading destruction.

## 8. Evaluation design — eight target families, not eight calibrated models

All rows below are **proposed method/evaluation semantics** consistent with D13. No trained method is claimed to work. E01 blocks numerical operating-point freeze. A model's exact target instance includes H, scope, units, basis, feature/method/evaluation hashes and T0 boundary; no pooled tenant training or automatic vertical transfer is authorized.

Common label rules: only independently qualified later C7/source outcomes; publication and availability timestamps must prove input was known by T0. Future corrections cannot be inserted into training features. Mature absence needs complete observation coverage; otherwise censored/unknown. Outcome corrections create new evaluation revision, never prediction overwrite. Outcome windows and Client/event clusters must not leak between fit/calibration/held-out evaluation; use earlier training data, distinct later calibration and final temporal holdout, with horizon-aware embargo. Repeated/overlapping observations do not inflate independent sample count. All metrics compare the same qualified cases and report excluded/immature coverage. Hyperparameter choices cannot use final holdout.

| ID / package | Exact target / horizon / later label | T0 inputs and candidate method; named baseline | Required metrics / calibration / limitations |
| --- | --- | --- | --- |
| T01 / P03 | `attended_return`: any proven attended Client visit in (T0,T0+H], exact admitted service scope. H from confirmed supported policy. Label 0 only after H with complete coverage; early positive with exact attended fact is observable, immature negatives excluded. “Churn” only labelled non-return over H, never permanent loss. | Proven recency/frequency/cancel/no-show observations within fixed covered window, permitted calendar/service context known at T0. Candidate regularized logistic with train-only transforms, no missing imputation. Baseline train-period empirical event rate for same qualified domain, **offline comparator only**, not a personal cold-start prior. | Brier + log loss versus baseline, reliability by predeclared bins/cohorts, calibration uncertainty, discrimination secondary. Both event/non-event support and temporal/Client independence needed; raw accuracy inadequate. |
| T02 / P03 | `appointment_no_show`: exact already-existing future Appointment, after its admitted scheduled end and authoritative outcome maturity. No-show positive; proven attended negative. Cancel/reschedule/unknown are separate censor/exclusion outcomes unless target explicitly conditions on unchanged appointment. | Exact Appointment/Client + prior covered observations and booking lead/time/service context known at T0; no future appointment edits. Same candidate family and baseline as T01. | Same probability metrics, cancelled/changed exclusion denominator shown; never interpret nonresponse as no-show. Evaluation scope conditional on observable final Appointment outcome is disclosed. |
| T03 / P02 | `client_expected_value`: sum of named qualified monetary outcome for exact Client over H. Cash, net linked refunds, booked/provider gross are separate target instances and labels. No automatic CLV/discount/margin claim. | Covered Client history with exact linked monetary basis; candidate regularized direct-horizon regression, explicit train-only calendar/service features. Baseline prior qualified matching-horizon mean on same basis. Conditional/return scenario uses only supported conditioning and evaluates the joint expected amount end-to-end; no independence shortcut. | MAE + signed bias + scaled error versus baseline; quantile/interval score and empirical coverage. Net money can be negative; no zero-floor hiding refunds. No Client-level label → unavailable even if tenant revenue exists. |
| T04 / P03 | `business_revenue`: exact tenant/branch/service qualified monetary aggregate over future H, named basis/currency. Later same-basis C7 period result. | Complete past same-basis windows and known calendar at T0. Candidate regularized direct-horizon time-series regression; baselines last comparable window and seasonal naive where season is independently supported. No arbitrary season length. | MAE, bias, scaled error when nonzero denominator, interval score/coverage/sharpness, seasonal/cohort coverage. No MAPE on zero/near-zero truth, no fixed RUB or ±10%. |
| T05 / P03 | `staff_earnings_conditional`: future confirmed accrued salary over H **conditioned on independently known lawful compensation terms**, exact Staff scope. Not revenue target or payroll command. | Actual salary history and existing terms known at T0. Same simple regression/baseline family with evaluated condition. Current schema/reader may lack necessary terms → unsupported; no new salary contract, no .5 fallback. | Same monetary metrics in actual salary units/currency, terms-change exclusions; conditional scenario distinct from predicted expected salary. No synthetic terms as truth. |
| T06 / P03 | `observed_booking_demand`: count of later canonical booking-created events within H for exact scope, with independent event-time knowledge and complete ingestion. This is observed booking demand, **not hidden/unserved market demand**. | Covered event history/calendar/service scope; simple direct-horizon nonnegative count forecast. Baseline last comparable/seasonal count, only if supported. | MAE/scaled error and count interval coverage/score; ingestion gaps exclude windows, no missing events as zero. Querying today's appointment table alone cannot reconstruct booking-created history. |
| T07 / P03 | `scheduled_utilization`: later scheduled occupied resource minutes / independently qualified available resource minutes over H, exact resource/scope and basis. Delivered utilization, if requested, is a separate qualified label instance; not substituted silently. | Known schedule/capacity plus covered occupancy history; direct horizon bounded minutes forecast with explicit resource/calendar constraints, evaluated after any bounding. Baseline prior comparable occupied minutes/ratio. | Minute MAE and utilization percentage-point error, interval coverage/score. No capacity denominator / changing unknown closure / overlapping resources → unavailable. Current load is not the forecast. |
| T08 / P03 | `statistical_deviation`: next same-basis qualified business metric relative to its forecast distribution over H. Unsupervised unusualness only; no inferred incident/fraud/business harm. | Same temporal forecast/residual contract, fixed metric/basis and seasonal support. Candidate residual-quantile deviation rule; baseline comparable residual rule. Deterministic tenant threshold breach is a separate POLICY_SIGNAL and needs no fitted detector. | Tail exceedance/coverage and stability with denominator; precision/recall/false-alert rate only when independently qualified incident labels actually exist. Without those labels no “incident detection accuracy” claim. Tail probability is not incident probability. |

Candidate methods above bound the proposed initial family; they are not permission to code before E01. Feature selection, regularization grid, calendar season, interval level, calibration bins and all thresholds must be a released approved target manifest, not selected by LLM/tenant prompt or tuned on the final holdout. No neural model/provider SDK/training dependency is chosen by this document.

**Numeric gate structure for every target:** `dataQualified && scopeSupported && independentSampleSufficient && beatsOrMeetsDeclaredBaselineCriterion && errorWithinApprovedBudget && calibrationWithinApprovedBudget && temporal/CohortChecksPass && freshnessAndDriftPass`. For probabilities, a lower Brier score alone is not proof of calibration; reliability must also be evaluated. Temporal forecast evaluation must reproduce what was available before each test origin. These methodological choices are supported by [scikit-learn probability calibration](https://scikit-learn.org/stable/modules/calibration.html), [Hyndman & Athanasopoulos on temporal cross-validation](https://otexts.com/fpp3/tscv.html), and [forecast accuracy measures](https://otexts.com/fpp3/accuracy.html). They **do not provide Maya-specific acceptable business errors, sample counts or horizon defaults**.

Numeric values still needed once for the whole target matrix: accepted H/domain catalog, feature-window coverage/age, meaningful improvement/noninferiority margin to baseline, probability reliability tolerance and bin support, money/minute/count error budgets with units, interval level/coverage tolerance/width utility, independent event/non-event/period sample floors, temporal blocks/embargo, confidence level for quality uncertainty, drift window/minimum maturity/threshold, evaluation freshness and required label lag. Setting all to a convenient 80%/100 rows/30 days would not be evidence-based.

**Drift/fallback contract is fixed even while thresholds are open:** any current hard input/authority/source qualification failure disables the affected output immediately. Statistical drift uses the same predeclared per-target temporal quality contract on mature cases; insufficient current evidence or expired evaluation is unavailable, not “no drift”. A PASS in another vertical/provider/cohort cannot rescue failure here. No recalibration/retraining/promotion runs automatically. Confirmed previous snapshots remain historical, never current authority. Default numeric activation is OFF; missing quality contract rejects activation.

**Evaluation evidence in this cycle:** no qualified case dataset, incidence/variance/coverage report or business error-cost matrix is supplied by the repository. This is an evidence-availability statement, not a claim that production contains no usable data. Protected databases were not inspected. Committed C7 readers explicitly expose partial history/unsupported money. No genuine model evaluation has run; no numeric gate has passed.

## 9. E01 — narrow numeric quality decision (STOP)

**Question:** on what evidence should Maya's numerical quality budgets and minimum independent sample/coverage requirements be fixed, before any statistical model implementation?

This is not a request to reconsider D01–D16, to approve failed models or to postpone calibration until after activation. The owner expressly requires a narrow Option A/B STOP if the repository/data do not support defensible numbers. Exact missing foundation is a **qualified target-by-target evaluation evidence/budget manifest**: there is no approved C8 error-cost/tolerance matrix or independently reconstructed evaluation dataset/coverage audit. Existing language-classifier thresholds (e.g. intent accuracy) do not answer this question. Picking a sample count without event prevalence, cluster dependence or target error tolerance would be fabricated precision.

### Option A — evidence-first evaluation specification (RECOMMENDED)

Authorize one bounded **read-only evaluation-readiness assessment**, not model implementation or fitting, for all T01–T08 together. First identify explicitly permitted canonical read sources/evidence under current tenant/finance authority; never open the 17 protected old databases, use legacy SQLite as shortcut, extract contacts, or write live predictions. Produce only safe aggregate readiness evidence and a restricted manifest of already authorized qualified sources; no public/committed per-Client dataset. If an approved source is inaccessible, report that target unavailable rather than inventing lineage.

The one follow-up addendum must contain, per target: actual reconstructable T0 ranges; horizon and label-lag coverage; qualified independent event/non-event/time-window counts; temporal/Client cluster dependence; monetary/usage units and zero/variance structure; provider/vertical eligibility; source gaps; proposed risk/utility budgets and the resulting confidence/sample design. Preserve a final holdout from any future fitting/tuning. **Budget recommendations remain product proposals for owner approval, not values chosen to make observed performance pass.** Freeze the numerical matrix once, before model code. If no qualified data exist, record unavailable and do not manufacture thresholds from synthetic cases.

- Gain: thresholds/sample minima have an explicit basis; one combined decision instead of eight target STOP cycles.
- Cost: a bounded evidence step precedes implementation; it does not promise data exist or that all targets can activate.
- After A alone: no model code, training, production mutation or activation is authorized. Current schema candidate remains reviewable; final combined envelope cannot be called ready until the numeric addendum is settled.

### Option B — owner-defined risk budget first

Owner supplies/approves **one complete numerical quality matrix** before any additional source inspection: exact H/domain; allowable probability error; money/count/minute and utilization error in declared units; interval level/coverage/sharpness utility; acceptable statistical decision risk; meaningful improvement/noninferiority margin; independent sample confidence requirements; drift/freshness budgets. Then derive a sample/coverage plan and test whether qualified data can support it. All eight targets use the same table format; values cannot be “whatever the current model reaches.”

- Gain: quality is directly tied to explicit business tolerance before data work.
- Cost: owner must choose domain-specific numerical tolerances without the readiness evidence; some may prove untestable within 365 days. No arbitrary “80% accuracy” default is supplied by the agent.
- B is **not** D13's rejected “ship probabilities as experimental” alternative. Models remain disabled until their approved budgets pass on qualified data. It does not permit implementation before the matrix is complete.

**Recommended next owner instruction: `E01: APPROVE A — BOUNDED READ-ONLY EVALUATION READINESS; NO MODEL CODE/TRAINING/PRODUCTION MUTATION`.** No E01 choice is assumed approved. A/B affect how the missing numerical evidence contract is established, not the 24-Q scope or the structural result-owner design. They do not increase the six-package/four-wave implementation plan; this is completion of the already requested pre-implementation mapping.

At this STOP: target/label/baseline/metric/lifecycle mapping **8/8**; defensible, frozen numeric acceptance contracts **0/8**. These are deliberately separate counters. Structural security invariants still have exact binary acceptance (zero cross-tenant leak, zero fake labels, zero unqualified numeric activation, zero source deletes); passing them is not model accuracy/calibration.

## 10. Opportunity integration — existing owner only

Extend the existing `OpportunityEvidenceV1.owner` allowlist with **`c8_result`** and its strictly validated capability `valuation_result_v1`. Evidence payload uses existing fields: `factRef` is a canonical opaque ref encoding C8 result ID + immutable snapshot hash + policy revision/digest + optional model manifest digest; `version=1` identifies this evidence variant, `observedAt/asOf` and basis/completeness come from the verified result. The full typed source binding is resolved server-side from the row. **No prediction scalar is smuggled into old fact evidence or arbitrary recommendation arguments.** No new Opportunity schema fields/enums/AE classes.

Before existing lifecycle admission: exact authenticated/system tenant; correct Client/Appointment/branch subject; published, unexpired and currently eligible result; same current A22 revision and enabled rule; qualified model/evaluation when probabilistic; satisfied named comparator/threshold; current safe source lineage. Existing semantic identity/dedup/supersession must collapse repeated C8 evidence for the same business condition. A new C8 revision is refreshed evidence, not automatically a second competing business outcome.

Permitted existing type mapping:

- Client value + confirmed dormancy + qualifying enabled rule → `client_reactivation_candidate`, `client_lifecycle` domain.
- Qualified business/capacity deviation/forecast rule → `business_metric_change`, `business_intelligence` or existing `occupancy` read domain, as explicitly configured.
- Missing data remains a displayed readiness state; no automatic opportunity flood. Existing `missing_business_input` may be used only by an explicitly enabled matching policy.

Retain existing v1 facts-only money/churn rejection in `opportunity.engine.ts`; introduce a separately checked c8_result branch, not blanket removal of its guard. AgentTask remains shadow/no-side-effects. C8 allows no proposed campaign/send/provider intent. Existing Opportunity history stores only ref/digest/limitations, not a copied personal feature/value dataset. If result expires or policy/model becomes ineligible, current opportunity must cease being actionable through existing resolution/supersession semantics; no stale numeric metadata as authority. Opportunity's own owner/expiry remains authoritative, and current use also rechecks C8 dependencies.

## 11. Legacy cutover — exact eight groups

| Legacy | Approved disposition | Replacement / package / guard |
| --- | --- | --- |
| L01 `src/ai-tools/ai-tool-handler.service.ts::clientLoyaltySegment` | RETIRE universal 3/6/12 visit labels | C7 observed facts → C8 POLICY_SIGNAL under exact A22; P02/P06. No value segment fallback when C8 unavailable. |
| L02 `src/ai-tools/client-registry-analysis.ts::analyzeClientRegistry`, `LOYAL_VISIT_THRESHOLD` | ADAPT source-labelled aggregates; RETIRE universal loyal/CLV interpretation | P02 value/rank reader, P06 callers. Calendar bucket is a reporting interval, never dormant policy. Provider lifetime amount remains labelled fact/proxy only. |
| L03 `ai-tool-handler.service.ts::readNoShowRiskClients` | RETIRE >=2/>=3 high-risk interpretation | P03 T02 only for exact future Appointment + qualified model; raw past attendance counts remain facts. Aliases cannot revive heuristic percent/risk rank. |
| L04 `ai-tool-handler.service.ts::forecastBusinessRevenue` | ADAPT consumer; RETIRE fixed RUB/linear-confidence/±10% semantics | P03 T04 or explicitly named deterministic scenario; no disabled-model fallback to old forecast. |
| L05 `src/ai-tools/master-money-motivation.ts::computePeriodMoneyMotivation` | KEEP RETIRED | Existing negative guards preserved; no .5/1.3/top40% reconnect through P03 earnings or P06 consumer. |
| L06 `ai администратор/masters_ai.py::money_pitch` | RETIRE unsupported .5/cycle/annual upsell money | Read permitted C8 conditional evidence or show unavailable; no standalone Python estimator. Existing retired send/goal writers stay retired. |
| L07 `ai администратор/owner_ai.py::client_retention` | ADAPT qualified facts; RETIRE fixed 90-day cohort churn/40–60/25 universal conclusions | C7 facts + P02 policy, P03 T01 if qualified; P06 bridge safe read. No phone/SQLite lineage shortcut. |
| L08 `ai администратор/growth_planner.py`; owner_ai `money_opportunities` / `_money_at_stake` | RETIRE unsupported money; strategy remains C9 | P02 typed actual/scenario/expected context only. P06 guards all numerical callers; no business-lost-money claim, campaign or direct delivery revival. |

Cutover target `PARALLEL LEGACY SCORING OWNERS: 0` is **required future proof**, not already achieved in this mapping. Guard helpers **and their actual HTTP/AI/Python/UI/report callers**. Do not delete unrelated historical source data or revive already retired functions because they appear in old reports. No legacy runtime changed now.

## 12. Consumers, privacy and API mapping

Proposed bounded endpoints inside existing S01 (not new production surface identities):

- `GET /api/analytics/valuations` — existing permitted scope, bounded list/current projection.
- `GET /api/analytics/valuations/:id` — permitted immutable snapshot; historical/current availability clearly distinct.
- `POST /api/analytics/valuations/compute` — optional explicit **derived computation admission only**, fixed capability/subject/window/policy refs; no caller-provided model output/features/provider payload. This prevents GET/history/AI read from secretly writing derived revisions. One canonical C8 result service handles admission; not an Action Engine business action. Worker resume uses the same durable row. No provider/source mutation.
- `GET /api/analytics/valuation-models/readiness` — safe bounded model/target unavailability/quality summary, current exact tenant/finance authority; no raw cases/parameters/PII.
- Existing `GET/POST /api/governed-settings/tenant...` for A22 configuration. No separate model activation writer.

No public HTTP model-fit/upload, training, evaluation-case export or mass Client/PDF export endpoint. Bounded model/evaluation admission is an authorized S14 operator/worker capability with released manifests and exact tenant; it cannot accept caller-asserted quality PASS. Invocation/validation/audit is server-owned; SQL direct writes outside C8 store forbidden. Background evaluation discovers eligible matured predictions from durable T0/horizon rows, admits a deterministic evaluation only after label snapshot qualification, then resumes fenced computation. No hidden live training or scheduled communication.

D9/C8 D14 mapping: reuse C7 viewer entitlement rules, current Membership/User/tenant status, branch/Staff and CrmStaffAccess. Owner/admin role names alone do not broaden feature permission. Manager does not get finance. Finance-derived rank/reasons are finance even when amounts hidden. Staff own authorized facts only; no whole-business Client ranking as staff. Client without Maya User can be subject; authenticated reader authority is a separate requirement. Client identity is never manufactured to satisfy a model.

LLM projection is bounded: permitted aggregate/fact values, basis/time/H, uncertainty/readiness, model/rule/policy version labels, deterministic reason codes and opaque ephemeral handles only where necessary. No raw contact, stable unnecessary identifying Client histories, raw provider text, diagnosis/sensitive characteristics or inferred hardship. Model inputs have a reviewed feature allowlist, not arbitrary service-text embeddings; service IDs whose semantics expose sensitive treatment must be excluded from predictive profiling. Explanation wording cannot add causes or reorder ranks. Deterministic fallback must always work.

Reuse safe tenant audit read: owner/business-owner only, tenant scope, bounded 31-day window/100 rows, existing safe-field allowlist. No raw prediction/evaluation payload, platform rows or model training cases. Existing OwnerReport snapshot download remains under its own immutable authorized contract; including C8 derived data must respect its earlier dependency expiry and safe minimal projection, not copy per-Client input/rank datasets into longer-lived reports. No new download/export authority.

## 13. Package ownership, waves and schema integration

| Package | Business capability / owned Q | New models/fields (allocated once) | Other changes / dependencies / acceptance |
| --- | --- | --- | --- |
| P01 | Qualified facts, policy, immutable inputs, honest missingness; Q01–06,Q21 | 3 shared models / 94 fields, all schema upfront; 2 existing models altered as §4 | All 3 AC6 classes and single migration, shared model/evaluation contracts before model code; tenant/source correction/fenced claims/retention/A22 proof. Runtime evaluation logic belongs to P05. E01 must close first. |
| P02 | Historical and qualified future value, policy dormancy and reproducible rank; Q07–10,Q15 | 0 / 0 | P01; T03 and probabilistic rank disabled until P05 quality. Exact money/scenario/unknown/current vs snapshot tests. |
| P03 | Return/no-show/revenue/earnings/demand/load/anomaly capability; Q11–14 | 0 / 0 | P01; shared targets/versions/evaluator contract. All numeric capabilities gated OFF without real qualification. Forecast/scenario/threshold distinctions tested. |
| P04 | Explained results and policy-gated existing Opportunity; Q16–17 | 0 / 0 | P02/P03; runs with P05, but predictive Opportunity admission waits for quality. Zero execution/communication. |
| P05 | Compare fixed predictions with reality; control quality/drift; Q18–19 | 0 / 0 additional | Implements shared evaluation/model-release gate over P01 schema; P02/P03 outputs, temporal/label/correction/calibration tests. Data-unavailable is explicit, not calibration PASS. |
| P06 | Consistent secure UI/AI/report consumers and legacy retirement; Q20,Q22–24 | 0 / 0 | P01–05, L01–L08, 32 surfaces, mandatory release/acceptance. |

No package-specific period/evidence/ranking/model-result tables. **Total shared physical counts are not re-added in P05.** New AE classes across P01–P06: **0**. Three AC6 leaf classes all use existing owner; model config uses existing A22 action. No new jobs/actions for pure deterministic reads.

**Wave order unchanged: 4.** Wave 1 P01; Wave 2 P02+P03 (numeric activation disabled absent qualification); Wave 3 P04+P05; Wave 4 P06+single final gate. P01 includes type/quality interfaces and disabled-state gate before producers; P05 implements real evaluation and controlled eligibility before any numeric activation. E01/evaluation-manifest freeze is a prerequisite to Wave 1, not a fifth implementation wave. No new owner decision after each package is expected unless an actual contradiction arises.

**One proposed migration**, deterministic order: create three tables, PK/unique/check/indexes and tenant FKs; add shared guards/triggers; extend R11 namespace CHECK; no source rows changed. Schema is additive except that enumerated forward CHECK replacement. Existing R11 rows all retain valid namespace semantics; verify read-only before apply. No scalar nullability change/drop or backfill; empty new tables. No migration executed now.

Before any future production migration: compare generated SQL against this exact field/constraint manifest; Prisma validate; clean replay on a newly owned disposable database; executable FK/tenant/source-correction/immutability/claims/AC6 proof; combined A22/source/C7 interaction; pre-apply drift NONE/expected-only migration; post-apply pending0/driftNONE. Do not use any of the 17 old DBs. Invalid existing rows or a need for new business fields is a real contract gap; no fabricated repair/backfill.

## 14. Finite executable proof and permanent ratchet plan

Future proposed test names under `maya-saas-backend/src/valuation/` are release-discoverable `*.spec.ts`, included by existing `package.json` Jest rootDir=src/testRegex without separate optional selection. They are not written now. Executable PostgreSQL proof belongs to `scripts/chapter8-foundation-proof.ts` and must be wired into package acceptance; synthetic fixtures cannot replace real-world model evaluation.

| Proposed guard/proof | Required negative and positive cases / Q |
| --- | --- |
| `valuation-source-authority.architecture.spec.ts` | Exact tenant/Client without User accepted through canonical binding; wrong Client/tenant/binding denied; no phone/userId-only lineage. C7 source correction succeeds, pending C8 unavailable, historical snapshot unchanged. Q01–03,20–21. |
| `valuation-policy.architecture.spec.ts` | A22 exact owner-confirmed typed revision; no chat-history/free prompt policy; no universal 3 visits / 60 days / high-check loyal rule. Cold start facts work, missing last visit unknown. Q04–06,10. |
| `valuation-money.architecture.spec.ts` | Exact supported same-basis/currency output; unknown≠0, no lifetime spend labelled CLV, no incomplete financial truth, no unsupported causal/upsell money or .5 salary. Q07–09,12. |
| `valuation-model-quality.architecture.spec.ts` | Qualified synthetic-contract fixture can exercise gate; unqualified/missing version/T0/H/FAILED/expired/drifting model cannot yield numeric output. No real calibration PASS from synthetic test. Q11–14,18–19. |
| `valuation-ranking.architecture.spec.ts` | Stable cohort/comparator/ties/retry, compatible basis; unknown bucket; no hidden weighting, LLM order, unexplained rank, sensitive feature or new member on resume. Q15,17,20. |
| `valuation-opportunity.architecture.spec.ts` | Explicit enabled typed evidence passes existing owner; score without policy/expired source/model denied; no consent/channel/action grant. Old fact branches still reject predictive money. Q16. |
| `valuation-evaluation.spec.ts` | T0 leakage denied, exact later label/revision, immature/censored≠negative, backtest≠historical live prediction, isolated temporal holdout, clustered duplicates don't inflate sample. Q18–19. |
| `valuation-retention.architecture.spec.ts` | Exact 365-day nonrenewal/dependency cap, fenced AC6 deletion, source cleanup not blocked, no source/A29/AE/consent deletion, no raw data in manifest/audit. Q21. |
| `valuation-consumers.architecture.spec.ts` | Manager finance denied; Staff scope; safe bounded AI/audit/download; no mass contact export; L01–L08 callers cannot reach a parallel scorer; no C9 strategy/C10 execution leakage. Q20,22–24. |

Package synthetic acceptance must additionally cover same frozen intent dedup, changed evidence next revision, concurrent admission/publication, crash/restart, expired lease fence, latest-unavailable not older-success fallback, policy revocation, model/evaluation expiry, unknown source, no independent-data claims from duplicate samples, and four vertical/provider fixtures. Each target requires both qualified labelled fixture and honest unavailability cases, plus the approved real-data gate when enabled.

**Numeric production proof:** structural/read-only only. No real booking/provider/consent/message/Client/finance/campaign mutations for proof. Existing inherited C6/C7 guards remain required. Full C8 completion uses the exact inherited S01–S32 manifest, 24 Qs/6 packages/4 waves; no new unrestricted inventory. Retired Python/PWA/relay paths protected by existing and new consumer guards. Backend/PWA release preserves maintenance/backups and finite R01 coverage contract.

## 15. Status and handoff

```text
OWNER DECISIONS APPROVED: 16/16
Q01–Q24 MAPPING COMPLETE: YES
EXISTING FOUNDATIONS REUSED: 24
NEW MODELS: 3 (PROPOSED)
ALTERED MODELS: 2 (PROPOSED; 1 RELATION-ONLY + 1 CHECK-ONLY)
NEW PHYSICAL FIELDS: 94 (PROPOSED)
NEW DATABASE ENUMS: 0
NEW UNIQUE CONSTRAINTS: 10 (PLUS 3 PRIMARY KEYS)
NEW CHECK CONSTRAINTS: 24 (PLUS 1 EXISTING CHECK EXTENSION)
NEW FOREIGN KEYS: 3
NEW ORDINARY INDEXES: 10
NEW ACTION CLASSES: 0
NEW AC6 CLASSES: 3 (PROPOSED)
MIGRATIONS EXPECTED: 1 (PROPOSED)
BACKFILLS: 0
PROBABILISTIC TARGET FAMILIES: 8
EVALUATION SEMANTIC MAPPINGS: 8/8
EVALUATION CONTRACTS DEFINED: 0/8 (NUMERIC CRITERIA NOT FROZEN)
LEGACY FOUNDATIONS MAPPED: 8/8
P01–P06 COVERED: 6/6
IMPLEMENTATION WAVES: 4
C8 SCHEMA/MODEL/EVALUATION ENVELOPE READY FOR APPROVAL: NO
OPEN NARROW DECISION: E01 — NUMERIC EVALUATION EVIDENCE/BUDGET BASIS
RUNTIME/SCHEMA/MIGRATION CHANGES THIS STEP: 0
PRODUCTION MUTATIONS: 0
CHAPTER 8 IMPLEMENTATION STARTED: NO
PROCESS HYGIENE: 0
```

This STOP is exactly the numeric-evaluation exception requested by the owner, not an infrastructure/security discovery or a reversal of D13. The structural mapping remains one proposed envelope. E01 A is recommended; do not implement or activate on this report alone. Documentation verification/source hashes/hygiene are recorded alongside it. No runtime regression, build or DB proof is claimed rerun for this documentation-only step. Production certification remains the prior preflight's evidence, not a new live certification in this cycle. Commit/push the mapping/evidence and verify canonical HEAD=origin, then STOP.
