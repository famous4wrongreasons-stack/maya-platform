# Section 0-C — closure errata

## 0-C.0 Status, precedence, and method

**S0C.1 — what this section is, and the two certification rounds that shaped it.** Section
0-B closed the key-space defect and the four mechanical repairs. Two further rounds of
independent adversarial certification of the **assembled** contract (spine + 0-B + §§1–4 +
Annex A) then ran, each with three certifiers reading the artefact in full and executing the
registries rather than grepping them.

| Round | Filed | Distinct root causes | Outcome |
|---|---|---|---|
| **Round 3** — against spine + 0-B + body + annex | 7 structural, 0 security, 8 unproven | 6 structural, 4 unproven | Closed by **EC-1 … EC-10** |
| **Round 4** — against the assembled contract **including** a first draft of this section | 16 structural, **2 security**, 6 unproven | 5 repairs of EC-2 … EC-9 themselves, plus 6 new | Closed by the amendments in place above and by **EC-11 … EC-16** |
| **Round 5** — against the repaired section, four lenses, adjudication complete | 10 structural, **0 security**, 6 unproven filed → **4 structural confirmed**, 0/0 | 3 dangling identifiers this section introduced, plus 1 found while repairing them | Closed in place and by **EC-17** |
| **Round 6** — four lenses, adjudication complete | 16 structural, **0 security**, 3 unproven filed → **8 structural confirmed**, 0/0 | all 8 in **one paragraph**, §0C.22-ter, over 3 type-level defects | Closed in place |
| **Round 7** — four lenses, adjudication complete | 23 structural, 3 security, 5 unproven filed → **8 structural + 1 unproven confirmed**, 0 security | 7 defects, all type-level or spelling, all in this section | Closed in place; see §0C.17-ter and §0C.22-quater |
| **Round 8** — four lenses; adjudication incomplete, so its filed counts were used directly | 23 structural, **0 security**, 5 unproven filed | **all four lenses: fundamental rules HOLD, 0 security** — round 7's FR-3/FR-4 defects closed. Two "the repair is inert" defects | Closed in place; see §0C.10-bis and §0C.17-quater |
| **Round 9** — four lenses, batched adjudication | 7 structural, **0 security**, 3 unproven filed → **1 structural + 2 unproven confirmed** | 3 defects, all surfaced *by* the totality claims this section makes | Closed in place; see §0C.22-sexies, §0C.22-septies, §0C.28-quater |
| **Round 10** — four lenses; adjudication blocked by a usage limit, so its filed counts were used directly | 14 structural, 1 security, 3 unproven filed | 11 defects: 5 stale cross-references this section had left behind, 6 substantive | Closed in place; see §0C.28-quinquies and **EC-18** |
| **Residual close-out** — the sixteen EC-20 residuals, all adjudicated in the main context | 16 filed → **16 confirmed, 0 refuted** | 13 structural, 3 unproven; none security | Closed in place; see **EC-21** |
| **Final pass** — four lenses, every finding adjudicated in the main context | 16 structural, **0 security**, 3 unproven filed → **19 findings, 11 distinct defects, all confirmed** | nine were in text written in rounds 9–10; two (`AuthorityHint`, `IntentRecord.priority`) were older | Closed in place; see **EC-19** |

**The final pass is the one that found the two oldest defects**, and both were of the class this
section states as a rule. `AuthorityHint` is a **non-nullable member of every `WidgetIntent`**
that feeds `body_hash`, and no shape has ever declared it — two occurrences in 6451 lines, one of
them the declaration that names it. And `FLOOR_EXEMPT` reads `i.priority` while `IntentRecord`
declares no such member, so §0.16's Gate 5 — which "recomputes `verificationFloor()` from the
live tables and refuses on **any** difference" — could not have recomputed the exempt branch at
all: every exempt intent would have diverged and been refused, silently inverting the erratum
that created it. Nine further defects were in the newest text, which is where every round has
found them.

**Round 10's six substantive findings were all of one shape — a rule this section made total,
meeting a path it had not walked.** Gate 6 dispatched on `record.capability`, which §3.2 fixes
**null for every `HANDOFF`**, so the C9 branch would have been skipped for the effect class
whose subject is most often a C9 key. `PROGRESS`'s declared interactive path still named
`steps[].unknown`, a member §0.19 deleted. The escape verb is required in `reading_order` by
three separate accessibility clauses and appears in **no** kind's `interactive_paths`, so K22's
set-equality rule and those clauses could not both hold. `accessible_name_suffix` was typed one
string per kind when `CLIENT_LIST`'s applies to bulk intents and not to row refs. `MomentTemplate`
was normative and undeclared. And `RUN_OPENING` was not ref-nullable though `subjectCapability`
returns null. The five remaining were this section's own stale cross-references — "six members"
after a seventh was added, a `§9.1` citation for a `§1.3` shape, an errata row still describing
a flat `ANONYMOUS` after round 7 changed the code beneath it.

**Round 9's three findings are the best argument for why this section declares things total.**
Each was invisible until a totality claim forced the question: `nameSourceOf` declared total
over `InteractiveRef` exposed that **`TIME_SLOT_SELECTOR`'s declared interactive path
`groups[].slots[].slot_ref` had no member that could denote it** — K22's set-equality rule was
unsatisfiable for the booking flow's central kind — and that **`STRATEGY_OPTIONS.alternatives[]`
is not an `OptionItem`** and declares no `label`. The `accessible_name_suffix` default exposed
that four §4.8.2 rows already require named content *in the accessible name*, so an empty
default was a contradiction rather than a default. And the `c9_domain` refusal exposed that
**`correlation.agent_id` is null by construction on the run-less capability-read path**, so the
refusal as written would have made every C9 capability-read envelope unmintable.

**Round 7 found two that mattered more than their class suggests**, and both were in this
section's own repairs. `MAYA_AI_TOOL_CATALOG_BY_NAME` was declared a `ReadonlyMap` and then
**bracket-indexed** in two places, so `def` would always have been `undefined`: in `c9Floor`
the TOOL-DEF risk term would have silently vanished for all 47 catalogue keys, and in EC-11's
Gate 6 dispatch the `assertCanExecute` branch would have been **dead for all 56**, dropping
every C9 key onto a branch that tests no role, surface, feature or risk tier. And
`FLOOR_EXEMPT` returned a flat `ANONYMOUS`, which zeroed a subject's **own** floor —
`control.run.cancel` is `CONTROL_FLOOR: BOUND_CLIENT` and §0.24 mints it as a `CONTROL`
intent. Round 6 had noted that second one as a residual on the ground that "no clause mints it
at priority 0"; round 7 filed it as a conferral defect, and round 7 was right. **A fence that
holds because no current clause exercises the hole is not a fence.**

**Round 6's shape is the useful signal.** Every one of its eight confirmed findings landed in
a single paragraph — `nameSourceOf`, the newest text in the section — and reduced to three
type errors: two interfaces named `REPORT`/`SCHEDULE` where §2.6.10 and §2.6.6 declare
`ReportBody`/`ScheduleBody`; two branches returning a `Phrase` object where §0.18 requires
`.rendered`; and a row-header lookup keyed on the envelope when REPORT's
`sections[].table: TableSpec | null` means one envelope may hold many tables. Nothing
elsewhere in the section survived adjudication, and **EC-1 … EC-5 were each independently
confirmed closed**. The same round also caught a floor **raise** the first draft of EC-2 had
introduced (§0C.32).

Round 5 is worth reading for what it did **not** find: **0 security-contract violations and
0 unproven normative claims survived adjudication**, and all four lenses independently
confirmed that `FLOOR_EXEMPT` cannot carry an actuating intent — one of them by enumerating
`C9_CAPABILITIES` in process to confirm that exactly one row has `resourceClass: 'LOCAL'`,
which is what makes EC-4's escape hatch a structural property rather than a name on a list.
What it **did** find was three identifiers this section itself introduced without declaring —
`c9Registry.get`, `c9Capability`'s `domain` argument, and `intentOf` — the same defect class
for the third round running, which is why §0C.11-bis's rule is stated as a rule and not as a
remark.

Round 4 is the more important of the two, because **four of the ten errata in this section's
first draft did not close their own defect, and one of them opened a security hole.** They
are corrected in place rather than layered over, and each correction says what the first
draft got wrong:

- **EC-3** compared identities across two disjoint key spaces (§0C.13-bis).
- **EC-4** keyed its exemption on four `role` values §3.1's closed union does not declare,
  and its capability clause would have excluded the two `REFINE` intents it existed to admit.
- **EC-5**'s start-up assertion demanded a uniqueness that its own field definition forbids,
  so the process could never have started (§0C.20).
- **EC-6** named a carrier — `a11y.accessible_name` — that `A11yBlock` does not declare and,
  being one block per envelope, could not have carried per-control (§0C.22-bis).
- **EC-9** keyed **Gate 8-R on `profile_id`**, which R3.8.3 declares advisory and not an
  authority input — handing the caller the switch that disables a readback on a spoken
  commit. This was filed as a **security-contract violation** by two independent lenses, and
  it was correct (§0C.26-bis).

This section introduces no new research. Every repair is the remedy the finding that raised
the defect named for it, and every repository fact it relies on was re-verified here by
executing the registries.

**S0C.2 — precedence.** Where this section conflicts with Section 0, Section 0-B, §§1–4 or
Annex A, **this section governs**, and §0C.13 records exactly what it voids. Where it is
silent, those documents stand unchanged. It creates no capability, widens no envelope,
adds no C9 or Action Engine registry field, and changes no C6–C9 canonical business
contract.

**S0C.3 — method, stated so a reader can repeat it.** Every count and every field in this
section was obtained by loading the module and enumerating it in process:
`new ActionCapabilityRegistry().list()` → **226**;
`canonicalProductionPolicyDefinitions()` → **221**;
`MAYA_AI_TOOL_CATALOG` → **47**; `C9_CAPABILITIES` → **56**.
Two facts a grep would have reported wrongly, and which are load-bearing below:
`RegisteredActionCapabilityV1` has **no** `clientPrincipalTarget` member at all — the field
is declared on `CanonicalActionPolicyDefinitionV1` (`action-engine.policy-resolver.ts:78`),
a different type in a different file — and `C9Capability.mode` and `.resourceClass` are
**closed unions** in the type system (`c9.registry.ts:56,68`), unlike AE-CAP's
`autonomyLevel`, which is typed `string`.

---

## 0-C.1 EC-1 — the four appointment-detail rows leave the allowlist

**S0C.4 — the defect.** §0B.13(2) requires every AE-CAP key on `AE_WIDGET_COMMIT_ALLOWLIST`
to be the `ae` side of exactly one `AE_PROPOSE_PAIRING` row, **or** to carry `propose: null`
together with `confirmation_kind === 'APPROVAL'`. §0B.21 allowlists
`crm.appointment.attendance.v1`, `.duration.v1`, `.services.v1` and `.fields.v1` with
`confirmation_kind: 'BOOKING_CONFIRMATION'` and `confirmation_of_ref.kind: 'record'`. The
three clauses cannot all hold:

1. §0B.11 is the published propose↔AE mapping and states that a row appears "only where
   that trace completed". It has thirteen rows. Its three appointment rows are
   `appointments.own.{create,cancel,reschedule}` → `crm.appointment.{create,cancel,reschedule}.v1`.
   **None of the four is named.**
2. No propose key for the four can exist. Enumerated in process,
   `MAYA_AI_TOOL_CATALOG`'s entire appointment family is
   `appointments.own.{list,create,cancel,reschedule}` plus the two settings keys
   `notifications.appointments.{read,update}`; the nine C9-only extras (§0C.8) contain
   no appointment key. **The one near-miss is named here so that nobody reaches for
   it:** `catalog.services.read` is a READ of the service *catalogue*, not a propose
   key for `crm.appointment.services.v1`, which mutates one appointment's service
   list. Pairing them would be precisely the name-similarity inference §0B.12
   forbids.
3. §0B.12 forbids filling a missing mapping "by inference, by name similarity, or by a
   projector's choice at runtime", and FR-16 forbids adding a C9-CAP key.
4. The `propose: null` escape is gated on `confirmation_kind === 'APPROVAL'`, which
   contradicts the `BOOKING_CONFIRMATION` the same section assigns.

So §0B.13's assertion set fails at `EP-REGISTRY-LOAD` and the process does not start. This
is fail-closed — FR-6b holds and no forbidden edge is constructible — but it is an
unsatisfiable conflict between two same-precedence normative clauses, and §0B.12 applies
the **opposite** disposition to the structurally identical `expenses.delete`: "an AE
capability with no propose key has no admissible `DRAFT` and therefore no admissible
`COMMIT` under §0.34" → `GAP-EXPENSE-DELETE`.

**S0C.5 — the ruling.** §0B.21's four allowlist rows are **VOID**. The four capabilities
move to `AE_CAPABILITY_GAP_LEDGER` under one new key, **`GAP-APPOINTMENT-DETAIL-COMMIT`**,
for the reason §0B.12 already gives for `expenses.delete`. `AE_WIDGET_COMMIT_ALLOWLIST`'s
`BOOKING_CONFIRMATION` membership is therefore **three** — `crm.appointment.create.v1`
(`kind: 'draft'`), `.reschedule.v1` and `.cancel.v1` (`kind: 'record'` + the §0.34 guard) —
and §0B.21's closing sentence, which equated the seven `ALLOW` booking capabilities with
§0B.33's count, is amended to say that **three of the seven are allowlisted and four are
gapped**. §0B.33's measurement table is a measurement of §0.33's void derivation and is
unchanged.

**S0C.6 — why this direction and not the other, with the security colour verified.** The
alternative repair — relaxing §0B.13(2) — was rejected on measured grounds:

| capability | `policyDecision` | `clientPrincipalTarget` | `allowedActorRoles` | `actorPolicy` |
|---|---|---|---|---|
| `crm.appointment.create.v1` | ALLOW | `'create_appointment'` | twelve (`TENANT_ACTION_ROLES`) | `OPTIONAL_TRUSTED_SERVICE` |
| `crm.appointment.reschedule.v1` | ALLOW | `'appointment'` | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| `crm.appointment.cancel.v1` | ALLOW | `'appointment'` | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| **`crm.appointment.attendance.v1`** | ALLOW | **none** | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| **`crm.appointment.duration.v1`** | ALLOW | **none** | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| `crm.appointment.services.v1` | ALLOW | `'appointment'` | twelve | `OPTIONAL_TRUSTED_SERVICE` |
| **`crm.appointment.fields.v1`** | ALLOW | **none** | twelve | `OPTIONAL_TRUSTED_SERVICE` |

Three of the four carry **no** `clientPrincipalTarget`, all seven receive the permissive
twelve-role `TENANT_ACTION_ROLES` default including `CLIENT` and `CUSTOMER` (§0B.19(1)),
and `resolveActorPermission` applies **no target-ownership test on the `actorUserId`
branch** (`action-engine.policy-resolver.ts:780–815`). Relaxing the pairing requirement
would therefore put a tenant-wide appointment mutation behind a client-role button.
Independently, Annex A §A1.6 P-21 rules that `attendance` is a staff-recorded fact and
never a client acknowledgement, so that row could not stand even if a pairing existed.
*Note on `actorPolicy: 'OPTIONAL_TRUSTED_SERVICE'`:* it admits an actorless call only for
`sourceType ∈ trustedServiceSourceTypes`, and §0B.17 fixes the widget source type to
`authenticated_request`, which `canonicalProductionPolicyDefinitions()` excludes from that
set. The widget path is unaffected by it; it is recorded so the table is not over-read.

**S0C.7 — the added assertion.** §0B.16's start-up set gains one line, the booking sibling
of the marketing cardinality rule:

```
row ⟹ BOOKING(cap) ⟹ cap.capability is the `ae` side of exactly one AE_PROPOSE_PAIRING row   else fail
```

*Mechanism:* the start-up loop. *Evaluation point:* `EP-REGISTRY-LOAD`. *Status:*
`NORMATIVE-PENDING` on **P-23**, **P-25**.

---

## 0-C.2 EC-2 — the C9 verification-floor branch stops calling a throwing accessor

**S0C.8 — the defect, verified at the artefact.** §0B.31 declares `subjectFloor`
"dispatched by space, and each branch **total** with a named fail-closed default", repairs
the AE branch completely, and re-enacts §0.13's body verbatim on the C9 branch:

```ts
const tier = aiToolRegistry.get(key)?.riskTier ?? 'restricted';   // valid: 47 of the 56 resolve
```

That comment is not a validity claim; it is a concession that nine do not. And the optional
chain is inoperative: `AiToolRegistryService.get()`
(`maya-saas-backend/src/ai-tools/ai-tool-registry.service.ts:58–73`) **never returns a
nullable** — it builds its map from `MAYA_AI_TOOL_CATALOG` alone (`:49–52`) and throws
`NotFoundException{ai_tool_not_found}` for any name outside it. So `?? 'restricted'` is
unreachable and, for the nine, `c9Floor` **raises** instead of returning a
`VerificationLevel`. `verificationFloor()` — FR-4's one mechanism under §0.55 and §0B.28 —
is partial over C9-CAP, and every `REFINE`/`DRAFT`/`HANDOFF`/class-`c` `NAVIGATE` naming one
of the nine raises at `EP-MINT` and again at Gate 5. This is exactly the defect EB-1
declares fatal, left standing one branch over.

