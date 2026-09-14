# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 ALL-8 EXECUTABLE PROOF / CUTOVER GATE

Status: **PASS — executable proof complete; production cutover not performed**
Resume checkpoint: `bb967298`
Report date: 2026-08-30

## 1. Scope And Preserved Checkpoints

This Gate resumes the proof stopped at `9b7bd4eb`; it does not redesign the
accepted contracts. The three former blockers were closed before this run:

- append-only `LoyaltyRedemptionGrantRevocation` is present in production;
- grant consume is explicitly local-only and cannot write to YClients;
- expiry, backfill, and import have distinct accepted cap/approval profiles.

The eight previously completed Shadow slices remain unchanged. The executable
implementation prepared by this Gate is deliberately absent from
`LoyaltyModule` and all production controllers. Legacy owners remain active
until a separately approved production cutover.

The proved family is exactly:

1. `earn_legacy_loyalty`;
2. `expire_legacy_loyalty`;
3. `redeem_legacy_loyalty`;
4. `refund_legacy_loyalty`;
5. `import_legacy_loyalty_balance`;
6. `backfill_legacy_loyalty`;
7. `issue_loyalty_redemption_grant`;
8. `consume_loyalty_redemption_grant`.

P4-02 and A08 were not changed. The next Package 4 family, Package 5, and
Chapter 7 were not started.

## 2. Canonical Executable Contract

Each action uses the existing production kernel:

`trusted initiator -> Canonical Action Ingress -> server-derived policy and`
`entitlement -> Action Engine -> P4-03 canonical executor`.

The proof registers eight separate executable capabilities rather than one
generic loyalty mutation. Caller-provided authority is not trusted. The
registry fixes the action class, executor, risk, autonomy, approval rule, and
retry/reconciliation policy; the canonical resolver supplies the policy
attestation and any approval binding.

The implementation remains production-unreachable. A standalone factory is
used only by the disposable PostgreSQL proof so the real kernel, ingress,
resolver, claim, attempt, and reconciliation code is exercised without a
runtime cutover.

## 3. Durable Execution And Atomicity

The executable proof uses one serializable PostgreSQL transaction for the
local value boundary. It locks the tenant-qualified loyalty account and
atomically writes:

- the resulting `LoyaltyAccount.balance`;
- the execution-bound `LoyaltyTransaction`, grant, redemption, or claim fact;
- the exact logical-operation identity owned by the `ActionExecution`.

The proof established:

- a crash before commit leaves no ledger/value result;
- an ambiguous failure after commit is reconciled from the exact
  execution-bound result and is not dispatched again;
- same logical input converges to the same execution and domain claim;
- concurrent attempts produce one value mutation;
- restart preserves the logical identity;
- import aligns to the observed canonical balance and is not a repeatable
  delta;
- backfill and expiry are repeatable without a second credit/debit;
- refund is bound to the exact original redemption debit;
- every created ledger row has the correct tenant and execution binding.

Local PostgreSQL ambiguity follows `UNKNOWN != FAILED`. Redispatch is allowed
only after reconciliation proves `PROVEN_NOT_EXECUTED`; an unknown or
contradictory outcome cannot trigger a blind retry.

## 4. Grant And Redemption Security

Grant issue is one logical execution to one immutable grant. Only a
server-generated HMAC-SHA-256 code hash is persisted; raw bearer material is
absent from the action input, evidence, and database.

Grant consume is local-only and one-time. The executable PostgreSQL matrix
proved valid consume, replay, concurrent consume, wrong tenant, stale or forged
authority, expired grant, and append-only revoked grant. Grant, redemption,
ledger debit, and resulting balance commit together. Revoked and expired are
distinct terminal reasons.

`consume` has no YClients dispatch capability. The existing legacy
`mark_record_loyalty_redemption` provider method is also a physically
non-writing tombstone with retry disabled. The booking-redeem executable does
not import or call that method. Thus this Gate grants no hidden provider-write
authority; any future provider projection still requires its own accepted
contract and cutover.

