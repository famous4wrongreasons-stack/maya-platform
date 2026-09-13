# Chapter 9 — consolidated Owner Decision Pack

Date: 2026-09-13. Baseline `bae6620c`. **16 decisions presented; 0 approved. No implementation/schema authorization.**

Read with [scope and 30-requirement manifest](CYCLE-09-PREFLIGHT-AND-SCOPE.md) and [machine-readable inventory](evidence/chapter9-preflight/manifest.json). Sources G/A/O/X/M/R/P refer to the scope source table. Recommendations are proposals, not historical approvals. All alternatives retain C6–C8 safety rules; unsafe alternatives such as direct agent writes, consent bypass or autonomous policy self-modification are not offered as choices.

Fixed before these decisions: one Orchestrator; four domains admin/lifecycle/occupancy/bi; capability-oriented service-business core; exact authority; AE/CD/source owners; UNKNOWN reconciliation; C7 facts; qualified C8 output; no C10 autonomous repeat. C8 0/8 numeric activation is valid and does not block any recommended option. “Admin Alpha” and agent-by-agent production learning have no located canonical contract; they are not silently added.

Expected schema/action statements below are impact categories, **not exact mappings/counts**. Shared strategy/identity/budget/evidence must be deduplicated across all packages in one later mapping. A draft, read, model call or delegation is not automatically an Action Engine business class.

## D1 — C9 product depth: recommendation through bounded execution

**Question:** What completes the user journey in C9, beyond the already fixed separation from C10? G §§2,7–10,18 and request §§9–11 permit user-requested orchestration; the activation depth must be explicit.

- **A — Recommend and coordinate the selected bounded plan after exact approvals.** The current request/selected Opportunity is the root. A user can stop at analysis or proposal. No standing autonomous initiation. Existing read-only/simple/direct tool paths remain available.
- **B — Recommendation-only initial release.** All execution continues manually through existing supported surfaces; durable execution coordination is explicitly deferred and C9 completion scope would need amendment. It is not equivalent to A.
- **Recommended: A. Why:** completes the planned C9 bridge without rebuilding execution owners or importing C10.
- **Business gains:** Maya can follow an approved plan to actual receipts and explain partial results. **Loses:** no unattended recurring campaigns or blanket AI approval; unsupported actions still require manual handling.
- **Boundary/owner:** Orchestrator proposes/coordinates; deterministic validators and existing source owners admit/execute. Probabilistic recommendation, deterministic authority.
- **Expected schema:** shared durable proposal/plan/outcome references. **Expected action impact:** adapters to existing actions; no agent-specific business executor. Exact extra lifecycle needs to be justified in mapping.
- **Dependencies/packages:** all; P01/P02/P04/P05/P06. Confirms product depth only, not a new roster or authority approval.

## D2 — Durable strategy and plan representation

**Question:** What persists across conversation, restart and approval when AgentTask is only a C5 assignment and old AiBrainSession.planJson is unsuitable?

- **A — One shared prospective strategy-revision/run representation.** Immutable material proposal, selected option, scoped evidence/policy/registry versions, deterministic step dependency graph, original request identity, approval/action/outcome refs. New revision on material edits. Working reasoning is transient; no copied business ledger.
- **B — Immutable proposal document plus independent action receipts only.** Less persistence, but no general partial-plan restart guarantee; owner manually resumes remaining work. This reduces the advertised C9 capability.
- **C — Separate strategy stores per agent.** More independent evolution, but duplicated identity/approval/retention and harder cross-agent restart. Not recommended.
- **Recommended: A. Why:** one durable coordination owner avoids six parallel systems and preserves source independence.
- **Business gains:** recoverable plans and auditable changes. **Loses:** materially changed plans cannot be silently reused; requires a new shared durable foundation.
- **Boundary/owner:** source facts remain C6/C7/C8; Orchestrator owns only strategy/run references and deterministic lifecycle. LLM cannot rewrite admitted state.
- **Expected schema:** likely shared new durable representation, tenant-qualified revision/identity/FK/claim constraints; exact models/fields not chosen. **Actions:** pure planning not inflated into AE; actual effects retain existing classes.
- **Retention/versioning:** D11 validity, D14 retention; no fake historical plans/backfill. **Dependencies/packages:** D1,D4,D10–14; P01/P05.

