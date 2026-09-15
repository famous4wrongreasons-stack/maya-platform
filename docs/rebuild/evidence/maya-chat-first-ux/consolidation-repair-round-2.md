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

---

## Correction to this record — six repairs it claimed and did not make

**Section A above listed six citation repairs that were not in the file when this record was
committed.** The repair script that carried V1–V6 aborted on an assertion failure at V7 — the
correct behaviour, since V7's target text had changed — but it aborted **before** the write, so
the five edits it had already reported `ok` were discarded with it. The follow-up script re-ran
V7 onward and not V1–V6. The record was written from the script's console output rather than
from the file, and so recorded work that did not land.

This was caught by writing the check as a script rather than by re-reading:
`citation-target-check.mjs` resolves every `§N.M <token>` citation in normative text against the
text of the cited section, and reported the survivors. The six are now applied, and the checker
found **two more** that no lens had named:

| # | was | is |
|---|---|---|
| V5 | §A1.1 P-06 cited `§3.6.6 R3.6.6` | **§3.6** — there is no §3.6.6 subsection; R3.6.6 is a clause of §3.6 |
| V5 | §A1.1 P-06 cited `§2.6.15 FORM.7` | **§2.6.17** — §2.6.15 is `SOURCE_STATUS`; `FORM` is §2.6.17 |
| V14b/c | FORM.2 still carried `as BOOK.2's derivation fixes` and the parenthetical *"(or `BOOKING_CONFIRMATION` for a booking-class capability, or `PAYMENT_HANDOFF` for a payment-class one)"* | the kind is read from the allowlist row and **never inferred from the capability's class** — the parenthetical was the deleted chain surviving as prose |

`citation-target-check.mjs` now reports **0 problems**, and it is committed so this class is
checked by running it rather than by claiming it.

**The lesson is the one this whole cycle keeps teaching.** Every claim in a repair record should
be produced by reading the artefact, not by reading the tool output that was supposed to change
it — and the way to make that cheap is to write the check as a program. Three of the four
duplicates in round 1b, all fifteen wrong-section citations in round 2, and these eight, were
found by scripts and not by reading.

## Round 2b — three found by checks written while round 3 ran

Two more checkers were written and run against the repaired body while the third verification
pass was in flight. Both are committed.

| # | check | finding |
|---|---|---|
| W1 | `declared-identifier-check.mjs` — every `SCREAMING_SNAKE` identifier a normative clause names must appear in some declaration | **`OwnerClass` and `ownerClassKeys` were declared by nothing.** `KindRule.owner_class` is typed `OwnerClass`, and K20's `emittable(kind) = ownerClassKeys(kind) ∩ capabilityRegistry ≠ ∅` — **the derivation that decides whether a kind may be emitted at all** — reads `ownerClassKeys`. Both are now declared in §2.4, the owner class as a closed twenty-five-member union over the values §2.4's own registry column uses and §0.14 F79's six draft owners, and `ownerClassKeys` as a total function whose `'NONE'` and `'INHERITED'` branches are the empty set and the intent's own capability rather than partial cases. |
| W2 | the same run | **the shortfall branch table stated twice** — §0.8 F53 in prose and §3.4 R3.4.5 as a table. §3.4 keeps it, because §0.2's map gives the gate pipeline to §3; F53 keeps the half that is a property of the floor (withheld at `EP-FIT` step 1, reachable via an emitted `HANDOFF`) and cites R3.4.5 for the branch. |
| — | `per-kind-totality-check.mjs` — every per-kind table total over the 22 kinds | **both tables total, 22/22.** No finding. |

The other 27 identifiers the first checker flagged were triaged and are all legitimate:
repository values (`APPROVER_ROLES`, `TENANT_ACTION_ROLES`, `PACKAGE5_WAVE3_REGISTRATIONS`,
`VK_TOKEN`), terms cited only as **deleted** (`FAILURE`, `RETRY`, `NON_INTERACTIVE`), and
identifiers declared in a markdown table rather than a fenced block (`CONTROL_REGISTRY`,
`T_AUDIT`, `T_TIMELINE`, `HANDOFF_REQUIRED`, `NEEDS_SECOND_CHANNEL`).
