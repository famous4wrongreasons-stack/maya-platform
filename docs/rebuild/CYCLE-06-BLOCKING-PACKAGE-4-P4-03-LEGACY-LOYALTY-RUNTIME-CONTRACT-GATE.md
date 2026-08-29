# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 LEGACY LOYALTY RUNTIME CONTRACT GATE

Status: pre-implementation contract gate; awaiting acceptance
Source checkpoint: `75668ff0`
Report date: 2026-08-29

## 1. Runtime Pre-checkpoint

The exact next runtime family after completed P4-02 is:

**`P4-03 / A20-L — Legacy loyalty value and one-time redemption convergence`.**

P4-01/A08 remains physically disabled. P4-02/A19 is production-complete and
is not reopened or modified by this gate. P4-04 referral, later Package 4
families, Package 5, and Chapter 7 are not started.

| Pre-checkpoint item | Finding |
|---|---|
| Action family | `P4-03 / A20-L` |
| Current execution owners | Python `loyalty.py` business functions plus direct `database.py` SQLite writes; bot scheduler/admin handlers, webhook/PWA handlers, and `claude_ai.py` call those owners directly; selected redemption paths also call YClients directly |
| Gate-level production bypass groups | `1` — the P4-03 family remains wholly outside Action Engine |
| Concrete direct-mutation subgroups | `8` — visit earn, expiry, booking redemption/reservation, cancellation refund, YClients balance import, welcome backfill, redemption-grant issue, redemption-grant consume |
| Durable representation ready | `ActionExecution`, `ActionAttempt`, `LoyaltyAccount`, execution-bound `LoyaltyTransaction`, `LoyaltyRedemptionGrant`, and `LoyaltyRedemption` |
| Shadow required | YES — value, bulk scheduler, one-time grant, and provider-adjacent paths must be compared without execution before cutover |
| Additional schema gate required now | NO — the approved foundation represents the outcomes for canonically mapped identities |
| Additional contract gate required | YES — exact identity, action decomposition, idempotency, authority, provider boundary, and cutover semantics are not yet canonical |

No runtime migration is safe before this contract is accepted. A single broad
`legacy_loyalty` capability would erase materially different authority,
idempotency, approval, and reconciliation rules.

## 2. Exact Action Classes Within P4-03

The approved Gate names earn, expire, redeem, refund, backfill, and one-time
code consumption. Current source inspection also finds a distinct one-time
YClients balance import and code issuance. They are value operations, not
implementation details, and must not piggyback on another execution identity.

| Action class | Current entrypoints | Canonical durable outcome |
|---|---|---|
| `earn_legacy_loyalty` | daily/manual loyalty job | one execution per tenant + provider visit + client; one or more bound positive ledger rows |
| `expire_legacy_loyalty` | daily/manual loyalty job | one execution per tenant + client + expiry-policy window; exact bound negative ledger result |
| `redeem_legacy_loyalty` | PWA/Telegram booking flows; reservation/finalization helpers | one logical redemption execution; every reservation/debit/release row bound to it; optional provider projection handled as an attempt |
| `refund_legacy_loyalty` | booking-cancellation webhook/bot handler | one execution per original redemption/cancel evidence; bound compensating ledger row |
| `import_legacy_loyalty_balance` | lazy first-access YClients card import | one execution per tenant + canonical client + provider card + import contract version; exact delta row |
| `backfill_legacy_loyalty` | lazy access and admin batch job | one execution per canonical client + approved program/policy version; capped bound grant row |
| `issue_loyalty_redemption_grant` | client Telegram/PWA code generation | one issue execution -> one immutable `LoyaltyRedemptionGrant`; only a code hash persists |
| `consume_loyalty_redemption_grant` | authenticated cashier/admin Telegram or panel confirmation | one consume execution -> one append-only `LoyaltyRedemption`; one grant can be claimed once; exact ledger debit is bound to the same execution |

`redeem_hold`, finalization, and release are states/results of
`redeem_legacy_loyalty`, not extra caller-selectable capabilities. The legacy
practice of deleting stale negative hold rows is not an acceptable canonical
audit contract: a released reservation must remain explainable through the
execution and bound ledger result/compensation.

## 3. Current Owners And Bypass Evidence

The accepted Package 4 Gate already classifies P4-03 as a production-reachable
Action Engine bypass. Current source confirms the following paths:

- `bot.py` runs the daily loyalty scheduler and an admin-triggered equivalent,
  issues and consumes codes, performs lazy backfill, applies booking
  redemption, and applies cancellation refunds;
- `webhook_server.py` applies cancellation refunds, consumes codes, performs
  lazy import/backfill, creates/deletes temporary point reservations, and
  finalizes booking redemption;
