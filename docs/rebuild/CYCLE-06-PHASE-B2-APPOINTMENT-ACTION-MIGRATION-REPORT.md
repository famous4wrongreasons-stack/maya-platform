# CYCLE 06 PHASE B2 - APPOINTMENT ACTION MIGRATION REPORT

Date: 2026-08-22.

Branch: `codex/maya-brain-systemic-release-20260815`.

Implementation commit: `ec4ef530`.

Production release: `20260822-c06-b2-appointment-actions`.

## 1. Decision

The canonical NestJS CRM appointment path now executes create, reschedule and
cancel through the durable Action Engine from Phase B1. The release is deployed
and healthy in production.

Phase B2 is **not globally complete**. The active legacy Python application
still contains 11 production-reachable direct YClients appointment mutation
call sites. They serve Telegram, legacy HTTP/PWA, chat and staff journal flows.
Those paths do not yet have a dedicated authenticated service-to-service write
bridge, trusted actor mapping or real-input shadow-equivalence evidence. Cutting
them over without those proofs would weaken authorization and create a greater
duplicate-mutation risk than leaving the known boundary explicit.

No next action family may start while this mixed ownership remains.

## 2. Scope implemented

Migrated in the canonical NestJS backend:

- `create_appointment`;
- `reschedule_appointment`;
- `cancel_appointment`.

Deferred:

- attendance/status mutation;
- internal-calendar-only mutations;
- campaigns, generic messaging, billing, loyalty and session/access actions;
- runtime agents and Chapter 7.

The YClients adapter remains the provider capability. Transport details were
not moved into Action Engine. The execution boundary is:

`initiator -> existing authorization/approval -> ActionExecution -> appointment capability executor -> CrmService -> CRM adapter`.

Existing HTTP response shapes remain compatible. The public API was not
redesigned.

## 3. Inventory before and after

### 3.1 Canonical NestJS path

| Initiator | Authorization and approval | Idempotency | Execution owner after B2 package |
|---|---|---|---|
| Appointment HTTP create/cancel/reschedule | Existing tenant context, membership and target ownership checks remain before execution | Optional `Idempotency-Key` plus logical identity | Action Engine |
| AI tool appointment mutations | Existing tool permission/role and tenant context | Tool invocation key converges on logical identity | Action Engine |
| Staff CRM journal mutations | Existing authenticated staff/tenant boundary | Request idempotency is passed into the same logical identity | Action Engine |
| Internal service retries | Existing trusted service context | Same normalized target/input identity; caller key is an alias, not a separate action | Action Engine |

The static ratchet allows exactly three direct adapter mutation calls in the
NestJS production source, all inside `crm/crm.service.ts`: one provider call per
canonical capability executor. Action Engine itself cannot import CRM writes,
campaigns, messaging, billing, loyalty or notification executors.

### 3.2 Active legacy Python bypasses

The following direct create/reschedule/cancel owners remain production
reachable and therefore prevent a global ownership claim:

| # | Initiator / file | Mutation | Existing execution owner |
|---:|---|---|---|
| 1 | `client_record_actions.py` client action | cancel | legacy YClients client |
| 2 | `client_record_actions.py` client action | reschedule | legacy YClients client |
| 3 | `webhook_server.py` loyalty booking | create | legacy YClients client |
| 4 | `webhook_server.py` chat booking | create | legacy YClients client |
| 5 | `webhook_server.py` staff journal create | create | legacy admin helper/YClients client |
| 6 | `webhook_server.py` staff journal reschedule | reschedule | legacy YClients client |
| 7 | `webhook_server.py` staff journal cancel | cancel | legacy YClients client |
| 8 | `bot.py` Telegram booking | create | legacy YClients client |
| 9 | `bot.py` Telegram cancel | cancel | legacy YClients client |
| 10 | `claude_ai.py` AI reschedule | reschedule | legacy YClients client |
| 11 | `claude_ai.py` AI cancel | cancel | legacy YClients client |

These flows retain their existing authorization, confirmation and local-write
behavior. They have not been relabeled as Action Engine flows. Wrapper method
definitions without runtime callers and read-only CRM paths are not counted.

