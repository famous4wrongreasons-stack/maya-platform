# Package 5 post-Wave-6 remainder — B9 wanted-slot schema decision STOP

Accepted checkpoint `e08625fd`. Waves 1–6 remain accepted 6/6; B7/B8 runtime
`4b96b546` remains the production baseline. Package 5 Final Gate remains FAIL
from the confirmed B9/A18 paths; Package 5 is not complete.

1. B9 contract reconstruction: COMPLETE. AI/read paths may never implicitly
   create Client, and `get_or_create_client` is forbidden as identity shortcut.
2. `get_referral_link` is read-only. Existing canonical state/configuration can
   be read; when no safe existing personal link presentation exists it returns
   unavailable. It cannot issue Client, referral, token, reward or value facts.
3. `remember_wanted_slot` has no honest canonical durable owner. Legacy SQLite
   `slot_waitlist` is the only storage; it embeds unapproved tolerance, expiry,
   fan-out and delivery semantics. OperationalWorkItem requires a staff Membership;
   Appointment is a booking; CustomerProfile and InboxItem have different owners.
4. Minimal Proposal V1 adds one tenant-qualified Client-owned
   `ClientWantedSlotInterest`, bound to ClientChannelLink, Client/Branch/Staff,
   successful AC1 ActionExecution and common mutation evidence. No backfill.
   AC4 source facts and AC5 matching stay distinct from communication delivery.
5. Owner decisions D1–D5 are required: match tolerance, expiry, active-request
   cap, recipients and fan-out. Recommended: exact time, expiry at desired start,
   max 10 active, Client-only eligible delivery, max three earliest matches.
6. **STOP** before schema/runtime/migration/ratchet/deployment. After approval,
   implement and prove both B9 branches, deploy if gates pass, then restart the
   entire 13-family Final Gate from scratch. A new bypass requires another STOP.

Preserve deployed B7/B8, all accepted waves, D1-A…D7-A, P02/P03 holds, Client
ownership, immutable evidence, tenant hard-delete prohibition and AC6 A30 owner.
No Wave 7, Chapter 7 or automatic Chapter 6 completion. Production mutations 0.
All 17 old databases remain untouched; owned processes/watchers/Chrome/temp DB 0.
