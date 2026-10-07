# Ordinary booking — development checkpoint

An explicit Client request such as «Хочу записаться» now enters the existing service selector, then staff selector, then asks for a date. A fresh explicit date turn revalidates the saved choices and opens current availability. The current React chat renders that date question without an automatic follow-up request. This is development work; the working website is untouched.

## Implementation boundary

- The existing semantic task state carries service, staff and local date preferences; corrections change the supplied parameter and retain the others. There is no phrase-routing planner or second orchestrator. Time is selected through the existing time-slot widget; semantic filtering by an exact spoken/typed time is not qualified here.
- Native catalog service and staff references now carry the same bounded branch/source witness as the slot. Cache identity, current catalog/availability reads and minting compare that witness. A changed or unavailable source refuses; it cannot relabel cached facts with a new revision. Internal references remain unscoped. Historical mixed raw catalog plus scoped-slot references safely refuse and require a fresh request.
- A new explicit chat turn can recover accepted closed service/staff choices from existing retained Class A records, receipts and submission audits. The timeline owner enforces tenant, principal, conversation, active turn, retention and erasure boundaries. Ambiguous/replayed choices, foreign data, overflow and intervening action/new-selection barriers do not become preferences. This recovery grants no booking authority.
- The existing post-gateway store writes the accepted choice audit. Wire profile and nonce remain audit metadata behind a narrow port; neither participates in gate policy or the recovery query. No schema or retention change was introduced.
- Canonical preview, explicit confirmation, verified Client authority and the existing Action Engine still own booking admission and effects. Initial Client binding remains a separate product/authority decision; the local fixture uses a synthetic verifier to establish an already verified Client.

## Verification status

At code candidate `d614e888ceb2bf647dc6033e35490ab3d5373207`, targeted backend checks pass: **620 tests in 19 suites**, full widgets-live TypeScript and scoped lint (zero errors, two existing test-helper warnings). The shell has 12 pending-date intent checks; the ordinary browser network guard has five checks and the driver has five. Shell build and React typecheck pass. Independent source review found no remaining runtime blocker after source-window, audit, cache and late-mint refusal fixes.

The final runtime correction at **`d86f36cb0a100a89032c28c2f95252479b68ae69`** fixes numeric service IDs recovered from accepted choices: the model sees only a request-local private alias; the existing sanitizer restores only that registered accepted service for the fresh catalog bind. An unrelated branch alias with the same numeric value cannot become a service alias. A successful bind persists the public service meaning. The affected six-suite run passes **345 tests**; a final AiCore run after the alias-collision guard passes **194 tests**, and types/scoped lint pass. These overlapping counts are not added to the earlier 620.

### Actual HTTP and PostgreSQL restart

The [HTTP04 artifacts](evidence/maya-development-integration-20261006/ordinary-booking/http-04/manifest.json) pass at `d86f36cb`. All **1,647 source/harness paths** match the exact candidate's Git blobs; process PID and PostgreSQL start time differ between prepare and resume. Both saved Jest results pass and the owned cluster stopped.

Two partial-choice scenarios survive restart with their original accepted audits unchanged. One concurrently submits two staff choices: exactly one wins; the loser and a later altered replay cannot append a new preference. Each new explicit date turn performs five fresh provider reads, revalidates the bound branch and creates a fresh time selector, with zero booking effects and no inferred date.

| Persisted state before restart | Explicit retry after restart | Booking POSTs added after restart |
| --- | --- | --- |
| READY, current source/facts | 201; SUCCEEDED | 1 |
| READY, changed source metadata | 409 `booking_preview_stale`; FAILED | 0 |
| READY, changed timezone | 409 `booking_preview_stale`; FAILED | 0 |
| READY, changed price | 409 `booking_preview_stale`; FAILED | 0 |
| READY, revoked Client binding | 403; remains READY, attempt count 0 | 0 |
| Already UNKNOWN, attempt count 1 | 503 `crm_outcome_unknown`; remains UNKNOWN, including three concurrent replays | 0 |

All six action cases retain the original evidence hash, one canonical booking admission and one idempotency binding, without approval creation. Result READ is inert. **READY is a separate SB-1 personal HTTP seam:** real authorization and canonical admission execute, then the synthetic runtime seam throws before claim. This is not a production crash-equivalence claim or a widget COMMIT interrupted at READY. UNKNOWN is created by a real synthetic transport attempt before restart. The two phases total two synthetic booking POSTs and three separately counted read-only reconciliation search POSTs; real model calls are zero, with four scripted semantic decisions. A17 setup actions are counted separately.

