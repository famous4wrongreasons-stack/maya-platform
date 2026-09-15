# Section 0-B — Key-space reconciliation

## 0-B.0 Status, precedence, and how every fact below was obtained

**S0B.1 — status and precedence.** This section is **normative** and carries **the same precedence as Section 0** over §§1–4 and over Annex A. Where 0-B and §§1–4 conflict, 0-B governs. Where 0-B and Annex A conflict, 0-B governs. Where 0-B and Section 0 conflict **on a key-space matter** — which key space a rule is evaluated over, which registry supplies a property, or which function is total over which domain — **0-B governs**, because Section 0 wrote those rules before the key spaces were separated and could not have seen the divergence; everywhere else Section 0 stands unchanged. Every ruling of Section 0 that this section does not name survives verbatim. *Mechanism:* the errata table of §0B.9 is an input to the emission validator, the mint function, the gateway and the CI suites alongside §0.16's; a build test asserts that no implementation reads a clause this section marks **VOID**. *Evaluation point:* `EP-BUILD`.

**S0B.2 — what this section is for, stated plainly.** Section 0 repaired the fences. It wrote them across **three different capability key spaces** without saying so. The mechanisms it named all exist; several of them cannot be evaluated over the keys the rule hands them, and therefore do not do the work claimed. A fence that names a real mechanism which cannot take the key is not a weaker fence — it is **no fence**, with the additional harm that it reads as one. This section publishes the three key spaces, publishes the mapping between them, and re-expresses every conferral fence over the one key space that governs whether an effect happens.

**S0B.3 — verification method: the registries were executed, not grepped.** Every count, membership and property below was obtained by **loading the registry modules in a Node process and enumerating them**, against the working tree at

`/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/maya-saas-backend`

on branch `codex/maya-brain-systemic-release-20260815`. `ActionCapabilityRegistry.list()` was enumerated in full (226 rows); `canonicalProductionPolicyDefinitions()` was enumerated in full (221 rows); `MAYA_AI_TOOL_CATALOG` was enumerated in full (47 rows); `C9_CAPABILITIES` was read from `c9.registry.ts` (47 + 9 = 56 rows). **This matters: a `grep` over the registry source undercounts, because most capabilities are constructed by template functions, not written as literals.** The most consequential instance: `'financial'` appears **8 times as a literal** in `action-engine.registry.ts`, but **12 registered capabilities carry the token**, because two of those literals sit inside templates instantiated three times each. A fence audited by grep over that file would have been audited against the wrong number. *Mechanism:* the totality assertions of §0B.13 and §0B.24 enumerate the registries at process start rather than trusting any transcribed list. *Evaluation point:* `EP-REGISTRY-LOAD`.

**S0B.4 — Annex A's vocabulary is adopted unchanged.** `[EXISTS]`, `[ABSENT]`, `[PARTIAL]`, `[UNENFORCEABLE-TODAY]` and **`NORMATIVE-PENDING`** (§A2) mean here exactly what they mean there, including §A2.2's definition of "no actuating control": a `Limitation` with a non-null `capability_gap_ref`, `remedy_intents` empty, and **no intent of effect `DRAFT`, `REQUEST_APPROVAL` or `COMMIT`**. New prerequisites registered by this section are numbered continuing Annex A's series and are listed in §0B.8.

---

## 0-B.1 The three key spaces (B1)

**S0B.5 — there are three capability key spaces in this system, and they are disjoint in what they govern.** They are named **C9-CAP**, **TOOL-DEF** and **AE-CAP**. No fourth exists. The widget layer's own `CONTROL_REGISTRY` (§0.22) is a fourth *namespace* but not a capability key space: it is closed at three keys, has no registry row anywhere in the backend, and is already handled by §0.22–§0.23; it is listed here for completeness so that the dispatch of §0B.31 is total.

| | **C9-CAP** | **TOOL-DEF** | **AE-CAP** |
|---|---|---|---|
| **Identifier type** | `C9Capability.capabilityKey: string` | `AiToolDefinition.name: string` | `RegisteredActionCapabilityV1.capability: string` |
| **Declared at** | `src/orchestration/c9.registry.ts:52–70` (the type), `:110–160` (the population) | `src/ai-tools/ai-tool.types.ts` (the type), `src/ai-tools/ai-tool.catalog.ts` (`MAYA_AI_TOOL_CATALOG`) | `src/action-engine/action-engine.contract.ts:170–195` (the type), `src/action-engine/action-engine.registry.ts:3444` (`CAPABILITIES`), `:3889` (`ActionCapabilityRegistry`) |
| **Cardinality (verified by enumeration)** | **56** = the 47 `MAYA_AI_TOOL_CATALOG` names + 9 extras | **47** | **226** |
| **Lookup** | `c9Capability(key, domain, registryHash)` — `c9.registry.ts:180` | `AiToolRegistryService.get(name)` | `ActionCapabilityRegistry.get(key)` — `action-engine.registry.ts:3894`; `.list()` — `:3913` |
| **Governs** | the **C9 orchestration run**: `mode` (`READ` / `PROPOSE_ONLY` / `OWNER_HANDOFF`), `resourceClass` (`LOCAL` / `SOURCE_READ` / `SOURCE_HANDOFF`), `domains`, `principalKinds`, `timeoutMs`, `maxInputBytes` / `maxOutputBytes`, `evidencePolicy`, `approvalAdapter`, `idempotencyAdapter` | the **AI-tool surface**: which tool names an LLM principal may see and call — `allowedRoles`, `allowedSurfaces`, `riskTier`, `approvalPolicy`, `requiredFeatures`. Enforced by `AiToolPolicyService.listAllowed` / `.assertCanExecute` (`ai-tool-policy.service.ts:59`) / `.assertCanDecide` (`:97`) | **whether an effect happens.** `actionClass`, `targetKind`, `allowedSourceTypes`, `riskFacets`, `policyKey`/`policyVersion`, `policyDecision`, `autonomyLevel`, `approvalRequirement`, `approvalTtlMs`, `executorKey`, `normalizeInput`, retention. Enforced by `CanonicalActionPolicyResolver.resolve()` (`action-engine.policy-resolver.ts:315`) and `ActionEngineKernel` |
| **Does NOT govern** | **whether any effect happens.** `mode` is a *run mode of a C9 capability*, not an Action Engine gate. `OWNER_HANDOFF` means "the C9 run hands this to an owner"; it is read by no Action Engine code path and appears nowhere under `src/action-engine/` | **whether any effect happens**, and **anything about an Action Engine capability**: `AiToolDefinition` exists only for the 47-name catalogue, so `assertCanExecute(principal, definition)` **cannot be called with an AE-CAP key at all** — there is no definition to pass | the **widget layer's presentation, the C9 run, or the AI-tool surface.** `RegisteredActionCapabilityV1` carries no role, no surface, no `riskTier`, no `approvalPolicy`, and no `mode` |
| **Fail-closed on an unknown key** | `c9Deny('capability_not_registered')` | policy denial (`ForbiddenException`) | `ActionContractError` from `.get()`; `CanonicalActionPolicyRegistry.get()` throws `Canonical policy profile is not registered` (`policy-resolver.ts:198`) |

**S0B.6 — AE-CAP carries two co-keyed tables, and both are total over it.** Besides `RegisteredActionCapabilityV1`, the key space AE-CAP is also the key of **`CanonicalActionPolicyDefinitionV1`** (`action-engine.policy-resolver.ts:72–84`), which carries `actorPolicy`, **`allowedActorRoles: readonly UserRole[]`**, `trustedServiceSourceTypes`, `requiredFeatures`, `permissionCodes`, `approverPolicyKey`, `clientPrincipalTarget`, `validityMs`. It is generated by `canonicalProductionPolicyDefinitions()` (`action-engine.policy-registry.ts:180–220`) **as a total map over `ActionCapabilityRegistry.list()` minus `kernel.test.*`** — verified: 221 definitions for 226 capabilities, the five omissions being exactly the five `kernel.test.*` synthetics. **This is the single most important fact in this section: an authority table keyed on AE-CAP already exists and is already total.** Every fence this section repairs is expressed over one of these two tables.

**S0B.7 — a rule citing a key MUST name its space.** A bare capability string in a normative sentence is **void from this section forward**. The wire and in-memory form is:

```ts
type CapabilitySpace = 'C9' | 'TOOL' | 'AE' | 'CONTROL';

type CapabilityRef =
  | { space: 'C9';      key: string }          // C9Capability.capabilityKey        — 56
  | { space: 'TOOL';    key: string }          // AiToolDefinition.name             — 47
  | { space: 'AE';      key: string }          // RegisteredActionCapabilityV1.capability — 226
  | { space: 'CONTROL'; key: ControlKey };     // §0.22, closed at 3

type ControlKey = 'control.run.cancel' | 'control.widget.dismiss' | 'control.delivery.resolve';
```

`WidgetIntent.capability`, `WidgetIntent.handoff_capability_ref`, `IntentTarget` of class `c`, `IntentRecord.capability`, every row key of `WIDGET_CAPABILITY_POLICY`, and every argument of `subjectCapability`, `subjectFloor`, `requiredConfirmationKind` and `verificationFloor` are typed `CapabilityRef`, never `string`. §0.32's two-space rule is preserved and extended to four: only `REFINE`, `DRAFT`, `HANDOFF` and a class-`c` `NAVIGATE` may carry a `C9` ref; only `COMMIT` and `REQUEST_APPROVAL` may carry an `AE` ref; only `CONTROL` may carry a `CONTROL` ref; **no intent of any effect class may carry a `TOOL` ref** (§0B.41 P-24). *Mechanism:* the discriminated union above, plus `validateEnvelope`'s per-effect membership check against `C9_CAPABILITIES`, `ActionCapabilityRegistry` and `CONTROL_REGISTRY` respectively; a source test asserts zero `capability: string` declarations in the widget layer. *Evaluation points:* `EP-MINT`, `EP-INGRESS` Gate 7, `EP-BUILD`.

**S0B.8 — the spelling relationships, verified.** TOOL-DEF ⊂ C9-CAP **by spelling**: all 47 catalogue names are C9-CAP keys (`c9.registry.ts:110–118` maps the catalogue one-for-one). The 9 C9-only extras are `c7.measurement.read`, `c8.result.read`, `b35.preview`, `b35.status`, `b35.confirm`, `a22.configuration`, `owner_report.status`, `owner_report.download`, `c9.no_action`. **AE-CAP ∩ (C9-CAP ∪ TOOL-DEF) = ∅** — verified by intersection over the enumerated sets; the two spaces share no spelling. A key that resolves in one space and not another therefore cannot be diagnosed by "the key is wrong"; it is **in the wrong space**, and the only way to see that is to name the space.

**S0B.9 — a C9-CAP key and its identically-spelled TOOL-DEF key carry different, independently-authored properties.** `C9Capability.mode` is computed as `tool.riskTier === 'read' ? 'READ' : 'PROPOSE_ONLY'` (`c9.registry.ts:114`), so **no catalogue tool is ever `OWNER_HANDOFF`**; the only two `OWNER_HANDOFF` keys in the whole of C9-CAP are the extras `b35.confirm` and `a22.configuration` (`c9.registry.ts:135–150`). Reading a `mode` as if it were a tool property, or a `riskTier` as if it were a C9 property, is a category error the type of §0B.7 now prevents.

