# Chapter 7 — combined schema/action mapping

Status: **proposal ready for one schema/action approval; implementation not authorized and not started.**

The owner has approved **D01–D13 Option A**, including D10's 365 days for **new derived artifacts only** and D13's qualified measurement / broader bridge credential migration before L3. The original [Decision Pack](CYCLE-07-OWNER-DECISION-PACK.md) remains an immutable preflight record; its historical `PENDING` labels are superseded by the [approval receipt](evidence/chapter7-schema-mapping/owner-approval.json), not silently rewritten.

Baseline inspected: `4d6283871a7abf9d827b9b1262cc1e8ef4e21506`, isolated `/tmp/maya-b29-contour`, branch `contour/b29-remediation`, tracking `origin/codex/maya-brain-systemic-release-20260815`. Fetch completed; entry HEAD = canonical origin; no late upstream commits at entry; worktree was clean. C6 remains complete. The certified production release recorded by the preceding preflight is `20260908-p5-rc-8bc03454`; this documentation step neither deploys nor re-certifies production by mutating it.

## 1. Proposed envelope and counting convention

**One new shared model: `MeasurementRevision`, 37 physical fields. Eight existing Prisma models gain inverse relations only: zero new physical fields on existing tables. Zero new Action Engine business classes; one AC6 class; one additive migration; zero backfills.**

`MeasurementRevision` is a durable derived measurement, not a new booking, attribution-assignment, consent, delivery, finance, payroll, review or configuration owner. P02/P03/P04/P05 use the same row and typed payload contracts. No separate period, evidence, result-head, reputation, salary, goal, report-publication or measurement-job model is needed.

The current result is selected from published revisions of the same canonical logical identity. The as-reported result is an exact immutable revision ID/hash. Neither requires a second table or mutable payload. The existing source fact remains with its existing owner.

| Envelope item | Exact proposed count |
| --- | ---: |
| New models | 1 |
| Altered existing Prisma models | 8 — inverse relations only |
| Physically altered existing tables/columns | 0 |
| New physical fields | 37 |
| New Prisma/PostgreSQL enums / existing enum values | 0 / 0 |
| New business Action Engine classes | 0 |
| New AC6 classes | 1 |
| Migrations | 1 |
| Backfills | 0 |
| Primary keys / other unique constraints or indexes | 1 / 4 |
| Foreign keys / named CHECK groups / secondary indexes | 8 / 16 / 6 |
| Trigger functions / triggers | 4 / 4 |
| SQL views / extra sequences / materialized views | 0 / 0 / 0 |

Counts exclude virtual Prisma relation fields and nested JSON keys from **physical fields**. Nested JSON is nevertheless a closed, versioned contract, specified below; it is not permission to add arbitrary business fields later. New class count excludes read methods, measurement kinds, rule identifiers and AC6 identifiers. The one AC6 class is reported separately, not hidden in a zero-all-actions claim.

[Machine-readable envelope](evidence/chapter7-schema-mapping/proposed-envelope.json) and [actual schema inventory](evidence/chapter7-schema-mapping/existing-schema-inventory.json) are part of this proposal. PostgreSQL/migration/runtime proof is **not performed in this step** and must precede later acceptance.

## 2. Existing owners and exact reusable storage

Twenty reusable capability entries retain their preflight meaning: **9 EXISTS + 11 PARTIAL**. This counts capabilities, not tables; the [inventory](evidence/chapter7-schema-mapping/reused-foundations.json) preserves all F identifiers and limitations. Thirty-five relevant existing models were inspected. Three missing measurement capabilities are filled by the one shared model plus deterministic package rules, not three new source owners.

| Existing foundation | Exact storage / runtime evidence | Reuse and limit |
| --- | --- | --- |
| Canonical Client | `Client.id/tenantId`; `CrmClientLink.clientId/provider/externalId/unlinkedAt`; `ClientChannelLink.clientId/tenantId/verifiedAt/revokedAt` | Exact tenant-qualified identity. No `Client.userId`, phone, Profile, raw Telegram ID or bridge slug authority. Client without Maya User remains supported. |
| Appointment / attendance | `Appointment.mayaClientId/tenantId/status/attendance/startAt/endAt/totalPriceKopecks/currency`; unique `(id,tenantId,mayaClientId)` | Source facts and exact ownership; payment, attendance and cancellation remain separate. Deletion evidence must come from the owner, not a missing-row guess. |
| Opportunity / task | `Opportunity.identityFingerprint/revision/evidenceRefsJson/evidenceFingerprint/expiresAt`; `AgentTask.opportunityId/semanticKey/taskFingerprint/status` | Immutable opportunity/capacity references and proposal denominators. No Opportunity history fabricated for old bookings. |
| Action execution / effect receipt | `ActionExecution.identityFingerprint/normalizedInputHash/normalizedInputEncrypted/agentTaskId/state/reconciliationState`; `ActionAttempt.actionExecutionId/externalDispatchState/outcomeCode/providerReferenceHash`; `ActionTargetMutation.targetRef/targetGeneration/afterStateHash` | Existing actions and receipt evidence. Success alone does not prove money or causality. Measurement creates no execution or retry. |
| A29 / A31 | `RecoveryTouchpoint.externalEventId/subjectRef/occurredAt/attributionWindowDays`; `RecoveryConversion.touchpointId/externalBookingRef/status/confirmedRevenueKopecks`; `DomainEvent` | Preserve frozen assignment and approved corrections. These HMAC/provider references alone do not establish Client/action lineage. `filledWindow` alone is insufficient. |
| Communication Delivery / B35 | `MarketingCampaign.actionExecutionId/aggregateState`; `MarketingCampaignRecipient.clientId/deliveryState/reconciliationState`; `MarketingDeliveryAttempt.externalDispatchState/outcomeCode` | Admit/attempt/accept/deliver/read/outcome are distinct measured stages. No campaign, recipient or provider operation created by measurement. |
| Financial facts / BusinessState | `CrmFinancialSummary.revenue.basis/discarded/staff_attribution_status/service_attribution_status`; `payroll.status/verified/accrued_total/paid_total`; `BusinessStateService`; CRM read contracts | Runtime DTOs, **not existing database models**. Preserve basis, qualification and coverage. Current positive cash summary does not prove complete refunds or net profit. |
| P407 expenses | `Expense.id/tenantId/source/externalId/category/currency/amountKopecks`; `ExpensePeriodDeclaration.declarationEpoch`; `ExpensePeriodDeclarationInvalidation` | Existing raw category is already a String; reader must preserve it. No new raw-category column, fuzzy overlap merge or importer writer. |
| A22 finance configuration | `DashboardPreference.userId/tenantId/section/configJson`; successful A22 `ActionExecution` + `ActionTargetMutation.targetGeneration/afterStateHash` | This is the actual `finance_preferences` owner. Do not substitute `TenantBusinessConfigurationRevision` merely because its name looks suitable. Unproved historical configuration lacks fabricated revision lineage. |
| Other A22 revisions | `TenantBusinessConfigurationRevision.namespace/revision/previousRevision/actionExecutionId/contentHash` | Existing governed configuration only. No change to personal-vs-tenant sharing or revenue-vs-salary semantics. |
| Staff / branch / access | `Staff.id/tenantId/branchId/userId`; `Branch.timezone`; `Membership.userId/tenantId/role`; `CrmStaffAccess` runtime resolver | Exact existing entitlements. A configuration owner User is not Client ownership authority. |
| P4 value | `LoyaltyAccount.clientId/balance`; `LoyaltyTransaction.accountId/actionExecutionId/delta/balanceAfter`; `GiftCertificate` and approved value owners | Read comparable ledger/card evidence, report discrepancy; no mint/correction/settlement or reconstructed ledger. |
| Review / feedback | `BusinessReview.source/rating/occurredAt/branchId`; `NativeFeedbackRequest.clientId/appointmentId/latestResponseVersion`; `NativeFeedbackRevision.version/kind/rating` | Immutable AC4 accepted review facts and R08 revisions remain source owners. Native withdrawal changes current measurement, not old snapshots. Anonymous community stays separate. |
| Domain events / reconciliation | `DomainEvent.dedupFingerprint/occurredAt/receivedAt/payload`; `ReconciliationRun.completeness/truncationReason` | Qualified source checkpoints. Do not take over C5 event processing fields or reuse CRM scan leases as a measurement queue. |
| Audit | `AuditLog.scope/tenantId/action/entityType/entityId/createdAt/metadataJson` | Existing writer; bounded safe tenant read. Arbitrary metadata and platform rows are not C7 exports. |
| Owner report | `OwnerReportRun.intentHash/intentEncrypted/admittedAt/expiresAt`; immutable plan content and `OwnerReportStore.snapshot` | Can pin revision ID/hash and safe as-reported values in the existing plan. Its intent/delivery/retention contract is not a generic 365-day measurement store. |
| AC6 | `MaintenanceRun.runIdentityFingerprint/maintenanceKind/policyKey/policyVersion/lease*`; `MaintenanceItemClaim.itemKind/itemRefHash/claimGeneration` | Existing durable cleanup coordinator, bounded claims and audit. One new retention target; no separate cleanup worker/owner. |
| Bridge | `BridgeSourceService`, server integration binding, exact existing CRM/AE evidence | Global secret/body/slug alone stays uncredited. No new bridge credentials, signing schema or legacy binding backfill. |

