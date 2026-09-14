# Package 5 — B32 production PASS; fresh Final Gate STOP at B33

Approved decision checkpoint: `b49c5c15`. Owner approved B32 Option A.
Runtime commit: `2b89db4d`. Active release:
`/opt/maya-saas/releases/20260906-p5-b32-2b89db4d`.

## B32 completed scope and production evidence

The approved common `client_channel` principal is enforced by the existing
canonical policy resolver. Authenticated account/channel → exact active verified
ClientChannelLink → tenant-qualified canonical Client → action-specific business
target → Action Engine. A canonical Client needs no Maya User. No synthetic User,
membership, AI actor, raw chat-id actor or phone-derived principal is introduced.

Appointment create, cancel, reschedule and existing channel service changes admit
the bounded Client alternative while preserving existing staff/service authority.
For existing Appointments the policy verifies exact `mayaClientId + tenantId`,
canonical target and, when external, current integration/provider/external ID.
Missing/revoked/other-tenant/other-Client authority fails closed. The reserved
immutable link/target references are reconstructed consistently at ingress,
admission and claim. Original keyed audit evidence survives later link revocation.
Existing consent/preferences/habits/wanted-slot contracts remain compatible.

Account HTTP create, AI `createOwnAppointment` and the verified channel command
share the existing B31 creator and immutable intent binding. Internal and CRM
executors remain Action Engine-owned. Principal metadata stays outside the
business intent fingerprint. Exact retries, aliases, concurrency and restart use
the original execution/intent; changed intent under the same key conflicts.
Provider lost-response reconciliation and UNKNOWN/MANUAL_REQUIRED behavior are
preserved. No new schema, model, persisted field, action class or backfill.

[Local gate](CYCLE-06-BLOCKING-PACKAGE-5-B32-PRINCIPAL-LOCAL-GATE.md): targeted
6 suites / 68 tests, cross-action 40 / 381, architectural guards 78 / 425 PASS.
Lint, both typechecks, build, Prisma validation, fresh migration replay/status
and structural diff PASS. Full mandatory backend **374 suites / 3065 tests PASS**.
The unchanged documented deployment process repeated its complete gates with
the same 374 / 3065 PASS, using the previously documented installed Node 24.19
local override after the known Node 24.15 V8 crash. No check was skipped.

The deployment installed independent release dependencies, passed candidate
readiness, switched the release and cleaned its smoke process. Production schema:
80 repository migrations, 83 accounted historical entries, pending 0, drift NONE.
There was no new migration to apply. Independent read-only verification matched
**578/578 compiled artifacts**. Backend/PWA active, legacy bot inactive;
health/readiness PASS; error-priority entries 0; port 3199 closed; public PWA 200.
Eight accepted Python surface hashes match B31. Python/PWA were not redeployed.
No private Client endpoint, real appointment or provider mutation was invoked
for production smoke. [Production evidence](evidence/package5-b32-deployed-recheck.json).

## Fresh all-13-family Final Gate

This gate restarted after B32 production PASS. The fresh source/deployed inventory
covers all 562 non-spec backend modules, 14 compiled scripts and two tooling
artifacts, 224 HTTP decorator sites and 516 mutation-like AST call sites. Those
counts include protocol/fact writes and are not counts of bypasses. Wave
registrations remain 6 / 13 / 8 / 12 / 1, plus six approved AC6 classes. The accepted
Wave implementation/fact foundations have no source changes since B30.

| Family | Existing owner/boundary included in the fresh inventory |
| --- | --- |
| A15 | Wave 3 external staff schedule command/executor |
| A16 | Wave 2 CRM staff access and exact source reducers |
| A17 | Wave 3 CRM lifecycle and source observations |
| A18 | Canonical Client profile/consent, account/channel commands and appointment paths; B33 below |
| A22 | Wave 1 settings/preferences |
| A23 | Wave 1 operational work and bounded inbox protocol/projection |
| A25 | Wave 2 explicit security actions and AC3 auth protocol |
| A26 | Wave 2 lifecycle and canonical TrialActivation bootstrap |
| reduced A27 | Wave 4 ordinary inventory and review observations |
| A28 | Wave 4 prospective calendar configuration/object storage |
| A29 | Wave 5 corrections and immutable recovery facts |
| A30 | Approved AC6 maintenance coordinator/policy; not a new AE action |
| A31 | Event store, reconciliation, mirror and recovery fact plane |

Active Python inventory contains 90 root modules / 70 non-test modules. Read-only
AST/source inspection confirms both published chat routes call the shared
finalizer and appointment-create bridge. The actual deployed chat handler,
stream handler and finalizer source hashes match the repository, as does the
request-context bridge module. No production Python application was imported.

Inventory coverage is 13/13, not aggregate certification. The first confirmed
new blocker stops remaining aggregate adversarial/regression stages. The B32
local/deployment regression PASS is not relabelled as a full Package 5 Final
Gate PASS. [Inventory](evidence/package5-b32-fresh-final-inventory.json),
[active Python evidence](evidence/package5-b32-final-production-python-inventory.json).

## Exact B33 / A18 — model-derived parameters change the chat idempotency identity

Published path:

`POST /api/chat` or `/api/chat/stream` → `request_context` → model booking result
→ `_finalize_booking_for_chat` → existing appointment-create bridge → B32 verified
Client principal → B31 immutable intent admission → existing Action Engine.

1. `legacy_client_habits_bridge.py:30` constructs the ephemeral request context;
   `intent` is SHA-256 of the user's statement, specifically intended to survive
   HTTP/model retries. The context is not derived from model tool arguments.