**S0B.10 — no code maps a C9-CAP key to an AE-CAP key. Verified.** `src/ai-tools/` imports nothing from `action-engine.registry` (0 hits). `src/action-engine/` imports nothing from `src/orchestration/` (0 hits). The single edge between the trees is `c9.contract.ts:3` importing `stableActionJson` from `action-engine.identity` — a hashing utility, not a key-space bridge. **The mapping of §0-B.2 therefore does not exist in code and cannot be derived from code; it is a widget-layer table that this contract must publish, populate and keep total.** §0.32's ruling — "the conversion never happens in the widget layer; the canonical draft owner names the Action Engine key the `COMMIT` will carry" — is preserved and is now the *runtime* rule; §0-B.2 is the *build-time* table that says which pairings are admissible at all, so that an owner naming an unexpected AE key is refused rather than trusted.

---

## 0-B.2 The mapping (B2)

**S0B.11 — the mapping table, verified call site by call site.** Each row was established by tracing the AI-tool handler's dispatch (`ai-tool-handler.service.ts:340–440`) through its service to a literal AE-CAP key or a registered constant. A row appears here **only** where that trace completed.

| C9-CAP key (= TOOL-DEF name where marked ‡) | Owner traversed | AE-CAP key | Evidence |
|---|---|---|---|
| `appointments.own.create` ‡ | `AiToolHandlerService.createOwnAppointment` → `AppointmentsService.createForClient` → `CrmService` | `crm.appointment.create.v1` | `ai-tool-handler.service.ts:394`; `crm/crm.service.ts:1073,1275` |
| `appointments.own.cancel` ‡ | → `AppointmentsService.cancelForClient` → `CrmService` | `crm.appointment.cancel.v1` | `ai-tool-handler.service.ts:392`; `crm/crm.service.ts:1551,1649` |
| `appointments.own.reschedule` ‡ | → `AppointmentsService.rescheduleForClient` → `CrmService` | `crm.appointment.reschedule.v1` | `ai-tool-handler.service.ts:396`; `crm/crm.service.ts:1751,2112` |
| `loyalty.internal.adjust` ‡ | → `LoyaltyService.adjustInternalBalance` | `loyalty.internal-adjust.execute.v1` | `ai-tool-handler.service.ts:410`; `loyalty/loyalty.service.ts:205` |
| `expenses.create` ‡ | → `ExpensesService.create` → `P407ExpenseCanonicalCutoverService` | `expenses.create.execute.v1` | `ai-tool-handler.service.ts:384`; `expenses/p4-07-expense-canonical-cutover.service.ts:57`; `action-engine/p4-07-expense-executable.contract.ts:10–14` |
| `expenses.period.complete` ‡ | → `ExpensesService.declarePeriodComplete` → same cutover | `expenses.period-declare.execute.v1` | `ai-tool-handler.service.ts:386`; cutover `:98` |
| `staff.schedule.update` ‡ | → `Package5Wave3CanonicalCutoverService.updateExternalStaffScheduleDay` | `package5.wave3.update-staff-schedule-day.execute.v1` | `ai-tool-handler.service.ts:1701`; `package5-wave3/package5-wave3-canonical-cutover.service.ts:68`; `action-engine/package5-wave3-executable.contract.ts` |
| `settings.update` ‡ | → `DashboardPreferencesService.updateAssistant` → `Package5Wave1CanonicalCutoverService.updateAssistant` | `package5.settings.assistant.execute.v1` | `ai-tool-handler.service.ts:416`; `dashboard-preferences/dashboard-preferences.service.ts:242`; `action-engine/package5-wave1-executable.contract.ts` (operation `assistant_preferences`) |
| `tasks.create` ‡ | → `Package5Wave1CanonicalCutoverService.createTask` | `package5.work-item.task-create.execute.v1` | `ai-tool-handler.service.ts:420`; `package5-wave1-canonical-cutover.service.ts:237` |
| `tasks.complete` ‡ | → `Package5Wave1CanonicalCutoverService.completeTask` | `package5.work-item.task-complete.execute.v1` | `ai-tool-handler.service.ts:422`; cutover `:291` |
| `support.contact-admin.request` ‡ | → wave-1 `request_admin_contact` | `package5.work-item.admin-contact.execute.v1` | `action-engine/package5-wave1-executable.contract.ts` (operation `request_admin_contact`) |
| `notifications.appointments.update` ‡ | → `AppointmentNotificationsService.updateSettings` → wave-1 `appointment_notifications` | `package5.settings.appointment-notifications.execute.v1` | `ai-tool-handler.service.ts:428`; `appointment-notifications/appointment-notifications.module.ts:24` imports `Package5Wave1Module` |
| `b35.confirm` (C9-only, `OWNER_HANDOFF`) | `CanonicalBulkService.request()` | **`communication.bulk-campaign.admit.v2`** | `marketing/canonical-bulk.service.ts:303–318`; `marketing/canonical-bulk.contract.ts:6` |

**S0B.12 — where a mapping does not exist, it is a GAP, and a GAP has no button.** The following are **declared GAPs**. Each emits `capability_gap_ref` and no actuating control (§A2.2). None may be filled by inference, by name similarity, or by a projector's choice at runtime.

| C9-CAP key | Status | Gap key |
|---|---|---|
| `a22.configuration` (`OWNER_HANDOFF`) | **no AE-CAP mapping.** Verified: the only occurrences repo-wide are `c9.registry.ts:146` and `c9.inputs.ts:43`. Two AE capabilities plausibly *cover the same business fact* — `package5.settings.tenant-business.execute.v1` and `package5.wave2.update-tenant-configuration.execute.v1` — and **choosing between them is exactly the inference this rule forbids** | `GAP-TENANT-CONFIG-COMMIT` |
| `b35.preview`, `b35.status` | propose/read only; no actuating counterpart, correctly | — (not a gap; no COMMIT is intended) |
| `settings.read`, `expenses.read`, `tasks.list`, `notifications.appointments.read`, `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, `company.business-hours.read`, `clients.*`, `catalog.*`, `booking.*.read`, `analytics.*`, `reports.recovered`, `reviews.*`, `inventory.stock.read`, `commerce.*.read`, `referrals.status.read`, `valuations.read`, `customers.count`, `loyalty.own.read`, `appointments.own.list`, `support.integration-status.read`, `c7.measurement.read`, `c8.result.read`, `owner_report.status`, `owner_report.download`, `c9.no_action` | `mode: 'READ'`; no AE-CAP counterpart is expected or admissible | — |
| the eight `NEVER_CHAT_ACTUATED` reserved names | resolve in **no** space (§0.37, §A1.6 — all eight 0 hits) | the eight `GAP-*` keys of §0.37, unchanged |
| `expenses.delete` | **no C9-CAP or TOOL-DEF key exists**, while `expenses.delete.execute.v1` is registered, `ALLOW`, and reachable from `authenticated_request`. An AE capability with no propose key has no admissible `DRAFT` and therefore no admissible `COMMIT` under §0.34 | `GAP-EXPENSE-DELETE` |

**S0B.13 — the mapping table is total in the direction that matters, and the totality is asserted, not assumed.** `AE_PROPOSE_PAIRING` is a widget-layer table of `{ propose: CapabilityRef; ae: CapabilityRef }` rows. At `EP-REGISTRY-LOAD`:

1. every row's `propose.key` must resolve in `C9_CAPABILITIES` and every row's `ae.key` must resolve in `ActionCapabilityRegistry`, or the process does not start;
2. every AE-CAP key on the `AE_WIDGET_COMMIT_ALLOWLIST` of §0B.15 must appear as the `ae` side of exactly one row, **or** carry an explicit `propose: null` together with a `confirmation_kind` of `'APPROVAL'` (the approval-decision case, which has no propose key by construction);
3. a `COMMIT` minted for an AE key whose pairing row's `propose` side is not the capability of the consumed `REFINE`/`DRAFT` record named by `produced_by_intent_token_hash` is refused.

*Mechanism:* the three assertions above. *Evaluation points:* `EP-REGISTRY-LOAD` (1, 2), `EP-MINT` and `EP-INGRESS` Gate 7 (3). *Status:* `NORMATIVE-PENDING` on **P-23** (§0B.41).

---

## 0-B.3 Every conferral fence, re-expressed over AE-CAP (B3)

### 0-B.3.0 The polarity rule, which is the whole repair in one sentence

**S0B.14 — a fence over AE-CAP must be an allowlist. A denylist over `riskFacets` fails open, and is already failing open today.** `riskFacets: readonly string[]` (`action-engine.contract.ts:179`) is an **open vocabulary**: it is not a union, not validated against any closed set, and carries **98 distinct tokens** across the 226 rows. Any fence of the form "refuse when the facet is present" therefore admits every capability that simply does not carry the token — including every capability registered after the fence was written. The measured consequence is in §0B.24. **Every FR-6 fence below is expressed as a positive, closed, build-checked allowlist over AE-CAP, with everything not on it emitting `capability_gap_ref` and no actuating control.** Facet predicates survive only as **build-time vetoes** on the allowlist's contents — they can refuse a row, never admit one.

**S0B.15 — `AE_WIDGET_COMMIT_ALLOWLIST`, the one table every actuating fence reads.**

```ts
interface AeCommitRow {
  ae_key: string;                                  // must resolve in ActionCapabilityRegistry
  confirmation_kind: 'BOOKING_CONFIRMATION' | 'SETTINGS_DRAFT'
                   | 'PAYMENT_HANDOFF' | 'APPROVAL';        // §2 K11's four, unchanged
  family: 'booking' | 'marketing_fanout' | 'money' | 'consent'
        | 'identity' | 'tenant_authority' | 'settings' | 'operational';
  min_verification: VerificationLevel;             // ≥ SESSION_VERIFIED for every row (EFFECT_FLOOR)
  requires_ae_approval: boolean;                   // MUST equal registry.approvalRequirement === 'REQUIRED'
  propose: CapabilityRef | null;                   // §0B.13
}

