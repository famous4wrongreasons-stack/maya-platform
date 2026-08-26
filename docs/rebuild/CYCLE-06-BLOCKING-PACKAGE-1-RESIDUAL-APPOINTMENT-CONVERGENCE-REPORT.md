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

## A08 Root-Cause Analysis

### Exact legacy semantics

The legacy user action is labelled and returned as "pay and close the visit".
Its intended business postconditions are composite rather than a single
cashbox write:

1. mark the appointment as attended;
2. create the selected cash/card financial operation;
3. link that operation to the appointment and visit;
4. update the appointment payment state so that no amount remains due.

The legacy handler exposes `paid = true` and `attendance = 1` only when the
whole operation is reported as successful. A standalone finance transaction is
therefore not the user-visible success condition.

### Three independently observed states

| State | Read-only production evidence | Verdict |
|---|---|---|
| External financial operation created | Exactly one matching 2,000-ruble operation exists | YES |
| Operation linked to appointment/visit | The operation has `record_id = 0` and `visit_id = 0` | NO |
| Appointment payment state updated | `paid_full = 0`, `payment_status = 0`, and 2,000 rubles remain due | NO |

The first row is evidence of a partial provider side effect only. It is not
proof that the appointment was paid or closed.

### Root cause and ownership classification

The primary root cause is a **legacy semantics defect**: after the appointment
update failed to produce a proven paid state, the legacy implementation used a
generic finance-transaction creation call as a fallback for completing the
composite "pay and close" action. It assumed that submitting appointment and
visit identifiers would make the resulting cashbox operation settle and link
the visit. The provider accepted the operation but persisted it without those
links and left the appointment unpaid.

This is also a provider-contract mismatch/limitation for the selected endpoint:
successful creation of the financial operation does not provide an atomic
guarantee that the visit is linked and settled. The current evidence does not
justify classifying the provider acceptance itself as a provider failure.

The new canonical executor did not cause the divergence: A08 remains
`SHADOW_ONLY`, has no executor, and performed zero financial or CRM writes.
The durable `ActionExecution` schema is not the blocker because it can already
preserve `UNKNOWN`, attempt evidence, safe partial-result summaries, and a
reconciliation state. The current **A08 capability contract is incomplete**,
however: its opaque `valueRef` does not separately express attendance, external
operation creation, record/visit linkage, and final appointment payment state.

### Read-only reconciliation boundary

Current-state reconciliation is possible without another mutation:

- find the exact financial operation using the deterministic payment marker
  and amount;
- read its appointment/visit linkage fields;
- read the appointment payment fields and remaining service amount;
- classify the composite result as succeeded, not executed, failed before
  dispatch, or partial/UNKNOWN.

For this incident, reconciliation proves a stable partial/UNKNOWN outcome:
operation created, operation unlinked, appointment unpaid. It cannot safely
repair the linkage or mark the appointment paid. Such repair would be a new
production financial mutation and is outside the approved scope.

The existing `UNKNOWN guard` remains mandatory. The matching operation blocks
a second dispatch, and reconciliation failure must never be interpreted as
"no operation exists".

### Gate decision

Correcting A08 requires an approved financial capability contract that defines:

- which postconditions constitute success for "pay and close";
- whether attendance is part of the same action or a separately authorised
  transition;
- which provider-supported primitive owns operation-to-visit linkage and
  payment settlement;
- how each partial state is represented and reconciled;
- how an already-created unlinked operation is escalated for manual resolution
  without a second charge.

This changes the current financial execution semantics, so the required result
is **A08 FINANCIAL SEMANTICS/CONTRACT GATE -> STOP**. Based on the current
durable kernel, a Prisma/schema migration is not required for the gate itself.
No canonical executor or production repair was implemented, and Package 2 was
not started.

`A08 ROOT CAUSE: legacy generic finance-transaction fallback created a provider-accepted but unlinked operation; the composite visit payment postconditions were never satisfied`

`EXTERNAL OPERATION CREATED: YES`

`APPOINTMENT PAYMENT PROVEN: NO`

`SECOND OPERATION POSSIBLE: NO`

`RECONCILIATION POSSIBLE: YES (read-only state classification only; no automatic repair)`

`A08 CUTOVER SAFE: NO`

`PACKAGE 1 COMPLETE: NO`

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

## A08 Canonical Visit Payment Cutover Candidate

The approved A08 implementation replaces the legacy business semantics
"create a generic financial operation" with the canonical business action
`pay_visit`. The release candidate routes that action through Action Engine to
the YClients visit-payment executor and uses only the documented public
`PUT /visits/{visit_id}/{record_id}` capability with the supported
`fast_payment` allocation. The action name and contract express the business
result, not the provider transport endpoint.

The canonical preflight reads provider truth before dispatch and proves the
tenant, visit/record identity, current unpaid state, exact outstanding amount,
payment method/allocation, requester authorization, and deterministic
execution identity. An already paid visit converges without a second provider
write. Amount mismatch, partial payment, ambiguous state, wrong tenant, wrong
visit, and unauthorized initiation fail closed before dispatch.

After a provider write the executor reads the record, visit, visit details,
and linked transactions again. `SUCCEEDED` is permitted only when those reads
prove the intended record/visit is paid in full and its non-deleted service
transactions carry the exact payment allocation. HTTP success, remaining
amount alone, or the existence of a generic financial operation is not proof.
An acknowledged or timed-out dispatch without this proof remains `UNKNOWN` and
is eligible only for read-only reconciliation. Blind retry is impossible.

