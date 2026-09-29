# HANDOFF receiving owner — separate contract packet (STOP)

G6-6 and G13-R8 remain false / OWNER_DECISION_REQUIRED. OD-4 B resolves Gate 5 acceptance only; it supplies no Gate 13 receiving authority. Ordinary canonical DRAFT/COMMIT booking does not use the HANDOFF branch of Gate 6 or its receiver. SB-1 personal booking calls the existing Client/Action Engine owners directly and has no HANDOFF dependency.

Before a receiving unit can be implemented, its destination owner must specify:

1. The exact registered destination and capability space, receiving owner and route. No generic receiver or new public route is presumed.
2. The accepted carrier and how its signed/opaque handle resolves to the durable source record, tenant, intended audience and target. An opaque HMAC is not itself a lookup or authority proof.
3. Current principal/session/tenant verification at landing and sensitivity/floor checks. A stale principal, foreign tenant, revoked binding or target mismatch must refuse.
4. Expiry and replay/consumption semantics, including retries and denial outcomes. No default reusable or single-use policy is invented.
5. The point after Gate 6 at which one HandoffTarget is minted; the receiver must not invoke a capability on the widget's authority.
6. Persisted correlations and their owner, if required, followed by explicit schema approval before any migration. Existing storage sufficiency is not assumed.
7. Positive and adversarial HTTP/BIN receipts, no owner call on refusal, restart/replay behavior and load-bearing mutants.

No destination, route, retention policy or schema is selected by this packet. This STOP does not enter the ordinary booking dependency graph.