const AE_WIDGET_COMMIT_ALLOWLIST: Readonly<Record<string, AeCommitRow>>;
const AE_CAPABILITY_GAP_LEDGER: Readonly<Record<string, string /* gap key */>>;
```

**S0B.16 — the totality assertion. 226 rows must be classified; an unclassified row stops the process.** At `EP-REGISTRY-LOAD`, for every `cap` in `new ActionCapabilityRegistry().list()`:

```
row = AE_WIDGET_COMMIT_ALLOWLIST[cap.capability];  gap = AE_CAPABILITY_GAP_LEDGER[cap.capability];
(row XOR gap)                                             else fail    // unclassified ⇒ process does not start
row ⟹ cap.policyDecision === 'ALLOW'                      else fail    // SHADOW_ONLY / DENY are never mintable
row ⟹ cap.allowedSourceTypes.includes('authenticated_request')  else fail
row ⟹ row.requires_ae_approval === (cap.approvalRequirement === 'REQUIRED')   else fail
row ⟹ MONEY(cap)            ⟹ row.confirmation_kind === 'PAYMENT_HANDOFF'     else fail   // veto
row ⟹ BOOKING(cap)          ⟹ row.confirmation_kind === 'BOOKING_CONFIRMATION' else fail  // veto
row ⟹ MARKETING_FANOUT(cap) ⟹ row.family === 'marketing_fanout'               else fail   // veto
row ⟹ CONSENT(cap) ∨ IDENTITY(cap) ⟹ fail unless an explicit §0B.20 / §0B.25 exemption row exists
row ⟹ canonicalProductionPolicyDefinitions() contains cap.capability          else fail
```

*Mechanism:* one start-up loop over the enumerated registry — not over a transcribed list. *Evaluation point:* `EP-REGISTRY-LOAD`. *Status:* `NORMATIVE-PENDING` on **P-23**.

**S0B.17 — the two AE-CAP properties that already bite today, named once.** Both are `[EXISTS]`, both are total over AE-CAP, both are enforced inside `CanonicalActionPolicyResolver.resolve()` before any effect:

- **`allowedSourceTypes`** — `policy-resolver.ts:321`: `if (!capability.allowedSourceTypes.includes(request.sourceType)) throw`. **A widget submission's only honest `ActionSourceType` is `authenticated_request`**; the widget layer may never mint `agent_task`, `scheduler`, `webhook`, `legacy_bridge` or `synthetic_shadow`, and a source test asserts the gateway constructs no other value. Verified consequence: **53 of the 226 registered capabilities are unreachable from a widget by this property alone**, among them `package5.a18.consent-security-invalidation.execute.v1`, whose `allowedSourceTypes` is exactly `['legacy_bridge']`.
- **`policyDecision`** — `policy-resolver.ts:412–417`: a `DENY` capability contributes `capability_policy_denied` and the resolution is `DENY`; a `SHADOW_ONLY` capability's static decision is preserved by `assertResolverOwnsDecision` (`action-engine.ingress.ts:141–159`). Verified distribution over 226: **`ALLOW` 129, `SHADOW_ONLY` 95, `DENY` 2** (`crm.visit.payment.v1`, `kernel.test.denied`).

Intersecting the two: **105 of 226 capabilities are both `ALLOW` and reachable from `authenticated_request`.** That, and not 226, is the surface the allowlist of §0B.15 must classify positively. *Evaluation point:* `EP-CANONICAL`, with `CanonicalActionIngressService.preview()` (`action-engine.ingress.ts:111`) making the same decision readable at `EP-INGRESS`.

### 0-B.3.1 FR-3 — BUTTON ≠ AUTHORITY

**S0B.18 — §0.15 FR-3's named mechanism is inoperative for the actuating classes, and the replacement exists.**

**The defect, verified.** `AiToolPolicyService.assertCanExecute(principal: AiToolPrincipal, definition: AiToolDefinition)` — `ai-tool-policy.service.ts:59–61` — takes an **`AiToolDefinition`** as its second parameter. `AiToolDefinition` is produced only by `AiToolRegistryService` over the 47-name `MAYA_AI_TOOL_CATALOG`. **There is no `AiToolDefinition` for any AE-CAP key** (AE-CAP ∩ TOOL-DEF = ∅, §0B.8), so the call cannot be constructed for a `COMMIT` or a `REQUEST_APPROVAL`. §0.15 FR-3 and §3.9 Gate 6 name it as the authority mechanism for **every** effect class; for the two that actuate, it is **VOID**. This is the same defect §0.23 already found for `CONTROL` and fixed there; it was not carried to `COMMIT`.

**The replacement, which is `[EXISTS]` and is strictly stronger.** Authority over AE-CAP is decided by **`CanonicalActionPolicyResolver.resolve()`** (`action-engine.policy-resolver.ts:315`), which reads `CanonicalActionPolicyDefinitionV1` **keyed on the AE-CAP key** (`:72–84`) and, in `resolveActorPermission()` (`:619`, role test at `:802`):

1. reads a live `Membership` row for `request.actorUserId` inside the deciding request — **never a value the caller supplied**;
2. requires `membership.status === 'active'` **and** `membership.user.status === 'active'`;
3. requires `policy.allowedActorRoles.includes(membership.role)`;
4. requires `evaluateTenantAccessState(tenant)` ∈ {`active`, `trial_active`, `past_due_grace`};
5. requires `EntitlementsService.resolveFeatureRequirements(tenantId, policy.requiredFeatures)` to allow;
6. for a `VERIFIED_CLIENT_CHANNEL` capability, requires `assertConsentChannelBinding` against a live, unrevoked `ClientChannelLink` (`:748–772`);
7. for a client principal, requires `readClientActionPrincipal` plus canonical ownership of the target (`:636–746`);
8. and `CanonicalActionIngressService.assertNoCallerAuthority` (`action-engine.ingress.ts:161`) rejects the request outright if it carries any key outside a closed allowlist — **the caller cannot even name a role**.

**The authority property over AE-CAP is therefore `CanonicalActionPolicyDefinitionV1.allowedActorRoles`, evaluated against a `Membership` read inside the deciding request. Evaluation point: `EP-CANONICAL`.** It is readable at `EP-INGRESS` without side effects via `CanonicalActionIngressService.preview()`, which calls the same `prepare()` and returns the resolved decision.

**Where it is evaluated in the gate order, stated exactly.** `preview()` requires a normalized input, which does not exist before §3.9 Gate 8. **Gate 6 therefore performs the authority check it can perform, and Gate 14 performs the one that binds.** Concretely, §3.9 Gate 6 and §0.15 FR-3 are amended to:

> **Gate 6, for an intent whose `capability.space === 'AE'`:** the submission is refused unless (a) the AE key has a row in `AE_WIDGET_COMMIT_ALLOWLIST`; (b) `ActionCapabilityRegistry.get(key).policyDecision === 'ALLOW'`; (c) `allowedSourceTypes` includes `authenticated_request`; (d) the live principal's role is a member of `canonicalProductionPolicyDefinitions()`'s `allowedActorRoles` for that key; (e) `EntitlementsService` grants every `requiredFeatures` entry. `authority_hint` is not read. **Gate 14 then re-resolves (d) and (e) from scratch inside the canonical request, and Gate 14's answer is the one that governs.** A disagreement between Gate 6 and Gate 14 is refused, counted, and never resolved in Gate 6's favour.
>
> **Gate 6, for `capability.space === 'C9'` or `'TOOL'`** (`REFINE`, `DRAFT`, `HANDOFF`, class-`c` `NAVIGATE`): `AiToolPolicyService.assertCanExecute` as §3.9 already states — it is correct for exactly these, and only these.
>
> **Gate 6, for `capability.space === 'CONTROL'`:** §0.23, unchanged.

*Status:* the **policy resolver is `[EXISTS]`** at `action-engine.policy-resolver.ts`; the **Gate 6 dispatch by key space is `NORMATIVE-PENDING` on P-01 and P-23**. Until both ship, no `COMMIT` and no `REQUEST_APPROVAL` intent is minted at all (§0B.16 admits nothing without the allowlist), so **FR-3 holds today fail-closed: there is no actuating button.** That is the plain statement the owner's bar requires; it is not a claim that a mechanism is running.

**S0B.19 — three honest limits of `allowedActorRoles`, recorded so nobody over-reads it.**

1. **Its default is permissive.** `allowedActorRoles(capability)` (`action-engine.policy-registry.ts:102–177`) is a chain of `capability.startsWith(...)` tests with a final `return TENANT_ACTION_ROLES` (`:177`). `TENANT_ACTION_ROLES` is **twelve roles including `CLIENT`, `CUSTOMER`, `EMPLOYEE`, `STAFF` and `INTEGRATION_SERVICE`** (`:11–24`). Verified: **164 of the 221 policy definitions receive that default.** `allowedActorRoles` is therefore a genuine fence only where a prefix rule names the capability; elsewhere it is nearly vacuous. **This is why §0B.15 is an allowlist with a per-row `min_verification` and not merely "trust the policy registry".**
2. **`permissionCodes` is not evaluated.** It is shape-validated (`policy-resolver.ts:280–290`) and recorded into the attestation evidence (`:914`), and is read by **no decision anywhere**. No rule of this contract may cite it as a fence.
3. **`actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'` admits an actorless call.** When `actorUserId` is absent and `sourceType ∈ trustedServiceSourceTypes`, `resolveActorPermission` returns `allowed: true` with no role check at all (`:778–793`). This is correct for schedulers and bridges and is **irrelevant to the widget layer only because §0B.17 fixes the widget source type to `authenticated_request`, which `canonicalProductionPolicyDefinitions()` explicitly excludes from `trustedServiceSourceTypes` (`policy-registry.ts:185–189`).** That exclusion is load-bearing; a build test asserts it.

### 0-B.3.2 FR-6a — no widget kind confers consent

**S0B.20 — the fence as written is vacuous, and the real consent capability is in AE-CAP under a different name.**

**The defect, verified.** `NEVER_CHAT_ACTUATED` is eight reserved names; **all eight resolve in no key space** (§0.37, §A1.6 — 0 hits each, and `NEVER_CHAT_ACTUATED` itself 0 hits). The predicate `subjectCapability(i) ∈ NEVER_CHAT_ACTUATED` is therefore **total and always false**. FR-6a holds vacuously. Meanwhile the act it exists to fence **is** registered, in AE-CAP: `package5.wave3.record-client-consent.execute.v1`, `policyDecision: ALLOW`, `targetKind: 'client_consent'`, `approvalRequirement: 'NONE'`, `allowedSourceTypes` including `authenticated_request` — and under §0.33's unrepaired `requiredConfirmationKind` it routes to **`SETTINGS_DRAFT`**, a COMMIT-bearing kind. Annex A §A1.6.2 saw this for the one key; §0B.33 shows it is the general case.

**The fence over AE-CAP.** Define, over `RegisteredActionCapabilityV1`:

```
CONSENT(cap) :=  cap.targetKind    ∈ {'client_consent', 'client_consent_security'}
              ∨  cap.actionClass   ∈ {'record_client_consent', 'invalidate_client_consent_authority'}
```

Verified membership, exhaustive over the 226: `package5.wave3.record-client-consent.shadow.v1` (SHADOW_ONLY), `package5.wave3.record-client-consent.execute.v1` (ALLOW), `package5.a18.consent-security-invalidation.execute.v1` (ALLOW, `allowedSourceTypes: ['legacy_bridge']`).

**FR-6a, restated normatively:**

> **No AE capability satisfying `CONSENT(cap)` may appear in `AE_WIDGET_COMMIT_ALLOWLIST`.** A `COMMIT` or `REQUEST_APPROVAL` naming one is refused at mint; the envelope carries a `Limitation` with `capability_gap_ref` and no actuating control. The only widget affordance for a consent decision is a `HANDOFF` of class `s` to `shell.privacy` with `verification_floor ≥ SESSION_VERIFIED`, exactly as §3.5 R3.5.1 requires — the difference being that the antecedent is now **satisfiable**, because `CONSENT(cap)` is a predicate over keys that exist.

**What actually protects the act at the Action Engine, stated honestly, and it is real.** `package5.wave3.record-client-consent.execute.v1` carries `actorPolicy: 'VERIFIED_CLIENT_CHANNEL'` (`policy-registry.ts:194–196`, driven by `verifiedClientChannelCapability`, `client-preferences.contract.ts:77–92`). Its authority is **not a role and not a button**: `resolveActorPermission` requires a `ConsentChannelBinding` validated by `assertConsentChannelBinding` against a live, unrevoked `ClientChannelLink` whose `verificationVersion === 1` and whose three hashes match (`policy-resolver.ts:748–772`). That is precisely "consent requires a verified first-party channel, never a widget event". *Status:* `[EXISTS]`. *Evaluation point:* `EP-CANONICAL`. **It is a fence on the Action Engine, not on the widget layer**, and this contract does not lean on it: the widget-layer fence is the allowlist exclusion above, which fails closed independently.

`package5.a18.consent-security-invalidation.execute.v1` is additionally unreachable from a widget by `allowedSourceTypes: ['legacy_bridge']` (§0B.17) — a second, independent `[EXISTS]` fence over AE-CAP.

