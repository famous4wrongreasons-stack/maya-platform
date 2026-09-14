# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CONTRACT-TO-RUNTIME CLOSURE CHECKPOINT

Status: **PASS — both runtime contracts aligned; production cutover not performed**
Source checkpoint: `0355256d`
Report date: 2026-08-30

## 1. Scope And Schema Decision

This checkpoint closes only the two gaps found by the P4-03 production
cutover preflight:

1. `issue_loyalty_redemption_grant -> consume_loyalty_redemption_grant`;
2. `redeem_legacy_loyalty -> refund_legacy_loyalty`.

The existing schema is sufficient. `LoyaltyRedemptionGrant.codeHash`, the
tenant-qualified code lookup, one-time redemption/revocation facts,
execution-bound `LoyaltyTransaction.kind`, and `externalRef` can represent the
accepted contracts without new fields or data rewrites. Historical rows were
not modified or backfilled.

`ADDITIONAL SCHEMA CHANGE REQUIRED: NO`

No production database, balance, ledger, grant, redemption, or provider state
was read or changed. P4-02 and A08 were not changed. The next Package 4 family,
Package 5, and Chapter 7 were not started.

## 2. Issue To Consume Claim Contract

### 2.1 Canonical contracts

`ISSUE OUTPUT CONTRACT`

The newly created grant result returns:

```text
grantId
claimArtifact.contract = maya.loyalty-redemption-claim/1
claimArtifact.bearer = MAYA-LR-<192-bit cryptographically random value>
```

The bearer is returned only in the immediate result of the successful new
issue. It is deliberately absent from the durable Action Engine safe result.
A replay/reconciliation of an already-created grant returns the grant identity
without regenerating or exposing a second bearer.

`STORED LOOKUP CONTRACT`

The database stores only:

```text
HMAC-SHA-256(
  server-owned MAYA_LOYALTY_REDEMPTION_CODE_PEPPER,
  "hmac-sha256-normalized-bearer.v1" + unit-separator + uppercase(trim(bearer))
)
```

The stored hash is resolved through the existing tenant-qualified
`(tenantId, codeHash)` key. Neither the raw bearer, tenant id, grant id, nor
execution id is used as a substitute credential. The executable issue service
and real consume planner now call the same lookup function and name the same
server-owned pepper contract.

`CONSUME INPUT CONTRACT`

The authenticated initiator sends the exact `claimArtifact.bearer` as
`redemption_code`. The server normalizes and HMACs it before lookup. Raw bearer
material is never included in ActionExecution normalized input, evidence,
policy context, or safe result.

The accepted bearer still resolves after a service restart because lookup is
deterministic under the server pepper and stored code hash. Wrong bearer and
wrong tenant fail closed. Expired, append-only revoked, and already-consumed
grants cannot produce an executable consume plan. The existing DB uniqueness
and terminal-fact guards preserve one-time consumption under replay and
concurrency.

Issue-response loss is fail-closed: because raw bearer recovery is intentionally
impossible, an acknowledged grant is never silently assigned a replacement
credential. A future recovery product flow would require an explicit revoke
and separately authorized reissue; it is outside this checkpoint.

## 3. Redeem To Refund Ledger Contract

The canonical mapping is now one vocabulary:

```text
redeem write
  kind        = redeem
  externalRef = SHA-256(tenantId, provider, providerRecordId)
  actionExecutionId = exact redeem execution

durable ledger fact
  tenant + actionExecutionId + kind=redeem + negative delta
  + exact provider-record externalRef

refund lookup
  exact tenant + original redeem execution + kind=redeem
  + exact provider-record externalRef

refund write
  kind        = refund
  externalRef = SHA-256(
    tenantId,
    original redeem execution,
    cancellation fact,
    legacy-cancel-exact-ledger-compensation.v1
  )
```

The Shadow planner and executable runtime share the same provider-record and
refund-correlation functions. The executable refund precondition now requires
the original rows to use `kind=redeem`, the exact original execution, negative
debit value, and the same provider record identity. A different visit/record,
tenant, execution, or changed debit evidence fails closed.

The deterministic correlation gives repeats and restarts the same refund
identity. Existing canonical refund evidence produces `do_not_refund`; a
duplicate cannot restore value twice. No historical `debit` row was renamed or
rewritten. Only canonical P4-03 redeem writes use the aligned mapping.

## 4. Mandatory Regression Matrix

| #  | Required regression                              | Result |
| -- | ------------------------------------------------ | ------ |
| 1  | issue -> returned bearer -> consume succeeds     | PASS   |
| 2  | issued bearer is not stored raw                  | PASS   |
| 3  | wrong bearer fails                               | PASS   |
| 4  | wrong tenant fails                               | PASS   |
| 5  | expired grant fails                              | PASS   |
| 6  | revoked grant fails                              | PASS   |
| 7  | second consume has no executable mutation        | PASS   |
| 8  | restart preserves consume lookup                 | PASS   |
| 9  | redeem -> refund lookup succeeds                 | PASS   |
| 10 | refund with wrong visit/record fails             | PASS   |
| 11 | refund with wrong tenant fails                   | PASS   |
| 12 | duplicate refund cannot restore value twice      | PASS   |
| 13 | restart preserves refund evidence and identity   | PASS   |
| 14 | provider writes in this checkpoint               | PASS — `0` |

Verification was deliberately local and non-mutating:

- four targeted Jest suites, **30 tests**, all passed;
- targeted ESLint for the touched runtime, contracts, tests, and proof harness;
- application typecheck;
- scripts/proof-harness typecheck;
- `git diff --check`.

The earlier all-eight executable PostgreSQL proof was not repeated, and no
full suite or production cutover was run.

## 5. Verdict

`ISSUE-CONSUME CONTRACT ALIGNED: YES`

`REDEEM-REFUND CONTRACT ALIGNED: YES`

`RAW BEARER SECRET PERSISTED: NO`

`ONE-TIME CONSUME PRESERVED: YES`

`REFUND CAN RESOLVE CANONICAL REDEEM: YES`

`ADDITIONAL SCHEMA CHANGE REQUIRED: NO`

`PROVIDER WRITES: 0`

`PRODUCTION LOYALTY MUTATIONS: 0`

`PRODUCTION CUTOVER: NO`

`READY TO RE-RUN P4-03 CUTOVER PREFLIGHT: YES`

STOP. Production cutover remains separately gated.
