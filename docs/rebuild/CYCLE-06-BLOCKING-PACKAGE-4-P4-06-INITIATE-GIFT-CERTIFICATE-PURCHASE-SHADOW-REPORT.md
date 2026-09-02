# CYCLE 06 BLOCKING PACKAGE 4 — P4-06 INITIATE_GIFT_CERTIFICATE_PURCHASE SHADOW REPORT

Status: first P4-06 canonical Shadow slice complete; no provider dispatch,
certificate issuance, value mutation, or executable cutover

Source checkpoint: `998eb633`

Report date: 2026-09-02

## 1. Exact slice and pre-code contract

This step implements only the approved non-executable Shadow for:

`initiate_gift_certificate_purchase`.

Purchase initiation, payment outcome, certificate activation, bearer
presentation, and redemption remain separate boundaries. The new path creates
only a canonical ActionExecution plan and stops before YooKassa dispatch.

| Contract item | Decision |
|---|---|
| Initiator | enumerated Telegram or PWA legacy-bridge purchase intent; neither is authority for price, certificate value, currency, policy, approval, or execution |
| Current execution owner | unchanged legacy Telegram/PWA handlers in `bot.py` and `webhook_server.py`, their database adapters, and `yukassa_api.create_payment` |
| Tenant | resolved server-side from the bridge-bound provider/company integration |
| Purchaser | one exact, active, unmerged tenant-qualified `CrmClientLink -> Client` resolution |
| Identity hold | the canonical unresolved-identity guard is checked before planning; P02/P03-style active hold fails closed |
| Product/value | one active server-catalog offer: fixed 2,000, 3,000, or 5,000 RUB denomination, never a caller-supplied price |
| Logical identity | tenant + purchaser Client + hashed explicit purchase-intent reference + immutable offer snapshot + nominal/currency + recipient-subject hash + expiry-policy and checkout-contract versions |
| Checkout conflict | exact retry/restart and duplicate initiators converge; a different active checkout identity for the same purchase intent fails closed |
| Intended certificate semantics | transferable bearer certificate, fixed full value, full-only redemption, and 365-day expiry policy; no certificate exists in this slice |
| Payment provider | server-selected `yookassa`; the plan records only the intended provider operation and deterministic request-identity seed |
| Policy/approval | server-owned Shadow eligibility policy and `NONE`; L2.5 remains non-executable |
| Presentation | the future activation contract records the approved presentation, key-selection-policy, and claim-lookup contract versions; no key version, bearer, or certificate is created here |
| `PENDING` | future known checkout state after an exact provider response; it is not `UNKNOWN` |
| `UNKNOWN` | not applicable because the Shadow performs no external dispatch |
| Reconciliation | not invoked by this non-executable slice |

The bridge accepts only an existing opaque legacy recipient-subject HMAC
reference. Raw recipient PII, certificate code, bearer secret, value,
currency, entitlement, approval, autonomy, policy decision, and executor are
not accepted as caller authority.

## 2. Implementation

The Action Engine registry now contains the isolated capability:

`gift-certificates.purchase.shadow.v1`.

Its immutable execution boundary is:

- `actionClass = initiate_gift_certificate_purchase`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt;
- no executable retry and no reconciliation redispatch;
- `externalSideEffects = 0` through `planShadow`.

`GiftCertificatePurchaseShadowService` performs only read-only preparation
before `ActionEngineRuntimeService.planShadow`:

1. authenticates and binds the bridge integration;
2. derives the tenant;
3. resolves the offer from the fixed server catalog;
4. checks the unresolved Client identity guard;
5. resolves the exact same-tenant purchaser Client;
6. derives provider-Client, purchase-intent, recipient-subject, offer-snapshot,
   checkout, provider-request-seed, and policy-snapshot hashes;
7. rejects a different active checkout identity for the same logical purchase
   while allowing the exact identity to converge;
8. persists only the non-executable Shadow ActionExecution plan.

The local Python bridge is a disposable adapter fixture. It has no database,
YooKassa, certificate, bearer, redemption, loyalty, value, or messaging
mutation authority and is not imported by the unchanged production legacy
handlers. The Nest Shadow endpoint is disabled unless its explicit feature
flag and bridge bindings are configured. Structural proof was sufficient, so
this Shadow was not deployed to production.

## 3. Fail-closed and side-effect proof

Targeted tests prove:

1. an exact Client and canonical certificate offer produce one deterministic
   Shadow checkout intent;
2. retry and service restart preserve the same logical identity;
3. Telegram and PWA initiators converge for the same logical purchase;
4. missing, unlinked, merged, cross-tenant, or guarded Client identity fails
   closed;
5. P02/P03-style unresolved hold and guard lookup failure fail closed;
6. an offer absent from the server catalog is rejected;
7. a conflicting checkout identity fails closed while the exact identity
   converges;
8. forged value, price, currency, expiry, presentation-key version,
   entitlement, approval, autonomy, policy, and executor input is rejected;
9. incomplete purchase or recipient evidence creates no execution;
10. the intended provider state is `PENDING`, external `UNKNOWN` is not
    synthesized without dispatch, and activation/bearer issuance remain absent;
11. provider checkout, payment, certificate, redemption, message, loyalty, and
    value mutations by the new path remain exactly zero.

Architectural ratchets additionally prove that the Shadow service contains no
direct GiftCertificate, GiftCertificateRedemption, or BillingPayment mutation,
no executable Action Engine call, no YooKassa call, and no production legacy
owner wiring.

## 4. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-06 service/contract/architecture suites | PASS — 3 suites / 27 tests |
| Registry, application-module, GiftCertificate schema, and presentation-key-version regressions | PASS — 4 suites / 32 tests |
| Combined targeted Jest result | PASS — 7 suites / 59 tests |
| Python bridge unittest | PASS — 3 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| Scripts TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, provider client, production endpoint,
temporary database, checkout, payment, certificate, redemption, or value
mutation was run.

## 5. Safety boundary

- Production legacy Telegram/PWA/YooKassa paths remain the factual execution
  owner.
- No YooKassa/provider request was issued.
- No provider checkout or payment state was created or changed.
- No `GiftCertificate` was created or activated.
- No bearer, raw certificate code, code hash, or presentation-key version was
  issued for a real certificate.
- No `GiftCertificateRedemption` was created.
- No loyalty balance or other value state changed.
- No customer message was sent.
- `activate_gift_certificate` and `redeem_gift_certificate` were not started.
- P4-02 through P4-05 were not changed.
- A08 payment write remains disabled.
- Package 5 and Chapter 7 were not started.

## 6. Verdict

`P4-06 SHADOW ACTION CLASS: initiate_gift_certificate_purchase`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`PROVIDER CHECKOUTS CREATED BY NEW PATH: 0`

`CERTIFICATES CREATED/ACTIVATED BY NEW PATH: 0`

`REDEMPTIONS CREATED BY NEW PATH: 0`

`PROVIDER/VALUE WRITES BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-06 ACTION CLASSES SHADOW-MIGRATED: 1/3`

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

STOP. The second P4-06 action class requires a separate explicit instruction.
