# CYCLE 06 BLOCKING PACKAGE 4 — P4-03 CONSUME LOYALTY REDEMPTION GRANT SHADOW PRE-CHECKPOINT

Status: pre-implementation boundary fixed
Source checkpoint: `fc98262b`
Report date: 2026-08-30

## Exact Slice

- **Action:** `consume_loyalty_redemption_grant`, the eighth and final action
  class in the accepted P4-03 Runtime Contract Gate order.
- **Initiators / legacy owner:** an authenticated cashier/admin confirms a
  bearer code through Telegram or the panel. Today `bot.py` and
  `webhook_server.py` authenticate the Telegram identity and call
  `loyalty.consume_redeem_code`; that function reads/claims the plaintext
  SQLite code, writes the legacy ledger/balance through `database.py`, and may
  write a YClients record marker. Those Python/SQLite/YClients functions remain
  the actual execution owner during Shadow. The isolated adapter is not wired
  into production initiation in this step.
- **Canonical target identity:** authoritative provider/company integration ->
  exact tenant; normalized raw bearer credential -> server-side HMAC using a
  required secret pepper -> one exact tenant-qualified
  `LoyaltyRedemptionGrant`; the grant itself supplies immutable canonical
  Client, service target, points, issue binding, issue/expiry times, and
  existing redemption state. The raw code and persisted `codeHash` never enter
  ActionExecution target/input/evidence. An unbound issue execution, missing or
  ambiguous grant, inactive/merged subject, or contradictory redemption fails
  closed.
- **Requester authority:** exact tenant + Telegram provider identity -> one
  `AuthIdentity` -> one active User/Membership. Administrative roles are a
  server policy; a non-administrative cashier is accepted only through an exact
  canonical User id in a bounded server-owned cashier allowlist. Telegram id,
  panel role labels, legacy `can_redeem`, bridge secret, bearer possession, or
  caller-supplied role/approval is not authority. The resolved actor is passed
  to Canonical Action Ingress for policy/entitlement attestation.
- **Server-derived idempotency identity:** contract/policy version + tenant +
  immutable grant id/facts. Initiator route, bearer representation, and caller
  request labels are excluded. The same grant through Telegram or panel
  converges to one logical claim. A changed requester/facts under that claim
  collides and fails closed instead of producing another consume execution.
- **Durable model/binding:** Shadow creates only a non-executable
  `ActionExecution` plan. A future successful consume atomically creates
  exactly one append-only, tenant-qualified `LoyaltyRedemption` bound 1:1 to
  its consume execution, one bound negative `LoyaltyTransaction`, and the
  resulting `LoyaltyAccount.balance`. Existing DB uniqueness rejects a second
  redemption for the same grant or reuse of the consume execution.
- **Policy/caps/approval:** `customer_value`, `financial_equivalent`,
  `one_time`, `bearer_secret`, `destructive`, `external_crm`, and
  `shadow_only`; feature `loyalty`; policy `SHADOW_ONLY`; autonomy
  `L2_5_SHADOW`; approval `NONE` only because this slice grants zero execution
  permission. The canonical grant must be unexpired, unconsumed, within the
  required server per-redemption cap, have sufficient canonical balance, and
  be requested by server-resolved cashier/admin authority. A future executable
  contract must preserve those actor and cap decisions.
- **Provider boundary:** the local grant claim/debit is the business result. A
  matching YClients record marker is an optional later external attempt inside
  the same logical consume execution, never proof of local redemption and
  never owned by Shadow. This slice performs no provider read or write and
  records `not_evaluated_in_shadow`; an executable provider attempt requires an
  exact server-resolved record target before dispatch.
- **Possible `UNKNOWN`:** none in Shadow. A future lost acknowledgement around
  the atomic redemption/ledger/balance commit is local `UNKNOWN`; a timeout
  after a YClients marker dispatch is provider `UNKNOWN`. Neither may be
  collapsed into `FAILED` or blindly retried.
- **Reconciliation contract:** local outcome reconciles from the exact
  tenant-qualified redemption, consume-execution binding, grant, negative
  ledger row, and resulting balance. Exact facts prove success; proven
  rollback/non-dispatch proves non-execution; contradictory bindings prove
  failure; missing/incomplete evidence remains `UNKNOWN`. Provider outcome
  reconciles by reading the exact record and matching the canonical marker;
  inconclusive evidence forbids redispatch.
- **One-time claim semantics:** logical identity is the immutable grant, not the
  bearer request. DB unique `(grantId, tenantId)` permits only one redemption;
  unique `(actionExecutionId, tenantId)` permits one claim result per consume
  execution; both bindings are tenant-qualified and immutable. A second tap,
  second cashier, second route, restart, or alternate bearer spelling cannot
  mint a new logical consume identity.

Shadow records only the intended immutable local result and the explicit fact
that provider projection was not evaluated. It does not create a redemption,
ledger row, balance update, grant update, provider attempt, or external write.

`P4-03 SHADOW ACTION CLASS: consume_loyalty_redemption_grant`

`IDENTITY/CONTRACT AMBIGUITY FOR ACCEPTED PATH: NO`

`INCOMPLETE IDENTITY/EVIDENCE CREATES ACTIONEXECUTION: NO`

`ADDITIONAL SCHEMA/CONTRACT GATE: NO`

`REDEMPTION/LEDGER MUTATION AUTHORIZED: NO`

`RAW CODE/CODE HASH STORED IN ACTIONEXECUTION: NO`

`PROVIDER WRITE AUTHORIZED: NO`

`PREVIOUS P4-03 SHADOWS MODIFIED: NO`

`P4-02 MODIFIED: NO`

`NEXT P4-03 ACTION STARTED: NO`