**Prerequisite.** The eight reserved names remain `NORMATIVE-PENDING` on **P-22**; §0.37's registration gate is amended to read over `CapabilityRef`, so that a name later registered in AE-CAP must be classified by §0B.16 *before* it may be emitted. Annex A §A1.6.2's `consent_class: 'personal_data'` requirement stands and is now enforced by the allowlist exclusion rather than by §0.42's second condition, which had no row to read.

### 0-B.3.3 FR-6b — no widget kind confers booking authority

**S0B.21 — already over AE-CAP; tightened, and its family predicate published.** §0.33's booking term is `cap.targetKind === 'appointment'`, a mandatory field of `RegisteredActionCapabilityV1` (`action-engine.contract.ts:175`) — the one FR-6 fence Section 0 already expressed over the right space.

```
BOOKING(cap) := cap.targetKind === 'appointment'
```

Verified membership, exhaustive — **13 capabilities**, confirming §0.16 E-19's correction of §3.10.1 and adding the exact dispositions:

| AE key | `policyDecision` | disposition |
|---|---|---|
| `crm.appointment.create.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `confirmation_of_ref.kind: 'draft'` |
| `crm.appointment.reschedule.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `kind: 'record'` + non-null `produced_by_intent_token_hash` (§0.34) |
| `crm.appointment.cancel.v1` | ALLOW | as reschedule |
| `crm.appointment.attendance.v1`, `.duration.v1`, `.services.v1`, `.fields.v1` | ALLOW | allowlisted, `BOOKING_CONFIRMATION`, `kind: 'record'` + the §0.34 guard. **`attendance` is a staff-recorded fact and is never a client acknowledgement** (§A1.6 P-21) |
| `crm.appointment.{attendance,duration,services,fields}.shadow.v1` | SHADOW_ONLY | not mintable (§0B.16) |
| `crm.visit.payment.v1` | **DENY** | not mintable; also `MONEY(cap)` |
| `occupancy.recovery-options.prepare` | SHADOW_ONLY | not mintable |

Seven of the thirteen are `ALLOW`, which is exactly the `BOOKING_CONFIRMATION` count of §0B.33's table. *Mechanism:* the registry read plus the allowlist veto of §0B.16. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7. *Status:* `NORMATIVE-PENDING` on P-08, P-18, P-23.

### 0-B.3.4 FR-6c — no widget kind confers marketing permission

**S0B.22 — a C9 run mode is not a send fence. The repair, and the second door it exposes.**

**The defect, verified.** §0.15 FR-6c's mechanism is: "`b35.confirm` is registered `OWNER_HANDOFF` in `C9_CAPABILITIES`, so no bulk-send `COMMIT` is mintable at all." `mode: 'READ' | 'PROPOSE_ONLY' | 'OWNER_HANDOFF'` is declared at `c9.registry.ts:56` as a field of `C9Capability` — **a C9 run mode**. It is read by `c9Capability()` and `c9Available()` inside the orchestration module and **by nothing under `src/action-engine/`** (§0B.5, §0B.10). It fences a C9 run. It does not fence a send. Section 0 marked this row `[EXISTS] (the mode)`; the mode exists, the fence does not.

**The capability that actually performs the send.** `MARKETING_FANOUT` over AE-CAP:

```
MARKETING_FANOUT(cap) :=  cap.actionClass ∈ {'deliver_bulk_campaign', 'send_bulk_campaign'}
                       ∨  cap.targetKind  ∈ {'marketing_campaign', 'marketing_client_recipient', 'audience'}
```

Verified membership, exhaustive — **four capabilities**, with the properties that matter:

| AE key | `policyDecision` | `approvalRequirement` | `approverPolicyKey` | `allowedActorRoles` | `allowedSourceTypes` |
|---|---|---|---|---|---|
| **`communication.bulk-campaign.admit.v2`** | ALLOW | **REQUIRED** | **`tenant-owner`** | **`[TENANT_OWNER, BUSINESS_OWNER]`** | `['authenticated_request']` |
| `communication.bulk-slot.admit.v2` | ALLOW | NONE | `none` | `[TENANT_OWNER, BUSINESS_OWNER]` | `['authenticated_request']` |
| **`communication.bulk-campaign.execute.v1`** | ALLOW | **NONE** | **`none`** | **`TENANT_ACTION_ROLES` — all twelve, including `CLIENT`** | `['authenticated_request', 'legacy_bridge']` |
| `communication.bulk-campaign.shadow.v1` | SHADOW_ONLY | NONE | `none` | twelve | four |

**FR-6c, restated normatively.**

> **The bulk-send fence is `communication.bulk-campaign.admit.v2`'s own AE-CAP properties: `approvalRequirement === 'REQUIRED'` with `approverPolicyKey: 'tenant-owner'`, and `allowedActorRoles === [TENANT_OWNER, BUSINESS_OWNER]` with `actorPolicy: 'REQUIRED'` (so no actorless service source may stand in).** The approval is decided by `ActionEngineKernel.decideApproval()` against `CANONICAL_APPROVER_POLICY_ROLES.get('tenant-owner') = {tenant_owner, business_owner}` (`action-engine.kernel.ts:95–96, 583–593`). **Evaluation point: `EP-CANONICAL`. Status: `[EXISTS]`.** This is a real, running, owner-only, approval-bound fence on the capability the widget-layer admission path actually reaches — `CanonicalBulkService.request()` names exactly this key (`marketing/canonical-bulk.service.ts:307`).
>
> **And the widget layer additionally refuses the other three.** `AE_WIDGET_COMMIT_ALLOWLIST` contains **exactly one** capability satisfying `MARKETING_FANOUT`, namely `communication.bulk-campaign.admit.v2`, with `family: 'marketing_fanout'`, `confirmation_kind: 'APPROVAL'`, `requires_ae_approval: true`, `min_verification: SESSION_VERIFIED`. `communication.bulk-campaign.execute.v1`, `communication.bulk-slot.admit.v2` and `communication.bulk-campaign.shadow.v1` are in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-BULK-SEND-DIRECT`** and carry no actuating control. A start-up assertion fails the process if `|{cap : MARKETING_FANOUT(cap) ∧ cap.capability ∈ AE_WIDGET_COMMIT_ALLOWLIST}| ≠ 1`.

**S0B.23 — REPOSITORY OBSERVATION, recorded so no reader believes the widget layer compensates for it.** *This is an observation about the running system, not a widget-contract rule.*

> `communication.bulk-campaign.execute.v1` — the capability whose `executorKey` is `communication.package2.bulk` and whose `actionClass` is `deliver_bulk_campaign` — is registered `ALLOW`, `approvalRequirement: 'NONE'`, `approverPolicyKey: 'none'`, `actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'`, `allowedActorRoles: TENANT_ACTION_ROLES` (twelve roles, `CLIENT` and `CUSTOMER` among them), `allowedSourceTypes: ['authenticated_request', 'legacy_bridge']`. **It is a second door onto the same `actionClass` as the owner-gated, approval-bound admission capability, and it is gated by neither.** Its only occurrence repo-wide is its own registration at `action-engine.registry.ts:3530`; it is reached by no service constant and no call site today — verified. It is nonetheless *registered*, and a registered `ALLOW` capability reachable from `authenticated_request` is one caller away from being live.
>
> **Owner action required outside this contract:** either give `communication.bulk-campaign.execute.v1` the same `allowedActorRoles` and `approvalRequirement` as `communication.bulk-campaign.admit.v2`, or remove it from the registry. This contract does not choose; it contains the key to `GAP-BULK-SEND-DIRECT` and says nothing stronger.

### 0-B.3.5 FR-6d — no widget kind confers finance permission

**S0B.24 — the exact-match test catches four of thirty-nine. The numbers, then the repair.**

**The defect, measured.** §0.33's finance term is `cap.riskFacets.includes('financial')` — an exact array-membership test over an **open, unvalidated string vocabulary** (§0B.14). Enumerated over the registry:

- capabilities carrying `'financial'`: **12 of 226**;
- of those, `ALLOW` **and** reachable from `authenticated_request`: **4** — `loyalty.internal-adjust.execute.v1`, `expenses.create.execute.v1`, `expenses.delete.execute.v1`, `expenses.period-declare.execute.v1`;
- money-mutating capabilities that are `ALLOW` and widget-reachable and **do not** carry the token: **35**.

**Money-mutating AE capabilities that the `'financial'` test misses, in full** — every one `policyDecision: ALLOW` and reachable from `authenticated_request`:

| AE key | facet it carries instead |
|---|---|
| `tenant-billing.checkout.execute.v1`, `tenant-billing.recurring.execute.v1`, `tenant-billing.past-due.execute.v1` | `payment_value`, `tenant_billing` |
| `gift-certificates.purchase.execute.v1`, `customer-subscriptions.purchase-checkout.execute.v1`, `customer-subscriptions.renewal-checkout.execute.v1` | `provider_payment` |
| `gift-certificates.activation.execute.v1`, `gift-certificates.redemption.execute.v1` | `financial_equivalent`, `gift_certificate` |
| `loyalty.legacy-{earn,expire,redeem,refund,import,backfill}.execute.v1`, `loyalty.legacy-{expire,backfill,import}.batch.execute.v1`, `loyalty.redemption-grant.{issue,consume}.execute.v1` | `financial_equivalent`, `customer_value` |
| `referrals.referral-reward-{issue,fulfill}.execute.v1`, `referrals.referral-reward-scheduler-envelope.execute.v1` | `financial_equivalent`, `referral_reward` |
| `value-configuration.{certificate,membership}.{create,update,delete}.execute.v1`, `value-configuration.referral.update.execute.v1` | `financial_equivalent`, `value_configuration` |
| `commerce-credentials.{connect,replace,recheck,disconnect}.execute.v1` | `credential_authority`, `tenant_wide` — **the authority to take payment, which is finance permission in the only sense that matters** |
| `customer-subscriptions.{activation,renewal-activation,usage-sync}.execute.v1` | `customer_value` |
| `cash-declaration.{declare,correct}.execute.v1` | **no money token at all** — `['local','one_target','confirmed_observation','immutable_history']` |

**`cash-declaration.*` is the case that proves the point:** it records a cash position, it is `ALLOW`, it is widget-reachable, and it carries **no** facet a money denylist of any shape could key on. Only a positive allowlist catches it.

**FR-6d, restated normatively — and note that the facet union is a veto, never the fence.**

```
MONEY_FACETS := {financial, financial_equivalent, payment_value, provider_payment, payment_evidence,
                 customer_value, tenant_billing, expense_ledger, gift_certificate, referral_reward,
                 value_configuration, credential_authority, bearer_secret, bearer_claim,
                 bearer_presentation, frozen_discount_entitlement}

MONEY_TARGET_KINDS := {loyalty_account, loyalty_client, loyalty_redemption, loyalty_redemption_grant,
                 loyalty_bulk_batch, gift_certificate, gift_certificate_checkout,
                 gift_certificate_redemption, customer_subscription_term,
                 customer_subscription_checkout, customer_subscription_renewal_checkout,
                 customer_subscription_usage, customer_subscription_scheduler_batch, expense,
                 expense_period, cash_declaration, tenant_billing_checkout, tenant_billing_charge,
                 tenant_billing_access_window, tenant_billing_scheduler_envelope, billing_payment,
                 referral_reward, referral_reward_issuance, referral_reward_batch, referral_program,
                 commerce_integration, tenant_catalog_item}

MONEY(cap) := (cap.riskFacets ∩ MONEY_FACETS ≠ ∅) ∨ (cap.targetKind ∈ MONEY_TARGET_KINDS)
```

