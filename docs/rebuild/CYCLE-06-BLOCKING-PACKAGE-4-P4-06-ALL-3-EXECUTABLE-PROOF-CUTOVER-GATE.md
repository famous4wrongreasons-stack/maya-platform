# CYCLE 06 BLOCKING PACKAGE 4 — P4-06 ALL-3 EXECUTABLE PROOF / CUTOVER GATE

Status: **PASS — executable PostgreSQL proof complete; production cutover not performed**

Source checkpoint: `9e906da2`

Gate date: 2026-09-02

## 1. Scope

This Gate proves the accepted three-action P4-06 chain as one executable
family:

```text
initiate_gift_certificate_purchase
  -> authoritative provider payment outcome
  -> activate_gift_certificate
  -> crash-safe bearer presentation/re-presentation
  -> redeem_gift_certificate
  -> one full immutable redemption claim
```

The proof used a disposable PostgreSQL database and an in-memory fake payment
provider. It did not call production, YooKassa, YClients, Telegram, PWA, or any
customer communication surface. Production legacy owners remain enabled until
the separately authorized cutover.

No new schema or contract gap was found. The already-applied nullable,
immutable `GiftCertificate.presentationKeyVersion` foundation is sufficient.

## 2. Canonical executable ownership

Exactly three executable capabilities are registered with `ALLOW` policy and
strictly reuse the accepted Shadow normalizers:

| Action | Canonical executor | External write |
| --- | --- | --- |
| `initiate_gift_certificate_purchase` | `gift-certificates.checkout` | Provider checkout only |
| `activate_gift_certificate` | `gift-certificates.activation` | None; provider status is read-only evidence |
| `redeem_gift_certificate` | `gift-certificates.redemption` | None; local PostgreSQL claim |

The executable service is intentionally not wired into the production module
in this Gate. The completed `3/3` Shadow controllers remain non-executable.

## 3. Provider outcome and reconciliation proof

The checkout proof established all four outcome boundaries:

- an acknowledged provider `pending` checkout finishes as a known successful
  checkout intent and creates no certificate;
- a response loss after provider apply creates an `UNKNOWN` execution attempt;
- reconciliation uses the same persisted provider request identity and same
  idempotence key to recover the provider object;
- an inconclusive reconciliation remains `UNKNOWN`/manual-required and a
  repeated runtime call does not issue a new provider dispatch.

The provider request is bound to tenant, checkout execution, canonical Client,
checkout identity, offer snapshot, recipient snapshot, amount, and currency.
A changed payment, metadata set, amount, currency, or Client fails closed.

`PENDING != UNKNOWN: ENFORCED`

`BLIND RETRY AFTER UNKNOWN: NO`

`PROVIDER RECONCILIATION PROVEN: YES`

## 4. One successful payment to one certificate

Activation independently reads the provider payment referenced by the
checkout attempt and accepts only authoritative `succeeded + paid` evidence.
It rejects pending, unknown, canceled, mismatched, or missing evidence before
any certificate mutation.

The paid certificate, provider-payment hash, frozen nominal/currency, offer and
recipient snapshots, issue execution binding, code lookup HMAC, and
`presentationKeyVersion` are created inside one serializable PostgreSQL
transaction. Unique issuance, provider-payment, and issue-execution bindings
converge duplicate webhook/restart attempts on one certificate.

A synthetic crash after the certificate transaction committed but before the
Action Engine acknowledged success was reconciled from the exact
execution-bound certificate. The replay produced no second certificate.

`ONE SUCCESSFUL PAYMENT -> ONE CERTIFICATE: PROVEN`

`DUPLICATE CERTIFICATE POSSIBLE: NO`

## 5. Crash-safe bearer presentation

The versioned presentation contract derives the bearer using a server-side PRF
over immutable issuance facts:

- tenant;
- certificate identity;
- issuance identity;
- activation execution;
- frozen nominal and currency;
- expiry;
- presentation key version.

Only the lookup HMAC (`codeHash`) and non-secret key version are durable. After
simulated restart and rotation to a new current key, the retained old key
re-presented the exact original bearer and matched the stored lookup. No new
certificate, payment, or durable claim was created.

The proof scanned certificate, redemption, ActionExecution safe-result, and
ActionAttempt safe-result state and found neither the bearer nor either secret
key. The trusted presentation boundary performs zero writes.

