# CYCLE 06 A08 Financial Semantics / Contract Gate

Date: 2026-08-26  
Scope: INSPECT + CONTRACT GATE only  
Production mutations performed by this gate: 0  
Package 2 started: NO

## Decision Summary

A08 is not a single transport operation. It is a business outcome that must be
proven from the provider read model after any external dispatch.

The existing legacy implementation conflated three independent facts:

1. a financial operation exists;
2. that operation is linked to the intended appointment and visit;
3. the visit is paid according to YClients.

Production inspection proves that the first fact can be true while the other
two are false. Therefore a successful `POST finance_transactions` response can
never be the success condition for a paid visit.

The minimum canonical business action proposed by this gate is
`settle_visit_payment.v1`. It expresses the required business result instead of
the transport step `create_financial_operation`. Attendance remains a separate
action and must not be hidden inside payment settlement.

Implementation is not approved yet. The current adapter has no proven
provider-supported write sequence or atomic endpoint that guarantees both the
operation-to-visit linkage and the paid visit state. This is a provider write
contract gate, not a Prisma schema gate.

## Evidence And Safety Boundary

The inspection used only read operations against production. No operation,
appointment, visit, cash account, or local mirror was changed or deleted.
Provider identifiers and personal data are intentionally not reproduced in
this report. The exact technical references remain available in restricted
operational evidence.

Evidence sources:

- current Python YClients adapter;
- current NestJS Action Engine and A08 Shadow capability;
- read-only inspection of the A08 2,000-ruble operation and its target visit;
- read-only comparison with five known-good paid visits from the same provider;
- official YClients product documentation describing visit payment and
  financial-operation linkage.

Official provider references:

