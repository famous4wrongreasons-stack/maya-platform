# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CONSUME LOYALTY REDEMPTION GRANT SHADOW REPORT

Status: eighth and final canonical Shadow slice complete; executable cutover not started
Source checkpoint: `fc98262b`
Report date: 2026-08-30

## Scope And Boundary

The eighth and final Gate-ordered P4-03 action class is
`consume_loyalty_redemption_grant`. The Python/SQLite/YClients path remains the
actual execution owner. This step adds one isolated, feature-gated observation
path:

`authenticated Telegram/panel cashier candidate -> PII-minimized legacy
bridge -> exact tenant/requester/grant/account resolution -> server-owned
authority and cap -> Canonical Action Ingress -> SHADOW_ONLY
ActionExecution/plan -> stop before redemption, ledger, balance, grant, or
provider mutation`.

The isolated adapter is not imported by `bot.py`, `webhook_server.py`,
`loyalty.py`, or another production entrypoint and was not deployed or enabled
in production. The seven completed P4-03 Shadow implementations and P4-02 were
not modified.

## Canonical Identity, Authority, And Decision

- Provider/company configuration resolves the exact tenant. The raw bearer is
  normalized and HMACed with a required server secret only to find one exact
  tenant-qualified `LoyaltyRedemptionGrant`. Raw bearer and persisted
  `codeHash` are absent from ActionExecution target, input, and evidence.
- The grant is authority for immutable Client, service target, points,
  issuance/expiry, issue binding, and one-time redemption state. It must have a
  succeeded `issue_loyalty_redemption_grant` execution binding, an active,
  unmerged canonical subject, and a valid tenant-qualified account. A bridge
  cannot supply or replace any of those facts.
- Requester provider id resolves through tenant-qualified `AuthIdentity` to one
  active User/Membership. Tenant/business owners and tenant administrators are
  accepted by server role policy. Other eligible staff roles require the exact
  canonical User id in a bounded server-owned cashier allowlist. Telegram/panel
  labels, legacy `can_redeem`, bearer possession, bridge secret, or a supplied
  role/approval cannot authorize consumption.
- The exact requester User is supplied to Canonical Action Ingress as actor, so
  feature entitlement, active tenant/membership/user, role, policy, and L2.5
  attestation remain server-derived.
- Server grant points, current canonical balance, unexpired state,
  no-existing-redemption state, and required per-redemption cap derive the
  `consume`/`do_not_consume` plan. Legacy points/balance/used/expired values are
  comparison evidence only.

The logical claim is contract/policy version + tenant + immutable grant id.
Telegram and panel labels, bearer spelling, and caller request labels are
excluded. The same grant and requester therefore converge across routes and
restarts. A changed requester or grant fact under the same one-time claim
changes normalized evidence but not the claim, causing collision/fail-closed
handling instead of a second consume execution.

## Durable Result And One-Time Semantics

The intended future local result is one atomic transaction containing:

1. one append-only tenant-qualified `LoyaltyRedemption` bound to the consume
   `ActionExecution`;
2. one bound negative `LoyaltyTransaction` for the exact grant points; and
3. the matching resulting `LoyaltyAccount.balance`.

Unique `(grantId, tenantId)` prevents a second redemption through another
execution. Unique `(actionExecutionId, tenantId)` prevents one consume
execution from claiming multiple grants. Tenant-qualified FKs and immutable
bindings reject cross-tenant, clear, replace, or transfer attempts. An exact
existing bound redemption produces a no-mutation plan; unbound, changed, or
contradictory prior evidence fails closed.

Shadow only describes this result with `writesPerformed = false`. It creates
no redemption, ledger row, balance update, grant update, provider attempt, or
external write.

## Provider, UNKNOWN, And Reconciliation Boundary

The local one-time claim/debit is the business result. The optional YClients
record marker is a later external attempt within the same logical consume
execution; it cannot prove the local claim. Shadow performs no provider read or
write and records `providerProjectionDecision = not_evaluated_in_shadow`.

There is no mutation `UNKNOWN` in Shadow. Future local acknowledgement loss is
`UNKNOWN` until the exact redemption, execution binding, negative ledger row,
and resulting balance prove success or a proven rollback proves
non-execution. Contradictory bindings prove failure; incomplete evidence stays
`UNKNOWN`. A timeout after future provider dispatch is provider `UNKNOWN` and
must reconcile by reading the exact record/marker. Inconclusive evidence never
permits blind redispatch.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action converges | PASS — Telegram and panel produce the same occurrence scope, caller claim, target, normalized request, and action identity fixture |
| Tenant isolation | PASS — bridge binding, AuthIdentity, membership, grant, issue execution, client, account, redemption, and execution request are tenant-qualified |
| Server-derived requester authority | PASS — active canonical actor plus administrative role or exact server cashier allowlist is required; actor is bound into Canonical Ingress |
| Forged authority rejected | PASS — strict contract rejects tenant, entitlement, approval, autonomy, policy, executor, binding/hash, bearer, code-hash, role, or cap authority in ActionExecution input |
| Bearer secrecy | PASS — only transient server HMAC lookup receives the bearer; neither bearer nor stored code hash reaches ActionExecution target/input/evidence |
| L2.5 is non-executable | PASS — capability is `SHADOW_ONLY`, executor `shadow.none`, one non-dispatch attempt, and runtime exposes only `planShadow` |
| Restart/route preserves identity | PASS — logical identity contains stable tenant/grant/policy facts and excludes route/request labels and bearer spelling |
| Plan matches intended mutation | PASS — exact grant/service/points produce one intended redemption, bound debit `-1200`, and resulting-balance requirement, all with `writesPerformed = false` |
| Expired/cap/balance denial | PASS — canonical expiry, insufficient balance, or server cap produces `do_not_consume` with no intended mutation |
| One-time claim/reuse protection | PASS — exact prior claim produces no mutation; contradictory/unbound claim fails closed; changed requester keeps the same claim and changes bound evidence |
| Legacy values are non-authoritative | PASS — points/balance/used/expired mismatch creates divergences while canonical facts continue to control the plan |
| New-path side effects | PASS — no redemption/grant/account/ledger write, legacy mutator, provider read/write, external dispatch, or identity-registration write is reachable |

The exact accepted fixture produced zero divergences. Separate fixtures proved
requester mapping failure, non-allowlisted staff denial, allowlisted cashier,
wrong issue binding, expiry, insufficient balance, cap denial, exact prior
redemption, contradictory prior claim, changed requester, and all legacy value
assertion mismatches without a value or provider write. The zero is a targeted
contract result, not a production population comparison.

## Verification

- Targeted Jest: `3` suites, `17` tests — PASS.
- Isolated Python bridge: `2` tests — PASS.
- Targeted ESLint for the changed TypeScript surface — PASS.
- Targeted Prettier formatting/check — PASS.
- `git diff --check` — PASS.
- Full suite — not run, per low-load/targeted-only boundary.
- Production deployment/activation — not performed.
- Real balance, ledger, grant, redemption, code/hash, identity, or provider
  mutation — not performed.

## Verdict

`P4-03 SHADOW ACTION CLASS: consume_loyalty_redemption_grant`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 8/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`RAW BEARER OR CODE HASH STORED IN ACTIONEXECUTION: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT P4-03 ACTION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. All eight P4-03 action classes now have isolated canonical Shadow proof;
every executable cutover and any subsequent Package 4 family remain outside
this checkpoint.
