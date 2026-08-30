# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CONTRACT CLOSURE GATE

Status: **CONTRACT COMPLETE; ONE MINIMAL SCHEMA CHANGE REQUIRED**
Source checkpoint: `9b7bd4eb`
Report date: 2026-08-30

## 1. Scope And Preserved State

P4-03 remains Shadow-complete at `8/8`. This Gate only closes the three
contract decisions identified by the all-eight executable proof preflight:

1. durable grant revocation;
2. consume reconciliation identity;
3. separate expiry/backfill/import bulk policies.

No Shadow slice, executor, Action Engine capability, production service, or
database was changed. No loyalty or provider mutation was executed. P4-02 was
not changed, A08 payment write remains disabled, and the next Package 4
family, Package 5, and Chapter 7 were not started.

## 2. Grant Revocation Contract

### 2.1 Meaning and truth owner

Revocation is an explicit Maya decision that an issued, still-active grant may
no longer be consumed. It is not expiry, code rotation, redemption, deletion,
or a rewrite of `expiresAt`.

Maya's tenant-scoped PostgreSQL domain state is the sole truth owner for grant
lifecycle. YClients does not own a grant and cannot revoke or reactivate one.
Possession of the bearer code is never authority.

The lifecycle is derived from immutable facts rather than a caller-set status:

| Derived state | Durable facts                                               | Allowed next transition |
| ------------- | ----------------------------------------------------------- | ----------------------- |
| `ACTIVE`      | issued, before `expiresAt`, no revocation, no redemption    | `REVOKED` or `CONSUMED` |
| `EXPIRED`     | no terminal claim, and current time is at/after `expiresAt` | none                    |
| `REVOKED`     | one immutable revocation fact                               | none                    |
| `CONSUMED`    | one immutable redemption fact                               | none                    |

`EXPIRED`, `REVOKED`, and `CONSUMED` are distinct terminal outcomes. Refund or
compensation of consumed value does not reactivate the grant.

### 2.2 Who may revoke

Canonical Ingress must resolve the actor and policy server-side. A single
active grant may be revoked by:

- its canonical beneficiary, for that beneficiary's own grant;
- an active `tenant_owner`, `business_owner`, `administrator`, or
  `tenant_admin` membership in the same tenant;
- a trusted system principal under a registered policy for
  `service_withdrawn`, `suspected_compromise`, or `policy_invalidated`.

Cashier status, raw role labels from a legacy caller, AI assertions, code
possession, and client-supplied `approved`/autonomy/binding data do not grant
authority. A single-grant revoke is risk-reducing and does not require manual
approval once actor and reason are resolved server-side. Bulk revocation is
not authorized by this Gate.

Only bounded reason codes may be durable: `client_request`,
`owner_or_admin_request`, `service_withdrawn`, `suspected_compromise`, and
`policy_invalidated`. Free-form notes and raw codes are not part of this fact.

### 2.3 Edge and race semantics

- revoke before consume: create the one revocation fact; all later consume
  attempts fail closed;
- revoke after consume: create no revocation fact and complete the revoke
  execution as `NOT_EXECUTED / grant_already_consumed`;
- revoke after expiry: create no revocation fact and complete as
  `NOT_EXECUTED / grant_expired`;
- repeat of the same logical revoke: converge on the same execution/fact;
- another logical revoke of the same grant: DB uniqueness rejects it;
- concurrent revoke and consume: both lock the same grant row and DB guards
  allow exactly one terminal fact.

`ActionExecution` already stores the server-derived actor and policy/approval
attestation. Duplicating mutable actor authority on the grant is unnecessary.
However, `ActionExecution`/audit alone cannot provide a tenant-qualified
domain claim answering whether a specific grant is revoked.

The minimal schema decision is therefore the append-only, domain-specific
`LoyaltyRedemptionGrantRevocation` proposal recorded separately in
`CYCLE-06-BLOCKING-PACKAGE-4-P4-03-GRANT-REVOCATION-SCHEMA-PROPOSAL.md`.
No generic workflow or mutable status column is approved.

`SCHEMA CHANGE REQUIRED FOR REVOKE: YES`

