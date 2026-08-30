# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 BACKFILL LEGACY LOYALTY SHADOW REPORT

Status: sixth canonical Shadow slice complete; executable cutover not started
Source checkpoint: `1c5b44e7`
Report date: 2026-08-30

## Scope And Boundary

The sixth Gate-ordered P4-03 action class is `backfill_legacy_loyalty`. The
legacy Python/SQLite path remains the actual value execution owner. This step
adds one isolated, feature-gated observation path:

`exact legacy candidate -> PII-free bridge contract -> authoritative
tenant/client/account resolution -> exact read-only provider LTV evidence ->
Canonical Action Ingress -> server-derived policy/entitlement/caps ->
SHADOW_ONLY ActionExecution -> stop before backfill ledger row or balance
mutation`.

The production lazy access, admin batch, Telegram, PWA, legacy AI, and
backfill entrypoints are unchanged. The isolated adapter is not imported by
`loyalty.py`, `bot.py`, `webhook_server.py`, or `claude_ai.py`; Shadow was not
deployed or enabled in production. The completed earn, expire, redeem, refund,
and import Shadow slices and P4-02 were not modified.

## Canonical Decision

- Exact provider/company binding resolves one tenant. The provider client id
  must then resolve through tenant-qualified `CrmClientLink` to one active,
  unmerged Client/User and an existing tenant-qualified `LoyaltyAccount`.
  Missing, unlinked, merged, or mismatched identity fails closed.
- The provider evidence read uses the server-owned User phone only after the
  exact link is established. From the bounded search result, only the exact
  linked provider client id is accepted. Provider name/phone and raw external
  id are not persisted in the ActionExecution input; only opaque identity
  hashes are retained.
- Provider LTV is bounded, normalized to integer rubles according to the
  legacy evidence contract, and passed through the canonical 5% half-even
  calculation. The per-client cap and per-run cap come only from required
  server configuration. Legacy claimed spend, points, caps, approval, or
  trigger do not control the decision.
- Lazy access and admin batch are initiators, not execution owners. The
  initiator label is bridge evidence only and is deliberately excluded from
  the canonical payload and key. Both routes for the same client therefore
  produce the same normalized request and cannot grant twice.
- The logical identity is contract version + tenant + canonical Client +
  approved welcome-program version + fixed policy version. Provider LTV and
  intended points are payload-bound evidence; changed facts under the same key
  fail closed through Action Engine collision handling rather than becoming a
  second grant.
- One exact execution-bound canonical `backfill` or one exact bound
  `yc_import` for the account creates a no-grant plan. Multiple, mixed,
  unbound, missing-correlation, or contradictory source rows fail closed
  without a new ActionExecution.

The future durable intent is exactly one positive, tenant-qualified
`LoyaltyTransaction(kind = backfill)` bound to the backfill ActionExecution,
correlated to the program/client identity, and protected by the existing
tenant idempotency claim. Its row, execution binding, and resulting
`LoyaltyAccount.balance` must commit atomically.

The capability is restricted to `legacy_bridge`, `SHADOW_ONLY`,
`L2_5_SHADOW`, executor `shadow.none`, one non-dispatch attempt, no retry, and
no reconciliation dispatch. Approval is `NONE` only because external
execution permission is zero. This Shadow proves a per-client plan and that a
single candidate cannot exceed the configured run cap; it does **not** claim
that batch aggregate accounting or tenant-owner approval is satisfied. Those
remain mandatory before any executable batch cutover.

## UNKNOWN And Reconciliation Boundary

Shadow has no value/provider dispatch and therefore no mutation `UNKNOWN`.
Provider timeout, empty or malformed search data, missing LTV, or absence of
the exact linked provider client is unresolved evidence and creates no
ActionExecution. It is not converted into `FAILED` followed by a value retry.

A future lost acknowledgement around the atomic backfill ledger/balance
commit is `UNKNOWN`, never `FAILED`. It reconciles from the exact
execution-bound `backfill` row, program/client correlation, and resulting
balance. Only proven absence after rollback may permit another dispatch;
inconclusive evidence forbids blind retry. The provider boundary is read-only
and has no write to reconcile.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action converges | PASS — lazy and admin-batch candidates produce the same normalized request, occurrence scope, caller key, and action id fixture |
| Tenant isolation | PASS — integration, client link, account, prior source rows, and execution request are tenant-qualified |
| Forged authority rejected | PASS — strict normalizer rejects tenant/entitlement/approval/autonomy/policy/executor/binding/phone/batch-approval injection |
| L2.5 is non-executable | PASS — capability is `SHADOW_ONLY`, executor `shadow.none`, and runtime operation is only `planShadow` |
| Restart preserves identity | PASS — identity contains only stable tenant/client/program/policy facts and excludes trigger/run labels |
| Provider evidence is authoritative | PASS — server reads the exact linked provider client LTV; missing client, timeout, or malformed evidence creates no ActionExecution |
| Calculation matches legacy contract | PASS — integer-ruble 5% uses half-even rounding, followed by server per-client and per-run caps |
| Shadow plan matches mutation | PASS — exact provider LTV `6000` produces intended grant `+300`; server cap and run-cap fixtures produce the expected bounded/no-grant decision |
| Legacy values are non-authoritative | PASS — mismatched legacy LTV and points produce two divergences while the server-derived grant remains `+300` |
| Duplicate source protection | PASS — existing exact backfill or provider import creates no second intent; unbound/duplicate/contradictory rows fail closed |
| New-path side effects | PASS — no loyalty ledger/account/grant write, legacy mutator, provider mutator, external dispatch, or identity-registration write is reachable |

The exact accepted fixture produced zero divergences. Separate fixtures proved
legacy evidence mismatch, per-client capping, per-run refusal, existing
backfill, existing provider import, provider failure, cross-identity result,
and contradictory old evidence without a value or provider write. The zero is
a targeted contract result, not a production population equivalence claim.

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

`P4-03 SHADOW ACTION CLASS: backfill_legacy_loyalty`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 6/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`BATCH AGGREGATE CAP/OWNER APPROVAL PROVEN: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT P4-03 ACTION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The seventh P4-03 action class and every executable cutover remain
outside this checkpoint.