Exact model declarations, constraints and source hashes are recorded in evidence. Runtime anchors include `src/package5-wave1/package5-wave1.service.ts` (A22 finance), `src/package5-wave5/package5-wave5.service.ts` (A29/A31), `src/expenses/expense-period.reader.ts`, `src/business-state/business-state.service.ts`, `src/owner-reports/owner-report.store.ts` and `src/package5-wave6/` under `maya-saas-backend/`.

## 3. Q01–Q22 requirement mapping

`SUFFICIENT` here asks whether the **existing storage and source owner** can represent the requirement without another source model. YES still requires the described C7 read/rule/remediation work; it is not current C7 acceptance. NO identifies the missing shared derived durability, not permission to reopen source contracts.

| Requirement | Package | Existing owner / model.field | Sufficient | Exact gap | Proposed reuse / delta |
| --- | --- | --- | --- | --- | --- |
| Q01 common measured envelope | P01 | BusinessState / financial DTO basis, coverage; Appointment amounts | NO | No durable rule/evidence/basis/asOf revision | Shared `MeasurementRevision`, typed metric envelope |
| Q02 exact Client/action lineage | P01 | A18 Client + CrmClientLink; Opportunity; AE input hash / AgentTask; CD recipient | NO | No qualified derived chain connecting these refs | Shared row Client/Appointment FKs + typed source qualification; no new binding |
| Q03 attendance vs booking/payment | P01 | Appointment.status/attendance; attendance/recency reader | YES | Current consumers conflate states | Separate named outcome dimensions in shared values; no Appointment field |
| Q04 later reversal vs historical report | P03 | A29 RecoveryConversion; DomainEvent; OwnerReportRun plan | NO | Source assignment is not versioned current measured result | Append a revision; current selector advances; old report pins old ID/hash |
| Q05 financial truth / refund support | P02 | CrmFinancialSummary; BusinessState; normalized DomainEvent payload | YES | Coverage/discriminator limits lost in output | Qualified read receipts and explicit unavailable refund/net; no speculative fiscal writer |
| Q06 expense overlap/raw labels | P02 | P407 Expense.source/externalId/category/currency | YES | Reader drops raw label; overlap not qualified | Read exact existing fields; evidence linkage only, separate ambiguous totals |
| Q07 comparable periods | P02 | BusinessState ranges/timezone; Branch.timezone | YES | Comparable bounds/basis/completeness not shared | Shared period fields + deterministic comparator; no period model |
| Q08 actual accrued salary | P04 | CrmFinancialSummary.payroll; Staff | YES | Frozen/nested consumer and 0.5 heuristic | Read confirmed accrual or NOT_MEASURED; shared monetary metric |
| Q09 exact personal goal progress | P04 | A22 DashboardPreference.configJson + ActionTargetMutation | YES | Need measured plan/fact and configuration generation evidence | configurationUserId + Staff + typed A22 refs; no salary/goal writer |
| Q10 reputation facts | P05 | BusinessReview; NativeFeedbackRequest/Revision | YES | Source/scale/local-period denominator aggregation absent | Shared reputation kind, source-separated metrics; no reputation score/model |
| Q11 value discrepancy | P02 | P4 LoyaltyAccount/Transaction and provider-card read | YES | Comparable/asOf discrepancy disclosure | Shared values with source/basis; no value correction |
| Q12 attributable outcome | P03 | A29 assignment; AE/Attempt; Appointment/Client | NO | No immutable qualified measurement with single outcome credit | Shared appointment outcome identity; exact credited execution/attempt; ambiguity uncredited |
| Q13 filled capacity | P03 | Opportunity.evidenceRefsJson; Appointment | YES | Boolean flag cannot prove original capacity and resulting visit | Exact capacity/opportunity + outcome evidence; unavailable when absent |
| Q14 delivery funnel | P03 | Campaign/Recipient/DeliveryAttempt states and reconciliation | YES | Stage evidence and denominators need deterministic read | Shared execution_funnel metrics; unsupported read receipt = unknown |
| Q15 proposal/action funnel | P03 | Opportunity/AgentTask/ActionExecution/Attempt | YES | Approval, denial, UNKNOWN, success conflated | Distinct per-stage entities/time bounds; no new action |
| Q16 common HTTP/PWA/AI/report facts | P06 | BusinessState/AI policy/OwnerReportRun | YES | Duplicated consumer arithmetic | One measurement reader/presenter; pinned admitted report snapshot |
| Q17 access/retention/privacy | P01 + P06 | TenantContext/Membership/Staff/A18/AuditLog/AC6 | NO | New derived rows need exact retention and safe projection | Same entitlement resolvers; row scope/FKs; one AC6 class; no export |
| Q18 durable retry/restart | P01 | Existing AE principles; source dedup, but no measurement receipt | NO | AE booking identity cannot be repurposed for pure measurement | Shared PENDING/PUBLISHED row, key/intent, fenced claim, immutable publication |
| Q19 permanent guards | P06 | Existing C6 mandatory ratchets / 32-surface manifest | YES | C7 owner/consumer rules need wiring and tests | Extend existing mandatory gates, no schema |
| Q20 finite acceptance/cutover | P06 | Existing release/schema process; Q/package manifests | YES | C7 proofs not executed yet | 22/22 Q, 6/6 packages, inherited 32/32 controls; coordinated cutover |
| Q21 tenant audit read | P06 | AuditLog.scope/tenantId + existing indexes | YES | Safe bounded owner API absent | Read only, role/tenant predicate and allowlist; no audit model/field |
| Q22 bridge qualification | P01 | BridgeSource integration guard; AE/Client/CRM refs | YES | Legacy observation does not prove action lineage | Credit only independently bound evidence; raw bridge observations labelled/uncredited |

