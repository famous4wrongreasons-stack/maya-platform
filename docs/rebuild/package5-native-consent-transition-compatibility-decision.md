# Native consent compatibility — minimal transition identity decision

2026-09-08. Accepted checkpoint `2728bf20`. **PROPOSAL ONLY — NOT APPROVED.**

This decision concerns only the keyless installed-native compatibility adapter
introduced by `b6c53ff9`. It does not change A18 consent, ClientChannelLink,
ClientLinkChallenge, B6/B25/B35, B31/B33, or any R-C Option A decision.

## Foundation verdict

| Boundary | Existing foundation sufficient | Exact finding |
| --- | --- | --- |
| G1 verified Client provenance | **YES** | The certified `ClientChannelRuntimeService.resolve` reuses an active verified ClientChannelLink, exact tenant/Client, and existing challenge eligibility checks. It never needs User/Profile matching. |
| G2 canonical command with stable event identity | **YES** | Existing ActionExecution caller-idempotency, encrypted normalized input, sourceRef and ActionTargetMutation generation persist admission/outcome; ClientConsentFact is the append-only effect. |
| G2 unchanged keyless native compatibility | **NO** | The old initiator supplies no stable event identity or expected revision. Existing durable records cannot tell a delayed old event from a fresh identical event. |

**There is no general absence of a durable consent ledger or generation.** The
gap is the mapping of this particular installed-native request to its logical
event. Adding a table by itself cannot recover information the request omits.

## Exact counterexample

Both possible histories have the same authenticated account, verified exact
Client binding, tenant, completed grant G1, completed revoke R1, current revoked
state and current target generation. The next request in both histories is:

```text
PATCH /api/customers/me/profile
Content-Type: application/json
{"privacyConsent":true,"marketingConsent":true}
No event identity / idempotency key / expected revision.
```

In history X this is a delayed retry of G1: return G1, do not undo R1. In history
Y the Client explicitly grants again: admit G2, with G2 different from G1.
All server-observable information is identical. Hashing the current generation,
latest consent fact, link, session, desired tuple or timestamps cannot select
the correct meaning in both histories. A lock serializes the ambiguity; it does
not remove it. A random key per arrival violates retry semantics. Treating all
same-state arrivals as retries fails once a revoke intervenes.

The old component's actual submit handler is executed in the attached memory-only
proof. Two button submissions contain the same two booleans and no event header.
The upstream compatibility controller does not forward its optional header even
when a more capable caller supplies one. The updated PWA's `commandRef` is a
different initiator and cannot repair requests from an already installed bundle.

## Recommended Option A — existing command identity, explicit keyless retirement

1. Preserve the approved canonical consent command exactly. An explicit user
   transition has one stable opaque command identity, created once and retained
   with its immutable privacy/marketing decisions before its first dispatch.
   Retries and restart of that transition reuse the same identity and decisions.
2. The compatibility route may accept its existing two-boolean body **only with
   a stable Idempotency-Key**; it forwards the event identity to the existing
   canonical consent owner. No key synthesized from state, User/Profile, session,
   request middleware, clock or each HTTP arrival.
3. A missing/invalid identity is rejected before challenge/consent/Client writes.
   Keyless installed clients must use an updated client or an existing supported
   consent surface. No successful-looking response or inferred consent.
4. Preserve current caller-key namespace/scope semantics and exact Client/tenant
   validation. Reuse existing ActionExecution/source identity, immutable input,
   generation, local transaction and replay outcome. Changed material under the
   same event identity remains a conflict; existing Client consent authority is
   revalidated. No booking-specific binding contract is repurposed.
5. An explicit grant after revoke carries G2. Retries of G1 remain retries of G1
   even after R1 or G2. Retries of G2 reuse G2. Concurrent duplicates converge
   through existing admission/execution semantics; competing grant/revoke retains
   the approved exact-target generation and stale-intent policy.
