# YCLIENTS fixed service price — local UI candidate YC-SP1-WIDGET-1

This candidate completes the local current-carrier path on top of backend checkpoint
`fd702158874e77198e97f50863acbff0452a7125`, on the same isolated branch
`codex/maya-yc-service-pricing-20261006`. It is not a release or real-provider acceptance.

## Approved scope and authority

The owner answered «Да» at 16:09 UTC on 2026-10-06 to the narrow proposal: one current
service in the owner's own YCLIENTS salon, exact old/new fixed RUB price, explicit
confirmation, test branch only. The normative transfer is widget contract V1.4,
F32a and Annex F. The new `catalogue_price_configuration` subtype retains MONEY and
financial classification. Ordinary money/marketing floors, the previous thirteen
F38 pairs, ten commit-allowlist entries and B35 behavior remain pinned by tests.

Only `catalog.service.price.update` → canonical AI tool/CRM owner →
`crm.service.fixed-price.update.v1` is added. No generic HTTP tool, payment, payout,
discount, new integration, database migration, AE lifecycle or website booking path
is introduced. A28's internal catalog is still not presented as a YCLIENTS write.

## Current chat and approval path

An authenticated current chat turn produces the source-backed exact proposal and
existing immutable encrypted `AiApprovalRequest`. A separate immutable audit binding
records that actual approval ID/hash, original conversation/user turn and current
principal proof. A standalone historical proposal cannot acquire chat provenance
by replay. The existing emitter creates the standard APPROVAL widget; neither a
synthetic AE approval nor a fake consumed REQUEST_APPROVAL gesture is minted.

The typed canonical approval adapter resolves the current principal through the
existing resolver, checks tenant/owner, original chat binding and sealed noun, and
delegates the exact decision to the existing AI approval owner. Widget entitlement
admission is repeated inside the existing receipt transaction. Only the existing
Action Engine invokes the provider adapter. Detail uses the standard `fs.catalogue`
NAVIGATE seam and a fresh sealed child with the same turn and parent reference.

A correction supersedes only live root cards for the same actor, conversation and
canonical service. It cannot supersede another service or a detail child. Replay
finds the existing root rather than issuing a fresh decision control. Reject and
approved/UNKNOWN decisions consume sibling controls through existing lifecycle
owners. Terminal replay and restart do not redispatch PATCH.

The current shell and React renderer show confirmed success only when the exact
price diff matches an authoritative verified YCLIENTS result and actual AE receipt.
ACCEPTED alone is insufficient. Reject is distinct; uncertain writes show
«Результат пока не подтверждён. Не отправляйте повторно». UNKNOWN is never FAILED
or success. Provider response loss has no POST/PUT/PATCH retry fallback.

## Fresh bounded qualification

The [UI evidence manifest](evidence/yc-service-pricing-ui-20261006/manifest.json)
contains commands, hashes and logs. The tests use actual application HTTP/auth,
Action Engine and an owned Postgres database, with the real adapter connected only
to an owned synthetic loopback CRM server and a scripted model.

- Actual HTTP/auth/AE/Postgres: **23/23 PASS**, including chat approval, exact diff,
  correction, rejection, detail, foreign/client/revoked authority, tampering, replay,
  concurrency, restart, lost provider response and UNKNOWN holding the service.
- Current React and headless runtime: **5/5 PASS** (four cases plus wrapper), consuming
  untouched HTTP-exported envelopes and outcomes for confirmed, rejected, UNKNOWN
  and detail. Standard controls, sealed child, exact reading order and hidden tokens
  are checked. **At this UI checkpoint no browser was exercised.**
- Backend and current React typechecks pass; React runtime import gate has zero refusals.
- Focused backend tests: **559/559 PASS** over 23 suites; focused shell tests:
  **62/62 PASS**. Scoped ESLint: 48 files, zero errors and three generated-file warnings.
- Architecture boundaries: **68/68 PASS**; K3 **10/10 PASS**; runtime-floor copy PASS;
  contract checker **31/31 PASS**, with four existing later-package prerequisites
  still explicitly pending. Generated contract typecheck also passes.

Exact commands, test selection and log hashes are recorded in the manifest. Independent
read-only review checked the owner boundaries, detail route, truthful outcomes and
evidence; it did not independently execute the tests. Initial failed qualification
attempts were diagnostic: test resolve observation, readonly detail noun routing,
stale runtime hashes/census pins, formatting and typed mocks were repaired without
relaxing the historical authority guards. Raw attempts remain in the owned evidence
directory. The isolated Postgres instance on port 56347 was stopped after tests.

## Remaining gates

Real YCLIENTS GET/PATCH preservation and authoritative receipt qualification remain
unperformed. Sparse required source state fails closed. The provider has no documented
compare-and-swap, so concurrent external editors remain a limitation. Deterministic
exact-title/fixed-amount language coverage is bounded; no real-model quality is claimed.
Create, broader edit/archive, staff/chain settings and whole-API completeness remain
outside this candidate and need their preserved-state contracts in dependency order.

The later [actual browser checkpoint](YCLIENTS-SERVICE-PRICE-BROWSER-PROOF-2026-10-06.md)
qualifies three local functional flows but exposes blocking card-state and typography
defects. Their repair and fresh browser acceptance, aggregate census and V1.4
release/profile certification are still required for any later release decision. No real YCLIENTS/DeepSeek call,
production DB/config, existing HTTPS stand, phone, push, merge or deployment was used.
