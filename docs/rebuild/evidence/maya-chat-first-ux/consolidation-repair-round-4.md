# Consolidation repair — round 4, and the state at stop

`[EVIDENCE]` The final confirmation pass, the six repairs it produced, and an honest statement
of where the contract stands.

## The verdict, stated exactly

**Split. One lens `CERTIFIABLE: YES`, one `CERTIFIABLE: NO` with four structural findings.
0 security-contract. 0 unproven. FR-1 … FR-16 all hold.**

> "THE BAR IS MET. I could not find a violation, and after a full adversarial pass I am saying
> so plainly rather than manufacturing one." — the adversarial lens
> "NOT CERTIFIABLE — but narrowly, and I want to be exact about what that word is carrying,
> because three of the four findings are one-line edits and none of them touches authority."
> — the confirming lens

**A split is not a pass.** The owner's bar is zero on every indicator, and one lens finding four
is four. The four are repaired below; the contract has not been re-certified since.

Both lenses confirmed **every** round-3 repair correct and closed, including the one that was
deliberately *not* made: `ConfirmationRequirement.risk_tier` stays a bare union because it is an
intent-side member classified `AUDIT_RETAINED`, and both lenses checked that reasoning rather
than flagging the asymmetry.

## The one that mattered, and it was mine

**§3.11 R3.11.5's `dispatch_is_synchronous` fence could never fire — and it fails OPEN.**

R3.11.5 refuses to mint a `REQUEST_APPROVAL` or `COMMIT` for a capability whose owner queues
dispatch after `APPROVED`. It read the flag from `WIDGET_CAPABILITY_POLICY` keyed on the
capability itself. But §0.7 F28 makes that table total over **C9-CAP and over those only**, and
§0.12 F69 permits `REQUEST_APPROVAL` and `COMMIT` to carry an **AE** ref and nothing else. So
the lookup is `undefined` for every capability the rule governs, the flag is never `false`, and
the refusal never fires.

The live case is not hypothetical: `communication.bulk-campaign.admit.v2`, the single allowlisted
`MARKETING_FANOUT` row, reachable as a `REQUEST_APPROVAL` from `CLIENT_LIST` — and
queued-after-`APPROVED` dispatch is exactly what R3.11.5 exists to refuse.

**I introduced this in round 2.** V27 added `dispatch_is_synchronous` to F28's column set to
close R3.11.5's dependency, and put it on the wrong table's terms. It is the failure mode I had
been guarding against all cycle — *a repair that trades a wrong rule for a differently wrong one*
— and the wrong one fails open rather than closed.

The contract already had the correct idiom one section away. §0.14 F80 reads the flag from the
capability's **C9 propose key's** row, which is total and well-defined because F31 asserts every
allowlisted AE key is the `ae` side of exactly one `AE_PROPOSE_PAIRING` row. R3.11.5 and F28 now
use F80's wording, and R3.11.5 states in place why the AE-keyed form would fail open — so the
next reader cannot re-introduce it without reading the reason.

## The other three

| # | was | is |
|---|---|---|
| Y2 | §A2.3 and §A1.1 P-09 still stated K20 with `capabilityRegistry` — **the identifier round 3 deleted from K20 for being declared by nothing**. The repair had been applied at the declaration site only. | both state K20's current form over `REGISTERED_KEYS`. `capabilityRegistry` now has **zero** occurrences. |
| Y3 | §A1.6.2 — marked `NORMATIVE` — quoted `CONSENT(cap) :=` with **one of its two disjuncts**, under the definitional operator. The identical defect round 3 repaired in §3.4, reproduced with the other half. | cites F32's predicate without restating it, naming which disjunct this key satisfies |
| Y4 | §2.4 K20 justified space-qualification by "would match a C9 key against an AE spelling" — but F24 proves AE ∩ C9 = ∅; the collision it proves is **TOOL against C9** (all 47 catalogue names are also C9-CAP keys) | names the collision F24 actually proves |

Y3 is the third appearance of one pattern: **a fence predicate restated somewhere as a proper
subset of itself.** `predicate-restatement-check.mjs` is now committed and reports **0** — every
`X(cap) :=` appears exactly once, at its declaration.

## Where this stands

Five checkers, all clean:

```
consolidated-mechanical-audit.mjs    29/29
citation-target-check.mjs             0 problems
per-kind-totality-check.mjs          22/22 on both tables
f6a-one-declaration-check.mjs         1 admitted exception (subjectCapability sig + body)
predicate-restatement-check.mjs       0 restatements
```

Four rounds: **48 findings (3 security-contract) → 38 (0) → 12 (0, 0 unproven, rules hold) → 4
(0, 0, rules hold, one lens passing).** 6,201 → 6,208 lines.

**The contract is not certified.** It has not been re-read since these six repairs, and the last
pass that did read it was split. What can be said with evidence is narrower and worth saying
plainly: no pass since round 1 has found a security-contract violation; no pass since round 2 has
found an unproven normative claim; the authority spine — two floor reductions, both PII fences,
Gates 5, 6 and 7 — has been verified intact by nine independent lenses across four rounds; and
thirteen of the twenty-one fundamental rules hold **only fail-closed**, because the widget layer
does not exist yet.

That last fact is the one that should govern what happens next. A contract whose fences are
all fail-closed-by-absence is not yet a system; the next pass over it is worth running, and the
next *round* of them is not, because the marginal finding is now a one-line citation and the
instrument that finds those is a script, not a reader.
