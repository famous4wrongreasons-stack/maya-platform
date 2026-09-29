# 9.6 — one canonical persisted USER turn

The controlled integration uses `TimelineStore.appendUserTurn` as the single physical USER insert. Ordinary `/ai/chat`, typed Step-0 widget routing and native widget lowering converge on this writer. No second conversation model or mirror writer is introduced.

The server derives a namespaced UUID from the exact tenant, authenticated actor, ingress kind and untruncated request ID. This is correlation, never authority. Current principal verification still runs on every request. A caller may echo a server-issued conversation UUID, but the server checks its tenant, current principal and retained, non-erased history before appending.

The USER row and an immutable `chat.user_turn_bound` AuditLog event commit in the same transaction under identity/conversation locks. AuditLog stores only opaque turn/conversation/principal/intent references. Transcript text and its retention remain in WidgetTimelineTurn; neither text nor a text digest enters the correlation event. Existing persistence suffices; no schema change is added.

Exact retries reuse the existing row and do not extend retention. Changed content/context, missing or duplicate correlation, expired/erased history and foreign tenant/actor conversation references fail closed. A retry of a previously lowered widget request cannot fall through to an ordinary/model route after the token expires or disappears. Gate 9 remains the first durable widget-path write, and internal gate-fact readers are unchanged.

Completed chat reads receive the persisted parent turn. Their assistant/widget emission is appended to the same conversation, using a deterministic execution identity. The carrier runtime retains the server's turn reference and echoes its conversation reference on subsequent requests; local view IDs and Claude's React/CSS/iOS presentation semantics are unchanged.

## Proof boundary

`user-turn-identity.live-spec.ts` exercises the real HTTP application and guarded local PostgreSQL: concurrent retries, typed/native production-minted controls, erased history, atomic audit failure, source/read correlation, tenant/actor substitution, and broken/expired bindings. TURN-READ supplies only a synthetic non-authoritative model suggestion; all policies, reads, T-2a minting and storage are real. It is not a claim about model quality or real external effects. T-2b controls use the production HTTP tool route without a model substitute.

`gateTURN.json` declares twelve mutants, alongside existing Gate 9 writer/ordering/erasure/import ratchets. Focused mutation receipts are diagnostics and are not the complete certification programme. A final clause promotion/certificate requires fresh applicable proof on the exact combined candidate. No entitlement, OTP or external booking effect is authorized by this unit.
