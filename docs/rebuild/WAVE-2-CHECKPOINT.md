# Wave 2 — K3 · K4 · K5 · K6 — the spine

*The wave whose fence is: first runtime, read-only, dark behind an entitlement. One additive
migration, zero business-table changes, zero modified controllers.*

> **AFTER THIS WAVE MAYA CAN…** compose a sealed envelope, derive its floor, fit it to any of five
> carriers, render it, and refuse a forged, expired, replayed or foreign-principal token at
> indistinguishable latency — **all to nobody.** The property that matters is negative.

---

## K3 — the gateway

The pipeline is **one ordered array**, which is §0.3's stated mechanism and not a style choice: an
array can be enumerated, counted and asserted, and nested conditionals can only be read. All fifteen
gates of §3.9 are present in the contract's order. Gates 1, 3 and 4 are live; Gate 2 passes because
the global JWT guard has already run; **the remaining ten run and refuse** with `mechanism_absent`,
each naming the package that builds it.

**`BUTTON → ENDPOINT` is unrepresentable, and not by checking.** `SubmitIntentDto` has three members
— `intent_token`, `inputs`, `readback_ack`. A check could be bypassed; an absent field cannot be
populated.

Two defects the package's own tests found:

| found | why it mattered |
|---|---|
| Gate 3 compared the principal hash with `===` | a short-circuiting compare returns sooner the earlier two hashes diverge — the exact timing channel the exit forbids, on the exact foreign-principal case it names |
| refusals had different SHAPES per gate | the response structure itself said which gate refused; normalised once at the boundary rather than as a rule fifteen gates must each remember |

## K4 — the authority runtime

Registries **bound and counted by execution**: C9 56 · TOOL 47 · AE 226 · CONTROL 2, with TOOL ⊂ C9
by spelling and AE ∩ C9 = 0. A first binding read the wrong field, reported **one** C9 capability
instead of 56, and typechecked cleanly — because the annotation had been written to match the guess.

`verificationFloor` is total over all 331 keys with no default branch; an unresolvable ref returns
the **top** rung. `SENSITIVE_DEST` treats unknown as sensitive. Exactly one C9 row is `LOCAL`
(`c9.no_action`), and a property test over every triple proves the combiner never returns lower than
a term it was given — so a third floor reduction cannot hide in a helper.

```
STEP_UP_VERIFIED: UNREACHABLE      THIRD FLOOR REDUCTION: NO
UNKNOWN FLOOR: FAIL CLOSED         ZERO-FLOOR COMBINATION: REFUSE
ARTIFACT PII UNDECLARED: REFUSE
```

## K5 — the build that did not exist

`app.html` is a 2.7 MB emitted artefact whose sources are gone, so the current front end cannot be
rebuilt from anything. `maya-chat-shell` ends that condition: **reproducible** — same sources in,
byte-identical bundle out, no timestamps and no build ids, with a digest anyone can recompute.

The renderer reaches nothing, and the **build refuses to emit** one that does — checked at build
time rather than only in CI, because a check can be skipped and a build cannot. Proved by planting
a `fetch` and watching the build refuse it.

Five base routes. Six self-mounting overlays → nine route keys, each with a `fullscreen_intent`,
because a surface that can only mount itself is what the overlays were. **Self-mounting hosts: 0.
Role-mode switchers: 0** — and `intentSet()` takes no role, so the intent set cannot vary by one.
**No legacy UI is deleted.**

## K6 — carriers and the fit

Five carriers plus voice. The fitter **throws rather than emitting** when it cannot leave a way
back: every withheld intent names a `reachable_via` and every reduction a `restored_by`, and both
must be present in what was actually emitted. The escape verb is never withheld, at any tier.

It owns fitting and **not authority**: the file names no floor symbol, and a test asserts that,
because two answers to "may this happen" is worse than a missing one.

**One test of mine was wrong and the code was right.** I asserted `maxIntents` was monotone across
the tier order; it failed, correctly. `ANNOUNCEMENT` carries 2 and `SPOKEN` carries 3 because a push
notification and a voice turn are different **modalities**, not two rungs of one ladder — three
spoken options is what a person holds in working memory. The tier order is a declaration order, not
a capacity order.

---

## A reporting defect, corrected

