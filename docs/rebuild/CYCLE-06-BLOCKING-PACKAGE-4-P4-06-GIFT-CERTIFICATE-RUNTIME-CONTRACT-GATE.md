# CYCLE 06 BLOCKING PACKAGE 4 — P4-06 GIFT CERTIFICATE RUNTIME CONTRACT GATE

Status: **COMPLETE — contract/schema decision only; runtime not started**

Source checkpoint: `52e931f2`

Gate date: 2026-09-02

## 1. Scope And Boundary

This Gate defines the runtime contract for `P4-06 / A20-C — Gift
Certificate Value Convergence`. It uses the accepted post-P4-05 remainder
checkpoint, the Package 4 Monetary/Value Gate, the applied
`GiftCertificate` / `GiftCertificateRedemption` foundation, Canonical Action
Ingress, the client-owned value and unresolved-identity invariants from
P4-03, and the real Telegram, PWA, poller, YooKassa, and legacy storage paths.

This step does not register a capability, add an executor, create or apply a
migration, change Python or Nest runtime, deploy, query or mutate production,
call YooKassa or YClients, issue or redeem a certificate, dispatch a customer
message, or start Shadow. P4-02 through P4-05 remain immutable completion
baselines. A08 remains disabled.

The family has one accepted production-reachable bypass group and three
concrete direct-mutation subgroups:

1. pending certificate/payment-intent creation, YooKassa dispatch, and
   provider-reference attachment;
2. provider-payment reconciliation changing the legacy certificate to
   `paid` or `canceled`;
3. full certificate redemption through the Telegram or PWA cashier path.

`P4-06 GATE-LEVEL PRODUCTION BYPASS GROUPS: 1`

`P4-06 CONCRETE DIRECT-MUTATION SUBGROUPS: 3`

## 2. Current Production Owners

| Boundary | Current initiator/execution owner | Direct effect |
| --- | --- | --- |
| Purchase/payment checkout | Telegram `_send_cert_invoice` and PWA `cert_create_handler`, then `yukassa_api.create_payment` | Generates a raw bearer code, inserts a legacy pending certificate, creates a YooKassa payment, and attaches the payment id |
| Payment outcome and issuance activation | `_poll_payment`, bot startup recovery, and legacy database adapters | Polls YooKassa and changes the legacy row from pending to paid or canceled; paid state then triggers PDF delivery |
| Redemption | Telegram `cert_redeem_*`, PWA `panel_redeem_handler`, and `mark_cert_used` | Changes the legacy row's `used_at`/actor fields directly |

`ai администратор/database.py` is the live storage implementation.
`ai администратор/saas_blueprint/pg/db_pg_full.py` mirrors the same direct
writers and remains a deployable legacy owner surface. The PostgreSQL
blueprint adds tenant RLS but does not add ActionExecution ownership,
provider-dispatch certainty, or an exact redemption claim.

The legacy redemption check and mutation are split across reads and an update.
The Telegram callback's update checks only `used_at IS NULL`, and the PWA path
does not test the mutation result before returning success. Those are concrete
bypasses; lookup-time paid/expiry checks are not an atomic value claim.

`cert_pdf.py`, Telegram/PWA presentation, analytics, retention, and the
read-only `commerce.certificates.read` tool are not value owners. Certificate
catalog mutation belongs to P4-09 and is outside this family.

There is no P4-06 capability or canonical runtime writer in the Action Engine
registry. After eventual cutover, Telegram, PWA, pollers, and provider status
observers may remain initiators/evidence sources only. They may not dispatch
payment, issue, activate, cancel, or redeem value outside Canonical Action
Ingress and the Action Engine, and they may not fall back to a legacy writer.

## 3. Exact Action Classes

The family contains **three** action classes. This is derived from business
identity and external outcome boundaries, not from the number of legacy
functions.

