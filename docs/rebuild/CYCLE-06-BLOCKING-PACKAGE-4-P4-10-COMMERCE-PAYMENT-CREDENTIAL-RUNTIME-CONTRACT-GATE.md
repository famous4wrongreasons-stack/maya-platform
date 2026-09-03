# CYCLE 06 BLOCKING PACKAGE 4 — P4-10 COMMERCE PAYMENT-CREDENTIAL RUNTIME CONTRACT GATE

Status: **COMPLETE — SAFE LOCAL CONVERGENCE AUTHORIZED**

Source checkpoint: `b055b71b`

Gate date: 2026-09-03

## 1. Actual A32 Surface

The post-P4-09 remainder and current production-reachable code agree on one
remaining Package 4 owner group: the authenticated commerce integration HTTP
controller calls `CommerceIntegrationService` directly. The service verifies
YooKassa credentials with `GET /payments?limit=1`, then writes
`CommerceIntegration` through `upsert`, `update`, or `delete`.

The three HTTP methods expose four business transitions. The current `PUT`
conflates initial connection and replacement, but those transitions do not
share the same precondition or logical identity. P4-10 therefore contains
exactly:

1. `connect_commerce_payment_credentials` — absent -> verified current
   credential authority;
2. `replace_commerce_payment_credentials` — an existing exact authority -> a
   different verified current authority;
3. `recheck_commerce_payment_credentials` — read-only provider verification of
   the stored authority -> a current verification observation;
4. `disconnect_commerce_payment_credentials` — existing authority -> absent.

There is `1` production bypass group and `4` concrete direct-mutation
subgroups: initial connect, replacement, recheck-state update, and disconnect.
No Python, scheduler, webhook, provider-payment, Client, or branch execution
owner was found for A32.

## 2. Canonical Identities And Authority

The business target is tenant-wide and provider-qualified:

`tenant + provider(yookassa) + immutable CommerceIntegration id`.

Client and branch identities are not applicable and must not be invented.
`tenantId` comes from authenticated tenant context. The actor must resolve to
one active same-tenant membership with the exact roles already enforced by the
production controller: tenant owner, business owner, tenant administrator, or
administrator. The current endpoint has no commerce-feature entitlement lock,
so the Gate does not invent one. A32 adds no caller-supplied authority and no
new secondary approval rule.

Every mutation is limited to one tenant, one provider, and one credential
authority. Bulk or scheduled credential mutation is forbidden. These are
structural blast-radius limits; A32 has no monetary amount or customer-value
cap to invent.

## 3. Secrets, Evidence, And Durable Bindings

Raw `shopId` and `secretKey` are transient credential presentation. Only the
existing encrypted columns may retain them. ActionExecution input, target,
evidence, audit, result, and logs carry server-derived HMAC/blind fingerprints,
never raw credentials or reversible credential ciphertext.

`CommerceIntegration` remains the current business authority. The generic
tenant-qualified ActionExecution and ActionAttempt rows provide the durable
operation identity, state, execution attempt, policy evidence, and audit
history. Destructive disconnect is bound by its immutable target and
credential-state fingerprint even after the current row is deleted. This is
the explicitly approved Package 4 schema design; a credential history table or
new FK is not required.

The caller/source occurrence must have a stable, bounded, server-derived
idempotency identity. Initial connect and replacement share the same future
`PUT` transport, so the cutover adapter must resume an existing execution for
the same idempotency key before re-classifying current database state. Raw
credentials may be safely re-presented after restart, but are never recovered
from ActionExecution.

## 4. Transition, Retry, And Concurrency Contract

- connect requires no current integration;
- replace/recheck/disconnect require one exact current integration;
- each plan freezes the current credential-state fingerprint;
- execution uses a tenant-scoped PostgreSQL advisory lock, locks the exact
  ActionExecution, and re-checks the frozen state under a serializable
  transaction;
- provider verification happens before the transaction and is read-only;
- accepted connect/replace and all local recheck/disconnect state facts commit
  atomically with ActionAttempt, ActionExecution, and audit outcome;
- a crash before the transaction creates no credential mutation; a crash in
  the transaction rolls back all local facts;
- retry/restart of the same logical request restores the committed result;
- competing stale operations fail closed rather than overwriting the winner.

Replacement does not change the immutable CommerceIntegration identity.
ActionExecution/audit preserves the old blind fingerprint without preserving
raw authority. Disconnect is a one-time destructive transition; a repeated
request resumes its already committed execution rather than treating absence
as permission for another mutation.

## 5. Provider Outcome Boundary

The only provider operation in A32 is a read-only YooKassa credential check.
It cannot create a checkout, payment, refund, or other provider value.
Consequently:

- payment `PENDING` is not an A32 state;
- read acceptance/rejection/unavailability are known observations;
- a timeout or connection loss does not imply a remotely committed value
  mutation and may not be represented as payment-style `UNKNOWN`;
- the attempt may honestly record that the read request may have crossed, but
  it does not require value reconciliation because the operation is
  side-effect-free;
- local mutation outcome is PostgreSQL commit/rollback truth;
- payment reconciliation and blind-payment redispatch do not apply;
- provider writes are always zero.

Connect/replace mutate nothing unless verification is accepted. Recheck may
record accepted, rejected, or unavailable observation against the same stored
authority. Disconnect performs no provider call. A new source occurrence may
request another safe read-only verification; it is not a blind retry of a
provider mutation.

## 6. Schema And Safe-Cycle Decision

Current `CommerceIntegration` plus ActionExecution/ActionAttempt and audit can
represent all required durable facts. The existing tenant uniqueness enforces
one current credential authority; encrypted columns retain only the current
credentials; generic action records retain exact non-secret operation history.

No schema, migration, new provider contract, business-semantic choice, or
unapproved cap/approval is required. Canonical Shadow 4/4 and a disposable
PostgreSQL executable proof may continue. Production wiring and production
credential mutations remain outside this Gate.

## 7. Verdict

`P4-10 RUNTIME CONTRACT GATE COMPLETE: YES`

`P4-10 EXACT ACTION CLASSES: 4 / connect_commerce_payment_credentials, replace_commerce_payment_credentials, recheck_commerce_payment_credentials, disconnect_commerce_payment_credentials`

`P4-10 PRODUCTION BYPASS GROUPS: 1`

`P4-10 DIRECT-MUTATION SUBGROUPS: 4`

`CURRENT PRODUCTION EXECUTION OWNER: CommerceIntegrationService`

`CANONICAL SCHEMA SUFFICIENT: YES`

`ADDITIONAL SCHEMA REQUIRED: NO`

`PENDING APPLICABLE: NO`

`UNKNOWN/RECONCILIATION: NOT REQUIRED — PROVIDER BOUNDARY IS READ-ONLY`

`TENANT/PROVIDER BLAST-RADIUS: ONE/ONE`

`P4-10 SHADOW CAN START: YES`

`PRODUCTION CREDENTIAL/VALUE MUTATIONS: 0`

`PROVIDER WRITES: 0`

`P4-02–P4-09 REOPENED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`