For two checkpoints I reported **LINT: PASS** by reading the line *"0 errors and 9 warnings
potentially fixable"* through a pipe. That line counts **fixable** problems, not total ones, and the
pipe replaced eslint's exit code with `tail`'s. When eight real errors appeared, the same method
still said PASS.

It is the gotcha `CLAUDE.md` already records — *«Никогда не прятать код возврата за `| tail`»* — and
I walked into it anyway. Every gate now asks the process for its exit code. The earlier reports
happened to be true; **the method that produced them was not sound**, which is the part worth
recording.

---

## Two more checks that measured nothing

**1. The dist-leak check tested a path that never existed.** `wave-1-exit-gate.sh` asked whether
`dist/widget-contract` existed. The compiler emits to `dist/src/`, so that directory could never
appear — the check reported `none` whether or not anything had leaked. Corrected to `dist/src/`.

And the corrected check now says something true and worth knowing: **the contract IS compiled into
`dist` on a wave-2 tree**, because K3 and K4 import it at runtime. That is wave 2's whole point —
"first runtime" — and not a regression of wave 1, whose fence held at its own commit.

**2. A wave gate that decayed into a complaint about later work.** Run on a wave-2 tree, the wave-1
gate reported `WAVE 1 COMPLETE: NO`, because `prisma/` had changed — which wave 2 is supposed to do.
A wave gate asserts a property of **its** wave, so it is now pinned to its own commit and keeps
meaning what it meant when it passed.

---

## Wave 2 final gate

```
K3 COMPLETE: YES · K4 COMPLETE: YES · K5 COMPLETE: YES · K6 COMPLETE: YES

WIDGET CONTRACT REGRESSIONS: 0      audit 29/29, contract 31/31, enum sets 7/7
BUSINESS OWNER CHANGES: 0           schema additive only: +351 / -0
BUSINESS TABLE -> WIDGET TABLE FK: 0
BUTTON -> ENDPOINT PATHS: 0         no member able to carry one

PRISMA: PASS       MIGRATIONS: PASS (2 widget-layer, additive, 0 DROP)
LINT: PASS         TYPECHECK: PASS     BUILD: PASS    SHELL BUILD: PASS (reproducible)
MANDATORY REGRESSION: PASS          466/466 suites · 3939/3939 tests
PENDING MIGRATIONS: 0 locally       DRIFT: NONE locally

PACKAGES COMPLETE: 6/16 · WAVES COMPLETE: 2/6 · WAVE 2 COMPLETE: YES
PRODUCTION EFFECTS FOR PROOF: 0 · PROCESS HYGIENE: 0
```

**One line is deliberately not a PASS.** Pending-migration and drift state belong to a database this
machine cannot reach; the gate says *"0 locally, server state not reachable"* rather than inventing
an answer. A real check belongs to deploy, which is a separate owner-approved step.

**A flake, diagnosed rather than retried away.** The first full run lost a suite to `SIGSEGV` — a
jest worker killed by the operating system, not a failing assertion; the suite passes alone. Bounding
the workers removed the memory pressure. The gate now also distinguishes *a test failed* from *a
suite could not run*, because they are different problems with different fixes.

---

# Wave 3 — K7 · K8 · K9 — the client acts

## A defect found while proving MONEY, and it was mine

Wave 3 asks for `MONEY KEYS GAP-KEYED: 92/92`. The first computation returned **15**.

`MONEY` is the contract's own derived predicate — `riskFacets ∩ MONEY_FACETS`, or
`targetKind ∈ MONEY_TARGET_KINDS`. Both sets were **hard-coded in K2's generator by me**: five
plausible money words (`financial`, `money`, `payment`, `refund`, `loyalty_balance`) and seven
target kinds. The contract declares **sixteen** facets and **twenty-seven** target kinds.

The invented set matched **12 by the bare `financial` token** — and the contract warns about exactly
that number: *"92 capabilities against 12 for the bare `financial` token"*. I had reproduced the
documented wrong answer without noticing it was the documented wrong answer.

The sets are now **extracted from §3.10** and the generator refuses to emit a truncated block. The
count reproduces at **92 of 226**, and the test asserts **both** numbers — 92 for the contract
predicate and 12 for the bare token — so the regression is caught by its own signature.

