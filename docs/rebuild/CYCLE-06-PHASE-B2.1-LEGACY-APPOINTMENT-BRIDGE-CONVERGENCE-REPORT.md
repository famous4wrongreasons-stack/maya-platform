# CYCLE 06 PHASE B2.1 - LEGACY APPOINTMENT BRIDGE CONVERGENCE REPORT

Date: 2026-08-22.

Branch: `codex/maya-brain-systemic-release-20260815`.

Implementation commit: `f4c33e9a`.

NestJS production release: `20260822-c06-b21-legacy-appointment-shadow`.

Related report:
`docs/rebuild/CYCLE-06-PHASE-B2-APPOINTMENT-ACTION-MIGRATION-REPORT.md`.

## 1. Decision

The typed legacy appointment bridge, Action Engine preview path and fail-closed
Python dispatcher are implemented and deployed. Production is currently in the
mandatory observation stage:

- Python bridge mode: `shadow`;
- NestJS bridge execution: disabled;
- legacy path: the only external mutation owner during shadow;
- Action Engine bridge: preview only;
- bridge external side effects: `0`;
- permanent dual execution: absent.

Phase B2 is not closed yet. The instruction requires an organic observation
window containing create, reschedule and cancel where they occur naturally.
No organic appointment action had reached the shadow endpoint at the report
cutoff. A live client appointment was not manufactured for proof. Cutover is
therefore deliberately blocked.

## 2. Entry-point inventory

The inventory distinguishes 11 production-reachable initiator entry points
from four actual provider-write paths. Every entry point now supplies a fixed
origin to the dispatcher. Caller input cannot choose tenant, executor, policy,
autonomy or approval.

| # | Entry point / caller | Mutation and current authorization | Tenant and payload | Idempotency and response | Production reachability |
|---:|---|---|---|---|---|
| 1 | `client_record_actions.cancel_for_client` | Cancel after reading the record and proving that its normalized phone belongs to the authenticated client and that the visit is upcoming | Legacy CRM binding supplies company; only record external ID enters the bridge | Stable action identity; canonical `UNKNOWN` becomes HTTP 202 and explicitly forbids repeat | Active client cabinet/API |
| 2 | `client_record_actions.reschedule_for_client` | Reschedule after the same ownership and upcoming-visit checks plus validated future datetime | Same integration binding; record ID and desired datetime only | Stable action identity; canonical `UNKNOWN` becomes HTTP 202 | Active client cabinet/API |
| 3 | `webhook_server.client_book_with_loyalty_handler` | Create after authenticated client lookup, consent, server-side phone, staff/service validation, slot recheck and loyalty reservation | Company comes from configured integration; server-revalidated booking fields | Existing request ID is a transport alias; `UNKNOWN` preserves points reservation and returns 202 | Active PWA loyalty booking |
| 4 | `webhook_server._finalize_booking_for_chat` | Create for authenticated application chat identity; name/phone are loaded server-side | Company comes from configured integration; structured conversation result supplies staff/services/time | Stable normalized booking identity; safe failure text and no blind retry after `UNKNOWN` | Active application chat booking |
| 5 | `webhook_server.panel_journal_create_handler` | Admin create after Telegram init-data authentication and owner/manager/master role gate | Company comes from configured integration; server validates staff, services, datetime, contact visibility and duration | Stable normalized booking identity; `UNKNOWN` returns 202 | Active staff journal |
| 6 | `webhook_server.panel_journal_reschedule_handler` | Reschedule after Telegram auth, personnel role gate and BOLA record guard for masters | Integration-bound company; record ID, datetime and optional staff only | Stable action identity; `UNKNOWN` returns 202 | Active staff journal |
| 7 | `webhook_server.panel_journal_cancel_handler` | Cancel after Telegram auth, personnel role gate and BOLA record guard | Integration-bound company and guarded record ID | Stable action identity; `UNKNOWN` returns 202 | Active staff journal |
| 8 | `bot._finalize_booking` | Create from the authenticated Telegram conversation and server-held client/contact state | Configured CRM integration; validated staff/services/time/contact fields | Stable normalized booking identity; dispatcher owns bridge transport only | Active Telegram bot |
| 9 | `bot._handle_cancel_record_confirm` | Cancel after the existing Telegram confirmation flow | Configured integration and confirmed record external ID | Stable action identity; no Python retry after canonical `UNKNOWN` | Active Telegram bot |
| 10 | `claude_ai._execute_tool` reschedule | Reschedule after existing tool permission, role and confirmation handling | Configured integration; typed record ID and desired datetime | Stable action identity; canonical result is returned to the tool UX | Active legacy AI tool path |
| 11 | `claude_ai._execute_tool` cancel | Cancel after existing tool permission, role and confirmation handling | Configured integration and typed record ID | Stable action identity; canonical result is returned to the tool UX | Active legacy AI tool path |

