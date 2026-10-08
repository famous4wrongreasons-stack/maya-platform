# Exact-time booking and PublicBooking FK follow-up — 2026-10-08

An explicit booking preference such as «в 18:30» now filters the current source to that local time, preserves the preference through service clarification, and reaches the existing slot selector and confirmed AE path. A nearby time is never substituted. Ambiguous daylight-saving overlap and incomplete source data produce distinct bounded refusals. The working website, published migrations and provider adapter were not changed.

Code candidate: `b60dd55ffacba86fd2f81476e6708de439886770`, following accepted checkpoint `e5113addc422de7f5ced655ab438d0415b4c2681` on isolated `codex/maya-development-integration-20261006`. Runtime changes are confined to the existing AiCore/tool owners and Client appointment quote owner; no new capability, orchestrator, persistence store, schema or autonomy was introduced.

## Behavior and authority

- The registered availability READ accepts optional strict `HH:mm` with a selected staff member. It does not accept caller-supplied timezone authority or select a staff member automatically. The existing CRM owner supplies the current tenant/branch/staff calendar; that projection participates in READ identity and pre/post/replay checks.
- Filtering uses actual offset-qualified source instants, the requested local date and exact minute, without rounding seconds or manufacturing a missing DST hour. Foreign source rows are checked before filtering. No exact match, incomplete source and ambiguous local time remain different results; none establishes that the whole day is occupied.
- `prepare/find` stores the exact clock under its existing canonical `time_of_day` preference before early service/staff questions. A new explicit clock replaces the old one; changing service retains the clock. The existing transition to `create_own` carries only a valid exact time. Preferences never become booking authority.
- A new Client quote must preserve the requested instant through the existing wall-time conversion. A second overlap instant that would become the first is refused before deriving a new caller alias or looking up the first appointment. Fresh ambiguous or malformed slot data also refuses. For an explicitly bound durable alias, the input must match the exact stored `descriptor.startAt`; a different instant conflicts, while a matching alias retains its original replay/UNKNOWN path.
- The actual HTTP chat scenario now asserts that the final «В 18:30» READ contains only the matching source slot, although the source also offers other times. The existing separate Node carrier selects that slot, previews and confirms it; the case observes one successful create execution and the exact stored appointment instant. Presentation still grants no action authority.

This is deliberately bounded refusal of unsupported ambiguity, **not full support for both DST-overlap instants**. Shared time utilities and native provider serialization remain unchanged. Unkeyed historical recovery of a previously stored second instant is not newly qualified. The exact-alias UNKNOWN unit test proves routing without redispatch, not process persistence or real-provider reconciliation.

## Executed gates

The final rows use clean source `b60dd55f`; source and launcher/supervisor hashes stayed stable. Repeated attempts overlap and are not additive.

| Gate | Result | Limits |
|---|---|---|
| Targeted units | **469 tests / 7 suites PASS**, zero skips | Existing AiCore/model input cap, handler, registry, READ runtime, Client quote and selector adapter suites |
| Backend/live/contract types, changed-file lint, contract checker, K3 | **PASS** | Existing contract checker qualifications remain; no generated contract/certificate promotion |
| HTTP/PostgreSQL booking cohort | **13 tests / 3 suites PASS**, zero skips | Actual local Nest/PG and separate headless Node carrier; scripted model and synthetic/internal sources |
| Fresh PostgreSQL migration validate/deploy/status | **PASS** | Existing unchanged migration chain applied only to a new owned database |
| Schema diff | **FAIL**, exactly three PublicBooking FKs | Overall HTTP runner remains FAIL; its functional result is separately PASS |
| Scratch supervisor | **3 cases PASS** | Normal parent exit with a surviving descendant, timeout, cancellation during cleanup; actual owned groups absent |

The first unit attempt at `4bac6a30` had 467 PASS and one failure: time was lost after service correction. `b768c9aa` fixed that defect and added the early clarification regression: 469 tests and backend/live types passed, then lint found three generic-arrow formatting commas. `b60dd55f` removes only those commas and passes the final finite gate. Failed reports remain failed in the evidence; no source changed during a run.

Every final owned Node process group closed and became absent. The fresh PostgreSQL cluster stopped and its PID file is absent. The loopback preload is an applicable Node TCP boundary, not a measured global egress count. Positive fixtures intentionally write owned internal calendar/AE/fixture state; there is no global zero-effects claim. No real model/provider/OCR, SSH, production, HTTPS, phone, deployment, push or merge action was performed.