- `claude_ai.py` can trigger lazy import/backfill;
- `loyalty.py` calculates value and directly calls the database functions;
- `database.py` writes `loyalty_transactions` and
  `loyalty_redeem_codes` in the process-local `barbershop.db` without tenant
  columns or an `ActionExecution` binding;
- booking redemption and code consumption may call YClients record mutation
  directly after the local value write.

Bot, webhook, scheduler, PWA, and legacy AI may remain initiators only after
they submit a canonical request. Python database functions and the YClients
client may not remain independent execution owners or fallbacks.

The bypass count is therefore:

- Gate-level P4-03 bypass groups: **1**;
- concrete mutation subgroups inside that group: **8**;
- production-reachable canonical P4-03 action classes today: **0**;
- production-reachable direct P4-03 bypass groups today: **1**.

## 4. Durable Models Already Prepared

No new generic value workflow is required.

### Ledger outcomes

`LoyaltyTransaction` already has:

- a nullable tenant-qualified FK to `ActionExecution`;
- immutable established execution binding;
- existing unique `(tenantId, idempotencyKey)` domain claim;
- non-unique `(tenantId, actionExecutionId)` lookup, allowing one execution to
  produce several ledger rows;
- `externalRef` for a deterministic legacy/provider correlation.

`LoyaltyAccount` supplies the transactional resulting balance. The ledger
write, execution binding, and resulting balance must commit atomically, using
the same proven boundary as P4-02 without modifying the P4-02 capability.

### One-time grants

`LoyaltyRedemptionGrant` and `LoyaltyRedemption` already provide:

- tenant-qualified canonical client identity;
- immutable points, service target, issuance, and expiry;
- code hash rather than a raw bearer secret;
- 1:1 issue-execution binding;
- a unique grant claim and 1:1 consume-execution binding;
- DB rejection of a second redemption, cross-tenant binding, or replacement
  of established execution identity.

### Generic lifecycle

`ActionExecution`/`ActionAttempt` already represent canonical identity,
server-derived policy/approval attestation, DB claim, dispatch certainty,
provider request identity, `UNKNOWN`, reconciliation, and restart recovery.

The foundation is sufficient only when a legacy row is resolved to an exact
canonical tenant and subject. A phone, Telegram id, process location, bot
token, local integer `client_id`, or the singleton SQLite filename is not
identity authority.

## 5. Identity And Authority Contract

Before even Shadow submits a candidate, the server must resolve:

1. exact `tenantId` from authoritative deployment/integration configuration;
2. exact canonical `Client` through a tenant-qualified provider link or other
   already-approved identity relation;
3. exact `User`/membership only where the ledger account contract requires it;
4. requester or trusted service principal from authenticated server context;
5. provider, branch, visit/card/code references from server evidence;
6. entitlement, role, autonomy, policy, approval, caps, and executor through
   Canonical Action Ingress.

Unmapped or ambiguous legacy identities fail closed. They must be counted in a
read-only inventory and quarantined for explicit correlation; they must not be
silently joined by phone or assigned an invented user/execution. If active
value-bearing rows cannot be represented after authoritative correlation, an
amended Schema/Identity Gate is required before implementation. This gate does
not add schema preemptively.

Initiator-supplied `tenantId`, `clientId`, `entitled`, `approved`, autonomy,
policy decision, executor, amount, points, cap, binding/hash, provider result,
or raw legacy database provenance is never authority.

## 6. Idempotency And DB Claim Contract

Each logical value mutation gets one deterministic server-derived identity:

| Action | Required claim identity |
|---|---|
| Earn | tenant + provider + visit id + canonical client + `earn` contract version |
| Expire | tenant + canonical client + expiry policy version + evaluation window |
| Booking redeem | tenant + canonical client + provider record + service + redemption request identity |
| Refund | tenant + original redemption identity + proven cancellation evidence |
| YClients import | tenant + canonical client + provider/card identity + import contract version |
| Backfill | tenant + canonical client + approved launch/policy version |
| Grant issue | canonical caller idempotency + client + service/value/policy hash |
| Grant consume | immutable grant id + exact consuming execution |

The normalized payload hash must bind the target, direction, points, service,
provider/visit evidence, policy version, and relevant subject. Reusing a key
with changed facts fails closed.

Scheduler fan-out creates one execution per logical client/visit/grant
mutation. A batch job is an initiator and blast-radius envelope, not one
execution that hides many independently retryable value outcomes.

## 7. UNKNOWN And Reconciliation

Local PostgreSQL outcome ambiguity is reconciled from the execution-bound
ledger/grant/claim row:

