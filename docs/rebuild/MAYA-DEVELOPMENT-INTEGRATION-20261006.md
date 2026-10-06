# MAYA: Occupancy + pricing + schedule local development candidate

Status: **local development integration; targeted checks qualified**. Code checkpoint
`ca9dc8a5d99e371e3b6d132b911eb44d3d0e8985` joins all three requested source commits.
Final targeted backend result: **16 suites / 339 tests PASS**. Headless shell:
**144 tests PASS**. No combined HTTP/PG/browser or production acceptance is claimed.

Worktree: `/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration`.
Branch: `codex/maya-development-integration-20261006`.

## Sources and exact provenance

| Lane | Preserved source HEAD | Lane common base |
| --- | --- | --- |
| Occupancy | `f9976ab601f0438676cf59a5d108bd719c2acd0e` | `c6a35e5c61975e9d101326e7b3970331f3c905d8` |
| Pricing | `4c8141e0d29e41df74fc7adfbfae9438d735d626` | `c6a35e5c61975e9d101326e7b3970331f3c905d8` |
| Schedule | `7b9d0ff5e556fa262d83f204a7a6892848dd8732` | `dcba8c8f4d230de31fb93f3d613f7524c3310df9` |

All source HEADs and clean worktrees were checked before and after integration;
all three commits are ancestors of this candidate. The schedule common base is
already an ancestor of the Occupancy/pricing base. Only four schedule commits
are added beyond that base; no extra website/provider work is imported.

The complete name/status deltas and exact overlaps are in
[provenance.json](evidence/maya-development-integration-20261006/provenance.json).
Occupancy overlaps pricing in `AiCoreService` and the completion map, and schedule
in `AiCoreService`. Pricing and schedule overlap in 16 runtime/widget/shell files.
[sources-preserved.json](evidence/maya-development-integration-20261006/sources-preserved.json)
records the final read-only source checks.

Local integration history:

1. `eb39ed43`: pin clean source provenance and overlaps.
2. `44a04e37`: merge approved pricing into the isolated Occupancy candidate.
3. `7b2f6cec`: merge schedule, resolving the shared owner seams.
4. `ca9dc8a5`: bound schedule clarification context and add cross-feature regressions.

No source branch was edited, no published history was changed, and no remote
push, merge, deployment, live provider/model or phone work was performed.

## Resulting behavior and conflict resolution

- The explicit web owner request “Проверь окна после отмен” retains the single
  existing C9 route to current C5/CRM evidence and a saved Occupancy proposal.
  It creates no business mutation authority and does not invoke mutable tools.
- Pricing retains its current catalogue binding and canonical APPROVAL owner:
  model-proposed IDs/numbers cannot override the user's fixed-price material.
- Schedule retains the existing command/approval/AE owners and its separate
  SETTINGS_DRAFT confirmation. No second orchestrator, generic capability layer
  or background initiator was introduced.
- The shared emitter has separate pricing and schedule context slots. Schedule
  linkage cannot occupy the pricing parameter. The writer receives both
  `bookingLinkage: booking ?? schedule` and its separate `servicePriceLinkage`.
  Both features still reject generic minting without their owner context.
- Noun resolution, DI bindings, effect routing and shell projections preserve
  both owner paths. Schedule failure may read its terminal receipt without
  accepting a refused pricing action. Price success retains its owner evidence.

Independent review found and closed two related context errors: a new pricing
request after a schedule date question was swallowed by the old draft; a phrase
such as “График Антона” after a staff question could be mistaken for the name.
Carryover now accepts only the requested date/time material. Staff answers are
validated word by word against forms/aliases of one member in the current tenant
catalogue, after role/tool checks, before schedule-day reads or preview/execute.
Other answers return to ordinary chat. This intentionally bounded parser does
not claim general natural-language understanding; unsupported clarification
forms return to the existing chat route.

## Policy and scope preservation

[preservation.json](evidence/maya-development-integration-20261006/preservation.json)
records matching Git object IDs for the approved V1.4 contract, V1.3 decision
record, pricing AE floors/families, release profile pins and Prisma schema/migrations.
The V1.4 `catalogue_price_configuration` exception remains exact to fixed-price
APPROVAL; MONEY remains true, ordinary money/marketing STEP_UP floors and B35
remain in place. It is not extended to SETTINGS_DRAFT. Presentation grants no
authority. Existing source/actor/tenant checks remain the owners' responsibility.

No new schema, retention rule or autonomy decision was inferred. No notification,
provider-once or main guest-site implementation was changed by the integration.

## Evidence and qualification boundary

[manifest.json](evidence/maya-development-integration-20261006/manifest.json)
pins the code commit and SHA-256 hashes of retained evidence, including unsuccessful
intermediate runs. The final backend result is
[qualified-targeted-unit.json](evidence/maya-development-integration-20261006/qualified-targeted-unit.json)
and its [command/result log](evidence/maya-development-integration-20261006/qualified-targeted-unit.log).
Shell results are in [shell-unit.log](evidence/maya-development-integration-20261006/shell-unit.log).

Regressions exercise one conversation across general chat, Occupancy, pricing and
schedule; direct switches from unfinished schedule clarifications; client-audience
authority; current catalogue material; distinct owner mint/commit routing; and
terminal projection isolation. Existing C9 source/revocation/foreign-tenant and
adapter tests are included in the targeted cohort. Model and source ports are
scripted/synthetic. The emitter uses an in-memory write double. These are not
provider or persistent-runtime acceptance tests.

Read-only independent review closed both P2 findings at `ca9dc8a5`; it found no
remaining code blocker. See [independent-review.txt](evidence/maya-development-integration-20261006/independent-review.txt).

Remaining qualification work:

1. **Heavy slot is held by parent provider acceptance.** Full typecheck/build,
   aggregate gates and combined HTTP/PG/browser runs were deferred as instructed.
   No new server, database or browser process was started for this integration.
   Earlier lane-specific runtime evidence is inherited history, not evidence for
   the combined candidate. Native pricing acceptance is also unclaimed.
2. **Existing restricted-profile release blocker.** Pricing adds `servicePrice`
   to `WidgetReleaseAccessAdapter.registryDigest()`, while
   `WidgetReleaseAccessService.bindMint` / `admits` require the pinned
   `PROFILE_REGISTRY_DIGEST` for `booking_chat_no_handoff_v1`. That pin is unchanged.
   Restricted scopes remain fail-closed pending separate release/profile
   qualification; this integration neither recertifies that profile nor updates
   a pin merely to pass. Full-scope development tests do not discharge it.
3. Real-model acceptance, live YCLIENTS outcomes, general background autonomy,
   production readiness and C10 completion remain unclaimed.
