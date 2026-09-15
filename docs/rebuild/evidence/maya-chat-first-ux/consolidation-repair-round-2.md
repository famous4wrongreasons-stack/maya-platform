# Consolidation repair — round 2

`[EVIDENCE]` The dependency-closure verification of the round-1 repair, and the 29 repairs
applied in response. Again: **no errata layer.** Every change is an edit to the rule itself.

## The finding

Three lenses read the repaired body and the repair record. All three: **`CERTIFIABLE: NO`**, and
all three said the same thing first — *the substance is right, the closure is not*.

> "No repair traded a wrong rule for a differently wrong one." — the exit lens
> "Every repair I could check at the site it was made says the right thing." — the closure lens

Filed: **11 incorrect-repair, 16 unclosed-dependent, 11 new-defect** (overlapping across lenses).
**Security-contract violations: 0** — the class that dominated round 1 is gone.

Everything on the must-hold list held, on all three lenses independently: exactly two floor
reductions both in §0.17; `CLIENT.2` and `ARTIFACT.3` intact and unrenumbered and **not**
superseded by `CLIENT.3`/`ARTIFACT.5`; Gate 5 recomputable; Gate 6 dispatching on
`subjectCapability`, scoped by effect; **no precedence chain**; **no erratum cited in normative
text**. Every registry cardinality re-verified by execution: 226 / 221 / 47 / 56, and every
derived figure the repairs rest on — 13 booking rows of which 7 `ALLOW`, `MONEY` 92/39 against
12/4 for the bare `'financial'` token, `ALLOW ∧ authenticated_request` = 105, F72's deleted chain
at **118** overall and **94** of the 105 widget-reachable.

## What the round got wrong, and what that says

**The round-1 repair record over-claimed in one specific place, and the lenses caught it.**
Block E said *"Every one is repaired against the consolidated map. Normative text now cites zero
errata and zero unresolvable sections."* The errata half was true and verified. The
wrong-subsection half was **false**: fifteen pointers still named a section that exists but does
not carry the rule — including, twice, the exact `§0.4` → `§0.8` error the record itself had
just named as the failure mode. **F6's link test passes all fifteen, because each target section
exists.** A link test that checks resolvability cannot check correctness, and the record should
have said so instead of claiming closure.

## What was repaired

### A — fifteen citations that resolve, and resolve to the wrong rule

| was | is |
|---|---|
| §1.0 "the eleven closed points of **§0.2**" | §0.3 F7 — §0.2 is the section map |
| §1.1.1 E3, §1.8 K8 "the forbidden-key list of **§0.14**" | §0.15 F88 — §0.14 is `SETTINGS_DRAFT` and the finance fence |
| §1.8 K8 "`verificationFloor(subject, kind)` declared in **§0.4**" | §0.8 F43 |
| §3.4 R3.4.8 "`C9_FLOOR_BASELINE` … declared in **§0.4**" | §0.8 F51 |
| §1.1.1's root table: `origin`, `authority`, `presentation` → **§0.3** | §0.5 F17 |
| §A1.1 P-06 "**§0.14 F79's** field-kind rule" | §3.6.6 R3.6.6 — F79 declares owner classes and `DraftClass`, and carries no field-kind rule |

### B — dependents the round-1 repair did not close