## 5. Bulk Caps, Approval, And Fan-Out

The accepted profiles are enforced independently:

| Action   | Max recipients | Max per client | Max aggregate | Approval                                  |
| -------- | -------------: | -------------: | ------------: | ----------------------------------------- |
| expiry   |             25 |   5,000 points | 25,000 points | exact owner-approved envelope, 15 minutes |
| backfill |             25 |   1,000 points | 10,000 points | exact owner-approved envelope, 15 minutes |
| import   |             10 |   5,000 points | 20,000 points | exact owner-approved envelope, 15 minutes |

An envelope binds the exact tenant, policy version/window, recipient count,
aggregate impact, sorted child mutation hashes, and audience hash. Each child
is a separate per-client execution with its own DB claim and transaction.
Cross-tenant batch reuse, audience substitution, missing/expired approval,
per-client overflow, aggregate overflow, and recipient overflow fail closed.
One scheduler tick is never one cross-client value transaction.

## 6. Executable PostgreSQL Evidence

A disposable database named only for this proof was created, all **61** project
migrations were replayed in order, and the real canonical execution stack ran
against synthetic tenant/client data. The database was dropped after the run;
no proof database remains.

| Proof matrix                                                   | Result       |
| -------------------------------------------------------------- | ------------ |
| All eight action classes reached a canonical executable result | PASS — `8/8` |
| Ledger/execution/balance atomicity and rollback                | PASS         |
| Same-action replay and concurrent duplicate protection         | PASS         |
| Post-commit ambiguity reconciliation and no blind retry        | PASS         |
| Earn/refund duplicate-value protection                         | PASS         |
| Expiry/backfill repeatability                                  | PASS         |
| Import target-state semantics                                  | PASS         |
| Independent bounded batch children                             | PASS         |
| One grant per logical issue; hash-only storage                 | PASS         |
| One-time, concurrent, expired, and revoked consume             | PASS         |
| Tenant isolation and forged caller authority                   | PASS         |
| L2.5 external execution denial                                 | PASS         |
| Bulk cap and approval fail-closed behavior                     | PASS         |
| Real production loyalty mutations                              | `0`          |
| External provider writes                                       | `0`          |

Targeted code verification also passed:

- executable/kernel/ingress/approval/revocation/ratchet surface: **7 suites,
  53 tests**;
- preservation of all eight Shadow contracts and services: **22 suites,
  113 tests**;
- backend build typecheck and scripts typecheck;
- targeted ESLint and formatting checks.

No production database, tenant balance, ledger, grant, redemption, or provider
state was used by the proof.

## 7. Legacy Bypass Ratchet And Cutover Boundary

The ratchet inventories the exact eight accepted direct-mutation subgroups.
While `CUTOVER_ENABLED = false`, it requires all eight legacy groups to remain
visible and proves the executable service has no production module/controller
reachability. At the separately authorized cutover the ratchet must flip and
will fail unless every legacy direct-mutation group is removed from production
reachability.

This Gate did not disable a legacy owner, connect a production initiator,
deploy code, or perform production smoke mutations. It proves that a cutover
can be performed without using a real loyalty balance as evidence.

## 8. Verdict

`P4-03 ALL-8 EXECUTABLE PROOF: PASS`

`ACTION CLASSES PROVEN: 8/8`

`LEDGER/EXECUTION ATOMICITY: PROVEN`

`DUPLICATE VALUE MUTATION POSSIBLE: NO`

`ONE-TIME REDEMPTION ENFORCED: YES`

`REVOKED GRANT FAIL-CLOSED: YES`

`BULK CAPS/BLAST-RADIUS ENFORCED: YES`

`BLIND RETRY AFTER UNKNOWN: NO`

`LEGACY BYPASS RATCHET READY: YES`

`REAL PRODUCTION LOYALTY MUTATIONS: 0`

`PROVIDER WRITES: 0`

`PRODUCTION CUTOVER: NO`

`READY FOR P4-03 PRODUCTION CUTOVER: YES`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

STOP. Production cutover requires a separate explicit checkpoint.