`CRASH-SAFE BEARER PRESENTATION PROVEN: YES`

`RAW BEARER/CODE/KEY PERSISTED: NO`

## 6. Full one-time redemption and concurrency

Before mutation, the executor proves:

- tenant-qualified certificate and stored bearer lookup binding;
- paid, unexpired, non-canceled certificate state;
- immutable nominal/currency and issuance facts;
- exact canonical target Client and active CRM link;
- exact appointment, provider record, visit, service set, amount, and currency;
- active canonical actor and server-derived authority;
- absence of an unresolved identity hold.

Redemption locks the certificate and inserts one execution-bound
`GiftCertificateRedemption` inside one serializable PostgreSQL transaction.
Two different, fully valid exact-target claims raced for the same certificate;
one won and one failed closed. The unique certificate claim remained one, and
replay of the winner returned the same durable fact.

The strict input contract rejects partial mode before mutation. The parent
certificate nominal is immutable and there is no remaining-value counter,
loyalty conversion, provider write, or second redemption path.

`FULL ONE-TIME REDEMPTION PROVEN: YES`

`PARTIAL REDEMPTION POSSIBLE: NO`

`DUPLICATE VALUE CONSUMPTION POSSIBLE: NO`

## 7. Tenant, unresolved identity, and cross-family safety

Cross-tenant certificate/Client requests failed closed. A live
P02/P03-shaped `UnresolvedClientIdentityHold` blocked purchase before provider
dispatch and blocked target use without changing the hold. No fake User,
Membership, Client, or recipient identity was created.

The disposable database retained zero `LoyaltyTransaction` rows. P4-03
client-owned loyalty and P4-04/P4-05 value families were not mutated. A08
payment write remains disabled.

## 8. Legacy bypass ratchet readiness

The pre-cutover ratchet locks one production bypass group and the three exact
legacy direct-mutation subgroups:

1. pending certificate/provider-reference creation;
2. provider-payment success activation/cancel correlation;
3. full certificate redemption.

It classifies the new executable service as an isolated proof owner, verifies
that production module wiring is still absent, models the future zero-bypass
state only when every real legacy owner is removed, and still detects a
synthetic direct redemption writer. Production legacy owners were not changed
or disabled in this Gate.

`LEGACY BYPASS RATCHET READY: YES`

## 9. Verification

| Check | Result |
| --- | --- |
| Disposable PostgreSQL clean replay | PASS — `65/65` migrations |
| ALL-3 executable chain | PASS |
| Valid competing redemption concurrency | PASS — one winner |
| P4-06 targeted Jest | PASS — `15/15` suites, `139/139` tests |
| Python Shadow bridge regressions | PASS — `9/9` tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| Scripts TypeScript typecheck | PASS |
| Full suite/build/deploy | NOT RUN — outside this Gate |
| Real production payment/certificate/value mutations | `0` |
| Real provider writes | `0` |

The one disposable proof database was removed and its absence verified before
the report was finalized.

## 10. Verdict

`P4-06 ALL-3 EXECUTABLE PROOF: PASS`

`ACTION CLASSES PROVEN: 3/3`

`PURCHASE→ACTIVATION CHAIN PROVEN: YES`

`CRASH-SAFE BEARER PRESENTATION PROVEN: YES`

`RAW BEARER/CODE/KEY PERSISTED: NO`

`FULL ONE-TIME REDEMPTION PROVEN: YES`

`PARTIAL REDEMPTION POSSIBLE: NO`

`DUPLICATE CERTIFICATE/VALUE POSSIBLE: NO`

`PENDING != UNKNOWN: ENFORCED`

`BLIND RETRY AFTER UNKNOWN: NO`

`PROVIDER RECONCILIATION PROVEN: YES`

`TENANT ISOLATION: ENFORCED`

`P02/P03 HOLD FAIL-CLOSED: YES`

`LEGACY BYPASS RATCHET READY: YES`

`REAL PRODUCTION PAYMENT/CERTIFICATE/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`PRODUCTION CUTOVER: NO`

`READY FOR P4-06 PRODUCTION CUTOVER: YES`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

## 11. Permanent process hygiene

All verification commands were foreground and self-terminating. The existing
local PostgreSQL server was not started or owned by this task. No browser,
Chrome, Playwright, watcher, test server, proxy, or background worker was
started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`