| repaired rule | dependent that still carried the old form |
|---|---|
| F72 has no default branch | **§2.6.17 FORM.2** still returned `next_envelope = SETTINGS_DRAFT` with booking and payment as exceptions — **the deleted chain, inverted into prose**, on the clause the `FORM → draft → confirmation` path actually reads. Now: the kind the allowlist row names, and **no confirmation body at all** without a row. |
| the same | **§2.6.16 SETTINGS.1**'s mechanism cited "BOOK.2's derivation", which BOOK.2 now explicitly disclaims |
| the same | **§3.9 Gate 7** listed no confirmation-kind check, although F72 names Gate 7 as its second evaluation point. Gate 7 now re-reads `requiredConfirmationKind` from the live allowlist, so a row withdrawn between mint and submission refuses. |
| R39 narrowed the `capability: string` source test | it was applied to **§3.2 R3.2.2**, the non-owning copy. **§0.6 F21** — which §0.2 makes the owner — still carried the wide form, which is unpassable against `WidgetComposerInput.capability: string`. F21 now carries the narrow form, and §A1.7 P-24 with it. |
| the same F21 | F21 listed `requiredConfirmationKind` among the functions whose arguments are `CapabilityRef`, while F72 declared `(aeKey: string)`. **F72 now takes a `CapabilityRef` with a fail-closed space guard** — not a new fence, an explicit statement of a precondition Gate 6's dispatch already guarantees. |
| F15's erasure-reachability test | **§3.7 R3.7.2** stated its own version with a **different gate set**, adding Gate 8-R — whose mandated read is `readback_ack.affirmation`, classified `CONVERSATION_CONTENT`, so that version **could never pass**. R3.7.2 now cites F15. |
| §A1.7's ten new rows | **§A5** still said "§A1 enumerates P-01 … P-22"; §A1.7's own opening said "F93 names them" when F93 names thirteen |
| A1.6.2 marked NORMATIVE | **§A0.1** said the annex "adds no rule", while §A5 said A1.6.2 is where it adds one. A0.1 now **names both** rules the annex adds — A1.6.2 and A2.8's `NORMATIVE-PENDING` marking — so the claim is checkable rather than merely modest. |

### C — five more duplicates, and the one that mattered

**§3.8 R3.8.2 carried its own forbidden-key list: fifteen keys against §0.15 F88's twenty-eight,
and one evaluation point against three.** A submission carrying `url`, `endpoint`,
`checkout_url`, `return_url`, `provider_ref`, `bridge_method` or `required_verification` passed
R3.8.2 and failed F88. That is what a list maintained in two places does, and it is the second
time in this contract that the two copies of a fence disagreed about what the fence forbids.
R3.8.2 now cites F88.

Also collapsed: the escape-verb rule, restated in full in the **§2.6 preamble** and partially in
**BOOK.5** (both now cite §0.9 F60); **§3.15** INV-28/INV-29, which restated F49's and F51's
assertions — §3.15 now declares itself `[NON-NORMATIVE — INDEX]`, because a summary that drifts
from its source is a summary and never a second rule.

### D — identifiers a normative clause named and no shape declared

`BOOKING_SUBJECT_CAPABILITY` (§2.6.5 BOOK.1) is **not declared, and must not be**: a second
subject→key table would be a second allowlist, and `row XOR gap` is total over AE-CAP precisely
so that none exists. BOOK.1 now names `AE_WIDGET_COMMIT_ALLOWLIST`'s three booking rows.
`LIMITATION_REASON_TABLE` (§1.6.7 P9) **is** a real artefact and is now declared, beside the
`Limitation` shape §0.2 gives §1.

### E — three corrections to claims this contract makes about itself

- **§0.17 F91** said `SENSITIVE_DEST` "is evaluated in exactly one place". It is evaluated in
  three — `FLOOR_EXEMPT`'s fourth clause, INV-8′, and Gate 6. The reduction's argument only
  needs the *first*, so the sentence now says what it means: within `verificationFloor`, and
  there only, it and the two floors are alternatives rather than a conjunction.
- **§0.2 F6a**'s ownership clause was unsatisfiable, because §0.2's "Owns" column is a partial
  list of the artefacts whose home is contested, not a census. F6a now binds the ownership half
  only to identifiers the column actually names.
- **§2.3.2** justified its citation by "§0.2's map gives all three to §1" while §0.2's §1 cell
  named neither `NarrativeTemplate` nor `NARRATIVE_TEMPLATES`. They are now named there.

## Result

6,121 → 6,143 lines. `consolidated-mechanical-audit.mjs`: **29/29**.

**Round 1 found rules that contradicted each other. Round 2 found citations that pointed at the
wrong rule.** The severity is falling and the class is narrowing, which is what convergence looks
like — but the bar is 0/0/0 and it is not met yet. A third pass is warranted, and it should be
read as the last one only if it comes back clean.