- [Payment by link: a paid visit and financial/stock operations are separate
  resulting records](https://support.yclients.com/5-23-581--oplata-vizitov-i-tovarov-po-ssylke/)
- [Financial operation details can navigate to the related visit](https://support.yclients.com/996)
- [Cancelling a financial operation changes the visit to not fully paid](https://support.yclients.com/5-24-595--vozvrat-sredstv-klientu/)
- [Service payment operations are generated from the visit workflow](https://support.yclients.com/591)
- [Visit payment selects a payment method and cash account](https://support.yclients.com/698)

These references establish the provider's business semantics. They do not
document a safe public API write primitive that our adapter can use to atomically
settle an existing visit. That missing write contract remains the blocker.

## Three Independent Provider Facts

| Fact | Required evidence | A08 production state |
|---|---|---|
| Financial operation exists | Provider transaction can be read by its stable reference/identity | YES |
| Operation is linked to appointment/visit | Non-zero `record_id` and `visit_id` match the target; service sale allocation is present | NO |
| Visit is paid/closed | Provider appointment read reports the paid state and the linked payment evidence agrees | NO |

The terms "operation created", "operation linked", and "visit paid" must never
be used interchangeably in code, logs, reports, or user-facing text.

Attendance is a fourth independent fact. `attendance = 1` means that the visit
occurred; it does not prove payment. Attendance remains owned by A04 and is not
part of A08 settlement success.

## Current Provider Surface

### Reads currently available

The Python adapter can read:

- `GET record/{company_id}/{record_id}` for appointment and visit-related fields;
- `GET transactions/{company_id}` for financial operations and their linkage;
- service rows embedded in the appointment.

The current NestJS CRM adapter does not expose a complete canonical
visit/payment document. Its payment projection is primarily based on
`paid_full`; the existing A08 capability is Shadow-only and carries only opaque
`mutationKind` and `valueRef` fields.

### Writes currently present in legacy code

The legacy Python flow attempts:

1. `PUT record/{company_id}/{record_id}` with attendance and payment-looking
   fields;
2. if the reread is not considered paid, `POST
   finance_transactions/{company_id}` with appointment/visit references;
3. a reread of the record.

The second call creates a financial operation. Provider acceptance of that call
does not guarantee that its supplied `record_id`, `visit_id`, or service
allocation will be persisted, and it does not guarantee that the visit becomes
paid.

The adapter does not currently read or own a separate canonical
visit/payment/document entity that could prove provider settlement semantics
independently of the appointment and transaction projections.

### Unsafe legacy paid predicate

The legacy helper accepts any of the following as paid:

- `paid_full`;
- positive `payment_status`;
- service `cost_to_pay` sum at or below zero.

Read-only production comparison disproves the third fallback as a canonical
proof: known-good paid visits still returned a non-zero `cost_to_pay`. The new
contract must not use `cost_to_pay` alone to assert paid state.

## A08 Read-Only Production Inspection

### Existing 2,000-ruble operation

The exact provider transaction reference was observed and retained only in
restricted operational evidence.

Observed transaction facts:

- amount: 2,000 RUB;
- income category: service income;
- client, staff, and cash-account references exist;
- appointment linkage: absent (`record_id = 0`);
- visit linkage: absent (`visit_id = 0`);
- service sale allocation: absent;
- transaction timestamp is after the target appointment time.

Observed target facts:

- target appointment exists and is not deleted;
- target visit reference exists;
- attendance is present;
- `paid_full = 0`;
- `payment_status = 0`;
- the service remains represented as unpaid in the inspected appointment read.

Verdict: the operation is an external financial side effect, but it is orphaned
from the target visit and does not prove payment.

### Known-good paid visits

Five existing paid visits were sampled read-only and without personal data.
Each sample had all of the following:

- `paid_full = 1`;
- `payment_status = 1`;
- one or more financial operations with a matching non-zero `record_id`;
- matching non-zero `visit_id`;
- `sold_item_type = service`;
- a service sale reference;
- a provider income category and cash-account reference.

Some known-good visits used more than one financial operation, so a canonical
contract must allow split payment allocations. A one-visit/one-transaction
assumption is invalid.

The comparison also showed that `cost_to_pay` is not a reliable canonical paid
signal in this provider read surface.

## Canonical Business Action

### Name

`settle_visit_payment.v1`

This name is intentionally business-oriented. It does not promise a particular
YClients endpoint and does not equate creating a transaction with settling the
visit.

If the product flow also needs to mark attendance, the initiator must compose
two separately authorised actions:

- A04: set appointment attendance;
- A08: settle visit payment.

Neither action may silently claim the result of the other.

### Preconditions

Before any future dispatch, the canonical executor must prove:

- the tenant and YClients integration are active and tenant-qualified;
- the appointment exists, is current, is not deleted, and resolves to the
  expected visit;
- the actor has the financial permission required by policy;
- any required approval remains valid;
- the selected payment method maps to a configured provider cash account;
- the amount and allocation are derived from the current provider visit state,
  not trusted from free-form user input;
- the expected appointment/visit state fingerprint still matches;
- no matching current or `UNKNOWN` ActionExecution exists;
- reconciliation has found no matching prior external operation that could be
  the same logical settlement.

### Normalized input

The minimum normalized contract is:

```text
tenantRef
provider = yclients
providerCompanyRef
appointmentRef
visitRef
settlementMode = full            # v1 scope
currency = RUB
expectedAmountMinor
paymentMethod
cashAccountRef
paymentAllocationHash
expectedVisitStateFingerprint
requestIdempotencyKeyHash
```

No client name, phone, raw CRM payload, cash-account secret, or free-form
comment belongs in the durable normalized input.

### Provider writes

The exact write sequence is **not yet approved**. The current combination of
appointment PUT plus generic transaction POST is not a proven provider
settlement workflow.

Before implementation, one of the following must be established from a
provider-supported contract or isolated non-production proof:

- an atomic visit-payment endpoint; or
- a documented sequence that creates the payment allocation, links it to the
  visit, and updates the visit paid state with a stable idempotency strategy.

No production write experimentation is permitted to discover this contract.

### Local mirror updates

The local mirror may store only safe execution facts and opaque provider
references. It must not mark a visit paid until the provider reread satisfies
the success proof below.

## Success Proof

`SUCCEEDED` is allowed only after an authoritative provider reread proves all of
the following:

1. the same tenant-qualified appointment and visit remain the targets;
2. the appointment is not deleted;
3. `paid_full = 1`;
4. `payment_status = 1` for the current YClients read contract;
5. at least one non-deleted service payment operation is linked to both the
   appointment and visit;
6. linked operations contain service allocation references;
7. linked allocations are consistent with the expected settlement, including
   valid split-payment cases;
8. there is no conflicting duplicate or unmatched financial operation for the
   same logical settlement.

`cost_to_pay`, attendance, HTTP 2xx, or a transaction provider ID alone are not
success proof.

If any required field disappears or changes semantics in a future provider API
version, the result is ambiguous and must not be upgraded to `SUCCEEDED` until
the adapter contract is revised.

## Action Engine Outcome Semantics

### Dispatch and UNKNOWN boundary

The uncertainty boundary begins before the first provider write. Any timeout,
connection loss, or local persistence failure after dispatch may have crossed
must become `UNKNOWN` and be reconciled before another dispatch.

A provider acknowledgement that only proves operation creation is not enough
for `finalizeSuccess`. The future A08 executor must perform the paid-visit proof
before success, or preserve the partial result as `UNKNOWN`.

### Partial external outcome

The required partial case is:

```text
financial operation created
AND (operation unlinked OR visit still unpaid)
```

It is represented by the existing state machine as:

- `ActionExecution.state = UNKNOWN`;
- attempt dispatch state `ACKNOWLEDGED` or `MAY_HAVE_CROSSED`;
- safe result flags that contain no PII or raw provider payload;
- `reconciliationState = REQUIRED`;
- after inconclusive reconciliation, `MANUAL_REQUIRED`.

It must not be represented as `SUCCEEDED`, `FAILED`, or automatically retried.
An explicit Prisma `PARTIAL` enum is not required because the durable UNKNOWN
state, safe result, and reconciliation lifecycle preserve the necessary safety
semantics.

### Safe partial result fields

```text
operationObserved: true/false/unknown
operationLinkedToAppointment: true/false/unknown
operationLinkedToVisit: true/false/unknown
visitPaidFull: true/false/unknown
visitPaymentStatus: paid/unpaid/unknown
allocationConsistent: true/false/unknown
providerReferenceHash: optional
manualReviewReasonCode: optional
```

## Idempotency Identity

The logical settlement identity must be deterministic and independent of
discovery time:

```text
tenant
+ provider/company
+ visitRef
+ actionClass(settle_visit_payment)
+ settlementMode/version
+ paymentMethod/cashAccountRef
+ paymentAllocationHash
+ expectedVisitStateFingerprint
```

Restart, client retry, or timeout must converge on the same ActionExecution.
An existing `UNKNOWN` execution or exact matching operation blocks another
dispatch. Only reconciliation that proves **not executed** may permit a new
attempt under the same logical execution and current approval/policy.

## Read-Only Reconciliation Contract

The reconciler reads the current appointment/visit state and all candidate
financial operations for the logical identity. It performs no repair.

| Reconciliation result | Required facts | Action Engine outcome |
|---|---|---|
| `VISIT_PAID_AND_OPERATION_LINKED` | Full success proof is satisfied | `PROVEN_SUCCEEDED` |
| `OPERATION_EXISTS_VISIT_UNPAID` | Matching operation exists, but linkage or paid state is absent | `STILL_UNKNOWN` then `MANUAL_REQUIRED`; no retry |
| `OPERATION_ABSENT_VISIT_UNPAID` | Complete authoritative reads prove no candidate operation and unpaid visit | `PROVEN_NOT_EXECUTED`; retry only under current policy/approval |
| `CONFLICTING_OR_AMBIGUOUS` | Duplicate/mismatched operations, paid state without linkage, amount/allocation conflict, or incomplete reads | `STILL_UNKNOWN` then `MANUAL_REQUIRED`; no retry |

An API read failure is not evidence that an operation is absent.

## Compensation

Official YClients product documentation describes cancelling a financial
operation and shows that doing so can change the visit to not fully paid. That
is a consequential financial business action, not a harmless rollback.

The current adapter has no verified provider API implementation or approved
authorization policy for compensation. It also cannot prove that deleting or
cancelling the A08 operation would restore all related provider state.

Therefore:

- automatic compensation is forbidden;
- linking the existing operation automatically is forbidden;
- owner/admin authorization would be required even after a provider contract
  is established;
- compensation safety is currently `UNKNOWN`.

## Existing A08 2,000-Ruble Operation

Recommendation: leave the operation unchanged and send it to manual
owner/admin review in YClients.

The review must decide whether the unlinked income operation is a legitimate
cashbox entry, must be linked through an official provider workflow, or must be
reversed through the provider's authorised financial process. Maya must not
make that decision or perform the correction automatically.

It is not safe to create a second operation, automatically attach the current
one, delete it, or compensate it from the current evidence.

## Required Follow-Up Before Implementation

A08 implementation may start only after the provider write contract is proven
without production financial experimentation. The follow-up must establish:

- the supported payment/visit write primitive or sequence;
- its idempotency behavior;
- split-payment and zero-price/discount semantics;
- the exact authoritative paid-state read contract;
- compensation permissions and provider behavior;
- a specialised executor that does not call generic `finalizeSuccess` before
  the business success proof;
- adversarial tests for partial acknowledgement, timeout, restart, duplicate
  input, conflicting operations, tenant isolation, and manual reconciliation.

No database migration is required for these semantics. Application code will
be required later, but none was changed by this gate.

## Gate Verdict

`CANONICAL PAID-VISIT SEMANTICS KNOWN: YES`

`CREATE FINANCIAL OPERATION == PAID VISIT: NO`

`SUCCESS PROOF DEFINED: YES`

`PARTIAL EXTERNAL OUTCOME REPRESENTABLE: YES`

`RECONCILIATION CONTRACT DEFINED: YES`

`COMPENSATION SAFE: UNKNOWN`

`A08 EXISTING 2000 RUB OPERATION REQUIRES MANUAL REVIEW: YES`

`SCHEMA CHANGE REQUIRED: NO`

`A08 IMPLEMENTATION SAFE TO START: NO`

STOP. No production writes were performed. Package 2 was not started.
