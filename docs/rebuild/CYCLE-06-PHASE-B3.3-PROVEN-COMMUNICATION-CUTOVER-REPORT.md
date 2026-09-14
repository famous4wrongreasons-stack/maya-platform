# CYCLE 06 - PHASE B3.3 PROVEN COMMUNICATION CUTOVER REPORT

Date: 2026-08-25

Branch: `codex/maya-brain-systemic-release-20260815`

Repository HEAD before implementation: `001557e2`

Pre-cutover production release: `20260823-c06-b32-time-contract-fix`

## 1. Scope

This package cuts over only the two communication routes that passed organic
production shadow equivalence:

1. the operational-single Telegram reply to the `/privacy` command;
2. the transactional-single durable in-app `new_appointment` notification
   produced by the protected legacy Python bridge.

The cutover does not include bulk/recovery campaigns, APNs, appointment
reschedule/cancel notifications, reminders, scheduled reports, AI inbox
tools, authentication SMS/email, attendance, runtime agents or Chapter 7.

The bounded target is:

```text
initiator
  -> Action Engine
  -> Communication Delivery
  -> tenant-scoped recipient lifecycle
  -> exact channel executor
```

## 2. Pre-cutover proof

The approved B3.2 production verification established:

```text
OPERATIONAL SINGLE: EQUIVALENT
TRANSACTIONAL: EQUIVALENT
BULK AUDIENCE: NOT PROVABLE
SHADOW DIVERGENCES: 0
NEW PATH EXTERNAL SENDS: 0
```

The transactional proof covers the durable in-app inbox branch only. It does
not claim APNs equivalence. Bulk remains frozen because production does not
contain the immutable historical audience snapshot required to compare
recipient identities, exclusions, consent, channel, deduplication and risk.

## 3. Execution ownership after this package

### 3.1 Operational single `/privacy`

```text
Telegram CommandHandler("privacy")
  -> protected Nest delivery endpoint
  -> Action Engine capability
     communication.operational-single.privacy.execute.v1
  -> CommunicationDeliveryService
  -> protected Python Telegram executor
  -> Telegram Bot API
```

The command handler no longer calls `reply_text` or `send_message`. It passes
only a tenant locator, source-event identity and the source chat identity to
the protected bridge. The fixed privacy text is owned by the protected
executor and is not accepted from the initiator request.

The Python executor uses the original Telegram method directly so the former
post-success shadow observer cannot create a second lifecycle or recurse into
itself. The source message chat id, rather than the Telegram user id, is the
recipient identity; this preserves the legacy semantics for private and group
chat contexts.

### 3.2 Transactional `new_appointment` inbox

```text
legacy Python appointment producer
  -> protected inbox bridge
  -> InboxService recipient resolution
  -> Action Engine capability
     communication.transactional-single.new-appointment.execute.v1
  -> CommunicationDeliveryService
  -> durable InboxItem
```

The cutover predicate is deliberately exact:

```text
type = new_appointment AND source = legacy_bridge
```

Other inbox types and other producers continue through their existing owners.
The migrated branch cannot write the `InboxItem` directly if Communication
Delivery is unavailable.

## 4. No dual send and no fallback

- The `/privacy` initiator has no direct Telegram send after cutover.
- The migrated `new_appointment + legacy_bridge` producer has no direct inbox
  upsert after cutover.
- An unavailable Action Engine or Communication Delivery fails closed.
- There is no `new path failed -> legacy send` branch.
- Recovery is a deployment rollback, not a runtime fallback.
- Bulk legacy execution remains an explicit non-migrated exception and is not
  callable through either proven production capability.

## 5. Idempotency, restart and UNKNOWN

Both proven capabilities have one canonical logical identity and a maximum of
one dispatch attempt.

For the inbox path, the durable `InboxItem` is the provider proof. Repeated
initiator delivery converges to the existing ActionExecution, recipient
delivery and inbox uniqueness identity rather than creating a second item.

For Telegram, provider success records the returned message id. A timeout,
network failure, 5xx response or missing provider reference after the dispatch
boundary becomes `UNKNOWN`. Telegram has no safe provider reconciliation API
for this send, so the result remains unknown/manual and is never blindly
retried. A 4xx response before accepted delivery is a definitive rejection.

## 6. Direct bypass inventory

The original twelve bypass families remain visible for architectural tracking.
This package does not relabel unproved families as migrated.

| ID | Family | B3.3 classification |
| --- | --- | --- |
| C01 | AI support inbox/APNs | DORMANT, not migrated |
| C02 | AI task inbox/APNs | DORMANT, not migrated |
| C03 | protected inbox bridge | exact `new_appointment` subroute MIGRATED; other types deferred |
| C04 | appointment lifecycle notifications | exact create/new-appointment inbox subroute MIGRATED; reschedule/cancel/APNs deferred |
| C05 | reminders | ACTIVE, deferred |
| C06 | scheduled reports | ACTIVE, deferred |
| C07 | Nest bulk | DEAD/UNREACHABLE, bulk frozen |
| C08 | APNs | UNREACHABLE for current production data, deferred |
| C09 | legacy Telegram operations | exact `/privacy` subroute MIGRATED; all other operations remain legacy |
| C10 | legacy recovery/bulk | ACTIVE, BULK-DEFERRED |
| C11 | auth SMS | DORMANT, not migrated |
| C12 | auth email | DORMANT, not migrated |

