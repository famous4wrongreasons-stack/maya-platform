# CYCLE 06 BLOCKING PACKAGE 4 — P4-07 EXPENSE VALUE CONVERGENCE RUNTIME CONTRACT GATE

Status: **COMPLETE — contract only; runtime not started**

Source checkpoint: `859d92ef`

Gate date: 2026-09-02

## 1. Scope And Boundary

This Gate defines the runtime contract for `P4-07 / A21 — Expense Value
Convergence`. It uses the accepted post-P4-06 remainder checkpoint, the
Package 4 Monetary/Value Gate, the applied `Expense` and
`ExpensePeriodDeclaration` ActionExecution bindings, the final Package 4
schema verification, and the actual production-reachable HTTP and AI Tool
Runtime paths.

This step does not register an Action Engine capability, add an executor,
change an expense service/controller/tool, create a migration, deploy, mutate
production, create/delete an expense, create/invalidate a declaration, or
start Shadow. P4-02 through P4-06 remain immutable completion baselines and
A08 payment write remains disabled.

One count-only production read confirmed the current footprint without
exposing tenant, actor, branch, note, or other business data:

- `Expense`: `0` rows;
- `ExpensePeriodDeclaration`: `0` rows;
- legacy expense AI Tool executions: `0`;
- canonical P4-07 ActionExecutions: `0`.

The family has one production-reachable bypass group and four concrete direct
mutation subgroups:

1. `Expense` creation;
2. physical `Expense` deletion;
3. `ExpensePeriodDeclaration` create/update through upsert;
4. declaration invalidation through `deleteMany` after an expense create or
   delete.

`P4-07 GATE-LEVEL PRODUCTION BYPASS GROUPS: 1`

`P4-07 CONCRETE DIRECT-MUTATION SUBGROUPS: 4`

## 2. Current Production Owners

| Boundary | Current initiator | Current execution owner | Direct effect |
|---|---|---|---|
| Expense create | authenticated `POST /expenses` | `ExpensesController -> ExpensesService.create` | inserts `Expense`, writes audit, then deletes overlapping completeness declarations |
| Expense create from MAYA | `expenses.create` through `AiToolRuntimeService` approval/execution | `AiToolHandlerService -> ExpensesService.create` | same direct domain mutation under a second execution/approval system |
| Expense delete | authenticated `DELETE /expenses/:id` | `ExpensesController -> ExpensesService.remove` | physically deletes the exact row, deletes overlapping declarations, then writes audit |
| Period declaration | `expenses.period.complete` through `AiToolRuntimeService` | `AiToolHandlerService -> ExpensesService.declarePeriodComplete` | upserts the current whole-tenant declaration and writes audit |
| Period invalidation | a successful direct create/delete | private `ExpensesService.invalidatePeriodDeclarations` | physically deletes all same-tenant declarations whose period contains the changed expense day |

There is no registered P4-07 Action Engine capability and neither domain row
is currently written through Canonical Action Ingress. `AiToolExecution` and
`AiApprovalRequest` are legacy tool-runtime state, not substitutes for
`ActionExecution` and Package 3 policy/approval attestation.

The old Python `salon_expenses` helpers exist in source, but the legacy Python
service is disabled/inactive in production and those rows are not the
canonical Prisma `Expense` aggregate. They are not counted as a second live
P4-07 owner. They must not be re-enabled or used as a fallback after P4-07
cutover.

Read paths (`GET /expenses`, expense-period reader, analytics/profit readers)
do not own value and remain outside the action count. No production-reachable
CRM expense importer, external expense write, bulk writer, or expense
scheduler was found.

After eventual cutover, HTTP and AI may remain initiators. They must submit the
same canonical contracts and may not call `ExpensesService` mutation methods
directly. `ExpensesService` may remain the isolated canonical domain executor
only when invoked by the Action Engine.

## 3. Exact Action Classes

The family contains **three** action classes, derived from distinct business
identity, actor, risk, and lifecycle boundaries:

| Order | Action class | Capability boundary | External dispatch |
|---:|---|---|---|
| 1 | `create_expense` | Record one exact expense with immutable tenant/branch/category/amount/currency/date/source facts | None |
| 2 | `delete_expense` | Remove one exact existing expense while retaining its immutable pre-delete execution/audit evidence | None |
| 3 | `declare_expense_period_complete` | Record the authenticated owner's assertion that all additional non-payroll expenses for one exact whole-tenant period are entered | None |

### 3.1 Why declaration invalidation is not a fourth public action

