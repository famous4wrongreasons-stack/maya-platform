# Widget Gate Wave 2 — P-MINT implementation record

## Owner decision

Decision Sheet 08 Option A is implemented as one closed, versioned, server-owned intent-template
registry. A proposal supplies `intent_template_key`, the already-declared capability references and
opaque owner handles. It cannot supply effect, target, input schema, floor, confirmation policy,
priority, single-use policy or expiry semantics.

The permanent boundary is:

```text
LLM INTERPRETATION != EFFECT SEMANTICS
CLIENT INPUT != TARGET AUTHORITY
INTENT_TEMPLATE_KEY -> SERVER REGISTRY -> TYPED SEMANTICS
UNKNOWN TEMPLATE -> REFUSE
```

No Prisma model, physical field, Action Engine class or migration was added.

## Implementation

- `intent-template.registry.ts` owns the closed `@1` recipes and rejects unknown, mismatched,
  undeclared-handle and carrier-inadmissible proposals before token creation.
- `envelope-validator.ts` closes the complete composer-input tree before hashing or persistence.
- `record-writer.ts` deterministically derives the token, floor, hashes, typed target, input schema,
  selection domain and audit-retained record fields.
- `emitter.service.ts` is the single compose -> type -> fit -> seal -> record pipeline.
- `successor-minter.service.ts` can mint only from a live, same-principal, same-turn, same-channel
  measurement predecessor and never reads a canonical business owner.
- `fixture-recorder.ts` exposes only the closed test-relevant projection and cannot record a raw
  token or raw provider payload.
- `WidgetEmissionModule` keeps seal-key custody with minting while exporting only the existing
  verifier/successor ports to the gateway.

## A2.2 backstop

While `MG-P01` remains open, the registry contains no actuating recipe. The three closed blocked
template identities produce the approved `LIMITATION` outcome and no actuating token:

```text
DRAFT: NOT MINTABLE
REQUEST_APPROVAL: NOT MINTABLE
COMMIT: NOT MINTABLE
```

The registry startup assertion rejects any actuating recipe before canonical `P-DISCHARGE`.

## Executable coverage

The P-MINT proof covers:

- deterministic minting of every currently supported non-actuating effect;
- `NONE` with no token and no intent record;
- unknown/version-incompatible templates and nested non-closed input;
- capability, handoff, role, kind, argument-handle and carrier mismatches;
- A2.2 blocked effects;
- seal verification and tamper refusal;
- exact Client-safe slotless rendering;
- single-field/cardinality-one slotted input;
- concurrent successor claims and restart-safe terminal outcomes;
- one mutation per registry/typing/backstop branch in `gateP-mint.json`.

## Scope and release state

`PRODUCTION DEPLOYMENT: NO`

`REAL BUSINESS EFFECTS: 0`

This record describes the implemented unit. Wave 2 certification is decided only by CKPT-M and the
final CKPT-W2 receipts on the final commit; this document does not substitute for either gate.
