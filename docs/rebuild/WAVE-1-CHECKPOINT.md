# Wave 1 — K1 + K2 — checkpoint

```
PACKAGES COMPLETE: 2/16
WAVES COMPLETE:    0/6      (wave 1's code is complete; its exit needs one signature and one ruling)
SURFACE PARITY:    0/795    (the harness is emitted RED by design; K1 turns nothing green)
PRIMARY NAV:       101 → target 5   (unchanged: K1 proposes, K16 executes)
ROLE PRESENTATION MODES REMAINING: 4   (unchanged: K5 removes them)
WIDGET CONTRACT REGRESSIONS: 0
BUSINESS OWNER CHANGES: 0
PRODUCTION EFFECTS FOR PROOF: 0
```

## Wave 1's fence held

```
RUNTIME CHANGES:        0
DEPLOYED BYTE CHANGES:  0
PRODUCTION MUTATIONS:   0
```

Verified, not asserted:

| | |
|---|---|
| `src/widget-contract` excluded from `tsconfig.build.json` | nothing new reaches `dist` |
| `package.json` unchanged | no script, no dependency |
| `prisma/schema.prisma` unchanged, 97 migrations unchanged | migration 1 is **authored** in the envelope and **not applied**; applying it is wave 2's controlled deployment |
| existing `platform-ci.yml` unchanged | the contract job is a **separate** workflow, `continue-on-error` on every step |
| no existing `src` file changed | the diff outside `src/widget-contract` is empty |

## K1 — the surface dossier

**795/795 rows**, each carrying a class, a successor, a canonical owner, a parity requirement and
a retirement condition. **K1 deletes nothing.**

Every field states its provenance, because a dossier that marked everything "derived" is a
dossier nobody needs to read:

| provenance | rows |
|---|---:|
| **DERIVED** — the class plus the inventory's capability list fix it uniquely | 439 |
| **EVIDENCE** — the disposition sweep names it outright | 220 |
| **ASSIGNED BY K5 / K8** — the *form* is fixed; the instance is a later package's mechanical job | 56 |
| **REQUIRES SIGNATURE** — a judgement, and the owner makes it | 80 |

**126 rows await a signature** — 80 successors (72 of them `MERGE` targets, because *which surface
does this fold into* is a product judgement) and 57 canonical owners. That is K1's exit, and it is
the one exit in this plan a machine cannot certify.

**The authorized 34 re-dispositions reproduce from the data**, and their scope is now on the row
rather than implicit:

```
PWA primary-nav entries             89
  removed by their own disposition  50    (RETIRE FROM PRIMARY NAV, MERGE, MOVE INTO CHAT WIDGET)
  still holding an entry            39
  target                             5
  RE-DISPOSITIONS NEEDED            34    <- the authorized number, reproduced
```

**And a number the owner should also see.** Across *every* Maya-owned channel the figure is **41**,
not 34, because seven further entries live outside the pwa — three `public-web-auth`, two
`telegram-miniapp`, one `telegram-bot`, one `public-community`. The authorized 34 is correct for
its scope and is not being revised; what is added is the scope label and the seven rows it does
not cover, so G11's ratchet is read against a number whose basis is written down.

Also delivered: the **capability-gap ledger** (30 keys, including all 8 tracked acts with their
corrected per-act owner state), the **mechanism-gap ledger** (32 rows — 30 `[ABSENT]`, 1
`[PARTIAL]`, 1 `[UNENFORCEABLE-TODAY]`, and **P-12 owned by no package**, which is in the ledger
precisely because a prerequisite nobody owns is the one most likely to be assumed), and the
**parity harness: 795 rows, every gate RED, 0 retirable.**

`k1-dossier-check.mjs`: **15/15.**

## K2 — the contract, compiled

**The certified contract compiles: 0 errors**, 13 modules, 149 declarations.

It is **generated from the contract**, not transcribed — `extract.mjs` pulls all 89 fenced
TypeScript blocks, `emit.mjs` resolves the cross-module imports from §0.2's ownership map, and
`build-tables.mjs` parses the five floor tables the contract states as **markdown** rather than
code. Nothing was retyped, so nothing can drift. `scripts/widget-contract/README.md` is the
regeneration recipe.