2. `webhook_server.py:8759` and `:9351` construct that context for chat/stream.
   The routes have no durable booking confirmation/occurrence binding before
   accepting the model's `contact_request` result at `:8796` / `:9508`.
3. `_finalize_booking_for_chat` at `:6341` constructs the *idempotency key* from
   `[context.intent, staff_id, sorted(unique(service_ids)), start]`. Changing the
   model-produced time/staff/services changes the key itself. There is no conflict
   against the initially accepted parameters of that same upstream occurrence.
4. B31 correctly sees a different key and different normalized intent. Its
   existing duplicate policy does not collapse appointments at different times.
   B32 correctly admits the verified Client. Consequently another execution and
   provider create are accepted. The same escape remains possible while the first
   execution is UNKNOWN: the second key never consults its immutable binding.

This is an upstream command-identity/confirmation gap, **not a failure of B31's
same-key hash comparison or B32 principal validation**. No change to B29/B30/B31
schema, duplicate policy or accepted principal contract is proposed here.

### Reproduction and limits

[Python probe](evidence/package5-b33-chat-identity.probe.py) executes the actual
chat handler, real signed-widget verifier, real request-context constructor,
real channel serializer and real finalizer. Three identical authenticated user
statements are supplied. Synthetic model results are A, A, then B (changed time).
The first two payloads are identical; the third carries a different key. No new
user confirmation occurs. This also proves the normal handler reaches the
finalizer again, rather than stopping at a transport-level retry cache.

[Compiled backend probe](evidence/package5-b33-chat-booking.probe.cjs) submits those
captured payloads to the actual bridge controller, signed authenticator, Client
resolver, canonical policy/kernel and owned real PostgreSQL. This is a two-stage
composition, not a live HTTP server or live LLM test. The Python transport/result
projection, history storage, consent read and model response are synthetic; the
backend independently validates the signed channel, binding and canonical consent.
Provider/catalog I/O is synthetic. No policy result, execution result or database
outcome is mocked in the backend stage. Stream reachability is source/hash-verified;
the full streaming HTTP handler is not claimed as dynamically executed.

| First backend outcome | Exact replay | Changed model time under same upstream context | Local totals |
| --- | --- | --- | --- |
| SUCCEEDED | Same execution, no new dispatch | New key; second SUCCEEDED execution | 2 Appointments, 2 executions, 2 provider creates |
| UNKNOWN | Same UNKNOWN execution, no new dispatch | New key; second SUCCEEDED execution while first stays UNKNOWN | 1 persisted Appointment, 2 executions, 2 provider creates |

Both fixtures use a canonical Client without Maya User. Every accepted execution
has principal `client_channel`; every persisted Appointment has the exact Client
and tenant. Control: forcing the changed payload to retain the first key produces
`IDEMPOTENCY_CONFLICT`, with no additional row or provider write. Thus the defect
is specifically the upstream key change. [Observed results](evidence/package5-b33-chat-booking.proof.json).

Synthetic model variation is the adversarial trigger; this report does not claim
that a production customer has encountered it or that a real provider duplicate
was created during verification. No affected production population was queried.
Existing B19 tests repeat unchanged model parameters; B31/B32 key-conflict tests
keep the key stable, so neither proves the missing upstream binding.

### Exact next decision boundary

The chat/stream initiator needs a stable, server-owned booking occurrence or
confirmation identity that survives HTTP/model retries independently of generated
booking parameters, then binds to the existing immutable canonical intent.
Changing those parameters after acceptance must conflict under that identity.
How that occurrence is established and distinguished from a later legitimate
booking has not been reconstructed/approved in this gate. A hash of message text
alone is not automatically a safe substitute: separate legitimate confirmations
may use identical words. Do not invent a new model/TTL/confirmation contract or
silently use the AI tool ID as authority. No B33 remediation is implemented.

## STOP and hygiene

The owned proof DB `maya_c06_b32_proof` was dropped; its dedicated PostgreSQL
process stopped; data/socket removed; port 55502 closed. All verification and
deployment commands finished. No browser/watcher was created. Main checkout's
24 status entries and recorded dirty-file hashes are unchanged. None of the 17
pre-existing DBs was accessed. [Hygiene evidence](evidence/package5-b32-final-hygiene.json).

```text
B32 CLIENT_CHANNEL PRINCIPAL: ENFORCED
B32 CLIENT WITHOUT MAYA USER: SUPPORTED
B32 PRODUCTION REMEDIATION: PASS
B32 FAKE USER PRINCIPAL: 0
B32 RAW chat_id ACTOR: 0
B32 CLIENT→TARGET AUTHORITY: ENFORCED
B31 VERIFIED CLIENT CREATE AUTHORITY: ENFORCED
B31 actor_required FOR VALID CLIENT PRINCIPAL: 0
B31 SAME KEY + CHANGED INTENT: IDEMPOTENCY_CONFLICT
B29 / B30 / B31 PRODUCTION REMEDIATION: PASS
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — B33
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B33 / A18 UPSTREAM CHAT BOOKING IDENTITY
AGGREGATE D1-A…D7-A CERTIFICATION: NOT COMPLETED — STOP AT B33
FINAL AGGREGATE REGRESSION: NOT RUN AFTER B33
B33 IMPLEMENTATION / DEPLOYMENT: NOT STARTED
NEW SCHEMA / MODELS / FIELDS / ACTION CLASSES: 0
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE
REAL PRODUCTION APPOINTMENT CREATES FOR PROOF: 0
REAL PRODUCTION PROVIDER WRITES FOR PROOF: 0
REAL PRODUCTION BUSINESS MUTATIONS FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
```

Report/evidence/remainder → commit/push → STOP. Chapter 6 final acceptance remains
a separate cycle after a future clean Package 5 Final Gate.
