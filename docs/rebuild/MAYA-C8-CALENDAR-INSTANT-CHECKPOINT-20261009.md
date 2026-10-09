# C8 calendar instant qualification — 2026-10-09

The explicit Lifecycle READ now refuses a calendar deadline when the requested local time has zero or multiple matching instants. Existing version-1 dormancy results whose legacy deadline differs also lose CURRENT qualification; their historical bytes remain unchanged. This is a bounded C8 defect repair, not complete calendar, live YCLIENTS, model or MAYA/C10 acceptance.

Final runtime: **`b2a752949cc43636a01d492b06f6d54050fc4dfd`**. Intermediate inverse/currentness implementation: `dda9ccfa9860c3ce70503ffdb8226e8a8b6c7622`. Starting committed checkpoint: **`5babbc22dd5980c8df4bc3eadf844da4ec1679df`**, whose [two-month proof](MAYA-C8-TWO-CALENDAR-MONTH-READ-20261009.md) and archived results are unchanged.

**332 tests / 20 suites PASS**, zero failed or skipped. Production and focused types, scoped lint PASS. Independent source review and its final legacy-compatibility follow-up are archived with the [evidence manifest](evidence/maya-c8-calendar-instant-20261009/manifest.json). No new actual HTTP/PostgreSQL/restart or real-provider/model proof was run.

## Exact defect and existing contract

[P01 calendar semantics](CYCLE-08-P01-FOUNDATION-IMPLEMENTATION.md) require elapsed days and tenant-local calendar months with month-end clamping; the same document fixes immutable admissions, fenced unavailable completion and no silent fallback. [The approved implementation decision](CYCLE-08-LIMITED-DATA-IMPLEMENTATION-DECISION.md) permits repairs in these existing owners. `c8.policy.ts` defines elapsed unit/count/comparison but no earlier/later or gap-shift policy. Therefore refusing an unrepresentable/nonunique instant implements the existing safety boundary without choosing new product semantics.

The initial unchanged-runtime RED contained 17 cases: **7 failed / 10 passed**. [Actual before/after execution](evidence/maya-c8-calendar-instant-20261009/gates/before-after.json) uses the committed baseline's `c8.time.ts` and local ICU 78.2 / tzdata 2026a. All examples preserve seconds and milliseconds. Forward and backward NY cases are separately recorded.

| Zone and target local time after two calendar months | Previous actual result | Qualified outcome |
| --- | --- | --- |
| America/New_York, 2026-03-08 02:30:45.123 | 06:30:45.123Z = local 01:30, for both directions | UNAVAILABLE: local time does not exist |
| America/New_York, 2026-11-01 01:30:45.123 | Silently selected 05:30:45.123Z; 06:30:45.123Z is also a match | UNAVAILABLE: two possible instants |
| Australia/Lord_Howe, 2026-10-04 02:15:45.123 | 2026-10-03 15:45:45.123Z = local 02:45 | UNAVAILABLE: 30-minute gap |
| Australia/Lord_Howe, 2026-04-05 01:45:45.123 | Selected 2026-04-04 15:15:45.123Z; 14:45:45.123Z also matches | UNAVAILABLE: 30-minute fold |
| Pacific/Apia, 2011-12-30 12:15:45.123 | 2011-12-30 22:15:45.123Z = local December 31 | UNAVAILABLE: skipped civil day |

## Implementation and version-1 compatibility

- `c8.time.ts` resolves a Gregorian local tuple, including **local** seconds, to exactly one instant. It enumerates integral-second offsets within the explicit supported ±24-hour domain, rather than sampling transitions or silently choosing an offset. AD years 1–9999 are supported by the inverse; unsupported input, zero matches and multiple matches use `C8CalendarInstantUnavailable`. Elapsed-day arithmetic remains exactly 86,400,000 ms per day.
- A maximum of 256 pure inverse results are cached by zone and complete whole-second target. Milliseconds are added to a fresh Date for every call. No source, actor, policy or tenant-currentness decision is cached. The helper reads the process's ICU timezone data; it is not an all-IANA/all-history guarantee.
- `C8Producer.resume` catches only that typed domain error after `publishResult` rolls back and invokes existing fenced `publishUnavailable` with the **same lease** and finite `calendar_instant_unavailable` reason. Unrelated source, database and fencing errors still propagate. Repeated terminal resume does not claim/publish again. Calls that fail before admission are explicit refusals, not terminalized PENDING rows.
- `C8Store.refsCurrent` checks PUBLISHED dormancy inputs against the exact locked current A22 policy using existing `GovernedSettingsReadService`. It does not introduce a C8Sources dependency cycle. The existing recursive exact C8 dependency checks propagate refusal to ranking parents; the exact reader withholds unavailable history. No published value, hash, state or expiry is rewritten.
- Store constructor wiring is updated at six manual call sites in four existing chapter-8 proof scripts. Existing module imports already export the governed reader. No new owner, policy field, schema, retention class or scheduler is added.