Under-fencing MONEY is the most consequential direction available in this codebase. Seventy-seven
money capabilities were outside the fence and nothing would have said so.

## The six figures

```
COMMIT OUTSIDE CONFIRMATION: IMPOSSIBLE     BUTTON → ENDPOINT PATHS: 0
BOOKING ALLOWLIST: EXACTLY 3 KEYS           DIRECT UI → PROVIDER WRITES: 0
MONEY KEYS GAP-KEYED: 92/92                 VOICE-SPECIFIC AUTHORITY PATHS: 0
```

**Three keys, not seven.** `attendance`, `duration`, `services` and `fields` stay gap-ledgered under
`GAP-APPOINTMENT-DETAIL-COMMIT`: no propose key exists for them in any space, and a COMMIT whose
propose key cannot be resolved is a COMMIT whose authority cannot be checked.

**The guard reads server state only.** A submission names a token; the draft, the capability, the
confirmation kind and the record it confirms are all looked up. "COMMIT outside a confirmation" is
impossible because there is no field to put one in and no branch that reaches an owner without
passing the guard.

**Voice has no authority path of its own**, and the audit row proves it: the function takes no
carrier, so «said it», «typed it» and «pressed it» produce byte-identical rows.

## K8 — the fences fire where it matters

All five run on **every** presentation, even after one has refused, so *"5/5 fired"* is observable
per request rather than inferred from five separate unit tests. `CLIENT_LIST` is refused outright
under `presentation_mode: 'client'` — not "the principal lacks it", but refused for that mode
whatever they hold. The downgrade replay is the exit's own method: the same emission under a
reduced principal must stop being admissible.

## K9 — the finance fence refuses rather than degrades

`PAYMENT_HANDOFF` is **not emittable**; the correct emission is a `LIMITATION` carrying its gap ref
and **no intent**. A payment affordance that half-works is worse than one that is absent, because a
person will try it. `shell.pay` carries **one** opaque `session_ref` and nothing else — the body has
no member able to hold a provider URL, a checkout id or a card token, which is BUTTON → ENDPOINT
applied where the stakes are money.

---

# Wave 4 — K10 · K11 — owner and staff intelligence

**Fence: additive, read-only. The only writes are C9 approvals, through the orchestrator's own
contract.** Nothing in either package touches Prisma, and the gate checks that by looking for the
persistence client rather than for method names — an earlier version matched `createHash().update()`
and called a hash a database write.

## K10 — a number is not a number

The strictest exit in the programme, and the strictness is the point: *cells that are not C7/C8
projections = 0; numerals originating from an LLM = 0; every `Measure` traces to a `FactUsed`.*

A model that can produce a number a person then acts on is the most dangerous thing this product
could contain. So a numeric cell is **a number plus the fact it came from**, and a cell without a
`factRef` cannot be constructed — `measure()` refuses rather than defaulting. "Numerals originating
from an LLM = 0" is true **by construction**: there is no member that would hold one.

**The digest is computed on the read path, outside the projector.** A projector that hashed its own
output would certify itself, and the digest would move whenever the projector did. Computed over the
rows as read, it is something a third party can recheck — and the test recomputes it for every
fixture rather than trusting the emitted value. `rows_digest` and `series_digest` are deliberately
different questions: a series is a **sequence**, so reordering its points changes it.

**An ARTIFACT is minted for one principal**, re-compared at fetch against the **live** proof hash.
An owner report is the most concentrated personal data this product makes, and a link that works for
whoever holds it is how that data leaves.

## K11 — a widget may not recompute a risk

`risk_tier`, `reversible` and `audience_size` are **copied, never recomputed** — because, in the
mapping's own words, *"a widget that recomputes a risk tier is a widget that can lower one."* The
test reads the source and refuses any operator on those three fields, so the property is checked
rather than promised.

**`NO_ACTION` must be equally selectable**, and "equally" is enforced structurally: the option must
have the same shape as every other, with no marker a renderer could use to treat it differently. A
chooser where doing nothing is harder to pick than doing something manufactures consent. It is also
the unique `resourceClass: 'LOCAL'` row, verified by enumeration against the live registry.

**Envelopes that initiate a strategy = 0.** A widget presents; it does not start. There is no
function that begins a run and no orchestrator imported — asserted by reading the module's own
source for an import statement.
