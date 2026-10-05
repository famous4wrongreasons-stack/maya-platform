<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 41e5326521a60d64e2a35b9512481f9fc7259d4e24b8ea125202e796cf13456c -->

# Remaining source decisions

The fixed profile and the shared USER-turn mechanism are implemented. These decisions concern the seven still-false, profile-applicable source duties. They do not authorize HANDOFF, production activation/deployment, real OTP or real YCLIENTS effects. No source duty is excluded from the threshold.

## BS-1 — initial personal appointment source

QUESTION: May the canonical `appointments.own.list` owner supply a narrowly defined personal-client SCHEDULE widget with server-owned appointment handles?

OPTION A: Add that exact source contract. Require the currently verified, server-resolved personal Client and fresh exact-Client ownership checks on every proposal. Use the existing cancellation/reschedule owners and confirmation/Action Engine path. Closed reschedule targets come from canonical availability.

OPTION B: Keep the current SCHEDULE_READ owner set and leave the four booking duties false.

RECOMMENDED OPTION: A.

EXACT SECURITY/PRODUCT CONSEQUENCE: A verified personal client may propose changes to their own appointment. Business-owner status provides no customer authority. No phone/time/display-index match, caller-selected Client, expanded CLIENT_ROLES or booking for another customer.

WHAT IT UNBLOCKS: A legitimate initial source for G7-5, G7-BOOK1, G11-I9 and G13-I3. Approval permits implementation and proof; it does not itself close them.

SCHEMA/MIGRATION IMPACT: None approved. Prove the exact identity/handle binding using existing persistence first; stop separately if that fails.

Detailed basis: [BOOKING-SOURCE-DECISION.md](BOOKING-SOURCE-DECISION.md).

## NS-1 — retained journal date and exact NAVIGATE source

QUESTION: May the existing erasable retained journal-date field be used for the exact new journal detail navigation contract?

OPTION A: Add `navigate.journal.detail@1`: SCHEDULE, NAVIGATE, `detail:fs.calendar`, source exactly `C9:operations.journal.read`, no InputSchema. Extend the existing CHECK only for that combination, preserving its unchanged REFINE branch. The server derives the retained date from the completed canonical read. A separately versioned return link may reference only the server-resolved, retained parent in the same tenant/current principal/release; mint and resolve both verify it.

OPTION B: Leave persistence unchanged and keep the three navigation duties false.

RECOMMENDED OPTION: A.

EXACT SECURITY/PRODUCT CONSEQUENCE: Detail navigation rereads the original query under current authority. It cannot use historical body text, today's date, a caller-selected widget reference, immutable AuditLog storage for erasable query data, or a new generic navigation authority.

WHAT IT UNBLOCKS: Production-source HTTP/BIN and carrier proofs for G12-R1b, G12-I11 and G13-R2. The existing CHECK currently rejects this record shape; the isolated PostgreSQL STOP proof confirms that boundary.

SCHEMA/MIGRATION IMPACT: One additive CHECK-constraint migration; no new table or column. Approval is needed before authoring it. Applying anything in production remains forbidden.

Detailed basis and alternatives checked: [NAVIGATION-SOURCE-DECISION.md](NAVIGATION-SOURCE-DECISION.md).

## Certification after the decisions

After implementing any approved sources, re-pin the fixed registry/profile digest, prove source/current-authority/profile refusals, close their evidence pairs, and run the complete fresh applicable mutation/CI programme on the final combined candidate. The existing partial mutation runs and progress matrix are not that certificate.

`full165.closed-input` remains unchanged. G6-6 and G13-R8 remain globally false/STOP. Only `CERTIFIED_FOR_PROFILE` can become true for this restricted release; it is currently false.