## 3. Consume Provider/Reconciliation Contract

### 3.1 Approved boundary

`consume_loyalty_redemption_grant` is a **local-only value operation**. Its
canonical executor may atomically create the execution-bound redemption and
ledger result and update the resulting canonical loyalty balance. It does not
own a YClients record/price/comment mutation.

This boundary matches the current source: `mark_record_loyalty_redemption`
is physically disabled and returns a known, non-dispatched
`loyalty_record_adjustment_requires_action_contract` result. P4-03 must not
silently re-enable it.

The exact local identity is:

- authoritative `tenantId`;
- canonical client and loyalty account;
- immutable grant id plus grant-issue execution;
- bound `serviceRef`, points, expiry, and code-HMAC evidence;
- canonical consume `ActionExecution` id and resulting
  `LoyaltyRedemption` id;
- server-resolved requester/membership authority.

Timeout after an ambiguous local commit becomes `UNKNOWN`, not `FAILED`.
Reconciliation reads the exact tenant-qualified redemption, bound ledger
rows, execution, and resulting account balance. Exact matching facts prove
success; their absence after a proven rollback proves not executed;
contradiction remains failed/unknown for manual resolution. Blind re-debit is
forbidden.

### 3.2 Explicit provider limitation

If a future contract adds a YClients write, the minimum dispatch identity is:

`tenant + yclients integration/company + exact provider record id + canonical appointment + service/reward identity + grant + redemption execution + deterministic operation hash`.

| Reconciliation component | Required future identity                                             | Current availability                                           |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| Tenant                   | canonical `tenantId`                                                 | available                                                      |
| Client/provider subject  | canonical client plus exact YClients client/card id                  | provider identity can be read, but is not an operation receipt |
| Visit/record             | canonical appointment plus exact YClients record id                  | not bound by the accepted consume contract                     |
| Service/reward           | immutable `serviceRef` plus provider service id/version              | local service binding available; provider target is not bound  |
| Grant/redemption         | exact grant, issue execution, consume execution, and redemption      | available locally                                              |
| Provider operation       | deterministic request hash plus provider operation/message/reference | unavailable from the current API                               |

The current legacy API exposes neither an idempotency/operation reference nor
a provider receipt that can prove whether a timed-out write was applied.
Therefore external exactly-once and automatic provider reconciliation are
**not available**. Such a write requires its own accepted Contract Gate and
must remain disabled until the provider boundary can distinguish applied from
not applied. It cannot be modeled as a retryable part of consume.

For the accepted local-only P4-03 boundary, provider dispatch is impossible by
construction, so provider-applied versus provider-not-applied is unambiguous:
no provider operation was dispatched.

`CONSUME PROVIDER WRITE: FORBIDDEN`

`CONSUME RECONCILIATION IDENTITY SUFFICIENT: YES`

## 4. Bulk Caps, Approval, And Blast Radius

The following are three separate versioned policies, not one universal cap.
All points and deltas are derived server-side. A hard-cap violation fails
closed and is not truncated, split to evade the cap, or overridden by a caller.

| Policy                       | Recipients per run |  Per-client hard cap |                                 Aggregate tenant cap | Manual approval threshold                                                           | L2.5 / L3                                                                                       |
| ---------------------------- | -----------------: | -------------------: | ---------------------------------------------------: | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `legacy-loyalty-expiry.v1`   |                 25 | 5,000 expired points |                 25,000 points per UTC evaluation day | mandatory for every non-zero run                                                    | L2.5 may plan; L3 may execute only after bound owner approval                                   |
| `legacy-loyalty-backfill.v1` |                 25 |  1,000 issued points | 10,000 points per tenant/UTC day and program version | mandatory when recipients > 1 or aggregate > 1,000                                  | L2.5 may plan; one exact client up to 1,000 may run at L3; larger runs require approval         |
| `legacy-loyalty-import.v1`   |                 10 | 5,000 absolute delta |      20,000 absolute-delta points per tenant/UTC day | mandatory when recipients > 1, absolute aggregate > 1,000, or any delta is negative | L2.5 may plan; one non-negative delta up to 1,000 may run at L3; otherwise approval is required |

