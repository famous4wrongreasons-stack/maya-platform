# Chapter 7 — Preflight / scope reconstruction

Status: **PREFLIGHT COMPLETE; IMPLEMENTATION NOT STARTED; OWNER DECISIONS PENDING.**
Accepted Chapter 6 baseline: `9feff8dbb7aa66a1694fac0acfbf2cfc0812d8ed`.
Date: 2026-09-08. Repository documentation and current code are the sources of this reconstruction.

Chapter 6 / Package 4 / Package 5 remain **COMPLETE**. Their contracts and closed inventory are not reopened.
This is a documentation/evidence cycle: runtime, schema, migration, deployment and production mutations **0**.
The package plan below is a proposal for approval, not implementation authorization or a schema proposal.

## 1. Repository and production baseline

| Check | Fresh result |
| --- | --- |
| Canonical branch | `codex/maya-brain-systemic-release-20260815` |
| Isolated worktree / working branch | `/tmp/maya-b29-contour` / `contour/b29-remediation`; clean at entry |
| Fetch / HEAD vs origin | Fetch succeeded; accepted `9feff8db` = canonical origin = worktree HEAD; ahead/behind 0/0; unpushed 0 |
| Late upstream commits after accepted checkpoint | 0 |
| Active production release | `20260908-p5-rc-8bc03454`; `9feff8db` is its Chapter 6 documentation/acceptance checkpoint, not a different runtime release |
| Compiled backend / Python / public artifacts | 657 compiled artifacts matched; 121 Python metadata entries and 216 public artifacts matched the certified baseline |
| Launchers / flags / cron / timers / nginx | Unchanged; no new or unaccounted production surface |
| Beget Cron S13 | Accepted owner evidence still enabled 0 / disabled 0. SSH permission denial is not treated as evidence of absence. No new panel writes or jobs |
| Migration preflight | 93 repository migrations; 96 applied ledger entries including 3 already approved historical entries; pending 0 |
| Prisma diff / custom schema structure | No difference; custom schema structure exactly matches certified evidence |
| Health/readiness and live configuration | PASS |
| Main worktree / old databases | All 24 pre-existing entries preserved; 17 old DBs not used |

Fresh evidence: [repository preflight](evidence/chapter7-preflight/repository-preflight.json),
[baseline certification](evidence/chapter7-preflight/baseline-certification.json),
[exact comparison sections](evidence/chapter7-preflight/baseline-comparison-sections.json),
[probe receipts](evidence/chapter7-preflight/read-only-probe-receipts.json).
The metadata probes read current state and compare the already closed manifest; they do not run business jobs.
Full raw probe output is retained at the locations in the receipts. Normalized equal-section hashes, current schema/health output and the certified comparison files are preserved/referenced in repository.

**CHAPTER 6 BASELINE CERTIFIED: YES.** No reconciliation or runtime remediation is needed.
The final C6 tests (411 suites / 3370 tests; architectural 93 suites / 515 tests; 15 Python guards) are inherited certified evidence, **not a new test run in this documentation-only cycle**.

## 2. Canonical specification and precedence

**CHAPTER 7 CANONICAL SPEC FOUND: YES — distributed across the documents below.**
There is no existing standalone, detailed `CYCLE-07` implementation specification in the repository at this baseline.
Twenty-two requirements below normalize that distributed scope plus the requested acceptance/security rules; they are not twenty-two verbatim numbered paragraphs in an older document.

| Canonical path | Exact section | Meaning |
| --- | --- | --- |
| [CYCLE-01-COMPLETION.md](CYCLE-01-COMPLETION.md) | Deferred Findings | Tenant audit read (C7) and per-tenant bridge token (2/7); do not lose early handoff |
| [CYCLE-02-CHAPTER-2-COMPLETION.md](CYCLE-02-CHAPTER-2-COMPLETION.md) | Deferred Findings | Late recovery conversion and identity/finance dependencies, resolved against later reports |
| [CYCLE-02-PHASE-A.md](CYCLE-02-PHASE-A.md) | §L Persistence Plan; §N Transaction / Revenue Semantics | Client/history source freshness; old money/attendance findings are not current source truth |
| [CYCLE-03-CHAPTER-3-COMPLETION.md](CYCLE-03-CHAPTER-3-COMPLETION.md) | Deferred Findings | Provider financial events, source/identity handoff; covered by later canonical assignments |
| [MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md](MAYA-ORCHESTRATOR-AGENTS-ARCHITECTURE-GATE.md) | §18; §19.1–19.4 | MEASURE & OUTCOMES; full C7 carry-forward assignment; reviews; C8 prediction / C9 agents / C10 autonomy |
| [CYCLE-05-PHASE-A-OPPORTUNITIES-AGENT-TASKING.md](CYCLE-05-PHASE-A-OPPORTUNITIES-AGENT-TASKING.md) | §9.3; §9.4–9.6 | Financial events, refunds, expense overlap, earnings/goals, reputation, currency, late conversions; exclusions |
| [CARRY-FORWARD-REGISTER.md](CARRY-FORWARD-REGISTER.md) | Chapter 7 — Measurement & Attribution; findings 3.10, 4.x, 6.4, 7.1 | Outcome/attribution; history of exact deficiencies, not a current blocker count |
| [CYCLE-05-CHAPTER-5-COMPLETION-REPORT.md](CYCLE-05-CHAPTER-5-COMPLETION-REPORT.md) | §17 carry-forward; §19 final closure | Opportunity/AgentTask foundations; measured outcome remains future C7 |
| [CYCLE-06-ACTION-ENGINE-SCHEMA-GATE.md](CYCLE-06-ACTION-ENGINE-SCHEMA-GATE.md) | Chapter 7 Linkage; Audit and Retention | Execution/attempt evidence reusable; success is not causality or incremental revenue |
| [CYCLE-06-FINAL-COMPLETION-REPORT.md](CYCLE-06-FINAL-COMPLETION-REPORT.md) | Deferred capabilities and non-blocking debt; Chapter 7 handoff prerequisites | Final authority on C6 closure and disabled/deferred capabilities |
| [CYCLE-06-BLOCKING-PACKAGE-5-BUSINESS-DECISION-CLOSURE-SCHEMA-APPROVAL-BRIEF.md](CYCLE-06-BLOCKING-PACKAGE-5-BUSINESS-DECISION-CLOSURE-SCHEMA-APPROVAL-BRIEF.md) | D6 / Option A — immutable facts, revisable projection with evidence | Existing A29 frozen attribution-window and correction semantics |
| [CYCLE-04-CHAPTER-4-COMPLETION-REPORT.md](CYCLE-04-CHAPTER-4-COMPLETION-REPORT.md) | Deferred findings | Original assignments, including frozen motivation; later accepted closures take precedence |
| [CYCLE-04-P4-BRIEFINGS-REPORTS-MIGRATION-REPORT.md](CYCLE-04-P4-BRIEFINGS-REPORTS-MIGRATION-REPORT.md) | §11 | Report canonicalization already performed; frozen motivation/period work remains explicit |
| [CYCLE-04-P8-EXPENSE-CANONICALIZATION-REPORT.md](CYCLE-04-P8-EXPENSE-CANONICALIZATION-REPORT.md) | §5, §7, §9 | Canonical expense reader exists; source-import/currency limitations are separate |
| [package5-b35-canonical-bulk-owner-contract-v1-proposal.md](package5-b35-canonical-bulk-owner-contract-v1-proposal.md) | Owner contract / audience / route / idempotency / future initiators | Existing bulk execution; no new permission from segment membership |
| [package5-b35-exact-schema-mapping-v1-proposal.md](package5-b35-exact-schema-mapping-v1-proposal.md) | Canonical mapping / immutable admission | Reuse bulk schema and recipient slots; no parallel marketing owner |