Every Q retains the original [preflight acceptance](CYCLE-07-PREFLIGHT-AND-SCOPE.md). No Q is deferred by this mapping. Source limitation is exposed as the approved unknown/unavailable result, not filled by an invented schema fact.

## 4. Exact model: MeasurementRevision

All 37 fields are **derived evidence or coordination metadata**, never a canonical source fact. All inherit the row's AC6 policy: 365 days from its own `admittedAt`; retry cannot extend it. Later explicitly admitted revisions have their own admission/expiry and never extend earlier rows. No parent record is retained indefinitely merely to keep a current pointer.

| # | Physical field | Prisma / PostgreSQL type | Exact meaning |
| --- | --- | --- | --- |
| 1 | `id` | `String @db.Uuid` | UUID, stable revision receipt; generated once at admission |
| 2 | `tenantId` | `String` | Exact trusted tenant; immutable |
| 3 | `kind` | `String` | One of seven measurement families; immutable |
| 4 | `identityHash` | `String @db.Char(64)` | Versioned canonical logical subject/scope identity; immutable |
| 5 | `revision` | `Int` | Monotonic generation among retained revisions of this identity; immutable |
| 6 | `requestKeyHash` | `String @db.Char(64)` | Tenant-qualified durable producer occurrence/retry identity; immutable |
| 7 | `intentHash` | `String @db.Char(64)` | Normalized admitted request fingerprint; same key changed intent conflicts |
| 8 | `ruleKey` | `String` | Compiled deterministic rule identifier; immutable |
| 9 | `ruleVersion` | `Int` | Positive immutable rule version |
| 10 | `clientId` | `String?` | Exact canonical Client when applicable; never User/phone |
| 11 | `appointmentId` | `String?` | Exact canonical Appointment; requires clientId |
| 12 | `staffId` | `String?` | Exact canonical Staff scope when applicable |
| 13 | `branchId` | `String?` | Exact single-branch scope where applicable |
| 14 | `configurationUserId` | `String?` | A22 personal configuration owner via Membership, not Client authority |
| 15 | `periodFrom` | `DateTime @db.Timestamptz(3)` | Inclusive UTC instant resolved from tenant-local bounds |
| 16 | `periodTo` | `DateTime @db.Timestamptz(3)` | Exclusive UTC instant |
| 17 | `timezone` | `String` | Validated canonical IANA zone used to resolve local bounds |
| 18 | `scopeJson` | `Json` | Strict minimal dimension/authorization/source-query scope, no contacts |
| 19 | `asOf` | `DateTime @db.Timestamptz(3)` | Immutable business cutoff; source observation time separately in evidence |
| 20 | `admittedAt` | `DateTime @db.Timestamptz(3)` | Server first admission time; retry never replaces |
| 21 | `expiresAt` | `DateTime @db.Timestamptz(3)` | Exactly admittedAt + 31536000 seconds |
| 22 | `state` | `String` | PENDING or PUBLISHED; one-way publication |
| 23 | `leaseGeneration` | `Int` | Fencing counter, default 0; only PENDING coordination |
| 24 | `leaseTokenHash` | `String? @db.Char(64)` | Hash of current computation claim, not transport identity |
| 25 | `leaseExpiresAt` | `DateTime? @db.Timestamptz(3)` | Claim deadline bounded by expiresAt |
| 26 | `publishedAt` | `DateTime? @db.Timestamptz(3)` | Set once on publication |
| 27 | `contractVersion` | `Int` | Payload normalization/schema version, initially 1 |
| 28 | `evidenceHash` | `String? @db.Char(64)` | Canonical normalized evidence set digest, set on publication |
| 29 | `snapshotHash` | `String? @db.Char(64)` | Canonical published envelope digest, set on publication |
| 30 | `completeness` | `String?` | COMPLETE/PARTIAL/UNAVAILABLE/NOT_MEASURED; per-metric details also required |
| 31 | `qualification` | `String?` | VERIFIED/SOURCE_LABELLED/UNQUALIFIED; weakest dependency at envelope level |
| 32 | `evidenceRefsJson` | `Json?` | Typed bounded source/reader receipts; immutable after publication |
| 33 | `valuesJson` | `Json?` | Allowlisted measured values, units, basis, currency and evidence refs |
| 34 | `limitationsJson` | `Json?` | Typed reason codes/coverage; no arbitrary message/provider text |
| 35 | `attributionStatus` | `String?` | NOT_APPLICABLE/UNATTRIBUTED/AMBIGUOUS/ATTRIBUTED |
| 36 | `creditedExecutionId` | `String?` | Existing same-tenant ActionExecution; only unique proved appointment attribution |
| 37 | `creditedAttemptId` | `String?` | Existing same-tenant effect receipt attempt belonging to creditedExecutionId |

