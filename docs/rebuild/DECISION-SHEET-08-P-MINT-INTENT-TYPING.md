# Decision Sheet 08 — P-MINT deterministic intent typing

## Status

`OWNER DECISION REQUIRED: NO`

`OWNER DECISION: OPTION A APPROVED`

`IMPLEMENTATION AUTHORIZED: YES`

`WAVE 2 CODE BEFORE P-MINT: PRESERVED`

`P-MINT IMPLEMENTATION STARTED: YES`

Approval preserves the permanent boundary:

`LLM INTERPRETATION != EFFECT SEMANTICS`

`CLIENT INPUT != TARGET AUTHORITY`

`INTENT_TEMPLATE_KEY -> SERVER REGISTRY -> TYPED SEMANTICS`

`UNKNOWN TEMPLATE -> REFUSE`

This sheet is intentionally narrow. It does not reopen Gates 1–13, the Wave 1 certification,
Decision Sheets 05–07, or the A2.2 backstop. It closes one missing input-to-intent rule that the
certified Contract V1.1 and the recovered Wave 2 programme currently leave undefined.

## Exact contradiction

P-MINT is required to take **only** `WidgetComposerInput` plus the principal and to write the exact
derived `WidgetIntent`/`WidgetIntentRecord` members. Its exit gate includes every non-actuating effect
(`MINT-1`), `NONE` without a token/record (`MINT-2`), the A2.2 actuating backstop (`MINT-3`), exact
target/input-schema handling, floors, confirmation relations and the fitted carrier ceiling.

The only intent-shaped input is `IntentProposal`. It contains exactly:

- `capability?`;
- `handoff_capability_ref?`;
- `argument_handles?`;
- `role`.

The certified generated source explicitly says the shape has no member able to carry `effect` or
`target`. It also carries no `input_schema`, target class/route, confirmation relation, priority or
single-use rule. No other member of `WidgetComposerInput` supplies those values.

The missing effect cannot be inferred from capability metadata. Contract V1.1 explicitly states that
the same C9 key may be the subject of `REFINE` or `DRAFT`, so `resourceClass` does not determine effect
class. The same ambiguity exists between AE `REQUEST_APPROVAL` and `COMMIT`; targetless proposals also
cannot distinguish `NONE` from `NAVIGATE`, or construct the required typed target.

Repository-wide search finds the `IntentProposal` declaration and its generated/checking machinery,
but no deterministic proposal-to-intent mapping or registry. Choosing a default would therefore invent
authority semantics. In particular:

`C9 CAPABILITY => REFINE: FORBIDDEN`

`AE CAPABILITY => COMMIT: FORBIDDEN`

`ROLE => EFFECT: NOT DEFINED`

`RESOURCE CLASS => EFFECT: FORBIDDEN BY CONTRACT`

## Required invariant

`ONE CLOSED PROPOSAL IDENTITY -> ONE SERVER-OWNED TYPED INTENT RECIPE`

The emitter/projector must never author effect, target, floor, confirmation policy or an input schema
as free data. The minter must resolve those members from one closed server-owned rule, validate it
against kind/owner/capability/carrier, and then derive the record. Unknown or mismatched rules fail
before token creation or persistence.

## Option A — closed, versioned intent-template registry (recommended)

Add one non-authority discriminator such as `intent_template_key` to `IntentProposal`. Resolve it in a
closed, versioned server-owned `WidgetIntentTemplateRegistry`.

Each registry row fixes the complete recipe required to type a proposal:

- effect class;
- allowed widget kind and proposal role;
- allowed subject capability space/key or closed predicate;
- target constructor/route where applicable;
- input-schema constructor and the allowed owner-issued argument handles;
- priority, single-use and expiry semantics;
- label, utterance and speech-template keys;
- confirmation/approval/`confirmation_of` recipe where applicable.

The proposal selects a registered recipe and supplies only the already allowed capability references
and opaque owner-issued handles. P-MINT re-derives and validates every authority-bearing member. A
template mismatch, unknown template, undeclared handle or carrier-inadmissible result fails closed.

Populate the registry only from Contract V1.1's kind interactive paths and already approved owner
mappings. Do not add an actuating recipe while MG-P01 is present: `DRAFT`, `REQUEST_APPROVAL` and
`COMMIT` still project to the approved `LIMITATION`/gap outcome and mint no actuating token.

Impact:

`NEW DATABASE MODELS: 0`

`NEW PHYSICAL FIELDS: 0`

`NEW ACTION CLASSES: 0`

`MIGRATION REQUIRED: NO`

`CONTRACT/GENERATED TYPE UPDATE: YES — one closed proposal discriminator plus registry rules`

Gain: P-MINT can deterministically build `NONE`, `NAVIGATE`, `REFINE`, `CONTROL` and `HANDOFF` without
letting a projector author authority fields, while preserving the A2.2 backstop.

Loss: every newly supported interactive affordance needs an explicit reviewed registry row; an
unregistered proposal remains unavailable rather than being guessed.

## Option B — let the proposal carry effect/target/input schema directly

Extend `IntentProposal` with `effect`, `target`, `input_schema` and related typing members, then have
P-MINT validate them.

Gain: smaller registry implementation and easier projector code.

Loss: the projector becomes an indirect authority author. This reverses the certified structural rule
that it cannot propose effect or target, enlarges the trusted input surface and makes a cast/validation
defect capable of upgrading a read proposal into an actuating one.

`RECOMMENDED: NO`

## Option C — keep P-MINT tokenless and defer typed intents

Allow only envelopes with no intents or local `NONE` affordances; refuse every ambiguous proposal.

Gain: safest immediate runtime and no contract amendment.

Loss: canonical `MINT-1`, carrier behaviour, successor support and the Wave 2 exit programme cannot be
completed. Wave 2 remains uncertified.

`RECOMMENDED: NO`

## Recommendation and approval block

`RECOMMENDED OPTION: A`

`WHY: it supplies the missing deterministic typing source while keeping effect, target, schema, floor and confirmation policy server-owned and closed.`

If approved:

`P-MINT INTENT TYPING: APPROVE OPTION A`

`INTENT TEMPLATE REGISTRY: APPROVED`

`PROJECTOR-SUPPLIED EFFECT/TARGET: NO`

`A2.2 BACKSTOP: UNCHANGED`

`NEW MODELS/FIELDS/ACTION CLASSES: 0/0/0`

`MIGRATION: NO`

After approval, P-MINT may resume. Its existing full exit tests and mutation battery must additionally
prove that changing the template key, registry effect, target recipe, allowed capability or A2.2 branch
turns a named test red.