Exact source hashes and heading line numbers: [canonical source index](evidence/chapter7-preflight/canonical-source-index.json).
`BASELINE.md` and `Документация/MAYA_AI_NATIVE_ROADMAP.md` are historical context. The latter's M5 marketing journey does not approve SQLite shortcuts, phone authority, a 10% holdout experiment or a particular Chapter 7 schema.

Precedence: accepted C6 closure and approved owner contracts → explicit chapter assignment in architecture/Phase A → historical finding evidence → old product aspirations.
An old “Reputation agent in C7” label means its **fact foundation** belongs here; §18 assigns actual agent/orchestrator runtime to C9.
4.2 is marked `DEF + C7`: this plan proposes only C7 financial fact/disclosure convergence; broader frontend/conversation migration stays C9, subject to D01.
Early-handoff intake: Chapter1 explicitly assigns a tenant audit read API to C7 (Q21). Its bridge-token item was 2/7; the architecture gate later makes tenant credentials/body signing a prerequisite **before L3** (§10.3, security discussion). No C7 implementation may silently claim that broad credential migration is complete. D13 proposes to keep the current certified ingress while accepting only independently qualified evidence for new measurement credit (Q22); any broader migration is an explicit scope decision. Chapter2 history/financial/recovery items map to Q02–Q07/Q12; Chapter3 deferred source/event findings are already represented by the numbered mapping. No C6 regression is inferred from these historical assignments.

Old commentary that every Appointment lacks a canonical Client does not override the current C5/C6 bindings; the provider-space recency DTO still requires an explicit qualified join.

## 3. Objective in business language

**После Chapter 7 Maya сможет показать, какие действия были выполнены, какие подтверждённые визиты, деньги и изменения загрузки наблюдались после них, насколько доказана связь, и где данных недостаточно; финансовые итоги, цели мастеров и отзывы будут опираться на одни проверяемые факты.**

### What Maya can do after Chapter 7 (recommended scope)

- Separate “proposed”, “approved”, “executed”, “message delivered”, “booked”, “attended” and “money confirmed”; show limitations rather than an invented conversion.
- Show evidence-backed attribution and its rule/version, correct the current measured result after a cancellation/refund, and preserve what an earlier report actually said.
- Explain cash, expenses, currencies and incomplete comparisons consistently; show confirmed staff earnings and monthly revenue plan/fact without a default salary percentage.
- Show source-qualified review counts/averages in the business timezone; distinguish observed change from an AI judgement about reputation.
- Supply these facts to current authorized dashboard, report and AI read surfaces; supply grounded explanations without granting AI mutation authority.

### What still waits for Chapters 8–10 or a separate integration

| Capability | Placement / limitation |
| --- | --- |
| CLV, expected recovery, incremental uplift, churn/no-show prediction and monetary ranking | C8 versioned prediction/valuation; not a guessed number in a C7 report |
| Full strategy orchestration / specialized agents / coordinated conversation | C9; current read tooling and L2.5 shadow are not that runtime |
| Autonomous recurring campaigns / L3–L4 | C10 scoped autonomy after its prerequisites; existing owner approval is not blanket autopilot |
| PushSMS | Separate future integration contract. Repository does **not** assign an exact numbered chapter to this adapter; no early implementation |
| Paid-visit settlement A08, fiscal/accounting execution | Existing disabled/deferred disposition remains. Reading a payment/refund fact does not enable a settlement or fiscal writer |
| General journal/tool UX cleanup, all duplicate tool arithmetic outside C7 metrics | Explicit C9 items (4.10/4.32/4.57/4.59/4.61/4.85-B); not a hidden C7 overhaul |
| Broad retention/PII purge or arbitrary Client-data exports | Separate authority/retention scope; existing AC6 allowlist and report snapshots are not generic permission |

## 4. Deferred scenario intake: loyal/valuable clients absent over two months

**Placement: SPLIT — C7 facts/results; C8 valuation/ranking; C9 product orchestration; C10 autonomy.**
This is a reconstruction of chapter dependencies, **not evidence that the complete product flow was already assigned to C7**.

| Step in the requested journey | Existing support / Chapter 7 contribution | Later capability |
| --- | --- | --- |
| Analyse canonical clients / visit history | Client/CrmClientLink, attendance/recency, bounded CRM history; exact tenant join and completeness | No phone or User-only identity shortcut |
| Find clients absent >2 months | Current registry has calendar-month buckets, unknown-date counts and a `visits_count >= 3` label; Opportunity has a separately configured minimumDays rule | These are different source/policy definitions. They do not define a new canonical “loyal/valuable >2 months” strategy; D12 proposes no new threshold in C7 |
| Rank / explain why selected | C7 supplies dated, source-qualified frequency/recency/cash facts and grounded explanations; stable deterministic ordering exists | Valuable/CLV/probabilistic prioritization C8; no fabricated “top value” ranking |
| Recommend a return strategy | Existing read tools may explain known facts, not invent evidence or an assured uplift | End-to-end owner-facing strategy orchestration C9, consuming C8 where valuation is needed |
| Owner approval → bulk communication | Existing B35 + Action Engine + CD already provide this execution foundation | The new strategy initiator can reuse it later. Audience membership/scoring never implies consent |
| Manual call list / PDF | Current authorized OwnerReport snapshot download is reusable only for its admitted report | Arbitrary contact list requires explicit purpose, access, minimization and export retention; proposed outside C7 (D09/D12), not silently enabled |
| Recurring autonomous recovery | No new C7 background marketing effects | C10; current consent, approvals, limits and reconciliation still apply |