The separate legacy attendance call is not included in the 11 appointment
bypasses because attendance is explicitly deferred by the 4.43 safety gate.

## 4. Logical identity and idempotency

Logical action identity is tenant-qualified and derived from trusted action
class, normalized target and normalized mutation input. A caller-provided
idempotency key is an additional alias, not part of the logical fingerprint.

Consequences proven by tests:

- the same logical HTTP retry reuses one `ActionExecution`;
- HTTP and AI requests for the same logical mutation converge;
- restart does not create a second execution;
- terminal replay does not call the provider again;
- two workers racing on one mutation produce one provider dispatch;
- the same target/identity in another tenant remains allowed.

## 5. Reconciliation strategies

Every migrated mutation has a canonical CRM read reconciler with three
outcomes: `APPLIED`, `NOT_APPLIED`, `STILL_UNKNOWN`.

### Create

The reconciler reads candidate appointments and matches the exact expected
start, staff, ordered service set and client phone identity:

- exactly one exact match: `APPLIED`;
- no exact match: `NOT_APPLIED`, after which trusted policy may permit retry;
- ambiguous result or insufficient identity: `STILL_UNKNOWN`.

A provider timeout after accepted create never causes a blind second create.

### Cancel

The reconciler reads the appointment:

- absent or already cancelled: `APPLIED`;
- present and active: `NOT_APPLIED`;
- inconclusive read: `STILL_UNKNOWN`.

This closes the historical Chapter 2 P1 shape for the canonical path:

`provider cancelled -> local mirror write failed -> replay -> provider absent`.

Replay repairs local truth while provider dispatch count remains one.

### Reschedule

YClients reschedule remains one provider update, not delete plus create. The
pre-dispatch canonical appointment state is stored as minimal attempt context.
Reconciliation compares current state with both desired and original state:

- desired state: `APPLIED`;
- exact original state: `NOT_APPLIED`;
- any divergent third state or inconclusive read: `STILL_UNKNOWN`.

A transport failure is therefore not classified as a business failure.

## 6. Local mirror semantics

Provider mutation and local mirror persistence are separate boundaries.
Provider acknowledgement is recorded before mirror repair work. A local
database failure after external success is not converted into provider failure
and does not authorize another provider dispatch.

The appointment repository now uses provider-qualified identity for idempotent
repair. Replay may create or repair the mirror after canonical reconciliation;
it cannot repeat a provider mutation merely because the local write failed.

## 7. Authorization and approval compatibility

Action Engine does not replace authentication, tenant resolution, membership
permissions, BOLA protections or target ownership. Existing controller/tool
checks run before execution. Trusted actor references are attached only when
both user and membership are available in the authenticated context.

Existing user confirmation behavior remains the compatibility surface. It is
normalized into the Action Engine policy input; old approval rows are not made
canonical and cannot independently unlock an execution. Tests prove that an
unauthorized requester and a rejected approval dispatch zero provider writes.

## 8. Finding 4.43 disposition

Finding 4.43 is valid. The previous reschedule payload could send
`attendance: 0` when YClients had not returned attendance and could therefore
erase a real attendance mark.

The adapter now omits the attendance field unless the provider supplied a
numeric attendance value. No attendance capability is registered in Action
Engine and no attendance test/cutover is claimed.

Disposition: **ATTENDANCE DEFERRED** pending a separately proven safe write
contract and migration package.

## 9. Shadow and adversarial proof

Local database proof used a fake in-memory provider and no live CRM. It covered:

- create success and duplicate create;
- HTTP/AI identity convergence;
- create timeout reconciled as applied;
- create proven not applied before retry;
- still-unknown create with no blind retry;
- cancel success and provider-already-absent;
- historical cancel mirror-failure repair with one provider mutation;
- reschedule success, timeout-applied and divergent-still-unknown;
- restart after dispatch without duplicate mutation;
- two-worker race;
- same logical identity in another tenant;
- unauthorized requester and rejected approval;
- terminal replay without dispatch.

Proof result:

- appointment executions: 13;
- succeeded / unknown / not executed: `10 / 2 / 1`;
- attempts: 23;
- duplicate attempts collapsed: 4;
- Action Intents executed: 0;
- external live CRM mutations: 0;
- all required assertions: PASS.

