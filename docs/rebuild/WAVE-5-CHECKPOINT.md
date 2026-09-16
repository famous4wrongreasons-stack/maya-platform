# WAVE 5 — the destinations. K12 and K13.

```
K12 COMPLETE: YES        K13 COMPLETE: YES
PACKAGES COMPLETE: 13/16 WAVES COMPLETE: 5/6
PRODUCTION EFFECTS FOR PROOF: 0
```

Wave 5 exists after K4 for one reason the mapping states plainly: **the four verified destinations
must exist before anything hands control to them.** A handoff to a surface that is not there is a
promise the product cannot keep — which is the `/unsubscribe` defect, reproduced in a new place.

---

## K12 — the widget layer cannot confer consent

Not "does not today". **Cannot.** Three independent mechanisms, and none of them is a list of
capability names:

1. **The type.** `CONSENT_STATE` and `IDENTITY_BINDING` reject any intent whose role is not
   `handoff` or `escape`, and their permitted effects are `NONE`, `CONTROL`, `HANDOFF`. There is no
   shape in which a decision could travel.
2. **The registry veto.** `CONSENT(cap)` and `IDENTITY(cap)` — each a two-disjunct predicate over
   `targetKind` *or* `actionClass` — veto an allowlist row outright at start-up. Re-derived from
   the live registry, they select **3 of 226** and **6 of 226**, exactly the figures the contract
   states.
3. **Absence.** Nothing in `src/widgets/consent/` imports the canonical consent owner, in any
   import form. The exit «consent records written on channel identity alone = 0» holds because the
   widget layer writes no consent record on *any* identity.

**The reachable owner is not named by any of the eight reserved names.** `NEVER_CHAT_ACTUATED`'s
eight names resolve in **no key space** — verified against all four registries — so a membership
test over them is total and always false. What actually keeps consent out of chat is
`package5.wave3.record-client-consent.execute.v1` satisfying `CONSENT(cap)` on its `targetKind`,
which bars it from the COMMIT allowlist permanently. A name-based check would have missed it
completely; that is why the predicates read the registry and not a list.

**No act is orphaned.** All eight carry a named owner: four reachable under another name, one whose
owner exists but is unreachable from the widget source type, three that are canonical-owner work
outside the widget layer. `owner: NONE` = 0, which is G4's closure half — and it is a claim about
*orphaning*, not about completion. K12 does not close `consent.register.export` or either unbind,
and says so.

**Erasure proves the store split rather than performing it.** After an erasure replay every
canonical booking / consent / loyalty read is byte-identical — achievable only because no business
object ever pointed at a message, a widget or a turn. Checked over the live schema: **129 models, 8
history pointers, all 8 on `Widget*` models, 0 on a business model.**

The mirror's dedupe keys are the subtle case. They must **survive** erasure — a key that vanished
with the conversation would let an already-delivered reminder go out again the moment someone
exercised their rights — while retaining no content. So a dedupe key is a hash whose inputs are the
moment, the subject and the window, and the message text is not an input at all.

---

## K13 — the twelve canonical moments, derived rather than typed

**The contract asserts a cardinality and never enumerates the set.** Twelve plausible names typed
into a file would have looked identical to twelve derived ones and been worth nothing — the wave-2
enum ruling is explicit that members are not invented to fit a count. So the twelve are derived, by
a script the gate re-runs, from three sources each admissible on the ruling's own terms:

| Source | What it fixes | Count |
|---|---|---|
| `Package2InboxType`, via the total `Record<Package2InboxType, string>` that keys it | the domain | 21 |
| the certified surface inventory's notification channels | which are scheduler-emitted | 52 surfaces |
| `ProactiveProvenance.artefact_kind` | which reference a canonical row | 6 kinds |

The intersection is **twelve**, and the cardinality was checked *afterwards* rather than aimed at.
It independently reproduces the three moments §triage-135 names by hand. The discriminator that
excludes `team_message` is type-level, not editorial: a message a human wrote has no canonical
artefact row, so it cannot carry a provenance, so it is not a moment.

**`authority_basis` is a union of one member**, not a string that happens to hold one — which is how
"exactly one legal value" becomes unfalsifiable rather than merely true today.

**`RUN_OPENING` is stated ref-nullably**, because on a proactive envelope a null subject is the
normal case and not the edge: every `NAVIGATE` has one and the mandatory escape is effect `NONE`. A
predicate reading `.space` off null would make every proactive announcement unmintable. Its
`?? 'PROPOSE_ONLY'` default is the fail-closed direction: an unregistered C9 key **satisfies**
`RUN_OPENING` and is refused. Membership enumerated from the live registry: **56 keys, 41 `READ`,
13 `PROPOSE_ONLY` + 2 `OWNER_HANDOFF` = 15 run-openers**, exactly as the contract states.

