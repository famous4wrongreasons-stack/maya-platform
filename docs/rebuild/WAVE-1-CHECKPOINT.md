# Wave 1 — K1 + K2 — checkpoint

```
PACKAGES COMPLETE: 2/16
WAVES COMPLETE:    0/6      (wave 1's code is complete; its exit needs one signature and two rulings)
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

**One correction to a number in the earlier report.** I called these "126 human-judgement cells".
126 is the count of **rows**; they carry **137 cells**, because **11 rows need both** a successor
and an owner. The 80/57 split is exact; 80 + 57 = 137, and the 11 overlapping rows are why the row
count is lower. `K1-HUMAN-JUDGEMENT-OWNER-DOSSIER.md` groups all 126 into **26 groups** — 18
successor groups and 8 owner groups — and carries one approval block. The grouping is asserted to
be a total, disjoint partition at build time; the build fails otherwise.

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

`widget-contract-check.mjs`: **26/28**, with four checks **PENDING** and named — each a
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

## F88 — the owner ruling, applied; and two more instances of the same class

### The ruling, as applied

The wave-1 ruling is written into the contract as **F88.1**, immediately after F88, and F88's list
line now reads `` `role` *(outside the declared `WidgetIntent.role` presentation enum — F88.1)* ``,
which is the same in-place qualification F88 already uses twice.

```
SERIALIZED AUTHORITY / PERSONA / IDENTITY ROLE  →  FORBIDDEN
WidgetIntent.role, at that exact member,
  typed as §3.1 declares it                     →  ALLOWED
any other serialized member or key named `role`,
  at any other depth, of any other type         →  FORBIDDEN
```

The permission is implemented as a **`(shape, member, type, depth)` tuple**, never as a key name.
A checker asserts that no generic "role allowed everywhere" exception exists by reading its own
source for the shape binding.

### One correction to the ruling's wording, surfaced rather than absorbed

The ruling quotes the type as `'primary' | 'secondary' | 'destructive' | 'escape'`. **§3.1 declares
eight members:**

```ts
role: 'primary' | 'secondary' | 'destructive' | 'escape'
    | 'more' | 'handoff' | 'remedy' | 'control';
