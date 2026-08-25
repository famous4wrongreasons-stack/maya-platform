# CYCLE 06 — BLOCKING PACKAGE 1 — RESIDUAL APPOINTMENT MUTATION CONVERGENCE REPORT

Status: shadow implementation complete; production equivalence and cutover not performed
Repository baseline HEAD: `017d0d3c`
Package order: 1 of 5
Next package started: no

## Exact Package From Remainder Review

**Residual appointment mutation convergence**

Exact completion criterion quoted from `CYCLE-06-REMAINDER-REVIEW.md`:

> Fix and isolate attendance 4.43; migrate or make unreachable attendance/status, duration, services, comments/client fields, SMS flag, payment, and close mutations.

Chapter 6 final-package criterion quoted from the same review:

> Chapter 6 final adversarial verification can begin only after these packages are implemented or each residual class is proven dead/physically unreachable with a maintained architectural ratchet.

## Production Action Classes In Scope

| ID | Production action class | Baseline execution owner | Required package outcome |
|---|---|---|---|
| A04 | Appointment attendance/status | Python or Nest CRM adapter | Action Engine or physically unreachable; finding 4.43 closed |
| A05 | Appointment duration | Python or Nest CRM adapter | Action Engine or physically unreachable |
| A06 | Appointment services/composition | Python or Nest CRM adapter | Action Engine or physically unreachable |
| A07 | Appointment comment/client name/SMS flag | Python YClients client | Action Engine or physically unreachable |
| A08 | Appointment payment/close | Python YClients/payment code | Action Engine or physically unreachable |

Already migrated appointment classes A01 create, A02 reschedule, and A03 cancel are regression boundaries only. They are not reimplemented by this package.

## Execution Bypasses This Package Must Remove

The baseline bypass surface identified by the accepted Remainder Review is:

- Python direct `set_record_attendance` provider mutation;
- Nest direct `markAppointmentAttendance` provider mutation;
- Python/Nest direct appointment duration mutation;
- Python/Nest direct appointment service-composition mutation;
- Python direct notification-by-SMS flag mutation;
- Python direct appointment client-name mutation;
- Python direct appointment comment mutation;
- Python direct appointment payment/close mutation;
- generic provider update behavior that can change attendance while performing an unrelated mutation (finding 4.43).

Legacy handlers may remain as trusted initiators only. For every surviving in-scope mutation, the only permitted production chain is:

```text
initiator
  -> protected bridge / Action Engine submission
  -> Action Engine
  -> canonical appointment executor
  -> CRM
```

No in-process bridge failure may fall back to a direct YClients mutation.

## Package Completion Criteria

This package is complete only when all of the following are proved:

1. Every production-reachable A04-A08 mutation is either Action Engine owned or physically production-unreachable.
2. Finding 4.43 cannot erase attendance during any unrelated appointment update.
3. Tenant isolation, deterministic execution identity, idempotency, DB-level claim, policy/approval, restart safety, and audit use the canonical ActionExecution lifecycle.
4. `UNKNOWN` remains distinct from `FAILED` after a possible provider dispatch.
5. No blind retry occurs after dispatch ambiguity.
6. Reconciliation exists where YClients exposes enough provider truth; otherwise the result remains explicitly UNKNOWN for operator resolution.
7. There is no dual execution and no direct fallback.
8. Migrated Python/Nest paths are initiators, not execution owners.
9. A package-specific architectural ratchet prevents the direct bypasses from returning.
10. Create/reschedule/cancel remain Action Engine owned and attendance does not leak into those unrelated updates.
11. Adversarial tests attempt to disprove ownership, deduplication, UNKNOWN, retry, reconciliation, tenant isolation, approval, direct-bypass removal, and restart safety.
12. The package action-class inventory is recomputed after implementation.

## Schema Decision

The existing durable `ActionExecution` contract is sufficient for the package's
required pre-cutover Shadow stage. The five residual capabilities persist as
tenant-qualified `SHADOW_ONLY` executions with deterministic identity and
`NOT_EXECUTED / shadow_only` state.

No new execution state, attempt type, provider outcome, approval record, or
reconciliation record is required before equivalence evidence exists.

**SCHEMA GATE REQUIRED: NO**

No Prisma model, migration, or production data was changed.

## Implementation And Verification

### Shadow capability boundary

Five exact Action Engine capabilities were registered:

| Action class | Capability | Current Action Engine behavior |
|---|---|---|
| A04 attendance/status | `crm.appointment.attendance.shadow.v1` | strict normalized attendance code; `SHADOW_ONLY`; no executor |
| A05 duration | `crm.appointment.duration.shadow.v1` | strict duration in seconds; `SHADOW_ONLY`; no executor |
| A06 services/composition | `crm.appointment.services.shadow.v1` | normalized service identities; `SHADOW_ONLY`; no executor |
| A07 comment/client name/SMS flag | `crm.appointment.fields.shadow.v1` | registered field kind plus opaque value reference; `SHADOW_ONLY`; no executor |
| A08 payment/close | `crm.appointment.payment-close.shadow.v1` | mutation kind plus opaque value reference; `SHADOW_ONLY`; no executor |