Unknown last-visit date is not “older than two months”. Two calendar months are not silently replaced by 60 days.
Provider `lifetime_sold_amount` is not canonical net spend, CLV or incremental recovery.
**SCORING == CONSENT: NO. MARKETING AUDIENCE == CONSENT: NO.**

## 5. Current-code capability inventory

`EXISTS` means the named foundation is reusable within its stated boundary. `PARTIAL` means some implementation is reusable, not that the entire product capability is complete.
Twenty reusable foundations = nine EXISTS + eleven PARTIAL; three missing aggregate foundations; two legacy groups excluded.

| ID / capability | State | Evidence | Reuse boundary |
| --- | --- | --- | --- |
| F01 Canonical Client / verified bindings | EXISTS | [maya-saas-backend/src/crm/client-channel-link.service.ts](../../maya-saas-backend/src/crm/client-channel-link.service.ts) | Identity and exact tenant authority; never infer from User/phone/profile |
| F02 Opportunity and AgentTask lifecycle | EXISTS | [maya-saas-backend/src/opportunities/opportunity.contract.ts](../../maya-saas-backend/src/opportunities/opportunity.contract.ts) | Versioned evidence, shadow proposals, expiry; not measured outcomes |
| F03 Scoring / ranking | PARTIAL | [maya-saas-backend/src/opportunities/opportunity.engine.ts](../../maya-saas-backend/src/opportunities/opportunity.engine.ts) | Stable key/evidence ordering exists; value/churn/CLV ranking owner absent |
| F04 Client analytics | PARTIAL | [maya-saas-backend/src/ai-tools/client-registry-analysis.ts](../../maya-saas-backend/src/ai-tools/client-registry-analysis.ts) | Aggregate registry counts; provider-card visits/value are not attended visits or net CLV |
| F05 CRM / visit history access | EXISTS | [maya-saas-backend/src/crm/crm.service.ts](../../maya-saas-backend/src/crm/crm.service.ts) | Adapter reads with declared limits/completeness, not unlimited history |
| F06 Attendance / recency facts | PARTIAL | [maya-saas-backend/src/business-facts/client-recency-facts.service.ts](../../maya-saas-backend/src/business-facts/client-recency-facts.service.ts) | Canonical attendance calculation exists; recency contract still provider_client-space; exact Client mapping needed at measurement boundary |
| F07 Loyalty / value foundations | EXISTS | [maya-saas-backend/src/business-state/business-state.service.ts](../../maya-saas-backend/src/business-state/business-state.service.ts) | P4 owners and authorized evidence; ledger/card discrepancy is separate measurement |
| F08 Segmentation | PARTIAL | [maya-saas-backend/src/ai-tools/client-registry-analysis.ts](../../maya-saas-backend/src/ai-tools/client-registry-analysis.ts) | Existing threshold/cohort readers; no approved valuable-client ranking or consent implication |
| F09 Retention / reactivation candidates | PARTIAL | [maya-saas-backend/src/opportunities/opportunity.policy.ts](../../maya-saas-backend/src/opportunities/opportunity.policy.ts) | Tenant minimumDays + attendance evidence; shadow opportunity, not end-to-end campaign product |
| F10 Recommendations | PARTIAL | [maya-saas-backend/src/opportunities/opportunity.shadow.ts](../../maya-saas-backend/src/opportunities/opportunity.shadow.ts) | Read tools/shadow structured suggestions; strategy quality or valuation not proved |
| F11 Campaign / admitted audience | EXISTS | [maya-saas-backend/src/marketing/canonical-bulk.service.ts](../../maya-saas-backend/src/marketing/canonical-bulk.service.ts) | B35 canonical immutable audience; membership never consent |
| F12 Owner approval / Action Engine | EXISTS | [maya-saas-backend/src/action-engine/action-engine.kernel.ts](../../maya-saas-backend/src/action-engine/action-engine.kernel.ts) | Immutable receipts/execution/attempts and fresh current-policy checks |
| F13 Bulk execution / Communication Delivery | EXISTS | [maya-saas-backend/src/communication-delivery/communication-delivery.service.ts](../../maya-saas-backend/src/communication-delivery/communication-delivery.service.ts) | Durable recipient slots, idempotency, UNKNOWN/reconciliation |
| F14 Exports / PDF | PARTIAL | [maya-saas-backend/src/owner-reports/owner-report-snapshots.controller.ts](../../maya-saas-backend/src/owner-reports/owner-report-snapshots.controller.ts) | Authorized admitted OwnerReport snapshot download; not arbitrary Client call-list export |
| F15 Operational work items / configuration | EXISTS | [maya-saas-backend/src/package5-wave1/package5-wave1.service.ts](../../maya-saas-backend/src/package5-wave1/package5-wave1.service.ts) | Existing package5-wave1 tasks/A22 revisions; not a second task queue |
| F16 AI invocation / tooling | EXISTS | [maya-saas-backend/src/ai-tools/ai-tool-policy.service.ts](../../maya-saas-backend/src/ai-tools/ai-tool-policy.service.ts) | Existing policy-scoped initiator/read contracts; no new C9 agents implied |
| F17 Financial / expense facts | PARTIAL | [maya-saas-backend/src/expenses/expense-period.reader.ts](../../maya-saas-backend/src/expenses/expense-period.reader.ts) | BusinessState and canonical expense reader; refund/import/currency/comparison gaps remain assigned C7 |
| F18 Recovery source fact plane | PARTIAL | [maya-saas-backend/src/recovery/recovery.service.ts](../../maya-saas-backend/src/recovery/recovery.service.ts) | A29/A31 source dedup/corrections exist; temporal attribution/positive-cash totals are not full causal measurement |
| F19 Canonical cross-domain measurement/outcome owner | MISSING | [maya-saas-backend/prisma/schema.prisma](../../maya-saas-backend/prisma/schema.prisma) | No complete versioned Client/Opportunity/AE/CD/outcome lineage and publication contract |
| F20 Canonical earned/goal plan-fact family | MISSING | [maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts](../../maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts) | Existing A22 goal inputs do not supply canonical measurement/calculation owner |
| F21 Canonical reputation aggregates | MISSING | [maya-saas-backend/src/business-content/business-content.service.ts](../../maya-saas-backend/src/business-content/business-content.service.ts) | Review/NativeFeedback fact owners exist; source-qualified tenant-local monthly aggregate owner absent |
| F22 Legacy SQLite/direct marketing audience shortcuts | LEGACY — DO NOT REUSE | [maya-saas-backend/src/marketing/marketing.service.ts](../../maya-saas-backend/src/marketing/marketing.service.ts) | Legacy MarketingService audience helpers have no current src callers; not a new production regression. Python retired writers remain retired. |
| F24 Tenant audit evidence / read API | PARTIAL | [maya-saas-backend/src/audit-log/audit-log.service.ts](../../maya-saas-backend/src/audit-log/audit-log.service.ts) | AuditLog writer and tenant/platform CHECK exist; no generic tenant audit read API found. Add bounded owner-scoped read without exposing platform/security payloads |
| F25 Bridge source identity | PARTIAL | [maya-saas-backend/src/tenancy/bridge-source.service.ts](../../maya-saas-backend/src/tenancy/bridge-source.service.ts) | Server-bound integration guard exists for mutation initiators; legacy recovery ingest still accepts global bridge secret + resolved source. Not sufficient by itself for new C7 attribution credit |
| F23 Legacy monetary motivation heuristic | LEGACY — DO NOT REUSE | [maya-saas-backend/src/ai-tools/master-money-motivation.ts](../../maya-saas-backend/src/ai-tools/master-money-motivation.ts) | Frozen earned/null and default 0.5 potential arithmetic cannot become measured earnings |