Verified: `MONEY` is satisfied by **92 of 226** capabilities and by **39 of the 105** that are `ALLOW` and widget-reachable — against 12 and 4 for the bare token. The complement was inspected in full and contains no money-mutating capability.

> **The fence is: `AE_WIDGET_COMMIT_ALLOWLIST` contains no row whose `confirmation_kind` is other than `'PAYMENT_HANDOFF'` for any `cap` satisfying `MONEY(cap)`, and `PAYMENT_HANDOFF` is gap-blocked with a null `commit_intent` and no button until P-14 ships (§2.6.20 PAY.4, §A1.3 P-14).** Equivalently and operationally: **no money-mutating AE capability is on the allowlist at all in this contract version.** All 92 are in `AE_CAPABILITY_GAP_LEDGER`, keyed to the gap of §0.37 that covers them (`GAP-LOYALTY-REDEEM`, `GAP-COMMERCE-GIFT`, `GAP-TIPS`) or to a gap this section adds: **`GAP-TENANT-BILLING`, `GAP-COMMERCE-CREDENTIALS`, `GAP-VALUE-CONFIG`, `GAP-SUBSCRIPTION`, `GAP-REFERRAL-REWARD`, `GAP-CASH-DECLARATION`, `GAP-EXPENSE-COMMIT`** (§0B.39).
>
> `MONEY` itself is used **only** as the build-time veto of §0B.16 — it can refuse an allowlist row, never admit one. A capability that escapes `MONEY` and is not on the allowlist is still refused, because the allowlist is the fence. **The token is therefore no longer load-bearing, which is the only way a fence over an open vocabulary can be made sound.**

*Mechanism:* the allowlist, the veto, and the start-up totality assertion of §0B.16. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7. *Status:* `NORMATIVE-PENDING` on P-10, P-14, P-23. **Today the outcome is: no money-mutating capability has a button. That is FR-6d satisfied, honestly, by absence.**

### 0-B.3.6 FR-6e — no widget kind confers tenant authority

**S0B.25 — unchanged, and correctly scoped.** `TenantContextService.assertTenantId` over the record's tenant and the live principal's, at `EP-INGRESS` Gate 4, is `[EXISTS]` and is not keyed on any capability space, so no reconciliation is required. It is **reinforced** over AE-CAP by `CanonicalActionPolicyResolver.resolve()`, which loads the tenant row and refuses unless `evaluateTenantAccessState` is in {`active`, `trial_active`, `past_due_grace`} (`policy-resolver.ts:356–398`), and by `assertNoCallerAuthority`, which forbids the request carrying a tenant-bearing field outside the closed allowlist (`action-engine.ingress.ts:161–175`).

The distinct question — *which widget may mutate the tenant object itself* — is a `family: 'tenant_authority'` allowlist matter:

```
TENANT_AUTHORITY(cap) := cap.targetKind ∈ {tenant, tenant_user, internal_provider_user, staff_access,
                                           branch, tenant_branding}
                       ∨ cap.riskFacets ∋ 'tenant_wide'
```

**No capability satisfying `TENANT_AUTHORITY` is on `AE_WIDGET_COMMIT_ALLOWLIST` in this contract version** — `package5.wave2.{suspend-tenant, reactivate-tenant, create-tenant-user, create-provider-user, create-tenant-branch, configure-staff-access, claim-team-owner, update-tenant-configuration, update-tenant-branding, upload-tenant-logo}.execute.v1` are all `ALLOW`, all widget-reachable, and all carry the **permissive twelve-role default** of §0B.19(1). They are in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-TENANT-ADMIN`**. The identity family is fenced the same way:

```
IDENTITY(cap) := cap.targetKind ∈ {auth_session, auth_subject_sessions, auth_identity}
               ∨ cap.actionClass ∈ {link_social_auth_identity, revoke_other_auth_session,
                                    revoke_all_auth_sessions}
```

— `package5.wave2.{revoke-other-session, revoke-all-sessions, link-social-identity}.execute.v1`, all `ALLOW`, all twelve-role, all in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-IDENTITY-SESSION`**, which is the AE-CAP counterpart of §0.37's `GAP-IDENTITY-STAFF-UNBIND` / `GAP-IDENTITY-CLIENT-UNBIND`.

### 0-B.3.7 FR-6f — no widget kind confers approval

**S0B.26 — §0.46's mechanism is in the wrong key space; the AE-CAP mechanism exists and fails closed.**

**The defect, verified.** `AiToolPolicyService.assertCanDecide(definition: AiToolDefinition, requestedByUserId, principal)` — `ai-tool-policy.service.ts:97–98` — takes an `AiToolDefinition`. It cannot be called for an AE-CAP key (§0B.18). §0.46 names it as the mechanism for "who may decide an approval"; for an Action Engine approval — which is every approval this contract's `APPROVAL` kind renders, since §2.6.12's owner class is `ACTION_EXECUTION` — it is **VOID**.

**The replacement, `[EXISTS]`, and strictly stronger.** `ActionEngineKernel.decideApproval()` (`action-engine.kernel.ts:521`):

1. requires `execution.state === PENDING_APPROVAL`, `approvalDecision === PENDING`, `approvalRequirement === 'REQUIRED'` (`:536–545`);
2. requires the durable canonical policy binding — `policyContextHash`, `policyEvidenceJson`, `policyEvaluatedAt`, `policyValidUntil`, `approvalBindingHash` — all non-null (`:546–558`); **no caller-supplied approval flag or hash is accepted anywhere**;
3. requires `approvalExpiresAt > now`, else writes `EXPIRED` / `NOT_EXECUTED` (`:560–575`);
4. reads a live `Membership` for `approverUserId` and requires `status === active` (`:576–592`);
5. requires `approver.role ∈ canonicalApproverRoles(execution)`, which is `CANONICAL_APPROVER_POLICY_ROLES.get(evidence.approval.approverPolicyKey)` — for the one registered policy `'tenant-owner'`, the set `{tenant_owner, business_owner}` (`:95–96`, `:1800–1816`);
6. **an unregistered or absent `approverPolicyKey` throws `CANONICAL_APPROVER_POLICY_INVALID` (`:1810–1815`) — the decision fails closed, it does not default.**

**The approval property over AE-CAP is therefore `RegisteredActionCapabilityV1.approvalRequirement === 'REQUIRED'` selecting a `CanonicalActionPolicyDefinitionV1.approverPolicyKey`, resolved to a role set by `CANONICAL_APPROVER_POLICY_ROLES` and compared against a `Membership` read inside the deciding request. Evaluation point: `EP-CANONICAL`. Status: `[EXISTS]`.** Verified: **19 non-test capabilities carry `approvalRequirement: 'REQUIRED'`, and every one of them resolves `approverPolicyKey: 'tenant-owner'`**; `canonicalProductionPolicyDefinitions()` sets `'none'` for all others and `resolve()` refuses either mismatch (`policy-resolver.ts:323–338`).

**FR-6f, restated normatively:** an `APPROVAL` body's `approve_intent` / `reject_intent` may be minted only when the underlying execution's AE capability has `approvalRequirement === 'REQUIRED'`, its allowlist row has `requires_ae_approval: true`, and the composer's `canDecide` probe — which must call the **AE-CAP** path, never `AiToolPolicyService.canDecide` — returns true for the live principal. Otherwise `blocked_reason` is set per §0.47. §0.46's text stands as the *description* of the guarantee (role-gated approval, **not** separation of duties); only its named mechanism is replaced.

**S0B.27 — two honest limits, recorded.**

1. **The self-approval finding of §0.49 reproduces exactly over AE-CAP.** `decideApproval` compares `approver.role` against the approver-policy role set and **never compares `approverUserId` to the execution's `actorUserId`**. An owner who initiates may approve. §0.46's weaker guarantee is the true one on both key spaces; §0.48's `GAP-SEPARATION-OF-DUTIES` remains the only remedy this contract can offer, and §A4.1 remains the owner decision.
2. **`controlledFixtureMode` widens the approver set.** `action-engine.kernel.ts:583–585`: when set, `approverRoles` becomes `APPROVER_ROLES` — six roles including `administrator`, `tenant_admin`, `platform_owner`, `platform_admin` — instead of the two the canonical policy names. **The fence above holds only while `controlledFixtureMode === false` in production.** A build test must assert the flag is unset outside proof/test harnesses; until it exists this is `[NON-NORMATIVE]` as a guarantee (P-27).

### 0-B.3.8 The restated fundamental-rules table

**S0B.28.** This table supersedes §0.15's rows for FR-3, FR-6a, FR-6c, FR-6d and FR-6f, and restates FR-6b and FR-6e unchanged for completeness. Every other row of §0.15 stands as written.

