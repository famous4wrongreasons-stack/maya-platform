# CYCLE 06 BLOCKING PACKAGE 4 — REMAINDER REVIEW

Status: read-only post-P4-04 remainder decision; next family not started

Accepted P4-04 checkpoint: `7fbef26e`

Reviewed HEAD: `7fbef26e`

Review date: 2026-09-01

## 1. Boundary

This review continues the accepted Package 4 sequence after the production
closure of `P4-04 / A20-R`. It recomputes only the Package 4 family remainder
from the current repository state and the accepted Package 4 Gate. It does not
reopen P4-01 through P4-04 or start P4-05 implementation.

No application code, Prisma schema, migration, database, production data,
provider state, payment, customer value, deployment, Package 5, or Chapter 7
was changed by this review. The accepted P4-04 production report remains the
source of truth for the active release and its production verification; this
documentation-only step did not repeat that deployment or create a value
mutation for proof.

The authoritative scope remains
`CYCLE-06-BLOCKING-PACKAGE-4-MONETARY-VALUE-CONVERGENCE-SCHEMA-GATE.md`.
One broad family is counted as one bypass group until its own Runtime Contract
Gate decomposes it into exact action classes. This review therefore does not
infer that adjacent operations share a contract merely because they live in
the same Python or Nest service.

## 2. Accepted Completion Baseline

| Gate family | Accepted state | Production execution owner | Direct bypass group | Review decision |
|---|---|---|---:|---|
| P4-01 / A08 appointment payment/close | Physically disabled | None; `crm.visit.payment.v1` remains `DENY` | 0 | Preserve the tombstone and ratchet; do not reopen |
| P4-02 / A19 internal loyalty adjustment | Production-complete | Action Engine | 0 | Closed; immutable baseline |
| P4-03 / A20-L legacy loyalty value/redemption | Production-complete | Action Engine | 0 | Closed; canonical client-owned loyalty remains authoritative |
| P4-04 / A20-R referral/reward | Production-complete | Action Engine | 0 | Closed; frozen discount entitlement and one-time fulfillment remain authoritative |

Accepted continuity facts from the P4-04 completion report remain:

- P4-04 action classes cut over: `4/4`;
- P4-04 production direct-mutation subgroups: `0`;
- P4-03 canonical ledger/account value preserved;
- P02/P03 live identity hold preserved;
- implicit referral reward to loyalty-points conversion: `NO`;
- real production value mutations for P4-04 cutover proof: `0`.

Nothing in this review weakens those contracts or treats their canonical
executors as reusable authority for a different value family.

## 3. Exact Package 4 Remainder

| Gate family | Exact remaining family | Current production owner | Canonical schema ready | Runtime cut over | Direct bypass group |
|---|---|---|---:|---:|---:|
| P4-05 / A20-S | Customer subscription purchase/activation, usage, terminal lifecycle, and renewal | Python bot/webhook/job, legacy database, and YooKassa client | Yes | No | 1 |
| P4-06 / A20-C | Gift certificate issue/payment/reconciliation/cancel/redemption | Python bot/webhook/poller, legacy database, and YooKassa client | Yes | No | 1 |
| P4-07 / A21 | Expense create/delete and period completeness declaration/invalidation | Legacy AI Tool Runtime, HTTP, and Nest `ExpensesService` | Yes | No | 1 |
| P4-08 / A24 | Tenant billing checkout, recurring charge, webhook/reconciliation, and access-state outcome | HTTP/admin/scheduler and Nest billing/YooKassa services | Yes | No | 1 |
| P4-09 / A27-V | Value-bearing certificate/membership offer and referral reward-policy mutation | HTTP and Nest `BusinessContentService` | Yes; no separate revision table required | No | 1 |
| P4-10 / A32 | Commerce payment-credential connect/recheck/replace/disconnect | HTTP and Nest `CommerceIntegrationService` | Yes; no credential-history table required | No | 1 |

Package 4 family counts at the reviewed HEAD:

- scope groups: `10`;
- production-complete groups: `3` (`P4-02` through `P4-04`);
- physically disabled/non-reachable groups: `1` (`P4-01`);
- remaining production-reachable bypass groups: `6` (`P4-05` through
  `P4-10`).

Package 4 cannot close and its final adversarial verification cannot start
while any of those six groups retains a production execution owner outside
Action Engine.

## 4. Next Family Decision

The next and only family selected by the accepted Gate order is:

> **P4-05 / A20-S — Customer Subscription Value Convergence**

No dependency requires reordering it behind P4-06 through P4-10:

- canonical `Client` identity and the P02/P03 fail-closed hold already exist;
- the Package 3 policy/approval/ingress kernel is production-complete;
- `CustomerSubscription` and `CustomerSubscriptionUsage` are already present
  in the applied canonical schema;
- activation, renewal, terminal lifecycle, and usage have tenant-qualified
  ActionExecution bindings and DB-level uniqueness/capacity guards;
- provider dispatch uncertainty belongs to the existing
  `ActionExecution`/`ActionAttempt` kernel, not a new payment workflow.

P4-09 and P4-10 remain later families. P4-05 may read the current canonical
offer and credential authority and freeze server-derived snapshots/fingerprints
into its execution evidence. It must not make caller-supplied plan, price,
provider, credential, cap, or payment status authoritative.

## 5. P4-05 Current Execution Evidence

There is no customer-subscription action class in the Action Engine registry
and no runtime writer of the canonical `CustomerSubscription` or
`CustomerSubscriptionUsage` models.

The production-reachable legacy flow still performs four normalized mutation
subgroups directly:

1. **Purchase dispatch and payment correlation**
   - Telegram `_start_subscription_purchase` and PWA `sub_create_handler`
     insert a legacy pending subscription;
   - both call YooKassa directly and attach the returned payment id;
   - provider-create exceptions are converted into a local `refunded` status
     even though a dispatched-but-ambiguous outcome is not durably represented
     as canonical `UNKNOWN`.
2. **Activation and renewal value grant**
   - `_poll_subscription_payment` polls the provider directly;
   - `_activate_paid_subscription` directly marks the legacy row active;
   - renewal reuses the purchase flow and does not yet create a canonical new
     term linked to its predecessor.
3. **Usage synchronization/consumption**
   - `sync_subscription_usage` reads YClients bookings and overwrites the
     legacy `visits_used` counter;
   - no immutable canonical per-visit usage claim is written through an
     ActionExecution.
4. **Terminal lifecycle mutation**
   - the subscription job directly marks active rows expired;
   - payment cancellation/error paths directly change legacy status.

The duplicated legacy database implementations in `database.py` and the
PostgreSQL blueprint remain storage executors, not canonical initiators. A
scheduler, bot, webhook, provider poller, or reconciliation handler may remain
an initiator/evidence source only after it submits or resumes the exact
canonical execution and has no direct fallback.

The renewal Telegram/PWA notification is an adjacent communication side
effect, not customer-subscription value. P4-05 must preserve the completed
communication package: it may request an already canonical delivery after the
value transition, but it must not create a new direct-send exception or couple
message success to financial/value success.

`P4-05 GATE-LEVEL PRODUCTION BYPASS GROUPS: 1`

`P4-05 CONCRETE DIRECT-MUTATION SUBGROUPS: 4`

The exact canonical action-class count is intentionally not invented by this
review. Purchase/activation/renewal may share one long-lived provider-aware
execution only if the Runtime Contract Gate proves that its identity,
reconciliation, and result transition are one business action. Otherwise they
must be distinct registered capabilities.

## 6. Required P4-05 Runtime Contract Gate

The next step must be documentation/contract-first. Before Shadow or
executable implementation, the Gate must fix:

1. the exact P4-05 action-class list and one execution owner for each class;
2. canonical tenant, client, current-term, predecessor-term, plan, service
   scope, allowance, price, currency, and term identities;
3. deterministic logical identities for purchase/activation, renewal, usage
   claims, and terminal mutation;
4. the boundary between pre-payment initiation and actual value grant — a
   pending provider checkout must grant no subscription value;
5. the original provider request identity, `UNKNOWN != FAILED`, no blind
   redispatch, and provider reconciliation using the same execution/attempt;
6. authoritative payment-success evidence and atomic creation of exactly one
   canonical activated term;
7. renewal as a new immutable term with the same client and at most one child
   per predecessor, never an in-place term extension;
8. usage as immutable exact visit/source claims, including one execution to
   many claims, duplicate-event rejection, term-window validation, and locked
   allowance capacity;
9. expiry/cancel/revoke as a one-time terminal transition with its own
   execution binding;
10. restart, concurrency, cross-tenant, wrong-client, changed-plan,
    changed-price, forged-payment, unresolved-client/P02-P03 hold, policy,
    approval, and blast-radius behavior;
11. legacy-row correlation/migration behavior without fabricating historical
    ActionExecution ownership;
12. separation of canonical value mutation, provider evidence, and any later
    communication delivery.

The accepted schema foundation is sufficient for the currently known domain
contract. Therefore the starting schema verdict is:

`ADDITIONAL P4-05 SCHEMA REQUIRED: NO`

If the Runtime Contract Gate proves that an indispensable durable fact cannot
be represented honestly, it must stop with one minimal Schema Proposal. It
must not hide that gap in JSON evidence, mutate the migration history, or start
runtime work.

No real checkout, charge, activation, renewal, usage consumption, expiry, or
customer message may be created merely for the Gate or later Shadow proof.

## 7. Remaining Order After P4-05

The accepted order remains:

1. P4-05 customer subscription value convergence;
2. P4-06 gift certificate convergence;
3. P4-07 expense convergence;
4. P4-08 tenant billing/payment convergence;
5. P4-09 value-bearing offer/policy convergence;
6. P4-10 commerce payment-credential convergence;
7. Package 4 final remainder recomputation and adversarial verification.

This ordering is a review result, not authorization to start more than one
family. P4-06 through P4-10 remain untouched until their own separately
accepted step.

## 8. Verdict

`PACKAGE 4 REMAINDER REVIEW COMPLETE: YES`

`PACKAGE 4 SCOPE GROUPS: 10`

`PACKAGE 4 PRODUCTION-COMPLETE GROUPS: 3`

`PACKAGE 4 PHYSICALLY DISABLED GROUPS: 1`

`PACKAGE 4 REMAINING FAMILIES: 6`

`PACKAGE 4 PRODUCTION-REACHABLE BYPASS GROUPS REMAINING: 6`

`NEXT PACKAGE 4 FAMILY: P4-05 / A20-S CUSTOMER SUBSCRIPTION VALUE CONVERGENCE`

`NEXT SINGLE STEP: P4-05 RUNTIME CONTRACT GATE`

`P4-05 CANONICAL SCHEMA READY: YES`

`P4-05 RUNTIME STARTED: NO`

`P4-06 THROUGH P4-10 STARTED: NO`

`PACKAGE 4 FINAL VERIFICATION READY: NO`

`A08 PAYMENT WRITE: DISABLED`

`P4-02/P4-03/P4-04 REOPENED: NO`

`PRODUCTION TOUCHED BY REVIEW: NO`

`PRODUCTION VALUE MUTATIONS BY REVIEW: 0`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The P4-05 Runtime Contract Gate requires a separate step. Shadow,
runtime implementation, migration, build/deploy, and production cutover were
not started by this review.
