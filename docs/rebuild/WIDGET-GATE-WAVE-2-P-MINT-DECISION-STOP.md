# Widget Gate Wave 2 — P-MINT owner-decision stop

## Verdict

`WAVE 2 UNITS: 8/9`

`WAVE 2 CERTIFIED: NO`

`P-MINT IMPLEMENTATION STARTED: NO`

`CKPT-W2 RUN: NO`

`PRODUCTION DEPLOYMENT: NO`

`REAL BUSINESS EFFECTS: 0`

Wave 2 is preserved through U13a. The next canonical unit, P-MINT-CORE, cannot be implemented without
inventing an authority-bearing proposal-to-intent typing rule that Contract V1.1 does not define.
Decision Sheet 08 records the minimal owner decision and recommends Option A.

## Completed canonical order

| Order | Unit | Result |
|---:|---|---|
| 1 | I-MIG2 | PASS |
| 2 | P-23 | PASS |
| 3 | P-HANDLE | PASS |
| 4 | U6-L3 | PASS |
| 5 | U7b | PASS |
| 6 | P-G15a | PASS |
| 7 | U9b | PASS |
| 8 | U13a | PASS |
| 9 | P-MINT-CORE | BLOCKED — owner decision required |

The original widget migration provenance check concluded:

`ORIGINAL WIDGET MIGRATION APPLIED ANYWHERE RELEVANT: NO`

The approved fold therefore remained within the undeployed migration. Production stayed dark and no
production migration or business effect occurred.

## U9 and U13 executable evidence

- U9 full mutation corpus: 35/35, `AS-DECLARED`, unexpected survivors 0. Durable receipt:
  `docs/rebuild/evidence/maya-chat-first-ux/wave2/u9-mutation-report.json`.
- U13 full mutation corpus: 16/16, `AS-DECLARED`, all build-killed, mismatches 0, no filters or partial
  partition. Durable receipt:
  `docs/rebuild/evidence/maya-chat-first-ux/wave2/u13-mutation-report.json`.
- U13 final-head ordinary gate on `f29002dd33de88e8e7a50e6dd8796e2deb47ce8c`:
  - unit regression: 541/541 suites, 5128/5128 tests;
  - application and scripts typechecks: PASS;
  - lint: PASS with 0 errors and 9 pre-existing warnings;
  - build: PASS;
  - K3 structural checks: 10/10 PASS;
  - widget-live typecheck: PASS;
  - live PostgreSQL: 15/15 suites, 270/270 tests PASS;
  - production-binary HTTP: 13/13 PASS, health 200.

The first final live run had a single `socket hang up` at F88-1 after 269/270 passing checks. It was not
an assertion mismatch. On fresh proof databases, the exact F88 suite passed 7/7 and an independent full
live run passed 270/270 without any code change. The durable classification is recorded in
`docs/rebuild/evidence/maya-chat-first-ux/wave2/u13-ckpt-m-summary.json`.

## Exact P-MINT gap

P-MINT must take only `WidgetComposerInput` plus the authenticated principal and derive the exact
`WidgetIntent`/record. The only intent-shaped input, `IntentProposal`, supplies capability or handoff
capability, argument handles and role. It intentionally supplies no effect, target, input schema,
priority, single-use rule, confirmation relation or floor.

Contract V1.1 also forbids inferring effect from C9 resource class: the same C9 key may be used for
`REFINE` or `DRAFT`. Repository evidence contains no other deterministic proposal-to-intent mapping.
Choosing a default would create new business/security semantics inside implementation.

The required invariant is:

`ONE CLOSED PROPOSAL IDENTITY -> ONE SERVER-OWNED TYPED INTENT RECIPE`

## Recommended decision

Decision Sheet:
`docs/rebuild/DECISION-SHEET-08-P-MINT-INTENT-TYPING.md`.

`RECOMMENDED OPTION: A`

Add one non-authority proposal discriminator, `intent_template_key`, resolved through a closed,
versioned, server-owned intent-template registry. The registry, rather than the projector, fixes effect,
target recipe, input-schema recipe, priority, single-use, expiry and confirmation semantics. Unknown or
mismatched templates fail closed.

Impact:

`NEW DATABASE MODELS: 0`

`NEW PHYSICAL FIELDS: 0`

`NEW ACTION CLASSES: 0`

`MIGRATION REQUIRED: NO`

`CONTRACT/GENERATED TYPE UPDATE: YES`

The A2.2 backstop remains unchanged while MG-P01 is present:

`DRAFT: NOT MINTABLE`

`REQUEST_APPROVAL: NOT MINTABLE`

`COMMIT: NOT MINTABLE`

No actuating template may be registered before canonical P-DISCHARGE.

## Exact next step

Owner approval of Decision Sheet 08 Option A is required. After approval, resume P-MINT-CORE, run its
complete exit/mutation evidence, then run CKPT-W2 on the final Wave 2 HEAD. Wave 3 remains unstarted.
