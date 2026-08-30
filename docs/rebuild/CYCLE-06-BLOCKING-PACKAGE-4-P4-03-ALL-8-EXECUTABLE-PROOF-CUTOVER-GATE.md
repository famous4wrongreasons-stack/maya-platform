# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 ALL-8 EXECUTABLE PROOF / CUTOVER GATE

Status: **FAIL — contract/schema precondition gap; production cutover forbidden**
Source checkpoint: `ac439568`
Report date: 2026-08-30

## 1. Scope And Preserved Checkpoint

All eight accepted P4-03 Shadow slices remain complete and unchanged:

1. `earn_legacy_loyalty`;
2. `expire_legacy_loyalty`;
3. `redeem_legacy_loyalty`;
4. `refund_legacy_loyalty`;
5. `import_legacy_loyalty_balance`;
6. `backfill_legacy_loyalty`;
7. `issue_loyalty_redemption_grant`;
8. `consume_loyalty_redemption_grant`.

This Gate did not connect an executable capability, alter a Shadow slice,
disable a legacy owner, deploy code, or perform a loyalty/provider mutation.
P4-02 and A08 were not modified. The next Package 4 family, Package 5, and
Chapter 7 were not started.

## 2. Blocking Findings

The all-eight executable proof cannot honestly receive a PASS under the
requested adversarial contract. Static preflight found three decisions that
the accepted Shadow contract and current durable representation do not encode.
Running a PostgreSQL mutation proof after these findings would test an invented
contract rather than the accepted P4-03 contract.

### G1 — revoked grant has no durable fail-closed representation

The requested redemption security matrix includes an explicitly revoked
grant. `LoyaltyRedemptionGrant` stores issue binding, tenant/client, code hash,
service, points, issue time, expiry, and the optional one-time claim, but it has
no `revokedAt`, revocation state, or revocation-execution binding.

The approved immutable guard also prevents changing `expiresAt`, so expiry
cannot be silently repurposed as revocation. `ActionExecution`/`ActionAttempt`
alone cannot answer which grant was revoked without an accepted revocation
action/fact binding. An audit string is not a tenant-qualified DB claim and is
not sufficient authority for an executable fail-closed decision.

Consequences:

- `expired` and `consumed` can be represented and rejected;
- `revoked` cannot be durably distinguished from an active grant;
- the required `expired/revoked/consumed grant -> reject` matrix cannot pass;
- no schema was changed because a new Schema Gate is required first.

### G2 — consume provider write lacks an exact provider-operation target

The accepted consume pre-checkpoint says a future YClients marker attempt
requires an exact server-resolved record target before dispatch. The current
consume normalized contract contains no provider record identity or equivalent
provider-operation identity and fixes `providerProjectionDecision` to
`not_evaluated_in_shadow`.

Therefore an executable consume cannot both preserve the optional legacy
provider marker and prove:

- deterministic transport identity;
- timeout-after-dispatch -> `UNKNOWN`;
- exact provider reconciliation;
- no blind redispatch.

The amended contract must choose one boundary explicitly: either the provider
marker is inside consume and receives an exact operation/record identity, or it
is removed from consume ownership and represented by another already-approved
canonical action. This is a Contract Gate decision; it is not safe to infer in
the executor.

### G3 — final bulk approval/cap profiles are not accepted

The Runtime Contract Gate requires server-derived caps and approval/blast-radius
boundaries. It also says expiry remains Shadow-only until a versioned approval
rule is accepted. The eight Shadow capability registrations intentionally have
`approvalRequirement = NONE` because they are physically non-executable, and
there is no accepted executable profile fixing:

- earn aggregate run cap/fan-out limit;
- expiry approver policy and exact per-run boundary;
- import aggregate run cap and approval boundary;
- backfill batch approval binding and fan-out limit.

Choosing those values or approvers inside a proof harness would be a new policy
decision, not proof of the accepted contract.

## 3. What Existing Foundations Still Prove

The blocking findings do not invalidate the completed Shadow work or schema
foundation:

- tenant-qualified `LoyaltyTransaction` execution binding remains available;
- ledger binding and `LoyaltyAccount.balance` can share one PostgreSQL
  transaction, following the already proven P4-02 pattern;
- `(tenantId, idempotencyKey)` is the ledger domain claim;
- grant issue execution -> grant remains 1:1;
- grant -> redemption remains 0..1;
- consume execution -> redemption remains 1:1;
- raw bearer storage is forbidden and only `codeHash` is durable;
- DB uniqueness rejects a second claim for the same grant;
- all eight current capabilities remain `SHADOW_ONLY`, `L2_5_SHADOW`, and
  `executorKey = shadow.none`.

These facts are necessary but not sufficient for the requested all-eight
executable cutover verdict.

## 4. Verification Performed

Verification was intentionally stopped before an executable PostgreSQL value
proof because the preconditions above are red.

| Check                                               | Result                                      |
| --------------------------------------------------- | ------------------------------------------- |
| Eight completed Shadow capability registrations     | PASS — all remain physically non-executable |
| Durable grant revocation fact                       | FAIL — absent                               |
| Immutable expiry repurposed as revocation           | FORBIDDEN by existing DB trigger            |
| Exact consume provider-operation target             | FAIL — absent from normalized contract      |
| Final executable bulk approval/cap profile          | FAIL — not accepted                         |
| Targeted gap ratchet                                | PASS — 1 suite / 3 tests                    |
| Targeted lint                                       | PASS                                        |
| TypeScript build typecheck for changed test surface | PASS                                        |
| Executable PostgreSQL value proof                   | NOT RUN — blocked before mutation           |
| Production writes/deploy/cutover                    | 0 / NO / NO                                 |

The targeted ratchet is
`src/action-engine/p4-03-all8-executable-gate-gap.spec.ts`. It prevents a later
Gate from accidentally claiming revocation or consume-provider coverage from
the current schema/contract.

## 5. Minimum Safe Next Decision

Do not implement or cut over P4-03. Prepare one amended P4-03 Contract/Schema
Gate that decides only:

1. the durable grant-revocation fact and its tenant-qualified execution
   binding;
2. whether consume owns a provider marker, and if yes its exact provider
   operation identity/reconciliation contract;
3. exact server-owned caps, fan-out limits, and approver policies for the four
   bulk paths.

No field, migration, approval rule, or provider boundary was invented by this
Gate.

## 6. Verdict

`P4-03 ALL-8 EXECUTABLE PROOF: FAIL`

`ACTION CLASSES PROVEN: 0/8 EXECUTABLE (8/8 SHADOW REMAIN COMPLETE)`

`LEDGER/EXECUTION ATOMICITY: NOT PROVEN FOR ALL-8`

`DUPLICATE VALUE MUTATION POSSIBLE: YES (NOT YET RULED OUT BY ALL-8 PROOF)`

`ONE-TIME REDEMPTION ENFORCED: YES`

`REVOKED GRANT FAIL-CLOSED: NO — DURABLE STATE NOT REPRESENTABLE`

`BULK CAPS/BLAST-RADIUS ENFORCED: NO`

`BLIND RETRY AFTER UNKNOWN: NO`

`LEGACY BYPASS RATCHET READY: NO`

`REAL PRODUCTION LOYALTY MUTATIONS: 0`

`READY FOR P4-03 PRODUCTION CUTOVER: NO`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

STOP. Production legacy executors remain unchanged until an amended Gate is
explicitly accepted.