| # | Rule | Key space | The one enforcing mechanism | Evaluation point | Absent ⇒ |
|---|---|---|---|---|---|
| **FR-3** | BUTTON ≠ AUTHORITY | **AE-CAP** | `CanonicalActionPolicyResolver.resolve()` → `resolveActorPermission()` against `CanonicalActionPolicyDefinitionV1.allowedActorRoles` + `requiredFeatures` + `evaluateTenantAccessState`, over a `Membership` read inside the deciding request; `assertNoCallerAuthority` forbids caller-supplied authority. Gate 6 pre-screens the same key against the allowlist and the same role set | `EP-CANONICAL` (binding); `EP-INGRESS` Gate 6 (pre-screen, via `preview()`) | **no actuating control**: the AE key is not allowlisted, `capability_gap_ref` is emitted, no `DRAFT`/`REQUEST_APPROVAL`/`COMMIT` intent exists |
| **FR-6a** | no kind confers **consent** | **AE-CAP** | `CONSENT(cap)` ⟹ excluded from `AE_WIDGET_COMMIT_ALLOWLIST`, asserted at start-up. Backed at the engine by `actorPolicy: 'VERIFIED_CLIENT_CHANNEL'` + `assertConsentChannelBinding`, and by `allowedSourceTypes: ['legacy_bridge']` for the invalidation capability | `EP-REGISTRY-LOAD` (exclusion), `EP-MINT` (refusal), `EP-CANONICAL` (engine fence) | no actuating control; `HANDOFF` to `shell.privacy` only |
| **FR-6b** | no kind confers **booking authority** | **AE-CAP** | `BOOKING(cap) := targetKind === 'appointment'`; allowlist row must be `BOOKING_CONFIRMATION`; §0.34's `confirmation_of_ref` + `produced_by_intent_token_hash` guard | `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7 | no actuating control |
| **FR-6c** | no kind confers **marketing permission** | **AE-CAP** | `communication.bulk-campaign.admit.v2` is the **only** `MARKETING_FANOUT` capability on the allowlist; its own `approvalRequirement: 'REQUIRED'` + `approverPolicyKey: 'tenant-owner'` + `allowedActorRoles: [TENANT_OWNER, BUSINESS_OWNER]` + `actorPolicy: 'REQUIRED'` are the fence. The other three are `GAP-BULK-SEND-DIRECT` | `EP-CANONICAL` (the fence, `[EXISTS]`); `EP-REGISTRY-LOAD` (the cardinality assertion) | no actuating control |
| **FR-6d** | no kind confers **finance permission** | **AE-CAP** | `MONEY(cap)` (facet ∪ targetKind union — **92 of 226**, not the 12 the `'financial'` token catches) is a build-time **veto**; the fence is that **no money-mutating capability is on the allowlist at all**, all 92 being gap-keyed | `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7 | no actuating control — which is the state today |
| **FR-6e** | no kind confers **tenant authority** | tenant id, not a capability key | `TenantContextService.assertTenantId`; reinforced by `evaluateTenantAccessState` at the resolver. Separately, `TENANT_AUTHORITY(cap)` ⟹ `GAP-TENANT-ADMIN` and `IDENTITY(cap)` ⟹ `GAP-IDENTITY-SESSION`, no allowlist row | `EP-INGRESS` Gate 4; `EP-CANONICAL` | refuse |
| **FR-6f** | no kind confers **approval** | **AE-CAP** | `ActionEngineKernel.decideApproval()` → `canonicalApproverRoles()` → `CANONICAL_APPROVER_POLICY_ROLES[approverPolicyKey]` vs a live `Membership`; unregistered key ⟹ `CANONICAL_APPROVER_POLICY_INVALID` | `EP-CANONICAL` | the decision throws; the composer nulls the decision intent with `blocked_reason` (§0.47) |

---

## 0-B.4 The verification floor's domain (B4)

**S0B.29 — the defect: the floor's risk term is a TOOL-DEF term applied to an AE-CAP key.** §0.13's `subjectFloor` reads

```ts
const tier = aiToolRegistry.get(key)?.riskTier ?? 'restricted';
```

`aiToolRegistry` is `AiToolRegistryService` over the 47-name catalogue. **For every AE-CAP key this lookup is `undefined` by construction** (AE-CAP ∩ TOOL-DEF = ∅), so the term silently becomes `'restricted'`, and `RISK_FLOOR['restricted'] = STEP_UP_VERIFIED`, which §1.7 K6 and §A1.2 P-12 make **unreachable**. The floor is therefore *technically* total over AE-CAP and *substantively* degenerate: **every `COMMIT` and every `REQUEST_APPROVAL` in the system is permanently withheld by an accident of key-space mixing, not by a policy decision.** Fail-closed, and undiagnosable — the symptom is "nothing commits" with no rule anywhere saying so. §0.13's `subjectFloor` is **VOID** as written.

**S0B.30 — `subjectCapability` returns a `CapabilityRef`.** §3.5's function is retyped; its logic is unchanged:

```ts
function subjectCapability(i: MintedIntent): CapabilityRef | null {
  if (i.capability !== null)             return i.capability;            // already a CapabilityRef (§0B.7)
  if (i.handoff_capability_ref !== null) return i.handoff_capability_ref;
  if (i.target?.class === 'c')           return i.target.ref;            // { space: 'C9', key }
  return null;
}
```

**S0B.31 — `subjectFloor` is dispatched by space, and each branch is total with a named fail-closed default.**

```ts
function subjectFloor(ref: CapabilityRef | null): VerificationLevel {
  if (ref === null) return 'ANONYMOUS';                      // NONE; w/i/s/detail NAVIGATE — §0.13, unchanged
  switch (ref.space) {
    case 'CONTROL': return CONTROL_FLOOR[ref.key];           // §0.22, closed at 3; a missing key fails the build
    case 'TOOL':    return 'STEP_UP_VERIFIED';               // FAIL CLOSED — no intent may carry a TOOL ref (§0B.7)
    case 'C9':      return c9Floor(ref.key);
    case 'AE':      return aeFloor(ref.key);
  }
}

// C9 branch — §0.13's body, unchanged, now explicitly scoped to the space it was written for.
function c9Floor(key: string): VerificationLevel {
  const row = WIDGET_CAPABILITY_POLICY[{ space: 'C9', key }];
  if (row === undefined) return 'STEP_UP_VERIFIED';                       // FAIL CLOSED (S0.15)
  const tier = aiToolRegistry.get(key)?.riskTier ?? 'restricted';         // valid: 47 of the 56 resolve
  return maxLevel(row.min_verification, RISK_FLOOR[tier], CONSENT_CLASS_FLOOR[row.consent_class]);
}

// AE branch — NEW. Total over AE-CAP. Reads only AE-CAP's own mandatory fields.
function aeFloor(key: string): VerificationLevel {
  const cap = actionCapabilityRegistry.tryGet(key);
  if (cap === undefined)                       return 'STEP_UP_VERIFIED';   // FAIL CLOSED — unregistered
  const row = AE_WIDGET_COMMIT_ALLOWLIST[key];
  if (row === undefined)                       return 'STEP_UP_VERIFIED';   // FAIL CLOSED — not allowlisted
  if (cap.policyDecision !== 'ALLOW')          return 'STEP_UP_VERIFIED';   // FAIL CLOSED — SHADOW_ONLY / DENY
  if (!cap.allowedSourceTypes.includes('authenticated_request'))
                                               return 'STEP_UP_VERIFIED';   // FAIL CLOSED — not widget-reachable
  return maxLevel(
    row.min_verification,                              // never below SESSION_VERIFIED (§0B.15)
    AE_AUTONOMY_FLOOR(cap.autonomyLevel),              // total by default, below
    AE_FAMILY_FLOOR[row.family],                       // total over the 8 families
  );
}

// autonomyLevel is typed `string`, not a union (action-engine.contract.ts:183), so this
// table CANNOT be total by type. It is made total by an explicit default.
function AE_AUTONOMY_FLOOR(level: string): VerificationLevel {
  switch (level) {
    case 'L2_CONFIRMED_REQUEST': return 'SESSION_VERIFIED';
    case 'L2_SERVER_POLICY':     return 'SESSION_VERIFIED';
    case 'L3_CANONICAL':         return 'SESSION_VERIFIED';
    case 'L3_OWNER_APPROVED':    return 'SESSION_VERIFIED';
    case 'L0_PROVIDER_DEFERRED': return 'STEP_UP_VERIFIED';   // provider-deferred: never chat-actuated
    case 'L2_5_SHADOW':          return 'STEP_UP_VERIFIED';   // unreachable anyway (policyDecision)
    case 'KERNEL_TEST_ONLY':     return 'STEP_UP_VERIFIED';
    default:                     return 'STEP_UP_VERIFIED';   // FAIL-CLOSED DEFAULT — a new level added
  }                                                           // upstream withholds, it does not admit
}

const AE_FAMILY_FLOOR: Readonly<Record<AeCommitRow['family'], VerificationLevel>> = {
  booking: 'SESSION_VERIFIED',  settings: 'SESSION_VERIFIED',  operational: 'SESSION_VERIFIED',
  marketing_fanout: 'STEP_UP_VERIFIED', money: 'STEP_UP_VERIFIED',
  consent: 'STEP_UP_VERIFIED',  identity: 'STEP_UP_VERIFIED',  tenant_authority: 'STEP_UP_VERIFIED',
};
```

**The seven observed `autonomyLevel` values were obtained by enumeration** — `L2_CONFIRMED_REQUEST` 19, `L2_5_SHADOW` 95, `L0_PROVIDER_DEFERRED` 1, `L2_SERVER_POLICY` 50, `L3_CANONICAL` 42, `L3_OWNER_APPROVED` 14, `KERNEL_TEST_ONLY` 5 — and the `default` branch exists precisely because the field's type cannot forbid an eighth. `AE_FAMILY_FLOOR`'s five `STEP_UP_VERIFIED` rows are deliberate and their meaning is stated plainly: **while P-12 is `[ABSENT]`, `STEP_UP_VERIFIED` is unreachable, so those five families are permanently withheld** — the same outcome §0B.24's allowlist already produces, reached independently, which is what defence in depth means.

**S0B.32 — `verificationFloor` keeps arity 2; `WIDGET_CAPABILITY_POLICY`'s domain is corrected.** §0.13's `verificationFloor(i, kind)` is unchanged except that its third term is `subjectFloor(subjectCapability(i))` with the dispatched function above. §0.14's totality rule is corrected: **`WIDGET_CAPABILITY_POLICY` is keyed on `CapabilityRef`, and is total over `C9_CAPABILITIES` (56 rows) only.** Its `consent_class` and `min_verification` columns are C9/TOOL concepts (`riskTier`, `approvalPolicy`) and have no meaning over AE-CAP; §0.14's requirement that it also cover "every Action Engine capability key reachable by a `COMMIT`" is **VOID** and is replaced by §0B.16's totality assertion over `AE_WIDGET_COMMIT_ALLOWLIST` ∪ `AE_CAPABILITY_GAP_LEDGER`, which is total over all 226.

**S0B.33 — `requiredConfirmationKind` loses its default branch.** §0.33's function is **VOID as a derivation** and replaced by a table lookup:

```ts
function requiredConfirmationKind(aeKey: string): WidgetKind {
  const row = AE_WIDGET_COMMIT_ALLOWLIST[aeKey];
  if (row === undefined) refuseMint('capability_not_allowlisted');   // FAIL CLOSED
  return row.confirmation_kind;
}
```

**Why the derivation had to go, measured.** Applied to the registry as written, §0.33's chain — `financial` ⟹ `PAYMENT_HANDOFF`, else `targetKind === 'appointment'` ⟹ `BOOKING_CONFIRMATION`, **else `SETTINGS_DRAFT`** — routes:

| result | over all 226 | over the 105 `ALLOW` + widget-reachable |
|---|---|---|
| `PAYMENT_HANDOFF` | 4 | 4 |
| `BOOKING_CONFIRMATION` | 7 | 7 |
| **`SETTINGS_DRAFT` (the default branch)** | **118** | **94** |
| not mintable (`SHADOW_ONLY` / `DENY`) | 97 | — |

**Ninety-four of the hundred-and-five widget-reachable actuating capabilities land on `SETTINGS_DRAFT` — a COMMIT-bearing kind — by falling off the end of a two-test chain.** Among them: the bulk marketing send, every tenant-billing charge, every commerce-credential installation, every loyalty-ledger mutation, every gift-certificate redemption, every subscription checkout, every referral reward, tenant suspension, session revocation and consent recording. **`SETTINGS_DRAFT` was not a settings kind; it was the default disposal of the Action Engine.** A fence whose negative branch is "render a commit button" is not a fence. §0.33's `policyDecision`/`riskFacets` terms survive only as the §0B.16 vetoes.

---

## 0-B.5 The four mechanical repairs (B5)

### S0B.34 — one `RoleHint` union: twelve members

§2.5's `RoleHint` has **twelve** members; §4.8's `A11yBlock.role_hint` inlines **eleven**, omitting `'region'` — while §2.6 assigns `region` to six of the twenty-two kinds (`BOOKING_CONFIRMATION`, `APPROVAL`, `SETTINGS_DRAFT`, `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`). As written, those six kinds cannot populate `presentation.a11y.role_hint` at all. **The inline union in §4.8's `A11yBlock` is VOID. There is one union, declared once, in §2.5, and `A11yBlock.role_hint` references it by name:**

```ts
type RoleHint =
  | 'group' | 'radiogroup' | 'listbox' | 'table' | 'grid' | 'document'
  | 'status' | 'progressbar' | 'form' | 'region' | 'img' | 'link';   // twelve, closed