[Code inventory and file hashes](evidence/chapter7-preflight/capability-inventory.json).
Audit read Q21 consumes the existing `AuditLog` owner with explicit `scope=tenant`, bounded pagination/time window and safe fields; it does not expose platform events or arbitrary audit metadata.
The legacy `MarketingService.findAudience/previewCampaign/approvalPreview` definitions have no current `src` call sites in this baseline; this is a **do-not-reuse** finding, not a new active C6 bypass.
The existing `RecoveryService.report` is a read path, with known C7 semantic limitations; measuring a limitation does not reopen its approved A29 mutation owner.
B34/R08 already provide review/NativeFeedback authority. F21 is missing **measurement aggregation**, not permission to build another review writer.

## 6. Finite requirement and gap manifest

Count: **22 normalized requirements Q01–Q22**. Nineteen numbered findings plus two Chapter1 handoff items map into them; cross-cutting safety and completion requirements come from the C6 handoff and this preflight instruction.
Expected schema/action impact is **mapping only**. No tables, field counts or new action identifiers are proposed/approved here.
Schema impact cannot honestly be marked zero merely because Client, ActionExecution and CD exist: durable measurement lineage/publication/retention still needs exact assessment after the product decisions.

| ID / requirement | Reusable foundation → remaining gap | Canonical owner | Dependencies |
| --- | --- | --- | --- |
| Q01 Единый измеримый факт: basis/unit/currency/asOf/window/completeness/version | F04,F06,F17 → Общий outcome envelope; unknown не ноль | Measurement + existing source owners | P01 |
| Q02 Exact Client/tenant lineage от Opportunity до outcome | F01,F02,F12,F13 → Recovery provider/HMAC refs не заменяют Client/AE/CD lineage | Measurement; source identities remain A18/CRM | P01 |
| Q03 Booked / arrived / paid / no-show / cancelled / deleted раздельны | F05,F06 → Outcome publication consumes attendance rather than legacy completed bucket | Attendance facts -> Measurement | P01 |
| Q04 Поздние отмены/возвраты меняют current outcome, сохраняя as-reported | F18,F12 → Versioned current measured result, separate from frozen A29 assignment | A29 attribution + Measurement outcome | P01,P02 |
| Q05 Cash/refund/fiscal event interpretation с доказанным source meaning | F05,F17 → finances_operation discriminator/linkage; cash is not settlement or booked value | CRM financial facts / BusinessState | P01,P02 |
| Q06 Расходы: provenance overlap, raw category и currency | F17 → No heuristic dedup, no raw label loss, no cross-currency ranking | P407 expense owner -> financial fact reader | P02 |
| Q07 Периоды/полнота/финансовые подписи и compatibility disclosure | F17 → Comparable windows and canonical money disclosure for C7 facts | BusinessState / measurement presenters | P02 |
| Q08 Фактическое начисление мастера без default 0.5 | F05,F17,F23 → Frozen nested salary consumer and duplicate visit arithmetic | Financial/staff fact owner | P02,P04 |
| Q09 Цель и plan/fact exact Staff/tenant/period | F15,F20 → Deterministic owner for progress, outside AI | A22 config owner -> goals measurement | P02,P04 |
| Q10 Отзывы: provenance, denominator, local month, observed delta | F21 → Aggregate existing verified facts; no UTC-month or inferred reputation truth | Review/NativeFeedback facts -> reputation measurement | P01,P05 |
| Q11 Ledger/card discrepancy is measured, not silently repaired | F07 → Explicit comparable-currency/asOf discrepancy disclosure | P4 value owners -> Measurement | P02 |
| Q12 Attributed result only with explicit evidence; no causal uplift by coincidence | F18,F02,F12 → Duplicate/competing touchpoints, missing lineage and attribution labels | A29 + Measurement | P01,P02,P03 |
| Q13 Заполненное окно доказано capacity/appointment lineage | F02,F06 → Boolean filledWindow is insufficient; require original opportunity/capacity plus actual outcome | Occupancy facts -> Measurement | P03 |
| Q14 Communication funnel separates admitted/attempted/accepted/delivered/read/outcome | F11,F13 → Measured channel evidence, no success-as-delivery | CD owner -> Measurement | P03 |
| Q15 Proposal/approval/execution/reconciliation measured independently | F02,F12 → Defined denominators/time ranges and unavailable outcomes | Opportunity/AE -> Measurement | P03 |
| Q16 One result through existing HTTP/PWA/AI/report consumers | F14,F16,F17 → Remove C7-local duplicate arithmetic; preserve wider C9 conversation deferral | Measurement read boundary; OwnerReportRun for existing reports | P02,P03,P04,P05,P06 |
| Q17 Permissions, prompts, retention, export and tenant isolation | F01,F12,F14,F16 → Exact C7 minimization and retention policy before persistence/export | Existing auth/A18/A22/AC6 owners; measurement read gate | P01,P06 |
| Q18 Durable measurement is restart/retry/concurrency safe | F02,F12,F18 → One measurement revision per admitted evidence/version; read cannot start business effect | Measurement; no parallel AE executor | P01,P03 |
| Q19 Permanent guards preserve all C6 owners and 32 surface groups | C6 93 ratchets + 15 Python scanners → Add class-level measurement/AI/provider/identity boundaries into mandatory gate | Existing owner guards + Measurement | P06 |
| Q20 Finite acceptance/cutover manifest; no proof mutations | C6 acceptance/release process → Evidence for every Q/package/surface plus schema integration and current release | Existing release owner/process | P06 |
| Q21 Tenant-scoped читающее API аудита из Chapter1 handoff | F24,F12 → Bounded/redacted read; tenantId and scope=tenant mandatory | Existing AuditLog owner + authorization read boundary | P06 |
| Q22 Доказанный source admission для C7 measurement из legacy bridge | F25,F01,F18 → Platform secret + request source is not proof of exact Client/action lineage | Existing BridgeSource/CRM/auth owners -> Measurement | P01 |


