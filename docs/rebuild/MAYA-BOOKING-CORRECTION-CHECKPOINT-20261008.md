# Short booking correction — 2026-10-08

A reproduced context-carry defect is fixed: after a previous `14:30` selection,
a current `15:00` correction encoded as `time_of_day` could still cause an
availability READ for `14:30` when the task changed from finding a slot to
preparing a booking. This was a preference normalization defect, not a missing
owner permission. Existing source reads, current tenant/branch checks, C9 and
confirmation/AE authority remain in place.

Code: `6c989c87a7737b30eb178590e48bb82c33f0e5cf`, parent accepted checkpoint
`9c1c598bb3524a0a47dc73fdf05a6053af10123f`. Four TypeScript files changed: two
existing owners and their two existing test suites. The semantic owner now
normalizes this turn's `time`/`time_of_day` before carrying previous preferences,
only for the three existing personal-booking intents. Contradictory current
values are rejected. The late AiCore normalization was removed.

| User path represented by scripted semantic turns | Observed result | Evidence boundary |
|---|---|---|
| Previously selected 14:30 → “No, 15:00” while preparing the booking | Red: READ incorrectly used 14:30. Green: fresh READ uses 15:00 and retains branch, staff, service and date | Actual AiCore and semantic validator; model selection, source/runtime and timeline mocked |
| Change service and day and ask for evening → answer the clarification with 19:00 | Evening causes a time question with no availability READ. Next READ uses 19:00 with the corrected service/day and retained branch/staff | No arbitrary evening cutoff, old-time fallback or appointment mutation |
| Current plan supplies two conflicting clock fields | Plan is rejected instead of selecting either time; matching values normalize to one field | Validator boundary, not a real-model misunderstanding rate |

**Executed finite checks:** 241 tests / 3 suites PASS, zero skips; backend types,
changed-file lint and K3 PASS. Seven focused regressions were added to existing
suites. The earlier selected red run contains one failure and 204 tests excluded
by the test-name filter. Its failure remains recorded; runs are not additive.

The green run executed accepted HEAD plus the four-file working patch. The later
code commit was verified byte-for-byte against its patch hash and all six
recorded source-file hashes. It is not described as a clean-HEAD test run. Source
and harness stayed stable; every owned Node process group closed and became
absent. No HTTP/PostgreSQL/browser/restart/provider/model test was run in this
follow-up. Prior exact-time and unified results retain their original source
bindings; they are not new aggregate acceptance for this commit.

[Evidence manifest](evidence/maya-development-integration-20261006/booking-time-correction-20261008/manifest.json)
binds red/green reports, sanitized Jest projections, the executed launcher,
commit binding and review summary. Independent review found no new authority or
code blockers. This is scripted local mechanics, not a percentage claim about
natural-language quality. No new schema, retention, autonomy, CRM mutation,
outbound, working website, production, SSH, paid call, push or merge change.

## Remaining choices and independent work

- PublicBooking still has exactly the previously observed three FK differences;
  this follow-up did not run or change the database. Recommend prohibiting
  maintenance replacement of a referenced salon account, guest session or quote
  under the same ID while child history remains. This prevents that history from
  being attached to a replacement parent; ordinary existing API behavior is
  unchanged. [Plain Russian recommendation and pending exact choice](MAYA-PUBLIC-BOOKING-FK-CHOICE-20261006.md#рекомендация-для-владельца--без-выбора-sql-терминов).
- The [one-master/one-day schedule card choice](MAYA-DEVELOPMENT-PROFILE-CHOICE-20261006.md#minimal-owner-choice)
  remains pending. Initial Client trust and scoped background C10 remain separate
  decisions; this correction grants neither.
- Independent safe work remains: reproduce a concrete topic-return or compound
  context gap; observe UNKNOWN→CONFIRMED through the existing receipt READ in the
  actual React carrier; qualify native reschedule UNKNOWN across application/PG
  restart. These are still open, not silently included in the current tests.
  Heavy HTTP/PG work must retain the parent's serial resource coordination.
- Real-model qualification remains paused on the existing inventory approval.
  The prior SSH denial stands; no retry or alternate access was attempted.
  Real YCLIENTS rights/responses and multi-company management remain separately
  unaccepted. Synthetic success is not 99% product quality or completed MAYA/C10.

`NOT_ISSUED`: no release authorization or certificate.