Eight virtual inverse relations are added, one on each of `Tenant`, `Client`, `Appointment`, `Staff`, `Branch`, `Membership`, `ActionExecution`, `ActionAttempt`. They point to `MeasurementRevision[]`; no existing field is retyped, renamed, made nullable or given a new default. `Membership` is referenced through existing `(userId,tenantId)`. Existing source uniqueness is sufficient; no extra unique index is added to a source table.

### Kinds, deterministic contracts and JSON shapes

Seven closed String values (no new enum): `appointment_outcome`, `client_history`, `business_period`, `staff_goal`, `reputation_period`, `execution_funnel`, `value_discrepancy`. Rule keys are respectively `c7.appointment-outcome`, `c7.client-history`, `c7.business-period`, `c7.staff-goal`, `c7.reputation-period`, `c7.execution-funnel`, `c7.value-discrepancy`, all initially version 1. Versions are code-reviewed deterministic contracts, not owner-editable formulas or LLM output.

- `scopeJson`: version, existing entitlement capability key, sorted permitted branch IDs where multi-branch is allowed, explicit service/source/account dimension keys where required, and normalized read-window/query descriptors. Staff/configuration/Client IDs use the physical columns when applicable. No arbitrary SQL, contacts, message body, provider payload, credentials or free-text policy. Empty/tenant-wide scope cannot be substituted for missing authority. Stored scope describes the admitted facts; **current authorization is always rechecked**.
- `evidenceRefsJson`: `{version, sources:[...], dependencies:[...]}`. A source ref has an allowlisted owner/kind, exact tenant, opaque canonical row ID or qualified provider-query identity, source version/generation or normalized state hash, `occurredAt` where proved, `observedAt`, coverage, qualification, and minimal verified binding references. Dependencies pin another published measurement by ID/identityHash/snapshotHash/asOf/expiry; no cascading FK to a shorter-lived derived artifact. The consumer stores its own necessary measured values, not an entire dependency snapshot.
- Allowed source families: Client/CRM/channel binding; Appointment/DomainEvent; Opportunity/AgentTask; ActionExecution/Attempt/TargetMutation; CD campaign/recipient/attempt; A29/A31 facts; canonical expense/declaration evidence; P4 value; A22 configuration; Review/NativeFeedback; qualified read receipts from existing financial/attendance/reputation readers. Unknown kinds fail validation. A tenant ID in JSON is not proof by itself.
- `valuesJson`: `{version, metrics:[...]}`. Each metric has `key`, exact dimensions, `unit`, `basis`, `currency` or explicit null for non-money, `state`, `value` or null, source-reference indexes, coverage/denominator where applicable. Money uses signed base-unit integer decimal strings; no floating-point amounts, NaN, implicit RUB or FX. Ratios retain numerator/denominator and deterministic rounding rule. Separate currency/basis groups cannot be summed.
- `limitationsJson`: bounded allowlisted reason codes and qualified coverage bounds, not arbitrary provider/LLM text. Examples are missing refund coverage, unmatched source lineage, incomplete period, source unavailable, no target, no payroll source, ambiguous attribution and expired dependency.

Per-row bound: 256 KiB for all three published JSON payloads combined; at most 1,000 source/dependency refs and 256 metric entries. These are technical bounds, not permission to truncate and label COMPLETE. Larger source sets use existing bounded reader pages / normalized aggregate receipts with coverage/count/state digest, not copied Client histories. If exact lineage cannot be represented or proved, the relevant metric is unavailable/uncredited. No per-currency/per-period child model is introduced to evade the shared contract.

`CrmFinancialSummary` is transient. A durable reader receipt can preserve **its actually observed, normalized measured values**, reader/version, exact server-bound integration and query, coverage and digest. This is a derived snapshot, not a new bank/refund/source ledger and not independent causal proof. A reader receipt cannot upgrade provider/global-token-only data to VERIFIED action attribution. Unproved refunds remain unknown. No raw provider response is retained.

### Fingerprints — exact normalization boundary

Use a dedicated `c7.measurement/1` normalization contract following existing deterministic fingerprint conventions. Do **not** blindly call `canonicalStateFingerprint` on arbitrary JSON: its generic array sorting/null folding has different semantics. Define fixed typed fields, validate before hashing, sort only sets, preserve ordered evidence relationships, resolve timestamps to UTC milliseconds, normalize timezone/dimensions, use integer-string money, distinguish unavailable/null from zero, and reject unknown keys. SHA-256 of the specified normalized UTF-8 tuple is the digest; raw request JSON is not the contract.

1. `identityHash`: tenant + kind + canonical subject + stable measurement dimensions. For `appointment_outcome` the identity is **only the exact tenant + canonical Appointment under this identity version**; rule, period, currency, channel, source trigger and action do not make a second outcome identity. The exact canonical Client remains mandatory in the FK and immutable intent, but does not split one Appointment into two credit identities after an authorized source correction. Other kinds include their exact Client/Staff/configuration owner, period, timezone and declared dimension scope as appropriate. Rule version is excluded so a new calculation does not create a competing current outcome.
2. `requestKeyHash`: tenant + trusted producer namespace + durable occurrence/event identity. Source event ID, an already-defined report intent identity or the explicit admitted measurement request identity may be used. A busy/not-admitted request is not acknowledged as a durable accepted measurement; its existing producer keeps the original occurrence for retry. C7 does not claim a new lossless event-subscription/checkpoint owner or a snapshot for every source event. Different triggers may refresh the same logical identity; replay of one trigger uses the same key. Network request ID, random-on-retry key, timestamp alone and state tuple alone are not durable occurrence identity.
3. `intentHash`: identity + rule key/version + contract version + exact resolved period/timezone + normalized scope + immutable asOf + producer occurrence. Client-supplied transport metadata is excluded. Server defaults are resolved once on first admission; retries read them from the original receipt, not from a new clock sample.
4. `evidenceHash`: sorted typed evidence/dependency set, qualification and coverage. A missing or changed source is not silently replaced with different evidence under a published receipt.
5. `snapshotHash`: normalized immutable intent metadata + asOf + observed evidence/hash + values + limitations + attribution status/credited refs. Lease tokens, publication transport IDs and retry count do not affect the measured result.

## 5. Source fact, current result, historical report

| Concept | Representation | Mutation/lifetime |
| --- | --- | --- |
| Source fact / A29 assignment | Existing source model, source event or qualified reader observation | Only existing source owner; its own retention/window/UNKNOWN rules |
| Current measured result | Latest published, nonexpired `MeasurementRevision` for canonical identity | Deterministic read selection; no separate mutable result payload |
| As-reported measurement | Exact published revision ID/hash | Immutable until its own expiry; never substituted by current |
| Existing delivered/downloadable report | Existing OwnerReportRun immutable plan pins revision refs and necessary safe values | Existing A12 admission/authority/order/expiry/retention; no new report class |