| ID | Schema impact (not proposal) | Action-class impact | Minimum executable acceptance |
| --- | --- | --- | --- |
| Q01 | Expected durable evidence mapping in P01 | No new business action expected | Same inputs/version -> same measurement; missing/partial/unavailable stay distinct |
| Q02 | Expected lineage mapping in P01 | Reuse existing owner actions | Cross-tenant/Client rejected; no User/phone inference; Client without Maya User |
| Q03 | Reuse P01 projection | 0 expected | Paid but absent is not a returned visit; arrived unpaid is not recovered cash |
| Q04 | Expected outcome revision mapping | Existing A29 correction only | Late reversal changes current metric; original report/action immutable; A29 window unchanged |
| Q05 | Only if durable source evidence missing; assessment later | No settlement/fiscal/business write enabled | Unknown financial events quarantined; refund exact link; mixed currency not summed |
| Q06 | Assess metadata reuse, no schema proposal now | Reuse P407; no automatic expense/import mutation | Two sources same amount not silently merged; unresolved overlap suppresses certified net |
| Q07 | None expected beyond P01 | 0 expected | Equal timezone/bounds; incomplete comparison no percentage claim; withLegacyNet not canonical profit |
| Q08 | Assess reuse, no payroll model proposed | No payroll mutation | Known earned exact; unavailable stays unknown; no invented monetary potential |
| Q09 | Assess revision linkage to existing A22/P01 | Reuse A22; no new goal writer | Missing goal not zero; config revision changes are explicit; Staff scope isolated |
| Q10 | Reuse source facts/P01; assess aggregate durability | No new review/business action | UTC boundary vs tenant month; withdrawn/revised facts; native/provider/anonymous never pooled blindly |
| Q11 | None expected beyond P01 | No value correction/mint | Mismatch visible; unrelated loyalty facts unchanged; missing evidence stays unknown |
| Q12 | Expected mapping in P01/P03 | Existing A29 only | Temporal or phone-only match cannot claim recovery; one outcome not credited twice |
| Q13 | Reuse P01 lineage | 0 expected | Concurrent claims one observed outcome; later cancellation invalidates current fill |
| Q14 | Reuse P01 evidence | No new delivery action | UNKNOWN is neither failed nor delivered; no retry/channel switch from measurement |
| Q15 | Reuse P01 evidence | 0 expected | Denied, expired, UNKNOWN, retried, succeeded counted distinctly; no replay effects |
| Q16 | None expected beyond shared plan | Reuse A12/A22; no new scheduled send | Same asOf/version -> equal facts across consumers; authorized snapshot only |
| Q17 | Expected retention evidence only after decision | AC6 mapping must be explicit if new retention target | Revoked access denied; no raw PII in prompts; no Client list export via report shortcut |
| Q18 | Expected durable identity/claims mapping | No business action expected; audit/retention mapping later | Crash/restart/order permutations same outcome; idempotent replay without rewriting source |
| Q19 | No implementation schema implied | 0 expected | All inherited guards run; late Python/PWA/proxy changes cannot bypass owners |
| Q20 | Any approved schema must pass replay/drift before runtime | No business action created by gate | 22/22 Q, 6/6 packages, 32/32 controls, zero unapproved decisions, read-only production proof |
| Q21 | Reuse AuditLog; no source audit rewrite | 0 new business actions expected | Owner tenant read only; platform rows and other tenant denied; pagination/bounds; safe fields only |
| Q22 | Reuse existing binding for A; broader credential schema only if separately chosen | No new bridge writer under recommended A | Unbound/global-token-only observation gets no attribution credit; server-bound exact tenant/execution evidence accepted; no source mutation |


For every Q row: business facts, eligibility, calculation, permission and state changes are deterministic; AI may explain an authorized fact envelope only. Production effect of a future implementation is a permitted read or approved derived measurement fact, **never a booking/message/payment/value/consent mutation by a measurement consumer**.
No generic outcome owner may take ownership from A29, P407, review/native feedback, A18, A22, P4, Action Engine or CD.

### Historical finding disposition (complete C7-assigned list)

| Finding | Requirements | Disposition |
| --- | --- | --- |
| 3.10 | Q05 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.0 | Q05 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.1 | Q05, Q04 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.2 | Q07, Q16 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.3 | Q06 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.6 | Q03 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.13 | Q08 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.20 | Q07, Q16 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.21 | Q07 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.22 | Q08 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.24 | Q09 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.26 | Q07 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.42 | Q10 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.51 | Q01, Q05 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.66 | Q06 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.67 | Q06 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 4.79 | Q08 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 6.4 | Q11 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| 7.1 | Q04, Q12 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| C1.audit-read | Q21, Q17 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |
| C1.bridge-source | Q22, Q02 | Reuse completed canonical subparts; close the remaining documented measurement/disclosure gap |


Specifically: attendance truth/Client binding, expense writes, report admission, native feedback authority and cash declarations are already canonical after C6. They are **not** new remediation packages.
4.66 is a contract edge for admitted/imported source labels, not permission to enable an unapproved CRM expense importer. Unknown `finances_operation` remains quarantined until its exact source semantics is proved; no speculative catch-up or replay.
4.2/4.20/4.26 cover only the C7 fact surfaces in this manifest; broader C9 conversation/UI debt remains explicit.

## 7. Deterministic / AI / action boundary

| Deterministic owner | AI can do | AI cannot do |
| --- | --- | --- |
| Source facts, attendance, financial basis/currency, arithmetic, complete-period comparisons | Explain an approved measured value and its uncertainty/limitation in plain language | Supply missing numbers, turn `not_measured` into zero, infer attendance from payment or name/phone |
| Exact lineage and versioned attribution rules | Explain why a link is proved or why attribution is unavailable | Declare causality from `SUCCEEDED`, temporal proximity or a persuasive story |
| Eligibility, role/tenant scope, consent/preferences, retention | Request permitted read facts | Override current revoked permissions/consent, equate a segment with opt-in |
| Existing approval, Action Engine, bulk/CD and UNKNOWN | Propose a future strategy/command under its existing initiator contract | Execute provider calls, retry UNKNOWN, create new delivery slots/channels or a second owner |
| Versioned measurement publication | Render the same asOf/version on existing surfaces | Recalculate hidden business metrics differently in PWA/Python/LLM |