The nine, enumerated in process (`C9_CAPABILITIES` minus the catalogue's 47 names), with the
two C9-CAP fields that will replace the borrowed TOOL-DEF term:

| C9-CAP key | `mode` | `resourceClass` |
|---|---|---|
| `c7.measurement.read` | `READ` | `SOURCE_READ` |
| `c8.result.read` | `READ` | `SOURCE_READ` |
| `b35.preview` | `PROPOSE_ONLY` | `SOURCE_HANDOFF` |
| `b35.status` | `READ` | `SOURCE_READ` |
| `b35.confirm` | `OWNER_HANDOFF` | `SOURCE_HANDOFF` |
| `a22.configuration` | `OWNER_HANDOFF` | `SOURCE_HANDOFF` |
| `owner_report.status` | `READ` | `SOURCE_READ` |
| `owner_report.download` | `READ` | `SOURCE_READ` |
| `c9.no_action` | `READ` | `LOCAL` |

**S0C.9 — the consequence that made this the first-ranked structural defect.**
`STRATEGY_OPTIONS`'s `no_action_option.select_intent` is MANDATORY, `priority: 0` and
"never dropped by degradation" (§2.6.11 STRATEGY.1), and its only owner-class key is
`c9.no_action` — one of the nine. Under the clause as written that intent's floor is a
throw, so it is withheld at §4.5.4 step 1 with no `reachable_via`, and §4.5.5 C4 converts
the emission into a `LIMITATION`/`HANDOFF`-only envelope: **`STRATEGY_OPTIONS` is
unemittable**, contradicting §0.40's seventeen and §A1.2.1's corrected sixteen. The same
term permanently withholds `CLIENT_LIST` (`b35.preview`/`b35.status`), `METRIC` and `CHART`
(`c7.measurement.read`, `c8.result.read`), `PROGRESS` and `ARTIFACT`
(`owner_report.status`/`.download`) and the `a22.configuration` handoff.

**S0C.10 — the ruling.** §0B.31's `c9Floor` is **VOID as written** and replaced. The C9
branch reads C9-CAP's own mandatory fields, exactly as `aeFloor` reads AE-CAP's, and the
TOOL-DEF risk term is retained **only where it applies** — as a pure data lookup against the
catalogue array, never through the throwing service:

```ts
// C9 branch — total over all 56 C9-CAP keys. Calls no throwing accessor.
function c9Floor(ref: CapabilityRef): VerificationLevel {
  const cap = c9Registry.tryGet(ref.key);                 // pure lookup over C9_CAPABILITIES
  if (cap === undefined)  return 'STEP_UP_VERIFIED';      // FAIL CLOSED — unregistered
  const row = WIDGET_CAPABILITY_POLICY[capKey(ref)];
  if (row === undefined)  return 'STEP_UP_VERIFIED';      // FAIL CLOSED — unclassified (S0.15)

  // TOOL-DEF's risk term applies to the 47 C9-CAP keys that are also catalogue names and to
  // no others. Where it does not apply it is REPLACED by terms that do (§0B.14's polarity
  // doctrine) — it is neither silently strictest nor silently weakest.
  const def  = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key);  // ReadonlyMap.get — never throws
  const risk = def === undefined ? 'ANONYMOUS' : RISK_FLOOR[def.riskTier];

  return maxLevel(
    row.min_verification,
    risk,
    C9_MODE_FLOOR(cap.mode),                              // total by type; default kept anyway
    C9_RESOURCE_FLOOR(cap.resourceClass),                 // total by type; default kept anyway
    CONSENT_CLASS_FLOOR[row.consent_class],
  );
}

function C9_MODE_FLOOR(mode: string): VerificationLevel {
  switch (mode) {
    case 'READ':          return 'ANONYMOUS';         // reads carry their floor in min_verification
    case 'PROPOSE_ONLY':  return 'SESSION_VERIFIED';  // a proposal is composed for a known session
    case 'OWNER_HANDOFF': return 'SESSION_VERIFIED';  // the owner surface adds its own step-up
    default:              return 'STEP_UP_VERIFIED';  // FAIL-CLOSED DEFAULT — a widened union
  }
}

function C9_RESOURCE_FLOOR(rc: string): VerificationLevel {
  switch (rc) {
    case 'LOCAL':          return 'ANONYMOUS';        // touches no source
    case 'SOURCE_READ':    return 'ANONYMOUS';        // §0C.11(4) — a read's protection is its
                                                      // own row plus Gate 6, never a blanket
    case 'SOURCE_HANDOFF': return 'SESSION_VERIFIED';
    default:               return 'STEP_UP_VERIFIED'; // FAIL-CLOSED DEFAULT — a widened union
  }
}
```

**S0C.11 — three properties of the replacement, each checkable.**

1. **Total, and total for a stated reason.** `mode` and `resourceClass` are closed unions in
   the type system (`c9.registry.ts:56,68`), so both tables are total *by type*. The
   `default:` branches are retained as fail-closed guards against a future widening —
   the mirror image of §0B.31's reasoning for `AE_AUTONOMY_FLOOR`, whose `default:` exists
   because `autonomyLevel` is typed `string` and therefore *cannot* be total by type.
   Observed distributions over the 56: `mode` READ 41 / PROPOSE_ONLY 13 / OWNER_HANDOFF 2;
   `resourceClass` SOURCE_READ 40 / SOURCE_HANDOFF 15 / LOCAL 1.
2. **No floor is lowered for the 47 — and the nine are a deliberate, named reduction.**
   The first draft of this paragraph asserted "no floor is lowered" and offered a build
   assertion quantified over `C9-CAP ∩ TOOL-DEF` — that is, over exactly the 47 keys where
   nothing changed. That proved the uninteresting half. Stated honestly and in two parts:

   - **For the 47 catalogue names**, the new formula **adds** two terms and removes none,
     and the risk term is the same value from the same data, so
     `c9Floor_new(key) ≥ c9Floor_0.13(key)` pointwise **by construction**. Verified aside:
     the catalogue's 47 `riskTier` values are read 35 / medium_write 7 / low_write 3 /
     high_write 2 — **zero `restricted`** — so the risk term never yielded
     `STEP_UP_VERIFIED` and was never the thing protecting them.
   - **For the nine**, §0.13's literal reading raised and its charitable reading gave
     `'restricted'` ⇒ `STEP_UP_VERIFIED`. The new branch gives them `SESSION_VERIFIED`
     (eight) and `ANONYMOUS` (one, `c9.no_action`). **That is a reduction, and it is the
     point of the erratum**: `STEP_UP_VERIFIED` is unreachable while P-12 is `[ABSENT]`
     (§0B.31), so the prior value was not a fence but a permanent withholding that made
     five widget kinds unemittable (§0C.9). A floor that cannot be met protects nothing; it
     only hides the capability.

   **The build assertion is therefore quantified over all 56, against a recorded vector:**

   ```
   declare const C9_FLOOR_BASELINE: Readonly<Record<string, VerificationLevel>>;  // 56 rows,
                                                                    // pinned in reviewed code
   ∀ key ∈ C9-CAP :  c9Floor({ space: 'C9', key }) ≥ C9_FLOOR_BASELINE[key]   // build assertion
   ```

   `C9_FLOOR_BASELINE` is the **post-EC-2** vector, pinned so that no later edit may lower
   any of the 56 without changing a reviewed constant. The nine reductions relative to
   §0.13 are enumerated in the table of §0C.8 and are **the only** floor reductions this
   erratum makes.
4. **`SOURCE_READ` contributes `ANONYMOUS`, and that is a correction of this erratum's own
   first draft, not a concession.** It first read `SESSION_VERIFIED`, which would have raised
   the floor of **40 of the 56** C9-CAP keys — every `SOURCE_READ` row. §0.13 settled that
   exact question in the opposite direction and gave the reason: `RISK_FLOOR['read'] =
   ANONYMOUS` because "a read capability's protection is `WIDGET_CAPABILITY_POLICY[key].min_verification`
   plus Gate 6, not its risk tier, and `CHANNEL_IDENTITY` would make every guest-chat and
   public-read envelope fail its own floor, contradicting §4.5.3's `ANONYMOUS_CHAT` /
   `PUBLIC_READ` tiers". A blanket `SESSION_VERIFIED` is **stricter than the value §0.13
   rejected**, so it would have broken those two channels harder, through a different term —
   a raise is as much a defect as a reduction when it is imposed by a term that has no
   business carrying it. With `ANONYMOUS`, a read's floor is again `max(row.min_verification,
   RISK_FLOOR[tier], CONSENT_CLASS_FLOOR[row.consent_class])` — §0.13's own design, reached
   through the dispatched branch. `WIDGET_CAPABILITY_POLICY` is total over all 56 with a
   fail-closed default, so each read still carries whatever level its own row sets.

   This also **strengthens** the monotonicity argument of (2) rather than weakening it: with
   both C9-native terms returning `ANONYMOUS` for reads, they are identity elements under
   `maxLevel`, so `c9Floor_new(key) ≥ c9Floor_0.13(key)` continues to hold pointwise over the
   47 by construction — no term was removed, and none of the added terms can pull a floor
   down. `C9_FLOOR_BASELINE` is pinned over the corrected vector.

5. **The nine now resolve to real levels** — and this claim is true only because §0C.10-bis
   reconciled `c9Floor`'s arity with its dispatcher and its policy-table lookup. Left as
   first drafted, the function would have returned its fail-closed `STEP_UP_VERIFIED` for all
   56 and this sentence would have been false. A second build assertion states the outcome
   directly, which the monotone guard of (2) cannot:
   `∀ key ∈ C9-CAP : c9Floor({space:'C9', key}) !== 'STEP_UP_VERIFIED' ∨ key ∈ DELIBERATELY_WITHHELD`,
   where `DELIBERATELY_WITHHELD` is the empty set in this contract version — so any key
   evaluating to the fail-closed level fails the build rather than silently withholding., and the five kinds §0C.9 named become emittable:
   `c9.no_action` → `ANONYMOUS` (READ + LOCAL: the mandatory "do nothing" option, which must
   be offerable on every tier including `ANONYMOUS_CHAT` — a contract that makes declining
   harder than proceeding is inverted); the three `SOURCE_HANDOFF` keys `b35.preview`,
   `b35.confirm` and `a22.configuration` → `SESSION_VERIFIED`; and the five `SOURCE_READ`
   keys — `c7.measurement.read`, `c8.result.read`, `b35.status`, `owner_report.status`,
   `owner_report.download` — take whatever their own `WIDGET_CAPABILITY_POLICY` row and
   consent class require, by (4). The owner-only fence on the
   bulk send is **not** weakened by this: it is `communication.bulk-campaign.admit.v2`'s own
   `approvalRequirement: 'REQUIRED'` + `approverPolicyKey: 'tenant-owner'` +
   `allowedActorRoles: [TENANT_OWNER, BUSINESS_OWNER]` at `EP-CANONICAL` (§0B.22, `[EXISTS]`),
   plus `AE_FAMILY_FLOOR['marketing_fanout'] = STEP_UP_VERIFIED` on the AE branch, which is
   unreachable while P-12 is `[ABSENT]`. The proposal becomes visible; the send does not.

*Mechanism:* the replacement function plus the build assertion of (2). *Evaluation points:*
`EP-MINT`, `EP-INGRESS` Gate 5. *Status:* `NORMATIVE-PENDING` on **P-11**, **P-24**.
**No C9 registry field is added, so `C9_REGISTRY_HASH` (`c9.registry.ts:177`) is untouched
and FR-16 holds.**

**S0C.10-bis — `c9Floor`'s arity is fixed once, and §0B.31's dispatch and signature are
amended to match.** Three sites disagreed: §0B.31 dispatched `c9Floor(ref.key)` and declared
`function c9Floor(key: string)`, while EC-2's replacement takes a `CapabilityRef` — it must,
because `WIDGET_CAPABILITY_POLICY` is keyed on a ref (§0B.32) and the policy row is one of its
five terms. A string argument cannot produce that row. **§0B.31's `case 'C9': return
c9Floor(ref.key)` is amended to `c9Floor(ref)`, and its `function c9Floor(key: string)`
signature is VOID and replaced by §0C.10's.** §0C.11(2)'s build assertion is restated over refs
for the same reason. Left unreconciled, `c9Floor` would have returned its fail-closed
`STEP_UP_VERIFIED` for **all 56** — the repair would have been inert, and §0C.11(5)'s claim
that the nine now resolve to real levels would have been false.

**S0C.11-ter — `AuthorityHint` is declared here, because §3.1 names it and no shape carries
it.** `WidgetIntent.authority_hint: AuthorityHint` is a **non-nullable member of every intent**,
and `intents.map(stripIntentToken)` feeds `body_hash` (§1.9 H1) — yet `AuthorityHint` has exactly
two occurrences in this contract, that declaration and a prose mention in §2.3.3 K7, and no
shape, table or enum defines it. §1.1.1 E2's closed-shape validator must refuse "any key not
declared in this contract, at any depth", so as specified the only admissible value is the empty
object: the field is useless rather than dangerous, but it is undefined at a `body_hash` input,
which §0C.11-bis's own rule forbids. It is declared with a closed member set carrying **no
authority vocabulary**:

```ts
interface AuthorityHint {           // RENDERING ONLY. Never read by any server decision (FR-3).
  emphasis: 'primary' | 'secondary' | 'muted';
  disabled_because: ReasonCode | null;   // MUST EQUAL intent.enabled.reason_code, and is null
                                         // exactly when intent.enabled.state === 'KNOWN'.
                                         // Both are inside body_hash, so without that equality
                                         // a disagreeing pair would be minted, sealed and
                                         // rendered with nothing to adjudicate between them.
                                         // Asserted in validateEnvelope at EP-MINT.
}
```

Both members are mint class **M**, so a composer cannot author them and an LLM cannot compose
them, and neither names a role, a capability, a tenant or a verification level — the four
vocabularies that would turn a rendering hint into a second answer to "who am I". §3.14 and FR-3
are unchanged: the field is read by no server decision, and the property test asserting a
byte-identical intent set across all four presentation modes covers it.

**S0C.11-bis — the two accessors this section names are declared here, and the two
that already exist may not be substituted for them.** A normative clause must not
name an identifier no shape declares, so both are declared, and the reason neither
existing accessor can do the work is stated rather than left to a reader:

- **`c9Capability(key, domain, registryHash)`** (`c9.registry.ts:178–192`) **throws**
  `c9Deny('capability_not_registered')`, additionally demands a `C9Domain` argument,
  and refuses on a registry-hash mismatch. It is a **run-admission** function, not a
  lookup. Using it in a floor derivation would reproduce EC-2's defect exactly — a
  floor that raises instead of returning a level — and would make the floor depend on
  *which domain is asking*, which §0.13's arity-2 rule forbids.
- **`AiToolRegistryService.get(name)`** throws for the same class of reason (§0C.8).

```ts
// DECLARED BY THIS CONTRACT. Pure, total, non-throwing, derived once at module load
// from frozen released arrays. Neither adds a field, a row, or a registry entry.
const C9_CAP_BY_KEY: ReadonlyMap<string, C9Capability> =
  new Map(C9_CAPABILITIES.map((c) => [c.capabilityKey, c]));
const MAYA_AI_TOOL_CATALOG_BY_NAME: ReadonlyMap<string, AiToolDefinition> =
  new Map(MAYA_AI_TOOL_CATALOG.map((d) => [d.name, d]));
const AE_CAP_BY_KEY: ReadonlyMap<string, RegisteredActionCapabilityV1> =
  new Map(new ActionCapabilityRegistry().list().map((c) => [c.capability, c]));

// A CapabilityRef is an OBJECT and cannot key a Record, exactly as InteractiveRef cannot
// (§0C.22-bis). §0B.32 says WIDGET_CAPABILITY_POLICY "is keyed on CapabilityRef"; the key
// form that makes that constructible is declared here and used at every site.
type CapabilityRefKey = `${CapabilityRef['space']}:${string}`;      // e.g. 'C9:b35.preview'
declare function capKey(ref: CapabilityRef): CapabilityRefKey;      // `${ref.space}:${ref.key}`
                    // total over the four spaces, and injective because `space` is one of four
                    // fixed tokens and ':' is the only separator, so no two refs collide.

c9Registry.tryGet            = (key: string) => C9_CAP_BY_KEY.get(key);
actionCapabilityRegistry.tryGet = (key: string) =>
  AE_CAP_BY_KEY.get(key);   // over new ActionCapabilityRegistry().list(); §0B.31 names it
```

`C9_CAPABILITIES` and `MAYA_AI_TOOL_CATALOG` are **read, never modified**, and
`C9_REGISTRY_HASH` is a hash of the array rather than of any map derived from it, so
FR-16 holds. This paragraph also declares §0B.31's `actionCapabilityRegistry.tryGet`,
which that section named without declaring. *Status:* `NORMATIVE-PENDING` on **P-24**.

---

## 0-C.3 EC-3 — an APPROVAL decision becomes mintable

**S0C.12 — the defect.** §0.34 generalises `confirmation_of_ref` expressly "so cancel,
reschedule **and approval** become mintable", assigning `kind: 'approval'` to an APPROVAL
decision. Its guard then reads: a `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is
mintable **only** when `produced_by_intent_token_hash` names a consumed **`REFINE`/`DRAFT`**
record whose capability is the canonical owner's own propose key. An approval object is
produced by a `REQUEST_APPROVAL` — §3.2's effect table gives it "approval object only",
§2.4 row 12 gives `APPROVAL` the permitted effects NONE/NAVIGATE/COMMIT/HANDOFF so it
carries no `REQUEST_APPROVAL` of its own, and §3.11.1 points the decide intent at "the
requesting `IntentRecord`". A `REQUEST_APPROVAL` record is neither a `REFINE` nor a `DRAFT`,
so the guard is **unsatisfiable and both decision intents are unmintable on every APPROVAL
body** — while §0.47 forbids the composer from nulling them for any reason but the three it
enumerates. §0B.13(3) repeats the REFINE/DRAFT-only condition, and §0B.13(2)'s `propose: null`
allowance makes it strictly worse: a null propose side can never equal the capability of a
consumed record, so (3) refuses unconditionally.

**S0C.13 — the ruling.** §0.34's guard and §0B.13(3) are amended in one place — the set of
**producing** record kinds is widened by exactly one member, for exactly the
`kind: 'approval'` case:

> A `COMMIT` whose `confirmation_of_ref.kind !== 'draft'` is mintable **only** when
> `produced_by_intent_token_hash` is non-null and names a **consumed record**, as follows —
> the producing effect class and the identity compared are fixed **together**, because the
> two cases live in different key spaces:
>
> | `confirmation_of_ref.kind` | producing record's effect | identity that must hold |
> |---|---|---|
> | `'record'` (reschedule, cancel) | `REFINE` or `DRAFT` | the record's **C9** capability equals the `propose` side of the `COMMIT`'s `AE_PROPOSE_PAIRING` row |
> | `'approval'` (an APPROVAL decision) | `REQUEST_APPROVAL` | the record's **AE** capability equals the `ae` side of that same row — i.e. it equals the `COMMIT`'s own AE key |

**S0C.13-bis — why the identity differs by case, and why the first draft of this erratum was
wrong.** §0.32 and §0B.7 fix the per-effect key space: only `REFINE`, `DRAFT`, `HANDOFF` and
a class-`c` `NAVIGATE` may carry a **C9** ref; **only `COMMIT` and `REQUEST_APPROVAL` may
carry an `AE` ref**, "and they may carry nothing else". A consumed `REQUEST_APPROVAL`
record therefore carries an **AE** capability, while `AE_PROPOSE_PAIRING`'s `propose` side is
a **C9** ref by §0B.13(1). The two spaces are disjoint — verified: zero shared spellings —
so "equal to the propose key" is a comparison that **can never hold** for the approval case.
Requiring it would refuse every APPROVAL decision unconditionally, which is the defect this
erratum exists to close, reproduced one step further in.

The repair is therefore not to widen the producing-effect set alone but to fix **which
identity is compared in each case**. For the approval case the comparison is
`consumedRecord.capability === commit.capability` — an identity **within AE-CAP**, between
the record that requested the approval and the `COMMIT` that decides it. That is strictly the
same fence: the `COMMIT` still cannot be minted except against a gateway-consumed record whose
capability is the very capability being actuated, and a bare `approval_ref` still does not
satisfy it.

§0B.13(2)'s `propose: null` allowance is **VOID**: the approval-decision case now has a
producing record and an identity to check — the `ae` side, which every allowlisted row has by
construction — so no null side is needed, and every allowlisted key is once again required to
be the `ae` side of exactly one pairing row. §0B.13(3) is amended to the two-row table above
rather than to the REFINE/DRAFT-only condition it states today.

**S0C.14 — what this does not weaken, stated precisely.** The fence §0.34 exists to hold is
that **a `COMMIT` may not be minted from a bare reference the caller supplies** — it must
name a record the gateway itself consumed, whose capability is the canonical owner's own
propose key, whose confirmation body was returned by that owner in response to a gateway
submission. All four conditions survive verbatim; only the producing effect class is
widened, and only for the one `confirmation_of_ref.kind` that cannot be produced by a
`REFINE` or a `DRAFT` in the first place. A `REQUEST_APPROVAL` record is a gateway-consumed
record with a capability, so the comparison is the same comparison. Populating
`confirmation_of_ref` with a bare `approval_ref` still does not satisfy it. The separate
approver fence is unchanged and is not this one: `ActionEngineKernel.decideApproval()`
requires state `PENDING_APPROVAL` and an approver in
`CANONICAL_APPROVER_POLICY_ROLES.get(approverPolicyKey)` (§0B.26), and §0.48's
`GAP-SEPARATION-OF-DUTIES` remains the disposition wherever an initiator must not decide —
§0.49's repository observation about `canDecide` is unaffected and still stands as a finding.