The [three failed HTTP attempts](evidence/maya-development-integration-20261006/ordinary-booking/failed-http-attempts.json) remain qualified: early harness import cycle; obsolete harness audit-profile filter; then the actual numeric preference privacy roundtrip defect. Their clusters stopped and their original evidence was not overwritten. Independent read-only review verified the 1,647 Git bindings, all six raw/archive JSON pairs, outcomes, restart identities and cleanup.

### Current React browser

The [browser02 artifacts](evidence/maya-development-integration-20261006/ordinary-booking/browser-02/manifest.json) pass at **`db2cd1a45edb1df49667213b17058561020bd006`**, with the same production runtime as HTTP04. All **1,712 source/harness paths** match that commit's Git blobs. This is the current React web build, actual debug-email UI login, real HTTP and owned PostgreSQL: **three scenarios, 27 checkpoints and 27 screenshots**. The browser independently proves reload/relogin; the process/PG restart is the separate HTTP proof above.

Both «Хочу записаться» and «Запишите меня, пожалуйста» reach the service selector. After choosing a service, reload/relogin does not revive the historical staff control; a new explicit «Продолжим запись» revalidates the choice and emits a fresh staff selector. Accepting staff produces the exact question «На какую дату проверить время у выбранного мастера?» without a guessed date. Service, staff and date corrections retain the other parameters and branch witness through fresh availability, preview and explicit COMMIT.

Success and UNKNOWN each produce one synthetic booking POST; reload/relogin adds none. Changed source before COMMIT returns exact Gate 11 `superseded / handle_stale`, with zero booking AE rows and POSTs. The three guards report zero blocked requests/errors and the backend reports zero forbidden transport calls. There are **18 scripted semantic decisions**, including three staff corrections using actual request-local private mentions; these are not real model decisions. Two synthetic booking POSTs and three read-only reconciliation search POSTs are counted separately. Owned resources completed cleanup.

The [first failed browser attempt](evidence/maya-development-integration-20261006/ordinary-booking/failed-browser-attempts.json) remains qualified. Its finite stub expected a raw synthetic staff name after the privacy layer projected the request. The correction is harness-only: use a distinct synthetic name and carry the exact observed private mention as the new semantic preference. Production privacy and browser expectations were not relaxed. No real language-quality claim follows from the two authored paraphrases.

Reviewed pixels include the [corrected preview](evidence/maya-development-integration-20261006/ordinary-booking/browser-02/screenshots/success-preview.png), [UNKNOWN](evidence/maya-development-integration-20261006/ordinary-booking/browser-02/screenshots/unknown-result.png) and [stale-source refusal](evidence/maya-development-integration-20261006/ordinary-booking/browser-02/screenshots/stale-result.png). Accumulated historical selector cards, repeated metadata/«Нет данных», the incomplete-history notice, dense layout and technical timezone/currency formatting remain presentation limitations for the separate design task. This functional checkpoint does not accept a completed redesign.

The [combined manifest](evidence/maya-development-integration-20261006/ordinary-booking/manifest-final.json) binds **58 artifacts**, SHA256 **`00a0bbbb69f25053129373a31aae2997cf631dd8bae2503e528f944f61b685ac`**. Private restart receipts, authentication payloads, debug codes and credentials were not archived. Independent read-only review verified both exact source sets, raw/archive JSON and screenshot correspondence, code/fixture distinction, outcomes and stopped clusters. No remaining blocker was found inside this bounded functional checkpoint; the reviewer did not launch tests or services.

## Remaining acceptance limits

No live YCLIENTS/model request, notification, production/site/device change, push or merge was performed. Synthetic transport and scripted semantic decisions cannot establish real provider or language acceptance. The canonical callable history-erasure route remains absent (`GAP-HISTORY-ERASE`); this work does not fake HTTP erasure by changing fixture rows. No C10 background initiator, autonomous trigger or C10 completion is admitted.

The checks are targeted, not receiving-branch aggregate or deployment-image certification. Native reschedule UNKNOWN restart, real initial Client trust, real language/provider behavior and semantic exact-time filtering remain outside this accepted slice. No new schema, retention rule, general capability framework or independent orchestrator was added.

The [real-model prerequisites](MAYA-REAL-MODEL-PREREQUISITES-20261007.md) identify the existing diagnostic host and historical principals. A pinned, bounded metadata collector is ready; its single remote read-only permission request awaits an explicit response. No SSH, credential read, setup or paid run has occurred.

Status: **implemented and locally tested for this bounded path; release-authorized no; deployed no; real end-to-end accepted no; MAYA/C10 complete no.** Heavy slot released after all owned proof resources stopped. The working website and the separate design worktree were not edited.
