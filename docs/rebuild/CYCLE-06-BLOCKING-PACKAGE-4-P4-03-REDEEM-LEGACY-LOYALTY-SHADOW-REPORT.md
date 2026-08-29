# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 REDEEM LEGACY LOYALTY SHADOW REPORT

Status: third canonical Shadow slice complete; executable cutover not started
Source checkpoint: `f538aa60`
Report date: 2026-08-30

## Scope And Boundary

The third Gate-ordered P4-03 action class is `redeem_legacy_loyalty`. The
legacy Python/SQLite/YClients path remains the actual value execution owner.
This step adds one isolated, feature-gated observation path:

`exact legacy candidate -> PII-free bridge contract -> Canonical Action
Ingress -> server-derived policy/entitlement -> SHADOW_ONLY ActionExecution ->
stop before reservation, debit, ledger, grant/redemption, or provider write`.

The production PWA, Telegram, chat, and booking entrypoints are unchanged. The
isolated adapter is not imported by `loyalty.py`, `bot.py`, or
`webhook_server.py`; Shadow was not deployed or enabled in production. The
completed earn/expire Shadow slices and P4-02 were not modified.

## Canonical Decision

- Exact provider/company binding resolves one tenant. Exact external provider
  client id then resolves through tenant-qualified `CrmClientLink` to the
  canonical Client/User and `LoyaltyAccount`. Phone and local SQLite client id
  are not accepted.
- A redemption plan requires a tenant-qualified, successful
  `crm.appointment.create.v1` ActionExecution. Its durable safe result must name
  the exact provider record and include the exact provider service.
- The tenant-qualified Appointment mirror must independently resolve the same
  provider record to the same canonical Client and include the same service.
  A caller assertion that booking succeeded cannot replace either proof.
- The point value and per-action cap are loaded from the server-owned service
  policy. `legacy_claimed_points` is comparison evidence only; a mismatch is
  recorded without allowing Python to set the canonical debit.
- Current balance is read server-side. Insufficient balance or cap failure
  produces a non-mutation comparison plan. Missing identity, appointment
  proof, mirror match, service mapping, or policy configuration produces no
  ActionExecution at all.
- The exact future intent is a negative `LoyaltyTransaction` and resulting
  `LoyaltyAccount.balance`. Hold, finalization, and explicit release/
  compensation are states/results under one logical execution with 1:N bound
  ledger rows, not separate caller-selectable actions.
- The future YClients price/comment projection is explicitly deferred to a
  separate ActionAttempt. Shadow performs no provider read or write.

The logical identity binds contract version, resolved tenant/client,
successful appointment execution, provider record identity, provider service,
opaque redemption-request occurrence, and the fixed policy version. A restart
with the same facts converges to the same ActionExecution. Reusing the request
occurrence with changed canonical facts cannot silently address the old
logical mutation.

The capability is restricted to `legacy_bridge`, `SHADOW_ONLY`,
`L2_5_SHADOW`, executor `shadow.none`, one non-dispatch attempt, no retry, and
no reconciliation dispatch. Approval is `NONE` only because external
execution permission is zero. Future executable redemption still requires
exact authenticated request evidence and the already accepted atomic
execution-bound ledger/balance contract.

## UNKNOWN And Reconciliation Boundary

Shadow has no dispatch and therefore no value/provider `UNKNOWN`. A future
lost acknowledgement around the local atomic commit must be reconciled from
the exact execution-bound ledger rows and resulting account balance. A future
timeout after the YClients projection dispatch is `UNKNOWN`, never `FAILED`;
reconciliation reads the exact provider record and automatic redispatch is
forbidden while the evidence remains inconclusive.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action converges | PASS — exact repeats produce the same normalized request, occurrence scope, caller key, and action id fixture |
| Tenant isolation | PASS — integration resolves tenant server-side; client, appointment execution, mirror, and account reads are tenant-qualified |
| Forged authority rejected | PASS — DTO and strict normalizer reject tenant/client/amount/entitlement/approval/autonomy/policy/executor/binding injection |
| L2.5 is non-executable | PASS — capability is `SHADOW_ONLY`, executor `shadow.none`, and runtime operation is only `planShadow` |
| Restart preserves identity | PASS — identity contains only stable canonical action/request/policy facts |
| Shadow plan matches intended mutation | PASS — balance `500` and server policy `300` yield planned delta `-300` and resulting balance `200` |
| Incomplete evidence fails closed | PASS — missing canonical create execution, wrong client/mirror, missing service, or unresolved policy creates no ActionExecution |
| New-path side effects | PASS — no loyalty/domain executor, ledger/balance/grant write, legacy mutator, provider client, or external dispatch is reachable |

The exact accepted fixture produced zero divergences. Separate fixtures proved
legacy quote mismatch and insufficient canonical balance without any value or
provider effect. The zero is a targeted contract result, not a production
population equivalence claim.

## Verification

- Targeted Jest: `4` suites, `29` tests — PASS.
- Isolated Python bridge: `2` tests — PASS.
- Targeted ESLint for changed TypeScript surface — PASS.
- Targeted Prettier check — PASS.
- `git diff --check` — PASS.
- Full suite — not run, per low-load/targeted-only boundary.
- Production deployment/activation — not performed.
- Real loyalty balance, ledger, grant/redemption, or provider action — not
  performed.

## Verdict

`P4-03 SHADOW ACTION CLASS: redeem_legacy_loyalty`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 3/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT P4-03 ACTION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The fourth P4-03 action class and every executable cutover remain outside
this checkpoint.