Current selection uses maximum **admission revision**, not last update or last network response. Admission serializes an identity, allocates the next retained generation and allows one PENDING row at a time. No generation is promised across a period in which all C7 artifacts were lawfully purged; receipt UUID/hash remains the historical address. A fresh materialization is not fabricated historical continuity.

While a refresh is pending, the prior published revision can be shown only with its original asOf and refresh limitation. A later published UNAVAILABLE/UNQUALIFIED result supersedes the earlier success in current output; the reader must not filter it away and fall back to a flattering older result. Expired latest results do not revive older expired ones. A late authoritative cancellation/refund creates a new revision using fresh observation time, even if its effective date precedes the prior report; old values and A29 assignment remain immutable.

**One outcome, maximum one credit:** the sole per-Appointment logical identity above is selected once before aggregation; at most one credited execution/attempt pair is present in that current revision. Every monetary/capacity aggregate deduplicates by this same canonical outcome identity. Historical reports and different report periods are snapshots, never additive credit ledgers. A second materialization after retention cannot mint another business credit, booking or A29 assignment. A29 assignment/window remains authoritative. Two competing proved candidates without a unique link produce AMBIGUOUS with no credited pair, never last-touch guessing.

Do not resurrect an expired revision on retry: an expired/missing original receipt returns the existing equivalent of expired/not-found; it cannot fall through to fresh admission. There is no promise of an eternal C7 idempotency tombstone beyond 365 days. A genuinely new measurement request can read retained canonical sources prospectively and must still obey the single-outcome aggregation rule; this does not backfill source lineage or revive old snapshots.

## 6. Durable admission, publication, retries and concurrency

Measurement is deterministic derived-state work, not an Action Engine business action. The **one canonical measurement service** admits/publishes this model. Existing HTTP/PWA/AI read projections do not call Prisma writers or business executors. A durable report/source-consumer path may request measurement admission before freezing an existing report; it never schedules delivery by itself. Pure reads can return the same typed live projection or an already-published revision without persistence. Cross-surface equality for an as-reported result requires the same pinned revision ID/hash. A fresh live read carries its actual observation time; reusing an asOf label alone cannot claim snapshot equality when the source lacks historical reads. No per-package publisher is allowed. The appointment outcome calculation has one fixed source/metric contract; a caller's weaker read permissions must not replace it with a competing identity or a caller-specific current result. Produce under the trusted source scope; project/redact under current caller permissions.

1. Authenticate/resolve exact tenant and source/subject access through current owners. Normalize intent and durable occurrence. Denial creates no measurement row, AE, Client, binding or delivery.
2. In a short DB transaction take an advisory lock on tenant + logical identity. Look up the request key first. Same key/same intent returns the same receipt; changed intent conflicts. Another PENDING request returns pending/busy without creating a second pending row. A new accepted request allocates the next generation and inserts PENDING, with fixed asOf/admittedAt/expiresAt. Unique constraints cover cross-process races; an advisory hash collision only serializes unrelated work, never mixes identities.
3. Claim PENDING using generation/token/expiry CAS. Read only permitted sources, outside the DB transaction if remote reads are needed. Do not consume/overwrite `DomainEvent.processedAt/status/leaseUntil` or a CRM `ReconciliationRun` to implement this claim.
4. On resume recheck current authority and source eligibility. Preserve admitted intent/rule/asOf. A pending read may collect new observation evidence with its real observedAt; it must not pretend that a non-temporal source was frozen before the crash. Publish partial/unavailable or explicitly observed-as-of limitations where historic reconstruction is impossible.
5. Publication requires the same live fencing generation/token, unexpired revision and current policy. Validate source/Client/tenant/attempt associations. Atomically set hashes/payload/outcome and PUBLISHED; clear lease fields; set publishedAt once. A lost/stale claimant cannot publish. A crash before this commit leaves PENDING; a crash after it returns the exact same published outcome on retry.
6. Once published, all row fields are immutable. A deterministic measurement error/unsupported source is an explicit unavailable result with safe reasons, not a fabricated zero. Infrastructure failures before publication can retry the same pending receipt/claim. No new source effect is ever retried by measurement.

UNKNOWN action/CD evidence remains UNKNOWN. Neither measurement refresh nor an ALLOW policy evaluation permits a new provider attempt, channel, recipient or action identity. Completed effects are only read. Source policy/consent/access revocation before a still-pending read is rechecked; historical allowed evidence grants no permanent read access.

## 7. Exact database constraints and indexes to implement after approval

All source FK actions are **ON DELETE RESTRICT / ON UPDATE RESTRICT**; nullable fields use MATCH SIMPLE plus explicit semantic CHECKs. No C7 deletion can cascade to any source. Table/column naming follows existing Prisma conventions.

**Primary / unique:**

| Name | Columns / predicate |
| --- | --- |
| `MeasurementRevision_pkey` | PK `(id)` |
| `C7_measurement_id_tenant_uq` | UNIQUE `(id,tenantId)` |
| `C7_measurement_generation_uq` | UNIQUE `(tenantId,identityHash,revision)` |
| `C7_measurement_request_uq` | UNIQUE `(tenantId,requestKeyHash)` |
| `C7_measurement_pending_uq` | UNIQUE INDEX `(tenantId,identityHash)` WHERE `state='PENDING'` |

**Eight FKs:** `C7_measurement_tenant_fk` tenantId → Tenant.id; `C7_measurement_client_fk` (clientId,tenantId) → Client(id,tenantId); `C7_measurement_appointment_fk` (appointmentId,tenantId,clientId) → Appointment(id,tenantId,mayaClientId); `C7_measurement_staff_fk` (staffId,tenantId) → Staff(id,tenantId); `C7_measurement_branch_fk` (branchId,tenantId) → Branch(id,tenantId); `C7_measurement_config_owner_fk` (configurationUserId,tenantId) → Membership(userId,tenantId); `C7_measurement_execution_fk` (creditedExecutionId,tenantId) → ActionExecution(id,tenantId); `C7_measurement_attempt_fk` (creditedAttemptId,tenantId) → ActionAttempt(id,tenantId).

The attempt FK alone does not prove it belongs to the credited execution: the publication trigger and owner validation must check `ActionAttempt.actionExecutionId = creditedExecutionId`. Exact receipt-target/Client/Opportunity/CD lineage must also be verified; encrypted execution inputs require the existing trusted decoder, not a SQL guess. Typed JSON references are **not falsely claimed to be FKs**: admission validates their current canonical ownership/version/hash; published refs preserve observed evidence even when a source payload later expires. Their presence alone cannot yield credit.