6. For the maintained PWA, preserve the pending event identity and immutable
   decisions across ambiguous failures/reload, bind local pending state to the
   authenticated context, and finish that event only after its canonical receipt.
   Never silently change a pending event's booleans or regenerate its key on retry.
   Server-side identity/authority remains authoritative.

Canonical owner: **Client consent command → existing A18 Action Engine execution
→ ClientConsentFact / governed profile projection**. Initiators remain adapters.
G1 removes the unproven FK issuer, reuses approved verified bindings and denies
cold-start linkage without provenance. A guest with a valid approved channel
binding remains supported. No automatic Client creation, fabricated links or
historical consent backfill.

### Why this option

It reuses the already sufficient durable foundation and distinguishes the two
events using the original command contract. It does not introduce another consent
owner, pending-link model, generation table, retry policy or retention policy.

### What user/business loses

**Already installed native builds that send only two booleans cannot complete this
consent operation until updated or switched to an existing supported surface.**
The newly introduced successful keyless behavior is retired. Silent failure or
row-existence-as-consent is not an acceptable compatibility substitute.

This is the sole requested owner decision: retiring the keyless compatibility
behavior. The user explicitly made contradiction with existing production
semantics a STOP condition; it is not silently treated as an implementation-only
detail. Approved canonical consent semantics themselves are not reopened.

## Exact schema mapping and lifecycle

| Existing storage | Role | Change |
| --- | --- | --- |
| ActionExecution sourceRef + caller idempotency scope/key hash | Durable event admission/replay and immutable input | None |
| ActionExecution state/attempt/normalized input | Same execution after crash; original consent times retained | None |
| ActionTargetMutation exact tenant/target generation | Committed mutation order and stale competing intent checks | None |
| ClientConsentFact sourceIdentityHash + execution relation | Append-only decision effect, tenant/Client qualified | None |
| ClientChannelLink | Verified identity precondition, not a transition receipt | None |

Existing retention and lifecycle rules remain unchanged. No perpetual receipt
retention, cleanup exception, historical event reconstruction or migration is
approved here. Any future retention change remains its existing owner boundary.

```text
RECOMMENDED OPTION: A
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
CANONICAL CONSENT CONTRACT CHANGE: NO
KEYLESS INSTALLED-NATIVE COMPATIBILITY RETIREMENT: OWNER DECISION REQUIRED
```

A server-issued transition receipt would still require an updated initiator to
obtain and replay that receipt. It cannot preserve the unchanged keyless protocol.
Consequently no speculative receipt model or schema alternative is proposed.

## Proof and ratchet requirements after decision

G1 negative fixtures must deny bare Client User FK, profile User FK, the matching
pair with null Client FK, revoked/wrong Client/wrong tenant, and permit only valid
approved binding including a guest channel. Rejects must write no challenge,
consent or Client. Inspect provenance of any previously issued compatibility links
using read-only evidence; never relabel or backfill them as verified.

G2 executable PostgreSQL proof must cover G1/retry, R1/retry, G2/retry, delayed G1
retry after R1, concurrent duplicates, grant/revoke race under existing policy,
restart between admission/execution, Client/tenant isolation and no hidden Client
creation. Add permanent ratchets for all six prohibited classes in the owner's
request, including an actual old-native keyless rejection case and maintained-PWA
retry/reload/immutable-event behavior.

Only after implementation run the specified 125 existing tests and affected
B6/B25/B35, Client identity/link, CD/AE, R06/R08 and PWA proofs; then lint, both
typechecks, build, schema/pending checks and mandatory relevant regressions. No
production acceptance is inferred from this assessment. R-C stays preserved and
blocked until the combined baseline is actually certified.

Suggested owner decision, **not yet applied**:

```text
NATIVE CONSENT COMPATIBILITY: APPROVE OPTION A
KEYLESS NATIVE REQUESTS: REJECT BEFORE MUTATION
EXISTING CONSENT COMMAND IDENTITY/RECEIPT: REUSE
NEW SCHEMA: NO
```
