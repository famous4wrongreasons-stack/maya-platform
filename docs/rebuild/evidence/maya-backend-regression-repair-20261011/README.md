# Backend regression repair — 2026-10-11

Baseline: `2709baf65779c7f08169d6b2fdf41b7bc9953191`.
Committed product/proof candidate: `6f48df0542468d0557e386d65f91cb9bb7b6a97f`.
Branch: `codex/maya-local-crm-setup-20261010`.
This is local functional development, not release certification or deployment.

## Why this unit exists

The previous complete backend run found 37 failures in 13 suites (9,562 passes).
Every exact failing case reproduced on the unmodified original `20a54384` source;
see `../maya-owner-telegram-link-20261011/baseline-failure-equivalence.json`.
Those historical receipts remain unchanged. This unit fixes the findings rather
than waiving them, and keeps the existing provider request limit of 98,304 bytes.

## Repair map and provenance

| Original finding | Current repair and reason | Product behavior |
| --- | --- | --- |
| 9 CRM guard tests | Follow `assertAppointmentBranchWitness`, introduced by `b251a36f` for shared reschedule/cancel source checks; 70 tests pass. | Unchanged. |
| Projector C9 hash; proactive/consent counts | Account explicitly for `245d3888` goods search and `995a87e3` rename preview as READ additions. Historical counts remain pinned after subtracting only these named deltas. | No new capability or authority. |
| Fixed release profile | Assert that those two development reads remain absent from successor admission. Compare the exact remaining registry. | Profile bytes/digests unchanged; no expanded grant. |
| A17 ownership ratchet | Follow qualified install/activation entries, which still build and execute through the existing Action Engine. Legacy admin entry remains checked. | Unchanged. |
| Initial Client registration ratchet | Name the one `8f6d9fa5` verified Telegram login caller; prove it delegates once to the canonical owner and does not directly write Client/CrmClientLink. All other callers remain refused. | No new identity writer or binding policy. |
| Static shell census | Preserve historical 38 + 4 modules, plus the five existing endpoint/setup/photo modules explicitly. | No packaging or carrier change. |
| CLIENT routing | Personal/public tools may reach planning, but business analytics and actual source execution remain refused. A separate empty-catalog test retains refusal before model use. | No role expansion or new routing. |
| 3 development price turns | Fixture now supplies the canonical validated semantic plan and source identity required by `0fce1034`, while forged model target/price are still replaced by server-bound values. | No bypass of the existing price preparation guard. |
| Planner taxonomy / response pins | Preserve all 92 intent rows (including `5f24fcbc` personal booking preparation); pin the existing owner-requested conversational tone from `d2b0cd72`. | Taxonomy and model instruction source unchanged. |
| Planner request overflow | Extend the existing request-local dictionary encoding to complete repeated slot declarations, aliases, ready-tool arrays and readiness notes. Full JSON values are compared, not partial fields. Direct `allowed_for_role` booleans stay direct. | Wire representation only; no permission, field, history, description, slot constraint or tool removed. |
| Missing Lifecycle denial projection | Make `602c9e25`'s `lifecycle_request` refusal explicit with its exact existing neutral fallback; preserve the original 127 and older 118 projection pins. | Same UNAVAILABLE/PROVIDER_SILENT/limitation result; no new Lifecycle authority. |

## Proof boundaries

All model/provider inputs and responses in this unit are local fixtures; no real
LLM, Telegram, SMS/OTP or YCLIENTS call is authorized or dispatched by this work.
The recorded compound request stays whole, including the actual assistant reply:
99,228 bytes before, 97,440 after. Both providers' first/later planner passes remain
subject to the unchanged 98,304-byte ceiling. Lossless reconstruction is checked
for every canonical field across eight role/feature catalogs and adversarial
slot/alias/permission differences. This proves transport integrity, not fresh
real-model language quality.

`planner-wire-mutations.mjs` works in a private copy of the exact committed
candidate. It requires green baselines before and after. Five deliberately broken
field/authority variants must fail the roundtrip proofs; exact pre-repair wire
source must fail the two original size cases. The main checkout is not mutated.
Results and raw receipt hashes are recorded separately when execution completes.

The profile, C9 registry, AI tool catalog, taxonomy, model instruction source,
chat authority source and effective profile evaluator are pinned unchanged in
`provenance.json`. Production, owner data, grants, schemas, design and iPhone are
untouched. This unit does not inherit or issue a release certificate.

## Executed results

- Full fresh backend on the committed candidate: **9,601 passed / 0 failed / 0 skipped**, 717 suites; 348.978 seconds.
- All 37 original failing cases are closed; no suite was excluded.
- Six targeted mutations killed; 31/31 green baseline and restored baseline. The exact old wire fails both original size duties.
- Backend typecheck/build and scoped lint pass.
- Widget Contract checker: 31/31 checks pass. It still prints four named untested prerequisites; this is not a full release admission claim.
- Runtime/carrier source and payload owner did not change. This unit does not claim a fresh runtime/carrier/iPhone acceptance run.

`summary.json`, `receipts.json`, and `planner-mutations.json` record the exact scope
and local raw-receipt hashes. The subsequent documentation commit changes no
product bytes; the executed proof SHA above remains the audit anchor.

## Live next-step boundary

Even a green full unit suite does not mean real owner Telegram/history acceptance
has run. That still needs the current React/callback on an authorized HTTPS return,
a bounded private-read mode of the existing launcher, current history consent,
and a fresh explicit allowance for actual private CRM/model use. The earlier
catalog-only live allowance is expired. No production deployment is implied.