**S0C.15 — the worked instance that was circular, now closed.** §0B.22's sole allowlisted
`MARKETING_FANOUT` row is `communication.bulk-campaign.admit.v2` with
`confirmation_kind: 'APPROVAL'`; §0B.11 pairs it to propose key `b35.confirm`; and
`b35.confirm` was one of the nine keys whose floor was itself unresolvable. EC-2 resolves
the floor and EC-3 makes the decision intents mintable, so the path is no longer circular.
It remains **withheld in fact** while P-12 is `[ABSENT]`, by `AE_FAMILY_FLOOR`.

*Mechanism:* the mint function's refusal; Gate 7 re-checks. *Evaluation points:* `EP-MINT`,
`EP-INGRESS` Gate 7. *Status:* `NORMATIVE-PENDING` on **P-25**.

---

## 0-C.4 EC-4 — the degradation ladder stops withholding the intents four clauses pin

**S0C.16 — the defect.** §4.5.4 step 1 withholds every intent whose required verification
exceeds the session's derived level, before step 4's PIN can protect `priority: 0`. Four
normative clauses assert the opposite for exactly those intents:

- **§2.6.15 SOURCE.3** — `reconnect_intent` is "a `HANDOFF` whose target class is `s` …
  below that floor it is the only interactive element retained". `targetFloor('s') =
  SESSION_VERIFIED`, so step 1 withholds the one intent SOURCE.3 says is retained.
- **§2.6.16 SETTINGS.4 and §2.6.17 FORM.4/FORM.6** — `editor_handoff_intent` and
  `discard_intent` "survive EVERY step of the degradation ladder". The editor handoff is
  class `s`, so on a channel capped below `SESSION_VERIFIED` (§1.7 K7 caps a polling
  Telegram bot at `CHANNEL_IDENTITY`) a `SETTINGS_DRAFT` or `FORM` cannot be delivered there
  at all.
- **§0.25 / §3.12.6** — the escape verb is "never dropped by degradation", while
  `KIND_FLOOR` is `SESSION_VERIFIED` for `CONSENT_STATE`, `IDENTITY_BINDING`,
  `PAYMENT_HANDOFF`, `APPROVAL` and `CLIENT_LIST`; so on those five kinds the mandatory
  escape is withheld at step 1 below `SESSION_VERIFIED`, and §4.8 A-5 ("always
  keyboard-reachable") and §4.7 V9 ("always live") cannot hold.
- **§2.6.11 STRATEGY.1** — the no-action option, as in EC-2.

None has a `reachable_via` by construction, so §4.5.5 C4 fires and the emission fails. The
"withhold" versus "drop" vocabulary does not reconcile them: SOURCE.3 says *retained*, and
SETTINGS.4 says *every step*.

**S0C.17 — the ruling, at the floor rather than in the ladder.** Reordering the
ladder was rejected: §4.5.4's step-4 pinned set explicitly includes "the sole
`COMMIT`", and moving that step above the floor would protect a `COMMIT` from its own
verification floor — an authority breach. The repair is instead a **derived,
build-vetoed, non-actuating** exemption at the floor itself, keyed on members
`WidgetIntent` already declares:

```ts
// DECLARED BY THIS CONTRACT (§0C.11-bis's rule). `MintedIntent` is the intent shape the floor
// derivation reads — §3.1's `WidgetIntent` with `capability` and `handoff_capability_ref`
// retyped to `CapabilityRef | null` per §0B.7. §0.13 and §0B.30 name it without declaring it;
// this declaration resolves all four sites at once.
type MintedIntent = Omit<WidgetIntent, 'capability' | 'handoff_capability_ref'> & {
  capability: CapabilityRef | null;
  handoff_capability_ref: CapabilityRef | null;
};

// FLOOR-EXEMPT. Membership is DERIVED from declared members, never a list of names.
// `priority` and `effect` are declared members of WidgetIntent (§3.1); `priority: 0`
// is already the contract's own marker for "never dropped by degradation" (§4.5.4
// step 4, §0.25, §2.6.11 STRATEGY.1, §2.6.16 SETTINGS.4, §4.1.3 L11).
// R7/R11: both predicates are declared over a STRUCTURAL subject, not over MintedIntent.
// Gate 5 recomputes them from an IntentRecord (§0.16), and MintedIntent is WidgetIntent-shaped
// — it retains intent_ref, intent_token, role, label, utterance_preview, speech_aliases,
// ordinal, input_schema, authority_hint and enabled, ten members IntentRecord does not declare.
// Every member these two actually read is on both shapes, so this needs no widening of either.
type FloorSubject = IntentSubject & { effect: EffectClass; priority: number };

function FLOOR_EXEMPT(i: FloorSubject): boolean {
  return i.priority === 0
      && (i.effect === 'NONE' || i.effect === 'REFINE'
          || i.effect === 'CONTROL' || i.effect === 'HANDOFF')
      && (i.capability === null
          || i.capability.space === 'CONTROL'                      // §0.22, closed at three
          || (i.capability.space === 'C9'                          // the LOCAL row, below
              && c9Registry.tryGet(i.capability.key)?.resourceClass === 'LOCAL'))
      && (i.effect !== 'HANDOFF'
          || (i.target?.class === 's'                              // a surface, not an act
              && !SENSITIVE_DEST(i.handoff_capability_ref)));      // §0C.17-quater
}

// CONSENT and IDENTITY (§0B.20, §0B.25) are predicates over a REGISTERED AE capability —
// they read cap.targetKind and cap.actionClass. `handoff_capability_ref` is a CapabilityRef,
// so they cannot be applied to it directly. This is the ref-taking form, total and fail-closed.
function SENSITIVE_DEST(r: CapabilityRef | null): boolean {
  if (r === null)          return false;      // no destination named: nothing to classify
  switch (r.space) {
    case 'AE': {
      const cap = AE_CAP_BY_KEY.get(r.key);
      if (cap === undefined) return true;     // FAIL CLOSED — unregistered destination
      return CONSENT(cap) || IDENTITY(cap);
    }
    case 'C9': {
      const row = WIDGET_CAPABILITY_POLICY[capKey(r)];
      if (row === undefined) return true;     // FAIL CLOSED — unclassified
      return row.consent_class === 'personal_data'
          || row.consent_class === 'identity_binding';
    }
    case 'CONTROL': return false;             // closed at three, none of them sensitive
    case 'TOOL':    return true;              // FAIL CLOSED — no intent may carry a TOOL ref
  }
}

function verificationFloor(i: FloorSubject, kind: WidgetKind): VerificationLevel {
  if (FLOOR_EXEMPT(i)) {
    // Waive EFFECT_FLOOR, KIND_FLOOR and targetFloor — and, for a HANDOFF ONLY, the
    // destination subject term, which is the circularity SOURCE.3 objects to. NEVER waive a
    // subject's OWN floor: control.run.cancel is CONTROL_FLOOR BOUND_CLIENT and stays there.
    return i.effect === 'HANDOFF'
      ? 'ANONYMOUS'                             // the destination authenticates at its ingress
      : subjectFloor(subjectCapability(i));     // CONTROL and the C9 LOCAL row keep their own
  }
  return maxLevel(
    EFFECT_FLOOR[i.effect], KIND_FLOOR[kind],
    subjectFloor(subjectCapability(i)), targetFloor(i.target),
  );
}
```

**S0C.17-quinquies — §0.13's closed input list is amended, because EC-4 added a fifth input.**
§0.13's header reads "INPUTS: exactly `i.effect`, `i.capability`, `i.handoff_capability_ref`,
`i.target`, and `kind`. No other value is read." `FLOOR_EXEMPT` reads **`i.priority`**, which is
why EC-19 had to add that member to `IntentRecord`. The comment is amended to name it as the
fifth input. A closed enumeration that omits a live input is the same defect EC-17 ruled on for
K22: a second, wrong answer standing beside the mechanism.

**§0.13's two signatures are superseded with it.** Its block still declares
`verificationFloor(i: MintedIntent, kind)`; §0C.17's `FloorSubject` form governs by precedence,
and this is said here rather than left to inference, because the whole point of the retyping is
that **Gate 5 passes an `IntentRecord`** and the spine's spelling is what made that
unconstructible.

**S0C.17-ter — why the exemption keeps the subject term, and what that closes.** The first
draft returned a flat `ANONYMOUS`, which zeroed **every** term including the subject's own.
Two consequences, both filed against it and both real:

- **`control.run.cancel` carries `CONTROL_FLOOR: BOUND_CLIENT`** (§0.22), and §0.24 fixes
  `PROGRESS.cancel_intent` as `effect: 'CONTROL'`, `capability: 'control.run.cancel'`. A
  composer that set that intent to `priority: 0` would have dropped a `BOUND_CLIENT` control
  to `ANONYMOUS`. The contract must not rest on "no clause mints it at priority 0 today" —
  that is an accident of the current text, not a mechanism. Keeping `subjectFloor` for every
  non-`HANDOFF` exempt intent removes the question entirely.
- **A class-`s` handoff to a consent or identity act** would have had its floor zeroed too.
  It is now excluded by `SENSITIVE_DEST`, so no consent or identity handoff is ever exempt,
  whatever its priority.

**S0C.17-quater — why the exclusion needed its own predicate.** The first draft of this repair
wrote `!CONSENT(i.handoff_capability_ref)`. That is **inoperative**: `CONSENT` and `IDENTITY`
are predicates over a *registered AE capability object*, reading `cap.targetKind` and
`cap.actionClass` (§0B.20, §0B.25), while `handoff_capability_ref` holds a `CapabilityRef` —
`{space, key}`. Passing one to the other classifies nothing, so the exclusion would have been
silently vacuous and every consent handoff would have been exempt after all. `SENSITIVE_DEST`
is the ref-taking form: it **resolves** an AE ref through `AE_CAP_BY_KEY` before testing,
classifies a C9 ref by the widget layer's own `consent_class` column, and **fails closed** on
an unregistered key, an unclassified row, or a `TOOL` ref. It is total over all four spaces by
type.

The five clause-mandated intents are unaffected: the escape verb floors at
`subjectFloor(null) = ANONYMOUS` or `CONTROL_FLOOR['control.widget.dismiss'] = ANONYMOUS`;
`discard_intent` is an escape intent and floors identically; `no_action_option.select_intent`
floors at `c9.no_action`'s own row; and `reconnect_intent` / `editor_handoff_intent` are
`HANDOFF`s to integration-status and settings surfaces — neither `CONSENT` nor `IDENTITY` —
so they still floor at `ANONYMOUS` and SOURCE.3's circularity stays fixed.

**BUILD VETO.** `FLOOR_EXEMPT(i) ⟹ i.effect ∉ {'NAVIGATE', 'DRAFT', 'REQUEST_APPROVAL',
'COMMIT'}`. This already follows from the second clause; it is asserted separately so
that a later widening of the effect list cannot silently admit an actuating intent.
A second assertion states that the C9 escape hatch is **unique**:
`|{c ∈ C9_CAPABILITIES : c.resourceClass === 'LOCAL'}| === 1`.

§4.5.4 step 1 gains one sentence: **"A `FLOOR_EXEMPT` intent is never withheld at this
step."** Steps 2, 3, 5 and 6 are unchanged and still apply to it — an exempt intent
touching a `SECURE_SURFACE_ONLY` field is still withheld at step 2, and an effect
exceeding the tier ceiling is still withheld at step 3. Step 4's PIN is unchanged.
§4.5.5 C4 stops firing because nothing in the set is withheld.

**S0C.17-bis — one amendment is required to make the set derivable.** §2.6.15 SOURCE.3
declares `reconnect_intent` a `HANDOFF` with target class `s` and says that "below that
floor it is the only interactive element retained", but it never assigns it a
`priority`. Every sibling the four clauses name carries `priority: 0` explicitly —
`discard_intent` is declared "escape, priority 0" (§2.6.17, §2.6.16),
`editor_handoff_intent` carries `priority: 0` (SETTINGS.4), `no_action_option`'s
selection is evaluated "at ladder step 2 (`priority: 0`)" (STRATEGY.1), and the escape
verb is `priority: 0` (§0.25). **SOURCE.3 is amended to give `reconnect_intent`
`priority: 0`**, so its undroppability is expressed the same way as every sibling's
rather than in prose only.

**S0C.18 — why this confers nothing, argued over the derived set.** Five intents satisfy
`FLOOR_EXEMPT` **in this contract version**, and each is admitted by a clause of the predicate,
not by being named. "Five" is a census, not a bound: the set is derived from `priority === 0`
plus three clauses, and a sixth member is constructible — §0.20/§0.21 grant `CONTROL` to every
kind, so a `priority: 0` `CONTROL` intent minted onto one of the five `SESSION_VERIFIED` kinds
would join the set. **What bounds it is three separate grounds, and only one of them is the veto** — the earlier
sentence said "a build veto, not the census", which promised a bound the veto does not deliver:
it constrains the `CONTROL` branch alone, while `NONE` and `HANDOFF` are unbounded in
*cardinality* and bounded only in *authority* by the non-actuation argument, and `REFINE` is
bounded by an enumeration property rather than by a veto. Said separately:

- **`CONTROL`** — bounded by the build veto below.
- **`REFINE`** — bounded by the assertion `|{c ∈ C9_CAPABILITIES : c.resourceClass === 'LOCAL'}| === 1`,
  verified by enumeration against the live registry; the single row is `c9.no_action`.
- **`NONE` and `HANDOFF`** — **unbounded in number**, and that is acceptable because neither
  can actuate: a `NONE` carries `intent_token: null`, and a `HANDOFF` never invokes its
  destination (R3.5.3) and is additionally excluded by `SENSITIVE_DEST` where the destination
  is a consent or identity act.

**The veto, for the `CONTROL` branch:**

```
priority === 0 ∧ effect === 'CONTROL' ⟹ capability.key === 'control.widget.dismiss'
       // the only CONTROL key whose own CONTROL_FLOOR is ANONYMOUS (§0.22). A priority-0
       // control.run.cancel (BOUND_CLIENT) or control.delivery.resolve (BOUND_CLIENT) fails
       // the BUILD rather than silently joining the exempt set — and §0C.17-ter's retained
       // subjectFloor would have held their own floors anyway, so this is defence in depth.
```

The five, each admitted by a clause:

| Intent | Clause that admits it | Why it exercises no authority |
|---|---|---|
| the escape verb (§0.25) | `effect: 'NONE'` with `capability: null`, or `effect: 'CONTROL'` with `control.widget.dismiss` | "Never cancels an appointment, appears in no routing map that reaches a canonical owner." On a `confirmation_subject: 'cancel'` body, cancelling **is** the `COMMIT` — a different intent, which the veto excludes by effect |
| `discard_intent` (FORM.4/FORM.6, SETTINGS) | it **is** an escape intent — declared "escape, priority 0" | Destroys a widget-layer draft; reaches no canonical owner |
| `no_action_option.select_intent` (STRATEGY.1) | `effect: 'REFINE'`, `capability: c9.no_action`, whose `resourceClass` is `LOCAL` | The unique row of `C9_CAPABILITIES` that touches **no source** — verified by enumeration, `LOCAL` count = 1. The exception is a structural property, not a name on a list |
| `reconnect_intent` (SOURCE.3) | `effect: 'HANDOFF'`, `target.class === 's'` | A `HANDOFF` does not exercise its destination; it routes to a surface that demands its own verification at its own ingress |
| `editor_handoff_intent` (SETTINGS.4) | as above | as above |

**The L11 extension remedy is deliberately NOT in this set**, and the reason matters:
it is a `REFINE` on the widget's **own owner capability**, so a principal below that
capability's floor could not have received the widget in the first place. It needs no
floor exemption, and it keeps the protection it already had — §4.5.4's step-4 capacity
PIN, unchanged. A reader who expects six and counts five should find the answer here
rather than infer an omission.

**The general principle, stated once so it can be cited.** A floor governs **exercising
authority**. Declining to proceed, discarding local state, and asking for the route to a
surface that authenticates are none of those. Making cancellation harder to reach than
confirmation is a safety inversion, not a safety property.

**Why `priority === 0` is a safe key and not a loophole.** `priority` is server-set at
mint like every other member of `WidgetIntent` — §3.1 fixes `label` as "server-minted;
never client-composed" and the whole shape is composed server-side — so an author
cannot promote an intent into the set. And promotion alone would not help: the three
remaining clauses of the predicate exclude every actuating effect, every non-`CONTROL`
non-`LOCAL` capability, and every handoff that does not target a surface.

*Mechanism:* the `FLOOR_EXEMPT` build veto, the uniqueness assertion, and the amended
`verificationFloor`. *Evaluation points:* `EP-BUILD` (the vetoes), `EP-FIT` (step 1),
`EP-MINT`. *Status:* `NORMATIVE-PENDING` on **P-11**, **P-19**.

---

## 0-C.5 EC-5 — the mechanism-gap binding becomes constructible

**S0C.19 — the defect.** §A2.4 is normative: at `EP-REGISTRY-LOAD` "every `[ABSENT]`
mechanism named in §A1 is bound to its gap key; a §A1 row with no gap key fails the start-up
assertion and the process does not start", and §A2.5 offers that binding as the proof a
`NORMATIVE-PENDING` claim is checkable. But **§A1 has no gap-key column and names a gap key
for no row.** The ledger it points at (§0.37, §0.38, §0.39) holds sixteen keys, every one an
**ACT with no canonical owner**; none corresponds to P-01 (a gateway), P-02…P-08 (stores),
P-10/P-11 (tables and a derivation), P-13…P-18 (a facade, routes, handlers, a field) or
P-19/P-20 (infrastructure). §0B.41 then adds six more `[ABSENT]` rows (P-23…P-28), none with
a gap key. Under the literal reading the assertion fails for twenty-four of twenty-eight
rows and the process never starts. The AE-CAP gap keys 0-B introduces
(`GAP-TENANT-BILLING`, `GAP-EXPENSE-DELETE`, `GAP-TENANT-ADMIN`, and the rest) do not close
it either: they are keyed on `RegisteredActionCapabilityV1.capability`, and §A2.3's four
cited enforcing rules all key on a **capability or a Cell having no OWNER** — which an
absent gateway, store, table or type is not.

**S0C.20 — the ruling: two ledgers, because there are two kinds of gap.** The conflation is
the defect. A **capability gap** is "this act has no canonical owner" and belongs to
`AE_CAPABILITY_GAP_LEDGER`, keyed on an AE-CAP capability, enforced by §2 K20, §1.6.7 P2,
§1.3 C5 and §2.6.14 LIMIT.1. A **mechanism gap** is "this component is not built yet" and
gets its own table:

```ts
interface MechanismGap {
  gap_key: `MG-${string}`;      // one per prerequisite row: MG-P01 … MG-P32
  p_ref: string;                // 'P-01' … 'P-32' — §A1's 22, §0B.41's 6, §0C.29's 4
  component: string;            // the §A1 row's component text
  status: '[ABSENT]' | '[EXISTS]' | '[PARTIAL]' | '[UNENFORCEABLE-TODAY]';   // §A1's four
  package: string;              // the K-package that builds it
  blocking_rules: string[];     // every clause NORMATIVE-PENDING on this row
}
declare const MECHANISM_GAP_LEDGER: Readonly<Record<string, MechanismGap>>;
```

§A1 gains a `gap_key` column carrying `MG-P01` … `MG-P22`, one per row; §0B.41's six rows
carry `MG-P23` … `MG-P28` and §0C.29's four carry `MG-P29` … `MG-P32`, so the ledger is
total over all **thirty-two** prerequisite rows. §A2.4's
assertion is **restated over `MECHANISM_GAP_LEDGER`**:

> At `EP-REGISTRY-LOAD`, over the set of prerequisite rows:
> 1. every row whose `status` is not `[EXISTS]` resolves in `MECHANISM_GAP_LEDGER` under its
>    own `gap_key`;
> 2. every `NORMATIVE-PENDING` clause appears in **at least one** row's `blocking_rules`,
>    and in **every** row whose `p_ref` that clause's status names;
> 3. the binding is the **pair** `(clause, p_ref)`, and the set of such pairs is exactly the
>    set derivable from the clauses' own status lines.
>
> A row with no key, a clause bound to no row, or a clause whose status names a `p_ref` whose
> row does not list it, fails the assertion and the process does not start.

**The first draft of this assertion could never pass, and the reason is worth keeping.** It
demanded that each clause appear in *exactly one* row's `blocking_rules`, while at least six
clauses of this contract are `NORMATIVE-PENDING` on two or three prerequisites each — §0C.10
alone names P-11 and P-24 — and `blocking_rules` is defined as "every clause
`NORMATIVE-PENDING` on this row". Uniqueness and that definition are incompatible, so the
process would never have started: fail-closed to the point of inertness, which is a defect
and not a safety property. The assertion above is stated as **coverage plus agreement**
instead, which is what §A2.5's checkability argument actually needs.

The two ledgers are disjoint by key shape (`MG-` versus `GAP-`) and a build assertion states
it. §A2.5's checkability argument now rests on a table that exists rather than on a binding
that was asserted. The fail-closed **outcome** for every row was always correct and is
unchanged; what changes is that the status is now mechanically checkable, which is what
§A2.4 claimed.

*Mechanism:* the restated start-up assertion over `MECHANISM_GAP_LEDGER`. *Evaluation
point:* `EP-REGISTRY-LOAD`. *Status:* `NORMATIVE-PENDING` on **P-29** (§0C.29).

---

## 0-C.6 EC-6 — one accessible name, one owner per kind

**S0C.21 — the defect.** §4.8 A-2 reads "Accessible name = `intent.utterance`, verbatim.
The visible `intent.label` must be contained in it." **`WidgetIntent` declares no member
`utterance`** — its minted string fields are `label`, `utterance_preview` and
`speech_aliases` (§3.1) — so the named CI string check cannot be written, and the two
candidate referents are not equivalent: §3.1 states `utterance_preview` "is a PREVIEW: the
sentence actually written to the conversation is re-rendered at Gate 9", so binding an
accessible name "verbatim" to it would bind it to a string the contract says is not the
sentence. §A2.8's `NORMATIVE-PENDING` marking repairs only the status half — a
`NORMATIVE-PENDING` rule is expressly "binding on the implementation", so it still names a
field the implementation cannot have. 0-B then added a **second** normative answer for the
same control: §0B.36's `ARTIFACT` row fixes the accessible name of `fetch_intent` as
`filename` + `format` + `size_bytes`, and §0B.35 elevated §4.8.2 into the per-kind normative
artefact — while the pre-existing §4.8.2 `APPROVAL` row (`audience_size`, `risk_tier` and
reversibility) conflicts with A-2 identically.

**S0C.22 — the ruling.** A-2 is replaced:

> **A-2 (amended).** A control's accessible name is composed as
> `nameSourceOf(ref, env).label` + (`suffix.pointers.length ? ', ' + renderSuffix(suffix, resolveInteractive(env, ref), env.body) : ''`),
> where `suffix` is the entry §4.8.2's row gives for this ref's lookup key — every argument
> bound, none free — so the name is
> `nameSourceOf(ref, env).label` **verbatim** wherever the pointer list is empty. Where
> for an intent control that label **is** `intent.label` (§0C.22-ter). In every case the
> accessible name contains the denoted element's own label as a prefix, by construction. **`intent.utterance`
> does not exist and every reference to it is void**; `intent.utterance_preview` is
> expressly **not** the accessible name.
> *Mechanism:* a CI check over each emitted `A11yBlock` asserting, for every
> `ref ∈ a11y.reading_order`, that
> `a11y.accessible_names[refKey(ref)].startsWith(nameSourceOf(ref, env).label)`, and, for every kind
> §4.8.2 names, equality with the row's composition applied to the emitted body.
> *Evaluation point:* `EP-BUILD`. *Status:* `NORMATIVE-PENDING` on **P-19**, **P-31**.

**S0C.22-bis — the carrier the check reads is declared here, because it did not exist.**
`A11yBlock` (§4.8) declares `role_hint`, `label`, `description`, `reading_order` and
`live_region` — **no accessible name of any kind** — and it is **one block per envelope**,
so even a single `accessible_name` member could not carry a per-control value. A CI check
over an identifier no shape declares is the very defect EC-6 exists to close, reproduced in
its own repair. `A11yBlock` therefore gains one member:

```ts
// `InteractiveRef` is an object type and cannot key a Record, so the key form is declared.
type InteractiveRefKey = `${InteractiveRef['k']}:${string}`;      // e.g. 'field:phone'
// §4.8's InteractiveRef gains a SEVENTH member: TIME_SLOT_SELECTOR's declared interactive path
// is `groups[].slots[].slot_ref` (§2.6.4), which no existing member could denote — so K22's
// set-equality rule was unsatisfiable for that kind.
//   | { k: 'slot'; id: string }        // TimeSlotSelectorBody slot_ref
declare function refKey(ref: InteractiveRef): InteractiveRefKey;  // `${ref.k}:${ref.id}` —
                                  // total over the closed SEVEN-member union, and
                                  // injective because `k` is one of seven fixed tokens and
                                  // ':' is the only separator, so no two refs collide.