The NestJS caller normalization is proven by deterministic tests. Real-input
shadow equivalence for the 11 legacy entry points is **not yet proven**. There
is only a read-only legacy shadow bridge today; reusing its credential for
writes would violate least privilege. This missing dedicated bridge, trusted
actor mapping and organic comparison is the cutover blocker.

## 10. Migration, test and build validation

No new schema migration was required by B2; it uses the approved Phase B1
durable kernel schema.

Validation completed before rollout:

- all 50 repository migrations on clean database A: PASS;
- independent clean replay on database B: PASS;
- normalized schemas equal: PASS;
- production structural clone without business rows/PII: 69 tables;
- Prisma drift against structural clone: none;
- B1 kernel proof: PASS;
- B2 appointment proof: PASS;
- lint: PASS;
- application typecheck: PASS;
- script typecheck: PASS;
- tests: **168 suites / 1670 tests PASS**;
- production build: PASS;
- static direct-call ratchet in NestJS: PASS;
- Prisma schema validation: PASS.

## 11. Production rollout and verification

Release `20260822-c06-b2-appointment-actions` passed the deployment gate,
release preflight, migration status check, spare-port smoke and readiness check
before the production symlink switched.

Post-switch verification:

- active release symlink: correct;
- `maya-saas` service: active;
- `/api/health`: release stamp confirmed;
- `/api/health/ready`: database ready;
- service errors after switch: none.

No live customer appointment was created, cancelled or rescheduled for proof.
At the verification cutoff there were no organic appointment `ActionExecution`
rows after deployment. Production provider-mutation equivalence is therefore
not invented and remains pending organic traffic after the legacy shadow path
is implemented.

## 12. B2.1 follow-up status

Implementation commit `f4c33e9a` and production release
`20260822-c06-b21-legacy-appointment-shadow` add the dedicated authenticated
legacy appointment bridge, fail-closed Python dispatcher, integration-bound
tenant resolution, canonical idempotency convergence and direct-endpoint
ratchets required by this report.

Production is intentionally at the organic shadow gate:

- Python mode: `shadow`;
- NestJS bridge execution: disabled;
- bridge external side effects: `0`;
- organic shadow observations at the verification cutoff: `0`;
- cutover: not authorized without organic evidence.

The implementation and current gate are documented in
`CYCLE-06-PHASE-B2.1-LEGACY-APPOINTMENT-BRIDGE-CONVERGENCE-REPORT.md`.

## 13. Remaining cutover package

To close Phase B2 safely, one dedicated package must:

1. add a least-privilege authenticated legacy appointment bridge;
2. map legacy tenant, requester, permission, target and confirmation to trusted
   Action Engine input without accepting caller-asserted authority;
3. shadow all 11 real legacy entry points and record only sanitized comparison
   fields;
4. prove equivalence for action class, target, payload, authorization, approval
   requirement and logical identity on organic input;
5. switch each legacy initiator to the bridge while preserving public response
   contracts;
6. remove the 11 direct writes and tighten the ratchet to zero bypasses;
7. observe an organic mutation or explicitly leave production mutation proof
   pending without forcing a client record change.

Permanent dual-write is forbidden. Until this package is complete, appointment
execution ownership remains mixed and no next action family may begin.

## Final status

PHASE B2 COMPLETE: NO

CREATE APPOINTMENT EXECUTION OWNER: OTHER

RESCHEDULE APPOINTMENT EXECUTION OWNER: OTHER

CANCEL APPOINTMENT EXECUTION OWNER: OTHER

ATTENDANCE EXECUTION OWNER: DEFERRED

BLIND RETRY AFTER UNKNOWN: NO

DIRECT APPOINTMENT WRITE BYPASSES: 11

LEGACY DIRECT FALLBACK POSSIBLE: NO

UNKNOWN PRESERVED ACROSS BRIDGE: YES

READY FOR NEXT ACTION FAMILY: NO

RUNTIME AGENTS CREATED: NO

CAMPAIGN MIGRATION STARTED: NO

CHAPTER 7 STARTED: NO