| Named CHECK | Exact constraint group |
| --- | --- |
| `C7_measurement_kind_ck` | Seven kinds only |
| `C7_measurement_hashes_ck` | Required hashes lowercase 64 hex; nullable hashes same format when present |
| `C7_measurement_versions_ck` | revision/ruleVersion/contractVersion positive; leaseGeneration >= 0 |
| `C7_measurement_rule_ck` | Kind maps to the exact initial rule key; positive version; runtime rejects unregistered versions |
| `C7_measurement_period_ck` | periodFrom < periodTo; asOf <= admittedAt |
| `C7_measurement_timezone_ck` | Nonempty bounded timezone identifier; runtime validates actual IANA resolution |
| `C7_measurement_retention_ck` | expiresAt = admittedAt + 31536000 seconds |
| `C7_measurement_state_ck` | PENDING or PUBLISHED |
| `C7_measurement_lease_ck` | Token/deadline both null or both set; active deadline <= expiresAt; PUBLISHED lease pair null |
| `C7_measurement_publication_ck` | PENDING has no publication/payload/hash/result fields; PUBLISHED has all required publication/result fields and admittedAt <= publishedAt < expiresAt |
| `C7_measurement_completeness_ck` | Null only before publication; COMPLETE/PARTIAL/UNAVAILABLE/NOT_MEASURED |
| `C7_measurement_qualification_ck` | Null only before publication; VERIFIED/SOURCE_LABELLED/UNQUALIFIED |
| `C7_measurement_attribution_ck` | Null only PENDING; four statuses; credited refs both null or both present; refs present iff ATTRIBUTED; only appointment_outcome + VERIFIED may be ATTRIBUTED |
| `C7_measurement_subject_ck` | appointmentId requires clientId; appointment_outcome requires both; client_history requires Client; staff_goal requires Staff and configurationUserId; no implicit Client from User |
| `C7_measurement_json_ck` | scope object; published three payload objects of version 1 with correct top-level members/types; no arbitrary root keys |
| `C7_measurement_bounds_ck` | Bounded strings/scope and JSON payload bytes/ref/metric counts as specified; nonempty source descriptors |

SQL CHECKs enforce structure, not remote provider truth. Recursive metric/ref allowlists and exact scope ownership are validated by the sole publisher and guarded against bypass. Integration proof must demonstrate malformed cross-tenant references cannot publish; do not advertise a JSON shape check as provenance proof.

**Six secondary indexes:** `C7_measurement_period_idx` (tenantId,kind,periodFrom,periodTo); `C7_measurement_client_idx` (tenantId,clientId,kind,asOf); `C7_measurement_staff_idx` (tenantId,staffId,kind,asOf); `C7_measurement_expiry_idx` (expiresAt,id); `C7_measurement_execution_idx` (tenantId,creditedExecutionId); `C7_measurement_attempt_idx` (tenantId,creditedAttemptId). Existing generation unique index supports current selection. No JSON GIN index or generic payload query API is needed.

**Four trigger functions, one trigger each:**

1. `C7_measurement_admission_guard` / `_trg`, BEFORE INSERT: require PENDING, empty result/claim, server admission/deadline, registered identity/rule normalization, valid subject/tenant relationships, serialized monotonic generation. It verifies same-tenant scoped configuration/branch refs. Remote truth is checked by the publisher, not manufactured here.
2. `C7_measurement_publication_guard` / `_trg`, BEFORE UPDATE: immutable admitted columns; only fenced pending lease transitions or one pending→published transition; prove canonical candidate refs/attempt membership; preserve current head ordering. Any update after PUBLISHED fails, including retention extension.
3. `C7_measurement_delete_guard` / `_trg`, BEFORE DELETE: permit only expired derived rows under an exact live AC6 MaintenanceRun/ItemClaim for this policy, matched row/intent/snapshot digest and expiry. A bare maintenance script/SQL delete fails. It does not acquire or mutate source authority.
4. `C7_measurement_truncate_guard` / `_trg`, BEFORE TRUNCATE statement: reject runtime truncate of the table.

These are **proposed guards**, not already installed. No required relation cycle or physical source-table change is introduced. Implementation must prove transaction/fencing checks rather than trusting the mere existence of a flag/custom SQL setting.

## 8. P01–P06 exact shared mapping and deduplication

| Package | New models | Altered models | New physical fields | New enums/values | Unique / CHECK / FK / indexes | AE classes | AC6 classes | Migration / backfill | Prospective |
| --- | ---: | --- | ---: | --- | --- | ---: | ---: | --- | --- |
| P01 shared foundation | 1 | Eight inverse-only source models listed above | 37 | 0 / 0 | 4 unique + PK; 16 CHECK; 8 FK; 6 indexes; 4 guards | 0 | 1 | 1 / NO | YES |
| P02 finance/expense/value | 0 | 0 | 0 | 0 / 0 | Reuse P01 | 0 | 0 | Reuse P01 / NO | YES |
| P03 outcomes/attribution/funnels | 0 | 0 | 0 | 0 / 0 | Reuse P01 | 0 | 0 | Reuse P01 / NO | YES |
| P04 salary/goals | 0 | 0 | 0 | 0 / 0 | Reuse P01 | 0 | 0 | Reuse P01 / NO | YES |
| P05 reputation | 0 | 0 | 0 | 0 / 0 | Reuse P01 | 0 | 0 | Reuse P01 / NO | YES |
| P06 consumers/security/gates | 0 | 0 | 0 | 0 / 0 | Reuse P01 and existing AuditLog indexes | 0 | 0 | Reuse P01 / NO | YES |

All kinds and constraints required by later packages are included in the **single P01 migration**; enabling a package is runtime registration/read integration, not another schema expansion. Migration directory name will use the repository's next chronological slot with suffix `chapter7_measurement_foundation`; no migration is created in this proposal.

| Shared concern | P02 | P03 | P04 | P05 | Single owner |
| --- | --- | --- | --- | --- | --- |
| Period/timezone | Shared row | Same | Same | Same | Measurement normalization |
| Evidence refs/qualification | Shared JSON contract | Same + exact existing AE/CD/A29 refs | Same + A22/payroll | Same + review/native refs | Source owners → one measurement publisher |
| Current/revision/as-reported | Shared revision | Same | Same | Same | MeasurementRevision, no package heads |
| Retention/claims | Shared row/AC6 | Same | Same | Same | One AC6 class |
| Attribution | No local credit counter | Reads A29, computes qualified outcome | No salary credit owner | No review credit owner | Existing A29 + shared derived rule; no alternate assignment writer |