interface A11yBlock { role_hint: RoleHint; /* … unchanged … */ }
```

*Mechanism:* the type reference plus a build test asserting `RoleHint` is declared exactly once in the source. *Evaluation point:* `EP-BUILD`.

### S0B.35 — one `role_hint` per kind: `KIND_REGISTRY` owns it, §4.8.2 derives it

§0.1 gives §2 sole ownership of `role_hint`. §4.8.2's `role_hint` column is therefore **derived from `KIND_REGISTRY[kind].role_hint`, never independently authored**; where §4.8.2 currently prints a different token it is **VOID as a `role_hint`**, and its keyboard-model, text-alternative, live-region and non-colour-state columns stand. Seven divergences existed; all seven are resolved in favour of §2, except one where §2's own token contradicts §2.5's definition of it:

| kind | §2.6 | §4.8.2 | resolved | why |
|---|---|---|---|---|
| `STAFF_SELECTOR` | `radiogroup` | `listbox` | **`radiogroup`** | single-select; §4.8.2's "as CHOICE" model is the radiogroup model |
| `TIME_SLOT_SELECTOR` | `listbox` | `grid` | **`listbox`** | §4.8.2's own keyboard model (arrows within a group, PageUp/PageDown across groups) is §2.5's `listbox` row with server group boundaries |
| `BOOKING_CONFIRMATION` | `region` | `document` | **`region`** | §4.8.2's model (focus on the heading, controls in `reading_order`) is §2.5's `region` row verbatim |
| `METRIC` | `status` | `group` | **`group`** | **the one reversal.** §2.5 binds `status` to `role="status"` + `aria-live="polite"`, while §4.8.2 assigns METRIC `live_region: 'off'`; both cannot hold, and an always-announcing metric card is what A-12 exists to prevent. §2.5's `group` row — `role="group"` + `aria-labelledby`, Tab through controls — is what METRIC is. §2.6.8's `status` is **VOID** |
| `APPROVAL` | `region` | `document` | **`region`** | as `BOOKING_CONFIRMATION` |
| `SOURCE_STATUS` | `status` | `table` | **`status`** | the body is `sources[]`, not a `TableSpec`; A-17's table obligations have no artefact to attach to. §4.8.2's `polite` live region is consistent with `status` |
| `SETTINGS_DRAFT` | `region` | `table` + `form` | **`region`** | "table + form" is not a member of the union and is not well-typed; §2.6.16's own sentence — "nothing in this body is input" — excludes `form` |

### S0B.36 — §4.8.2's per-kind floor table, total over twenty-two

§4.8.2 has **seventeen** rows; `CONSENT_STATE`, `IDENTITY_BINDING`, `PAYMENT_HANDOFF`, `MEDIA_PREVIEW` and `ARTIFACT` have none — and §4.8.2's own enforcement sentence says "a kind with no row cannot pass A-21 because the suite has no branch for it", so the five kinds §2.1 added are **unpassable, not merely undocumented**. The five rows:

| kind | `role_hint` | keyboard model | text alternative | live region | non-colour state |
|---|---|---|---|---|---|
| `CONSENT_STATE` | `region` | focus lands on the heading; `change_handoff_intent` is a button in `reading_order`; the escape is always keyboard-reachable | the current decision, when it was recorded, what it permits, what changing it would do, and the sentence naming the verified surface where it can be changed — in full | `polite` | the decision is a word («разрешено» / «запрещено» / «неизвестно»), never a colour and never a switch position |
| `IDENTITY_BINDING` | `region` | one heading; per binding, `manage_handoff_intent` is an in-row button in `reading_order` | per channel: which, since when, what it unlocks, what unlinking would cost, then the handoff sentence | `polite` | `state` as a word («связан» / «не связан» / «ожидает») |
| `PAYMENT_HANDOFF` | `region` | focus lands on the heading; `commit_intent` / `continue_intent` / `dismiss_intent` are buttons in `reading_order`; the escape is always keyboard-reachable | what is bought, the exact amount as a formatted `Measure`, who takes the payment, what returns afterwards, and when the handle expires | `polite` | the amount is prose; a gap-blocked commit renders as a `Limitation` in prose — **never as a disabled-styled button** (§2 K20) |
| `MEDIA_PREVIEW` | `img` | not focusable; `regenerate_intent` and `fullscreen_intent` are ordinary tab stops | text parity `recipe_only`: the recipe (request, parameters, when, producer) plus `alt` | `off` | a not-yet-ready state is a word; the image is described, never only shown |
| `ARTIFACT` | `link` | one tab stop; Enter activates; accessible name = `filename` + `format` + `size_bytes` | text parity `file_facts_only`: filename, format, size, what it contains, whether it contains personal data, when the link expires | `off` | expiry and personal-data presence are words, never icons |

*Mechanism:* §4.8.2's own — the table compiles into the renderer conformance suite as a per-kind fixture set — plus a build assertion that the fixture set has exactly twenty-two branches keyed on `WidgetKind`. *Evaluation point:* `EP-BUILD`.

### S0B.37 — `kindCeiling` and `on_expiry`: one value per kind, total over twenty-two

§4.1.3's table covers seventeen kinds and diverges from §2.6 on two of them. **The shorter ceiling governs** — this follows from §4.1.1 L3 ("bounded by four clocks, whichever is soonest") and §4.4.2 RT4 ("the shortest applicable ceiling wins") and is the fail-closed direction. §4.1.3's `300 s` for `TIME_SLOT_SELECTOR` and `900 s` for `BOOKING_CONFIRMATION` are **VOID**.

**The five kinds §4.1.3 omits all carry a server-minted, expiring handle** — a register read, a binding read, a payment session (`shell.pay`), a signed asset, a signed file (`shell.file`). For every one of them `mark_stale` would leave a dead handle rendered as a live control, which §2 K20 forbids. **`re_resolve` is therefore the only admissible value for all five**, and it is reached by one rule rather than five judgements.

| # | kind | `expires_at` ceiling | `on_expiry` (mandatory) | `flow_ttl_s` |
|---|---|---|---|---|
| 1 | `CHOICE` | 1800 s | `re_resolve` | 1800 when in a flow, else null |
| 2 | `SERVICE_SELECTOR` | 900 s | `re_resolve` | 1800 |
| 3 | `STAFF_SELECTOR` | 900 s | `re_resolve` | 1800 |
| 4 | `TIME_SLOT_SELECTOR` | **90 s**, and ≤ the booking owner's slot-hold TTL | `re_resolve` | 1800 |
| 5 | `BOOKING_CONFIRMATION` | **120 s**, and ≤ the canonical draft's hold TTL | `re_resolve` | 1800 |
| 6 | `SCHEDULE` | 300 s | `re_resolve` | null |
| 7 | `CLIENT_LIST` | 300 s | `re_resolve` | null |
| 8 | `METRIC` | `as_of` + capability freshness window, ≤ 86400 s | `mark_stale` | null |
| 9 | `CHART` | as `METRIC` | `mark_stale` | null |
| 10 | `REPORT` | as `METRIC` | `mark_stale` | null |
| 11 | `STRATEGY_OPTIONS` | revision validity, ≤ 86400 s | `re_resolve` | null |
| 12 | `APPROVAL` | `source_bound` — the approval object's own TTL (`approvalBindingExpiresAt`) | `re_resolve` | null |
| 13 | `PROGRESS` | `source_bound` — the run window, ≤ 3600 s | `re_resolve` | null |
| 14 | `LIMITATION` | 1800 s | `mark_stale` | null |
| 15 | `SOURCE_STATUS` | 1800 s | `mark_stale` | null |
| 16 | `SETTINGS_DRAFT` | 900 s | `re_resolve` | 1800 |
| 17 | `FORM` | 900 s | `re_resolve` | 1800 |
| 18 | **`CONSENT_STATE`** | **300 s** | **`re_resolve`** | null |
| 19 | **`IDENTITY_BINDING`** | **300 s** | **`re_resolve`** | null |
| 20 | **`PAYMENT_HANDOFF`** | **`source_bound` — the `shell.pay` `session_ref` TTL, ≤ 900 s** | **`re_resolve`** | 1800 |
| 21 | **`MEDIA_PREVIEW`** | **`source_bound` — the signed asset TTL, ≤ 3600 s** | **`re_resolve`** | null |
| 22 | **`ARTIFACT`** | **`source_bound` — the `shell.file` link TTL, ≤ 900 s** | **`re_resolve`** | null |

`IDENTITY_BINDING`'s 300 s is not arbitrary: §4.1.1 L4 makes an unlink/relink invalidate every outstanding envelope retroactively, so a long ceiling on a binding display is a contradiction of L4.

*Mechanism:* `KindRule.expires_at_ceiling_s` (§2.2, `number | 'source_bound'`) is populated from this table and from nothing else; `on_expiry` is compiled into the emission validator as a per-kind constant (§4.1.3 L10) and is never an authored field; `KIND_REGISTRY` is a mapped type over `WidgetKind`, so a missing row fails compilation. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`.

---

## 0-B.6 `SETTINGS_DRAFT` versus expenses (B6)

**S0B.38 — the conflict.** §0.41 lists `EXPENSE_OWNER` (`expenses.read`, `expenses.create`) among the owner classes `SETTINGS_DRAFT` may carry a `COMMIT` for. §0.42 forbids a `COMMIT` on `SETTINGS_DRAFT` unless `requiredConfirmationKind(aeKey) === 'SETTINGS_DRAFT'` **and** the C9 propose key's `consent_class ∈ {none, communication}`. §0.44 asserts that "`expenses.create` is **not** finance: it records a fact about money already spent, moves nothing".

**S0B.39 — the ruling, verified against `action-engine.registry.ts`: `SETTINGS_DRAFT` may NOT carry a `COMMIT` for `EXPENSE_OWNER`. §0.41's `EXPENSE_OWNER` row is VOID.**

The verified facts:

- `expenses.create` (C9-CAP / TOOL-DEF) maps to **`expenses.create.execute.v1`** (AE-CAP) — §0B.11, traced through `ExpensesService.create` → `P407ExpenseCanonicalCutoverService` → `P4_07_EXECUTABLE_CAPABILITIES.create` (`action-engine/p4-07-expense-executable.contract.ts:10–14`).
- `expenses.create.execute.v1` is registered with **`riskFacets: ['local', 'financial', 'expense_ledger', 'atomic']`**, `policyDecision: ALLOW`, `targetKind: 'expense'`, **`approvalRequirement: 'REQUIRED'`**, `approverPolicyKey: 'tenant-owner'`.
- Its siblings `expenses.delete.execute.v1` (`REQUIRED`) and `expenses.period-declare.execute.v1` (`NONE`) carry the same `['local','financial','expense_ledger', …]` facets.

**The Action Engine registry classifies expense creation as `financial`.** §0.42's first condition therefore already fails on its own terms — `requiredConfirmationKind` returns `PAYMENT_HANDOFF`, not `SETTINGS_DRAFT` — before §0.44's `consent_class` argument is ever reached. **The two rules do not actually conflict; §0.42 already voids §0.41's row, and nobody noticed because nobody evaluated the function against the registry.** §0.44's reasoning is a widget-layer `consent_class` argument about a widget-layer table; it is not wrong about intent, but it has no authority over `riskFacets`, and `riskFacets` is what `requiredConfirmationKind` reads.

Under §0B.24 the outcome is the same and is reached three times over: `MONEY(expenses.create.execute.v1)` holds by **three independent terms** — the `financial` facet, the `expense_ledger` facet, and `targetKind: 'expense'` ∈ `MONEY_TARGET_KINDS`.

**Therefore, normatively:**

