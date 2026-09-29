# Integration and activation boundaries

## 9.6 — BLOCKED at integration

The owner assigned this to the Claude+Codex integration checkpoint. The backend must not add a second/mirror conversation writer. This isolated branch cannot demonstrate the common persisted user-turn identity used by typed chat and widget lowering; no merge/copy of Claude artifacts is made to manufacture that proof.

The integration receipt must identify the one canonical conversation writer and its persisted user-turn identifier, show tenant and actual selected actor/context correlation, then prove byte identity of the lowered message with a typed message through that same writer, including retries/deduplication and error semantics. Existing terminal receipt/read-path tests do not satisfy this duty. This is an integration contract/evidence dependency, not permission to choose a second persistence authority.

The new SB-1 backend endpoint is separate from chat/widget role switching. A future carrier may explicitly select `personal_client` and call the documented backend route; it must not turn `audience=client` into authority. No carrier/runtime port is edited in this branch.

## Full regression integration artifact

The canonical default test still checks the built shell artifact. The isolated backend checkout does not contain `maya-chat-shell/dist/web`; its check remains **INTEGRATION-ONLY CHECK**. The assertion was executed and the missing artifact recorded. It was neither weakened nor replaced by a copy of Claude's artifact. At integration, build the authorized combined candidate and rerun the assertion and fresh CI.

## AR-1 — NOT READY / STOP

The owner requires the exact activation envelope only after the remaining release evidence/contracts are settled. Those prerequisites are not met; no values are invented for:

| Envelope field | Current state |
|---|---|
| threshold | Not approved. OD-3's separate U count does not define activation threshold. |
| approver | Not designated for production activation. Scope decisions are not activation approval. |
| entitlement writer | No approved widgets.runtime activation writer/envelope; no ad-hoc SQL. |
| rollback/revocation | Procedure and evidence not approved. |
| ratchet unlock | No unlock authorized; planned/readiness and A2.2 stay fail-closed. |
| activation proof | Not run; production activation explicitly forbidden. |

This is a prerequisite status table, not a completed activation envelope. No production deploy/config/DB write, real YCLIENTS effect, schema migration, merge or Chapter 10 work occurs in this pass.