P02 retains raw category evidence from existing Expense.category and never turns missing finance support into a new field containing invented zero. P04 uses actual A22 personal finance preferences and ActionTargetMutation evidence, not a new payroll/goal model. P05 uses exact source scale/denominator without adding an opaque reputation index. P03 source gaps yield unattributed/unknown under approved D2/D13, not automatic schema growth.

## 9. Actions, API/security and retention mapping

### Actions and AC6

No new business Action Engine class is justified. Pure measurement admission/claim/publication is a guarded derived-data owner with **no external/business effect**. Existing A29 correction, A22 preference update, P407 expense command, A12 report/CD execution and all Package4 actions keep their existing classes. C7 does not call a correction merely to make a measurement agree.

One new AC6 class: **`expire_measurement_revisions`**, policy **`chapter7.measurement-retention` version 1**. Reuse MaintenanceRun/ItemClaim, tenant-system authority, central batch default/hard ceiling, server cutoff, lease fencing, item digest and audit. The current MaintenanceRun SQL policy CHECK requires a nonempty maintenanceKind/policy; it is not a closed enum needing another schema field. Add the runtime allowlist/leaf after approval. No public HTTP/AI cleanup command and no second scheduler are introduced.

### D9 authorization at API and storage boundaries

| Boundary | Required mapping |
| --- | --- |
| Tenant | TenantContext + current Membership/integration binding; never body tenant/slug alone; every row lookup includes tenantId even for UUID. Composite FKs supplement authorization, not replace it. |
| Finance | Existing finance capability resolver before source read and before response; Manager has no implicit finance entitlement. Tenant admin title alone cannot enlarge the existing capability. |
| Staff / branch | Existing Staff/CrmStaffAccess + permitted branch intersections; own Staff only where approved. Null scope is not unrestricted. Current revoked access denies even a known snapshot ID. |
| Client facts | Exact Client and approved binding; no User requirement when canonical Client contract permits none. Raw phone/contact lookup is not proof. |
| A22 personal goal | Exact configurationUserId + tenant + current permission; no owner-private goal leak to Staff or tenant-wide report. Configuration generation/hash is pinned as evidence. |
| HTTP/PWA/proxy/native/AI | One typed read contract and current authorization. Existing consumers delegate calculations; no per-surface formula, Prisma publisher or legacy fallback. No new public anonymous measurement API. |
| AI | Safe projector strips raw Client/Staff/provider identifiers, contact details, evidence payloads and execution inputs. Only necessary permitted aggregate/fact values, pseudonymous references if needed, basis/asOf/limitations; no raw evidence JSON in prompts. LLM can explain, not alter values or qualification. |
| Audit Q21 | GET-only tenant audit reader: current TENANT_OWNER/BUSINESS_OWNER, scope=tenant AND exact tenantId, fixed safe event categories, newest-first `(createdAt,id)` cursor, requested window <=31 days, default page 50 / hard cap 100. These are technical bounds inside D9's bounded-read requirement. |
| Audit fields | id, createdAt, allowlisted action/entityType, safe opaque entityRef where authorized; per-event allowlist limited to safe outcome/reason code, ruleVersion and counts. Never serialize metadataJson directly; no platform rows, raw user/client/provider IDs, request bodies, credentials, raw security payload or immutable AE inputs. Existing audit writer remains sole writer. |
| Download | Existing OwnerReportRun.snapshot authority, admitted recipient and current eligibility; pin safe measured snapshot only. No mass Client list/PDF/contact export, generic SQL-PDF or extended download retention. |

Audit read route binding stays under the existing authenticated tenant API and inherits its guard chain; it does not add a production-surface group beyond the approved 32-group manifest. Its exact controller/DTO names are implementation details, not new permissions or action classes. Measurement APIs cannot accept arbitrary rule code, source SQL, audience or provider route.

### D10 lifecycle — applies to every new field

| New field group | Classification | Retention and immutability | Hold / tenant deletion / FK cleanup |
| --- | --- | --- | --- |
| id, tenantId, kind, identityHash, revision, requestKeyHash, intentHash, ruleKey, ruleVersion, contractVersion | Derived admission identity | Immutable at admission; row expires exactly 365 days later | Same AC6 row lifecycle; no independent perpetual identity ledger |
| clientId, appointmentId, staffId, branchId, configurationUserId, periodFrom, periodTo, timezone, scopeJson, asOf | Derived qualified scope | Immutable at admission; no copied contact data | Source refs RESTRICT; remove only derived row; sources keep their own lifecycle |
| admittedAt, expiresAt | Derived retention authority | Immutable; retry never extends | No cascade/implicit owner deletion can bypass AC6 |
| state, leaseGeneration, leaseTokenHash, leaseExpiresAt, publishedAt | Derived computation coordination | PENDING fencing then one immutable publication; expiry still original | A current short claim is fenced; at/after expiry it cannot publish or keep the row alive |
| evidenceHash, snapshotHash, completeness, qualification, evidenceRefsJson, valuesJson, limitationsJson, attributionStatus, creditedExecutionId, creditedAttemptId | Derived result/evidence | Filled once on publication; immutable until own expiry | Existing source holds are neither shortened nor transferred into a new indefinite C7 hold; no source updates/deletes |

There is **no new legal/business hold policy** in C7. A measurement is not execution input needed to reconcile the source action: source/AE/CD retain their original evidence under their existing policy. Therefore a source UNKNOWN does not require storing this derived duplicate forever. AC6 may expire the derived observation while leaving UNKNOWN and its source audit intact. It cannot resolve or retry the source. If an existing source contract actually requires retaining this new derived row as essential evidence, that is an exact contract contradiction to surface before implementation acceptance, not permission to extend D10 silently.

Tenant deletion uses the existing governed lifecycle; all new FKs RESTRICT and there is no automatic tenant cascade in this proposal. C7 adds no early-erasure permission. If the lifecycle reaches these rows, it must wait for their approved expiry/cleanup unless a separately existing approved erasure authority applies; this proposal does not invent one. After the final expired row is removed, no orphan head/claim model remains. Existing AC6 execution/audit receipts retain their own approved minimized policy.

Source retention remains unchanged: Client identity/security, consent, ActionExecution, financial/value facts, source DomainEvents and OwnerReportRun are not shortened to 365 days. Referenced expired C7 evidence is reported unavailable for drill-down; an immutable report may retain its already-admitted minimal safe values under its **existing** report contract, not gain a new lifetime from the C7 reference.

## 10. Migration safety and combined proof before runtime

One prospective additive migration creates only MeasurementRevision, its constraints/indexes/functions/triggers. No existing row UPDATE/DELETE/INSERT, no ALTER COLUMN/nullability change, no backfill, no fabricated historical lineages. All 37 new columns belong to the empty new table. Existing schema changes are Prisma inverse relations only. No new enum clashes, cross-package tables or required relation cycle.

