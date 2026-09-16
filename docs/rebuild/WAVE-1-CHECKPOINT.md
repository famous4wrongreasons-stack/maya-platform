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

**The dossier's prose was adversarially corrected before presentation, and it moved one way.**
Every group was drafted against its own surface rows, then read by a pass whose only instruction was
to refute it, then re-checked by a third. **All 26 groups came back with corrections**, and they ran
overwhelmingly in one direction: **the first drafts, mine included, understated risk and overstated
benefit.** After correction, **13 of 26 groups sit at HIGH or MEDIUM-HIGH**, where my first pass had
put most of them at LOW.

Four were plain factual errors, and I re-verified each against the files myself rather than relaying
them:

| my claim | what the files say |
|---|---|
| G11 removes "the `is_admin` **client-side** gate" | `is_admin` is defined in `canonical_staff_access.py:122` and `database.py:1500` — **Python, server-side.** Removing it is neutral, not a client-check-being-replaced risk. 37 call sites in `bot.py`, not the 22 I printed. |
| G14: "`app-tenant.html` is a 2.5 MB near-duplicate" | `app-tenant.html` is **1,096,396 bytes**; the 2,506,493-byte file is `maya-os-site/index.html`. The description belonged to a different row — and for `app-tenant.html` the work is *building* a missing system, not deleting a duplicate. Different cost, different risk. |
| G03: "the newer one adds the `notmaster` state the older one lacks" | `notmaster` appears **4 times in both** copies. The state to preserve has to be added to the *merge target*, which has none. |
| G17: auto-subscribes "with no user control, **in three bundles**" | **One** bundle. `app.html` and `maya-os-site/index.html` each carry 5 `unsubscribe` references; `app-tenant.html` carries 0. |

**Two findings landed outside K1 entirely, and one thing I thought I had found was my own mistake.**
The two are live conditions in existing code, not things this wave changes, so they are recorded and
filed separately rather than folded into a group. Neither is a stop condition: neither is a contract
contradiction nor a new decision.

1. **CRM journal read path.** `getJournal` forwards a caller-supplied `providerId`
   (`crm.service.ts:3212`) with no counterpart to the write path's `assertJournalStaffWritable`,
   while `CRM_JOURNAL_ROLES` admits PROVIDER/EMPLOYEE/STAFF. Whether a staff member can read a
   colleague's journal is a per-actor question the rows cannot settle. Filed for its own session.

2. **A consent promise the gate refuses.** `bot.py:445` tells a client «Согласие можно отозвать в
   любой момент командой /unsubscribe», and `_GATE_ALLOWED_COMMANDS` at `bot.py:353` is
   `{"/start", "/privacy", "/cancel"}`. A gated client is told about a route the gate blocks. This
   is a 152-ФЗ / ст.18 surface, so the wording and the mechanism are both load-bearing. Filed —
   `bot.py` is production and is not touched here.

3. **A stale docstring in `bot.py` that reads as a live sender.** I thought I had found O03's
   live/retired split wrong by one row: `_lead_alerts_job` calls `lead_alerts.scan_and_alert(app)`
   every five minutes and its docstring says «раз в 5 мин шлёт "зависшие заявки" админу». Reading
   one level further down, `scan_and_alert` returns
   `{'checked': 0, 'alerted': 0, 'status': 'retired_unverified_lead_occurrence'}` immediately — it
   is retired at the module level, exactly as the row says. **The row was right and I was wrong.**
   What survives is smaller and still worth recording: `reviews`, `lead_alerts`, `dual_role_guard`
   and `god_watch` are all **registered and firing on schedule with retired stub handlers**, which
   is not the same as "unreachable"; and `_lead_alerts_job`'s docstring still describes the
   behaviour it no longer has, which is a trap for the next person who reads `bot.py`.

   It is also the one thing the adversarial passes could not have caught. They verified every claim
   **against the dossier rows**; where a row is wrong, only reading the code finds it. Here the row
   was right and my reading of one wrapper was wrong — but the asymmetry holds in both directions,
   and it is the reason the parity harness has to run against behaviour rather than against this
   dossier.

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

## The two remaining instances — ruled, and the fence rebuilt around the ruling

Both were approved narrowly, and the ruling carried one instruction that changed more than the two
rows it was about: **"не делать allowlist по одному имени поля — все исключения F88 должны быть
exact structural locations."** F88 had two prose qualifiers (*"outside a declared body enum field"*,
*"outside the envelope root"*). A prose qualifier says where a key is **not** allowed and leaves
every other position to be argued — it is a key-name exception wearing a location's clothes. They
are replaced by **F88.2**, an enumeration of where each key **is** allowed.

| # | shape | path | depth | required type | source |
|---|---|---|---|---|---|
| 1 | `Cell` | `state` | 0 | `CellState` | §1.2 |
| 2 | `Lifecycle` | `state` | 0 | `LifecycleState` | §4.1 |
| 3 | `WidgetEnvelope` | `tenant_id` | 0 | `string` | §1.1.1 canonical root binding |
| 4 | `IntentRecord` | `tenant_id` | 0 | `string` | §3.7 — **owner ruling, wave 1** |
| 5 | `WidgetIntent` | `role` | 0 | the eight members §3.1 declares | F88.1 |
| 6 | `RenderReceipt` | `intents_withheld[].role` | 1 | exactly `WidgetIntent['role']` | §4.5.5 — **owner ruling, wave 1** |