The historical `saas_blueprint` implementation is a reference implementation,
not a third runtime, and no production Python module imports it.

## 3. Distinct execution paths

The 11 entry points converge on exactly four private legacy provider owners:

| Logical family | Private legacy owner during shadow | Direct provider operation |
|---|---|---|
| Client create | `_create_booking_direct` | YClients `book_record` POST |
| Staff/admin create | `_create_record_admin_direct` | YClients `records` POST |
| Reschedule | `_reschedule_booking_direct` | Non-destructive YClients record PUT |
| Cancel | `_cancel_booking_direct` | YClients record DELETE |

Public wrapper methods contain no provider transport call. Each wrapper calls
`dispatch_appointment_action` once and supplies its private direct owner as a
closure. A repository-wide AST ratchet snapshots the actual appointment write
endpoints, not just function names, so renaming a hidden provider call fails the
gate.

Attendance and all other record PUT families remain outside this migration.

## 4. Protected bridge contract

Internal endpoints:

- `POST /api/internal/legacy/appointment-actions/shadow`;
- `POST /api/internal/legacy/appointment-actions/execute`;
- `GET /api/internal/legacy/appointment-actions/executions/:executionId`.

The bridge requires `x-maya-legacy-bridge` and compares the configured secret
through the shared constant-time bridge guard. The DTO permits only:

- contract version;
- configured provider and external company assertion;
- allowlisted origin;
- optional opaque requester reference;
- transport idempotency alias;
- create/reschedule/cancel action class;
- typed action payload;
- PII-free legacy shadow outcome.

Global whitelist validation rejects undeclared fields. There is deliberately
no tenant, executor, policy, autonomy or approval field.

Production negative checks after deployment:

| Check | Result |
|---|---|
| Valid envelope without bridge secret | `401` |
| Caller-injected `tenant_slug` | `400` |
| CRM company not bound to bridge credential | `403` |
| Execute while production execution flag is false | `503` |

## 5. Trust and tenant boundary

The bridge secret grants permission to submit an untrusted request; it does
not make the request authoritative. NestJS binds the credential to the single
configured provider/company pair and resolves tenant through the active CRM
integration. It does not use a caller-provided slug.

Targets for record mutations are read and checked inside the resolved tenant.
Cross-tenant target evidence is rejected. The same external identity may exist
in another tenant without collapsing identities across tenants.

## 6. Idempotency convergence

Python does not own deduplication. Its idempotency value is a caller alias.
Action Engine derives canonical logical identity from trusted tenant, action
class, normalized target and normalized input.

Tests prove:

- repeated Python create converges;
- the same logical NestJS and Python create converges;
- restart does not create a second current execution;
- two Python workers converge;
- a repeated terminal execution does not dispatch again;
- cross-tenant identities remain separate.

## 7. Response and UNKNOWN semantics

The bridge returns the canonical Action Engine execution contract: acceptance,
execution state, safe explanation and execution reference. Python does not
implement an execution state machine, reconciliation, approval or retry
policy.

In cutover mode, timeout, transport failure and a persisted-but-unconfirmed
execution become `UNKNOWN`. Python returns an honest pending result and may
query canonical status by execution reference. It never converts `UNKNOWN`
into a generic failure followed by the old direct mutation.

The cutover branch has no direct fallback. An unavailable Action Engine fails
closed.

## 8. Shadow and cutover behavior

`off`:

- legacy direct path executes once;
- bridge is not contacted.

`shadow` (current production mode):

