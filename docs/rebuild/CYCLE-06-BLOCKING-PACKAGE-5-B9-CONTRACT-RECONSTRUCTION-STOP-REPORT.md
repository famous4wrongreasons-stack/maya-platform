# Package 5 Final Remediation — B9 contract reconstruction STOP

Date: 2026-09-04. Accepted checkpoint `e08625fd`. B7/B8 runtime `4b96b546`
remains the accepted production baseline. This is Final Remediation, not Wave 7.

The required reconstruction found no honest canonical durable owner for
`remember_wanted_slot`. The user's new schema/business blocker STOP applies.
No schema, migration, runtime, ratchet, deployment or production mutation was
started. `get_referral_link` was not partially modified before this decision.

## Findings

The live AI branch stores a Client's request for one occupied staff/time in
SQLite `slot_waitlist`. That row drives four later behaviors: owner/admin alert,
matching against a freed provider slot, up to three Client messages, and a
notified flag. Current behavior embeds unapproved policy: `±20` minute matching,
at most three recipients, direct `chat_id` delivery, implicit expiry after the
time passes, and mutable flags without durable delivery outcome.

No PostgreSQL model represents that request. `OperationalWorkItem` is not an
equivalent: it is a task/support item assigned to a tenant Membership and cannot
be owned by a Client without Maya User. Appointment is a real booking; this is
not. CustomerProfile cannot represent multiple independently expiring requests.
InboxItem is a User projection and cannot own the fact. Encoding it into any of
these would be a runtime workaround.

The minimal proposal introduces one tenant-qualified Client-owned model,
`ClientWantedSlotInterest`, bound to verified ClientChannelLink evidence,
canonical Client/Branch/Staff and ActionExecution. It proposes an explicit
ACTIVE/MATCHED/NOTIFIED/CANCELLED/EXPIRED lifecycle, common target-generation
evidence, no physical delete/backfill and separation between AC1 creation,
AC4/AC5 availability matching and existing communication delivery ownership.

Owner decisions are required for exact match tolerance, expiry, per-Client cap,
delivery recipients and freed-slot fan-out. The recommendation is exact-time
matching, expiry at desired start, 10 active requests, Client-only delivery under
existing consent/preferences, and at most three earliest matches. Observed legacy
constants are not silently promoted to policy. See
`package5-b9-wanted-slot-schema-v1-proposal.md`.

`get_referral_link` is proven to be a read-only requirement, but the canonical
schema stores hashed referral identities and no retrievable plaintext personal
invitation token. Existing canonical state/configuration can be read; absent safe
presentation must return unavailable. Issuing a token/referral/value fact is
forbidden from this read. This does not require B9 schema if V1 remains read-only;
new invitation issuance would require its own contract and is not proposed here.

Evidence: `evidence/package5-b9-contract-reconstruction.json`, including source
hashes, selected line ranges, schema/model comparison, call sites and hygiene.
All inspection was local/read-only against the accepted source. No application
module or secret configuration was imported; no production customer row was read.

```text
B9 CONTRACT RECONSTRUCTION: COMPLETE
AI TOOL MAY IMPLICITLY CREATE CLIENT: NO
READ TOOL MAY CREATE CLIENT: NO
PHONE MATCH AS CLIENT AUTHORITY: NO
get_or_create_client AS PRODUCTION IDENTITY SHORTCUT: FORBIDDEN
get_referral_link CLASSIFICATION: READ-ONLY
get_referral_link NEW SCHEMA REQUIRED: NO — ABSENT SAFE LINK RETURNS UNAVAILABLE
WANTED-SLOT EXISTING CANONICAL FOUNDATION: INSUFFICIENT
ADDITIONAL SCHEMA REQUIRED: YES
MINIMAL SCHEMA PROPOSAL: ClientWantedSlotInterest V1
B9 RUNTIME REMEDIATION CAN RESUME: NO — OWNER DECISION REQUIRED
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — ACCEPTED, NOT RERUN
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
REAL PRODUCTION MUTATIONS: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
```

Waves 1–6 and B7/B8 remain untouched. Full Final Gate was not restarted because
runtime remediation did not begin. The 17 pre-existing databases were not changed.
All owned temporary processes/watchers/Chrome/databases are zero at closure.