interface A11yBlock {
  /* …role_hint, label, description, reading_order, live_region — unchanged… */
  accessible_names: Record<InteractiveRefKey, string>;   // NEW. One entry per reading_order
                                                         // member; no other key admitted.
}
```

It is **mint class M** — composed by the same pure server function that mints
`text_equivalent`, from validated canonical labels — and it is covered by `body_hash` through
§1.9 H1's `presentation` term, so a composer cannot substitute it and an LLM cannot compose
it. Two validator rules make it total and closed: `keys(accessible_names) === set(reading_order.map(refKey))`
at `EP-MINT`, and an envelope whose `reading_order` names a ref with no entry is refused.

**S0C.22-ter — not every interactive element is an intent, so the name source is a function
of the ref kind.** The first draft of A-2's mechanism said
`accessible_names[ref].startsWith(intentOf(ref).label)` for **every** `ref ∈ reading_order`.
That is unsatisfiable, and the type says so: `InteractiveRef` (§4.8) is a closed **six**-member
union — `option`, `field`, `intent`, `row`, `entry`, `section` — and **only `{k: 'intent'}`
denotes a `WidgetIntent`.** A `{k: 'field'}` ref is a `FormField.field_key`; §2.6.17 gives
FORM the interactive paths `fields[].field_key`, `submit_intent`, `discard_intent`,
`editor_handoff_intent`, and §2 K22 requires `reading_order` to contain exactly the refs
`interactive_paths` produces — so every FORM envelope carries field refs that have a
`label: LocaleText` of their own and **no `intent.label` at all**. Requiring one would refuse
every FORM envelope. `intentOf` was also declared nowhere: it occurred exactly once in the
contract, inside the mechanism that used it.

The name source is therefore declared, total over the union, and non-throwing:

```ts
// DECLARED BY THIS CONTRACT. Total over InteractiveRef. Never throws, never returns undefined,
// and introduces NO new resolver: `resolveInteractive` is K22's OWN ref↔element mapping read
// in the forward direction. validateEnvelope already recomputes the ref set from
// KIND_REGISTRY[kind].interactive_paths applied to this body and refuses on any difference,
// so the element each ref denotes is a value that computation already holds.
// The SEVEN body shapes a ref can denote, each named as the contract actually names it.
// A 'row' ref resolves to its row AND its owning table, because one envelope may hold many
// tables — REPORT declares `sections[].table: TableSpec | null` — so a row key alone does not
// determine which table's is_row_header column to read.
type InteractiveElement =
  | WidgetIntent                                       // §3.1
  | FormField                                          // §2.6.17
  | OptionItem                                         // §2 — label: Cell<string>
  | StrategyOptionsBody['alternatives'][number]        // §2.6.11 — title: Cell<string>, NO label
  | TimeSlotSelectorBody['groups'][number]['slots'][number]   // §2.6.4 — start: Measure
  | ReportBody['sections'][number]                     // §2.6.10 — { section_id; heading; … }
  | ScheduleBody['entries'][number]                    // §2.6.6  — { entry_ref; title; … }
  | { table: TableSpec; row: TableSpec['rows'][number] };
// R6: INDEXED by ref kind. A flat return of the whole union would have nameSourceOf's seven
// branches reading members the declared type does not carry (el.start, el.heading, el.row),
// so the declaration read as total without type-checking. The option alternative names the
// two intersections SERVICE_SELECTOR and STAFF_SELECTOR actually carry, which are the fields
// their accessible_name_suffix pointers resolve against.
type ElementFor<K extends InteractiveRef['k']> =
    K extends 'intent'  ? WidgetIntent
  : K extends 'field'   ? FormField
  : K extends 'option'  ? OptionItem
                          | (OptionItem & { duration: Measure; price: Measure | null })
                          | (OptionItem & { nearest_availability: Cell<string> })
                          | StrategyOptionsBody['alternatives'][number]
                          // ^ REQUIRED: §2.6.11's declared path `alternatives[].option_id`
                          // makes {k:'option'} denote this shape, which is NOT an OptionItem
                          // (it carries `title`, no `label`). Omitting it made
                          // resolveInteractive partial over the seven members and
                          // §0C.22-septies's "an alternative's accessible name is its title
                          // verbatim" unsatisfiable. Note also that `A | (A & B)` narrows to
                          // `A` for member access, so the two intersections are reachable
                          // only through the discriminated `base: 'element'` lookup, never by
                          // reading `duration`/`price` off a bare OptionItem.
  : K extends 'section' ? ReportBody['sections'][number]
  : K extends 'entry'   ? ScheduleBody['entries'][number]
  : K extends 'slot'    ? TimeSlotSelectorBody['groups'][number]['slots'][number]
  : K extends 'row'     ? { table: TableSpec; row: TableSpec['rows'][number] }
  : never;
declare function resolveInteractive<K extends InteractiveRef['k']>(
  env: WidgetEnvelope, ref: Extract<InteractiveRef, { k: K }>): ElementFor<K>;
declare function rowHeaderKey(t: TableSpec): string;   // the one column of THAT table whose
                                                       // is_row_header is true (§2: "exactly
                                                       // one column MUST be true") — total
type SuffixSpec = { base: 'element' | 'body'; pointers: readonly string[] };
declare function renderSuffix<K extends InteractiveRef['k']>(
  d: SuffixSpec, el: ElementFor<K>, body: WidgetBody): string;
       // Each pointer resolves — against `el` when base is 'element', against `body` when it
       // is 'body' — to a Cell, Measure or Phrase, and contributes its MINTED label:
       // Cell.label, Measure.formatted, Phrase.rendered. Joined with ', '. An empty pointer
       // list yields ''. Mint class M, like accessible_names itself.

type NameSource = { label: string; from: InteractiveRef['k'] };

function nameSourceOf(ref: InteractiveRef, env: WidgetEnvelope): NameSource {
  const el = resolveInteractive(env, ref);        // total by K22's set-equality rule
  switch (ref.k) {
    case 'intent':  return { label: el.label,              from: 'intent'  };  // string (§3.1)
    case 'field':   return { label: el.label.rendered,     from: 'field'   };  // Phrase (§0.18)
    case 'section': return { label: el.heading.rendered,   from: 'section' };  // Phrase (§0.18)
    case 'option':  return { label: ('label' in el ? el.label : el.title).label,
                             from: 'option' };   // OptionItem.label OR, on STRATEGY_OPTIONS,
                                                 // alternatives[].title — both Cell<string>
    case 'slot':    return { label: el.start.label,        from: 'slot'    };  // Measure (§2.6.4)
    case 'entry':   return { label: el.title.label,        from: 'entry'   };  // Cell<string> (§2)
    case 'row':     return { label: el.row.cells[rowHeaderKey(el.table)].label,
                             from: 'row' };                                    // Cell<string> | Measure
  }   // total by type over the closed seven-member union — no default branch is reachable.
}

// A-2, in one line: the accessible name begins with the label of whatever the ref denotes.
∀ ref ∈ reading_order : accessible_names[refKey(ref)].startsWith(nameSourceOf(ref, env).label)
```

**S0C.22-octies — `resolveInteractive`'s totality ground, corrected for the appended refs.**
§0C.22-ter grounds that function's totality on "`validateEnvelope` already recomputes the ref
set from `interactive_paths` applied to this body, so the element each ref denotes is a value
that computation already holds". That ground is **false for the refs EC-18(2) appends**, which
come from `emitted` rather than from the body. They do resolve — so nothing breaks in fact —
but the stated reason did not cover them, which is the defect and not the outcome. The
declaration is extended: **a `{k:'intent'}` ref resolves against `env.intents` by `intent_ref`;
every other ref kind resolves against the body through `interactive_paths`.** Total over the
widened list by its two operands.

**S0C.22-sexies — two kinds produce refs the original six-member union could not denote, and one kind's
options are not `OptionItem`s.** Both were surfaced by declaring `nameSourceOf` total, which is
what a totality claim is for.

- **`TIME_SLOT_SELECTOR`** declares the interactive path `groups[].slots[].slot_ref` (§2.6.4),
  and `InteractiveRef` had no member that could denote a slot. K22 requires `reading_order` to
  contain **exactly** the refs `interactive_paths` produces, so that rule was unsatisfiable for
  the booking flow's central kind. `InteractiveRef` gains `{ k: 'slot'; id: string }` — a
  seventh member — and the name source is the slot's `start`, a `Measure` and therefore a
  `Cell` with a minted `label`. §1.4 classes `slot_ref` itself **structural** ("never
  rendered"), which is consistent: the *handle* is never rendered, the *name* comes from
  `start`.
- **`STRATEGY_OPTIONS.alternatives[]`** declares `option_id`, `title: Cell<string>`,
  `reasoning`, `expected_effect`, `risk_tier`, `reversible`, `audience_size` and
  `select_intent` — **no `label`**. It is not an `OptionItem`, though its refs are
  `{k: 'option'}` by §2.6.11's declared path `alternatives[].option_id`. Rather than retype
  §2.6.11's body, the `option` branch reads whichever of the two members the resolved shape
  declares; both are `Cell<string>`, so the branch stays one line and stays total.

**S0C.22-quater — a table's row-header cell is never absent and never `null`, so the `row`
branch is total.** `TableSpec.rows[].cells` is typed `Record<string, Cell<string> | Measure | null>`,
and a `null` there would make `nameSourceOf` — declared total and non-throwing — partial for
exactly the three kinds whose `interactive_paths` produce `row` refs. This section, which
outranks §2, narrows the shape rather than the branch:

> For every `TableSpec t` reachable in a body, and every `r ∈ t.rows`, `r.cells` MUST contain
> the key `rowHeaderKey(t)` with a **non-null** `Cell<string>` or `Measure`. Absence or `null`
> refuses the envelope. A header whose value is not yet known is carried by a `Cell` in a
> non-`KNOWN` state — `PARTIAL`, `NOT_MEASURED`, `UNAVAILABLE` or `PENDING` — never by `null`
> and never by an absent key, which is the whole reason `Cell` has five states.
> *Mechanism:* `validateEnvelope`'s `TableSpec` check. *Evaluation point:* `EP-MINT`.

The other columns keep their `| null` alternative unchanged; only the one row-header column is
narrowed. And `.label` is valid for both surviving alternatives: `Measure` is declared
`extends Cell<number | string>` (§1.1), so it inherits `label` — the branch needs no
discrimination between them.

**Every branch lands on a minted string, and each of the three routes there is a deliberate
one.** `WidgetIntent.label` is already `string`. `FormField.label` and a report section's
`heading` are typed `LocaleText` in §2.6, and **§0.18 rules `LocaleText` a deprecated alias of
`Phrase` that "MUST NOT appear in an implementation", with `LocaleText.text ≡ Phrase.rendered`**
— so both are read as `Phrase` and dereferenced through `.rendered`, the member §1's `Phrase`
declares as "**M** — the only user-visible bytes". The first draft of this fence returned the
`Phrase` object itself, which is not a string.

**The remaining three sources are `Cell<T>`, and that is the reason this works rather than an
inconvenience.** `OptionItem.label`, `entries[].title` and a table row's header cell are all
`Cell<T>`, and `Cell<T>.label` is declared "**M** — ≤ 160 chars, **always a human sentence
fragment**" (§1.1). It is server-minted by the same pure function class as
`accessible_names` itself, and it is a human string in **every one** of the five cell states —
`KNOWN`, `PARTIAL`, `NOT_MEASURED`, `UNAVAILABLE`, `PENDING` — so an accessible name never
degrades to an empty string, a raw value or a failure token when a cell is not KNOWN. That is
exactly the property §1.3's `Cell` — five states, an always-human `label` — was adopted for. `rowHeaderKey(t)` reads the one column
that **table** requires to carry `is_row_header: true` ("exactly one column MUST be true"), so
it is total by that rule and needs no default. It is keyed on the `TableSpec`, not on the
envelope: REPORT declares `sections[].table: TableSpec | null`, so an envelope may hold many
tables and an envelope-keyed lookup would have been ambiguous — which is what the first draft
wrote.

**`accessible_names` stays total over `reading_order`** — every ref still gets an entry — and
what changes is only **whose label the entry must begin with**. The §4.8.2 per-kind row
continues to govern the remainder of the composition for the kinds it names, and those rows
address intent controls, so they are unaffected. *Status:* `NORMATIVE-PENDING` on **P-19**,
**P-31** (§0C.29).

**S0C.22-quinquies — §4.8.2 gains the column A-2 reads, because it had none.** A-2 says the
name is composed with "the composition given by its kind's row in §4.8.2", but §4.8.2's
columns are `role_hint` (derived from `KIND_REGISTRY` per §0B.35), keyboard model, text
alternative, live region and non-colour state — **no accessible-name column exists**. §4.8.2
therefore gains a sixth column, **`accessible_name_suffix`**, typed **per ref kind** rather than
as one string per widget kind:

```ts
accessible_name_suffix: Partial<Record<
    `${InteractiveRef['k']}:${WidgetIntent['role'] | '*'}`,
    { base: 'element' | 'body'; pointers: readonly string[] }
  >>;
       // The VALUE is a composition descriptor, NOT a literal string: a string would be
       // concatenated verbatim and produce "Скачать, audience_size" instead of the number.
       // `base` is REQUIRED because the two families resolve against different nodes and
       // neither base serves both. An intent ref's element is a WidgetIntent (§3.1), which
       // declares no filename, audience_size or risk_tier — those live on ArtifactBody,
       // ApprovalBody and the body's bulk_intents[] — so the three intent rows are
       // base:'body'. The two option rows say "THAT option's duration and price", which only
       // the resolved element can express, so they are base:'element'.
       // The declared default is { base:'element', pointers: [] } — an EMPTY LIST, never ''.
       //
       // renderSuffix turns the descriptor into text; without it A-2's "equality with the
       // row's composition" had no composition to compare against. It is DECLARED, not
       // described in a comment — the first draft left it commented out, which is the same
       // "left in a code comment only" failure §0C.28-sexies item 3 rules a defect.
       // LOOKUP KEY: `${ref.k}:${intent.role}` for a {k:'intent'} ref; `${ref.k}:*` for every
       // other ref kind, which denotes an element carrying no role at all. A more specific
       // entry wins over '*'.
