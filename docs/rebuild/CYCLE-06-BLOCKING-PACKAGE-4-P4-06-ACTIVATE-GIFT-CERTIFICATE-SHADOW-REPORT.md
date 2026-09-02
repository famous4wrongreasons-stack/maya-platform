# CYCLE 06 BLOCKING PACKAGE 4 — P4-06 ACTIVATE_GIFT_CERTIFICATE SHADOW REPORT

Status: second P4-06 canonical Shadow slice complete; no certificate, bearer,
redemption, payment, provider, or value mutation and no executable cutover

Source checkpoint: `bf3e17b6`

Report date: 2026-09-02

## 1. Exact slice and pre-code contract

This step implements only the approved non-executable Shadow for:

`activate_gift_certificate`.

Checkout existence, authoritative payment success, paid certificate issuance,
bearer presentation, and redemption remain distinct facts and boundaries. The
Shadow independently verifies payment evidence, creates one canonical
activation plan, and stops before the `GiftCertificate` mutation.

| Contract item | Decision |
|---|---|
| Initiator | provider webhook, payment poller, or startup reconciliation evidence; none is authority for payment success, value, expiry, presentation key version, policy, approval, or execution |
| Current execution owner | unchanged legacy `_poll_payment`, startup recovery, and legacy database adapters; paid state still controls legacy PDF delivery |
| Tenant | resolved server-side from the bridge-bound provider/company integration |
| Purchaser | one exact, active, unmerged tenant-qualified `CrmClientLink -> Client` resolution |
| Identity hold | canonical unresolved-identity guard is checked before provider evidence; P02/P03-style active hold fails closed |
| Checkout | exact same-tenant executable `initiate_gift_certificate_purchase` ActionExecution with acknowledged provider reference and immutable safe result |
| Provider truth | independently read YooKassa payment id, status, paid flag, amount/currency, captured time, and metadata; caller text is never payment evidence |
| Known pending | `pending` and `waiting_for_capture` produce no activation plan and are not `UNKNOWN` |
| `UNKNOWN` | existing ambiguous checkout/provider outcome produces no activation plan and no redispatch |
| Failed/canceled | known non-success outcome; creates no activation plan and no certificate |
| Value/expiry | exact fixed-money server offer and 365-day expiry from authoritative paid time; caller cannot supply or alter either |
| Logical identity | tenant + checkout execution + provider/payment-reference identity + exact paid outcome + offer/recipient snapshot + presentation contract |
| Certificate identity | deterministic activation, issuance, and certificate identity hashes; one provider payment can claim at most one issuance |
| Presentation | exact server-configured `presentationKeyVersion`, approved presentation/key-policy/lookup contract versions, and deterministic bearer-derivation identity only |
| Policy/approval | server-owned one-time activation policy and `NONE`; L2.5 remains non-executable |

The bridge accepts only tenant-bound CRM Client identity and a canonical
checkout execution id. It cannot send payment state, nominal value, currency,
expiry, presentation key version, bearer/code material, entitlement,
authority, policy, or approval.

## 2. Implementation

The Action Engine registry now contains the isolated capability:

`gift-certificates.activation.shadow.v1`.

Its immutable execution boundary is:

- `actionClass = activate_gift_certificate`;
- `policyDecision = SHADOW_ONLY`;
- `autonomyLevel = L2_5_SHADOW`;
- `executorKey = shadow.none`;
- one planning attempt;
- no executable retry and no external reconciliation dispatch;
- `externalSideEffects = 0` through `planShadow`.

`GiftCertificateActivationShadowService` performs only read-only evidence
resolution before `ActionEngineRuntimeService.planShadow`:

1. authenticates and binds the bridge integration;
2. derives the tenant and checks the unresolved Client identity hold;
3. resolves the exact same-tenant purchaser Client;
4. loads the exact completed canonical checkout and its acknowledged provider
   attempt;
5. decrypts the provider reference only for an authoritative YooKassa GET;
6. rejects `PENDING`, `UNKNOWN`, failed/canceled, wrong payment id,
   amount/currency, metadata, checkout, Client, offer, recipient, or provider
   request evidence;
7. derives paid/issue time, policy-owned expiry, provider-payment identity,
   activation/issuance/certificate identities, and the bearer-derivation
   identity;