## D3 — Number of strategy alternatives and comparison

**Question:** How much choice should the owner see without invented comparative revenue?

- **A — At most three admissible alternatives, including “do not act” when meaningful; recommend one with evidence and tradeoffs.** Fewer if only one is valid. Never pad to three. Show expected money/probabilities only from qualified sources; a qualitative option is not a statistical forecast.
- **B — One recommendation; alternatives only on explicit request.** Simpler initial interaction but tradeoffs are less visible.
- **C — Always ask the owner to formulate the alternatives.** Lowest model discretion, more owner work.
- **Recommended: A. Why:** makes decisions understandable while bounding cost and choice.
- **Business gains:** transparent comparison of contact/no-contact/supported offers. **Loses:** no exhaustive optimizer, guaranteed ROI or unsupported discount generator.
- **Boundary/owner:** LLM drafts options; deterministic capability/policy/budget/consent checks filter them. C8 retains ranking/value ownership; strategy ranking is an explained recommendation, not a new CLV model.
- **Expected schema:** options under shared strategy revision, no separate option-evidence owner. **Actions:** none for comparison; existing offer/marketing actions only after selection and approval.
- **Dependencies/packages:** D1,D2,D10; P04, with P02 explanation.

## D4 — Approval granularity and source-owner receipts

**Question:** Can the owner confirm a bounded plan in one review while preserving each existing action contract?

- **A — One plan review with an explicit per-step approval matrix.** Bind the selected immutable revision, tenant/actor, exact audience/content/offer/route constraints, monetary/action limits and validity. Reuse a source owner's existing compound approval only where that contract already permits it. Otherwise obtain its separate exact receipt before the step. No implication that one C9 click overrides Client consent, expense-card confirmation, booking confirmation or required campaign approval.
- **B — Always ask immediately before every effectful step.** Maximum intervention, slower plans and more abandonment.
- **C — Strategy approval authorizes only preparation; each source surface completes all confirmations separately.** Safer integration fallback, weaker end-to-end experience.
- **Recommended: A. Why:** minimizes repeated prompts without inventing transferable authority.
- **Business gains:** clear bounded commitment and fewer redundant approvals. **Loses:** some heterogeneous plans still need several confirmations; changed intent requires reapproval.
- **Boundary/owner:** existing approval/AE/source action owners remain authoritative; Orchestrator holds references. Deterministic actor/scope/hash/current-policy checks, not LLM approval inference.
- **Expected schema:** strategy/approval/receipt linkage; exact reuse of AiApprovalRequest and AE evidence to be proven. **Actions:** no “approve all AI” class; new lifecycle class only if later mapping demonstrates a real missing owner operation.
- **Dependencies/packages:** D2,D7,D11–13; P01/P05.

## D5 — Opportunity admission and user request identity

**Question:** Which events may begin a C9 strategy, and must every request create an Opportunity?

- **A — Explicit authenticated user request or user selection of a current eligible Opportunity.** Preserve source Opportunity revision/evidence; direct legitimate requests may have no Opportunity. Reject/supersede stale input before new effect. Same logical user request resumes the same plan; do not manufacture Opportunities merely to fit a schema.
- **B — Opportunity-only entry.** A free-form request must first become an eligible Opportunity through the existing owner; narrower workflow, more admission overhead.
- **C — User request only in v1; Opportunity selection deferred.** Simple but disconnects the already-built C5/C8 foundation.
- **Recommended: A. Why:** uses both documented intent and Opportunity paths without autonomous initiation.
- **Business gains:** natural conversation and evidence-linked work queues. **Loses:** a new Opportunity does not automatically start a strategy or send anything.
- **Boundary/owner:** Opportunity qualification/lifecycle remains its existing owner; C9 request admission cannot upgrade SOURCE_LABELLED/unqualified evidence. Deterministic eligibility, LLM objective parsing only.
- **Expected schema:** optional exact Opportunity/AgentTask references and durable request identity, shared with D2. **Actions:** no new Opportunity detector or autonomous worker.
- **Dependencies/packages:** D1,D2,D11; P01/P02/P04/P05. Broader bridge credential/signing prerequisites remain before L3, not falsely completed here.