A deterministic historical sort is not a prediction model. C8 can later add approved probabilistic prioritization with calibration; that does not turn an LLM into the source of business facts.
Measurement policy versions do not refresh or revive expired business intent, reopen UNKNOWN effects, or modify original execution/approval inputs.

## 8. Data requirements and canonical sources

| Data | Canonical source / exact limitation | Minimum C7 use |
| --- | --- | --- |
| Client / channel identity | Client + CrmClientLink / ClientChannelLink / A18 verified provenance; exact tenant | Opaque qualified joins. Client without Maya User remains supported where bindings allow |
| Appointments / cancellations / no-show / deletion | Appointment mayaClientId + tenant; approved CRM/internal evidence and attendance facts | Separate scheduled, arrived, paid and cancellation facts; no mirror-status shortcut |
| Visit recency / frequency | Attendance history owner; ClientRecencyFacts declares provider_client scope, window/truncation | Qualified projection into Client scope only with existing proved link; unknown remains unknown |
| CRM card totals/history | CrmService.getClientRegistry/getClientVisitHistory and adapter completeness | Source-labelled history, no inference of net cash or attendance from a card summary |
| Spend/value / returns / fiscal evidence | BusinessState / OperationsAnalytics / provider finance facts; exact event discriminator/correlation | Amount in currency and basis; unknown refund coverage prevents a certified net result; A08 stays disabled |
| Expense facts | P407 + ExpensePeriodReader; existing canonical source rows | Source overlap unresolved ⇒ disclose, do not dedup by date/amount. Preserve raw import label when accepted |
| Loyalty / certificates | P4 canonical value owners; exact ledger and provider observation | Read-only discrepancy with currency/asOf; never fix a balance from a measurement job |
| Staff/service affinity | Qualified visits via existing CRM history/dossier reads | Observed counts with denominator/window, not an AI-derived preference or permission |
| Earnings / goals | Provider confirmed salary; A22 finance configuration revisions | Salary and revenue targets are different metrics. Goals remain the existing owner/user configuration scope, not a new implicit tenant-global plan |
| Opportunity / approval / execution | Opportunity / AgentTask / canonical receipt / ActionExecution / ActionAttempt | Proposal and action linkage, decisions, attempt outcomes and reconciliation; no inferred links |
| Communication and campaign outcomes | CanonicalBulk/recipient slots + CD delivery/attempt receipts | Admitted/attempted/provider accepted/delivered/read distinct. Missing receipt is not failure |
| Recovery observations | A29/A31 DomainEvent / RecoveryTouchpoint / RecoveryConversion | Preserve frozen attribution window and original facts; new current measurement cannot rewrite A29 history |
| Reviews | B34 review source facts, NativeFeedbackRequest/Revision; anonymous community separate | Source classification, exact Client/Appointment where available, local-month aggregates |
| Consent/preferences | Effective ClientConsentFact resolver including security invalidation, B6/B25/B35 policy and ClientChannelLink | Read eligibility only where needed; historical row presence and owner approval never consent |
| Capacity / filled slot | Canonical occupancy/attendance evidence and the exact Opportunity/appointment lineage | No “filled window” from an unproven boolean; unavailable capacity means not measured |

No legacy SQLite, raw Telegram chat_id, phone matching or global fallback may fill a missing source.
No external/provider mutation is needed to obtain proof. Provider history reads remain bounded by adapter/tenant capability, rate limits and completeness; absence outside a window is not a proven lifetime fact.

## 9. Security, privacy, exports and audit before persistence

Proposed detailed policy is in D09–D11 of the [Owner Decision Pack](CYCLE-07-OWNER-DECISION-PACK.md); it is not approved by publication.

- Owner/admin: only current exact tenant/branch scope, current membership, role/feature/finance entitlements and allowed disclosures. Platform/GOD status is not implicit cross-tenant Client-data access.
- Manager and staff: retain existing distinct business/finance roles. `OperationsAnalyticsController` finance allowlist does not include Manager. Staff reads only its proved staff scope; no automatic full Client-base or other staff salary visibility.
- AI tools: existing invocation/surface/role policy. Only minimized, purpose-qualified aggregate/opaque fact envelopes may enter prompts; raw phone/name/email/stable identifying provider data stay out. Authorized presentation may resolve display labels outside the model.
- Revocation: recheck current access at read/download/continued work; old snapshot membership does not authorize a newly revoked viewer. Measurement does not change consent or grant new Client provenance.
- Export: preserve exact-user admitted OwnerReport snapshots. A Client contact-list/PDF is a different product/purpose; no arbitrary SQL, unlimited download or generic export route in recommended C7 scope.
- Retention: source-owned financial/security/consent/execution history is untouched. Proposed new derived measurement retention must have an exact future approved mapping and AC6 owner; no generic cascade/purge of source facts, active/UNKNOWN executions or audit holds.
- Audit: record evidence versions, rule/version, asOf, completeness, authorized publication/correction and retention lifecycle. Keep historical admission/execution inputs immutable; new evidence creates a later measured revision rather than fake historical truth.

## 10. Proposed implementation packages and execution waves

**6 packages, 4 implementation waves, one coordinated production cutover after the combined gate.**
No per-finding Bxx loop. Parallelism is possible only after the shared contract is frozen; integration into shared files/schema is coordinated.

| Package / business capability | Canonical owner / requirement acceptance | Schema expected / actions expected | Dependencies / parallel |
| --- | --- | --- | --- |
| P01 Trustworthy measured outcome / evidence foundation | Q01, Q02, Q03, Q17, Q18, Q22; owners are exactly the Q table owners | Expected shared durable mapping; exact model/field count deliberately not proposed; No new business action expected; retention/admission mapping needs later exact assessment | C6 certified baseline / none in same dependency wave |
| P02 Financial truth / periods / expense and value discrepancy | Q05, Q06, Q07, Q11; owners are exactly the Q table owners | Assess existing source/evidence reuse; no second ledger; Existing A22/P407/P4 only; no settlement/refund execution | P01 / P05 |
| P03 Measured action outcome / attribution / funnel | Q04, Q12, Q13, Q14, Q15; owners are exactly the Q table owners | Shared P01 evidence/outcome revisions; no second A29 projection owner; Existing A29 corrections; no business sends/bookings | P01, P02 / P04 |
| P04 Actual staff earnings and monthly goals | Q08, Q09; owners are exactly the Q table owners | Assess A22 revision / P01 reuse, no payroll schema authorized; Existing A22 goal configuration owner | P01, P02 / P03 |
| P05 Source-qualified reputation measurements | Q10; owners are exactly the Q table owners | Assess reuse of Review/NativeFeedback + P01; no new review source model implied; Existing feedback/review owners only | P01 / P02 |
| P06 Consistent authorized reads / release proof | Q16, Q17, Q19, Q20, Q21; owners are exactly the Q table owners | Combined migration/replay/drift gate for approved mapping only; No new business action; existing OwnerReport snapshot/CD unchanged | P01, P02, P03, P04, P05 / none in same dependency wave |


