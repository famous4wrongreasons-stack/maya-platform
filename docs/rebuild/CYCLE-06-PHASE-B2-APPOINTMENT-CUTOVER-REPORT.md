# CYCLE 06 — PHASE B2 APPOINTMENT CUTOVER REPORT

Date: 2026-08-22

Branch: `codex/maya-brain-systemic-release-20260815`

Implementation commit: `bf4c20ff`

Production release: `20260822-c06-b22-appointment-cutover`

## 1. Scope and decision

The approved legacy appointment cutover is complete for exactly three action
classes:

- `create_appointment`;
- `reschedule_appointment`;
- `cancel_appointment`.

Their production execution path is now:

```text
Python initiator
  -> authenticated legacy appointment bridge
  -> Action Engine
  -> canonical appointment executor
  -> CRM
```

Attendance/status mutation was not migrated. Campaigns, generic messaging,
scheduler migration, runtime agents and Chapter 7 were not started.

## 2. Pre-cutover evidence

The cutover used the accepted B2.1 organic production proof:

| Action class | Organic shadow verdict |
| --- | --- |
| create | `EQUIVALENT` |
| reschedule | `EQUIVALENT` |
| cancel | `EQUIVALENT` |

Observed divergences were `0`; shadow external actions were `0`.

Immediately before cutover:

- active backend release: `20260822-c06-b21-organic-shadow-observer`;
- Python bridge mode: `shadow`;
- Action Engine bridge execution: disabled;
- direct appointment write bypass inventory: `11` initiators;
- database migration status: up to date;
- appointment `UNKNOWN` executions: `0`;
- unfinished appointment executions: `0`.

Two historical `create_appointment / FAILED` rows existed before the cutover.
They are terminal, are not `UNKNOWN`, and were not changed or retried by this
release.

## 3. Cutover implementation

### 3.1 Initiator-only Python bridge

`ai администратор/legacy_appointment_bridge.py` now permits only `cutover`
mode. Empty, `off`, `shadow`, invalid configuration, transport failure, server
failure and malformed response all fail closed. There is no direct-call
callback and no runtime direct or shadow execution branch.

The bridge maps results without collapsing provider uncertainty:

- succeeded;
- rejected / not executed;
- failed;
- outcome unknown / status check required.

An `UNKNOWN` result is returned with `retry_allowed = false`; it cannot become
a blind direct retry.

### 3.2 Direct-write removal

`ai администратор/yclients.py` contains bridge-only wrappers for create,
reschedule and cancel. These former direct owners were removed:

- `_create_booking_direct`;
- `_create_record_admin_direct`;
- `_reschedule_booking_direct`;
- `_cancel_booking_direct`.

All 11 existing production initiators retain an explicit trusted origin, but
now reach the same bridge-only wrappers. A failed bridge call cannot fall back
to a Python-to-YClients mutation.

### 3.3 Idempotency and UNKNOWN

The legacy transport key is an alias only. Action Engine derives and owns the
canonical logical identity. Repeated delivery of one logical request converges
to the existing `ActionExecution`; it does not create a second provider
mutation.

Transport ambiguity remains `UNKNOWN`. Neither Python nor the bridge converts
it to `FAILED`, retries it blindly, or invokes the former direct path.

### 3.4 Attendance isolation

`set_record_attendance` remains a separate deferred direct owner. Attendance
is absent from the bridge action surface and from every migrated caller. The
cutover did not broaden the allowed action-class set.

## 4. Architectural ratchet

The production ratchet proves:

1. all 11 production initiators declare one approved origin;
2. each migrated wrapper has exactly one bridge dispatch;
3. removed direct helpers cannot return unnoticed;
4. client create, admin create, reschedule and cancel provider endpoints have
   no Python owner;
5. no hidden production module owns those provider endpoints;
6. the bridge has no direct, shadow or `off` execution path;
7. the historical blueprint cannot become a third runtime;
8. attendance is excluded from the bridge;
9. attendance remains explicitly deferred.

Result: **9/9 tests passed** on the exact staged production runtime. SHA-256
verification showed that all six active production files are byte-identical
to that verified stage.

```text
DIRECT APPOINTMENT WRITE BYPASSES: 0
```

## 5. Verification matrix

Pre-release validation:

- targeted Python tests: 33 passed;
- full Python suite: 297 passed;
- targeted NestJS bridge/Action Engine tests: 35 passed;
- full NestJS suite: 169 suites / 1689 tests passed;
- lint: passed;
- application typecheck: passed;
- scripts typecheck: passed;
- production build: passed;
- `git diff --check`: passed.

Production post-deploy verification:

- active release: `20260822-c06-b22-appointment-cutover`;
- `/api/health`: healthy and release stamp matched;
- `/api/health/ready`: database ready;
- `maya-saas`: active, zero runtime restarts;
- `barbershop-bot`: active, zero runtime restarts;
- organic shadow observer: active;
- backend execution flag: `true`;
- Python bridge mode: `cutover`;
- unauthenticated protected bridge request: HTTP `401`;
- repository migrations: 50 found, database schema up to date;
- production migration ledger: 53 applied, 0 unfinished, 1 historical rolled
  back migration row;
- appointment `UNKNOWN`: `0`;
- unfinished appointment executions: `0`;
- new appointment executions created by verification: `0`;
- backend errors after cutover: `0`;
- Python errors after cutover: `0`;
- bridge failure/fallback markers after cutover: `0`.

No real appointment was created, rescheduled or cancelled automatically after
deployment. Functional provider equivalence comes from the accepted organic
B2.1 proof; post-deploy verification remained structural and read-only as
required.

## 6. Rollback semantics

Rollback is release-level only. There is no runtime fallback.

- previous backend release: `20260822-c06-b21-organic-shadow-observer`;
- pre-cutover rollback package:
  `/var/backups/maya-c06-b22-precutover-20260822210434`;
- package presence verified after deployment;
- coordinated cutover used a rollback trap for source, environment and backend
  release restoration if any health check failed.

If the new path becomes unhealthy, operations must roll back the release. The
running Python process must never execute the old direct YClients path.

## 7. Execution ownership after cutover

| Action family | Production execution owner |
| --- | --- |
| create appointment | Action Engine |
| reschedule appointment | Action Engine |
| cancel appointment | Action Engine |
| attendance/status mutation | deferred legacy owner |

## Final status

PHASE B2 COMPLETE: YES

CREATE APPOINTMENT EXECUTION OWNER: ACTION ENGINE

RESCHEDULE EXECUTION OWNER: ACTION ENGINE

CANCEL APPOINTMENT EXECUTION OWNER: ACTION ENGINE

ATTENDANCE EXECUTION OWNER: DEFERRED

DIRECT APPOINTMENT WRITE BYPASSES: 0

LEGACY DIRECT FALLBACK POSSIBLE: NO

UNKNOWN PRESERVED: YES

READY FOR NEXT ACTION FAMILY: YES
