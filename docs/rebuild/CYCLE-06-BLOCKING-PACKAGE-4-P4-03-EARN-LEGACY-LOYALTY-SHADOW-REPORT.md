# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 EARN LEGACY LOYALTY SHADOW REPORT

Status: first canonical Shadow slice complete; executable cutover not started
Source checkpoint: `6564aa25`
Report date: 2026-08-30

## Scope And Boundary

The first Gate-ordered P4-03 action class is `earn_legacy_loyalty`.
Its daily/manual Python job and SQLite ledger remain the only current value
execution owner. This step adds a local, feature-gated observation path:

`legacy candidate -> PII-free bridge contract -> Canonical Action Ingress ->
server-derived policy/entitlement -> SHADOW_ONLY ActionExecution -> stop`.

The approved Contract Gate requires fixture/structural verification before the
production scheduler is wired. Accordingly, `run_earning_job` is unchanged,
the new bridge is not called by a production entrypoint, and no Shadow was
deployed or activated in production in this step.

The pre-implementation contract is fixed in
`CYCLE-06-BLOCKING-PACKAGE-4-P4-03-EARN-LEGACY-LOYALTY-SHADOW-PRECHECKPOINT.md`.

## Implemented Slice

- The bridge DTO accepts provider/company/client/visit observations, date,
  integer-ruble amount, and the legacy claimed points. Global whitelist and
  strict validation reject tenant, entitlement, approval, autonomy, policy,
  executor, and binding/hash injection.
- A server-bound bridge credential resolves the exact provider/company to one
  tenant. The external client id is then resolved only through the
  tenant-qualified `CrmClientLink`; missing, userless, or merged identities
  create no execution and report an identity divergence.
- The server recalculates the exact legacy 5% integer-ruble rule with
  half-to-even rounding. The normalized plan contains the canonical client,
  visit date and amount, intended positive points, calculation policy, and a
  mismatch marker. Initiator-supplied points are comparison evidence only.
- Logical identity is server-derived from contract version, tenant, provider,
  canonical client, and provider visit id. The fixed occurrence scope and
  caller alias address the same logical ActionExecution after restart.
- Capability `loyalty.legacy-earn.shadow.v1` is restricted to
  `legacy_bridge`, `SHADOW_ONLY`, `L2_5_SHADOW`, `shadow.none`, one
  non-dispatch attempt, no retry, and no reconciliation dispatch.
- `ActionEngineRuntimeService.planShadow` is the only Action Engine operation.
  It cannot call `executeWithReceipt`, a loyalty executor, PostgreSQL value
  mutations, SQLite value mutations, or YClients writes.
- The isolated Python bridge contains no database, loyalty mutator, or
  YClients client import. Disabled or incomplete candidates open no request.

The new backend variables are deliberately separate from initiator input:

- `MAYA_LEGACY_LOYALTY_EARN_SHADOW_ENABLED`;
- `MAYA_LEGACY_LOYALTY_SHADOW_SOURCE_PROVIDER`;
- `MAYA_LEGACY_LOYALTY_SHADOW_SOURCE_COMPANY_ID`;
- existing authenticated bridge secret `MAYA_INBOX_BRIDGE_TOKEN`.

The Python fixture bridge asserts the already established
`MAYA_BRIDGE_PROVIDER` / `MAYA_BRIDGE_COMPANY_ID` observation. The backend
binding is authoritative and rejects a mismatch.

## Targeted Proof

| Required proof | Result |
|---|---|
| Same logical action -> same execution identity | PASS — repeated exact candidate produces the same canonical request, occurrence scope, and caller identity; canonical identity/ingress ratchets pass |
| Tenant isolation | PASS — tenant comes from the server-bound integration and client lookup includes tenant + provider + external id; unmapped identity fails closed |
| Forged authority ignored/rejected | PASS — HTTP DTO and normalized Action Engine input reject tenant/entitlement/approval/autonomy/policy/executor/binding fields |
| L2.5 cannot execute | PASS — capability is `SHADOW_ONLY`, executor is `shadow.none`, and runtime path is only `planShadow` |
| Exact intended value mutation plan | PASS — valid fixture records `LoyaltyTransaction / earn / +100`; server-derived mismatch fixture records intended `+4` versus legacy `+3` without execution |
| Restart does not create a new logical identity | PASS — stable server-derived hash, fixed occurrence scope, and Canonical Ingress identity proof |
| Existing legacy mutation is not invoked by Shadow | PASS — isolated bridge/backend path imports no legacy loyalty mutator; production scheduler is not wired and remains unchanged |
| New-path value/provider effects | PASS — no value executor or provider mutator is reachable; both counters are `0` |

An exact-equivalence fixture produced zero divergences. The mismatch and
unmapped fixtures correctly produced divergences without value effects. No
production population was sampled, so the zero is a targeted contract result,
not a claim about production data quality.

## Verification

- Changed-surface Jest: `3` suites, `23` tests — PASS.
- Canonical identity and ingress targeted Jest: `2` suites, `9` tests — PASS.
- Python bridge fixtures: `2` tests — PASS.
- Targeted ESLint for the changed TypeScript surface — PASS before the final
  fail-closed date/identity tightening. The final two files were formatted and
  compiled by passing Jest; a redundant lint repeat emitted no diagnostic and
  was stopped when local startup remained CPU-starved under the low-load rule.
- `git diff --check` — PASS.
- Full suite — not run, per low-load/targeted-only boundary.
- Production deployment/activation — not performed.
- Real loyalty or provider proof — not performed and not required.

## Verdict

`P4-03 SHADOW ACTION CLASS: earn_legacy_loyalty`

`CANONICAL SHADOW WIRED: YES`

`SHADOW DIVERGENCES: 0`

`NEW PATH VALUE MUTATIONS: 0`

`NEW PATH PROVIDER WRITES: 0`

`P4-03 ACTION CLASSES SHADOW-MIGRATED: 1/8`

`EXECUTABLE CUTOVER: NO`

`PRODUCTION SHADOW DEPLOYED: NO`

`LEGACY EXECUTION OWNER CHANGED: NO`

`A08 PAYMENT WRITE: DISABLED`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`

`NEXT PACKAGE 4 FAMILY STARTED: NO`

`PACKAGE 5 STARTED: NO`

`CHAPTER 7 STARTED: NO`

STOP. A separately authorized step is required before wiring or deploying the
production scheduler Shadow, and executable cutover remains outside this
checkpoint.
