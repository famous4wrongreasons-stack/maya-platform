# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 IMPORT LEGACY LOYALTY BALANCE SHADOW REPORT

Status: fifth canonical Shadow slice complete; executable cutover not started
Source checkpoint: `35d05020`
Report date: 2026-08-30

## Scope And Boundary

The fifth Gate-ordered P4-03 action class is
`import_legacy_loyalty_balance`. The legacy Python/SQLite path remains the
actual value execution owner. This step adds one isolated, feature-gated
observation path:

`exact provider client candidate -> PII-free bridge contract -> authoritative
tenant/client/account resolution -> read-only provider card evidence ->
Canonical Action Ingress -> server-derived policy/entitlement -> SHADOW_ONLY
ActionExecution -> stop before yc_import ledger row or balance mutation`.

The production lazy first-access import and backfill entrypoints are unchanged.
The isolated adapter is not imported by `loyalty.py`, `bot.py`,
`webhook_server.py`, or `claude_ai.py`; Shadow was not deployed or enabled in
production. The completed earn, expire, redeem, and refund Shadow slices and
P4-02 were not modified.

## Canonical Decision

- Exact provider/company binding resolves one tenant. The provider client id
  must then resolve through tenant-qualified `CrmClientLink` to one active,
  unmerged Client/User and an existing tenant-qualified `LoyaltyAccount`.
  Missing, unlinked, merged, card-less, or mismatched identity fails closed.
- The provider evidence read uses the server-owned User phone only after the
  exact link is established. The returned provider, external client id, card
  id, and bounded integer balance must match that link. The initiator cannot
  supply the phone or card identity.
- A dedicated read-only CRM evidence boundary was added. Unlike the existing
  user-facing loyalty read, it cannot register or refresh a different client
  identity as a side effect of an ambiguous provider phone result. Provider
  timeout, malformed data, missing card, or mismatched client creates no
  ActionExecution.
- The intended delta is `provider snapshot balance - canonical
  LoyaltyAccount.balance`. Legacy provider balance, process-local current
  balance, and legacy delta are comparison evidence only. The per-action cap
  is server configuration, never an initiator decision.
- The exact provider card correlation is a tenant/provider/client/card hash;
  raw card id and phone are excluded from the ActionExecution payload and
  evidence references.
- No prior `yc_import` permits one intended ledger result, including the exact
  zero-delta one-time claim case. One exact execution-bound import for the same
  account/card creates a no-mutation plan. Duplicate, unbound, cross-card, or
  contradictory prior import evidence fails closed without ActionExecution.

The future durable intent is exactly one tenant-qualified
`LoyaltyTransaction(kind = yc_import)` bound to the import ActionExecution,
correlated to the hashed provider card, and protected by the existing tenant
idempotency claim. Its delta, execution binding, and resulting
`LoyaltyAccount.balance` must commit atomically.

The logical identity binds contract version, resolved tenant, canonical
Client, provider, exact card identity, and fixed import policy. Repeating after
restart produces the same normalized request. Changed provider facts under the
same logical key do not create a new import identity: the Action Engine payload
binding rejects the collision. The capability is restricted to
`legacy_bridge`, `SHADOW_ONLY`, `L2_5_SHADOW`, executor `shadow.none`, one
non-dispatch attempt, no retry, and no reconciliation dispatch. Approval is
`NONE` only because external execution permission is zero.

## UNKNOWN And Reconciliation Boundary

Shadow has no value/provider dispatch and therefore no mutation `UNKNOWN`.
The one server-side provider read is evidence acquisition: timeout, malformed
response, or missing exact card is unresolved evidence and authorizes no
ActionExecution or value change. It is not converted into `FAILED` followed by
a dispatch retry.

A future lost acknowledgement around the atomic import ledger/balance commit
is `UNKNOWN`, never `FAILED`. It reconciles from the exact
execution-bound `yc_import` row, provider-card correlation, and resulting
balance. Only proven absence after rollback may permit another dispatch;
inconclusive evidence forbids blind retry. There is no provider write to
reconcile for this action.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action converges | PASS — exact repeats produce the same normalized request, occurrence scope, caller key, and action id fixture |
| Tenant isolation | PASS — integration, client link, account, prior import, and execution request are tenant-qualified |
| Forged authority rejected | PASS — strict normalizer rejects tenant/entitlement/approval/autonomy/policy/executor/binding/card injection |
| L2.5 is non-executable | PASS — capability is `SHADOW_ONLY`, executor `shadow.none`, and runtime operation is only `planShadow` |
| Restart preserves identity | PASS — identity contains only stable tenant/client/provider/card/contract/policy facts |
| Provider evidence is authoritative | PASS — server re-reads the exact provider card; wrong client/card, timeout, or malformed evidence creates no ActionExecution |
| Shadow plan matches mutation | PASS — provider `900` minus canonical balance `600` produces intended exact delta `+300` |
| Legacy values are non-authoritative | PASS — three mismatched legacy claims are recorded as three divergences while the server-derived delta remains `+300` |
| One-time import reuse | PASS — exact prior bound import creates no second intent; unbound, cross-card, contradictory, or duplicate evidence fails closed |
| New-path side effects | PASS — no loyalty ledger/account/grant write, legacy mutator, provider mutator, external dispatch, or identity-registration write is reachable |

The exact accepted fixture produced zero divergences. Separate fixtures proved
legacy evidence mismatch, server-cap refusal, existing import, provider
failure, cross-identity result, and contradictory old evidence without a value
or provider write. The zero is a targeted contract result, not a production
population equivalence claim.

## Verification

- Targeted Jest: `3` suites, `15` tests — PASS.
- Isolated Python bridge: `2` tests — PASS.
- Targeted ESLint for the changed TypeScript surface — PASS.
- Targeted Prettier check — PASS.
- `git diff --check` — PASS.
- Full suite — not run, per low-load/targeted-only boundary.
- Production deployment/activation — not performed.
- Real loyalty balance, ledger, grant/redemption, identity, or provider write —
  not performed.

## Verdict

`P4-03 SHADOW ACTION CLASS: import_legacy_loyalty_balance`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 5/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT P4-03 ACTION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The sixth P4-03 action class and every executable cutover remain outside
this checkpoint.
