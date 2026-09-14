# CYCLE 06 BLOCKING PACKAGE 4 — P4-06 REDEEM_GIFT_CERTIFICATE SHADOW REPORT

Status: **COMPLETE — third and final P4-06 canonical Shadow slice; no
redemption, certificate value, loyalty, payment, provider, or message
mutation and no executable cutover**

Source checkpoint: `c5a2c3a3`

Report date: 2026-09-02

## 1. Exact slice and pre-code contract

This step implements only the approved non-executable Shadow for:

`redeem_gift_certificate`.

Purchase initiation and paid activation remain unchanged. Redemption is a
separate local one-time claim. It consumes the entire immutable certificate
nominal against one exact tenant-qualified business target; partial
redemption is unsupported.

| Contract item | Decision |
|---|---|
| Initiator | cashier or administrator legacy redemption surface; neither supplies tenant, certificate identity, value, eligibility, authority, policy, or approval |
| Current execution owner | unchanged Telegram/PWA `mark_cert_used` legacy paths; the new bridge is disposable and not production-wired |
| Bearer input | raw certificate claim exists only in the transient request-local lookup call |
| Stored lookup | tenant-qualified `giftCertificateClaimLookup.v1` HMAC (`codeHash`) plus immutable non-secret `presentationKeyVersion` |
| Key rotation/restart | current plus retained presentation key ring must contain the certificate's exact stored version; unavailable version fails closed |
| Certificate eligibility | exact canonical certificate, successful non-dry activation execution, `paid` state, paid/issue time, no cancellation, valid expiry, no prior redemption |
| Value semantics | immutable fixed-money nominal and currency from the certificate; no partial balance and no loyalty-points conversion |
| Ownership semantics | tenant transferable bearer liability; purchaser is not the redemption owner and recipient subject hash is not a Client identity |
| Exact target | same-tenant `CrmClientLink -> Client` and exact appointment/provider record/service bundle; unresolved identity hold fails closed |
| Actor | exact active AuthIdentity/Membership; tenant administrator or server cashier allowlist, with branch scope for cashier roles |
| Logical identity | tenant + certificate + exact target hash + target Client + actor identity + redemption contract version |
| Policy/approval | server-derived full-only policy and `NONE_ACTOR_AUTHORIZED`; registry remains non-executable L2.5 |
| Provider/UNKNOWN | local-only planned mutation; provider writes are absent and no `UNKNOWN` is invented |
| Reconciliation | deterministic local commit/rollback contract reserved for the future executable transaction |

The DTO accepts only the transient bearer, exact target provider identities,
requester identity, and literal `full` mode. Certificate id, `codeHash`,
amount, currency, key version, authority, policy, approval, and partial amount
cannot be supplied by the initiator.

## 2. Implementation

The Action Engine registry now contains the isolated capability:

`gift-certificates.redemption.shadow.v1`.

Its boundary is:

- `actionClass = redeem_gift_certificate`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt;
- no external dispatch or executable retry;
- `providerBoundary = LOCAL_ONLY` and `unknownApplicable = false`.

`GiftCertificateRedemptionShadowService` performs only read-only resolution
before `ActionEngineRuntimeService.planShadow`:

1. authenticates and binds the legacy bridge to an exact tenant integration;
2. validates the server key configuration and bounded cashier allowlist;
3. resolves the exact active requester identity and membership;
4. normalizes and HMACs the bearer transiently, then performs a tenant-scoped
   `codeHash` lookup;
5. verifies the certificate's activation execution, paid/issue facts,
   immutable nominal/currency, expiry, cancellation state, key version, and
   absence of an existing redemption;
6. checks the unresolved Client identity hold before target resolution;
7. resolves the exact same-tenant target Client and exact appointment/provider
   record/service evidence;
8. derives actor authority, certificate/claim/target/requester identities,
   policy snapshot, and deterministic full-redemption identity;