```

**It must key on the ref kind AND the intent role, because two of the six rows scope their
suffix more finely than a ref kind can express.** §4.8.2's `APPROVAL` row says
`audience_size`, `risk_tier` and reversibility appear in **the approve control's** accessible
name — but APPROVAL's interactive paths are `approve_intent`, `reject_intent` and
`detail_intent`, all `{k:'intent'}`, so a ref-kind key would force the audience-and-risk suffix
onto the reject and detail controls too. §4.8.1 A-17 says `CLIENT_LIST`'s `audience_size`
belongs to its **bulk intents** and not to its row refs. `SERVICE_SELECTOR`'s duration and price
belong to its **option** refs. A single per-kind string would have attached each suffix to every
control of that kind, including the ones its own column excludes — which is a wrong accessible
name, not a loose one. Every `${kind}:${role}` pair a row does not name takes the declared
default — an empty pointer list. Populated as:

**Six rows are populated, and the source of each is a column §0B.35 and EB-12 expressly
preserved** — "its keyboard-model, text-alternative, live-region and non-colour-state columns
stand". Those columns already require named content *in the accessible name*, so an empty
suffix for them would not have been a default; it would have been a **contradiction**:

| kind | key | suffix | where it already says so |
|---|---|---|---|
| `ARTIFACT` | `intent:primary` (base `body`) | `filename`, `format`, `size_bytes` — the **fetch** control alone | §0B.36's row, keyboard-model column |
| `APPROVAL` | `intent:primary` (base `body`) | `audience_size`, `risk_tier`, reversibility — **the approve control alone**; `intent:destructive` (reject) and `intent:secondary` (detail) take the declared default — an empty pointer list | §4.8.2's row, keyboard-model column |
| `SERVICE_SELECTOR` | `option:*` (base `element`) | that option's `duration` and `price` | §4.8.2's row, text-alternative column |
| `STAFF_SELECTOR` | `option:*` (base `element`) | `nearest_availability` | §4.8.2's row, text-alternative column |
| `CLIENT_LIST` | `intent:primary` (base `body`) | `bulk_intents[⟨the entry whose intent handle is `ref.id`⟩].audience_size` — row refs are `{k:'row'}` and unaffected | §4.8.1 A-17 |
| `STRATEGY_OPTIONS` | — | — see the ruling below — | §4.8.2's non-colour-state column |

`intent:escape`, `intent:remedy` and `intent:more` take the empty default in every row, so the
intents EC-18(2) appends never acquire a suffix.

**S0C.22-undecies — a `base: 'body'` pointer that crosses an array selects by the ref's own
handle.** §2.6.7 declares `bulk_intents: Array<{ intent_token; label; audience_size: Measure }>`
— **`audience_size` is a member of each ENTRY, not of `ClientListBody`** — so a bare pointer
`audience_size` resolves to nothing on the body, and `bulk_intents[].audience_size` is N-valued
where A-17 requires *that* bulk intent's number. The rule, stated once and applying to every
`base: 'body'` pointer:

> Where a `base: 'body'` pointer crosses an array whose entries carry an intent handle, the
> entry selected is **the one whose handle equals `ref.id`**. If no entry matches, the envelope
> is refused at `EP-MINT` rather than rendering a name from a neighbouring entry.

`ARTIFACT` and `APPROVAL` need no selection — `filename`/`format`/`size_bytes` and
`audience_size`/`risk_tier`/reversibility are single-valued members of `ArtifactBody` and
`ApprovalBody` — which is why only `CLIENT_LIST` carries a crossing pointer.

**S0C.22-nonies — the two rows scoped to one control need the roles they scope by, and no clause
assigned them.** `intent:primary` only reaches the approve control if something fixes
`approve_intent`'s role, and §2.6.12 declares `approve_intent`, `reject_intent` and
`detail_intent` as bare refs while §3.1 lets a composer choose any of the eight roles. The same
gap applies to `ARTIFACT`'s two controls. Two clauses close it, both at `EP-MINT`:

> **APPROVAL.4 (§2.6.12).** `approve_intent` is `role: 'primary'`, `reject_intent` is
> `role: 'destructive'`, `detail_intent` is `role: 'secondary'`, and an `APPROVAL` body mints
> **exactly one** `role: 'primary'` intent.
> **ARTIFACT.3 (§2.6.22).** `fetch_intent` is `role: 'primary'` and `regenerate_intent` is
> `role: 'secondary'`.
> **CLIENT.3 (§2.6.7).** Every `bulk_intents[]` entry is `role: 'primary'`. **Numbered 3, not
> 2:** §2.6.7 already declares a `CLIENT.2` — "this kind is never emitted with
> `presentation_mode: 'client'`", the `pii_ceiling: 'client_identified'` display fence. Because
> §0-C governs over §2 (§0C.2), a second rule under the same identifier could be read as
> **superseding** that fence, silently deleting it. §2.6.7's `CLIENT.1` and `CLIENT.2` are
> unaffected by this section. Without it a bulk
> intent minted `secondary` or `destructive` takes the empty default and loses `audience_size`
> from its accessible name, breaking §4.8.1 A-17 exactly as ARTIFACT's missing role would have
> put the file facts on the regenerate control. `CLIENT_LIST`'s row refs are `{k:'row'}` and are
> unaffected either way.

Without ARTIFACT.3 the `intent:*` key this table first used would have put the file facts on the
regenerate control — "Создать заново, report.pdf, PDF, 2 МБ" — which §0B.36 scopes to the single
activation control. A suffix on the wrong control is a wrong accessible name, not a loose one.

- **The other sixteen carry the declared default — an empty pointer list**, for which A-2's
  composition reduces to `nameSourceOf(ref, env).label` verbatim, so the rule is total over
  all twenty-two kinds with no "otherwise" branch left to interpretation.

**S0C.22-septies — `STRATEGY_OPTIONS`'s `recommended` token is VOID, and the prohibition beside
it stands.** §4.8.2's non-colour-state column reads "`recommended` is a text token in the
accessible name and **never a pre-selection** (no checked state at render)". But
`StrategyOptionsBody['alternatives'][number]` declares `option_id`, `title`, `reasoning`,
`expected_effect`, `risk_tier`, `reversible`, `audience_size` and `select_intent` — **there is
no `recommended` member**, so the first half names content that cannot be produced. Declaring
one was rejected: a recommendation signal on an alternative is precisely the pre-selection
pressure the second half exists to forbid, and §2.6.11 STRATEGY.1 already requires the
no-action option to be equally selectable.

> **The accessible-name half of that column is VOID**; `STRATEGY_OPTIONS`'s
> `accessible_name_suffix` is the empty default, so an alternative's accessible name is its
> `title` verbatim. **The prohibition stands in full**: no alternative may render with a
> checked state, a pre-selection, or any token distinguishing it as recommended.

*Mechanism:* the same `EP-BUILD` CI check as A-2, extended to assert the column is present
and non-`undefined` for all twenty-two rows. *Status:* `NORMATIVE-PENDING` on **P-19**,
**P-31**.

**§4.8.2 is the sole per-kind normative owner of the accessible name**, continuing §0B.35;
A-2 supplies the composition rule and §4.8.2 supplies the per-kind suffix. One field, one answer, and the CI check
is writable against identifiers that exist.

---

## 0-C.7 EC-7 — FR-6e's tenant-object half gets the mechanism it was missing

**S0C.23 — the defect and the ruling together, because the fix is one line.** §0B.25 states
that no capability satisfying `TENANT_AUTHORITY` is on the allowlist "in this contract
version … they are in `AE_CAPABILITY_GAP_LEDGER` under `GAP-TENANT-ADMIN`, no allowlist
row." That sentence names **no enforcing mechanism and no evaluation point of its own**,
contrary to §S0.2 and to §0B.14's polarity doctrine. §0B.16's start-up set — the named
mechanism for every other FR-6 family exclusion — carries explicit build-time vetoes for
`MONEY`, `BOOKING`, `MARKETING_FANOUT`, `CONSENT` and `IDENTITY`, and **no line for
`TENANT_AUTHORITY`**; its `row XOR gap` line forces classification but not which side a row
lands on. Measured exposure: `TENANT_AUTHORITY(cap)` is satisfied by **28 of 226**
capabilities, **14** of them `ALLOW` and reachable from `authenticated_request`, and **10 of
those 14** carry the twelve-role default — including
`package5.wave2.claim-team-owner.execute.v1`, `.suspend-tenant.execute.v1`,
`.create-tenant-user.execute.v1` and `.update-tenant-configuration.execute.v1`. Nothing in
the contract's checked assertions would refuse such a row placed on the allowlist under
family `settings` or `operational`, where `AE_FAMILY_FLOOR` is the reachable
`SESSION_VERIFIED`.

§0B.16's start-up set gains the missing veto, in the same form as its five siblings:

```
row ⟹ TENANT_AUTHORITY(cap) ⟹ fail            // veto — no tenant-object capability is ever allowlisted
```

FR-6e held before this line and holds after it; what changes is that it holds **by a checked
assertion** rather than by the absence of a table. The cross-tenant half —
`TenantContextService.assertTenantId` at Gate 4, plus `evaluateTenantAccessState` and
`assertNoCallerAuthority` (`action-engine.ingress.ts:161`) — is `[EXISTS]` and unchanged.

*Mechanism:* the start-up loop. *Evaluation point:* `EP-REGISTRY-LOAD`. *Status:*
`NORMATIVE-PENDING` on **P-23**.

---

## 0-C.8 EC-8 — BOOK.1's ingress half is void, for the reason §0.35 already gave

**S0C.24 — the defect and the ruling.** §2.6.5 BOOK.1's second sentence reads: "ACTION
ENGINE INGRESS independently re-derives the subject from the submitted capability and
refuses when the emission's `confirmation_subject` disagrees." It is not constructible.
`CanonicalActionIngressService.prepare()` receives `TrustedActionExecutionRequestV1`
(`action-engine.contract.ts:43–70`), which carries `tenantId`, `capability`, `source`,
`targetRef`, `input`, `evidenceRefs`, `intentExpiresAt`, `callerIdempotency`, `bookingIntent`
and five server-owned slot bindings — **no widget-layer field**; `confirmation_subject`,
`confirmationSubject`, `widget_kind` and `widgetKind` have **0 occurrences** under
`src/action-engine`. `confirmation_subject` is a widget **body** field, and §0.35 rules that
passing one "would make a canonical mutation conditional on widget-layer state, which FR-1,
FR-2 and E3 forbid". §0.35 voids §2 K11 and BOOK.2 on exactly this ground and §0.16 E-18
voids BOOK.2 — but **BOOK.1 is named in no errata row anywhere**, so a defence-in-depth
claim that cannot be built was left standing as normative.

> **BOOK.1's second sentence is VOID**, on the ground §0.35 states for K11 and BOOK.2.
> **BOOK.1's first half stands unchanged**: the subject fence is the mint-time one — a
> `confirmation_subject` that does not match the capability the canonical owner returned is
> not mintable (§0.34), and Gate 7 re-checks it over the widget layer's own `IntentRecord`.

Nothing is under-protected by this deletion: §0.34's mint-time non-existence fence and
§0B.21's allowlist are the real controls and are untouched, and §0.35 already enumerates
what the Action Engine does independently enforce — `assertNoCallerAuthority`,
`assertResolverOwnsDecision`, `allowedSourceTypes` membership, the evidence-prefix and
cardinality check, and the mandatory `bookingIntent` for a client-principal create.

---

## 0-C.9 EC-9 — the spoken-commit readback gets a carrier, a field and a gate

**S0C.25 — the defect.** §4.7 V4 is normative: "every `COMMIT` reached by voice requires
readback … the gateway refuses a `COMMIT` submission from a `SPOKEN` profile with no
readback confirmation reference." **No such reference can exist anywhere in the contract as
specified.** §3.8's `WidgetIntentSubmission` is a closed shape — `contract`, `widget_id`,
`intent_token`, `inputs`, `client_nonce`, `profile_id`, `spoken_transcript?`,
`client_emitted_at?` — with no member able to carry it, and R3.8.2 plus §0.54 refuse unknown
keys at any depth; `inputs` is unusable because §2 K12 fixes
`commit_intent.input_schema === null` on all four confirmation kinds and Gate 8 refuses a
submission carrying `inputs` for a null schema; §3.7's `IntentRecord` has no readback field;
§3.9's fourteen gates contain no readback gate. The stated mechanism's container is also
stale — `requires` is not a member of `WidgetIntent`; the member is `confirmation` (§3.1).
Verified repo-wide: `readback` has **exactly one** occurrence, the unrelated capability key
`cash-declaration.local-readback` (`action-engine.registry.ts:1628`). `SPOKEN` is the only
non-`RICH_INTERACTIVE` tier §4.5.3 permits to reach `COMMIT` ("up to `COMMIT`, readback
mandatory"), so the stated fence on a spoken commit was asserted, not enforced.

**S0C.26 — the ruling: build the fence rather than withdraw it.** V4 guards the one path on
which a commit is confirmed by an utterance that no one can re-read, so withdrawing it and
marking it non-normative would leave a promise with no executable path. The three missing
pieces are added, all inside the widget layer — no Action Engine field, no C9 field:

**One of the four pieces already exists, and saying so matters.**
`ConfirmationRequirement` (§3.1) **already declares** `requires_readback: boolean`,
commented "speech profiles: server text read back first". §4.7's stale reference
`requires.requires_readback` is therefore **only a wrong container name** — the member
is `confirmation`, not `requires` — and is corrected, not added. What is genuinely
absent is the thing to read back, the carrier that returns the affirmation, and the
gate that checks it:

```ts
// ALREADY DECLARED (§3.1 ConfirmationRequirement) — corrected reference only.
confirmation.requires_readback: boolean;   // server-set: effect === 'COMMIT' ∧ tier SPOKEN

// 1. THE THING READ BACK — two new server-set members on ConfirmationRequirement.
confirmation.readback_ref:  string | null;  // non-null iff requires_readback
confirmation.readback_text: string | null;  // server-minted, sealed inside body_hash
                                            // (§0.31 mint class M — an author cannot write it)

// 2. THE CARRIER — §3.8's closed shape gains exactly one optional member.
interface ReadbackAck {
  readback_ref: string;   // echoes confirmation.readback_ref
  body_hash: string;      // echoes the emission's body_hash
  affirmation: string;    // the caller's affirmative utterance, verbatim
}
interface WidgetIntentSubmission {
  /* …the eight existing members, unchanged… */
  readback_ack?: ReadbackAck;     // REQUIRED iff Gate 8-R applies; refused otherwise
}

// 3. THE GATE — §3.9 gains Gate 8-R, immediately after Gate 8 (input schema).
//    Refuses, never repairs. reason ∈ {'readback_missing','readback_mismatch'}.
```

**Gate 8-R (normative).** For a submission whose **`record.confirmation?.requires_readback`
is `true`** — `confirmation` is non-null only for `REQUEST_APPROVAL` and `COMMIT` (§3.1), so
the optional chain is what makes the antecedent total over every record — the gateway refuses
unless **all four** hold: `readback_ack` is present;
`readback_ack.readback_ref === record.confirmation.readback_ref`;
`readback_ack.body_hash === record.body_hash`; and `readback_ack.affirmation` is an exact
member of the server-published closed affirmation vocabulary for the envelope's locale. A
submission carrying `readback_ack` whose record does not satisfy
`confirmation?.requires_readback === true` is **also** refused — including one whose
`confirmation` is null altogether —
the field is not an optional extra, and §0.54's closed-shape discipline is preserved in both
directions.

**S0C.26-bis — the antecedent is the record, never the submission, and this is a security
repair not a phrasing one.** The first draft keyed Gate 8-R on "a submission whose
`profile_id` resolves to a profile whose carrier tier is `SPOKEN`". **`profile_id` is
declared `ADVISORY` by §3.8 and R3.8.3 (`// ADVISORY (R3.8.3)`), and R3.8.3 states it "is
advisory and is not an authority input."** A caller could therefore have submitted a
non-`SPOKEN` `profile_id` and skipped the readback entirely — the gate's own antecedent
handing the caller the switch, which is precisely the `CHANNEL CLAIM → AUTHORITY` edge FR-3
forbids. `requires_readback` is server-set at `EP-MINT`/`EP-FIT` from `Lifecycle.delivery_channel`
and is sealed inside `body_hash`, so keying on it cannot be influenced by the submission.
A `SPOKEN` delivery that reaches `COMMIT` now carries `requires_readback === true` by
composition, and the gate reads that. `readback_text` is
server-minted and sealed inside `body_hash`, so a client cannot choose what was read back,
and the `body_hash` echo makes a readback against a superseded body refuse rather than
commit. §4.7's stale `requires.requires_readback` reference is corrected to
`confirmation.requires_readback` throughout.

**S0C.26-ter — `record.body_hash` is declared here, because `IntentRecord` has no such
member.** §3.7's `IntentRecord` enumerates `intent_token_hash`, `widget_id`, `tenant_id`,
`principal_proof_hash`, `effect`, `capability`, `handoff_capability_ref`, `target`,
`verification_floor`, `confirmation`, `input_schema_hash`, `requested_scope_hash`, `run_ref`,
`approval_of_intent_ref`, `confirmation_of_draft_ref`, the lifecycle timestamps and
`action_receipt_ref`, then the erasable conversation fields — **no `body_hash`**. Gate 8-R's
third condition, and §0.34's `SUPERSEDED` comparison, both need it:

```ts
interface IntentRecord {
  /* …unchanged… */
  body_hash: string;          // NEW. Written at mint from the sealed emission. AUDIT_RETAINED
                              // (§0.53 / RT5): it survives conversation erasure, because it
                              // is a hash and carries no conversation content.
}
```

Added to **P-30**'s component list, so a build of the gateway that omits it fails §A2.4's
assertion rather than shipping a gate that cannot evaluate.

**Erasure classes, because a new carrier without one is a gap in §4.4.3's table.**
`readback_ack.readback_ref` and `readback_ack.body_hash` are `AUDIT_RETAINED` — opaque handles
and a hash, carrying no conversation content, and read by Gate 8-R which §0.52 requires to see
only `AUDIT_RETAINED` fields. **`readback_ack.affirmation` is `CONVERSATION_CONTENT`**: it is a
word the data subject said, so it is erased with the conversation, and Gate 8-R compares it
against the closed affirmation vocabulary **at submission time only** — no later path reads it,
which is what keeps §0.52's build-time reachability test green. `IntentRecord.c9_domain` and
`.selection_domain` are `AUDIT_RETAINED`; §0.51 already classes the `selection_domain`
*labels* as `CONVERSATION_CONTENT`, and the two are distinct fields. All five rows are added to
§4.4.3's table.

*Mechanism:* the two new `confirmation` members, `IntentRecord.body_hash`, the amended §3.8
shape, and Gate 8-R keyed on the record. *Evaluation points:* `EP-MINT` (the fields),
`EP-INGRESS` Gate 8-R. *Status:* `NORMATIVE-PENDING` on **P-01**, **P-02**, **P-30** (§0C.29).

---

## 0-C.10 EC-10 — PR2's capability half is rebuilt without touching the C9 registry

**S0C.27 — the defect.** §4.9.2 PR2's mechanism (a) reads "the capability registry marks
run-opening capabilities; the emission validator refuses them on a proactive envelope." No
such marker exists: `C9Capability` (`c9.registry.ts:52–74`) declares twenty-two members and
none of them marks a run-opener, and `runOpening`, `run_opening`, `opensRun`, `opens_run`,
`runOpener`, `canOpenRun` are **0 hits repo-wide**. Adding the field would change
`C9_CAPABILITIES` and therefore `C9_REGISTRY_HASH`
(`c9Hash('registry/1', C9_CAPABILITIES)`, `c9.registry.ts:177`), which §0.3 and FR-16 forbid
outright. This is precisely the shape §0.16 E-18 voids for `booking_effect: true` — but PR2
is voided nowhere, and it was the single place in the assembled contract where the "no C9
contract change" verification failed.

