# DECISION SHEET 01 — `WIDGET_CAPABILITY_POLICY`, 56 rows

**Blocks:** Gate 5 (verification floor), and through it Gates 6 and 7.
**Raised by:** R3's instruction *«Не подменять derivation таблицей, вручную переписанной из
contract. Source должен оставаться generated/certified contract definitions.»*
**One decision. Nothing else on this sheet needs your attention.**

---

## The situation, exactly

R3 requires Gate 5's floor to be a real derivation. The derivation already exists, generated from
the certified contract and correct:

```ts
// src/widget-contract/verification-floor.ts:121
return maxLevel(
  row.min_verification,                      // ← WIDGET_CAPABILITY_POLICY
  risk,                                      // derived: TOOL catalogue riskTier
  C9_MODE_FLOOR(cap.mode),                   // derived: C9 registry
  C9_RESOURCE_FLOOR(cap.resourceClass),      // derived: C9 registry
  CONSENT_CLASS_FLOOR[row.consent_class],    // ← WIDGET_CAPABILITY_POLICY
);
```

**Three of the five terms derive from the live registries. Two come from a table whose values no
canonical source in this repository carries.**

§0.7 F28 fixes the table's shape, its totality (56 C9-CAP rows, and those only) and its change
discipline — *"Any change to a row's `consent_class` or a lowering of a `min_verification` is a
contract version bump"* — and **never enumerates the rows**. P-10 assigns it to "K2 (the tables)
over K1's canon". K1's canon does not carry it: `C9Capability`
(`src/orchestration/c9.registry.ts:52-74`) has 22 fields and **neither `min_verification` nor
`consent_class` is among them**.

So the two load-bearing columns are **authored policy, not derived data**, and F28's own
version-bump clause says as much: you do not version-bump a derivation.

## Why I did not just pick values

Because `maxLevel` means a wrong row is not symmetric. Too strict and a legitimate read becomes
unreachable; too loose and a capability is exercised below the rung it needs. And a conservative
blanket default is not available either: `CONSENT_CLASS_FLOOR['personal_data']` is
`SESSION_VERIFIED`, so defaulting the column strictly would floor **every C9 read** at
`SESSION_VERIFIED` — which directly contradicts the derivation's own comment at
`C9_MODE_FLOOR('READ')`: *"reads carry their floor in `min_verification`"*.

Fifty-six rows × two columns is 112 authored values. Inventing them and calling the result a
derivation is the thing R3 forbids by name.

---

## What I need from you

**One of the three.** Nothing here is urgent-by-default; Gate 5 stays fail-closed until you answer.

### OPTION A — a derivation rule, stated once (RECOMMENDED)

Give a rule and I derive all 56 rows from the live registry, exactly as the MONEY sets and the
twelve canonical moments were derived. The natural candidate, using fields that already exist:

```
min_verification  :=  LOCAL          -> ANONYMOUS
                      SOURCE_READ    -> CHANNEL_IDENTITY
                      SOURCE_HANDOFF -> BOUND_CLIENT

consent_class     :=  'personal_data'  if the capability's ownerKey or toolOrInterface
                                        names a client-scoped owner
                      'communication'  if it names a delivery owner
                      'none'           otherwise
```

*Cost:* one ruling. *Risk:* the `consent_class` half is a heuristic over names, which is the kind
of inference the enum ruling calls inadmissible — so if you choose A, I would rather you narrow the
`consent_class` half to a literal list of which keys are `personal_data` / `communication`, and
leave `min_verification` to the rule above.

### OPTION B — author the 56 rows

I generate a worksheet: one line per C9 key, with its `mode`, `resourceClass`, `riskTier`,
`ownerKey` and `domains` already filled in, and the two columns blank. You fill them; I bind the
result and prove totality and monotonicity at `EP-REGISTRY-LOAD`.

*Cost:* 56 lines of your attention. *Risk:* none — this is what F28's version-bump clause assumes.

### OPTION C — fail closed, and accept what that costs

Every row gets `min_verification: 'SESSION_VERIFIED'`, `consent_class: 'none'`. The floor is then
never below `SESSION_VERIFIED` for any C9 capability. Gate 5 becomes executable immediately.

*Cost:* every C9 read requires a verified first-party session — no capability is reachable from
Telegram channel identity or from an anonymous web session. That is a **product** change, not a
security one, and it would show up as capability loss at G3.

---

## What happens either way

- Gate 5 stays a refusing stub until this is answered. The pipeline stays fail-closed at Gate 5.
- The three derived terms are already implemented and need nothing from you.
- No production effect, no deletion, no dark window.

**I will not pick.** A floor is exactly the thing that must not be guessed.