| Wave | Packages | Exit condition |
| --- | --- | --- |
| 1 | P01 | Approved exact measurement/evidence/retention mapping; shared contract executable on synthetic PostgreSQL; identity/restart/read boundaries proved |
| 2 | P02 + P05 | Financial/period/expense and reputation facts each package-local PASS; can work independently over P01 |
| 3 | P03 + P04 | Attributed outcomes/funnel and earnings/goals each local PASS; depend on proved financial/period facts |
| 4 | P06 + combined release gate | Consumer parity, all guards/32-group checks, complete schema integration, migration/rollback plan and structural production acceptance |

Four is the dependency depth of this proposed package DAG, not four owner STOPs or a requirement for four production deployments.
First collect D01–D13 in one owner response. Then prepare **one exact combined schema/action assessment** for the approved product policy before schema/runtime implementation; this preflight intentionally does not design models/fields.
A new required retention/admission action mapping must be explicit there; “no new business actions expected” is not a blanket claim of zero future AC6/action identifiers.
No package may broaden its input/output contract silently. Ordinary implementation defects remain package work; genuine changes to approved scope require one consolidated delta decision.

## 11. Finite production-surface manifest

**32 existing surface groups in acceptance scope: 16 direct read/fact integration groups, 16 preservation/evidence-input groups. New groups proposed: 0.**
These are the same group IDs as the closed C6 inventory, not a claim that 32 endpoints will be modified. Each group retains its inherited path manifest and ratchets.
The [machine-readable manifest](evidence/chapter7-preflight/production-surface-manifest.json) preserves the exact inherited guard paths and adds the C7 boundary below.

| ID / group | C7 role | Packages / boundary |
| --- | --- | --- |
| S01 Backend HTTP routes | DIRECT READ/FACT INTEGRATION | P06 — analytics/recovery/review/owner-report read contracts |
| S02 Active salon PWA | DIRECT READ/FACT INTEGRATION | P06 — existing cabinet/report/motivation C7 result presenters |
| S03 Maya platform PWA / VPS static | DIRECT READ/FACT INTEGRATION | P06 — existing platform read result consumers |
| S04 Public site / Next / shop | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S05 Proxy / compatibility routes | DIRECT READ/FACT INTEGRATION | P06 — pass-through compatibility/read disclosure only |
| S06 Chat / stream / history | DIRECT READ/FACT INTEGRATION | P06 — fact envelopes in existing chat/tool result rendering |
| S07 Realtime / voice | DIRECT READ/FACT INTEGRATION | P06 — same read fact contract through current voice bridge; no new agents |
| S08 AI tools | DIRECT READ/FACT INTEGRATION | P04,P06 — existing analytic/goal tools consume canonical facts |
| S09 Journal | DIRECT READ/FACT INTEGRATION | P02,P06 — period/money fact disclosure where C7 changes contract; general journal UX stays C9 |
| S10 Python services / importers | DIRECT READ/FACT INTEGRATION | P02,P06 — existing report readers and accepted financial-event adapters; retired writers stay retired |
| S11 Schedulers | DIRECT READ/FACT INTEGRATION | P01,P06 — existing scheduled report evidence inputs; no new send cadence |
| S12 VPS cron / timers | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S13 Beget cron / hosting scheduled tasks | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S14 Background workers / installed operator CLIs | DIRECT READ/FACT INTEGRATION | P01,P06 — measurement projection claims/audit and existing readers, no business effect |
| S15 Telegram handlers / commands / replies | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S16 Inbox | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S17 APNS | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S18 Web Push | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S19 Communication Delivery | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S20 Panel / GOD / admin | DIRECT READ/FACT INTEGRATION | P04,P06 — existing exact-role goal/analytics consumers |
| S21 Internal calendar | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S22 CRM / YClients adapters / helpers | DIRECT READ/FACT INTEGRATION | P01,P02 — bounded history, financial/attendance source interpretation |
| S23 Marketing / bulk | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S24 Finance / expense | DIRECT READ/FACT INTEGRATION | P02,P04 — financial/expense/goal measurement reads |
| S25 Loyalty / value / certificates | DIRECT READ/FACT INTEGRATION | P02 — read-only P4 ledger/card discrepancy |
| S26 Reviews | DIRECT READ/FACT INTEGRATION | P05 — source-qualified review/feedback aggregates |
| S27 Onboarding | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S28 Auth / identity | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S29 Maintenance | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S30 All direct database writer candidates | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S31 All direct provider / delivery candidates | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |
| S32 Legacy identity / projection fallbacks | PRESERVATION / EVIDENCE INPUT ONLY | P06 — Existing canonical runtime/launcher/owner remains unchanged; consume permitted metadata only; inherited guard and production attestation required |


Before implementation, P01/P06 must enumerate any new route/worker **inside these named groups** in the versioned implementation manifest; the group count cannot hide an unlisted entrypoint. No new independent launcher, channel or provider is proposed.
Tenant audit read is a planned new read endpoint within S01/S20, not a new surface group; it must be named in the implementation manifest. Its owner-only permission choice is D09.
S04 public site, S12/S13 host cron, S15 Telegram initiators, S16–S19 delivery, S21 internal-calendar writers, S23 marketing execution, S27/S28 onboarding/auth, S29 maintenance, S30–S32 writer/provider/fallback classes are preservation/evidence checks, not new feature mandates.

## 12. Completion Gate defined before coding

Gate status today: **DEFINED / NOT EXECUTED**. Implementation remains NOT STARTED.

### Required executable proof manifest