| Order | Action class | Capability boundary | External dispatch |
| ---: | --- | --- | --- |
| 1 | `initiate_gift_certificate_purchase` | Create one provider checkout from one explicit authenticated purchase intent; creates no certificate value | YooKassa payment create |
| 2 | `activate_gift_certificate` | On authoritative payment success, atomically issue and activate one paid certificate and its durable bearer lookup | None; provider evidence is independently read before mutation |
| 3 | `redeem_gift_certificate` | Consume one exact paid, unexpired certificate in full against one exact business target | None under the approved legacy scope |

### 3.1 Why payment checkout is not issuance

`checkout exists`, `payment succeeded`, and `certificate value exists` are
three different facts. A checkout action succeeds when the exact provider
payment object and presentation URL are known. A known provider `pending` or
`waiting_for_capture` state grants no certificate and is not `UNKNOWN`.

The canonical runtime must not create a `GiftCertificate` row during checkout.
The checkout `ActionExecution` / `ActionAttempt` is the durable pending object.
Only a later, independently claimed activation action may create a paid
certificate after authoritative `succeeded` evidence. Therefore a pending
checkout creates neither a usable code nor liability value.

There is no separately approved free/manual issue operation in the real
legacy product. For this family, canonical issuance and activation are the
same local value boundary: the paid certificate row is created atomically by
`activate_gift_certificate`. Adding complimentary issuance would require a new
contract and policy Gate.

### 3.2 Why cancel/reconcile are not extra action classes

A provider `canceled` result before activation is a known terminal outcome of
the original checkout payment. It is recorded by a reconciliation attempt and
creates no `GiftCertificate`. It is not cancellation of issued value and does
not need a fourth value action.

Reconciliation is an `ActionAttempt` under the original checkout execution,
not a new logical purchase. It must retain the same provider request identity
and transport idempotency key.

Post-issuance certificate cancellation, revocation, payment refund, and value
reversal do not exist in the current legacy contract and are **not authorized**
by P4-06. They would require a separately approved financial/terminal contract
and durable representation; the existing `canceledAt` state must not be
repurposed to erase paid value.

### 3.3 Expiry and partial redemption

Expiry is a derived eligibility predicate over immutable `expiresAt`; it is
not a scheduled mutation or a fourth action class. An expired certificate
remains historical truth and fails closed at redemption.

Partial redemption is unsupported. The legacy model has one `used_at` claim
and no remaining-value ledger. Canonical semantics are one certificate to
zero or one full redemption. The full nominal and currency remain immutable
on the parent certificate; `GiftCertificateRedemption` is the exact consuming
fact.

## 4. Canonical Identity And Value Contract

All authority and value facts are derived server-side. Initiator-provided
tenant, Client, amount, currency, offer, expiry, provider status, payment
reference, code hash, target, entitlement, autonomy, or approval is never
authority.

### 4.1 Certificate value ownership

A gift certificate is a transferable bearer claim against one tenant's
liability; it is not a `LoyaltyAccount` balance and must not be converted into
loyalty points. Its canonical value owner is:

`tenant + immutable GiftCertificate identity + presented bearer credential`.

The authenticated purchaser is an exact canonical `Client` in the checkout
and activation contracts, but is not the permanent owner of a transferable
certificate. The intended recipient is an immutable `recipientSubjectHash`,
not a guessed Client merge or bearer substitute. No fake User, Membership, or
Client is created for a gift recipient.

At redemption, the exact service/sale/visit target and its exact canonical
Client are derived from same-tenant business evidence and retained in the
redemption execution. `targetKind` is a versioned namespace and
`targetRefHash` hashes the normalized provider/record/service target. A target
whose provider Client identity is ambiguous or under an active
`UnresolvedClientIdentityHold`, including P02/P03, fails closed with
`client_identity_unresolved`. The caller cannot substitute a phone hash or
certificate recipient hash for exact Client evidence.

### 4.2 Frozen issuance facts

Activation freezes in one transaction:

- tenant and `issuanceIdentityHash`;
- exact checkout execution and provider-payment identity;
- server catalog offer/version in `offerSnapshotHash`;
- nominal amount in kopecks and ISO currency;
- immutable recipient subject hash;
- authoritative paid/issue time and server-owned expiry policy;
- bearer lookup hash and presentation key version;
- the unique activation/issuance execution binding.

