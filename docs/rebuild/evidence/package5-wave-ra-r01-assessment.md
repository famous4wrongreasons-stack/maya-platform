# Wave R-A Stage 1 — R01 contract/schema assessment

Assessment baseline: accepted checkpoint `4a253449`. Scope is copied from the
closed [final inventory](../CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md)
and [master](package5-remainder-inventory-final.json), package R01. This is an
assessment and an executable proof of existing foundations, not remediation
completion, a new inventory pass, or permission for production cutover.

```text
PACKAGE: R01
BLOCKERS INCLUDED: [B38, B39, B54]
CANONICAL OWNER: Canonical Client/profile and Appointment owners; B31/B32/B33 identity/intent ingress
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES SATISFIED: YES
R01 REMEDIATION: NOT IMPLEMENTED
R01 EXISTING FOUNDATION LOCAL PROOF: PASS — 5 suites / 52 tests
R01 READY FOR IMPLEMENTATION: YES
R01 READY FOR PRODUCTION: NO
```

R01 has no external package dependency. B38's dependency on B54 is an internal
implementation/acceptance ordering constraint: propagate the caller identity
before accepting booking through a relay. It is not already-fixed B54 behavior.
No R02 staff principal work is required to authorize an already verified Client.

## Exact membership and evidence

| Blocker | Existing production scope, unchanged | Remediation boundary |
| --- | --- | --- |
| B38 | `salon app/api-proxy.php?action=create_record`; `salon app/api-proxy.codex-loyalty-20260721.php?action=create_record`; salon and VPS PWA BookingFlow/repeat-booking fallback; public Next booking bundles; `mayaos/app/index.html`; `salon/app/index.codex-loyalty-20260721.html`; `salon/app/index.backup-20260731-anton-analytics.html`; `salon/app/tenant-test.html` | Replace admitted Client create initiators with the existing canonical ingress, or fail closed where no verified Client proof exists. Close every inventoried direct `yc_post` / `records` / `book_record` create route, including publicly reachable legacy variants. |
| B39 | `bot.handle_contact`; `_start_contact_flow` / `_finalize_booking`; `_handle_cancel_record_confirm`; `process_message → claude_ai/memory`; own-history/dossier/contact flows; `_handle_freed_slot_accept` / `_handle_freed_slot_decline` | Resolve exact authenticated channel → active canonical Client binding before own-profile/read/booking work. Remove raw-phone/local-Client authority, parallel profile writes and legacy booking as an integration-system substitute for the Client. Existing wanted-slot/profile command semantics remain bounded; raw callbacks cannot become new business permissions. |
| B54 | `maya-native-api.php/*`; `maya-platform-api.php/*`; SaaS/native PWA callers through these relays | Carry the approved opaque `Idempotency-Key` unchanged through header allowlists and browser preflight. Preserve the canonical receipt/conflict/UNKNOWN response. Backend retains all tenant/Client checks; neither proxy rewrites or invents logical identity. |

Exact historical deployed anchors are the master B38/B39/B54 records and
[redacted source excerpts](package5-exhaustive-source-excerpts.json). They include
`EDGE:salon/app/api-proxy.php:823,2836`, its codex variant `:839,2958`,
`PUBLIC:salon/app/index.html:11052,12741`, `PUBLIC:vps/app.html:10935`,
`PY:bot.py:2855,3862,4018,4655,4770,4834`, `PY:database.py:730,747,2818`,
`PY:legacy_appointment_bridge.py:56`, `TS:crm/legacy-appointment-bridge.service.ts:404`,
and both relay `:71` anchors. These are inventory-time line numbers, not claims
that current local line numbers are identical.

The local relay sources both exist:
[maya-native-api.php](../../../сайт%20и%20приложение/maya-native-api.php) and
[maya-platform-api.php](../../../maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php).
Both currently omit the key from the forwarded-header set and CORS allowlist.
The inventoried deployed `api-proxy.php` variants are not root PWA source files;
implementation/cutover must explicitly include their recorded overlay targets,
not assume editing one local bundle repairs all public variants. This is an
existing blocker deployment detail, not a new production path or new Bxx.

## Existing approved foundation and limits

| Concern | Existing owner/component | Required reuse |
| --- | --- | --- |
| Current channel authentication | `ClientChannelAuthenticatorService.authenticate` | Authenticates current Maya JWT/session or signed Telegram init-data/widget; exact tenant/session expiry/revocation and Telegram signature/time bounds. A bridge secret authenticates integration transport only. |
| Canonical Client | `ClientChannelRuntimeService.resolve`; `ClientChannelLinkService`; `ClientLinkChallengeService` | One active, versioned, exact-tenant verified link identifies Client. Ambiguous/missing/revoked/merged/held identity fails closed. No phone or `Client.userId` inference and no historical automatic linking. |
| Optional Maya User | Existing B32 `client_channel` principal and `client-authority:v1:<link-id>` immutable AE evidence | Verified Client does not require Maya User. Real User identity remains independently authenticated when used; raw chat IDs never become `actorUserId` and Client is not relabelled as a trusted integration service. |
| Own read/profile | `ClientAppointmentReadService`, `ClientProfileReadService`, `ClientChannelRuntimeService.bookingPrefill/cabinetProjection`; A18 `Package5Wave3CanonicalCutoverService` commands | Own-read target comes from verified link; PostgreSQL read boundary and existing projections remain read-only. Supported profile/consent commands keep their current capability policy. Native raw-contact name/phone overwrite is not permission to add a new generic self-edit contract. |
| Create | `ClientAppointmentCreateService.forAccount/forVerifiedChannel` → `CrmService.executeCanonicalClientCreateWithReceipt` → existing Action Engine | Shared internal/CRM create, canonical timezone/catalog/contact resolution, exact `Appointment.mayaClientId` + `tenantId`; direct provider/database initiators remain forbidden. |
| Immutable create identity | B31 `ActionExecutionIdempotencyBinding`, `ActionExecution.bookingIntentHash`, `client-booking-intent.contract.ts` | Existing tenant/Client scope binds one caller identity to the first normalized business intent and execution. Same key/same intent replays; changed intent conflicts. Different key/same intent retains the existing duplicate policy. No new model/field/key system. |
| Explicit chat confirmation | B33 `ClientBookingConfirmation`; `ClientBookingConfirmationService`; existing `booking-confirmation` / `chat-appointment-create` bridge operations | Receipt precedes interpretation and yields the existing stable logical key. Reuse original receipt on retries; no process-local or model-derived replacement key. |
| Cancel/reschedule/services | B29/B30/B32 channel ownership check and `execute*AppointmentWithReceipt` | Exact tenant and `Appointment.mayaClientId` ownership plus existing canonical target/provider mapping. Revalidate link/target before effect; keep UNKNOWN/reconciliation behavior. |

