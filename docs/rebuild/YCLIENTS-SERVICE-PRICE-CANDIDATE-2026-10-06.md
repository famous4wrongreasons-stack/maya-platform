# YCLIENTS single-service fixed price — local candidate YC-SP1

Base: `c6a35e5c61975e9d101326e7b3970331f3c905d8`, parent
`158a9a413aaa1f529f2fcd6bb54d9f2e33055b8a`.
The source checkout was clean; implementation is isolated on
`codex/maya-yc-service-pricing-20261006`. This is neither a release authorization
nor a production/provider acceptance report.

## Authority and exact registration

The parent supplied the user's explicit request to let MAYA configure YCLIENTS
from chat, including «менять цены», and the 2026-10-06 request to work on this
broader functionality in parallel. The parent then explicitly authorized the
bounded **local candidate** registration: OWNER-only, one existing service,
fixed price, explicit approval, preserve other fields, UNKNOWN without blind
retry. This authorizes this named implementation; it grants no production role,
provider permission, deployment or live mutation.

| Layer | Existing owner / added named registration |
|---|---|
| Chat | `AiCoreService` → `catalog.services.read` → deterministic exact title/amount binding |
| Tool | `catalog.service.price.update`, owner only, actor approval, required idempotency |
| Approval | Existing immutable encrypted `AiApprovalRequest`; changed pending proposal supersedes only the same actor's same-service pending card |
| CRM owner | `CrmService.prepareServicePriceChange` / `applyServicePriceChange` |
| Action Engine | `crm.service.fixed-price.update.v1`; action `update_crm_service_fixed_price`; target `crm_service`; executor `crm.service.fixed-price` |
| Policy | Current tenant owner membership, unrestricted branch scope, `crm.integration`, exact current integration and approved payload |
| Provider | Typed `YclientsCRMAdapter` management GET + permission GET + one PATCH + fresh readback |

A28 remains **internal** service/catalog/calendar authority. No A28 contract,
Client identity, B35 contract, website booking path, AE state/lease/reconciliation
semantics, database schema or migration is changed. C9 remains a proposal owner,
not a mutation authority. The existing confirmed-request pattern uses the
verified outer approval; it does not add a second approval lifecycle in AE.

## Provider contract and boundaries

The supplied official snapshot is
`yclients-official-openapi-2026-10-05.json`; capability catalog SHA-256 is
`6a42e3714f7b6fdf3cb7a5fab74736b02ce69f62957344726dacabd8ffa57b93`.

The exact route is `PATCH /api/v1/company/{company_id}/services/{service_id}`.
Its schema requires fourteen fields, not just the two prices. The adapter
preserves all present allowlisted request fields, explicitly preserves the
technical break and limited booking dates, and hashes the observed non-price
state as well. Missing required fields, unknown chain authority, price ranges,
group services, non-RUB configuration, or richer staff-link settings without a
qualified preservation contract refuse before PATCH. No default duration,
tax mode, price, staff settings or business fact is invented.

`GET /api/v1/user/permissions/{company_id}` must confirm all three service
access/edit/price permissions. Sparse official GET examples do not meet this
preflight: this is reported as incomplete provider state, not lack of an API.
Exact source/provider qualification remains necessary before enabling a real
integration. Staff technology/resource settings and chain pricing need their
own preserved-state contracts; create, broader edit and archive follow those
dependencies and are not implemented by this fixed-price action.

Only explicit `success:true`, exact service/company identity and requested
prices in the PATCH response, followed by uncached matching readback, produce
SUCCEEDED. Empty/malformed 2xx, lost replies, wrong receipts or divergent
readback remain UNKNOWN. A GET matching the requested price cannot attribute
the write to our request; reconciliation only observes and retains UNKNOWN.
There is no POST, PUT fallback or redispatch. A previous unresolved execution
holds new changes of the same tenant/company/service. An advisory transaction
serializes competing MAYA commands; a fresh before-state rejects stale approval.
The official API has no documented compare-and-swap: an external editor race
cannot be eliminated or called atomic by this candidate.

Provider work has one twenty-second budget inside the unchanged thirty-second
AE lease. A proven pre-PATCH refusal is definitive; an uncertain crossed PATCH
boundary is UNKNOWN. Same-key replay restores the approved immutable input
instead of rereading and silently generating a different proposal.

Natural chat support is deliberately bounded: an exact unambiguous current
catalog title and one explicit fixed amount in rubles; uninterrupted price-only
corrections retain that service. The model cannot choose the service or invent
the amount. Percentages, relative increases, ranges, deferred/conditional changes,
ambiguous titles and unresolved language require clarification. A script-driven
model proves routing, not real model quality or every Russian expression.

## Current React carrier: explicit remaining gate

**The end-to-end user-reachable vertical is not complete.** The HTTP approval
owner works; the current React carrier intentionally drops `action.approval`
(`maya-chat-shell/src/net/project.ts`) and returns `approval_not_here`
(`shell/conversation.ts`). Exact diff remains available in chat text. No legacy
approval button or direct HTTP bypass was added to the carrier.

[F37/F38](MAYA-WIDGET-CONTRACT-V1.md) says: “A missing mapping is a GAP, and a
GAP has no button.” `AE_PROPOSE_PAIRING` is the literal reviewed table;
`ApprovalRequestAdapter` currently admits only B35. The new capability is
automatically a fail-closed `GAP-SEPARATION-OF-DUTIES`, absent from the pairing
and widget commit allowlist. All existing pairs are retained. Broad functionality
authorization provides the business intent, but the current frozen contract
does not define which approval identity the new widget may consume: a B35 AE
approval identity cannot be substituted for this exact `AiApprovalRequest`.

Recommended next named decision **YC-SP1-WIDGET-1**:

- Admit exactly `catalog.service.price.update` →
  `AiToolHandlerService` → `CrmService.applyServicePriceChange` →
  `crm.service.fixed-price.update.v1` as the new F38 pair.
- Reuse the canonical APPROVAL presentation and gateway with a dedicated typed
  pricing approval owner that consumes this exact tenant/requester/payload-bound
  `AiApprovalRequest`; retain the existing explicit approval and receipt flow.
  Do not route it through the B35 owner or convert `approval_not_here` into an
  unchecked frontend button.
- Specify the corresponding typed approval noun, stale/superseded decision,
  minter/provenance and current-principal authority rows. Preserve every previous
  F38 pair, B35 behavior, allowlist row and Client/website path.
- Prove current React request/preview/approve/reject/changed-price/restart,
  revoked/foreign authority and UNKNOWN through the existing widget gateway.

This document recommends that row and qualification work; it does not silently
approve or implement the frozen carrier registration.

## Evidence and independent review

The [local evidence manifest](evidence/yc-service-pricing-20261006/manifest.json)
records typecheck, 14/14 actual HTTP/PostgreSQL tests, 298/298 focused tests over
ten suites, scoped ESLint over 21 files and `git diff --check`, all passing. The
owned loopback PostgreSQL cluster was stopped after verification. Tests use
synthetic data only, actual HTTP/auth/AE/PostgreSQL, and the real adapter against an owned
loopback HTTP fixture. No real YCLIENTS/model call, production DB/config, existing
HTTPS stand, phone, push, merge or deployment was used.

Independent review identified and led to repairs for lossy non-price numeric
conversion, false UNKNOWN before PATCH, total provider work exceeding the AE
lease, invalid historical chat-anchor inheritance, and terminal failed replay
incorrectly returning a pending proposal. Remaining limitations
are explicitly the provider preservation/receipt contract, external-editor CAS,
bounded language coverage, and the frozen carrier approval gate above.