Every capability uses:

- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- `maxExecutionAttempts = 1`;
- no retryable error classes;
- `externalSideEffects = 0`.

The protected legacy appointment bridge accepts these classes only on its
`/shadow` surface. Its `/execute` surface rejects them with
`legacy_appointment_shadow_only` before tenant/provider execution. Create,
reschedule, and cancel remain the only executable appointment bridge actions.

### Passive legacy observation

The current Python mutation owners remain the production executors during the
proof window. After a legacy write has returned a proven success, they submit a
read-only observation through:

```text
confirmed legacy result
  -> protected /shadow bridge
  -> tenant resolution from integration binding
  -> Action Engine planShadow
  -> durable NOT_EXECUTED ActionExecution
```

The observer never calls `/execute`, never retries the provider write, never
falls back to another mutation path, and cannot change the already returned
legacy result if observation fails.

Deterministic identity is derived from the tenant, exact capability, appointment
target, and normalized evidence. Repeated delivery and process restart converge
through the existing database uniqueness on
`tenantId + identityFingerprint`; caller idempotency remains a request alias,
not a second logical action.

### Attendance finding 4.43

Unrelated record updates no longer inject `attendance = 0` when YClients omits
or returns an invalid attendance value. They preserve attendance only when the
current CRM record contains an explicit supported code. Boolean and malformed
values are omitted instead of coerced.

The Nest YClients adapter also rejects unsupported writable attendance values
before the provider request. It no longer silently maps an unknown value to
zero. Explicit payment/close behavior that intentionally marks a visit as
attended remains a separate observed A08 behavior rather than an unrelated
default.

This isolates the data-loss defect, but A04 remains a legacy execution owner
until equivalence and cutover are separately approved.

### Privacy and audit

Comments, client identity fields, SMS settings, and payment details are not
stored in raw form in the Shadow payload. They are represented by keyed opaque
references. Logs contain tenant/target hashes, normalized-input hash, execution
identity, policy metadata, and minimal safe legacy outcome only. Raw CRM
payloads, names, phones, comments, and payment payloads are not logged or
persisted by this observer.

The field contract mismatch discovered during adversarial review
(`client_identity` versus canonical `client_name`) was corrected and protected
by a ratchet test.

## Adversarial Verification

| Attempted invariant break | Result |
|---|---|
| Submit a residual class through bridge `/execute` | Rejected before execution |
| Inject an executor into a residual capability | Registry contract rejects it |
| Cause Shadow to report an external effect | Observer rejects the result; no legacy repeat |
| Repeat the same logical mutation after restart | Same deterministic execution identity |
| Use the same identity in another tenant | Tenant-qualified identity remains isolated |
| Leak comment/name/phone/payment values into Shadow | Only keyed opaque references cross the bridge |
| Default absent attendance to zero on an unrelated update | Ratchet and adapter tests reject the behavior |
| Pass unsupported/bool attendance to the provider | Rejected or omitted before provider mutation |
| Let observer failure change the completed legacy result | Failure is logged and returns `False` only |
| Accidentally migrate create/reschedule/cancel or attendance execution | Executable allowlist remains exactly create/reschedule/cancel |
| Start package 2 behavior | No communication/bulk code changed |

No dispatch occurs in the new path, so `UNKNOWN`, reconciliation, and
post-dispatch retry behavior cannot be exercised by Shadow. Their canonical
Action Engine semantics remain unchanged and must be proved for each class at
cutover.

## Verification Results

- Python bridge and architectural ratchet suite: **28 passed**.
- Targeted Nest registry, boundary, bridge, and YClients adapter suite:
  **65 passed**.
- Full Nest test matrix: **170 suites / 1,710 tests passed**.
- TypeScript typecheck: **passed**.
- ESLint: **passed**.
- Production build and preflight: **passed**.
- `git diff --check`: **passed**.

## Production And Cutover Decision

No production deployment, CRM mutation, external message, or automatic cutover
was performed by this package run. The five classes still have legacy execution
owners, so their direct bypass count remains five at this gate.

Before any cutover, production Shadow must observe representative organic
actions and compare tenant, action class, appointment target, normalized
semantics, deterministic identity, authorization/policy context, and expected
canonical executor. A real user action may be requested only after the observer
is deliberately deployed and its health is verified. Cutover requires a
separate approval and must remove direct execution without runtime fallback.

## Final Status

PACKAGE COMPLETE: NO
ACTION CLASSES MIGRATED: 0
DIRECT BYPASSES REMAINING FOR PACKAGE: 5
BLIND RETRY AFTER UNKNOWN: NO
NEXT BLOCKING PACKAGE STARTED: NO
CHAPTER 6 BLOCKING PACKAGES REMAINING: 5
