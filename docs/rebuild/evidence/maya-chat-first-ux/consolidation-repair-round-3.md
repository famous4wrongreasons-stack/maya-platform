# Consolidation repair — round 3

`[EVIDENCE]` The last bounded verification pass, and the 22 repairs applied in response.
No errata layer. Every change is an edit to the rule itself.

## The finding

**12 structural · 0 security-contract · 0 unproven · fundamental rules HOLD.**

All three lenses returned `CERTIFIABLE: NO` and all three said the same thing about it:

> "but narrowly, and for the second round running with zero security-contract violations. Two
> structural findings, both editorial in consequence, neither touching authority."
> "by a hair, and not on substance … none touches the authority spine, and each is a one-line fix."
> "narrowly, and for a different reason than either prior round."

Everything on the must-hold list held, on all three lenses independently and by execution:

| held | evidence |
|---|---|
| exactly **two** floor reductions, both in §0.17 | 3/3 lenses |
| §2.6.7 `CLIENT.2` and §2.6.22 `ARTIFACT.3` intact, unrenumbered, not superseded | 3/3 |
| Gate 5 recomputes `verificationFloor` from an `IntentRecord` | 3/3 |
| Gate 6 dispatches on `subjectCapability`, scoped by effect | 3/3 |
| **Gate 7 re-reads `requiredConfirmationKind` from the live allowlist** | 3/3 — round 2's repair verified |
| no precedence chain anywhere, Annex A included | 3/3 |
| no erratum cited in normative text | 3/3 |
| **FR-1 … FR-16 over 21 rows: all hold** | 3/3 |
| registry cardinalities, by execution | 226 / 221 / 47 / 56 — exact, plus `ALLOW` 129 / `SHADOW_ONLY` 95 / `DENY` 2, and 221 = 226 minus exactly the five `kernel.test.*` synthetics |

**Thirteen of the twenty-one fundamental rules hold *only fail-closed*, because a component is
absent.** That is stated, not hidden: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6b, FR-6d, FR-7, FR-9,
FR-10, FR-11, FR-12, FR-13, FR-14, FR-15. A rule that holds because no gateway exists yet is a
rule that holds — but it is not a running fence, and the difference is the whole of what §A2's
`NORMATIVE-PENDING` machinery exists to record.

## The new class

Round 1 found rules contradicting each other. Round 2 found citations resolving to the wrong
section. **Round 3 found the two forms neither F6's link test nor `citation-target-check.mjs`
can see:** a citation that names a rule *without* a section qualifier, and a citation that quotes
one rule's content under a sibling's name.

| was | is |
|---|---|
| §4.1.2 L8, §4.6 NT5, §4.7 V11 — "the **M1** anti-error lint over `Cell.label`" | **§1.3 C4**. M1 (§1.4) is *"money is integer minor units or a decimal string, never a float"* and carries no lint. |
| §A2.3 — labels §1.3 C5 as "`M2`" | "the remedy-or-gap rule". M2 is *"`basis` is minted from a canonical key"*. |
| §A1.1 P-04 — attributes `TerminalLine.outcome === 'CONFIRMED' ⟺ action_receipt_ref !== null` to §4.3 **DR3** | **§4.2 FR2**, invoked by §4.3 DR2. DR3 is cross-channel dedupe and carries no such formula. |
| §3.3 R3.3.3, §3.9 Gate 6 — "`SENSITIVE_DEST` (§3.4)" | **§0.8 F48** — §3.4 disclaims carrying it *in terms* |
| §3.5 R3.5.3 — "the floor derivation of §3.4" | **§0.8 F43** |
| §3.1 — "term of `FLOOR_EXEMPT` (§3.4)", "server decision (§3.14, FR-3)" | **§0.8 F48**, **§0.16 F89** |
| §1.2 V1 — "**§7's** `renderTextEquivalent`" | **§1.9 H2**. §0.2 F6 fixes five sections and no others; there is no §7. |
| §1.1.1's three root-member code comments — "declared in §0.3" | **§0.5 F17**. §0.3 is the evaluation points. Round 2 fixed the field table and not the code block twenty lines above it. |

## Three that were more than citation hygiene

**`risk_tier` was a bare user-visible scalar in two body shapes.** §2.6.11's
`alternatives[].risk_tier` and §2.6.12's `ApprovalBody.risk_tier` were plain string unions —
which §1.2 V1 admits as no leaf class: not a well-formed `Cell`/`Measure`, no `phrase_key`, and
rendered, so not structural either. Both are now `Cell<…>`. **`ConfirmationRequirement.risk_tier`
(§3.6) was deliberately *not* changed**, and says why: it is an intent-side member, never a body
leaf, so V1 does not reach it — and §4.4.3 classifies it `AUDIT_RETAINED`, where a `Cell`'s
minted label would put conversation content on an authority-side field. STRATEGY.2 now states
that the wrapper is presentation and **never a recomputation**, so nobody reads the `Cell` as the
widget layer computing a risk tier it is forbidden to compute.

**`renderTextEquivalent` was declared at two arities** — §1.9 H2 at five with `cell_index`, §2.3.5
K9 at four without. H2's survives, because §1.2 V1 clause (d) needs the cell index to detect a
structural leaf reaching the text; K9 cites it.

**`C9_DENIAL_PROJECTION` and K20's right operand were undeclared.** The projection is now declared
beside `LIMITATION_REASON_TABLE`. K20's `emittable(kind) = ownerClassKeys(kind) ∩
capabilityRegistry ≠ ∅` named `capabilityRegistry`, which no shape declares — it now intersects
`REGISTERED_KEYS`, the **space-qualified** union of the three registries, "and never a bare name:
an intersection against an unqualified key set would match a C9 key against an AE spelling, which
§0.6 F24 shows is a real collision and not a hypothetical one."

## Two claims this contract made about itself that were false

- **§0.7 F32 — "the family predicates, each stated once."** `BOOKING(cap)` had three canonical
  statements (§0.7 F32, §3.10 R3.10.1, §0.16 F89's FR-6b cell) and `CONSENT(cap)` two. Worse,
  §3.4's copy carried **only the `actionClass` half** of a two-disjunct predicate — the way a
  fence comes to mean two things. All collapsed to F32. Verified by execution that both halves
  resolve to the same three capabilities today, so nothing was lost; the disjunct stays in F32
  because a capability registered later under one of those action classes with a different
  `targetKind` would otherwise escape.
- **§0.18 F93 — "Every one is `[ABSENT]` today."** P-19 is `[UNENFORCEABLE-TODAY]`, a distinct
  member of F5's closed status vocabulary. Now: "None is `[EXISTS]` today", with the reason P-19
  differs stated where it is claimed.

And one typing rule that was false of its own subjects: **§0.6 F21** asserted that *every*
argument of `subjectCapability` and `verificationFloor` is typed `CapabilityRef`. Neither takes a
ref — they take a structural subject. F21 now binds **capability-valued** arguments, and says why
the qualifier is load-bearing.

## Result

6,143 → 6,201 lines. All four committed checkers pass: `consolidated-mechanical-audit.mjs` 29/29,
`citation-target-check.mjs` 0, `per-kind-totality-check.mjs` 22/22 on both tables,
`f6a-one-declaration-check.mjs` one admitted exception.

**A note on method, because it bore on this pass.** The contract changed twice while round 3 ran.
Two of the three lenses said so unprompted, snapshotted the current file, and re-verified every
finding and every must-hold item against it by script rather than from recollection. That is the
right behaviour and it is recorded here because it is also the reason the findings can be trusted
against a moving artefact.