## D6 — Agent/capability/skill registry form

**Question:** How should the fixed four-domain roster discover actual runnable capabilities?

- **A — Versioned code registry composing existing tool/action/feature/provider/authority definitions.** Four domains only; typed input/output/context profiles/AgentResult@1; skill bundles are reviewed reasoning guidance and fixtures. Unknown or unavailable capabilities fail closed. Availability is the intersection of tenant/role/scope, readiness, entitlement, provider support, current policy and limits.
- **B — Versioned tenant-admin-managed dynamic registry.** More runtime customization, but adds a separate authoring/validation/promotion/security contract and persistence. It cannot give new action authority.
- **C — Hardcoded per-agent tool lists without a composed capability view.** Smallest initial change but duplicates readiness and risks inconsistent promises; not recommended.
- **Recommended: A. Why:** matches G §§5–7/16 and keeps one truthful availability source.
- **Business gains:** honest supported/unavailable explanations and controlled extensibility. **Loses:** no marketplace, arbitrary tenant tools, runtime-created agents or external plugin execution.
- **Boundary/owner:** registry describes existing owners; it does not execute business effects. LLM selects among admitted options only.
- **Expected schema:** registry itself can be code-only; durable plan stores immutable version refs. **Actions:** no action per capability entry; provider connector extensions are not implicit approval.
- **Dependencies/packages:** D2,D7,D15; P01/P02. Four-domain roster is fixed; separate Reputation/Marketing agents remain outside scope.

## D7 — Read authority and BI write ambiguity

**Question:** Resolve the historic BI expense-completion allowlist vs the explicit read-only BI definition, and prevent lifecycle from acquiring finance privilege.

- **A — Strict read-only BI; all agents receive minimum source-authorized projections.** Financial Client ranking is available only when the initiating principal has existing C8 finance rights. Staff sees own allowed scope. Manager status alone gives no finance access. A period-completion request is handed by the Orchestrator to its existing independently confirmed action path, not executed by BI.
- **B — BI may also draft an action intent for expense-period completion, still requiring the existing separate confirmation/owner.** No direct mutation, but broadens the specialist's proposal contract beyond read-only reasoning.
- **Recommended: A. Why:** follows G §§3.1/14 and later C6–C8 access contracts without removing the existing business operation.
- **Business gains:** predictable specialist boundaries and no cross-agent information leak. **Loses:** BI cannot independently operate the expense workflow; finance-denied users cannot ask lifecycle to reveal financial ranking.
- **Boundary/owner:** deterministic authority from authenticated User/Membership/Client binding and existing readers, never prompt/persona/history. No cross-tenant context pooling.
- **Expected schema:** reuse existing authority; safe projection contract/code. **Actions:** existing action adapter outside BI only; no new business class.
- **Dependencies/packages:** D4,D6; P01/P02/P04/P06.

## D8 — Multi-vertical tenant profile and conversational policy intake

**Question:** How much configuration should C9 complete, beyond existing partial onboarding/A22 namespaces?

