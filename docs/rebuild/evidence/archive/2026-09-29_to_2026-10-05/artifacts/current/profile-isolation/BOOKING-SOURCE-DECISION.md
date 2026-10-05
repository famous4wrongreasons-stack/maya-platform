<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 548ae5552276a593aa59a67a2d66360b1b51951c75953428d0abfe3b406fc6b8 -->

# Initial personal appointment source — decision required

This packet concerns G7-5, G7-BOOK1, G11-I9 and G13-I3. It does not change HANDOFF STOP, 9.6, the release profile threshold or production authorization.

## Observed contract boundary

The canonical cancellation/reschedule propose owners, noun revalidation, confirmation minter and commit owners exist. Their production-source evidence still lacks an initial appointment-specific widget producer. The registered `refine.booking.cancel@1` and `refine.booking.reschedule@1` recipes require SCHEDULE and canonical appointment nouns.

The current SCHEDULE owner class (§2.6.6 of MAYA-WIDGET-CONTRACT-V1.md) admits only `staff.schedule.read`, `staff.schedule.own.read`, `operations.journal.read`, and `company.business-hours.read`. The journal's PII-free result deliberately excludes CRM appointment identifiers; its presenter uses display-only `journal-entry-N` references. Those references are not appointment authority. `appointments.own.list` is a personal-client owner, but is not a SCHEDULE_READ owner under the current contract.

Matching a journal row to a personal appointment by time, phone, staff or display index would invent identity. Giving a business owner a customer's appointment would violate the accepted personal-client authority boundary. Neither is implemented.

## Option A — narrow personal-client SCHEDULE source

Approve `appointments.own.list` as an additional SCHEDULE_READ source, restricted to the server-resolved, currently verified personal-client context. The source returns only that exact Client's canonical appointments and server-owned opaque appointment handles. A handle is an input to fresh owner resolution, never authority on its own.

The initial widget may propose cancel/reschedule through the existing canonical keys. Reschedule targets must come from the booking owner's closed availability domain; no free date/time or caller-authored appointment id is admitted. The existing confirmation, readback, current verification/revocation, gate ordering and Action Engine admission remain mandatory. `TENANT_OWNER != CLIENT` and `CLIENT_ROLES` remain unchanged. Acting on another customer's booking remains out of scope.

Implementation must first prove that existing identity/handle persistence can carry the exact source binding. No new table/column/migration is authorized by this packet. A genuine persistence gap requires a separate minimal schema decision.

## Option B — preserve the source boundary

Keep the four clauses false/STOP pending a separately approved initial source. Existing booking-create paths continue to work in synthetic proof, but the restricted profile cannot be certified: these four duties are applicable and cannot be excluded.

## Recommendation

Option A. It gives the already-approved personal-client context a canonical entry to the existing cancel/reschedule owners, while preserving the business-owner boundary. This is approval of a narrow contract extension and synthetic implementation only, never permission for real booking or production activation.