Approved contracts: [B32 accepted local contract](../CYCLE-06-BLOCKING-PACKAGE-5-B32-PRINCIPAL-LOCAL-GATE.md),
[B31 immutable intent contract](../CYCLE-06-BLOCKING-PACKAGE-5-B31-IMMUTABLE-IDEMPOTENCY-LOCAL-GATE.md),
[B33 receipt contract](../CYCLE-06-BLOCKING-PACKAGE-5-B33-SCHEMA-LOCAL-GATE.md).
Existing schema objects are reused unchanged. No fingerprint/backfill is
fabricated for old native bookings or local contact records.

Native Telegram updates do **not** supply any of the current accepted channel
proof formats merely because a bot received them. A raw sender, `contact.user_id`
(even matching), local session or existing delivery address is insufficient.
The approved contract permits requiring an existing verified channel entry and
failing closed/handoff for an unproven native request. It does not authorize
minting a widget/init-data signature locally or installing a new native-update
principal contract. Guest phone-only booking, booking a different person under
the caller's raw phone flow, local contact overwrite and phone-based history
are not preserved as authority. Canonically verified Client-without-User booking
remains supported. These are consequences of already approved contracts, not a
new requested owner decision.

## Executable local foundation proof and limits

[Proof record](package5-wave-ra-r01-proof.json): five existing hermetic Jest
suites, **52/52 PASS**, run serially in the isolated repository. Dependencies are
in-memory Prisma/CRM/provider fixtures; no Nest application startup, DB connection,
HTTP request, Telegram call, provider call or migration. Existing architecture
tests read source/schema/migration files without executing SQL.

The suites exercise canonical Client create with/without Maya User, missing or
invalid authority rejection, shared ingress, exact mirror owner persistence,
CRM timeout/post-provider mirror UNKNOWN handling, channel create rejection of
forged identity, channel lifecycle ownership, stable retry invocation identity,
and permanent B31/B33 booking/confirmation guards. These are proofs of the
reusable foundation. Mock execution is not a fresh PostgreSQL concurrency proof
and passing them does not repair or certify B38/B39/B54 end-to-end. No package
runtime edits or new package guard are claimed in Stage 1.

## Permanent R01 ratchet and package-local acceptance after implementation

One package-wide guard must cover all exact known production overlays/callers,
including reachable backup/test variants; no broad `legacy/`, Python, PHP, PWA
or deployment-directory exemption is acceptable. It must remain mandatory in
the normal backend/package validation path and be coupled to executable negative
tests, rather than treating a comment or one expected string as closure.

1. Source/AST transport checks and stubbed relay behavior must reject reintroduced
   PHP provider booking and native business writes outside registered owners;
   ensure `Idempotency-Key` survives both relays with its value unchanged,
   including browser preflight. Missing keys may not be silently rewritten by
   transport. All known booking aliases must map to the canonical boundary or an
   executable fail-closed response before any effect.
2. Native own-contact/profile/history/create/cancel/freed-slot entry tests must
   prove raw sender/contact/phone/session and missing/revoked/cross-tenant or
   cross-Client binding cannot reach local profile, appointment, provider or
   acceptance-log writes. Missing `contact.user_id` is rejected; matching it
   alone is still insufficient. Existing verified channels must reach the
   canonical reader/command only; Client-without-User remains supported.
3. Relay → canonical ingress local proof must bind same key/same intent to one
   execution/outcome, changed intent to conflict, including concurrent requests
   and restart. B33 confirmations cannot be regenerated after ambiguity.
   Provider timeout/UNKNOWN must not become a new provider operation or success/
   failure guess; reconciliation retains the original execution.
4. Prove no direct Appointment write or provider effect from initiators, and
   exact `mayaClientId`/tenant on accepted internal/CRM results. Recheck authority
   at dispatch. Existing cross-family schema and value owners are unchanged.
5. Package-local proof first; coordinated Wave R-A proof/cutover plan next.
   No repeated full 13-family Final Gate during individual packages. Production
   remains prohibited in this stage; structural production verification and
   deployment are deferred to the agreed wave cutover.

No B36 runtime or schema work was performed. No new inventory classes/paths were
searched. Main dirty worktree and 17 old DBs were not opened or modified by this
assessment. Owned background processes after the test completed: 0.