Changing the catalog later cannot change an issued certificate. There is no
implicit money-to-points conversion and no mutable remaining balance.

### 4.3 Deterministic logical identities

| Action class | Server-derived logical identity |
| --- | --- |
| `initiate_gift_certificate_purchase` | tenant + purchaser Client + explicit purchase-intent reference + offer snapshot + nominal/currency + recipient-subject hash + expiry-policy version + checkout-contract version |
| `activate_gift_certificate` | tenant + checkout execution + provider + provider-payment-reference hash + exact paid outcome + offer/recipient snapshot + presentation-contract version |
| `redeem_gift_certificate` | tenant + certificate + exact target kind/reference hash + target Client + actor identity + redemption-contract version |

Telegram update identity or an HTTP idempotency token may seed the explicit
intent reference, but Canonical Ingress scopes and hashes it. Retry, restart,
webhook/poller duplication, and a second initiator for the same logical fact
converge on the same execution.

Provider metadata contains an opaque checkout/execution reference. It must not
contain the bearer code. Provider idempotence keys derive from the checkout
execution and never from a random legacy code or mutable row id.

## 5. Payment States, UNKNOWN, And Reconciliation

Only `initiate_gift_certificate_purchase` crosses an external write boundary.
Before dispatch, its `ActionAttempt` persists the exact normalized provider
request identity and transport idempotency key.

| Observation | Canonical meaning |
| --- | --- |
| Validation or provider rejection proven before dispatch | `FAILED`/`NOT_EXECUTED`; no checkout and no certificate |
| Provider returns an exact payment id in `pending`/`waiting_for_capture` | Checkout execution `SUCCEEDED` with known `PENDING` payment; no certificate |
| Response/connection is lost after dispatch may have crossed | `UNKNOWN`; reconciliation mandatory; no new-key dispatch and no certificate |
| Provider proves the original request did not execute | The same execution may retry only under policy with the same request identity/key |
| Provider returns `canceled` | Known terminal payment outcome; no certificate and not `UNKNOWN` |
| Provider returns authoritative `succeeded` | Evidence may initiate exactly one `activate_gift_certificate` execution |

Reconciliation uses, in order:

1. the encrypted provider reference and its hash on the original attempt, if
   a response supplied one;
2. authoritative provider GET/status evidence binding payment id, amount,
   currency, metadata, and checkout identity;
3. the original byte-equivalent request and original YooKassa idempotence key
   as the provider's idempotent recovery mechanism when the POST response was
   lost;
4. manual review if the provider cannot distinguish applied from not applied.

An exact same-key provider call is allowed only as the documented idempotent
recovery of the original execution. It is not a blind new dispatch. A new key
or changed request is forbidden while the outcome is ambiguous. If certainty
cannot be recovered, the execution remains `UNKNOWN`/manual-required.

Activation does not trust `paid=true`, webhook text, redirect return, or a
legacy row status. It independently verifies authoritative provider state,
same tenant, checkout execution, payment identity, amount, currency, offer,
purchaser Client, and recipient/expiry snapshot before the local transaction.
A provider read failure occurs before mutation and fails closed; it does not
create `UNKNOWN` for a local action.

`PROVIDER UNKNOWN/RECONCILIATION CONTRACT: COMPLETE`

`PENDING != UNKNOWN: ENFORCED BY CONTRACT`

## 6. One-Time Activation And Redemption

Activation creates the paid certificate, its `codeHash`, immutable issue
facts, provider-payment hash, and `issueExecutionId` in one PostgreSQL
transaction. A crash before commit creates no certificate. A crash after
commit converges through unique issuance identity, provider-payment identity,
and issue execution. A second payment webhook cannot issue a second
certificate.

Redemption is one local PostgreSQL transaction inserting one
`GiftCertificateRedemption` bound to one execution. Before insertion, the
executor proves the bearer lookup, paid state, expiry, exact target, same
tenant, exact Client, and cashier/owner actor authority. The database locks
the parent certificate and the unique certificate/execution claims reject
replay and concurrent second redemption.