Final review caught an additional version-1 issue in the intermediate implementation. Paris `1880-01-01T12:00:45.123Z` plus two months previously became `1880-03-01T12:01:24.123Z`, losing local seconds; the correct unique instant is `1880-03-01T12:00:45.123Z`. UTC year `0099-12-31` previously jumped to `2000-02-29` instead of `0100-02-28` through Date.UTC's year coercion. A uniqueness-only guard would have left those older values CURRENT.

The final code therefore also requires **legacy deadline compatibility** for version-1 calendar dormancy. For ordinary years it compares the unique target with the untouched legacy converter plus the old source-UTC-seconds behavior; years below 100 are conservatively refused. The legacy result is only a validation comparison, never a fallback answer. This validates the admitted input/deadline without recomputing the published boolean. Mismatch withholds old rows and makes new version-1 computations UNAVAILABLE. Supporting these corrected historical inputs as usable results needs separately versioned qualification; this checkpoint does not migrate or silently reinterpret history.

## Executable evidence and review

Final [regression-r2 JSON](evidence/maya-c8-calendar-instant-20261009/gates/regression-r2.json) and matching log: **332 PASS / 20 suites / 0 skipped**. This includes 24 inverse cases, 13 actual producer cases, 34 actual store/reader cases, existing C8 contracts/architecture/readers and five C9/ingress Lifecycle suites. These are component tests with synthetic source/configuration/SQL ports. The store and exact reader execute their actual methods; this does not prove real SQL fencing, encryption, PostgreSQL durability or restart.

Production and focused typechecks cover runtime, all valuation tests and the four changed proof scripts. Final lint covers all changes: the final r2 check covers the four files changed after the preceding complete scoped lint. The [execution receipt](evidence/maya-c8-calendar-instant-20261009/gates/execution-receipt.json) records observed tool exit codes, since an empty successful lint/type log alone does not encode success.

Initial RED, the initial lint errors and incomplete typed fixture failure are retained. The fixture was repaired with full model fields; no suppression was added. Overlapping 24/35/328/332 runs are not summed. The intermediate 328-test proof predates the extra legacy compatibility guard and is not final acceptance.

[Cold/warm inverse observations](evidence/maya-c8-calendar-instant-20261009/gates/calendar-observations.json) measured about 48–115 ms cold and 0.16–0.18 ms cached on this Mac/Node 24.15.0. These are synthetic single-input local observations, not maximum-cohort, transaction-deadline, lease or production performance qualification. The before/after and timing artifacts bind the intermediate inverse implementation; final r2 tests additionally bind its compatibility guard.

## Remaining boundaries

The named defects and bounded component path are qualified. No broader calendar completeness, all-history/all-zone acceptance, large-cohort load guarantee or actual new HTTP/PG/restart/DI integration claim follows. Other historical calendar-derived result families were not audited or migrated.

No live YCLIENTS, paid model, production/HTTPS/phone, outbound delivery or business mutation was invoked. Website, frozen9/handoff and launcher hashes remain unchanged as recorded in [read-only protected-state evidence](evidence/maya-c8-calendar-instant-20261009/gates/protected-read-only.json). No push, merge, deploy, schema/retention decision or background autonomy was performed. The existing original81 classification remains **57 PASS / 12 unsupported / 10 insufficient / 2 clarification_pending**; these supplemental regressions add no original-corpus PASS. Overall MAYA/C10 remains **NOT_ISSUED**.