The table is closed. An occurrence that is not a row fails, with no further test. The
implementation carries **no field an edit could use to write "the key `k` is allowed"** — `key` is
derived *from* `path`, so a row cannot name a key without also naming where it sits — and a
conformance check asserts that property against the source.

All five required negative tests and the required invariance run as executable vectors:

```
FAIL  nested arbitrary role                  FAIL  receipt role outside intents_withheld
FAIL  nested owner/staff/client role         FAIL  receipt role, right path wrong depth / wrong type
FAIL  nested arbitrary tenant_id             PASS  IntentRecord.tenant_id, the ruled location
FAIL  IntentRecord.tenant_id read into an authority decision — 0 reads, proven by AST
FAIL  changing a presentation role changes an authority result — 0 reads, proven by AST
```

**NEG 5 and the invariance are the same claim** — a field nothing reads cannot be branched on — and
both are proven by **absence of a read** rather than by replaying fixtures. An absence proof refuses
the *capability* to branch; a fixture replay only samples the branches taken today.

---

## The mutation battery — and the three dead fence arms it found

A checker that cannot fail is not a checker. `f88-mutation-battery.sh` widens or narrows one arm of
the fence at a time and requires the pass count to drop. **Twenty mutations, all now caught.** Three
of them were **not** caught on the first run, and each was a real hole:

| mutation that survived | what it meant |
|---|---|
| row 4's type predicate widened to `() => true` | the **type arm** of the `IntentRecord` exemption was dead weight — nothing ever presented a wrong-typed `tenant_id` at the ruled location. Closed by one wrong-type vector per row, six in all. |
| the walk capped at depth 1 | **the depth-unboundedness F88 states was resting on nothing** — no shape the contract declares today carries a forbidden key below depth 1. Closed by running the real walker and the real `EXEMPT` over a synthetic declaration that buries keys at depths 2, 3 and 4, in both array spellings. |
| `reach` stops following type references | with the five roots alone, `WidgetIntent`, `RenderReceipt`, `Cell` and `Lifecycle` all leave the walk and **the hit list empties out — the fence would pass by not looking.** Closed by asserting every exempted shape is reachable from a root. |

The `T[]` array arm was also dead, because the contract as it stands happens to use only
`Array<T>`. It is now exercised by the synthetic probe.

---

## A vacuous check I shipped in the last report

`no generic \`role allowed everywhere\` exception exists in the checker` tested the source for the
literal `shape!=='WidgetIntent'`. Prettier reflowed the code to `shape !== 'WidgetIntent'` — with
spaces — so the only remaining occurrence of the searched string was **inside the check's own regex
literal**. The check found itself and passed. **It measured nothing, and it was PASS in the 26/28 I
reported.**

It is replaced by one that cannot satisfy itself: source-reading checks now read only two named
regions, and a guard asserts those regions contain no assertion. This is the same failure mode as
the depth-1 walk and the self-referential proof step from round 4 — a check that reads correctly and
enforces nothing — appearing for the fourth time in this cycle, and the third time in my own code.

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
typecheck (widget contract)   PASS     prisma validate            PASS
widget-contract checkers      31/31    4 pending on named prerequisites
f88 mutation battery          20/20    every arm of the fence is load-bearing
every evidence checker        PASS     run-all-checks.sh
dist leak                     none     nothing from wave 1 reaches the build output
```

The four pending checks are pending on **prerequisites, not on decisions**: `KIND_REGISTRY` and
`WIDGET_CAPABILITY_POLICY` totality wait on **P-10**; R1 portability waits on **P-19** (built by
K5); the forbidden-key walk over a *live envelope* waits on **P-01** (built by K3). That last one
is now partly discharged at the type level — the synthetic-depth proof runs the real walker and the
real exemption table — but a walk over runtime values still needs a runtime envelope, and saying
otherwise would be the same overclaim this cycle keeps catching.

---

## Wave status

```
K1 SURFACES:                795/795
K1 HUMAN-JUDGEMENT ROWS:    126   (137 cells: 80 successor + 57 owner, 11 rows carrying both)
K1 OWNER DOSSIER:           PRESENTED   26 groups, 13 fields each, one approval block
K1 SIGNED:                  NO
K2 COMPILE:                 PASS
K2 CHECKERS:                31/31    (was 28; the mutation battery added 3)
F88 STRUCTURAL EXEMPTIONS:  6        exact (shape, path, depth, type) locations
F88 GENERIC EXEMPTIONS:     0        asserted against the source, not claimed
F88 MUTATIONS CAUGHT:       20/20
WIDGET CONTRACT REGRESSIONS: 0
PACKAGES COMPLETE:          2/16
WAVE 1 COMPLETE:            NO
WAVE 2 STARTED:             NO
```

The check count rose from 28 to 31 because the mutation battery found three arms of the fence that
no test could distinguish. A rising check count after a ruling is the ruling being implemented, not
scope creep: each new check exists because a mutation survived without it.

Wave 2 does not start until the K1 human dossier is signed.
