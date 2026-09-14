# Package 5 B28 — verified Client CustomerProfile projection

Accepted checkpoint **866181f7** / B27 production baseline. Waves1–6 and B27 remain closed. No new schema/model/action class is required.

## Contract mapping

The approved A18 ClientChannelLink V1 foundation already defines `tenant + maya_user HMAC subject → verified Client`. An authenticated User and active membership authenticate an account channel; only its existing active versioned link authorizes Client-owned data. Bare Client.userId, phone, raw Telegram id and legacy User-profile association are not evidence. Telegram uses the existing signed channel authenticator and link, without requiring a Maya User. No new first-link or login authority is introduced.

## Remediation

- `ClientProfileReadService` resolves exact verified Client, rejects missing/revoked/ambiguous/merged/held identity, then reads only `CustomerProfile.tenantId + clientId`. It checks the returned row's exact owner again. Identity and profile share a PostgreSQL READ ONLY / RepeatableRead snapshot.
- `/customers/me/profile` and `/customer-portal` delegate to this shared reader. Existing profile shape is preserved: id, locale, privacy/marketing compatibility timestamps and updated_at. These timestamps are not promoted into consent evidence. A verified Client with no exact profile receives null projection fields, with no materialization/backfill. Any available legacy User-associated profile is ignored.
- Existing authorized customer-manager list/detail projections use the same verified target reader. Staff notes stay limited to the existing manager audience; no access to Client-stated habits is added. Account `profile_linked` metadata also comes from the reader and fails closed on missing identity.
- Profile command initiators and their response projections no longer select a Client/Profile through the legacy User relation. They resolve an exact verified target first and still call the existing canonical Wave3 commands; no executor, approval policy or business action contract is changed.
- Existing channel bridge gains an empty-payload profile query for authenticated Clients without User. Its transport tenant credential remains separate from signed channel authentication. New public account query uses the existing live JWT verifier. Neither accepts a consumer Client selector.
- B7 encrypted habits remain in the approved B7 presentation boundary. General profile summaries never select or decrypt habits. Existing B7/B6 exact verified readers are ratcheted; the proof exercises real B7 reads and isolation. No Python/PWA/proxy/iOS edit is needed.

## Architectural scope

The scanner examines all production TS source files, rejects new private profile queries without a verified boundary, User-profile includes, mismatched predicates, read writers, missing link/read-only guards, and portal/User metadata bypasses. Existing named channel/preferences readers must retain their verified resolver and exact tenant/Client predicate. Narrowly named action planner/executor and communication-policy methods are internal business decisions rather than Client profile presentation; their existing action/delivery guards and full final inventory still apply. No file or directory is broadly exempted.

## Local evidence

- Existing79 migrations cleanly replayed in this cycle's isolated PostgreSQL; schema diff NONE.
- **27 executable PostgreSQL scenarios PASS**, with real compiled endpoint/portal/User readers, channel authenticator and B7 habits reader. Covers A/A, A binding with B legacy association, missing exact profile with B available, duplicate phones, guest Client, missing/revoked/ambiguous identity, forged input/tenant/account, staff authority, B7 encrypted preferences and20 concurrent reads. Restored writes are rejected by the database read-only fence. Every case compares all Client/Profile/link/consent/preferences/account/execution state before/after: byte-equivalent.
- Shared architectural/endpoint compatibility tests: **5 suites /52 tests PASS**. Initial test mocks describing User-owned profiles were updated to use the verified reader; the guard recognizes the existing exact channel resolver and remains sensitive to stripped verification/predicates.
- Production build/typecheck passed locally; mandatory complete lint/typecheck/regression/deployment gates follow before production cutover.
- Production read-only preflight: B27 baseline healthy/ready, pending0, driftNONE; P4 and existing active PWA/Python guardsPASS.

No production private Client/Profile endpoint or business/provider mutation was invoked. New models/schema/action classes0; fake historical backfill0. The17 pre-existing databases are untouched. Owned PostgreSQL remains active only for this cycle until closure. This report does not assert B28 production completion or Package5 completion; those require deployment and a new full final inventory.