**Permission and quiet hours are re-read at delivery, never at mint.** Someone who revokes consent
between composition and send does not receive the message already in flight. An unreadable
quiet-hours window is *refused*, never treated as "no quiet hours".

**One dedupe key, three channels.** Push, chat and the Telegram mirror are three paths to one
person, and on an installed shell a person plausibly holds all three. Over a simulated 14-day
window — 14 days × 12 moments × 3 channels = 504 attempts — **168 delivered, 0 duplicates**.

**Silence is chosen, and it leaves a row.** If a required cell is not `KNOWN`, the emission is
suppressed: no envelope, no empty card, no placeholder. *A greeting that says «не удалось
загрузить» every morning would do more damage than no greeting at all.* The `SuppressedEmission`
row carries JSON Pointers and never values — asserted, because the unhappy path is where PII leaks.

**`control.delivery.resolve` completes the CONTROL space at the contract's three keys.** Adding it
exposed a real defect in K4's floor lookup: `ref.key === 'control.run.cancel' ? 'BOUND_CLIENT' :
'ANONYMOUS'` would have handed the new key **ANONYMOUS** — a floor becoming a hole the moment the
space grew. Replaced with a table total over the three, and the spec asserts the table's domain
*equals* the space.

---

## GAP-ATTENDANCE-CONFIRM stays open, and K13 does not close it

`appointment_reminder` composes a `LIMITATION` carrying the gap. While it is open the emission may
carry `NONE`, `NAVIGATE` or `HANDOFF` only. **A «Приду» control that writes nothing is not emitted,
and «клиент подтвердил» is not a claim any surface may make.** Registering that owner is
canonical-owner work outside these sixteen packages.

---

## What this wave does NOT prove

- **The 14-day production observation was not run.** What ran is a simulated window over a supplied
  schedule. The contract asks for **SPEC + 14-day production observation + RATCHET**; the spec and
  the mechanism are delivered, the observation is not, and `PRODUCTION EFFECTS FOR PROOF` stays 0.
- **`consent.register.export` and both unbinds remain open**, with owners named on the ledger.
- **PR4's editorial judgment is reviewed, not enforced.** Which moments exist and what each may say
  rests on review discipline at the point a moment is added. The contract does not fake a mechanism
  for it and neither does this package: provenance is enforced, editorial judgment is reviewed.

---

## What the mutation battery found

Every fence was mutated and the suite re-run. **26/26 mutants killed** after repair; six survived
the first pass and each was a genuine dead arm:

| Survivor | Why it was dead | Repair |
|---|---|---|
| both `actionClass` disjuncts | every consent capability carries *both* halves today, so either alone reproduces the set | each arm exercised on a synthetic row satisfying it alone |
| the history-pointer walker returning `[]` | "no offenders" and "walker broken" were indistinguishable | a positive control over a synthetic schema |
| `isOpaqueDedupeKey` accepting anything | only the `true` case was asserted | five refusals added |
| `orphanedActs` inverted | could only ever run against a ledger with no orphans | ledger became a parameter; positive control added |
| every `EP-REGISTRY-LOAD` clause | run only against a valid registry, each could be deleted silently | catalogues became parameters; each clause fed a catalogue breaking exactly it |
| the empty-`fields` erasure refusal | untested | test added |

One mutant survives deliberately: `CONTROL_FLOOR[ref.key] ?? FAIL_CLOSED`. It is unreachable while
the table's domain equals the space, and *that equality* is what the spec asserts. Making the
default reachable would mean weakening the `resolves()` guard above it.

**The gate was then mutated against itself.** Five structural checks, four caught their mutant —
and one was blind: a bare side-effect `import '…';` walked past an expression that matched only
`import … from '…'`. The same hole existed in the suite, whose forbidden list was also narrower
than the gate's and omitted the module that actually holds the consent write. Both widened, both
re-verified against all three import forms.

---

## Wave 5 gate

```
CANONICAL MOMENTS DERIVED:            12/12  (not transcribed)
WAVE 5 PROOFS:                        PASS  (70 assertions, 2 suites)
CONSENT WRITES FROM THE WIDGET LAYER: 0     BUSINESS OBJECTS NAMING A MESSAGE ID: 0
ERASURE REPLAY BYTE-IDENTICAL:        yes   RESERVED ACTS ORPHANED:               0 of 8
MOMENTS WITH A DEDUPE KEY:            12/12 DUPLICATE DELIVERIES, 14 DAYS:        0
AUTHORITY_BASIS LEGAL VALUES:         1     SUPPRESSED EMISSIONS LEAVE A ROW:     every one
CONSENT/IDENTITY READ KEYS:           0     CONTROL SPACE / FLOOR DOMAIN:         3 = 3
MOMENT_REGISTRY ROWS:                 12    PRE-EXISTING MODULES TOUCHED:         3
typecheck: PASS      lint: PASS (exit code)
```