Two kinds of contract text are preserved as comments rather than emitted, because they are
specification and not TypeScript: `// [SPEC, not code]` for §4.8's set-notation derivations, and
`// [MEMBER FRAGMENT]` for members quoted from a shape declared elsewhere.

`widget-contract-check.mjs`: **21/22**, with four checks **PENDING** and named — each a
prerequisite, not an omission (`KIND_REGISTRY` totality and `WIDGET_CAPABILITY_POLICY` totality
wait on P-10; R1 portability on P-19/K5; the forbidden-key walk on P-01/K3).

### K2's own finding: five shapes the contract names and declares nowhere

Found by compiling it, which is what K2 is for: `WidgetBody`, `CorrelationRefs`, `IntentProposal`,
`BridgeKey`, `BridgeSession`. **None is a contradiction and none adds a semantic** — each is fixed
by the contract's own text, and `derived-shapes.ts` writes each down with the clause that fixes it
and the package that must build it. Recorded here rather than resolved silently.

## Release gates

```
typecheck (build config)     PASS      lint (full repo glob)     PASS
typecheck:scripts            PASS      prisma validate           PASS
typecheck (widget contract)  PASS      K1 dossier checks         PASS  15/15
widget-contract checkers     1 finding, reported below           21/22
jest (the existing suite)    PASS      461 suites, 3878 tests, 0 failures
```

The existing suite was run whole, not sampled: **461 suites, 3878 tests, 0 failures.** Wave 1
adds no runtime and breaks none.

---

## STOP — a concrete contract contradiction, per the authorized stop policy

This is stop condition **4**: *the certified Widget Contract reveals a concrete
regression/contradiction*. It was found by compiling the contract, and it is reported rather than
resolved, because resolving it is an owner decision.

**§0.15 F88's forbidden-key list and §3.1's `WidgetIntent` cannot both be satisfied as written.**

F88 lists twenty-eight keys and **qualifies two of them in place**:

> `arguments`, `payload`, `state` *(outside a declared body enum field)*, `role`, `permissions`,
> `token`, `tenant_id` *(outside the envelope root)*, …

Its mechanism is **"one structural validator — a total walk over the serialized value — applied to
`WidgetEnvelope`, `WidgetIntentSubmission`, `ChannelProfile`, `NativeBridgeManifest` and
`IntentRecord`"**.

§3.1 declares:

> `role: 'primary' | 'secondary' | 'destructive' | 'escape'`

on `WidgetIntent`, which is reached by that walk through `WidgetEnvelope.intents`. **So F88's own
validator would refuse every envelope this contract can mint.** That is an assertion set that can
never pass — the category the certification hunted, surfacing only once the contract was compiled
and its shapes enumerated.

**Why it is not a security weakening, and why I am not fixing it unilaterally.** `role` sits on
F88's list among `__meRole`, `is_staff` and `is_owner` — authority keys. `WidgetIntent.role` is a
**presentation** role from a closed four-member set that confers nothing, and CLIENT.3, APPROVAL.4
and ARTIFACT.5 are rules *about* it. The likely intent is that F88 means an *authority* role. But
"likely" is not a ruling, and the two sibling keys on that same list carry their qualifier
explicitly — so adding one to `role` is a change to a conferral fence, and that is the owner's.

**Three ways it can be closed, and what each costs:**

1. **Qualify `role` as its siblings are qualified** — `role` *(outside `WidgetIntent`'s closed
   presentation set)*. Smallest change; matches F88's own pattern twice over; weakens nothing,
   because the presentation set confers nothing.
2. **Rename the member** — `WidgetIntent.presentation_role`. Leaves F88 untouched and absolute,
   at the cost of renaming a member six kind-body clauses already cite by name.
3. **Scope F88's walk** — exclude `intents[]` from it. **Not recommended**: it would stop the walk
   checking the one array most likely to carry a smuggled key.

**Nothing downstream is blocked today** — F88's validator is a K3 deliverable (`EP-MINT`) and does
not exist yet. But **K3 is the package that builds it**, so this must be ruled on before wave 2
opens, not during it.

Wave 1's code is complete and its gates are green. Its **exit** needs two things from the owner:
the **126 signatures** on the dossier, and this **ruling**.