- **A — Bounded typed profile/policy draft for the documented C9 needs.** Ask only relevant missing facts/constraints; propose vertical defaults; show differences and explicitly confirm through existing A22/configuration owner. Reuse existing source fields; unavailable facts remain unavailable. One-person business skips staff payroll questions. No automatic universal cadence/value rule.
- **B — Read existing confirmed policy only; all missing configuration stays in forms/manual setup.** Smaller delivery, but defers the canonical conversational onboarding target and would require explicit scope reduction.
- **C — Full generic configurable business ontology/rules designer.** Broader than current need; new open-ended policy platform, not recommended.
- **Recommended: A. Why:** satisfies the later normative service-business addendum with a bounded interface.
- **Business gains:** Maya adapts to barbershop, beauty, dental and auto-service contexts without four separate products. **Loses:** unsupported clinical/vehicle/other domain facts cannot be invented; complex custom rules wait for an explicit supported contract.
- **Boundary/owner:** LLM proposes draft; deterministic schema/authority validation + owner confirmation persists via A22. Tenant policy is not instruction to bypass security/consent.
- **Expected schema:** typed namespace/profile mapping may require approved forward CHECK/contract changes or source refs; not arbitrary JSON under business_rules. **Actions:** reuse A22; no new tenant policy executor.
- **Dependencies/packages:** D6,D7,D13; P03. Exact supported policy fields must be frozen in combined mapping.

## D9 — External source and report-policy intake

**Question:** What does “connect this page/source” or “send me this report” mean in C9?

- **A — Confirm bounded source reference and truthful capability status; use existing supported connectors/report owners.** Link-only is not monitoring/API authority. Credentials go to secure existing integration UI/OAuth. Owner-confirmed report configuration uses existing OwnerReportRun/A12/CD and its immutable plan; no execution inferred from chat history. Unsupported connector/report configuration is shown explicitly and not activated.
- **B — Link-only reference and manual existing report download.** No new governed source/report preference intake; less capability, smaller schema.
- **C — Add new scrapers, monitoring and connectors now.** Open-ended provider scope and new effects; requires separate manifests/contracts, not recommended or approved by this preflight.
- **Recommended: A. Why:** implements the documented truth/approval boundary without promising new integrations.
- **Business gains:** secure guided setup and honest supported report preferences. **Loses:** pasting a URL does not obtain data; missing connector capability remains unavailable. No PushSMS integration.
- **Boundary/owner:** source binding/configuration owner, secure connector, OwnerReportRun/A12/CD; Orchestrator is intake only. Existing scheduled reports do not authorize recurring strategy initiation.
- **Expected schema:** bounded confirmed source/report-policy reference contract if existing representation is insufficient; one combined mapping must assign owner/retention. **Actions:** existing integration/config/report ingress; no direct send or scraper class by inference.
- **Dependencies/packages:** D8,D13,D14; P03/P05/P06.

## D10 — Delegation, AI cost and business spend limits

**Question:** Existing per-tool timeouts/three-round loop do not bound a multi-agent plan's total cost. What finite envelope should govern it?

- **A — Hard per-request and per-plan admission limits.** Proposed C9 request defaults: at most **2 domains**, **6 tool calls/domain**, **12 total calls**, **120 seconds total reasoning wall time**; each tool retains its own shorter timeout/limits, and unstarted work stops at the global limit. No agent-to-agent recursion. Explicit model/task token and monetary ceilings are release/tenant configuration, enforced before external model work; if no valid ceiling/cost basis exists, allow deterministic reads only and return the limit reason. Exact values and reservation accounting are frozen in combined mapping before implementation, not invented during a retry. No automatic background continuation.
  Business exposure is separately bounded by selected plan: recipient/action count, supported currency, campaign/provider fees and any existing-owner discount/offer cap. An unpriced new paid effect is not admitted. Existing capability with provable zero charge need not be labelled paid. An owner approves limits, not unlimited spend. Retry cannot reserve a new logical budget or reset counters.
- **B — Preserve only per-tool limits and require owner confirmation for each additional agent turn.** Smaller global accounting but fragmented experience and weaker predictable whole-plan cost.
- **C — Disable multi-agent reasoning until a separate commercial budget cycle.** Most conservative, defers core C9 orchestration.
- **Recommended: A. Why:** keeps work bounded without pretending current token logs are an admission ledger.
- **Business gains:** predictable effort/exposure and explicit partial results. **Loses:** some complex tasks need a new request or higher explicitly configured cap; slow tools may be interrupted before their standalone timeout.
- **Boundary/owner:** deterministic budget admission/reservation/reconciliation for coordination; existing billing/financial/action owners keep actual charges. LLM cannot set its own allowance. No price catalogue or FX rewrite.
- **Expected schema:** durable budget/usage/claim references likely shared with plan/run; exact mapping required. **Actions:** no parallel spend/payment executor; preserve existing paid operation owners.
- **Dependencies/packages:** D2,D6,D11,D12; P01/P02/P05. The numeric defaults are proposed owner policy, not already approved canon.