**S0C.28 — the ruling.** PR2's mechanism (a) is **VOID** and replaced by a widget-layer
predicate over a field C9-CAP **already has**:

```
RUN_OPENING(r: CapabilityRef | null) :=
                    r !== null
                 ∧ r.space === 'C9'
                 ∧ (c9Registry.tryGet(r.key)?.mode ?? 'PROPOSE_ONLY') !== 'READ'
                 //  ^ the ONLY declared accessor (§0C.11-bis). The `??` default makes an
                 //    unregistered C9 key satisfy RUN_OPENING, so PR2 (a′) REFUSES it on a
                 //    proactive envelope — the fail-closed direction, matching c9Floor.
```

> **PR2 (a′), normative.** The emission validator refuses any intent whose
> `subjectCapability(i)` satisfies `RUN_OPENING` on an envelope whose **`origin.trigger` is
> `'proactive'`** — the spelling §3.2.5, §4.9.1 PR1 and §4.9.2 PR2 (b) already use; the first
> draft wrote "`origin` is `PROACTIVE`", which names neither the member nor the value.
> `subjectCapability(i)` returns `null` for a `NONE` effect and for a `w`/`i`/`s`/`detail`
> `NAVIGATE` (§3.5), which is why `RUN_OPENING` is stated ref-nullably above and is total over
> what it is actually passed. *Evaluation point:* `EP-MINT`.

**The first draft of this predicate wrote `c9Registry.get(ref.key).mode`, and that was the
same defect twice over:** `c9Registry` is not a repository object at all — it exists only as
this contract's own declaration, and §0C.11-bis declares it with **exactly one member,
`tryGet`**, under the rule that "a normative clause must not name an identifier no shape
declares". A `.get` on it names nothing, and a non-optional call would also have had no
fail-closed branch for an unregistered key. Membership over the registered 56 is unchanged
by the correction.

`mode` is a mandatory closed-union member of `C9Capability` and distinguishes exactly the
right set: `READ` keys are provenance — a proactive envelope legitimately names
`c7.measurement.read` as the source of a metric — while `PROPOSE_ONLY` and `OWNER_HANDOFF`
can only be exercised **inside** a run, so an intent naming one is a run-opener by
construction. Membership is **15 of 56** (13 `PROPOSE_ONLY` + 2 `OWNER_HANDOFF`), enumerated
in process. **No field is added, so `C9_REGISTRY_HASH` is unchanged and FR-16 holds.**
PR2's mechanism (b) — the standing CI leak query over recorded emissions, covering the
`IntentRecord.run_ref === null` half at `EP-BUILD` — stands unchanged, and PR1's proactive
effect ceiling is independently enforced by its own emission-validator predicate.

---

## 0-C.10-bis Six defects this round's certification surfaced, closed here

**S0C.28-bis.** Three independent certifiers read the assembled contract in full (5 501
lines each) and executed the registries rather than grepping them. Six defects they raised
are not repairs of EC-1…EC-10 but distinct carried-forward or newly-exposed faults. They are
closed here rather than deferred, because five of the six are one clause each.

### EC-11 — Gate 6 gains its third C9 branch

**The defect.** §0B.18 dispatches Gate 6 by key space: `AiToolPolicyService.assertCanExecute`
for `C9` and `TOOL`, the AE policy pre-screen for `AE`, §0.23's owner-endpoint lock for
`CONTROL`. That is total over the **spaces** but not over the **C9 space's own members**:
`assertCanExecute(principal, definition: AiToolDefinition)` needs a catalogue definition, and
**nine of the 56 C9-CAP keys are not catalogue names** (§0C.8). While those nine were
unreachable — which is exactly what EC-2 repaired — the hole was masked. EC-2 makes them
reachable, so it must also say what fences them at Gate 6.

**The ruling.** Gate 6's `C9` branch is split in two, in the shape §0.23 already uses for
`CONTROL` — name the fence that exists rather than the one that does not:

```
const ref = subjectCapability(record);               // bound once; NOT record.capability
if (ref === null) → no capability is exercised; Gate 6 has nothing to check (§0C.28-septies)
Gate 6, ref.space === 'C9':
  def = MAYA_AI_TOOL_CATALOG_BY_NAME.get(ref.key)
  if (def !== undefined)  → AiToolPolicyService.assertCanExecute(principal, def)     // the 47
  else                    → WIDGET_CAPABILITY_POLICY[capKey(ref)] must exist (else refuse), AND
                            c9Capability(ref.key,                                            // the 9
                                         record.c9_domain,        // §0C.28-ter, declared below
                                         C9_REGISTRY_HASH) must admit
                            // where `const ref = subjectCapability(record)` is bound once at the
                            // top of the branch. NOT record.capability.key: §3.2 fixes
                            // `capability` null for every HANDOFF, so that spelling would read
                            // `.key` on null for the very effect class this branch exists to
                            // reach. On a run-less mint path record.c9_domain is null and the
                            // c9Capability half is not applied (§0C.28-quater).
                            (it throws `capability_not_registered` otherwise, and additionally
                             refuses BUSINESS_INTELLIGENCE for any mode !== 'READ')
```

**S0C.28-ter — the domain argument needs a carrier, and none existed.** `c9Capability` is
`(key, domain: C9Domain, registryHash)` (`c9.registry.ts:178–192`) — the `domain` is a
**required positional argument**, and its two refusal branches (`!def.domains.includes(domain)`
and `domain === 'BUSINESS_INTELLIGENCE' && def.mode !== 'READ'`) are precisely the fence this
branch is invoking. A full read of the contract finds **exactly one** domain-valued member
anywhere — `Correlation.agent_id` (§1.1.4), which is envelope-level, nullable, and named by no
gate. `IntentRecord` declares none. A gate cannot pass an argument the record does not carry.
§3.7's `IntentRecord` therefore gains one member, alongside EC-15's two:

```ts
interface IntentRecord {
  /* …unchanged, plus §0C.26-ter's body_hash and EC-15's selection_domain… */
  widget_kind: WidgetKind;      // NEW. Mint class D, AUDIT_RETAINED — it names a kind, not
                                // conversation content. REQUIRED because Gate 5's recompute
                                // evaluates KIND_FLOOR[kind] as one of verificationFloor's four
                                // terms, and EC-12's surviving ruling enforces the kind rule
                                // "at EP-INGRESS Gate 7, over the widget layer's own
                                // IntentRecord". §A1's P-02 row already names it as part of the
                                // component; §3.7 simply never declared it.
  handoff_capability_ref: CapabilityRef | null;   // RETYPED. §0B.7's retyping enumeration names
                                // WidgetIntent.handoff_capability_ref and IntentRecord.capability
                                // but omits THIS member, so it stayed `string | null` while
                                // SENSITIVE_DEST reads `r.space` off it. Added to that list.
  priority: number;             // NEW. Mint class D, AUDIT_RETAINED — an integer carrying no
                                // conversation content, so §0.52's reachability test stays green.
                                // REQUIRED because §0.16 has Gate 5 recompute verificationFloor()
                                // from the live tables and the record and refuse on ANY
                                // difference; FLOOR_EXEMPT reads i.priority, so without this
                                // member the exempt branch is not recomputable at EP-INGRESS and
                                // every exempt intent would diverge and be refused.
                                // `priority` and `widget_kind` are added to P-30's component
                                // list for the same reason §0C.28-ter adds c9_domain: a gateway
                                // built without them ships a Gate 5 that cannot recompute.
  c9_domain: C9Domain | null;   // NEW. `C9Domain` is the orchestrator's own published union
                                // ('ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' |
                                //  'BUSINESS_INTELLIGENCE'), imported, never redeclared —
                                // the same four §1.1.4's Correlation.agent_id already carries.
                                // Mint class D, AUDIT_RETAINED. Non-null IFF BOTH
                                // subjectCapability(record).space === 'C9' AND
                                // correlation.run_id !== null. Derived at EP-MINT from
                                // `Correlation.agent_id`, which §0.16 E-29 already
                                // reclassifies as class D, "derived by the minter from the
                                // run's registered agent" — the one domain-valued member the
                                // contract declares. On the run-bearing path an envelope whose
                                // capability.space is 'C9' and whose correlation.agent_id is
                                // null is REFUSED at EP-MINT; on BOTH run-less mint paths —
                                // the registered capability read and the proactive scheduler —
                                // it is null by construction (§0C.28-quater).
                                // NEVER from the subject capability's own `domains` — that
                                // would compare a value with itself and make the test vacuous.
}
```

**S0C.28-quater — the refusal is scoped to the path on which its antecedent can be evaluated.**
The first draft said a `C9` intent whose envelope carries `correlation.agent_id === null` is
refused at `EP-MINT`. That would have refused an entire legitimate mint path. §1.1.4 declares
`run_id` "NULLABLE BY DESIGN", and **as amended by EC-18** names three mint paths, and §4.1.1 L1 names the registered capability-read endpoint as
minter 2 of 3. On that path **there is no run and therefore no registered agent**, so
`agent_id` is null by construction and §0.16 E-29's derivation ("derived by the minter from the
run's registered agent") has no input. The refusal as written would have made every C9
capability-read envelope unmintable.

> **On the run-bearing path** — `correlation.run_id !== null` — an envelope carrying an intent
> whose **`subjectCapability(i).space === 'C9'`** is **refused at `EP-MINT` when
> `correlation.agent_id` is null**, and `c9_domain` is that value. The predicate is
> `subjectCapability`, **never `capability`**: §3.2 fixes `capability` null for every `HANDOFF`,
> so a run-bearing `HANDOFF` whose destination is a C9 key would otherwise escape the refusal
> entirely, mint with `agent_id` null and `c9_domain` null, and break the IFF §0C.28-ter states.
> This is the same substitution EC-19 made at the Gate 6 call site.
> **On BOTH run-less mint paths** — the registered capability read (§4.1.1 L1 minter 2) and
> **the proactive scheduler for the canonical moments (minter 3)**, where `run_id` and
> `agent_id` are null for the same reason: §0.16 E-29's derivation "from the run's registered
> agent" has no input where there is no run — `c9_domain` is `null` **by construction**, and EC-11's second Gate 6 `C9` branch reduces there to: the
> `WIDGET_CAPABILITY_POLICY[capKey(ref)]` row must exist, plus `c9Floor`'s `min_verification`
> and `CONSENT_CLASS_FLOOR` carried at Gate 5. **The `c9Capability` domain half is explicitly
> NOT applied on those paths**, and this contract says so rather than leaving a gate that cannot
> call its own fence.
>
> **And the policy-row test is not a runtime refusal — said plainly, or a reader counts it as
> one.** §0B.32 makes `WIDGET_CAPABILITY_POLICY` total over all 56 C9 keys and §0.14 fails the
> **build** on a key with no row, so at runtime the row always exists for a registered C9 ref
> and that "else refuse" can never fire. On the two run-less paths the **operative** fence is
> therefore Gate 5's `c9Floor` — the policy row's `min_verification` and `CONSENT_CLASS_FLOOR` —
> and Gate 6 contributes a build-time totality restatement, not a second runtime check.
> §0C.32's EC-2 row is written to match.

The first draft also said the value came, on that path, "from the resolved principal's domain"
— **no principal shape declares a domain**, so that half named nothing at all. It is replaced
by the explicit `null`-by-construction ruling above, which is checkable. Added to **P-30**'s
component list, so a gateway built without it fails §A2.4's assertion rather than shipping a
gate that cannot call its own fence. The same binding is applied to §3.3.2's
`c9Capability(key, domain)` sentence, which had the identical dangling argument.

**The second branch is weaker than the first, and saying so is the point.** `c9Capability`
is the orchestrator's own admission function, it is `[EXISTS]`, and it refuses an unregistered
key, a registry-hash mismatch, a domain mismatch and a non-`READ` mode under
`BUSINESS_INTELLIGENCE` (`c9.registry.ts:178–192`) — but it applies **no role, surface,
feature or risk-tier test**, which `assertCanExecute` does. For the nine keys on this branch
the role and risk fences are therefore **their `WIDGET_CAPABILITY_POLICY` row's
`min_verification` and `consent_class`, carried through `c9Floor` at Gate 5**, plus
`CONSENT_CLASS_FLOOR` — not Gate 6. That is a real fence and it is a different one; a reader
must not take this branch for an equivalent of the first. **Here a throwing
accessor is correct**, because Gate 6 is a refusal point and a raise *is* the refusal —
unlike a floor derivation, which must return a level. *Evaluation point:* `EP-INGRESS`
Gate 6. *Status:* `NORMATIVE-PENDING` on **P-01**, **P-26**, **P-30**.

**S0C.28-septies — `subjectCapability` is declared over a structural subject, so both shapes
satisfy it.** §0B.30 declares it over `MintedIntent`, whose `capability` and
`handoff_capability_ref` are `CapabilityRef`s; Gate 6 and Gate 5 pass an **`IntentRecord`**. It
is re-declared over the structural subset both satisfy, which needs no widening of either shape:

```ts
type IntentSubject = { capability: CapabilityRef | null;
                       handoff_capability_ref: CapabilityRef | null;
                       target: IntentTarget | null };
declare function subjectCapability(i: IntentSubject): CapabilityRef | null;
```

`MintedIntent` satisfies it by §0B.7's retyping; `IntentRecord` satisfies it once the retyping
above reaches its `handoff_capability_ref`. **And every caller must guard the null**, which §3.5
returns for a `NONE` effect and for a `w`/`i`/`s`/`detail` `NAVIGATE`: a null subject means no
capability is exercised, so Gate 6 has nothing to dispatch on and passes the intent to its
remaining gates rather than reading `.space` off null.

**S0C.28-quinquies — Gate 6 dispatches on `subjectCapability(record)`, not on
`record.capability`.** §3.5's `subjectCapability` walks `capability → handoff_capability_ref →
target.ref` (class `c`) `→ null`, and §3.2's table fixes `capability` **null** for every
`HANDOFF` — the act a handoff carries the user toward lives in `handoff_capability_ref`.
Dispatching Gate 6 on `record.capability` would therefore skip the C9 branch for **every
HANDOFF**, which is the effect class whose subject is most often a C9 key, and the branch
§0C.32's EC-2 row names as a compensating fence would be unreachable for exactly those intents.
The dispatch key is `subjectCapability(record).space` and the argument is
`subjectCapability(record).key`; a `null` subject means no capability is exercised and Gate 6
has nothing to check — which §3.5 guarantees only for `NONE` and a `w`/`i`/`s`/`detail`
`NAVIGATE`.

**And the branches are scoped by EFFECT as well as by space, because a `HANDOFF`'s subject is a
destination, not an act being performed.** Dispatching on `subjectCapability` makes Gate 6 read
`handoff_capability_ref`, and R3.5.3 declares that field "referenced, never invoked". Applying
an execute-admission test to it would be a category error with real consequences: `c9Capability`
refuses `BUSINESS_INTELLIGENCE` on any non-`READ` mode, so a BI run could not even **offer** the
`a22.configuration` or `b35.confirm` handoff; and §0B.18 bullet 1(a) would demand an
`AE_WIDGET_COMMIT_ALLOWLIST` row for an AE destination that is being routed to, not committed.

> **For `effect === 'HANDOFF'` the subject resolves only the DESTINATION fences** — registration
> in its space, `SENSITIVE_DEST` (§0C.17-quater), `targetFloor('s')`, and the landing surface's
> own ingress. It never resolves `assertCanExecute`, `c9Capability`'s domain/mode admission, or
> the AE COMMIT allowlist. R3.5.3's reader list is extended to name this branch, so the field
> has one documented set of readers rather than a fourth undeclared one.

### EC-12 — the last two "independent Action Engine re-derivation" claims are void

**The defect.** EC-8 voided §2.6.5 BOOK.1's ingress half on §0.35's ground, but two more
sentences make the identical unbuildable claim and were named in no errata row:

- **§2.2 K2**, closing paragraph: "A fourth evaluation happens at INGRESS for the rules that
  guard effects: the `IntentRecord` persists `widget_kind`, and the ACTION ENGINE INGRESS
  re-derives the kind rule from it rather than trusting anything the submission carries."
- **§2.6.17 FORM.2**'s "and, independently, at ACTION ENGINE INGRESS …" clause.

`TrustedActionExecutionRequestV1` carries no `widget_kind` — 0 occurrences of `widget_kind`
or `widgetKind` under `src/action-engine` — and passing one would make a canonical mutation
conditional on widget-layer state, which FR-1, FR-2 and E3 forbid.

**The ruling.** Both are **VOID**, on the ground §0.35 states for §2 K11 and BOOK.2 and
§0C.24 restates for BOOK.1. The kind rule is enforced where it belongs and where it is
built: at `EP-MINT` and at `EP-INGRESS` Gate 7, over the widget layer's own `IntentRecord`.
EC-8's errata row is extended to cover both.

### EC-13 — an APPROVAL body carries two COMMIT intents, and the ceiling forbade it

**The defect.** §2.6.12's `ApprovalBody` declares `approve_intent` and `reject_intent`, §2 K11
makes APPROVAL a COMMIT-bearing kind, and §0.47 forbids nulling either except for three
enumerated server facts. But `KIND_REGISTRY.max_commit_intents` is typed `0 | 1` — a closed
union that **cannot express two** — and §2 K13 fixes it at `1` for the four confirmation
kinds, with the mint function refusing "a second `COMMIT` when `max_commit_intents === 1`".
So an APPROVAL body that mints both decisions is refused at `EP-MINT`, and one that mints
only one violates §0.47.

**The ruling.** `max_commit_intents` becomes `0 | 1 | 2`, and **`2` is admissible for
`APPROVAL` and for no other kind**, under a build veto:

```
APPROVAL ⟹ max_commit_intents === 2
kind !== 'APPROVAL' ⟹ max_commit_intents ∈ {0, 1}            // build veto
max_commit_intents === 2 ⟹ exactly one approve/reject pair, both non-null, both carrying
                            the SAME confirmation_of_ref.ref (the approval_ref) and the
                            SAME AE capability; consuming either marks the other consumed
```

**K13's invariant is preserved, not widened.** What K13 protects is *one actuating subject
per envelope*: approve and reject are two mutually exclusive decisions on **one** approval
object, not two commits on two subjects. The added clause makes that explicit and
enforceable — same `approval_ref`, same AE key, single-use across the pair — so an envelope
still cannot actuate two things. *Evaluation points:* `EP-BUILD` (the veto), `EP-MINT`.

### EC-14 — PR3c's delivery-consent carrier and registry are declared

**The defect.** §4.9.3 PR3c is normative — "the delivery permission is re-evaluated at
delivery, not at mint. `notify_pref_key` must resolve in the notification-consent registry" —
but **`notify_pref_key` is a member of no declared shape and the "notification-consent
registry" is named nowhere else in the contract.** The adjacent PR4 is already, correctly,
marked `[NON-NORMATIVE]` about editorial judgment; PR3c is not about judgment, it is about a
consent read, and it must be constructible.

**The ruling.** Both are declared:

```ts
interface ProactiveProvenance {
  /* …unchanged… */
  notify_pref_key: string;         // NEW. Mint class D (derived server-side from the moment).
}

// A closed server catalogue. Not author-extensible; a moment absent from it cannot be emitted.
interface Moment {
  moment_key: string;
  kind: WidgetKind;                  // the kind this moment composes — EC-18(3)'s pointer
                                     // check needs a leaf schema to check against
  moment_template_id: string;        // with the version below, composes the MOMENT_TEMPLATES key
  moment_template_version: number;   // REQUIRED once the catalogue is keyed `id@version`
  notify_pref_key: string;
  once_per: string;
  quiet_hours_policy: string;
}
declare const MOMENT_REGISTRY: Readonly<Record<string, Moment>>;   // the 12 canonical moments