8. selects and validates the non-secret presentation key version from server
   configuration;
9. rejects an already claimed issuance or provider payment;
10. persists only the non-executable Shadow ActionExecution plan.

The plan contains no bearer, raw certificate code, lookup code hash, or key
material. `bearerDerivationIdentityHash` identifies the future approved
presentation derivation context; it is not a bearer credential. The future
executable transaction must allocate and persist the actual certificate and
tenant-qualified lookup hash atomically, but this Shadow performs neither.

The Python bridge is a disposable adapter fixture and is not imported by the
unchanged production legacy owners. The endpoint is disabled unless its
explicit feature flag and source bindings are configured. Structural proof
was sufficient, so no production Shadow was deployed.

## 3. Fail-closed and side-effect proof

Targeted tests prove:

1. authoritative succeeded payment creates one exact deterministic activation
   plan;
2. retry, restart, webhook, poller, and startup initiators converge on the same
   activation/certificate identity;
3. provider `pending` and `waiting_for_capture` create no activation;
4. checkout/provider `UNKNOWN` creates no activation and no blind retry;
5. failed, canceled, or cancelled payment creates no activation;
6. wrong checkout action/state, provider request, payment reference,
   amount/currency, metadata, offer, recipient, tenant, or Client fails closed;
7. missing, unlinked, merged, cross-tenant, or unresolved/held Client identity
   fails closed;
8. forged payment success, value, currency, expiry, presentation key version,
   entitlement, approval, autonomy, policy, bearer, or code is rejected at the
   bridge/DTO/Action Engine boundaries;
9. missing or invalid server presentation key version fails closed;
10. an already claimed issuance or provider payment creates no second plan for
    value;
11. provider evidence read failure happens before mutation and fails closed;
12. certificate, bearer/code, redemption, payment, provider, message, loyalty,
    and all other value mutations by the new path remain exactly zero.

Architectural ratchets additionally prove that the service contains no direct
GiftCertificate, GiftCertificateRedemption, or BillingPayment mutation, no
executable Action Engine call, no provider create call, no bearer generation,
and no production legacy-owner wiring.

## 4. Targeted verification

All checks ran sequentially in low-load mode:

| Check | Result |
|---|---|
| P4-06 activation service/contract/architecture suites | PASS — 3 suites / 40 tests |
| Purchase Shadow, registry, application-module, GiftCertificate schema, and presentation-key-version regressions | PASS — 7 suites / 59 tests |
| Combined targeted Jest result | PASS — 10 suites / 99 tests |
| Python activation bridge unittest | PASS — 3 tests |
| Targeted ESLint | PASS |
| Application TypeScript typecheck | PASS |
| Scripts TypeScript typecheck | PASS |
| `git diff --check` | PASS |

No full suite, build, browser, Playwright, real provider client, production
endpoint, temporary database, checkout, payment, certificate, bearer,
redemption, or value mutation was run.

## 5. Safety boundary

- Production legacy poller/startup/database paths remain the factual execution
  owner.
- The new path performs provider status read only; no YooKassa/provider write
  was issued.
- No payment or checkout state was created or changed.
- No `GiftCertificate` was created or activated.
- No bearer, certificate code, lookup code hash, or raw key material was
  generated or persisted.
- No `GiftCertificateRedemption` was created.
- No loyalty balance or other customer value changed.
- No customer message or bearer presentation was dispatched.
- `redeem_gift_certificate` was not started.
- The completed purchase Shadow was preserved.
- P4-02 through P4-05 were not changed.
- A08 payment write remains disabled.
- Package 5 and Chapter 7 were not started.

## 6. Verdict

`P4-06 SHADOW ACTION CLASS: activate_gift_certificate`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`CERTIFICATES CREATED/ACTIVATED BY NEW PATH: 0`

`RAW BEARER/CODE PERSISTED BY NEW PATH: 0`

`REDEMPTIONS CREATED BY NEW PATH: 0`

`PAYMENT/PROVIDER/VALUE WRITES BY NEW PATH: 0`

`MESSAGES SENT BY NEW PATH: 0`

`P4-06 ACTION CLASSES SHADOW-MIGRATED: 2/3`

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

STOP. The third P4-06 action class requires a separate explicit instruction.
