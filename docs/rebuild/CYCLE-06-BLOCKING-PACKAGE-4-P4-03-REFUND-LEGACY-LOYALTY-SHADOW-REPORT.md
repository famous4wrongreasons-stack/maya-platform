# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 REFUND LEGACY LOYALTY SHADOW REPORT

Status: fourth canonical Shadow slice complete; executable cutover not started
Source checkpoint: `202ec835`
Report date: 2026-08-30

## Scope And Boundary

The fourth Gate-ordered P4-03 action class is `refund_legacy_loyalty`. The
legacy Python/SQLite path remains the actual value execution owner. This step
adds one isolated, feature-gated observation path:

`exact legacy candidate -> PII-free bridge contract -> Canonical Action
Ingress -> server-derived policy/entitlement -> SHADOW_ONLY ActionExecution ->
stop before positive ledger row or balance mutation`.

The production webhook, Telegram cancellation, and refund entrypoints are
unchanged. The isolated adapter is not imported by `loyalty.py`, `bot.py`, or
`webhook_server.py`; Shadow was not deployed or enabled in production. The
completed earn, expire, and redeem Shadow slices and P4-02 were not modified.

## Canonical Decision

- Exact provider/company binding resolves one tenant. Exact external provider
  client id then resolves through tenant-qualified `CrmClientLink` to the
  canonical Client/User and `LoyaltyAccount`. Phone and local SQLite client id
  are not accepted.
- The provider record must resolve to a tenant-qualified Appointment owned by
  the same canonical Client.
- The claimed original redemption execution must belong to the same tenant,
  have action class `redeem_legacy_loyalty`, and have either a successful
  outcome or an `UNKNOWN` external projection outcome with exact local ledger
  proof.
- Every original `redeem` ledger row under that execution must belong to the
  same LoyaltyAccount, be negative, and carry the server-derived provider
  record correlation. Missing, positive, cross-account, cross-record, or more
  than the bounded 1:N set fails closed without an ActionExecution.
- Cancellation is accepted only from a successful canonical
  `cancel_appointment` execution whose safe result proves the exact record is
  canceled, or from the exact canonical `appointment.removed` DomainEvent for
  the Appointment/provider record.
- Both cancellation evidence routes normalize to the same canonical removal
  fact. They therefore produce the same refund request and cannot authorize
  two compensations for one original redemption.
- The refund amount is the server-derived aggregate of the immutable original
  debit rows. `legacy_claimed_refund_points` is comparison evidence only. The
  per-action cap is server configuration, never an initiator decision.
- An existing exact canonical refund correlation produces a no-mutation plan;
  contradictory existing compensation evidence fails closed.

The future durable intent is one positive `LoyaltyTransaction` bound to the
refund ActionExecution and correlated to the original redemption. Its ledger
row and resulting `LoyaltyAccount.balance` must commit atomically. Multiple
original debit rows are one original redemption result and become one
aggregate compensating intent, not multiple caller-selectable refunds.

The logical identity binds contract version, resolved tenant, original
redemption execution, canonical Appointment/provider record removal fact, and
the fixed refund policy. Repeating after restart produces the same normalized
request. The capability is restricted to `legacy_bridge`, `SHADOW_ONLY`,
`L2_5_SHADOW`, executor `shadow.none`, one non-dispatch attempt, no retry, and
no reconciliation dispatch. Approval is `NONE` only because external
execution permission is zero. Future automatic refund remains restricted to
exact original-ledger plus cancellation evidence under server caps.

## UNKNOWN And Reconciliation Boundary

Shadow has no dispatch and therefore no value/provider `UNKNOWN`. An original
redemption may remain `UNKNOWN` about its separate YClients projection; the
refund plan does not guess that projection result and relies only on exact
execution-bound local debit evidence. A future lost acknowledgement around the
atomic refund commit is `UNKNOWN`, never `FAILED`, and must be reconciled from
the exact refund-execution-bound ledger row. Automatic redispatch is forbidden
while that evidence remains inconclusive. Refund itself has no provider write.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action converges | PASS — exact repeats produce the same normalized request, occurrence scope, caller key, and action id fixture |
| Cancellation routes converge | PASS — successful cancel execution and exact `appointment.removed` event produce the same canonical ActionExecution request |
| Tenant isolation | PASS — integration, client, account, Appointment, original execution, ledger, and cancellation evidence are tenant-qualified |
| Forged authority rejected | PASS — DTO and strict normalizer reject tenant/client/amount/entitlement/approval/autonomy/policy/executor/binding injection |
| L2.5 is non-executable | PASS — capability is `SHADOW_ONLY`, executor `shadow.none`, and runtime operation is only `planShadow` |
| Restart preserves identity | PASS — identity contains only stable original-redemption/removal/policy facts |
| Shadow plan matches mutation | PASS — original bound debit `-300` yields one aggregate intended refund `+300`; two debit rows `-100/-200` yield the same result |
| Duplicate compensation | PASS — an exact existing canonical refund creates no second mutation intent |
| Incomplete evidence fails closed | PASS — wrong client/account/record, absent debit, or absent cancellation proof creates no ActionExecution |
| New-path side effects | PASS — no loyalty/domain executor, ledger/balance/grant write, legacy mutator, provider client, or external dispatch is reachable |

The exact accepted fixture produced zero divergences. Separate fixtures proved
legacy amount mismatch, cap refusal, duplicate refund, and incomplete evidence
without any value or provider effect. The zero is a targeted contract result,
not a production population equivalence claim.

## Verification

- Targeted Jest: `4` suites, `31` tests — PASS.
- Isolated Python bridge: `2` tests — PASS.
- Targeted ESLint for changed TypeScript surface — PASS.
- Targeted Prettier check — PASS.
- `git diff --check` — PASS.
- Full suite — not run, per low-load/targeted-only boundary.
- Production deployment/activation — not performed.
- Real loyalty balance, ledger, grant/redemption, appointment, or provider
  action — not performed.

## Verdict

`P4-03 SHADOW ACTION CLASS: refund_legacy_loyalty`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 4/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT P4-03 ACTION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The fifth P4-03 action class and every executable cutover remain outside
this checkpoint.