- legacy direct path executes once;
- its PII-free outcome is observed;
- bridge resolves tenant and builds Action Engine preview;
- bridge external mutation count is exactly zero.

`cutover` (not enabled):

- direct closure is not called;
- bridge invokes Action Engine;
- Action Engine is the only execution owner;
- any bridge failure remains fail-closed;
- no legacy direct fallback exists.

NestJS production keeps
`MAYA_LEGACY_APPOINTMENT_BRIDGE_EXECUTION_ENABLED=false`; therefore Python
cannot accidentally execute through the bridge while the observation gate is
open.

## 9. Adversarial verification

| Invariant | Proof status |
|---|---|
| Python create produces one ActionExecution | PASS in deterministic bridge/kernel tests |
| Repeated Python create deduplicates | PASS |
| Same logical NestJS/Python create converges | PASS |
| Python reschedule and cancel normalize correctly | PASS |
| Timeout after persisted execution preserves reference/UNKNOWN | PASS |
| Python cannot blind-retry UNKNOWN | PASS |
| Wrong secret, forged tenant, wrong integration | PASS locally and production-negative checks |
| Malformed or unsupported action/origin pair | PASS |
| Action Engine unavailable has no cutover fallback | PASS |
| Restart and two-worker convergence | PASS |
| Terminal execution repeated does not redispatch | PASS |
| Direct provider endpoint ratchet | PASS; four shadow owners are explicit |
| Attendance excluded | PASS |
| External mutation count per successful logical action | PASS in deterministic provider proof |
| Organic create shadow equivalence | NOT PROVEN IN PROD at cutoff |
| Organic reschedule shadow equivalence | NOT PROVEN IN PROD at cutoff |
| Organic cancel shadow equivalence | NOT PROVEN IN PROD at cutoff |

## 10. Validation and rollout

Validation before release:

- Python compile: PASS;
- Python bridge and ratchet tests: 19 PASS;
- targeted NestJS bridge/action tests: 5 suites / 48 tests PASS;
- backend lint: PASS;
- application and scripts typecheck: PASS;
- full backend tests: 169 suites / 1689 tests PASS;
- build and release preflight: PASS;
- `git diff --check`: PASS.

Production rollout:

- release `20260822-c06-b21-legacy-appointment-shadow`: healthy;
- database readiness: PASS;
- pending migrations: `0`;
- post-switch service errors: none;
- production-compatible Python patch compiled before and after install;
- Python runtime backup created before replacement;
- `barbershop-bot.service`: active, zero restart loop;
- bridge mode advanced `off -> shadow` only after both services were healthy;
- Action Engine execution remains disabled;
- no test appointment was created, moved or cancelled.

## 11. Organic observation gate

At the report cutoff the shadow observation count after enablement is zero.
This is not interpreted as equivalence. The observation window must remain open
until organic traffic supplies enough create/reschedule/cancel evidence. If a
class does not occur naturally, it remains `NOT PROVEN IN PROD`; a live client
mutation must not be manufactured.

Cutover requires all of the following:

1. inspect sanitized organic observations;
2. compare tenant, action class, target hash, normalized input hash, logical
   identity, policy, approval, autonomy and executor;
3. record any naturally absent action class as not proven rather than guessed;
4. enable NestJS execution;
5. change Python to `cutover` with no direct fallback;
6. observe an organic canonical execution;
7. remove the four direct provider owners and tighten the endpoint ratchet to
   zero migrated write owners;
8. recount the 11 entry points as zero direct-write bypasses.

Until that sequence completes, the next action family remains blocked.

## Final status

PHASE B2 COMPLETE: NO

CREATE APPOINTMENT EXECUTION OWNER: OTHER

RESCHEDULE EXECUTION OWNER: OTHER

CANCEL APPOINTMENT EXECUTION OWNER: OTHER

ATTENDANCE EXECUTION OWNER: DEFERRED

DIRECT APPOINTMENT WRITE BYPASSES: 11

LEGACY DIRECT FALLBACK POSSIBLE: NO

UNKNOWN PRESERVED ACROSS BRIDGE: YES

BRIDGE EXTERNAL SIDE EFFECTS IN SHADOW: 0

READY FOR NEXT ACTION FAMILY: NO

RUNTIME AGENTS CREATED: NO