## D11 — Strategy validity and stale evidence

**Question:** How long may a proposal remain actionable without treating old facts/policy as current?

- **A — Proposed maximum proposal/approval request validity 24 hours from first admission, shortened by source/action/quote/policy expiry.** Re-check current authority and material evidence before admission/remaining effects. Availability slots and ephemeral quotes keep their much shorter source validity. No retry extends a deadline. Expired/superseded material proposal needs a new reviewed revision. Already-admitted source executions retain their own durable policy/UNKNOWN semantics; a plan cannot cancel their history or revive an expired source intent.
- **B — Same-conversation-session validity only.** Simpler but owner cannot reliably return later to confirm.
- **C — Up to seven days with mandatory full preview revalidation.** More convenience; higher stale-scope/reapproval burden and more misleading old recommendations.
- **Recommended: A. Why:** allows ordinary delayed review with bounded freshness and respects stricter existing owners.
- **Business gains:** restart-safe review with honest expiry. **Loses:** stale audience/pricing/availability must be re-reviewed; no indefinite approval.
- **Boundary/owner:** deterministic plan validity separate from source policy-evidence freshness. No LLM judgement that expired evidence is “close enough”.
- **Expected schema:** immutable admission/expiry/current/supersession refs in shared plan. **Actions:** source actions unchanged; plan lifecycle mapping pending.
- **Dependencies/packages:** D2,D4,D5,D10,D12; P01/P05.

## D12 — Partial failure, cancellation and resumption

**Question:** Should an unrelated approved branch stop when another branch fails or becomes UNKNOWN?

- **A — Deterministic dependency graph.** Stop descendants of a failed/unresolved slot; independent already-approved branches can continue within original caps. UNKNOWN reconciles the same execution; never becomes permission for another channel/provider/effect. Confirmed success skips. Owner cancellation stops unstarted eligible work and reports completed effects without claiming rollback. A changed strategy is a new proposal, not automatic substitution.
- **B — Stop all remaining plan work on any failure/UNKNOWN.** Simpler and conservative, but independent tasks remain unnecessarily unfinished.
- **Recommended: A. Why:** preserves C6 partial-resume semantics while making dependencies explicit.
- **Business gains:** useful partial completion and restart safety. **Loses:** no automatic compensation, replacement campaign or retry to a different channel; unresolved provider outcome may need existing manual reconciliation.
- **Boundary/owner:** Orchestrator coordinates refs; AE/CD/provider owner alone determines actual effect outcome. A tool timeout before mutation is not proof that a provider mutation failed.
- **Expected schema:** durable step dependency/claim/outcome references in shared run, no copied AE state machine. **Actions:** reuse existing reconciliation/cancel capabilities only where supported.
- **Dependencies/packages:** D2,D4,D10,D11; P05, integrated with P04.

## D13 — Conversational material changes and confirmation

**Question:** How should “без скидки”, “только эта группа” or “позже” change a plan?

- **A — Parse into a typed proposed constraint/revision, show the material delta, validate and reconfirm affected intent.** General conversation is not approval. The supported confirmation surface submits the exact durable identity/hash/actor scope. Cosmetic presentation may preserve identity only if deterministic normalization proves no semantic change. Tenant policy changes are a separate explicitly confirmed A22 operation; a one-off constraint need not permanently alter policy.
- **B — Any edit replaces the entire draft and requires a full new review.** Less precise but simple; unnecessary confirmation for cosmetic changes.
- **C — Editing only through structured forms.** Strong syntax, weaker conversational experience; still no permission gained by editing.
- **Recommended: A. Why:** natural interaction without keyless/heuristic mutation authority.
- **Business gains:** clear revisions and scope changes. **Loses:** an ambiguous “да” cannot execute an unbound or changed plan; clarification is sometimes necessary.
- **Boundary/owner:** probabilistic interpretation, deterministic materiality/validation and canonical confirmation. Chat history is not evidence of a standing approval.
- **Expected schema:** shared revision/intent/confirmation binding, existing confirmation/receipt reuse first. **Actions:** A22 and source actions remain owners.
- **Dependencies/packages:** D2,D4,D8,D11; P03/P05/P06.

