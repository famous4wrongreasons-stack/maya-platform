# CYCLE 06 BLOCKING PACKAGE 4 — P4-02 LOYALTY ADJUSTMENT EXECUTABLE PROOF / CUTOVER GATE

Status: PASS — isolated executable proof and source cutover candidate complete;
production deployment not performed
Source checkpoint: `f1384e88`
Report date: 2026-08-29

## 1. Exact Boundary

This step continued only `P4-02 / A19 — adjust_internal_loyalty`. It did not
start A20-L, expenses, referrals/rewards, subscriptions, certificates, billing,
A27-V, A32, Package 5, or Chapter 7. A08 payment write remains physically
disabled.

The candidate runtime graph is now:

`HTTP / approved AI initiator`

→ `Canonical Action Ingress`

→ `Action Engine`

→ private `loyalty.internal-adjust` domain adapter

→ atomic `LoyaltyAccount + LoyaltyTransaction.actionExecutionId` commit.

The previously registered `loyalty.internal-adjust.shadow.v1` capability is
retained only as an explicit L2.5 non-execution contract. It is not a fallback
and cannot invoke the domain adapter.

## 2. Canonical Capability And Authority

`loyalty.internal-adjust.execute.v1` is an authenticated-request capability
for the exact action class `adjust_internal_loyalty`. The registry owns its
action class, target kind, executor, risk profile, retry policy, reconciliation
policy, and strict normalized input.

Server-side policy permits only tenant owner, business owner, tenant admin, or
administrator memberships and requires the `loyalty` entitlement. The
capability is `L2_CONFIRMED_REQUEST`: the authenticated privileged request is
the confirmation boundary. Its approval requirement is canonically
`NOT_REQUIRED`, not caller-provided `approved=true`; Package 3 still derives
and verifies the exact NOT_REQUIRED approval-binding attestation before claim.
The existing approved AI tool remains an initiator and cannot supply its own
entitlement, autonomy, policy decision, executor, approval decision, or binding
hash.

Both HTTP and AI use the server-selected caller scope
`loyalty.internal-adjust`, the same caller UUID, target, actor, occurrence
scope, and normalized payload. A different `sourceRef` therefore converges to
the same logical `ActionExecution` rather than creating a second execution
owner.

## 3. Atomic Domain Boundary

The only ledger writer for this family is a private adapter called once, and
only from the Action Engine `dispatch` handler. One serializable PostgreSQL
transaction performs all three state changes:

1. reads or creates the tenant-qualified `LoyaltyAccount`;
2. updates the resulting balance;
3. creates the tenant-qualified `LoyaltyTransaction` with the current
   `actionExecutionId`.

There is no interval in which the balance can commit without its ledger row and
durable execution binding. A transaction failure rolls back all three. The
existing unique `(tenantId, idempotencyKey)` domain claim and canonical caller
idempotency prevent a second logical adjustment. An exact historical row with
a nullable binding can be attached to the current execution without changing
the balance; a changed operation or a row already bound to another execution
fails closed. The established binding remains protected by the Package 4
immutable trigger.

The relation remains intentionally 1:N at schema level: the
`(tenantId, actionExecutionId)` index is non-unique. This action currently needs
one ledger row, while the approved schema can represent multiple rows from one
execution without weakening each row's tenant-qualified binding.

## 4. UNKNOWN And Reconciliation

This is a local database mutation, not a provider call. Its only ambiguous
window is a lost process acknowledgement after the database commit.

Reconciliation reads the ledger by tenant and domain idempotency key, then
verifies target account, actor, delta, reason, and exact immutable execution
binding:

- an exact row bound to this execution proves success;
- an absent row proves non-execution and is the only condition that permits a
  new dispatch attempt;
- a contradictory row or another execution binding proves failure;
- an unreadable/ambiguous result remains `UNKNOWN`.

No path converts `UNKNOWN` to `FAILED` merely to retry, and no retry occurs
without a canonical `PROVEN_NOT_EXECUTED` read.

## 5. Isolated Executable Proof

The guarded proof script refuses every database whose name does not start with
`maya_c06_loyalty_`. A disposable PostgreSQL database replayed all 60 project
migrations, ran the scenarios below, deleted the proof tenant, disconnected,
and was dropped in the same command. A post-run catalog query confirmed no
proof database remained.

| Scenario | Result |
|---|---|
| HTTP then AI replay | PASS — one execution, one ledger row |
| Same logical request repeated | PASS — balance changed once |
| Two concurrent initiators | PASS — one transaction and one value mutation |
| Crash after balance update but before ledger insert | PASS — whole DB transaction rolled back; retry only after `PROVEN_NOT_EXECUTED` |
| Error after committed ledger/binding | PASS — reconciliation proved success; no redispatch |
| Ledger row tenant-qualified to execution | PASS |
| Forged entitlement/approval/autonomy/policy/executor/binding | PASS — rejected before dispatch |
| L2.5 Shadow | PASS — durable `NOT_EXECUTED`, zero ledger changes |
| Execution-to-ledger relation | PASS — non-unique tenant-qualified 1:N index |

The proof produced four isolated executable/recovery ActionExecutions plus one
Shadow execution; forged inputs created no execution and reached no dispatch.
It produced four ledger rows and the exact expected final proof balance of 100.
Those values existed only in the disposable database.

No real production loyalty adjustment is necessary for the proof: the local
transaction boundary, actual PostgreSQL constraints/triggers, and canonical
reconciliation are fully observable without inventing a customer value change.

## 6. Direct Bypass Recount

The candidate source graph contains two initiators and one execution owner:

- admin HTTP calls `LoyaltyService.adjustInternalBalance` with a fixed server
  source reference;
- the approved AI tool calls the same method with its fixed server source
  reference;
- that method always calls `ActionEngineRuntimeService.executeWithReceipt`;
- the private ledger adapter has exactly one caller, the runtime `dispatch`
  handler;
- controllers and AI handlers contain no ledger write;
- no direct `ActionExecution` creation or runtime legacy fallback exists.

Therefore production-reachable source bypass groups in the current HEAD are
`0`. The current production deployment was not changed by this gate, so P4-02
is not declared production-complete until an explicitly authorized deployment
gate verifies the running release without an artificial loyalty mutation.

## 7. Targeted Verification

| Check | Result |
|---|---|
| Targeted Jest | PASS — 3 suites / 28 tests |
| Executable PostgreSQL proof | PASS — all 10 matrix assertions |
| Clean migration replay | PASS — 60/60 |
| Application typecheck | PASS |
| Scripts typecheck | PASS |
| Targeted ESLint | PASS |
| Architecture ratchet | PASS — candidate bypass groups 0 |
| Temporary databases removed | PASS |
| Full suite | not run; reserved for an authorized production cutover/closure |

## 8. Verdict

`P4-02 COMPLETE: NO`

`LOYALTY EXECUTION OWNER: ACTION ENGINE`

`LEDGER/EXECUTION ATOMICITY PROVEN: YES`

`DUPLICATE VALUE MUTATION POSSIBLE: NO`

`BLIND RETRY AFTER UNKNOWN: NO`

`DIRECT BYPASS GROUPS REMAINING FOR FAMILY: 0`

`PRODUCTION VALUE MUTATIONS FOR PROOF: 0`

`PRODUCTION DEPLOYMENT/CUTOVER: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The next safe step, only if separately authorized, is the P4-02
production deployment/closure gate; it must not require an artificial loyalty
value mutation.