// The registry PR3c names but never declared. Without it the clause "must resolve in the
// notification-consent registry" names no table and cannot be checked.
interface NotifyPref {
  notify_pref_key: string;
  consent_class: 'communication';          // §0.14's vocabulary; a delivery permission is
                                           // always a communication consent, never another class
  owner: CapabilityRef;                    // the canonical owner that records and revokes it
  quiet_hours_window: string;              // IANA-zoned window, re-read at delivery
}
declare const NOTIFICATION_CONSENT_REGISTRY: Readonly<Record<string, NotifyPref>>;
```

At `EP-REGISTRY-LOAD`, every `MOMENT_REGISTRY` row's `notify_pref_key` must resolve in
`NOTIFICATION_CONSENT_REGISTRY`, and `MOMENT_REGISTRY` must carry exactly **twelve** rows —
the twelve canonical moments — or the process does not start; at delivery the adapter re-reads
that key and the quiet-hours window immediately before handing bytes to the channel, and a
mint-time value is neither sufficient nor used — PR3c's own mechanism, now with something to
read. *Status:* `NORMATIVE-PENDING` on **P-17** and **P-32** (§0C.29). **P-17** is
`control.delivery.resolve`, "the handler that resolves one `dedupe_key` across channels" — the
component PR3c's own third condition (`dedupe_key` unique for the moment's `once_per` window)
actually needs. **P-32** carries the three registries. The first draft named **P-13**, the CHART
read facade, which gates nothing EC-14 names and would have bound a delivery-consent repair to a
wave-4 analytics component; it is struck.

### EC-15 — the two remaining dangling identifiers

`IntentRecord.body_hash` is declared by §0C.26-ter. The second is `selection_domain`, named
by the `SUPERSEDED` comparison and declared by no shape; it is declared on `IntentRecord`
alongside `body_hash`, mint class D, `AUDIT_RETAINED`, and added to **P-30**'s component list.

### EC-18 — three live paths name members that no longer exist, or that no rule admits

**S0C.28-sexies.** Declaring `reading_order` total and `nameSourceOf` total over it forced a
walk of all twenty-two kinds' `interactive_paths`. Three do not resolve.

**Two stale spellings are corrected with them.** §1.1.4 says `run_id` is nullable "because
**two** paths mint envelopes"; §4.1.1 L1 declares **three** minters and names the proactive
scheduler as the third, which §0C.28-quater now relies on — **§1.1.4 is amended to three, naming
the scheduler**, because a prose count that can drift is a count that will (EC-16). And §0B.18's
three Gate 6 bullets still dispatch on `capability.space`, one of them listing `HANDOFF` among
its effect classes though §3.2 fixes `capability` null for exactly that class: **§0C.28-quinquies
supersedes the spelling in all three**, which are read over `subjectCapability(record).space`.

1. **`PROGRESS` names a deleted member.** §2.6.13's interactive paths are `cancel_intent`,
   `steps[].unknown.next_intent_ref` — but **§0.19 deletes `steps[].unknown`** outright, ruling
   that "its `reason_code`, `label` and `next_intent_ref` are the `Cell`'s own" and retyping
   `steps[].state` as `Cell<'PENDING'|'RUNNING'|'DONE'|'SKIPPED'>`. A live path naming a void
   member produces no ref, so K22's set-equality rule is unsatisfiable for `PROGRESS`.
   **Amended to `cancel_intent`, `steps[].state.next_intent_ref`.**
2. **The escape verb is in no kind's `interactive_paths`, yet must be in `reading_order`.**
   §0B.36's `CONSENT_STATE` and `PAYMENT_HANDOFF` rows both require "the escape is always
   keyboard-reachable", §4.8 A-5 says so generally, and §0.25 mints exactly one `role: 'escape'`
   intent on every input-locked envelope — but K22 fixes `reading_order` as **exactly** the refs
   `interactive_paths` produces, and no kind lists the escape. The two rules cannot both hold.
   **K22's derivation is amended** to:

```ts
declare function refSet(paths: readonly string[], body: WidgetBody,
                        tier: RenderTier): InteractiveRef[];
       // Declared here under §0C.11-bis's rule, beside resolveInteractive: the ref set a
       // kind's interactive_paths produce against this body. K22's own recompute already
       // performs it; naming it gives the concatenation below a typed left operand.
       // `tier` is covered: §1.9 H1's term list gains `render.render_tier`, so a tier that
       // disagrees with the sealed reading_order breaks body_hash. The whole receipt cannot
       // be a term — R3.3.6 appends `target_classes` at delivery, after the seal — so the one
       // field the derivation reads is named, and nothing else.
       // `tier` is REQUIRED because CHART's declared path list is conditional — "and, when
       // degraded to `table`, `table_equivalent.rows[].row_key`" — and the degradation
       // outcome lives on `render: RenderReceipt`, not on `body`. §0.7 fixes EP-FIT before
       // EP-MINT, so the fitted tier is in hand when this is evaluated.

produced = refSet(KIND_REGISTRY[kind].interactive_paths, body, render.render_tier)
              .filter(r => r.k !== 'intent'
                        || emitted.some(i => i.intent_ref === r.id))
       // R1: the fitter WITHHOLDS intents (steps 1-3, 5) but never nulls the body ref that
       // names them, so a produced {k:'intent'} ref can denote an intent absent from
       // `emitted` — METRIC's drill_intent at TEXT_ONLY, FORM's discard_intent withheld at
       // step 2 or 3, CHOICE's more_intent on ANNOUNCEMENT. Unfiltered, resolveInteractive
       // is partial, nameSourceOf's totality is false, and A-3's DOM-order rule names a
       // control no renderer draws. The tier argument already puts the fitted list in scope.
reading_order = produced
              ++ [ { k: 'intent', id: i.intent_ref }
                   : i ∈ emitted, in emitted order,
                     refKey({k:'intent', id: i.intent_ref}) ∉ produced.map(refKey) ]
       // BOTH operands are InteractiveRef OBJECTS, matching §4.8's declared
       // `reading_order: InteractiveRef[]`. `++` is ORDERED concatenation, not `∪`:
       // §2 K22 requires render order and §4.8 A-3 requires DOM order to equal it, so an
       // unordered union would leave two conforming implementations free to differ.
       // The second operand is the CLOSED form — every emitted intent not already denoted by
       // a produced ref — not a role list. A role list was unsatisfiable: `role: 'more'` is
       // minted by §4.5.4 step 5 on ANY kind whenever the fitter dropped anything, while only
       // four kinds declare a `more_intent` path, so K22's set-equality failed for every
       // degraded envelope of the other eighteen. This form subsumes escape, remedy, `more`
       // and any future server-minted role by construction.
```

   **One ordering, stated once:** appended in `emitted` order, **except the escape, which is
   moved to the end of the appended segment**. On the four kinds whose `interactive_paths`
   already denote the escape — `BOOKING_CONFIRMATION` and `PAYMENT_HANDOFF` (`dismiss_intent`),
   `FORM` and `SETTINGS_DRAFT` (`discard_intent`) — **the escape is produced, not appended**, and
   its produced position governs; nothing is appended for it. The earlier wording gave two
   orderings for one list and asserted "the escape verb is in no kind's `interactive_paths`",
   which is false for exactly those four. `i.intent_ref` is the handle §0.28 fixes for a
   `{k:'intent'}` ref — never `intent_token`, which is opaque and null for a `NONE` effect.

   **`render` must be attached before this is evaluated**, and §1.1.1 said otherwise: its
   producer row gave `render` as "degradation ladder, at `EP-DELIVER`", which is *after*
   `EP-MINT`. **Amended to "at `EP-FIT`, attached to the envelope before `EP-MINT` seals"**, and
   §4.5.4 step 8 gains one sentence: the receipt is written to `envelope.render` before
   `body_hash` is computed. §0.7 already orders `EP-FIT → EP-MINT`, so this is a correction of
   the producer table, not a change to the pipeline.

   **Why this widens no authority — and why the first draft's ground was false.** It said "both
   added roles are `priority: 0` and `FLOOR_EXEMPT`". That is untrue of `remedy` on both
   conjuncts, and §0C.18 says so in terms: the L11 extension remedy is "deliberately NOT in this
   set", being a `REFINE` on the widget's **own owner capability**, which `FLOOR_EXEMPT`'s third
   clause refuses — it admits only a null capability, a `CONTROL` ref, or the single C9 row whose
   `resourceClass` is `LOCAL`, which enumeration confirms is `c9.no_action`. The true ground is
   stronger and needs no predicate: **the union ranges over `i ∈ emitted`** — intents that have
   already passed `verificationFloor`, §4.5.4's ladder and the fitter — and **`reading_order` is
   an accessibility ordering that gates nothing.** It adds no intent, waives no floor and confers
   nothing; a withheld remedy simply never enters the set.
3. **`MomentTemplate` is undeclared.** §4.9.4 PR5b is normative — "each moment template declares
   `required_cells: string[]`", and an emission is suppressed when any required `Cell` is
   non-`KNOWN` — but no shape declares a moment template. It is declared alongside EC-14's two
   registries and added to **P-32**:

```ts
interface MomentTemplate {
  moment_template_id: string;
  version: number;
  narrative_template_id: string;        // with the version below, composes the key
  narrative_template_version: number;   // REQUIRED — §1.6.5's Provenance already references a
                                        // narrative template by (id, version), and §4.2 replays
                                        // FROZEN receipts, so an id alone cannot resolve
  required_cells: string[];             // JSON Pointers into the body this moment composes
}
// R10: keyed by `${id}@${version}`, not by id alone. §1.6.5's Provenance references a
// template by (id, version) and §4.2 replays FROZEN receipts, so a single-version map cannot
// resolve the older version a stored receipt names — "the versioned catalogue" would not have
// been versioned as declared.
declare const MOMENT_TEMPLATES: Readonly<Record<`${string}@${number}`, MomentTemplate>>;