The equal `25` recipient limit for expiry and backfill is only a shared
bounded fan-out size. Their value limits and authority are independently
derived: expiry is destructive and always approved; backfill preserves the
legacy 1,000-point welcome ceiling. Import uses a smaller audience and bounds
absolute alignment impact rather than positive grants.

Within the hard caps, manual approval must be issued by server-resolved
`tenant_owner` or `business_owner` authority and is valid for at most 15
minutes. `administrator`, `tenant_admin`, scheduler, integration, AI, and
bearer evidence cannot approve a bulk value run. Cap consumption is evaluated
per tenant from committed, execution-bound results; multiple scheduler ticks
cannot reset or bypass the UTC-window aggregate.

Additional policy evidence is required:

- expiry: exact tenant, policy effective date, 360-day inactivity evidence,
  UTC evaluation day, and full current balance; above-cap accounts are
  quarantined rather than partially expired;
- backfill: exact tenant, program version, authoritative provider LTV
  snapshot, and proof that neither backfill nor provider import was already
  applied; it remains one-time per client/program version;
- import: exact tenant, provider/company/card identity, canonical client,
  source snapshot observed no more than 5 minutes before planning, canonical
  balance, intended target balance, and absolute delta; it aligns state once
  and a replay does not apply the delta again.

### 4.1 Batch and child identity

Each run has a non-value batch-envelope `ActionExecution`. Its deterministic
identity hashes:

`tenant + bulk action class + policy version + evaluation/snapshot window + ordered exact child target/mutation hashes`.

The encrypted normalized input contains the bounded ordered child plan. The
durable policy attestation contains recipient count, positive/negative/absolute
aggregate impact, cap window, and the same audience hash. Manual approval, if
required, binds to this exact envelope and expires after 15 minutes; changing
the audience, target, delta, window, or policy creates a different binding.

The envelope performs no value mutation. It fans out bounded, independently
claimed per-client `ActionExecution` rows. Every child includes the batch
execution id and audience hash as server-derived evidence, while its logical
idempotency remains independent of the batch:

- expiry: tenant + client + expiry policy version + UTC evaluation day;
- backfill: tenant + client + program version;
- import: tenant + client + provider/card identity + import contract version.

Thus moving a child to another batch cannot reapply the logical mutation. A
child is authorized only if the same-tenant envelope is approved/allowed,
unexpired, contains that exact child hash, and still has cap capacity. Each
child has its own DB claim, transaction, outcome, retry/reconciliation state,
and restart path. One scheduler tick is never one transaction across clients
or tenants.

The batch envelope, child normalized inputs, `ActionExecution`, execution-bound
ledger rows, and existing policy/approval attestation are sufficient durable
representation for these caps. A new batch table is not required.

`BULK POLICY CONTRACT COMPLETE: YES`

## 5. Schema Decision And Stop Condition

Only revocation needs new durable schema. Consume becomes explicitly local-only,
and the bulk policy/envelope fits existing `ActionExecution`, policy attestation,
approval binding, ledger binding, and idempotency structures.

The executable proof must not resume until the separate revocation proposal is
accepted, implemented as an additive migration, structurally verified, and
applied through its own approved migration/deployment sequence. This Gate did
not author or apply that migration.

## 6. Verdict

`REVOKE DURABILITY SCHEMA CHANGE REQUIRED: YES`

`CONSUME RECONCILIATION IDENTITY SUFFICIENT: YES`

`BULK POLICY CONTRACT COMPLETE: YES`

`ADDITIONAL MIGRATION REQUIRED: YES`

`P4-03 EXECUTABLE PROOF CAN RESUME: NO`

`P4-03 SHADOW ACTION CLASSES PRESERVED: 8/8`

`REAL PRODUCTION LOYALTY MUTATIONS: 0`

`PRODUCTION PROVIDER WRITES: 0`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

STOP. The next admissible step is review/acceptance of the separate minimal
grant-revocation Schema Proposal. Runtime implementation and executable proof
remain blocked.