Current production exposes no standalone reopen/invalidate endpoint, AI tool,
job, or scheduler. A declaration is derived confidence state, not a lock on
the ledger: an expense can still be created or deleted. Every successful
ledger mutation whose occurrence day falls inside a declared interval must
invalidate that declaration in the **same local transaction**.

The invalidation therefore belongs to the triggering `create_expense` or
`delete_expense` execution. Its server reason is
`expense_ledger_changed:create` or `expense_ledger_changed:delete`, and the
triggering execution/audit retains the exact invalidated declaration ids and
periods. There is no independent caller authority, approval, retry identity,
or external outcome.

If a future product adds explicit reopen/invalidate, update/edit, restore,
bulk import, or scheduled expense mutation, that is a new action contract and
cannot be hidden inside these three classes.

### 3.2 Period declaration is not a financial close

`declare_expense_period_complete` means only that the owner asserts that all
additional non-payroll expenses for the selected period have been entered.
It does not freeze accounting, create a zero-value expense, include CRM
payroll, prevent later writes, or certify provider data. Later ledger change
removes the current declaration; a new declaration must bind to the changed
ledger snapshot.

## 4. Canonical Identities And Immutable Facts

Caller-supplied tenant, role, amount authority, currency authority, category
authority, branch ownership, current date, idempotency scope, approval,
autonomy, cap, or execution outcome is never authoritative.

### 4.1 Shared authority

- **Tenant:** authenticated tenant context, never a body/tool argument.
- **Actor:** active same-tenant Membership resolved by policy; historical
  `createdById` is not current authorization.
- **Branch:** optional exact `Branch(id, tenantId)`; absence means the whole
  tenant rather than an inferred branch.
- **Currency:** tenant `defaultCurrency` or another explicitly permitted
  server policy currency. The current MAYA action is RUB-only and performs no
  FX conversion.
- **Category:** canonical `EXPENSE_CATEGORY_SLUGS`; manual `payroll` is
  rejected because CRM payroll is the system-owned source.
- **Date:** an exact local business day resolved under the tenant timezone and
  frozen as UTC occurrence evidence before approval/execution.
- **Note/reason text:** optional encrypted non-authority evidence; never an
  idempotency key and never emitted in audit plaintext.

Expenses are tenant financial-book facts, not Client-owned value. P02/P03 and
other Client identity holds are neither consulted nor changed by this family;
P4-07 must not create Clients or use phone/provider identity as expense
authority.

### 4.2 Deterministic logical identities

| Action class | Server-derived logical identity |
|---|---|
| `create_expense` | tenant + source namespace + stable explicit intent/source-event reference + normalized category + exact minor-unit amount/currency + occurrence day + optional exact branch + contract version |
| `delete_expense` | tenant + immutable expense id + its creation/source identity + delete-contract version |
| `declare_expense_period_complete` | tenant + exact whole-tenant day range + server-computed expense-ledger snapshot hash + declaration-contract version |

For a manual action, the stable intent reference comes from the canonical
ingress/request/approval binding. It must not be a random executor UUID and a
content hash alone must not collapse two genuinely distinct identical
expenses. For a future trusted CRM source, identity must use the exact
tenant-qualified provider/source event id; that writer is not currently
production-reachable.

`Expense.idempotencyKey` and `Expense.actionExecutionId` are derived from the
claimed canonical execution. The initiator cannot choose either. A retry,
restart, duplicate approval, or a second surface carrying the same intent
converges to one execution and one row. A genuinely separate same-value
expense requires a new explicit intent/approval and is retained as a separate
business fact; probable-duplicate heuristics are warning evidence, not
authority and not an automatic merge.

Delete identity is terminal for the exact immutable expense id. A second
initiator for the same target converges to the existing deletion execution;
it cannot create a different historical meaning by changing reason or actor.

The declaration snapshot hash covers the sorted same-tenant expense identity,
category, amount, currency, occurrence day, source, and branch facts inside
the exact period. Re-declaration over the unchanged snapshot converges. After
a ledger mutation invalidates it, the changed snapshot yields a new logical
identity rather than rewriting the old ActionExecution.

## 5. Create Contract

Before planning, Canonical Ingress must derive and bind:

- exact tenant and active actor membership;
- source namespace and stable intent/source event;
- canonical category and whether manual entry is allowed;
- positive exact minor-unit amount and ISO currency;
- tenant default/allowed currency policy;
- exact local occurrence day and resulting UTC timestamp;
- optional same-tenant branch;
- encrypted note, policy version, risk facets, cap decision, and approval.