The existing unlinked 2,000-ruble operation has `record_id = 0` and
`visit_id = 0`; the canonical proof deliberately ignores it. The operation was
not modified, linked, deleted, or compensated and remains a manual accounting
review item.

The old `set_record_paid` fake-payment entry point is now a fail-closed
tombstone. The Telegram and panel initiators call only the protected bridge,
and the bridge accepts only the canonical `pay_visit` contract. Architectural
ratchets reject restoration of a generic financial-operation fallback,
direct provider payment mutation by an initiator, dispatch without the
Telegram staff ownership check, or retry after an unknown outcome.

Shadow planning was exercised with the canonical tenant, visit, amount,
payment allocation, authorization context, and execution identity. It
performed zero provider writes. The NestJS release candidate was deployed as
immutable release `20260826-c06-p1-a08-canonical-shadow`. The reviewed Python
initiators and bridge client were deployed with the fail-closed proof canary:
`MAYA_A08_PAY_VISIT_SCOPE=proof`, with exactly one owner-controlled test record
allowlisted. All other payment targets remain blocked. Deployed source hashes
match the reviewed commit and both `maya-saas` and `barbershop-bot` are active.

The production Shadow used the owner's own unpaid test visit, the exact
2,000-ruble amount, card allocation, deterministic logical execution identity,
the documented YClients visit-payment endpoint, and the mandatory paid-visit
read-back contract. Shadow accepted the canonical plan while performing zero
provider writes. The durable production `pay_visit` execution count remained
zero. A subsequent read-only provider inspection proved that the visit remained
unpaid and had zero linked canonical payment transactions. It also proved that
the historical unlinked 2,000-ruble operation remained present and untouched.
No generic financial operation was created by the new path.

The canary is therefore structurally and semantically ready for one explicit
owner-performed payment proof, but that proof has not run. A08 production
cutover is not complete until one manual action proves one ActionExecution, one
documented provider payment mutation, authoritative paid read-back, no generic
operation, no duplicate on repeat, and a consistent local mirror. The four
other Package 1 classes remain on their previously recorded owners.

### Mandatory adversarial matrix

| # | Scenario | Evidence / verdict |
|---|---|---|
| 1 | Unpaid visit -> canonical payment | Adapter and CRM service tests prove one documented visit-payment mutation. |
| 2 | Read-back proves paid | Success requires the authoritative record, visit, details, and linked allocation reads. |
| 3 | Repeated same payment | Already-paid convergence plus Action Engine identity prevents a second mutation. |
| 4 | Already paid visit | Adapter returns the proven paid state without dispatch. |
| 5 | Timeout before dispatch | Existing Action Engine kernel records non-dispatch and permits no false success. |
| 6 | Timeout after dispatch | Provider/bridge tests preserve `UNKNOWN`; no fallback or retry occurs. |
| 7 | UNKNOWN -> reconciled paid | Reconciler maps exact paid read-back to `PROVEN_SUCCEEDED`. |
| 8 | UNKNOWN -> not applied | Authoritative unpaid read-back maps to `PROVEN_NOT_EXECUTED`. |
| 9 | Partial provider state | Partial or conflicting allocation remains unresolved and blocks dispatch/retry. |
| 10 | Local mirror failure after provider success | Provider proof remains authoritative; initiators mirror only after a confirmed canonical receipt. |
| 11 | Restart after dispatch | Durable Action Engine execution and reconciliation resume the same identity. |
| 12 | Two workers, same payment | The existing database claim invariant admits one execution owner. |
| 13 | Wrong tenant | Tenant-scoped CRM service and protected bridge reject the request. |
| 14 | Wrong visit | Missing or mismatched provider record/visit fails closed before mutation. |
| 15 | Unauthorized requester | Allowed bridge origins, panel authentication, and Telegram staff ownership are enforced. |
| 16 | Amount mismatch | Exact outstanding amount is required by service and adapter. |
| 17 | Legacy generic-operation path | Tombstone and AST/architecture ratchets make the fake-payment path unreachable. |
| 18 | Existing 2,000-ruble operation | Unlinked zero record/visit identifiers are ignored as payment proof. |
| 19 | Blind retry | Registry allows one attempt and no retryable post-dispatch error. |
| 20 | Exactly one provider mutation | Dispatch-count assertions prove one mutation per successful logical action. |

The restart, local-mirror, and two-worker rows inherit the already approved
durable Action Engine kernel invariants; they do not claim a new production
payment. The full NestJS suite passed 1,734 tests in 170 suites, the focused
legacy Python boundary suite passed 15 tests, and typecheck, script typecheck,
lint, build, and whitespace validation passed.

## Final Status

A08 CANONICAL PAYMENT IMPLEMENTED: YES
LEGACY FAKE-PAYMENT PATH REACHABLE: NO
VISIT PAID SUCCESS REQUIRES READ-BACK: YES
BLIND RETRY AFTER UNKNOWN: NO
EXISTING 2000 RUB OPERATION MODIFIED: NO
A08 CUTOVER COMPLETE: NO
PACKAGE 1 COMPLETE: NO
PACKAGE 2 STARTED: NO

A08 SHADOW EQUIVALENT: YES
REAL PAYMENT PROOF REQUIRED: YES
REAL PAYMENT PROOF: NOT RUN
GENERIC FINANCIAL OPERATION CREATED BY NEW PATH: NO
VISIT PAID VERIFIED BY READ-BACK: NO

ACTION CLASSES MIGRATED: 0 (proof canary is not global cutover)
DIRECT BYPASSES REMAINING FOR PACKAGE: 4
NEXT BLOCKING PACKAGE STARTED: NO
CHAPTER 6 BLOCKING PACKAGES REMAINING: 5