> `EXPENSE_OWNER` is **removed from §0.41's enumeration**. `SETTINGS_DRAFT`'s admissible owner classes are `SETTINGS_OWNER`, `NOTIFICATION_PREF_OWNER`, `SCHEDULE_RULE_OWNER`, `TENANT_CONFIG_OWNER`, `TASK_OWNER`, `AUDIENCE_OWNER` — six, not seven — and `TENANT_CONFIG_OWNER` is itself gap-blocked on `GAP-TENANT-CONFIG-COMMIT` (§0B.12) while `AUDIENCE_OWNER`'s only actuating key routes to the `APPROVAL` path of §0B.22, so **two of the six carry no `SETTINGS_DRAFT` commit in this contract version**. `expenses.read` remains a read. `expenses.create`, `expenses.delete` and `expenses.period.complete` carry **no `COMMIT` on any kind**: `expenses.create.execute.v1` and `expenses.period-declare.execute.v1` are in `AE_CAPABILITY_GAP_LEDGER` under **`GAP-EXPENSE-COMMIT`**, `expenses.delete.execute.v1` under **`GAP-EXPENSE-DELETE`** (§0B.12 — it has no propose key at all). Each emits `capability_gap_ref` and **no actuating control**. `draft_class` loses `'expense'` and becomes `'settings' | 'notification_pref' | 'task' | 'schedule_rule' | 'audience'`.

*Mechanism:* §0B.16's start-up assertion (`MONEY(cap) ⟹ confirmation_kind === 'PAYMENT_HANDOFF'`, and no money capability is allowlisted), plus the `EP-REGISTRY-LOAD` assertion that `SETTINGS_DRAFT`'s resolved key set is disjoint from `{cap : MONEY(cap)}`. *Evaluation points:* `EP-REGISTRY-LOAD`, `EP-MINT`, `EP-INGRESS` Gate 7.

**S0B.40 — the honest consequence, stated rather than hidden.** Expense recording — one of the product's real, wanted, already-shipped AI-tool capabilities — **has no widget button in this contract version.** That is a capability reduction, not a design win. It follows mechanically from two independent decisions made elsewhere: the Action Engine's decision to tag `create_expense` `financial`, and this contract's decision that every financial capability routes to a gap-blocked `PAYMENT_HANDOFF`. **The resolution path is a single owner decision, and it belongs in the ledger, not in a widget rule:** either the Action Engine retags expense recording (it moves no money, and `MAX_EXPENSE_RUBLES` already bounds it at `expense-category.ts`, as §0.44 correctly observes), or `PAYMENT_HANDOFF` ships (P-14) and expenses reach a button through it. Until one happens, `GAP-EXPENSE-COMMIT` is the honest state and `EXPENSE_OWNER` on `SETTINGS_DRAFT` is the dishonest one, because the button it promises is refused at Gate 7 in every case.

---

## 0-B.7 Prerequisites registered by this section

**S0B.41.** Continuing Annex A's series, under §A2's `NORMATIVE-PENDING` rule and its fail-closed default.

| # | Component | Depends on it | Status | Package |
|---|---|---|---|---|
| **P-23** | **`AE_WIDGET_COMMIT_ALLOWLIST` + `AE_CAPABILITY_GAP_LEDGER`**, jointly total over `ActionCapabilityRegistry.list()`, with the start-up assertion of §0B.16 | FR-3, FR-6a, FR-6b, FR-6c, FR-6d, FR-6e (the tenant-object half), FR-6f; `requiredConfirmationKind`; `aeFloor`; §0B.13 | `[ABSENT]` — the widget layer does not exist (§A0.5); no allowlist over AE-CAP exists in any form | **K2** (the tables, wave 1) over **K1**'s gap ledger |
| **P-24** | **`CapabilityRef` — the space-qualified capability type**, with the per-effect space rule of §0B.7 | every rule that cites a capability key; `subjectCapability`; `subjectFloor`; `WIDGET_CAPABILITY_POLICY`'s key type; §0.32's key-space rule | `[ABSENT]` — every capability field in §§1–4 is typed `string` | **K2** (wave 1) |
| **P-25** | **`AE_PROPOSE_PAIRING`** — the propose-key ↔ AE-key table of §0B.13, and its three assertions | §0.32's runtime rule (the owner names the AE key); §0.34's `produced_by_intent_token_hash` guard; FR-6b, FR-7 | `[ABSENT]` — and **it cannot be derived from code**: no module maps a C9-CAP key to an AE-CAP key (§0B.10) | **K2** (the table) + **K7** (the booking rows, wave 3) |
| **P-26** | **Gate 6's key-space dispatch** — `AiToolPolicyService.assertCanExecute` for `C9`/`TOOL`; the AE policy pre-screen for `AE`; §0.23's owner-endpoint lock for `CONTROL`; plus the Gate 6 ↔ Gate 14 agreement check | FR-3; §3.9 Gate 6 for every effect class | `[ABSENT]` — the gateway does not exist (P-01). The **AE-side resolver is `[EXISTS]`** at `action-engine.policy-resolver.ts` | **K3** (wave 2) |
| **P-27** | **`controlledFixtureMode === false` in production**, asserted at build | §0B.26's approver-role fence; without it the approver set silently widens from two roles to six (`action-engine.kernel.ts:583–585`) | `[ABSENT]` as an assertion; the flag itself `[EXISTS]` | **K11** (wave 4) |
| **P-28** | **A widget `ActionSourceType` discipline** — a build test asserting the gateway constructs `source.type` only as `'authenticated_request'` | §0B.17's entire `allowedSourceTypes` fence, which is the one AE-CAP property that already excludes 53 of 226 capabilities from the widget path | `[ABSENT]` — the gateway does not exist | **K3** (wave 2) |

---

## 0-B.8 Repository observations

**S0B.42.** *These are findings about the running system, recorded here so that no reader of this contract believes the widget layer compensates for them. None is a widget-contract rule.*

1. **`communication.bulk-campaign.execute.v1` is an ungated second door onto `deliver_bulk_campaign`** — §0B.23, in full.
2. **164 of 221 canonical policy definitions receive the permissive twelve-role default**, `TENANT_ACTION_ROLES`, which includes `CLIENT`, `CUSTOMER`, `EMPLOYEE`, `STAFF` and `INTEGRATION_SERVICE` (`action-engine.policy-registry.ts:11–24, 177`). The role fence over AE-CAP is real where a prefix rule names the capability and nearly vacuous elsewhere. Among those receiving the default: `package5.wave2.suspend-tenant.execute.v1`, `package5.wave2.revoke-all-sessions.execute.v1`, `package5.wave2.create-tenant-user.execute.v1`, `package5.wave3.install-crm-credentials.execute.v1`, `loyalty.legacy-redeem.execute.v1`, `gift-certificates.redemption.execute.v1`.
3. **`permissionCodes` is validated and attested but never evaluated** (`policy-resolver.ts:280–290`, `:914`). It reads as an authorisation mechanism and is not one.
4. **`riskFacets` is an open, unvalidated string vocabulary** — 98 distinct tokens across 226 rows, with no closed union and no registration discipline. Any downstream consumer that keys a decision on an exact token membership inherits §0B.24's defect. This contract now keys none.
5. **`ActionEngineKernel.decideApproval()` does not compare the approver to the initiator** — §0B.27(1), reproducing §0.49 and §A4.1 over AE-CAP.
6. **`crm.visit.payment.v1` is `policyDecision: DENY` and carries the `financial` facet** — the payment fence of §0.4(b) is real and running at the Action Engine, independently of anything the widget layer does. This one is a credit, recorded so the register is not read as uniformly negative.

---

## 0-B.9 Errata — what this section voids

| # | Where | What it says | Ruling |
|---|---|---|---|
| **EB-1** | §0.13 `subjectFloor` | `aiToolRegistry.get(key)?.riskTier ?? 'restricted'` applied to any capability key | **VOID.** A TOOL-DEF term over an AE-CAP key is always `undefined` ⇒ `restricted` ⇒ the unreachable `STEP_UP_VERIFIED`. §0B.31's dispatched `subjectFloor` governs. |
| **EB-2** | §0.14 | `WIDGET_CAPABILITY_POLICY` must be total over "the C9 canon **and** every Action Engine capability key" | **VOID** as to the AE half. Its columns are C9/TOOL concepts. §0B.32: total over the 56 C9 keys; §0B.16's assertion covers the 226 AE keys. |
| **EB-3** | §0.15 FR-3, §3.9 Gate 6 | `AiToolPolicyService.assertCanExecute` as the authority mechanism for every effect class | **VOID for `COMMIT` and `REQUEST_APPROVAL`** — the call cannot be constructed for an AE-CAP key. §0B.18 governs; §3.9 Gate 6 is amended to dispatch by space. |
| **EB-4** | §0.15 FR-6a, §3.5 R3.5.1 | `NEVER_CHAT_ACTUATED` membership as the consent fence | **Preserved but vacuous** — all eight names resolve in no space. §0B.20 adds the `CONSENT(cap)` allowlist exclusion over AE-CAP, which is satisfiable. |
| **EB-5** | §0.15 FR-6c, §0.17 item 12 | `b35.confirm` is `OWNER_HANDOFF`, "so no bulk-send `COMMIT` is mintable at all"; status `[EXISTS] (the mode)` | **VOID.** `C9Capability.mode` (`c9.registry.ts:56`) is a C9 run mode, read by nothing under `src/action-engine/`. §0B.22 governs. |
| **EB-6** | §0.15 FR-6d, §0.33 | `cap.riskFacets.includes('financial')` as the finance fence | **VOID as a fence.** It catches 12 of 226 (4 of the 105 reachable) and misses 35 money-mutating reachable capabilities. Retained only as a §0B.16 veto. §0B.24 governs. |
| **EB-7** | §0.15 FR-6f, §0.46 | `AiToolPolicyService.assertCanDecide` as the approval mechanism | **VOID for Action Engine approvals.** §0B.26 governs. §0.46's *description* of the guarantee (role-gated, not separation of duties) stands. |
| **EB-8** | §0.33 | `requiredConfirmationKind`'s `return 'SETTINGS_DRAFT'` default branch | **VOID.** It routes 118 of 226 capabilities — 94 of the 105 reachable — to a COMMIT-bearing kind by falling off a two-test chain. §0B.33 governs. |
| **EB-9** | §0.41 | `EXPENSE_OWNER` among `SETTINGS_DRAFT`'s owner classes | **VOID.** §0B.39: `expenses.create.execute.v1` carries `riskFacets: ['local','financial','expense_ledger','atomic']`; `GAP-EXPENSE-COMMIT`. |
| **EB-10** | §4.8 `A11yBlock` | the inline eleven-member `role_hint` union | **VOID.** One union, §2.5's twelve. §0B.34. |
| **EB-11** | §2.6.8 | `METRIC` `role_hint` `status` | **VOID.** `group`. §0B.35 — `status` implies `aria-live="polite"` by §2.5, contradicting §4.8.2's `live_region: 'off'`. |
| **EB-12** | §4.8.2 | the `role_hint` column, where it diverges from §2 | **VOID as a `role_hint`**; derived from `KIND_REGISTRY`. The other four columns stand. §0B.35. |
| **EB-13** | §4.8.2 | the seventeen-row table | **Amended to twenty-two.** §0B.36. |
| **EB-14** | §4.1.3 | `TIME_SLOT_SELECTOR` 300 s; `BOOKING_CONFIRMATION` 900 s | **VOID.** 90 s and 120 s — §2.6.4 and §2.6.5, the shorter values, per L3 and RT4. §0B.37. |
| **EB-15** | §4.1.3 | the fourteen-row (seventeen-kind) ceiling and `on_expiry` table, declared "mandatory per kind" | **Amended to twenty-two.** §0B.37. |