The current hard per-row limit is `10,000,000` major currency units
(`1,000,000,000` minor units for RUB). It is a server limit, not a value the
caller can raise. No implicit ruble/kopeck conversion is accepted outside the
versioned server converter, and no FX conversion is performed.

Execution uses one PostgreSQL transaction under the tenant expense-ledger
lock to:

1. claim the ActionExecution;
2. insert one `Expense` with its immutable creation binding;
3. remove every same-tenant completeness declaration containing the exact
   occurrence day;
4. write tenant audit evidence for the expense and each invalidated period;
5. finalize the local domain result.

Any failure rolls back all domain effects. It is forbidden to create the
expense and leave a stale declaration, or invalidate a declaration without
the matching expense commit.

## 6. Delete Contract

Delete remains a **physical delete**, matching the accepted schema decision;
it is not silently converted into a soft-delete flag. Before mutation the
executor locks and reads the exact same-tenant row and freezes in the
ActionExecution/audit contract:

- expense id and creation/source identity;
- branch;
- category;
- amount and currency;
- occurrence timestamp/day;
- source/external reference hash where present;
- canonical reason `actor_requested_delete` and exact actor/policy/approval.

The encrypted note is not copied into plaintext audit. The transaction then
deletes the exact row, invalidates declarations containing its occurrence
day, writes the pre-delete tenant audit, and commits all-or-nothing.

Concurrent deletes lock the same target. One execution wins; other initiators
converge to that identity or fail closed. A missing row is success only when
the same canonical delete execution and its exact audit evidence already
prove the prior commit. Mere absence is not enough to claim success for a new
execution.

No restore/update action exists. A different expense cannot reuse the deleted
row identity.

## 7. Period Declaration And Race Contract

Only an authenticated owner/business-owner assertion over a server-resolved
whole-tenant period may initiate `declare_expense_period_complete`. A branch
period is rejected. The period is a valid inclusive local-day interval no
longer than `366` days; current time and timezone come from server state.

The declaration transaction:

1. acquires the same tenant expense-ledger transaction lock used by create
   and delete;
2. reads and hashes the complete period ledger, without a page limit;
3. rechecks policy and explicit owner evidence;
4. creates the current `ExpensePeriodDeclaration` with the immutable
   ActionExecution binding, or returns the existing declaration for the exact
   same snapshot;
5. writes tenant audit and commits.

It must not use the current mutable upsert behavior to replace
`declaredById`, `idempotencyKey`, or provenance on an existing declaration.
Same tenant/period plus a different snapshot is a stale/conflicting state and
fails closed unless the ledger-changing execution has already invalidated the
old row.

The shared tenant ledger lock closes the dangerous race:

- declaration cannot commit from snapshot N after create/delete committed
  snapshot N+1;
- create/delete cannot commit while leaving a declaration based on N;
- overlapping day/month/custom declarations are all invalidated atomically
  when the changed expense day is inside their range;
- exact-period concurrent declarations converge through the tenant/period
  and action/idempotency unique claims.

Absence of a current declaration is the canonical reopened/incomplete state.
No separate mutable period status or tombstone is required.

## 8. Policy, Approval, And Blast Radius

Policy is evaluated by Canonical Action Ingress from authenticated membership,
feature entitlement, source/surface, normalized value facts, tenant policy,
and current ledger state.

| Action | Initial risk/approval contract | Hard blast-radius boundary |
|---|---|---|
| `create_expense` | monetary `high_write`; model/agent initiation always requires exact actor-bound confirmation; authenticated direct UI intent still requires server policy and cannot supply its own approval | one tenant, one expense, one optional branch, positive amount at or below the server cap, atomic invalidation only for periods containing that day |
| `delete_expense` | destructive financial-reporting write; exact authenticated actor and policy decision, with actor confirmation for assistant/model initiation | one tenant and one exact expense; no wildcard/range delete; atomic invalidation only for periods containing that expense day |
| `declare_expense_period_complete` | `low_write` but truth-bearing; only explicit owner/business-owner statement, never model inference; no separate approval when that exact authenticated assertion is the initiator evidence | one tenant-wide period of at most 366 days; no branch, cross-tenant, bulk, or payroll mutation |

The existing surface differences remain explicit policy inputs rather than
caller authority: the AI tools currently expose writes only to tenant/business
owners, while the authenticated HTTP controller admits its server-owned
expense-manager role set. Runtime alignment must not silently widen either
surface. Exact actor Membership, feature `expenses.core`, current tenant
access, approval binding, and action contract decide execution.

L2.5 may produce a Shadow plan but cannot receive execution permission. A
caller-supplied role, cap, `approved=true`, category, currency, or tenant does
not satisfy policy.