- All 22 Q acceptance rows: positive source proof, absent/incomplete/unavailable source, wrong tenant/Client/Staff and forbidden inference where applicable. Each row must reference its actual suite/test names and production receipt at completion; no unlinked PASS prose.
- Evidence chain: exact Opportunity/AgentTask/receipt/execution/attempt/CD/Appointment identity; missing links fail closed, User/phone coincidence does not bridge them; Client without Maya User supported through approved bindings.
- Outcome lifecycle: booked vs arrived vs paid; cancellation/no-show/deletion/refund; multiple touchpoints, duplicated/out-of-order events; source corrections within/outside frozen A29 window; current vs as-reported result; no double credit and no causal money without proof.
- Time/money: tenant timezone and DST/month boundaries; complete/incomplete matched periods; currency separation; zero vs missing; source-overlap ambiguity; confirmed salary vs booked money; goals unavailable/changed revisions; no invented 0.5 share.
- Reputation/value: native/provider/anonymous boundaries, source withdrawal/revision, tenant-local month, zero-denominator behavior; ledger/card mismatch remains read-only.
- Durability/privacy: same evidence/version retry, concurrent claim, crash before/after publication, delayed resume, UNKNOWN no new effect; retained/expired snapshots, unauthorized export/prompt disclosure, current role/consent/channel revocation; source history unchanged.
- Consumer parity: same asOf/version ⇒ same facts in HTTP, current PWA/proxy, AI/chat/realtime, Python report readers, dashboard/authorized PDF; no consumer-owned recalculation or read-triggered business effect.

### Permanent architectural ratchets required

| Guard class | Must reject |
| --- | --- |
| Measurement owner and lineage | Independent arithmetic/measurement writers in tools/PWA/Python/reports; phone/User authority; time-only link presented as proved attribution |
| Truth and semantic boundaries | `SUCCEEDED` ⇒ revenue; provider accepted ⇒ delivered; paid ⇒ arrived; unknown/missing ⇒ zero; cross-currency totals; frozen heuristic potential ⇒ earned |
| Business owners / provider / delivery | Measurement launching a booking, value/consent/expense write, direct provider operation, new communication slot/channel or retry after UNKNOWN |
| Source history and durability | Rewriting immutable execution/grant/source inputs; fake lineage/backfill; non-durable revision identity; silently reviving old effects |
| Authority, prompt/export and retention | Cross-tenant/Staff reads, revoked access, raw identifying data in prompts, arbitrary Client export, source-history purge outside approved owner |
| Release coverage | New guards omitted from mandatory tests; new entrypoint not assigned to the manifest; late PWA/Python/proxy/background changes without the relevant guard/proof |

### Aggregate and production gate

1. 6/6 package local acceptance; assigned Q rows all proved. Combined schema/foreign-key/unique/check/tenant/retention/claims tests, deterministic migration order, clean replay and no fake backfill for any approved schema.
2. Mandatory backend regression (current floor 411 suites / 3370 tests, preserved test membership plus new suites); current 93 architectural suites / 515 tests, 15 Python scanners and relevant existing executable proofs; newly added guards **wired into mandatory CI/deployment**, never standalone only. Legitimate membership changes require evidence, not a frozen numeric count shortcut.
3. Lint, application typecheck, scripts typecheck, build, Prisma validation; frontend/Python contract checks as applicable. No weakened gate or ignored failing suite.
4. Pre-deploy: HEAD=origin, baseline/release reconciliation, pending migrations exactly approved expected state, schema drift check. Existing documented deployment process only. Apply any approved migrations before dependent runtime; post-apply pending 0/drift NONE; no mixed-owner runtime.
5. Structural/read-only production verification on every S01–S32 group: exact release artifacts, active launchers/config/flags, enabled/retired paths, health/readiness and schema constraints. New business features proved with synthetic local fixtures, not real clients/messages/bookings/money.
6. Final traceability: every Q implemented/tested/production-verified; every package PASS; all approved decisions mapped; no unowned WIP or unidentified scope; Chapter6 contracts preserved. Deferred items explicitly out of scope, not quietly counted as complete.

Completion requires: **Q 22/22; packages 6/6; surface groups 32/32; all mandatory tests and guards PASS and wired; approved schema/pending/drift PASS; current production baseline certified; zero unresolved C7 business/schema decisions or WIP; zero acceptance-proof business/provider/message mutations.**
The future Chapter7 completion report must reference this manifest and any owner-approved scope revision. If scope changes, update counts and mappings before implementation, not after a misleading PASS.

Failure classification: REGRESSION / MISSING CHAPTER REQUIREMENT / DOCUMENTATION GAP / RELEASE-GATE GAP / NON-BLOCKING DEBT. A genuinely new unmanifested production path requires exact evidence and scope reconciliation; no automatic B60/B61 sequence or unrestricted rediscovery. Package-local implementation errors are repaired inside the approved scope.

## 13. Owner decisions and next boundary

One [Owner Decision Pack](CYCLE-07-OWNER-DECISION-PACK.md): **13 decisions D01–D13**, recommendations A, all **PENDING**.
It settles scope, attribution claims, late outcomes, financial/expense/goal semantics, period/reputation policy, privacy/export, retention, historical coverage, future scenario placement and legacy source-evidence admission together.
Schema/action mapping is the next bounded assessment **after** those product choices. No schema proposal, migration or runtime implementation has been performed in this cycle.

## 14. Final preflight status

```text
CHAPTER 6 BASELINE CERTIFIED: YES
CHAPTER 6 COMPLETE: YES
PACKAGE 4 COMPLETE: YES
PACKAGE 5 COMPLETE: YES
CHAPTER 6 CONTRACTS REOPENED: NO
CHAPTER 7 CANONICAL SPEC FOUND: YES — DISTRIBUTED
CHAPTER 7 REQUIREMENTS IDENTIFIED: 22
EXISTING FOUNDATIONS REUSABLE: 20 (9 EXISTS + 11 PARTIAL)
MISSING FOUNDATIONS: 3
LEGACY FOUNDATION GROUPS — DO NOT REUSE: 2
OWNER DECISIONS REQUIRED BEFORE IMPLEMENTATION: 13
EXPECTED IMPLEMENTATION PACKAGES: 6
EXPECTED IMPLEMENTATION WAVES: 4
PRODUCTION SURFACES IN ACCEPTANCE SCOPE: 32 (16 integration + 16 preservation)
CHAPTER 7 COMPLETION GATE DEFINED: YES — NOT EXECUTED
LOYAL/DORMANT >2 MONTH CLIENT SCENARIO PLACEMENT: SPLIT
RUNTIME CHANGES: 0
SCHEMA CHANGES: 0
MIGRATIONS: 0
PRODUCTION MUTATIONS: 0
CHAPTER 7 BUSINESS ACTIONS CREATED: 0
CHAPTER 7 STARTED: PREFLIGHT ONLY
CHAPTER 7 IMPLEMENTATION STARTED: NO
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES: 0
OWNED WATCHERS: 0
OWNED BROWSERS: 0
OWNED TEMP DATABASES: 0
PROCESS HYGIENE: 0
```

Final publication: docs/evidence-only commit and normal push to canonical origin; HEAD/origin equality checked after push. No force push, reset, revert, stash, clean, runtime deployment or Chapter7 implementation. **STOP.**