- exact bound result and normalized facts -> `PROVEN_SUCCEEDED`;
- no result after a proven rolled-back/non-dispatched attempt ->
  `PROVEN_NOT_EXECUTED`;
- a contradictory row or another execution binding -> `PROVEN_FAILED`;
- unavailable or incomplete evidence -> remain `UNKNOWN`.

Provider reads used to calculate earn/import/backfill are evidence reads. A
timeout or malformed response means there is no authoritative input and no
value mutation may be created.

The YClients record update after redemption is a real external attempt. A
timeout after dispatch is `UNKNOWN`, never `FAILED`. Reconciliation may read
the exact provider record and compare service cost/comment/evidence. If the
provider cannot prove whether the update occurred, automatic redispatch is
forbidden and manual resolution is required.

The loyalty redemption action must not own appointment creation. An associated
booking must come from the already canonical appointment capability and be
proven successful before final redemption. If appointment creation is
`UNKNOWN`, loyalty finalization cannot guess that the booking failed; any
reservation remains durably explainable until reconciliation or explicit
release.

## 8. Risk, Approval, And Blast Radius

All P4-03 actions carry `customer_value` and `financial_equivalent` risk.
Scheduled earn/expire/backfill also carry `bulk` risk; redemption paths may
carry `external_crm` risk.

- earn and cancellation refund may be automatic only from exact provider and
  prior-ledger evidence under server caps;
- expiry is destructive and remains Shadow-only until a versioned expiry
  policy, evaluation window, per-client cap, per-run cap, and approval rule are
  accepted;
- import and backfill grant value and require hard per-client/per-run caps;
  batch backfill requires exact tenant-owner approval unless a separately
  approved, versioned migration policy proves an equivalent boundary;
- grant issue requires an authenticated eligible client or authorized staff
  decision; generating/possessing a code alone grants no execution authority;
- grant consumption requires server-resolved cashier/admin authority and the
  exact unexpired grant binding; the bearer secret alone is insufficient;
- L2.5 may compute policy and normalized facts but can never create a grant,
  ledger row, reservation, redemption claim, provider attempt, or external
  permission.

Every scheduler run must have server-derived per-action and aggregate caps. A
cap supplied by Python, HTTP, AI, or a client is evidence at most, never policy.

## 9. Mandatory Shadow Boundary

Shadow is required before any P4-03 cutover. It must:

- create only `SHADOW_ONLY` / `L2_5_SHADOW` executions with
  `externalSideEffects = 0`;
- compare exact tenant/client, provider evidence, points, target, operation,
  idempotency identity, eligibility, and expected durable result;
- generate no raw code and persist no grant/code hash solely for proof;
- write no loyalty account, ledger, redemption grant/claim, legacy SQLite, or
  YClients state;
- never call the current mutator and never serve as a legacy fallback;
- measure identity mapping gaps and decision equivalence without exposing PII.

Because the eight action classes have different contracts, a green earn
Shadow is not proof for expiry, redeem, refund, import, backfill, issue, or
consume.

## 10. Gate Decision And Next Boundary

The existing schema foundation remains sufficient for canonically correlated
identities; no migration is authorized by this gate. The blocking gap is the
runtime contract and legacy/canonical authority boundary.

After explicit acceptance of this Gate, the only next safe implementation
step is a non-executable Shadow for the first Gate-ordered action slice,
`earn_legacy_loyalty`, with fixture/structural verification only. It must not
wire the production scheduler, write either database, call a provider mutator,
or start another P4-03 action class.

`NEXT PACKAGE 4 RUNTIME FAMILY: P4-03 / A20-L LEGACY LOYALTY VALUE AND ONE-TIME REDEMPTION CONVERGENCE`

`P4-03 ACTION CLASSES: 8`

`P4-03 GATE-LEVEL PRODUCTION BYPASS GROUPS: 1`

`P4-03 CONCRETE DIRECT-MUTATION SUBGROUPS: 8`

`P4-03 CANONICAL PRODUCTION ACTION CLASSES: 0`

`P4-03 SHADOW REQUIRED: YES`

`ADDITIONAL SCHEMA GATE REQUIRED NOW: NO`

`RUNTIME CONTRACT GATE REQUIRED: YES`

`RUNTIME CONTRACT GATE PREPARED: YES`

`P4-03 RUNTIME IMPLEMENTATION STARTED: NO`

`REAL MONETARY/VALUE MUTATIONS: 0`

`A08 PAYMENT WRITE: DISABLED`

`P4-02 MODIFIED: NO`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. Await explicit acceptance of this contract gate before any P4-03 code
change.