After approval: Prisma validation → clean replay in a new owned temporary PostgreSQL DB → exact FK/unique/CHECK/immutability/fencing proof → combined schema proof → pending/drift verification before any release. Do not use the 17 pre-existing DBs. Production additive migration must wait for approved implementation gates; this document is not authorization to apply it.

Required executable schema checks:

- 37 physical columns / eight existing model inverse additions match this envelope; zero unapproved physical fields, source DDL or enum additions; clean forward and complete replay.
- Cross-tenant Client/Appointment/Staff/configuration/AE/Attempt refs denied; matching Attempt tenant but wrong execution denied; no User/phone authority substitution; Client without Maya User admitted where allowed.
- Same request+intent returns same row; changed intent conflicts; two first requests for one identity cannot both publish the same generation; concurrent claim/resume admits one publisher; stale fence and published-row mutation denied.
- New rule/evidence revision does not overwrite prior report; current selects latest including unavailable/reversed result; two attribution candidates never create two credited outcomes in aggregate.
- 365-day expiry belongs to each revision; retry/publish/refresh do not extend old rows; expired receipt never silently creates a fresh row; maintenance cannot delete sources; direct delete/truncate rejected.
- Mixed packages can pin qualified shared revisions without required FK cycles; deleting an expired dependency cannot delete a consumer/source/report; drill-down discloses missing evidence.
- P02/P04 share currency/payroll/A22 evidence without new goal/payroll owners; P03 cannot turn CD acceptance/UNKNOWN into delivered or paid; P05 excludes anonymous/mixed-scale reputation credit.
- Migration against a production-shaped read-only schema snapshot has no incompatible source constraint requirement. If actual pre-deploy source schema differs, reconcile; do not repair production rows or invent backfill.

These are proof obligations. A static mapping cannot truthfully claim PostgreSQL concurrency or production schema PASS before implementation.

## 11. Implementation waves, product result and finite acceptance

No dependency change is required. The shared migration is implemented and proved in P01; other packages consume it. **Four waves**, one coordinated production cutover after all six packages and aggregate gates, as already specified.

| Wave / package | After this package Maya can… | Dependencies / parallelism | Local acceptance additions |
| --- | --- | --- | --- |
| 1 — P01 | Show what was measured, from which qualified facts, with exact Client/tenant, date, basis, coverage and immutable history | No new package dependency | Admission/identity/authority/retention, Q01–Q03/Q17/Q18/Q22, schema proof |
| 2 — P02 | Distinguish booked/cash/refund/expense/value discrepancies and show only valid period comparisons | P01; parallel P05 | Q05–Q07/Q11; no false net, fuzzy dedup, mixed currencies or value writes |
| 2 — P05 | Show source-separated review/feedback counts and comparable tenant-local reputation facts | P01; parallel P02 | Q10; source scale/denominator/withdrawal/month-boundary proof |
| 3 — P03 | Explain which exact approved action/outcome is attributable, what happened later, and which funnel stages remain unknown | P01/P02; parallel P04 | Q04/Q12–Q15; one outcome credit, frozen A29, no UNKNOWN effect replay |
| 3 — P04 | Show proved accrued salary and permitted personal revenue-goal progress, or explain why they are not measured | P01/P02; parallel P03 | Q08/Q09; no 0.5, no salary/revenue confusion, private goal isolation |
| 4 — P06 | Present the same permitted results across existing surfaces, including safe tenant audit and existing report snapshots | All prior packages | Q16/Q17/Q19–Q21; consumer parity, mandatory guards, combined gate |

No C8 score/CLV/prediction/ranking, C9 strategy/orchestration or C10 autonomy is admitted. C7 supplies exact Client, last proved attendance, recency/frequency within known coverage, appointment outcomes, qualified monetary facts and action/CD results. **Unknown last visit is not dormant; >=3 visits and >2 months do not become C7 product rules; scoring is not consent.** PushSMS/contact exports and broader bridge credential migration remain their documented later prerequisites.

Permanent ratchets must be class-level: one measurement writer; no business/provider/delivery call from measurement; no source write from readers; exact tenant/Client authority; no phone/time-only credit; no mutable published result; no per-package period/evidence/retention owner; no AI/PWA/Python duplicate financial arithmetic; no raw evidence/contact export; UNKNOWN never retries; source retention not cascaded. Wire them into the existing mandatory backend gate and inherited Python/PWA/proxy checks.

Preserve the [32-surface manifest](evidence/chapter7-preflight/production-surface-manifest.json) and all C6 controls. P06 proves each Q, package and surface with implementation path, executable proof, ratchet and structural/read-only production evidence. This is not a new inventory/discovery loop.

Final implementation gate remains: 22/22 requirements; 6/6 package acceptance; shared schema/replay/integration; mandatory regressions; lint; application and scripts typechecks; build; Prisma validation; pending/drift; no unapproved decision; 32/32 surfaces; current certified release/health; zero production business/provider/message mutations for proof. No Chapter7 COMPLETE before that gate. No C6 contract is reopened by this proposal.

## 12. Approval boundary and final status

Product decisions are **approved 13/13**. The schema/action envelope above is **proposed, not yet approved**. Approving it would authorize the exact one-model/37-field/zero-business-action/one-AC6/one-migration mapping, subject to normal executable gates; it would not authorize scope expansion, historical backfill, C8–C10 features or weakening source contracts.

```text
OWNER DECISIONS APPROVED: 13/13
Q01–Q22 MAPPING COMPLETE: YES
EXISTING FOUNDATIONS REUSED: 20
NEW MODELS: 1
ALTERED MODELS: 8 (INVERSE PRISMA RELATIONS ONLY)
NEW PHYSICAL FIELDS: 37
NEW ACTION CLASSES: 0
NEW AC6 CLASSES: 1
MIGRATIONS EXPECTED: 1
BACKFILL REQUIRED: NO
PROSPECTIVE CUTOVER: YES
P01–P06 COVERED: 6/6
IMPLEMENTATION WAVES: 4
CHAPTER 7 SCHEMA/ACTION ENVELOPE READY FOR APPROVAL: YES
RUNTIME/SCHEMA/MIGRATION CHANGES THIS STEP: 0
PRODUCTION MUTATIONS: 0
CHAPTER 7 IMPLEMENTATION STARTED: NO
```

Docs/evidence only. Protected main worktree and old databases are not edited or used. Commit/push is followed by a fresh HEAD/origin check; final repository and documentation validation receipts are in `evidence/chapter7-schema-mapping/`. **STOP after delivery of this proposal.**