For the two exact migrated routes:

```text
MIGRATED DIRECT BYPASSES: 0
LEGACY FALLBACK FOR MIGRATED CLASSES: NO
```

The global bypass count is intentionally not reported as zero because bulk
and other unproved communication producers remain outside this cutover.

## 7. Architectural ratchet

The ratchet proves that:

- the `/privacy` handler can only call the Action Engine bridge;
- it cannot directly call Telegram `reply_text` or `send_message`;
- it preserves the source message chat identity;
- the bridge has no direct-send fallback;
- the protected executor is the only exact Telegram mutation boundary;
- the migrated inbox predicate remains limited to
  `new_appointment + legacy_bridge`;
- no bulk production capability is registered;
- attendance is not imported into or executed by this package.

## 8. Local verification

The implementation passed:

- NestJS lint;
- application typecheck;
- script typecheck;
- all NestJS tests: 170 suites / 1704 tests;
- focused Action Engine and inbox tests: 2 suites / 15 tests;
- Python syntax compilation;
- B3.3 Python communication ratchet: 4 tests;
- legacy appointment cutover ratchet: 9 tests;
- NestJS production build;
- Prisma validation;
- clean migration replay into two isolated databases;
- Communication Delivery foundation proof;
- communication shadow no-send proof;
- `git diff --check`.

The database proofs reported zero external messages and zero bulk dispatches.
The only production-capable communication registrations are the two exact
proven capabilities; no production bulk capability exists.

## 9. Deployment and production verification

The ordered cutover was deployed as production release:

```text
20260825-c06-b33-proven-communication-cutover
```

Deployment preserved the following order to avoid a dual-send or missing
executor window:

1. install the protected fixed-text Python executor without switching the
   `/privacy` initiator;
2. deploy the NestJS Action Engine and Communication Delivery release through
   the normal preflight, migration, smoke and automatic rollback tooling;
3. switch the Python `/privacy` initiator and restart the Python service;
4. verify health, readiness, migrations, Action Engine and recipient lifecycle;
5. the project user sent one `/privacy` command to themselves; Codex did not
   initiate or send the message.

No bulk send, test campaign or automatic customer message is permitted during
deployment verification.

Production structural verification established:

- the NestJS release and Python service are active;
- `/api/health` and database-backed `/api/health/ready` return HTTP 200;
- no migrated ActionExecution or recipient delivery was created merely by
  deployment;
- no migrated ActionExecution or recipient was left `UNKNOWN`;
- the deployed Python initiators and protected executor contain the expected
  cutover markers;
- no production bulk capability is registered.

The single user-initiated `/privacy` proof produced exactly:

```text
ActionExecution: 1, SUCCEEDED, execution attempts 1
Communication campaign: 1, COMPLETED
Recipient delivery: 1, ACCEPTED, external dispatch ACKNOWLEDGED
Delivery attempt: 1, SUCCEEDED, telegram_provider_accepted
Telegram sendMessage calls: 1, HTTP 200
Duplicate action identities: 0
UNKNOWN actions: 0
UNKNOWN recipients: 0
Legacy direct sends for the migrated command: 0
```

The protected Python executor received exactly one request from the Node
Action Engine for this proof. There was no second send through the former
command handler and no runtime fallback.

## 10. Deferred carry-forward

- Bulk audience equivalence and bulk cutover remain required.
- APNs requires a real registered destination and a separate proof.
- Operational reminders/reports and other Telegram producers need their own
  bounded equivalence and cutover.
- Transactional reschedule/cancel notification branches need separate proof.
- Attendance remains deferred.
- Runtime agents and Chapter 7 remain prohibited in this package.

## 11. Current completion status

The code, local proof, ordered production cutover and one safe production
functional proof are complete for the two explicitly proven communication
classes. Bulk and every other deferred communication family remain outside
this completion claim.

```text
PHASE B3.3 COMPLETE: YES
OPERATIONAL SINGLE EXECUTION OWNER: ACTION ENGINE
TRANSACTIONAL EXECUTION OWNER: ACTION ENGINE
MIGRATED DIRECT BYPASSES: 0
LEGACY FALLBACK FOR MIGRATED CLASSES: NO
UNKNOWN PRESERVED: YES
BULK EXECUTION OWNER: LEGACY
BULK CUTOVER: DEFERRED
READY FOR NEXT CYCLE-06 CLOSURE PACKAGE: YES
```

STOP. Bulk, attendance, runtime agents and Chapter 7 are not started.
