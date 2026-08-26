# CYCLE 06 — BLOCKING PACKAGE 1 — RESIDUAL APPOINTMENT MUTATION CONVERGENCE REPORT

Status: shadow deployed; A04-A07 production equivalence observed; A08 divergence isolated; cutover not performed
Repository implementation HEAD: `c8c67c72`
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

### Native/Nest observation coverage

The first owner-performed A05 proof exposed a reachability gap rather than an
equivalence divergence: the native iOS journal uses an authenticated Nest
endpoint for duration changes, while the original hook covered only Python
legacy initiators. The successful provider mutation therefore produced no
observation.

The authenticated Nest owners for A04 attendance, A05 duration, and A06 service
composition now submit the same passive `SHADOW_ONLY` observation after a
confirmed legacy success. Their authorization evidence is derived from the
verified request tenant and is evaluated separately from integration-secret
Python observations. A provider failure produces no observation; an observer
failure cannot change an already successful legacy result.

This adds observation only. Nest remains the execution owner during the proof
window, and the new path still has no CRM or messaging executor.

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

### A08 partial-effect safety boundary

The owner-performed card close exposed a provider ambiguity that the original
legacy code treated as a normal failure. YClients accepted one finance
transaction, but returned it without `record_id` or `visit_id` linkage and left
the appointment unpaid. Treating that result as a retryable failure could create
a second cashbox transaction.

The legacy A08 owner now fails closed around this provider behavior:

- before dispatch it reconciles by the exact MAYA payment marker and amount,
  including provider rows whose record and visit linkage was stripped;
- a reconciliation outage never means "no transaction" and therefore never
  permits a blind dispatch;
- an already existing matching transaction suppresses a second finance write;
- a dispatch result whose provider outcome cannot be proved is `UNKNOWN`, not
  `FAILED`;
- the HTTP contract returns `202`, `retry_allowed = false`, and an explicit
  instruction not to repeat payment;
- the durable legacy `payment_idempotency` success marker is not written until
  the appointment itself is confirmed paid;
- Shadow receives the unknown A08 outcome for comparison, but remains unable to
  execute a CRM or cashbox mutation;
- failure of Shadow telemetry cannot hide or alter the fail-closed user result.

This is a safety repair to the existing legacy execution owner. It is not an
A08 cutover and grants the Action Engine no new execution capability.

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
- Organic observer suite: **14 passed**.
- A08 payment ambiguity, reconciliation and legacy bridge suite: **34 passed**.
- Python syntax compilation for the changed A08 files: **passed**.
- Targeted Nest CRM visit-operation suite: **15 passed**.
- Full Nest test matrix: **170 suites / 1,713 tests passed**.
- TypeScript typecheck: **passed**.
- TypeScript scripts typecheck: **passed**.
- ESLint: **passed**.
- Production build and preflight: **passed**.
- `git diff --check`: **passed**.

## Production Shadow Evidence

One organic A07 `set_appointment_fields` action was observed on 26 August 2026
at approximately 01:45 MSK. The legacy mutation succeeded, while the canonical
shadow result was a durable `NOT_EXECUTED / shadow_only` ActionExecution using
`crm.appointment.fields.shadow.v1` and `shadow.none`. Tenant, target,
authorization, policy, and deterministic identity were equivalent. CRM writes,
messages, campaigns, and all other shadow side effects were zero.

The owner then changed the duration of their own appointment through the native
MAYA journal at approximately 02:31 MSK. The production edge received two
successful A05 requests for the same appointment with different normalized
duration inputs. They therefore represent two distinct duration transitions,
not a retry of one logical identity. Both legacy writes were independently
classified `EQUIVALENT` by the Shadow observer. The observer reported zero
divergences, zero incomplete observations, and zero CRM writes, messages,
campaigns, or other external actions from the new path.

The user intended a single `-15` interaction, so the two client requests remain
a separate native UX/request-coalescing finding. The backend did not duplicate
either request: each HTTP request produced exactly one legacy write and one
passive observation. This does not invalidate A05 semantic equivalence, but it
must not be misreported as Action Engine deduplication; the two normalized
inputs generated two execution identities and `duplicates_collapsed = 0`.

The owner then set their own future appointment to `waiting` through the native
MAYA journal at approximately 02:38 MSK. This produced exactly one successful
A04 legacy write and exactly one passive Shadow observation. Tenant, target,
normalized attendance semantics, authorization context, policy, and expected
capability were equivalent. The observer reported one delivery, one unique
logical action, zero duplicates, zero divergences, zero incomplete
observations, and zero new-path external actions. Backend and observer journals
contained no errors.