// NARRATIVE_TEMPLATES is named by §0.18, §1.6.5 P6 and §0.16 E-23 as "the versioned catalogue",
// and is declared by no shape anywhere in this contract — the same defect class §0C.11-bis
// states as a rule. Declared here, with MOMENT_TEMPLATES, and added to P-32:
interface NarrativeTemplate {
  narrative_template_id: string;
  version: number;
  locale_bodies: Readonly<Record<string, string>>;   // locale → template text
  slot_keys: readonly string[];                      // every interpolation slot the text names
}
declare const NARRATIVE_TEMPLATES: Readonly<Record<`${string}@${number}`, NarrativeTemplate>>;
```

   At `EP-REGISTRY-LOAD` every `MOMENT_REGISTRY` row resolves in `MOMENT_TEMPLATES` under the
   **composed key `` `${row.moment_template_id}@${row.moment_template_version}` ``**,
   **every `MomentTemplate` resolves in `NARRATIVE_TEMPLATES` under
   `` `${t.narrative_template_id}@${t.narrative_template_version}` ``** — the
   first draft left that requirement in a code comment only, so a moment naming a non-existent
   narrative template would have started the process — and every `required_cells` entry is a
   pointer that **`KIND_REGISTRY[row.kind]`'s leaf schema** admits, or the process does not
   start. Both members are read off the row, so EC-14's `Moment`
   declares them (§0C.28-bis); the first draft of this assertion read two members the shape did
   not carry, which would have evaluated `MOMENT_TEMPLATES[undefined]` for all twelve rows and
   stopped the process — fail-closed to the point of inertness, which §0C.20 rules a defect and
   not a safety property.

### EC-17 — `reading_order`'s membership has one typed authority, not two

**The defect, found while repairing EC-6.** Two clauses enumerate what a `reading_order` ref
may be, and they disagree. §2 K22 calls it "the union of `option_id`, `field_key`, `row_key`,
`entry_ref`, **`series_id`** and bare `intent_token`" — six names. §4.8's `InteractiveRef` is a
closed union of six **different** members: `option`, `field`, `intent`, `row`, `entry`,
**`section`**. K22 names `series_id`; the type declares `section` and has no series member. **Half of that is
a defect and half is not**, and the first draft of this ruling had it backwards: striking
`series_id` is right — §1.4 classes it **structural**, "never rendered", and no kind produces it
— but K22 "omitting `section_id`" is **not** a defect, because no kind's `interactive_paths`
produces a section ref either. `{k:'section'}` is the type's **unreachable member**, live only
if §4.8.2's REPORT row ("headings navigable") is later read as making headings tab stops, which
would require adding `sections[].section_id` to REPORT's `interactive_paths`. Until then it is a
declared-but-unproduced branch, which is harmless and is named here so nobody reads its
existence as a claim that something produces it. Verified against every kind's declared paths: **no kind's
`interactive_paths` names a `series_id`** — CHART's are `drill_intent`, `export_intent` and,
when degraded, `table_equivalent.rows[].row_key`; REPORT's are `fullscreen_intent`,
`export_intent` and `sections[].table.rows[].row_key`. `series_id` is listed in §1.4's
**structural** value class — "a value that is never rendered" — so it is not an interactive
element at all.

**The ruling.** **K22's prose enumeration is VOID as an enumeration.** `InteractiveRef`'s members — **seven** after §0C.22-sexies adds `{k:'slot'}` — are the typed
authority, and per-kind membership is what `KIND_REGISTRY[kind].interactive_paths` produces
**what `KIND_REGISTRY[kind].interactive_paths` produces, filtered so that no `{k:'intent'}` ref
names an intent absent from `emitted` (EC-21), plus every emitted intent not already denoted by
a produced ref, in `emitted` order (EC-18 item 2 as amended by EC-20 and EC-21)** — which is
what K22's *mechanism* already performs ("`validateEnvelope` recomputes the ref set from
`interactive_paths` and refuses on any difference"), over the widened set. K22's rule and
mechanism stand **as amended by EC-18**; only its illustrative list is struck, because a list
that drifts from the type it illustrates becomes a second, wrong answer. The two rulings are
read together; neither says "exactly" without the other, and that wording was the
contradiction. *Mechanism:*
K22's own recompute-and-compare. *Evaluation point:* `EP-MINT`.

### EC-16 — two stale counts, corrected rather than restated

1. **"The fourteen fundamental rules."** §0C.14's heading and §0C.32 say fourteen. The
   contract declares **FR-1 … FR-16 with FR-6 splitting into FR-6a … FR-6f — sixteen rules
   over twenty-one rows.** Both are corrected to "the sixteen fundamental rules (twenty-one
   rows)", and §0C.32 states per row whether a rule holds outright or holds **fail-closed
   because a component is absent**, as §0B.28 already does for the FR-6 family.
2. **§A5's prerequisite arithmetic.** "§A1 enumerates **22 prerequisites**: 18 `[ABSENT]`,
   2 `[PARTIAL]`, 2 `[UNENFORCEABLE-TODAY]`" sums to 22 but predates §0B.41's six rows and
   §0C.29's four, and its per-status tally no longer matches §A1. **§A5's tally is VOID as a
   restatement.** The total is **32 prerequisite rows** (§A1's 22 + §0B.41's 6 + §0C.29's 4),
   and the per-status counts are **derived from `MECHANISM_GAP_LEDGER` at build and printed
   from it**, never transcribed into prose — which is the whole reason EC-5 introduces the
   ledger. A prose count that can drift is a count that will.

---

## 0-C.11 Prerequisites registered by this section

**S0C.29.** Continuing the series, under §A2's `NORMATIVE-PENDING` rule and its fail-closed
default. All four carry `gap_key`s in the new `MECHANISM_GAP_LEDGER` of EC-5.

| # | `gap_key` | Component | Depends on it | Status | Package |
|---|---|---|---|---|---|
| **P-29** | `MG-P29` | **`MECHANISM_GAP_LEDGER`** — the mechanism-gap table of §0C.20, its `gap_key` column on §A1, and the restated §A2.4 start-up assertion | §A2.4, §A2.5, §A2.6, §A2.8 and every `NORMATIVE-PENDING` status claim in the contract | `[ABSENT]` — §A1 has no `gap_key` column today | **K1** (wave 1, with the capability gap ledger) |
| **P-30** | `MG-P30` | **The gateway's record fields and the spoken readback path** — `ReadbackAck`, the two new `confirmation` members, `IntentRecord.body_hash`, `.selection_domain`, `.c9_domain`, `.priority` and `.widget_kind` (the last two REQUIRED for Gate 5's recompute), Gate 8-R, and the per-locale closed affirmation vocabulary | §4.7 V4; §4.5.3's `SPOKEN` → `COMMIT` permission; §0.34's `SUPERSEDED` comparison | `[ABSENT]` — no carrier, no record field and no gate exists; `readback` has one unrelated occurrence repo-wide | **K3** (wave 2, with the gateway) |
| **P-31** | `MG-P31` | **`A11yBlock.accessible_names`** — the per-control map of §0C.22-bis, its mint-class-M composer, and the two totality rules over `reading_order` | §4.8 A-2 and A-5; §4.8.2's per-kind rows; every accessible-name CI check | `[ABSENT]` — `A11yBlock` declares no accessible name of any kind, and is one block per envelope | **K2** (the shape) + **K5** (the composer, wave 2) |
| **P-32** | `MG-P32` | **`MOMENT_REGISTRY`, `NOTIFICATION_CONSENT_REGISTRY`, `MOMENT_TEMPLATES`, `NARRATIVE_TEMPLATES` and `ProactiveProvenance.notify_pref_key`** — the closed twelve-row moment catalogue, the delivery-permission table it resolves into, the moment templates PR5b's `required_cells` suppression reads, and the delivery-time consent read | §4.9.3 PR3c; §4.9.2 PR2 (b); the twelve-row totality of `MOMENT_REGISTRY` (§0C.28-bis EC-14) | `[ABSENT]` — neither the member nor the registry is named anywhere else in the contract | **K13** (wave 5) |

**S0C.30 — the existing twenty-eight rows are unchanged**, and each now carries
`MG-P01` … `MG-P28`; with §0C.29's four the ledger is total over **thirty-two** rows. No row's status changes in this section: EC-1 … EC-10 repair what the
contract *says*, not what is *built*, and every repaired rule remains `NORMATIVE-PENDING` on
the components Annex A and §0B.41 already registered as `[ABSENT]`.

---

## 0-C.12 What remains explicitly non-normative

**S0C.31.** These statements are true, are retained because they are informative, and are
**marked non-normative**: no implementation is bound by them and no gate reads them.

1. **§0B.23 / §0C.6's repository observations** — the ungated second door
   `communication.bulk-campaign.execute.v1`, the 164-of-221 permissive role default,
   `permissionCodes` validated but never evaluated, `riskFacets` as an open vocabulary,
   `decideApproval` not comparing approver to initiator, and `crm.visit.payment.v1` being
   `DENY`. Each is a finding about the running system and **none is a widget-contract rule**.
   Owner action on them belongs outside this contract.
2. **§0.35's "honest strength" paragraph** — that the Action Engine's independent fence is
   shape, source-type and durable attribution rather than a second authorisation. It
   describes a mechanism; it does not impose one.
3. **Every `[NON-NORMATIVE]` paragraph already marked as such in §§1–4**, including §4.1.3's
   WCAG 2.2.1 repair note and §4.2's rehydration rationale.

---

## 0-C.13 Errata — what this section voids

| # | Where | What it says | Ruling |
|---|---|---|---|
| **EC-1** | §0B.21 | `crm.appointment.{attendance,duration,services,fields}.v1` allowlisted with `confirmation_kind: 'BOOKING_CONFIRMATION'` | **VOID as allowlist rows.** No propose key exists in any space and none may be inferred (§0B.12) or added (FR-16). → `AE_CAPABILITY_GAP_LEDGER` under **`GAP-APPOINTMENT-DETAIL-COMMIT`**. Allowlisted `BOOKING_CONFIRMATION` membership becomes **3**. §0C.5 |
| **EC-2** | §0B.31 `c9Floor` | `aiToolRegistry.get(key)?.riskTier ?? 'restricted'` on the C9 branch, glossed "valid: 47 of the 56 resolve" | **VOID.** `AiToolRegistryService.get()` throws rather than returning a nullable, so the branch raises for nine keys and `verificationFloor` is not total. Replaced by a branch over `mode`, `resourceClass` and a pure catalogue lookup, with a no-lowering build assertion. §0C.10 |
| **EC-3** | §0.34 guard; §0B.13(3) | a non-`draft` `COMMIT` is mintable only against a consumed **`REFINE`/`DRAFT`** record whose capability equals the propose key | **Amended to a two-row table.** `'record'` → `REFINE`/`DRAFT`, compared to the row's **C9 `propose`** side. `'approval'` → `REQUEST_APPROVAL`, compared to the row's **AE `ae`** side — because §0.32/§0B.7 put a `REQUEST_APPROVAL`'s ref in AE and the propose side in C9, and the two spaces are disjoint. §0C.13, §0C.13-bis |
| **EC-3b** | §0B.13(2) | the `propose: null` + `confirmation_kind: 'APPROVAL'` escape | **VOID.** Unnecessary after EC-3 and unsatisfiable with §0B.13(3). Every allowlisted key must be the `ae` side of exactly one pairing row. §0C.13 |
| **EC-4** | §4.5.4 step 1; §0.13 `verificationFloor`; §2.6.15 SOURCE.3 | withhold **every** intent below the floor, before step 4's PIN; `reconnect_intent` undroppable in prose only | **Amended.** A **derived**, build-vetoed, non-actuating `FLOOR_EXEMPT` set — keyed on `priority === 0` plus three exclusion clauses, never on a list of names — waives `EFFECT_FLOOR`, `KIND_FLOOR` and `targetFloor` — and, **for a class-`s` `HANDOFF` only**, the destination subject term, which alone floors at `ANONYMOUS`. **Every other exempt intent keeps `subjectFloor(subjectCapability(i))`**, so `control.run.cancel` retains `CONTROL_FLOOR: BOUND_CLIENT` even at `priority: 0`, and `SENSITIVE_DEST` excludes consent and identity destinations outright. Five intents satisfy it. SOURCE.3 gains `priority: 0`. Steps 2, 3, 5, 6 still apply. §0C.17, §0C.17-bis, §0C.17-ter, §0C.17-quater |
| **EC-5** | §A2.4 | "every `[ABSENT]` mechanism named in §A1 is bound to its gap key" | **Amended.** §A1 has no such column and the capability ledger holds a different kind of gap. A separate `MECHANISM_GAP_LEDGER` (`MG-P01` … `MG-P32`, total over all thirty-two prerequisite rows) is introduced and the assertion restated over it. §0C.20 |
| **EC-6** | §4.8 A-2; §4.8 `A11yBlock` | "Accessible name = `intent.utterance`, verbatim" | **VOID.** `WidgetIntent` declares no `utterance`. Replaced: `intent.label` + the §4.8.2 row's composition, `intent.label` alone otherwise; §4.8.2 is the sole per-kind owner. `A11yBlock` gains `accessible_names: Record<InteractiveRefKey, string>` keyed through the declared total injective `refKey(ref)` (mint class M, inside `body_hash`), because the block is one per envelope and declared no name at all; and the name source is `nameSourceOf(ref, env)`, total over `InteractiveRef`'s **seven** members, because only `{k:'intent'}` denotes a `WidgetIntent`, a FORM's field refs have labels of their own, and `STRATEGY_OPTIONS.alternatives[]` declares `title` rather than `label`. §0C.22, §0C.22-bis, §0C.22-ter, §0C.22-quater, §0C.22-quinquies, §0C.22-sexies, §0C.22-septies |
| **EC-7** | §0B.25 / §0B.16 | FR-6e's tenant-object half, asserted with no mechanism of its own | **Amended.** §0B.16 gains `row ⟹ TENANT_AUTHORITY(cap) ⟹ fail`. FR-6e held before and holds after; it is now a checked assertion. §0C.23 |
| **EC-8** | §2.6.5 BOOK.1, 2nd sentence | "ACTION ENGINE INGRESS independently re-derives the subject … and refuses" | **VOID**, on §0.35's ground for K11 and BOOK.2: `TrustedActionExecutionRequestV1` carries no widget field and passing one would breach FR-1/FR-2/E3. BOOK.1's mint-time half stands. §0C.24 |
| **EC-9** | §4.7 V4; §3.7 `IntentRecord` | "the gateway refuses a `COMMIT` from a `SPOKEN` profile with no readback confirmation reference" | **Retained and made constructible.** `requires_readback` already exists on `ConfirmationRequirement`; §4.7's `requires.…` is a wrong container, corrected to `confirmation.…`. Added: `readback_ref` + `readback_text`, `ReadbackAck` on §3.8, `IntentRecord.body_hash` + `.selection_domain`, and **Gate 8-R keyed on `record.confirmation?.requires_readback`** — never on the submission's `profile_id`, which R3.8.3 declares advisory and not an authority input. §0C.26, §0C.26-bis, §0C.26-ter |
| **EC-10** | §4.9.2 PR2 (a) | "the capability registry marks run-opening capabilities" | **VOID** — it requires a `C9Capability` field, changing `C9_REGISTRY_HASH`, which §0.3 and FR-16 forbid. Replaced by `RUN_OPENING(ref)` over the existing `mode` member (15 of 56), read through the one declared accessor `c9Registry.tryGet` with a fail-closed `?? 'PROPOSE_ONLY'` default. Mechanism (b) stands. §0C.28 |
| **EC-11** | §0B.18 Gate 6, `C9` branch | one `assertCanExecute` call for the whole C9 space | **Amended.** Nine of the 56 C9-CAP keys are not catalogue names, so no `AiToolDefinition` exists for them. Gate 6 gains a second C9 branch — the `WIDGET_CAPABILITY_POLICY` row plus `c9Capability`'s own admission. Here a throwing accessor is correct: Gate 6 is a refusal point. `c9Capability`'s required `C9Domain` argument had no carrier, so `IntentRecord.c9_domain` is declared. §0C.28-bis, §0C.28-ter |
| **EC-12** | §2.2 K2 closing ¶; §2.6.17 FORM.2 | "a fourth evaluation happens at INGRESS … the ACTION ENGINE INGRESS re-derives the kind rule from `IntentRecord.widget_kind`" | **VOID**, on §0.35's ground for K11/BOOK.2 and §0C.24's for BOOK.1. `widget_kind`/`widgetKind` have 0 occurrences under `src/action-engine`, and passing one would breach FR-1/FR-2/E3. §0C.28-bis |
| **EC-13** | §2 K13; `KIND_REGISTRY.max_commit_intents` | typed `0 \| 1`, fixed at `1` for the four confirmation kinds | **Amended to `0 \| 1 \| 2`**, with `2` admissible for `APPROVAL` alone under a build veto, and the pair constrained to one `approval_ref`, one AE key and single-use across the pair. Without this an APPROVAL body could not mint both decisions, which §0.47 requires. §0C.28-bis |
| **EC-14** | §4.9.3 PR3c | "`notify_pref_key` must resolve in the notification-consent registry" | **Retained and made constructible.** Neither the member nor the registry existed. `ProactiveProvenance.notify_pref_key` (mint class D) and the closed twelve-row `MOMENT_REGISTRY` are declared, with a start-up assertion that every row's key resolves. §0C.28-bis |
| **EC-15** | §3.7 `IntentRecord` | `body_hash` and `selection_domain` read by Gate 8-R and by the `SUPERSEDED` comparison | **Declared.** Both added, mint class D, `AUDIT_RETAINED`, in **P-30**'s component list. §0C.26-ter, §0C.28-bis |
| **EC-16** | §0C.14 heading, §0C.32; §A5 | "the fourteen fundamental rules"; "§A1 enumerates 22 prerequisites: 18/2/2" | **Corrected.** Sixteen rules over twenty-one rows, each stated as holding outright or holding fail-closed. §A5's tally is **VOID as a restatement**: 32 prerequisite rows, per-status counts derived from `MECHANISM_GAP_LEDGER` at build, never transcribed. §0C.28-bis |
| **EC-21** | §0C.17's two floor predicates; §0.13's input list; §0C.28-sexies's `produced`, ordering and `render` timing; §0C.22-quinquies's suffix value; §0C.22-ter's `resolveInteractive`; §0C.18's bound; EC-14's catalogues; Gate 6's HANDOFF branch; EC-17's citation | sixteen residuals the EC-20 confirmation raised, all adjudicated CONFIRMED | **Amended.** `FLOOR_EXEMPT`/`verificationFloor` re-declared over a structural `FloorSubject`, without which Gate 5 still could not recompute them from an `IntentRecord` — the defect EC-19 added `priority` for and EC-20 left one call deeper. §0.13's closed input list names `priority` as its fifth input. `produced` is filtered against `emitted`, because the fitter withholds intents without nulling the body refs that name them. One ordering, with the four kinds whose paths already denote the escape called out. §1.1.1's `render` row moves to `EP-FIT`, since a tier read at `EP-MINT` must exist by then. The suffix gains an explicit `base` and a declared `renderSuffix`; its default is an empty list, not `''`. `resolveInteractive` is indexed by ref kind. §0C.18's bound is stated as three grounds, only one of which is the veto. Both template catalogues are keyed `id@version`, so a frozen receipt's older version resolves. **Gate 6 is scoped by effect: a `HANDOFF`'s subject resolves destination fences only, never an execute-admission test.** §0C.17-quinquies, §0C.22-undecies, §0C.28-quinquies |
| **EC-20** | §0C.28-sexies's derivation; §0C.22-quinquies's value type; §3.7; §0C.28-quater; §0B.18; §1.1.4; §0C.18; §0C.11-ter; EC-14's `MomentTemplate` | twenty-one residuals the bounded verification of EC-19 raised | **Amended.** The `reading_order` second operand becomes the **closed** form — every emitted intent not already denoted — because a role list left `role: 'more'` unsatisfiable on eighteen kinds; the operator becomes ordered concatenation, since `∪` left `remedy` unpositioned against K22's render-order rule. `refSet` takes the fitted tier, because CHART's path list is conditional on degradation, which lives on `render`, not `body`. `accessible_name_suffix`'s VALUE becomes `readonly string[]` of pointers — a string would have concatenated `audience_size` literally. APPROVAL.4 and ARTIFACT.3 assign the roles the per-control scoping needs. `IntentRecord` gains `widget_kind` and its `handoff_capability_ref` is retyped, without which Gate 5 still could not recompute; `subjectCapability` is re-declared over a structural subject both shapes satisfy. §0C.28-quater's refusal is re-keyed on `subjectCapability` — a run-bearing `HANDOFF` escaped it. `NARRATIVE_TEMPLATES` declared. §0C.18's "exactly five" gains a build veto. §0C.22-octies, §0C.22-nonies, §0C.28-septies |
| **EC-19** | §3.1 `AuthorityHint`; §3.7 `IntentRecord`; §0C.28-bis EC-14's `Moment`; §0C.22-quinquies's suffix key; §0C.28-bis Gate 6 call site; §0C.28-quater; §0C.32's EC-2 row; EC-17 vs EC-18 | eight defects the final pass confirmed | **Declared / amended.** `AuthorityHint` declared with a closed non-authority member set (§0C.11-ter). `IntentRecord` gains `priority`, without which Gate 5 cannot recompute `FLOOR_EXEMPT` and every exempt intent would diverge under §0.16. `Moment` gains `kind` and `moment_template_id`, which EC-18(3)'s assertion reads. The suffix keys on `${ref kind}:${role}` so APPROVAL's suffix reaches the approve control alone. Gate 6's call site binds `ref = subjectCapability(record)` — the dispatch was repaired in round 10 and the call two lines below was not, leaving it inert for `HANDOFF`. §0C.28-quater names minter 3. §0C.32's EC-2 row is scoped per path. EC-17 reads "as amended by EC-18". §0C.11-ter, §0C.28-sexies |
| **EC-18** | §2.6.13 PROGRESS; §2 K22's derivation; §4.9.4 PR5b | `steps[].unknown.next_intent_ref` as a live path; `reading_order` = exactly `interactive_paths`; "each moment template declares `required_cells`" | **Amended / declared.** §0.19 deleted `steps[].unknown`, so PROGRESS's path becomes `steps[].state.next_intent_ref`. K22's derivation appends **every emitted intent not already denoted by a produced ref** — the closed form, because a role list left `role: 'more'` unsatisfiable on eighteen kinds — in `emitted` order with the escape last. No authority widens: the operand ranges over intents that already passed the floor and the ladder, and `reading_order` is an accessibility ordering that gates nothing. (The first draft justified this by "both are `priority: 0` and `FLOOR_EXEMPT`", which is false for `remedy` and contradicted §0C.18.) `MomentTemplate` + `MOMENT_TEMPLATES` are declared. §0C.28-sexies |
| **EC-17** | §2 K22, its enumeration | "the union of `option_id`, `field_key`, `row_key`, `entry_ref`, `series_id` and bare `intent_token`" | **VOID as an enumeration.** It names `series_id` — which §1.4 classes **structural**, "never rendered", and which no kind's `interactive_paths` produces — and omits `section_id`. `InteractiveRef`'s **seven** members are the typed authority — the seventh, `{k:'slot'}`, added by §0C.22-sexies because `TIME_SLOT_SELECTOR`'s declared path `groups[].slots[].slot_ref` could be denoted by none of the six; K22's rule and mechanism stand **as amended by EC-18 item 2 and EC-20** (every emitted intent not already denoted by a produced ref joins the list, in `emitted` order). §0C.28-bis, §0C.22-sexies |

---

## 0-C.14 The sixteen fundamental rules after this section

**S0C.32 — what this section does and does not claim, stated so that no sentence of it is
larger than its proof.** The contract declares **sixteen** fundamental rules, FR-1 … FR-16,
with FR-6 splitting into FR-6a … FR-6f — **twenty-one rows**. All twenty-one hold. Many hold
**fail-closed because a component is absent**, and that is said here rather than hidden: a
rule that holds because no allowlist exists yet is a rule that holds, but it is not a running
fence, and §0B.28 already draws that line for the FR-6 family.

**The blanket sentence this section used to carry was false, and it is withdrawn.** It read:
"No repair lowers a floor, admits a capability, widens an allowlist, or relaxes a veto." The
first three conjuncts are true and provable. The fourth is not: **two repairs lower a floor,
and both do so deliberately.** Replacing it:

> **No repair admits a capability, widens an allowlist, or relaxes a veto.** Every repair
> either removes rows from an allowlist (EC-1), adds a veto (EC-7, EC-13), voids an
> unbuildable claim (EC-8, EC-10, EC-12), declares a carrier that was missing (EC-6, EC-9,
> EC-14, EC-15), or corrects an identity or a count (EC-3, EC-5, EC-11, EC-16).
>
> **Two repairs lower a floor, deliberately, and each names its compensating fence:**
>
> | Repair | What it lowers | Why, and what still holds |
> |---|---|---|
> | **EC-2** | nine C9-CAP keys, from a raise (literal reading) or `STEP_UP_VERIFIED` (charitable reading) to: **three** `SOURCE_HANDOFF` keys (`b35.preview`, `b35.confirm`, `a22.configuration`) → `SESSION_VERIFIED`; **five** `SOURCE_READ` keys (`c7.measurement.read`, `c8.result.read`, `b35.status`, `owner_report.status`, `owner_report.download`) → whatever their own `WIDGET_CAPABILITY_POLICY` row and consent class require, per §0C.11(4); and `c9.no_action` → `ANONYMOUS` | `STEP_UP_VERIFIED` is **unreachable** while P-12 is `[ABSENT]`, so the prior value was not a fence but a permanent withholding that made five widget kinds unemittable. What still fences these nine: their `WIDGET_CAPABILITY_POLICY` row and `CONSENT_CLASS_FLOOR`, carried through `c9Floor` at Gate 5 on **every** path — and, **on the run-bearing path only AND only where the intent is not a `HANDOFF`**, Gate 6's second C9 branch with `c9Capability`'s own admission. EC-21 scopes Gate 6 by effect, so for a `HANDOFF` subject that admission is not applied on **any** path — which is the case for `b35.preview`, `b35.confirm` and `a22.configuration`, whose `resourceClass` is `SOURCE_HANDOFF`. Their whole fence is therefore `c9Floor`'s `C9_MODE_FLOOR`/`C9_RESOURCE_FLOOR` of `SESSION_VERIFIED` at Gate 5, plus `SENSITIVE_DEST` and `targetFloor('s')`. §0C.28-quater withdraws that admission on the two run-less mint paths, where `c9_domain` is null by construction, so for a capability read of `c7.measurement.read`, `c8.result.read`, `b35.status`, `owner_report.status` or `owner_report.download` the residual fence is the policy row and the consent class alone. Stated rather than implied, because an unqualified claim here would be exactly the over-read this table exists to prevent. The bulk-send path additionally keeps `AE_FAMILY_FLOOR['marketing_fanout'] = STEP_UP_VERIFIED` and `communication.bulk-campaign.admit.v2`'s owner-only, approval-bound AE fence, which is `[EXISTS]` and running today |
> | **EC-4** | five intents: `EFFECT_FLOOR`, `KIND_FLOOR` and `targetFloor` waived for all five; `subjectFloor` waived for the **two class-`s` HANDOFFs only**, which floor at `ANONYMOUS`. The escape verb, `discard_intent` and the no-action option keep their own `subjectFloor` (§0C.17-ter) | The set is derived, not listed, and its build veto makes an actuating intent unconstructible: `COMMIT`/`DRAFT` excluded by effect; `REQUEST_APPROVAL` and `REFINE` excluded over AE and C9 respectively by the capability clause, which admits only a `CONTROL` ref or the unique `resourceClass: 'LOCAL'` C9 row. The residual is `targetFloor('s')` on a handoff, and it is tolerable for a stated reason, not by assumption: a `HANDOFF` never invokes its destination capability (R3.5.3), and §0.31's routes re-check the principal proof at `EP-FETCH`. Declining, discarding and asking for the route to a surface that authenticates are not the exercise of authority |
>
> A reader auditing this contract should be able to find every floor reduction it makes by
> reading this table. There are two.
>
> **One repair removes a floor *raise* this section's own first draft had introduced**, and it
> is recorded here for symmetry: EC-2 first set `C9_RESOURCE_FLOOR['SOURCE_READ']` to
> `SESSION_VERIFIED`, raising the floor of 40 of the 56 C9-CAP keys and breaking the
> `ANONYMOUS_CHAT` and `PUBLIC_READ` tiers §0.13 had explicitly protected. It now returns
> `ANONYMOUS` and a read's floor is once again its own policy row plus Gate 6 (§0C.11(4)).
> An unasked-for raise is a defect too: it withholds capability while looking like caution.

**S0C.33 — what remains open after this section, named rather than implied.** Every repair
above changes what the contract *says*. **None of it is built.** Thirty-two prerequisite rows
stand at `[ABSENT]`, `[PARTIAL]` or `[UNENFORCEABLE-TODAY]`, the widget layer does not exist,
and every rule this section repairs is `NORMATIVE-PENDING` on the rows §A1, §0B.41 and §0C.29
register. The correct reading of this contract today is: **the rules are now implementable
and their mechanisms are named; the mechanisms are not running.** That distinction is the
one this whole certification arc exists to preserve.