The earlier full 7,237/645 backend and 562/57 HTTP results remain bound to `4023c4d5` in the [unified checkpoint](MAYA-UNIFIED-REGRESSION-CHECKPOINT-20261008.md). They were not rerun or relabeled. This follow-up adds no actual browser or PostgreSQL restart acceptance; the separate Node carrier is not a browser.

## PublicBooking: exact unresolved choice

Source inspection confirms that `b3fdbfe1a70ef1bb3232f1a3895a89c32e811f64` introduced the mismatch in both declarations: migration SQL defaults to `ON DELETE NO ACTION`; Prisma explicitly asks for `ON DELETE RESTRICT`. All four guest migration byte checksums are unchanged. The new fresh PG catalog again reports NO ACTION for deletion/update, validated and nondeferrable, for exactly:

1. `PublicBookingSession.tenantId → Tenant.id`;
2. `PublicBookingQuote.(sessionId, tenantId) → PublicBookingSession.(id, tenantId)`;
3. `PublicBookingAttempt.(quoteId, sessionId, tenantId) → PublicBookingQuote.(id, sessionId, tenantId)`.

The preserved 18-case SQL proof demonstrates the semantic difference: both refuse ordinary referenced-parent deletion; only NO ACTION permits same-statement deletion and reinsertion of the same parent key. That historical proof was inspected, not rerun. Existing guest APIs and rollback preservation requirements do not choose this service-operation behavior. Independent review agrees that conditional authorization to fix an *unambiguous* inconsistency does not select one variant.

**The dependent correction migration remains paused.** Recommended exact owner choice: prohibit that same-statement replacement for these three relationships and align them with the declared RESTRICT using one new forward migration. The alternative explicitly retains NO ACTION and aligns Prisma. Neither choice edits published migration bytes or grants erasure/production authority. Fresh/upgrade qualification of a correction was not run because no correction was written. See [the exact decision and provenance](MAYA-PUBLIC-BOOKING-FK-CHOICE-20261006.md).

## Evidence and review

[Package manifest](evidence/maya-development-integration-20261006/exact-time-booking-20261008/manifest.json) binds the public files and this documentation. [Gate summary](evidence/maya-development-integration-20261006/exact-time-booking-20261008/gates/summary.json), [source binding](evidence/maya-development-integration-20261006/exact-time-booking-20261008/gates/source-binding.json) and [independent review](evidence/maya-development-integration-20261006/exact-time-booking-20261008/final-review.json) retain source, scope, failed attempts and qualifications. Metadata and schema observations are exact copies; Jest projections omit failure/console/auth payloads and hash test identities. Private auth logs, receipts, environment files and PG data are excluded. Included launchers preserve historical absolute paths as provenance, not portable commands.

The previous unified package's document hashes refer to the documentation in `e5113add`; this checkpoint intentionally updates the current maps without altering that historical evidence package.

## Remaining product blockers

- **PublicBooking FK semantics:** the exact replacement prohibition above remains pending; schema gate is still red.
- **Schedule card, minimum decision:** «Разрешить только для графика одного мастера за один день исправление обычным сообщением в чате вместо отдельного редактора, после каждой правки заново показать “было/стало” и потребовать новое подтверждение?» This is only the existing `schedule_rule`/A15 branch of SETTINGS.4. Other SETTINGS_DRAFT/HANDOFF remain closed. [Exact proposed contract](MAYA-DEVELOPMENT-PROFILE-CHOICE-20261006.md#minimal-owner-choice); **not approved or implemented**.
- **Initial Client identity:** initial-only trust without a verified predecessor still needs the existing exact choice; already verified Client flows remain usable.
- **C10:** exact pilot tenant, background principal/trigger and bounds remain undecided. Explicit C9 work remains available; no scheduler or fabricated expiring user event was added.
- **Engineering/external qualification:** actual browser UNKNOWN-to-CONFIRMED receipt observation, native reschedule UNKNOWN restart, broader multi-company management and privacy package/ledger/design qualification remain. Real YCLIENTS rights/responses, model quality and goods OCR/admission are unaccepted. Remote access and paid/production actions are not authorized by this follow-up.

This is a qualified local development checkpoint, not completion of MAYA/C10 or release authorization. `NOT_ISSUED`.