The owner next edited the service composition of the same appointment through
the native MAYA journal at approximately 02:41 MSK. The production edge received
three successful A06 requests with three different normalized service sets.
Each request produced exactly one legacy write and one passive Shadow
observation. All three were classified `EQUIVALENT`; there were three unique
logical actions, zero collapsed duplicates, zero divergences, zero incomplete
observations, and zero new-path external actions. Because the normalized inputs
differ, these are reported as three real composition transitions rather than a
single request duplicated by the backend.

The owner then restored the original service composition. The observer received
a fourth A06 delivery, matched it to an already known deterministic execution
identity, and collapsed it instead of creating a fourth logical action. The
final A06 aggregate is four deliveries, three unique logical actions, one
collapsed duplicate, zero divergences, zero incomplete observations, and zero
new-path external actions. This proves that returning to previously observed
canonical evidence converges after the round trip rather than producing a new
execution identity.

| Action class | Verdict |
|---|---|
| A04 attendance/status | EQUIVALENT (1 organic transition; 0 divergences) |
| A05 duration | EQUIVALENT (2 distinct organic transitions; 0 divergences) |
| A06 services/composition | EQUIVALENT (4 deliveries; 3 unique transitions; 1 duplicate collapsed; 0 divergences) |
| A07 fields/comment/client/SMS | EQUIVALENT |
| A08 payment/close | DIVERGENT: one finance transaction was accepted but remained provider-unlinked and the appointment remained unpaid |

The earlier A05 owner action is not counted as evidence because it occurred
before the native/Nest observation hook existed. Production equivalence is not
inferred from structural tests.

For A08, the owner selected card payment on appointment `1930492386`. The
provider created exactly one matching 2,000-ruble finance transaction, but
returned `record_id = 0` and `visit_id = 0`; the appointment remained
`paid_full = 0`, `payment_status = 0`, with 2,000 rubles still due. A subsequent
read-only check after the owner's latest tap still found exactly one matching
transaction, proving no duplicate external charge was created. This is a real
production divergence/partial external effect, not equivalence. No payment or
provider data was changed during verification.

## Production And Cutover Decision

The initial Shadow capability implementation was deployed as immutable release
`20260826-c06-p1-residual-appointment-shadow`. Native/Nest observation coverage
was then deployed as immutable release
`20260826-c06-p1-native-residual-shadow`. Health, readiness, isolated build
smoke, Action Engine startup, and migration status passed; there were no
pending database migrations.

The updated passive observer was deployed atomically to the dedicated
`maya-organic-appointment-shadow-observer.service`. It retained the existing
journal cursor and SQLite observation state across restart. Both `maya-saas`
and the observer are active with no restart loop or launch errors. The observer
runs without network access and cannot execute a CRM write or message send.

Immediately after the native coverage rollout, the read-only aggregate check
reported no synthetic residual observation and no planning failure. After the
owner-performed A05 proof, the observer reported two A05 deliveries, two unique
logical actions, zero divergences, zero incomplete observations, and zero new-
path external actions. The subsequent A04 proof added one delivery and one
unique logical action with the same zero-divergence and zero-side-effect
result. The A06 proof then reached four deliveries and three unique logical
actions after the original service composition was restored; the repeated
identity was collapsed. It again had zero divergences, incomplete observations,
or new-path external actions. Backend and observer journals contained no
errors. The new path has performed zero CRM mutations and zero external
messages.

No automatic cutover was performed. The five classes still have legacy
execution owners, so their direct bypass count remains five at this gate.

A08 remains blocked from cutover until its canonical executor has an approved
provider-specific reconciliation strategy for unlinked finance transactions
and a new safe proof returns an unambiguous equivalent outcome. The new legacy
guard prevents duplicate finance dispatch and preserves `UNKNOWN`; it does not
claim the partially affected appointment is paid.

The fail-closed A08 guard was deployed as
`20260826-c06-p1-a08-unknown-guard`. The service restarted cleanly, remained
active with zero restart-loop count, and the changed files matched the reviewed
release hashes. The authenticated health route remained reachable (rejecting
the unauthenticated local probe as designed), and the new process journal
contained no startup or runtime errors. Deployment performed no payment,
appointment, CRM, or messaging action.

Before any cutover, production Shadow must observe representative organic
actions and compare tenant, action class, appointment target, normalized
semantics, deterministic identity, authorization/policy context, and expected
canonical executor. The observer is deployed and healthy, so the next allowed
step is one explicitly requested, owner-performed production action followed by
read-only inspection. Cutover requires a separate approval and must remove
direct execution without runtime fallback.

## Final Status

PACKAGE COMPLETE: NO
ACTION CLASSES MIGRATED: 0
DIRECT BYPASSES REMAINING FOR PACKAGE: 5
BLIND RETRY AFTER UNKNOWN: NO
NEXT BLOCKING PACKAGE STARTED: NO
CHAPTER 6 BLOCKING PACKAGES REMAINING: 5
