# DECISION SHEET 02 — Gate 10's promotion criterion  ·  **ANSWERED**

> **OWNER DECISION, 2026-09-16: `GATE 10: REFUSAL ON EFFECT-CLASS DIVERGENCE`.**
>
> Divergence **within** the same effect class → audit/shadow evidence; not on its own grounds for
> refusal. Divergence that **changes** the effect class → deterministic refusal before admission
> or effect. The rule may never permit: READ → WRITE · PREPARE → COMMIT · one action class → a
> materially different one · a change of canonical owner · an escalation of business effect · a
> bypass of approval, consent or authority.
>
> The effect-class taxonomy is the existing canonical one (§3.2's eight classes). **No new
> classification is to be created for Gate 10.** Mutation tests mandatory.
>
> Required, each proved: SAME EFFECT CLASS → AUDIT · CROSS EFFECT CLASS → REFUSE ·
> EFFECT ESCALATION → REFUSE · OWNER CHANGE → REFUSE · APPROVAL/CONSENT BYPASS → REFUSE.

---

## The sheet as it was put, retained for the record

**Blocks:** Gate 10 refusing. Does **not** block Gate 10's audit half, which I can build now.
**Raised by:** R2 — *«Если contract действительно оставляет сам criterion owner-undefined, STOP с
одним exact decision sheet, а не реализовывать предположение.»*
**It does. Here is the sheet.**

---

## The contract says it in as many words

`MAYA-WIDGET-CONTRACT-V1.md:6037`, P-20, verbatim:

> **Gate 10 promotion criterion** — the rule that converts the divergence audit from shadow to
> refusal … `[ABSENT]` **twice over**: the gate itself is `[TO BUILD]` (P-01), *and* **no promotion
> criterion is defined anywhere in the contract**. §3.16.5 states it plainly — divergence is
> "audited, not refused, until a promotion criterion is set", so "three front doors, one function"
> is **measured, not enforced** … **The criterion itself is an owner decision, not a package
> deliverable** — it must be set before Gate 10 may refuse.

So your ruling `GATE 10 MODE: REFUSAL` is accepted and recorded, and it cannot be *activated* until
you say what divergence means. That is not me being cautious — it is the certified contract
reserving the question for you, by name, in the prerequisite register.

## What Gate 10 actually compares

Three front doors, one function: a **tap**, a **typed sentence** and a **spoken utterance** must
resolve to the same capability. Gate 10 runs the deterministic text router over the lowered
utterance and compares its resolved capability to `IntentRecord.capability`.

A divergence is therefore: *the button said X, the words resolved to Y.*

---

## The decision: when does a divergence REFUSE rather than record?

### OPTION A — any divergence refuses (strictest)

`resolved !== IntentRecord.capability` ⟹ refuse.

*Cost:* the router must be right about every phrasing in two languages on day one. Every router
gap becomes a refused user action rather than a logged mismatch. This is the option most likely to
refuse legitimate traffic in week one.

### OPTION B — refuse only when the divergence crosses an effect class (RECOMMENDED)

Refuse when the resolved capability's **effect class** differs from the record's, or when either
side is `null` while the other actuates. Record everything else.

*Rationale:* the danger Gate 10 exists for is a tap that says "look at this" resolving to something
that *writes*. A divergence within the same effect class — two different read capabilities — is a
router accuracy problem, not an authority problem. This refuses the attack and logs the noise.

### OPTION C — refuse above a measured divergence rate, after an observation window

Run the audit; if the observed divergence rate over N days is below a threshold you set, promote to
refusal. This is the option the contract's own phrasing ("until a promotion criterion is set")
seems to anticipate, and it composes with the dark window you have already authorized.

*Cost:* it needs the same wall-clock patience as `ENTRY_POINT_DARK`, and it needs you to name N and
the threshold.

### OPTION D — refuse only for a named set of capabilities

Money, consent, identity and booking commits refuse on any divergence; everything else audits.

*Cost:* a list to maintain — and the cycle's own experience is that lists of capability names drift
while predicates do not. I would only recommend this if the list is derived (e.g. `MONEY(cap) ∨
CONSENT(cap) ∨ IDENTITY(cap) ∨ BOOKING(cap)` — four predicates that already exist and execute).

---

## What I will build regardless of your answer

R2 permits the mechanism now and reserves only the switch. So, without waiting:

- the deterministic pre-LLM router, as **one module**, `(utterance, locale) => CapabilityRef | null`
  — the same function for slash commands, typed sentences and `speech_aliases`, because R3.12.4's
  "one function" is false by construction if there are two;
- persistence of both operands at mint, so the comparison has data to compare;
- the comparison itself, recording every divergence with both capabilities and the lowered
  utterance;
- `widget_router_divergence` as a published count.

**The refusal branch will exist and be unreachable**, behind a single constant that your answer
sets. It stays fail-closed with the rest of the pipeline until then.

---

## What happens either way

- `GATE 10 MODE: REFUSAL` is recorded as your ruling.
- Gate 10 does not refuse until you answer; it audits.
- No production effect. No dark window. Nothing is deleted.

**I will not invent the criterion.** P-20 reserves it for you in writing, and guessing it would put
a refusal in front of real users on a rule nobody approved.