```

The ruling binds the permission to *the exact declared type*, which it states twice, so it covers
all eight. The four it did not quote are interaction roles on the same footing as the four it did:
`'more'` is minted by the fitter when a density cap forces escalation (§2.5 K17), `'control'` is
the run-cancel control (§2.6.13 PROGRESS.3, §3.2 R3.2.4), `'handoff'` and `'remedy'` name the
routing and recovery affordances. **None denotes a persona**, which is the test the ruling sets.
Binding to eight is the ruling applied, not the ruling widened — but it is written here rather than
left to be discovered in an implementation.

### The proof vectors execute, and the invariance is proven by absence

All nine vectors the ruling requires, plus three more, are pushed through **the same two predicates
the walk uses** — so a later widening of the predicate flips a vector and fails the check:

```
FAIL  owner / staff / client role on the wire      FAIL  __meRole · is_owner · is_staff
FAIL  undeclared nested role (depth 2)             FAIL  role on a shape that is not WidgetIntent
FAIL  WidgetIntent.role with a ninth value         PASS  WidgetIntent.role, declared type, depth 0
PASS  tenant_id at the envelope root               FAIL  tenant_id nested in the envelope
```

**Behavioural invariance.** The ruling requires that changing `WidgetIntent.role` among its declared
values cannot change an authority decision for identical authority inputs. Proven the strongest way
available: **0 property reads of `.role` across all 13 modules.** No function reads it, so no
function can branch on it. This is a proof of absence checked by AST, not a claim about intent.

---

## Two more instances of the same class — narrow STOPs, not a re-opened contract

Both were found by the same walk, after it was corrected. Neither is covered by the ruling, and
**neither is being resolved by analogy** — extending a ruling about `role` to a different key, or
to a different location, is exactly the generic exception the ruling forbids.

### SECOND FINDING — `IntentRecord.tenant_id`

§3.7 declares `tenant_id` on `IntentRecord`, which is one of the five shapes F88's validator walks.
F88 qualifies `tenant_id` **only** "outside the envelope root" — a qualifier phrased for the
envelope, while the walk also covers `IntentRecord`. As written, the validator refuses every
`IntentRecord` the contract mints.

An `IntentRecord` is **server-side storage and is never sent to a client**, so the wire risk the
fence exists for is absent here. One line closes it — *"outside the envelope root and
`IntentRecord`"* — but that line moves a conferral fence, so it is an **owner ruling**.

### THIRD FINDING — `RenderReceipt.intents_withheld[].role`, and the checker defect that hid it

§4.5.5 declares `role: WidgetIntent['role']` at depth 2 inside `RenderReceipt`, to name which
intents the fitter withheld. The type is an alias of the exact declared type; the **location** is
not the declared location, and F88.1 is a tuple.

**This one surfaced only because I fixed a defect in my own checker**, and that matters more than
the finding. F88 says its keys are forbidden *"at any other depth"*. My checker collected **only
depth-1 members**, so it could not check the thing F88 states. It now walks to full depth through
inline object literals and array element types, stopping at named type references (which the reach
walk visits on their own), and carries a dotted path and a depth on every member. The `tenant_id`
and `role` exemptions are now additionally bound to **depth 0**, so a nested `tenant_id` inside the
envelope is refused — a vector that previously would have passed.

A checker that reads correctly but does not enforce is the failure mode this whole cycle has been
hunting. This is the third time it has appeared, and the second time in code I wrote.

### Recommended rulings

| | recommendation |
|---|---|
| **`IntentRecord.tenant_id`** | qualify F88 in place: *`tenant_id` (outside the envelope root and outside `IntentRecord`)*. Same pattern F88 already uses twice; weakens nothing on the wire, because an `IntentRecord` never reaches a wire. |
| **`RenderReceipt.intents_withheld[].role`** | extend F88.1's location clause to the two declared locations: `WidgetIntent.role` **and** `RenderReceipt.intents_withheld[].role`, both typed as §3.1 declares. Enumerated locations, not a key-name exception. |

**Nothing downstream is blocked today** — F88's validator is a K3 deliverable (`EP-MINT`) and does
not exist yet. But **K3 builds it**, so both must be ruled on before wave 2 reaches K3. The two
failing checks stay failing and visible until then; they are not marked pending, because pending
would mean "a later package supplies this", and what is missing here is a decision.

---

## The five undeclared shapes — resolved inside the frozen contract, no new semantics

Per the instruction, each was defined in its assigned package from the contract's own text, and
each is recorded with the clause that fixes it. **None required new authority or business
semantics, so none is a STOP.**

| shape | fixed by | what it is |
|---|---|---|
| `WidgetBody` | §2's 22 body declarations | the union of the 22 bodies, nothing more |
| `CorrelationRefs` | §1.1.2 — "run/turn/message/parent ids only" | exactly those four, all optional |
| `IntentProposal` | §1.1.2 — "capability (or handoff_capability_ref), argument handles, role. No token. No floor." | exactly those members; **no `label`** |
| `BridgeSession` | §4.6 NT3 | `{ resolved: Readonly<Record<BridgeKey, 'available' \| 'absent' \| 'unknown'>> }` |
| `BridgeKey` | §4.6 — `required: []` | **deliberately left open as `string`.** The contract never closes it, and `required: []` means it gates nothing. Closing it here would be inventing a fence the contract does not state. |

A first pass at these under-read three of them — it invented a `label` on `IntentProposal`, made
`BridgeSession` an opaque string against NT3's explicit `.resolved`, and closed `BridgeKey` into a
union taken from my own envelope rather than from the contract. The corrected versions take the
members the contract states. The difference between deriving a shape and inventing one is exactly
the difference those three corrections make.

---

## Release gates, re-run

```
typecheck (build config)      PASS     lint (full repo glob)      PASS   0 errors, 9 pre-existing warnings
typecheck:scripts             PASS     prettier                   PASS
typecheck (widget contract)   PASS     K1 dossier checks          PASS   15/15
widget-contract checkers      26/28    two findings, both above
every evidence checker        PASS     run-all-checks.sh
```

`run-all-checks.sh` is new, and it exists because I mis-invoked three of these checkers in this
session: they take a document path, and handed the wrong file they print a plausible
`printed (absent)` rather than an error. The invocation is now recorded instead of remembered.

---

## Wave status

```
K1 SURFACES:                795/795
K1 HUMAN-JUDGEMENT ROWS:    126   (137 cells: 80 successor + 57 owner, 11 rows carrying both)
K1 OWNER DOSSIER:           READY   26 groups
K1 SIGNED:                  NO
K2 COMPILE:                 PASS
K2 CHECKERS:                26/28
F88 RULING APPLIED:         YES
F88 SELF-CONTRADICTION:     RESOLVED for `role` at WidgetIntent
                            OPEN for IntentRecord.tenant_id           (second instance)
                            OPEN for RenderReceipt…[].role            (third instance)
WIDGET CONTRACT REGRESSIONS: 0
PACKAGES COMPLETE:          2/16
WAVE 1 COMPLETE:            NO
WAVE 2 STARTED:             NO
```

Wave 2 does not start until the K1 human dossier is signed. The two open findings do not block the
signature — they block **K3**, which is in wave 2's second half.