9. persists only a non-executable Shadow `ActionExecution` plan.

The retained ActionExecution input and evidence contain only server-derived
identities and hashes. They do not contain the raw bearer or the database
`codeHash`. The HMAC implementation is centralized in
`giftCertificateClaimLookup`; the service contains no local ad-hoc HMAC.

The future executable boundary remains one PostgreSQL transaction that locks
the parent and inserts one unique `GiftCertificateRedemption`. This step does
not run that transaction and does not claim value.

## 3. Mandatory fail-closed and convergence proof

Targeted tests prove:

1. a valid bearer produces one exact full-redemption Shadow plan;
2. the raw bearer and lookup hash are absent from ActionExecution input,
   evidence, audit-facing result, database mutations, and logs;
3. a retained presentation key version remains resolvable after restart/key
   rotation, while an unavailable version fails closed;
4. retry and process restart produce byte-equivalent logical request identity;
5. duplicate and concurrent same-certificate calls converge on that identity;
6. an existing redemption prevents a second plan for value;
7. expired, revoked-like/inactive, canceled, pending, or structurally invalid
   certificate state fails closed;
8. wrong tenant or wrong exact target Client/record/service/currency evidence
   fails closed;
9. P02/P03-style unresolved identity hold and guard lookup failure fail closed;
10. `partial` mode or partial amount is rejected at the DTO/contract boundary;
11. forged value, currency, certificate id/hash, key version, entitlement,
    authority, policy, or approval is rejected;
12. missing, inactive, wrong-role, non-allowlisted, or wrong-branch actor
    authority fails closed;
13. `GiftCertificateRedemption`, certificate value, LoyaltyTransaction,
    payment, provider, and message side effects remain exactly zero.

Architectural tests additionally prove that the Shadow service has no direct
certificate/redemption/loyalty/payment writer, raw SQL, provider create call,
message call, or executable Action Engine call. The disposable Python bridge
does not import or call the legacy database/payment writers, is not imported
by Telegram/PWA production owners, and does not log response bodies or bearer
material.

## 4. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| New redemption claim/contract/service/architecture suites | PASS — 4 suites / 41 tests |
| Combined P4-06 purchase + activation + redemption + registry/module/schema regressions | PASS — 14 suites / 140 tests |
| Python redemption bridge unittest | PASS — 3 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| Scripts TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider client, production endpoint,
temporary database, payment, certificate activation, bearer presentation,
redemption, or value mutation was run.

## 5. Safety boundary

- The production legacy redemption writer remains the factual execution
  owner; this Shadow does not cut it over or alter it.
- The existing purchase and activation Shadow slices were not changed.
- No `GiftCertificateRedemption` was created.
- No certificate state or nominal value was changed.
- No raw bearer/code/key material was persisted or logged.
- No `LoyaltyTransaction` or P4-03 loyalty value was created or changed.
- No payment/provider write or customer message was sent.
- Production Shadow was not deployed because structural proof was sufficient.
- P4-02 through P4-05 remain unchanged immutable completion baselines.
- A08 payment write remains disabled.
- The ALL-3 executable proof, P4-07, Package 5, and Chapter 7 were not started.

## 6. Verdict

`P4-06 SHADOW ACTION CLASS: redeem_gift_certificate`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`REDEMPTIONS CREATED BY NEW PATH: 0`

`CERTIFICATE VALUE MUTATIONS BY NEW PATH: 0`

`RAW BEARER/CODE PERSISTED BY NEW PATH: 0`

`PROVIDER WRITES BY NEW PATH: 0`

`P4-06 ACTION CLASSES SHADOW-MIGRATED: 3/3`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`NEXT P4-06 ACTION STARTED: NO`

## 7. Permanent process hygiene

All commands were foreground and self-terminating. No background process,
watcher, browser, Playwright process, or temporary database was started.

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. The ALL-3 executable proof requires a separate explicit instruction.