The redemption consumes the entire immutable nominal. It does not create a
`LoyaltyTransaction`, change P4-03 loyalty state, or write YClients. The
legacy instruction to staff to mark a service as paid in YClients is not an
automated provider executor. Any future YClients value write requires its own
dispatch/UNKNOWN/reconciliation contract and is outside this Gate.

A local commit or rollback has a deterministic result; redemption does not
invent `UNKNOWN`. Provider/YClients evidence read failure before mutation
fails closed.

`ONE-TIME ACTIVATION/ISSUANCE CONTRACT: COMPLETE`

`ONE-TIME FULL REDEMPTION CONTRACT: COMPLETE`

`PARTIAL REDEMPTION: UNSUPPORTED`

## 7. Bearer And Presentation Contract

Durable claim identity and bearer presentation are separate contracts.

### 7.1 Required versioned contract

`ISSUE OUTPUT CONTRACT: gift-certificate-presentation.v1`

- activation allocates the immutable certificate id before commit;
- it selects a server-side presentation key version;
- it derives a high-entropy bearer with a domain-separated server PRF over
  the contract name, tenant, certificate id, issuance identity, activation
  execution, nominal/currency, and expiry;
- it returns or dispatches the bearer only after the paid certificate
  transaction commits.

`STORED LOOKUP CONTRACT: giftCertificateClaimLookup.v1`

- only a tenant-qualified keyed HMAC lookup (`codeHash`) and the non-secret
  presentation key version are persisted;
- the presentation PRF key and lookup-HMAC key are domain-separated;
- the raw bearer is absent from certificate/redemption rows, ActionExecution
  input/evidence/safe results, provider metadata, communication payloads,
  logs, and reports.

`REDEEM INPUT CONTRACT: presented bearer -> giftCertificateClaimLookup.v1`

- the authorized initiator presents the exact bearer;
- the server normalizes and HMACs it before tenant-scoped lookup;
- certificate id, execution id, purchaser/recipient identity, QR target, or
  provider payment reference cannot substitute for the credential.

### 7.2 Crash-safe presentation

If the process crashes after paid issuance commits but before presentation,
retry must find the same certificate and re-derive the same bearer. It must
not create another payment, certificate, or code. The key ring retains a
version until every certificate using it has expired plus the audit window;
an unavailable version fails closed.

Asynchronous PDF/message delivery is a separate canonical communication
effect storing only the certificate/presentation reference. The bearer is
derived in memory immediately before rendering/dispatch and redacted from
logs. Delivery `UNKNOWN` never causes payment redispatch or reissuance.

The current `GiftCertificate` stores `codeHash` but does **not** durably store
which presentation key version reproduces the bearer. `offerSnapshotHash`,
`issuanceIdentityHash`, and a mutable/current process key must not be
overloaded as hidden key-version state. Keeping every retired secret forever
or persisting the raw bearer would weaken the approved security contract.

Therefore the bearer contract is defined, but its required restart/rotation
fact is not representable in the current domain schema.

`RAW CERTIFICATE/BEARER CODE PERSISTED: NO`

`CRASH-SAFE BEARER PRESENTATION CONTRACT: DEFINED — SCHEMA BLOCKED`

## 8. Cancellation, Refund, Reversal, And Expiry

- provider payment cancellation before activation is a known checkout
  outcome; no certificate row or value is created;
- expiration is a derived redemption rejection over immutable `expiresAt`;
- paid certificate cancellation/revocation is unsupported and fails closed;
- payment refund and liability reversal are unsupported and require a
  separate financial/terminal Gate before any implementation;
- a redeemed certificate cannot be reopened or refunded by changing the
  immutable redemption row;
- no missing capability may fall back to `paymentStatus`, `canceledAt`, raw
  SQL, or a legacy writer to approximate a reversal.

`POST-ISSUANCE CANCEL/REVOKE CONTRACT: NOT PRESENT — MUTATION FORBIDDEN`

