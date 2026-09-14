# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 ISSUE LOYALTY REDEMPTION GRANT SHADOW REPORT

Status: seventh canonical Shadow slice complete; executable cutover not started
Source checkpoint: `04d75bd1`
Report date: 2026-08-30

## Scope And Boundary

The seventh Gate-ordered P4-03 action class is
`issue_loyalty_redemption_grant`. The Python/SQLite code-generation path
remains the actual grant owner. This step adds one isolated, feature-gated
observation path:

`authenticated Telegram/PWA candidate -> PII-free legacy bridge -> exact
tenant/client/account resolution -> authoritative service catalog and
server-owned grant policy -> Canonical Action Ingress -> SHADOW_ONLY
ActionExecution/plan -> stop before grant, code, value, or provider mutation`.

The adapter is not imported by the legacy Telegram, PWA, AI, or Python loyalty
entrypoints and was not deployed or enabled in production. The six completed
P4-03 Shadow slices and P4-02 were not modified.

## Canonical Decision

- The external provider/company binding resolves the exact tenant. A
  tenant-qualified active `CrmClientLink` must resolve the opaque external
  client to one active, unmerged Client/User/Membership, an existing
  `LoyaltyAccount`, and bounded canonical balance. Missing or contradictory
  identity fails closed before an ActionExecution is created.
- The exact service id is resolved from the current server-side tenant catalog.
  Service name, RUB price, derived points, allowed-service membership, TTL, and
  per-grant cap are server facts. Legacy title/points and initiator labels are
  comparison evidence only and never authority.
- The caller request claim is stable across Telegram/PWA and is bound to tenant
  and canonical Client. The normalized payload additionally binds the exact
  service, server-derived value, policy versions, and decision. Reusing the
  same claim with changed target/value/policy collides and fails closed instead
  of becoming another grant.
- An exact existing `LoyaltyRedemptionGrant` with the canonical request
  correlation produces a no-create plan. A changed, unbound, duplicate, or
  contradictory grant fails closed.
- The intended future result is exactly one immutable tenant-qualified
  `LoyaltyRedemptionGrant` bound 1:1 through `issueExecutionId`. Only a
  server-generated code hash may persist. Shadow generates neither raw bearer
  code nor code hash and creates no grant row.
- Issuance does not debit balance or create a `LoyaltyTransaction`. One-time
  consumption is the separate eighth action class. A grant can bind to at most
  one append-only redemption, so generating or possessing a bearer code grants
  no consume authority.

The capability is `legacy_bridge`, `SHADOW_ONLY`, `L2_5_SHADOW`, executor
`shadow.none`, one non-dispatch attempt, and no retry. Approval is `NONE` only
because this slice has zero execution permission. The bridge secret, caller
payload, entitlement, autonomy, approval, policy, executor, or binding value
cannot authorize issuance.

## Provider, UNKNOWN, And Reconciliation Boundary

Shadow performs only a read-only service-catalog lookup. It performs no
provider write, identity registration, grant/code generation, ledger write, or
balance change. Catalog timeout, missing/ambiguous service, invalid price or
currency, insufficient balance, cap violation, or incomplete authorization is
unresolved/denied evidence and creates no executable action.

There is no mutation `UNKNOWN` in Shadow. A future lost acknowledgement around
the atomic grant/code-hash/execution binding commit is `UNKNOWN`, never
`FAILED`, and cannot generate a second bearer code. Reconciliation must use the
exact tenant-qualified grant bound to the issue execution and verify client,
service, points, expiry policy, code hash, and request correlation. Missing or
contradictory evidence remains `UNKNOWN` and forbids blind redispatch.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action converges | PASS — Telegram and PWA candidates with the same caller request produce the same normalized request, occurrence scope, caller claim, and action identity fixture |
| Tenant isolation | PASS — provider binding, client link, membership, account, catalog, prior grant, and execution request are tenant-qualified |
| Forged authority rejected | PASS — the strict contract rejects supplied tenant, entitlement, approval, autonomy, policy, executor, binding/hash, code, or code hash authority |
| L2.5 is non-executable | PASS — capability is `SHADOW_ONLY`, executor `shadow.none`, and runtime exposes only `planShadow` |
| Restart preserves identity | PASS — the claim uses stable tenant/client/caller-request facts and the payload binds stable server service/policy facts |
| Shadow plan matches intended mutation | PASS — the accepted fixture records exact client, service reference, server-derived points, TTL, and one-time issue intent without constructing the result |
| Changed legacy evidence is non-authoritative | PASS — changed title/points appear only as divergences while canonical service facts control the plan |
| Incomplete identity/evidence fails closed | PASS — missing client, inactive membership, provider mismatch, ambiguous catalog, and changed existing-grant facts do not create an ActionExecution |
| One-time/reuse protection | PASS — exact prior request produces no-create; reuse with changed target collides; contradictory/unbound evidence fails closed |
| New-path side effects | PASS — no account/ledger/grant/redemption/code/code-hash write, legacy mutator, provider mutator, external dispatch, or identity-registration write is reachable |

The exact accepted fixture produced zero divergences. Separate fixtures prove
catalog-title/points mismatch, insufficient balance, cap and allowlist denial,
exact existing-grant no-create, changed existing-grant fail-closed, and caller
request reuse against a changed target without a value or provider write. The
zero is a targeted contract result, not a production population comparison.

## Verification

- Targeted Jest: `3` suites, `16` tests — PASS.
- Isolated Python bridge: `2` tests — PASS.
- Targeted ESLint for the changed TypeScript surface — PASS.
- Targeted Prettier formatting/check — PASS.
- `git diff --check` — PASS.
- Full suite — not run, per low-load/targeted-only boundary.
- Production deployment/activation — not performed.
- Real balance, ledger, grant, redemption, code, code-hash, identity, or provider
  write — not performed.

## Verdict

`P4-03 SHADOW ACTION CLASS: issue_loyalty_redemption_grant`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 7/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`RAW CODE OR CODE HASH GENERATED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`A08 PAYMENT WRITE: DISABLED`

`NEXT P4-03 ACTION STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. The eighth P4-03 action class and every executable cutover remain outside
this checkpoint.