## D14 — Working memory and new derived retention

**Question:** What C9 evidence persists, for how long, without becoming a second customer database?

- **A — Turn-local working memory; proposed 365-day maximum for new derived strategy/decision/usage evidence from first admission.** Keep minimal source refs, rule/prompt/registry/policy versions, safe public rationale, hashes, limits and outcomes. No retry extension. No copied contact lists/raw messages/provider payloads/secrets/hidden reasoning. Reference expiry can make old reconstruction unavailable. Explicit holds, tenant deletion and FK cleanup must be mapped under AC6 before schema approval. Existing source/security/finance/consent/execution retention is unchanged; existing explicit-note retention is not silently altered.
- **B — 90-day maximum for new derived artifacts with the same minimization and source protections.** Less data retained, shorter review/history window.
- **C — Proposal history only until completion/expiry, retaining source receipts separately.** Minimal storage but weak strategy-level audit/restart investigation.
- **Recommended: A. Why:** practical review history aligned with existing derived-artifact precedent, without claiming that C7/C8 retention automatically applies to a new owner.
- **Business gains:** explainable plan revisions and retrospective review. **Loses:** not indefinite memory, not CRM contact export, no guarantee every expired source can be replayed forever.
- **Boundary/owner:** source owners retain facts; Orchestrator retains derived refs; AC6 cleanup owns deletion/minimization. Explicit notes are untrusted human context, not policy/fact or synthetic “confidence 100”.
- **Expected schema:** retention/hold/lifecycle evidence on shared representation; counts deferred. **Actions:** AC6 leaf likely needed, exact number/owner mapping pending; no source cascade deletion.
- **Dependencies/packages:** D2,D9,D15; P01/P06.

## D15 — Skills, prompt versions, evaluation and alleged agent learning

**Question:** What quality-improvement mechanism belongs to C9 when no canonical production peer-training contract was found?

- **A — Reviewed versioned code/skill/prompt bundles plus offline per-domain and cross-domain scenario evaluation.** Fixed input fixtures, typed-output/schema checks, groundedness/permission/tool/consent/budget/UNKNOWN tests, four vertical contexts and limited-data cases. A model critic may assist offline review but cannot approve a production policy, grant access or be the sole security oracle. Promotion is normal reviewed release, not automatic self-training. No fifth production “trainer agent”. Exact rubric/thresholds and regression corpus are frozen in the combined mapping.
- **B — Deterministic templates only for initial agents.** Lower model variability, substantially weaker conversational strategy capability; no claim of intelligent open-ended reasoning.
- **C — A separate research proposal for online peer training after C9.** Future independent scope/authority/data/retention decision, not part of this implementation. It does not replace required offline quality gates.
- **Recommended: A, with online peer training explicitly deferred/unassigned. Why:** matches documented prompt/testing foundations without inventing history or conflating it with C8 model calibration.
- **Business gains:** measurable, reviewable reasoning changes and controlled releases. **Loses:** no autonomous prompt/policy/skill rewriting or “agents teach each other live” feature claim.
- **Boundary/owner:** humans/release process promote approved code; deterministic checks govern authority; C8 owns numeric model training. Offline scoring is not business truth or a production approval.
- **Expected schema:** prefer code manifests and safe shared evaluation refs first; no online-learning database by default. **Actions:** no production learning action; no new policy self-modification owner.
- **Dependencies/packages:** D6,D7,D14; P06 plus package-local corpora.

## D16 — Rollout, supported surfaces and C10 handoff

**Question:** How do we release the fixed scope without treating all old roadmap capabilities as new requirements?