`REFUND/REVERSAL CONTRACT: NOT PRESENT — SEPARATE GATE REQUIRED`

## 9. Policy, Approval, Scheduler, And Blast Radius

Server-side policy derives the active certificate offer, price/currency,
expiry, recipient-subject normalization, actor authority, and exact target.
Forged caller values are rejected. L2.5 may plan but cannot dispatch payment,
issue, activate, or redeem value.

Initial executable limits are:

- one explicit authenticated purchase intent creates at most one checkout for
  one purchaser, one offer, one recipient subject, and one price/currency;
- one successful payment activates at most one certificate;
- one certificate has at most one full redemption;
- purchase needs authenticated customer intent and an active server offer,
  not a caller-provided approval bit;
- activation needs no second human approval when it exactly matches the paid
  checkout within the active offer and risk policy;
- redemption needs server-derived cashier/owner authority and exact target;
  it cannot be initiated by the bearer alone;
- any offer outside the active catalog, changed price/currency/expiry, manual
  issuance, post-issuance cancellation, refund, reversal, or partial
  redemption fails closed pending a separate approved policy/contract.

The only existing recurring work is pending-payment polling/startup recovery.
It becomes a read/reconciliation envelope with bounded fan-out:

- tenant-scoped deterministic envelope identity;
- at most 25 pending checkout executions per tenant/envelope;
- at most 125,000 RUB aggregate nominal exposure under the current maximum
  5,000 RUB server offer; a lower active catalog/policy cap wins;
- independent per-checkout reconciliation attempts and later independent
  activation executions;
- no cross-tenant transaction and no batch value mutation;
- partial completion resumes from the same child identities; larger sets use
  deterministic continuation envelopes;
- the poller remains an evidence initiator, never payment or activation owner.

Changing the catalog in P4-09 does not silently raise this cap. A new policy
version/approval is required. There is no issuance or redemption bulk action.

`SCHEDULER/RECONCILIATION FAN-OUT CONTRACT: COMPLETE`

`POLICY/APPROVAL/BLAST-RADIUS CONTRACT: COMPLETE`

## 10. Legacy Continuity And Communication

Legacy rows must be classified before production cutover:

- pending rows are provider checkout state, not certificate value, and must
  be reconciled or held before writer freeze;
- paid rows become canonical certificates only after exact tenant, offer,
  nominal/currency, recipient subject, provider payment, time, and code-hash
  correlation;
- used rows become redemptions only when an exact business target and
  authorized actor evidence exist; missing target evidence is a continuity
  finding, not a fabricated `targetRefHash`;
- canceled rows are historical checkout outcomes, not issued value;
- active legacy bearer codes can remain usable only through deterministic
  tenant-scoped HMAC migration of the existing code; the raw code is not
  copied into canonical storage;
- historical rows use `legacySourceRef` and may retain null execution
  bindings; no historical `ActionExecution` is invented.

A separate read-only data-continuity/dry-run Gate is mandatory before
production cutover. This Gate performs no inventory or migration.

PDF/Telegram/PWA presentation is communication, not payment or certificate
truth. Delivery failure cannot roll back paid issuance, create another
certificate, or change redemption. Delivery success is not payment evidence.
No communication path may invoke a legacy value writer as fallback.

`COMMUNICATION BOUNDARY PRESERVED: YES`

## 11. Schema Decision And Minimal Proposal

The applied foundation already provides:

- tenant-qualified unique issuance and redemption execution bindings;
- immutable nominal, currency, recipient, offer, issue/expiry, and provider
  payment facts;
- one-way pending/paid/canceled compatibility state;
- unique issuance, code-hash, provider-payment, and one-time redemption
  claims;
- parent locking, paid/expiry validation, immutable exact target hash, and
  legacy null-binding compatibility;
- `ActionExecution` / `ActionAttempt` provider identity, idempotence,
  `UNKNOWN`, reconciliation, policy, approval, and restart state.

One indispensable durable fact is absent: the non-secret presentation key
version required to reproduce the same paid bearer after response loss or
restart while still allowing safe key rotation.

