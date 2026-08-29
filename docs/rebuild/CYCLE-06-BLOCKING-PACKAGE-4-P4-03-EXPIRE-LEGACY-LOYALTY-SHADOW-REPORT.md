# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 EXPIRE LEGACY LOYALTY SHADOW REPORT

Status: second canonical Shadow slice complete; executable cutover not started
Source checkpoint: `3fa1d3ee`
Report date: 2026-08-30

## Scope And Boundary

The second Gate-ordered P4-03 action class is `expire_legacy_loyalty`.
The Python daily/manual expiry job and its SQLite ledger remain the only value
execution owner. This step adds an isolated, feature-gated observation path:

`exact legacy candidate -> PII-free bridge contract -> Canonical Action
Ingress -> server-derived policy/entitlement -> SHADOW_ONLY ActionExecution ->
stop`.

The production scheduler is unchanged, the adapter is not called from any
production entrypoint, and no Shadow was deployed or activated in production.
`earn_legacy_loyalty` and its completed report/code were not modified.

## Canonical Decision

- Exact provider/company binding resolves one tenant. Exact external provider
  client id then resolves through tenant-qualified `CrmClientLink` to a
  canonical Client/User and its `LoyaltyAccount`. Phone and local SQLite client
  id are not accepted.
- Current balance is read server-side from `LoyaltyAccount`; the legacy claimed
  balance is comparison evidence only.
- The server derives the UTC evaluation window under
  `legacy-inactivity-360d-full-balance.v1`, the policy effective date, and
  per-client/per-run caps. Python cannot supply policy, caps, approval,
  autonomy, executor, or binding.
- Absence of an attended visit is accepted only after a completed
  `ReconciliationRun` with `complete` coverage spanning the full inactivity
  window. The server then checks the tenant/client-qualified Appointment mirror
  for `attendance = arrived`.
- Missing identity/account, invalid policy configuration, negative/out-of-range
  canonical balance, or incomplete evidence creates no ActionExecution.
- Complete evidence may create a comparison plan with no intended mutation
  when canonical attendance, grace, or cap policy says `do_not_expire`.
- An eligible plan records the exact future durable intent:
  `LoyaltyTransaction / expire / -canonical balance / balanceAfter 0`.
  This is a plan only; no account or ledger row is written.

The logical identity is derived from contract version, tenant, canonical
client, expiry policy version, and server evaluation window. Repeating the
same candidate after restart within that window converges to the same logical
ActionExecution. The capability is restricted to `legacy_bridge`,
`SHADOW_ONLY`, `L2_5_SHADOW`, `shadow.none`, one non-dispatch attempt, no retry,
and no reconciliation dispatch.

Future executable expiry still requires a separately approved tenant-owner
approval/cap contract and atomic execution-bound ledger/balance transition.
The per-run cap is recorded in this Shadow plan but cannot grant execution.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action converges | PASS — exact repeats produce the same request, occurrence scope, caller key, and action id fixture |
| Tenant isolation | PASS — provider/company resolve tenant server-side and client lookup is tenant + provider + external id |
| Forged authority rejected | PASS — DTO and strict normalizer reject tenant/client/policy/cap/entitlement/approval/autonomy/executor/binding injection |
| L2.5 is non-executable | PASS — capability is `SHADOW_ONLY`, executor `shadow.none`, runtime operation only `planShadow` |
| Restart preserves identity | PASS — identity excludes discovery time inside one server-derived daily evaluation window |
| Plan matches intended mutation | PASS — canonical balance `100` produces intended delta `-100` and resulting balance `0`; recent attendance produces no debit |
| Evidence completeness | PASS — missing full mirror coverage creates no ActionExecution and no absence claim |
| New path side effects | PASS — no loyalty/domain executor, ledger write, balance update, provider client, grant, or external mutator is reachable |

The exact eligible fixture produced zero divergences. Separate fixtures proved
legacy-balance mismatch and canonical-recent-attendance divergence without any
value/provider effect. This zero is a targeted contract result, not a claim
about production population equivalence.

## Verification

- Targeted Jest: `5` suites, `35` tests — PASS.
- Final changed-surface Jest rerun: `3` suites, `26` tests — PASS.
- Python isolated bridge: `2` tests — PASS.
- Targeted ESLint for all changed TypeScript files — PASS.
- `git diff --check` — PASS.
- Full suite — not run, per low-load/targeted-only boundary.
- Production deployment/activation — not performed.
- Real loyalty, ledger, grant, or provider action — not performed.

## Verdict

`P4-03 SHADOW ACTION CLASS: expire_legacy_loyalty`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 2/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`EARN LEGACY LOYALTY MODIFIED: NO`

`P4-02 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT P4-03 ACTION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The third P4-03 action class and every executable cutover remain outside
this checkpoint.