- **A — Six packages/four waves, BI first, then bounded Admin/Lifecycle/Occupancy and approval orchestration.** Validate all 32 inherited surface groups; integrate only supported existing channels/owners and keep maintenance/PWA backups in their accepted state. Preserve existing always-present Core; feature/tenant availability uses resolved existing entitlements, no new pricing/plan semantics inferred. New capability may remain unavailable for an unsupported provider without failing honest C9 behavior.
- **B — Release BI alone and explicitly defer the other three domains/handoff.** Smaller first delivery, but changes the proposed C9 completion scope and cannot be called full six-package completion.
- **C — Include Reputation/Marketing agents, new connectors and autonomous follow-up in the same cycle.** Expands roster and chapter boundaries; requires a separate change proposal, not recommended.
- **Recommended: A. Why:** matches G M0/M1/M2/M5 and the completed C6–C8 dependency state.
- **Business gains:** a finite delivery and consistent cross-channel status/approval experience. **Loses:** no restored maintenance site without separate authorization, no new contact export/PushSMS, no autonomous repeated loops, no separate Reputation agent by implication.
- **Boundary/owner:** P06 release coverage verifies existing authority, not blanket channel access. C10 separately decides L3/L4 policies, repeated initiation, operator controls and remaining qualified bridge prerequisites.
- **Expected schema:** no extra schema from rollout itself; shared prior decisions only. **Actions:** no C10 autonomous scheduler/class or new delivery owner.
- **Dependencies/packages:** D1–15; P01→P02+P03→P04+P05→P06.

## Consolidated impact and approval block

The following block is a recommendation only. None of D1–D16 is approved by preparing this document. Fixed C6–C8 contracts and four-domain architecture are not reopened.

```text
D1: APPROVE A
D2: APPROVE A
D3: APPROVE A
D4: APPROVE A — EXACT SOURCE-OWNER RECEIPTS REMAIN REQUIRED
D5: APPROVE A
D6: APPROVE A
D7: APPROVE A — BI READ-ONLY; NO FINANCE PRIVILEGE BY DELEGATION
D8: APPROVE A
D9: APPROVE A — EXISTING SUPPORTED CONNECTORS/REPORT OWNERS ONLY
D10: APPROVE A — FINITE LIMITS; EXACT COST CONFIGURATION IN COMBINED MAPPING
D11: APPROVE A — 24H MAXIMUM, STRICTER SOURCE EXPIRY WINS
D12: APPROVE A
D13: APPROVE A
D14: APPROVE A — 365 DAYS FOR NEW DERIVED ARTIFACTS ONLY
D15: APPROVE A — OFFLINE EVALUATION; ONLINE PEER TRAINING DEFERRED/UNASSIGNED
D16: APPROVE A
```

After approval, **one** combined schema/action/retention/evaluation mapping must prove: existing owner reuse; exact new/altered models/fields/constraints/FKs; immutable request/revision/action linkage; concurrent admission/resume; AI/business budget claims; source/tenant isolation; no duplicate evidence/period/approval owners; prospective cutover/backfill0; holds/retention/source independence; task-class prompt/evaluation versions and thresholds; exact endpoint surface mapping; deterministic migration order; finite release guards. No implementation before that envelope is approved.

- **Expected shared gaps:** durable strategy/run references, composed capability registry, typed context/result, coordination budget, bounded policy/source/report intake, reviewed reasoning/evaluation, remaining consumer contract closure.
- **New models / fields / AE classes / AC6 classes / migrations:** NOT MAPPED, not claimed zero; do not sum speculative per-decision mentions.
- **Historical backfill:** proposed NO. No invented past strategy, Opportunity, approval, execution or causal lineage.
- **Packages:** 6; **waves:** 4; **requirements:** 30; **surfaces:** 32.
- **Owner decisions presented:** 16/16; **approved:** 0/16.
- **Next authorized scope:** owner review, then combined mapping if approved. **C9 implementation ready now: NO.**
- **Runtime/schema/migration changes this step:** 0; **production mutations:** 0; **C10 started:** NO.