### 11.1 Minimal Schema Proposal

Add only this nullable-for-history field to `GiftCertificate`:

```prisma
presentationKeyVersion String?
```

Required database contract:

1. historical rows may remain `NULL`; no fake backfill;
2. every new canonical certificate with non-null `issueExecutionId` must have
   a non-empty `presentationKeyVersion`;
3. once set, the version cannot be cleared or replaced;
4. the field contains a key identifier only, never key material or bearer
   content;
5. the existing immutable-facts trigger is extended to protect it;
6. no Client, payment, redemption, balance, catalog, or generic workflow
   model is added or changed.

Targeted structural proof must cover canonical issuance requiring the field,
historical null compatibility, clear/replace rejection, raw bearer absence,
clean replay, Prisma validation, and zero drift. Production migration and
runtime alignment require later separately authorized steps.

The generic ActionExecution retained input is not a substitute for this
domain fact: payload retention can end before certificate expiry, while
authorized presentation/re-presentation must remain possible for the entire
certificate lifetime.

`CANONICAL SCHEMA SUFFICIENT: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

## 12. Shadow Decision

Shadow is required because checkout has a real payment-provider write, the
legacy system has multiple initiators/direct writers, and bearer security must
be compared before executable cutover. The intended later order is:

1. `initiate_gift_certificate_purchase`;
2. `activate_gift_certificate`;
3. `redeem_gift_certificate`.

Every Shadow must stop before provider dispatch or value mutation. However,
Shadow does **not** start while paid bearer presentation is not durably
representable. The minimal schema proposal must first pass its own foundation
and production-migration Gates.

`P4-06 SHADOW REQUIRED: YES`

`P4-06 SHADOW CAN START: NO`

## 13. Gate Verdict

`P4-06 RUNTIME CONTRACT GATE COMPLETE: YES`

`P4-06 EXACT ACTION CLASSES: 3 / initiate_gift_certificate_purchase, activate_gift_certificate, redeem_gift_certificate`

`P4-06 PRODUCTION BYPASS GROUPS: 1`

`P4-06 DIRECT-MUTATION SUBGROUPS: 3`

`CANONICAL SCHEMA SUFFICIENT: NO`

`ADDITIONAL SCHEMA REQUIRED: YES`

`CERTIFICATE ISSUANCE = PAID ACTIVATION: YES`

`PENDING CHECKOUT CREATES CERTIFICATE VALUE: NO`

`PROVIDER UNKNOWN/RECONCILIATION CONTRACT: COMPLETE`

`PENDING != UNKNOWN: ENFORCED BY CONTRACT`

`ONE-TIME ACTIVATION/ISSUANCE CONTRACT: COMPLETE`

`ONE-TIME FULL REDEMPTION CONTRACT: COMPLETE`

`PARTIAL REDEMPTION: UNSUPPORTED`

`RAW CERTIFICATE/BEARER CODE PERSISTED: NO`

`CRASH-SAFE BEARER PRESENTATION: SCHEMA GAP`

`POST-ISSUANCE CANCEL/REVOKE: UNSUPPORTED`

`REFUND/REVERSAL: SEPARATE GATE REQUIRED`

`COMMUNICATION BOUNDARY PRESERVED: YES`

`P4-06 SHADOW REQUIRED: YES`

`P4-06 SHADOW CAN START: NO`

`PRODUCTION WRITES: 0`

`PRODUCTION PAYMENTS: 0`

`PRODUCTION CERTIFICATE/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`P4-06 RUNTIME STARTED: NO`

`P4-07 STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

`TEMP PROCESSES STARTED: 0`

`TEMP PROCESSES TERMINATED: 0`

`OWNED TEMP PROCESSES STILL RUNNING: 0`

`BACKGROUND WATCHERS LEFT: 0`

`PLAYWRIGHT/CHROME STARTED: 0`

`TEMP DATABASES REMAINING: 0`

STOP. No Shadow, runtime implementation, migration, build/deploy, production
cutover, next Package 4 family, Package 5, or Chapter 7 work was started by
this Gate.