No production bulk expense writer or scheduler exists. P4-07 therefore
authorizes no bulk import, range delete, automatic recurring expense, or
scheduler mutation. Declaration invalidation is an all-or-nothing derived
consistency effect limited to one tenant and one exact changed day; it is not
partial fan-out and creates no value.

## 9. UNKNOWN And Reconciliation

All three approved actions and their declaration invalidation effects are
pure PostgreSQL/local operations. There is no provider dispatch and no
legitimate `UNKNOWN` state.

| Action | Authoritative local reconciliation |
|---|---|
| `create_expense` | exactly one same-tenant `Expense` bound to the ActionExecution and matching the immutable normalized value contract; no containing stale declaration remains |
| `delete_expense` | same canonical execution plus exact pre-delete tenant audit prove commit; target row is absent and containing declarations were invalidated |
| `declare_expense_period_complete` | exactly one same-tenant declaration bound to the ActionExecution, exact period, and matching ledger snapshot |

A local transaction either commits or rolls back. Process loss after commit
is resolved from these durable facts under the same execution; it is not
relabeled `UNKNOWN`. Process loss before commit leaves none of the domain
effects. A partial state is a failed invariant and must fail closed for
operator repair rather than blind replay.

If a future expense action performs an external provider write, it requires a
separate provider request identity, `UNKNOWN != FAILED`, reconciliation, and
no-blind-retry contract before being added. Existing read-only CRM/payroll
facts do not create such a boundary.

`UNKNOWN/RECONCILIATION CONTRACT: NOT REQUIRED — LOCAL TRANSACTIONS`

## 10. Durable Schema Decision

The current applied schema can represent the complete approved contract:

- `Expense.actionExecutionId` is a nullable historical-compatible,
  tenant-qualified, immutable one-to-one creation binding;
- `(tenantId, idempotencyKey)` and `(tenantId, externalId)` retain the domain
  duplicate claims;
- `ExpensePeriodDeclaration.actionExecutionId` is the corresponding
  historical-compatible one-to-one declaration binding;
- `(tenantId, periodFromDay, periodToDay)` and
  `(tenantId, idempotencyKey)` retain declaration claims;
- `ActionExecution` stores the normalized target, value, pre-delete and
  period-snapshot evidence, policy/approval, result, and restart identity;
- tenant audit retains deletion and invalidation provenance;
- the accepted final Package 4 schema decision explicitly requires no
  expense-delete tombstone and no declaration-invalidation tombstone.

Historical rows with null ActionExecution bindings remain honest legacy facts
and receive no invented execution. Current production contains no such rows,
but the compatibility rule remains mandatory.

Schema sufficiency depends on the executor honoring the atomic transaction,
lock, audit, immutable-fact, and no-direct-update contracts above. The current
runtime does not yet do so; that is a runtime/Shadow gap, not a durable-schema
gap.

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

## 11. Shadow And Cutover Order

P4-07 requires Shadow because one active bypass family still owns monetary and
truth-bearing mutations directly. Shadow must be physically non-executable
and must never create/delete an expense or declaration.

The approved order is:

1. `create_expense` Shadow;
2. `delete_expense` Shadow;
3. `declare_expense_period_complete` Shadow;
4. one executable PostgreSQL proof of create/delete/declaration and all
   declaration races;
5. production cutover plus a ratchet reducing all four direct-mutation
   subgroups to zero.

The first Shadow must compare the existing AI/HTTP intent with a
server-derived canonical plan, prove cross-surface convergence, and stop
before `Expense` or declaration mutation. This Gate does not start it.

## 12. Final Verdict

`P4-07 RUNTIME CONTRACT GATE COMPLETE: YES`

`P4-07 EXACT ACTION CLASSES: 3 — create_expense / delete_expense / declare_expense_period_complete`

`P4-07 PRODUCTION BYPASS GROUPS: 1`

`P4-07 DIRECT-MUTATION SUBGROUPS: 4`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`UNKNOWN/RECONCILIATION CONTRACT: NOT REQUIRED`

`P4-07 SHADOW CAN START: YES`

`P4-07 RUNTIME STARTED: NO`

`PRODUCTION EXPENSE/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`P4-02/P4-03/P4-04/P4-05/P4-06 REOPENED: NO`

`A08 PAYMENT WRITE: DISABLED`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 13. Permanent Process Hygiene

Only foreground, self-terminating source inspection and one read-only
production count query were used. No process was backgrounded and no database
was created.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. Shadow was not started.
