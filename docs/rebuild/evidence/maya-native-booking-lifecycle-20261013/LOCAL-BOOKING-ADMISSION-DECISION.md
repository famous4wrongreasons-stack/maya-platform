# Local booking admission — decision required, 2026-10-13

Status: PROPOSED ONLY. No authorization, trust, database copy, grant, provider call or product change is issued by this document.

**Subsequent owner decision, 2026-10-13:** Option A approved for local
implementation and synthetic verification. The proposal below is retained as
the decision's provenance. Implementation contract: `LOCAL-STAGING-AR1.md`.
Real execution preconditions below remain open; the approval does not authorize
database copying, real signing/grants, spending or external effects.

## Established boundary

Current development branch: `codex/maya-local-crm-setup-20261010`.
The native lifecycle proof candidate is `374965c5` (full SHA in the accompanying fresh receipt).
Real history acceptance on `ccd8ad91` does not certify booking or grant widgets.

Verified from current source:

- `maya-saas-backend/src/widgets/widgets.controller.ts`: widget ingress requires `widgets.runtime`.
- `maya-saas-backend/scripts/local-owner-history-review-policy.mjs`: the retained owner session admits exactly the two history questions. It does not admit booking.
- `maya-saas-backend/scripts/local-onboarding-profile.mjs`: the retained database/runtime has `NODE_ENV=development`, a fixed `maya_local_onboarding_<hex>` database, and a closed environment allowlist. It is neither a synthetic proof DB nor an AR-1 staging database.
- `maya-saas-backend/src/entitlements/widget-release-policy.service.ts`: synthetic grants require the proof-database boundary; staging grants require `maya_widget_release_staging_*`.
- `maya-saas-backend/src/entitlements/widget-release-production.contract.ts`: the existing single-operator V2 authorization explicitly requires `environment=production`.
- `maya-saas-backend/src/entitlements/widget-release.contract.ts`: the older staging authorization requires an independent reviewer; the founder's second signature cannot satisfy it.
- `maya-saas-backend/src/entitlements/widget-release.service.ts`: a real global platform User/session is required. A salon owner's login does not authorize a release.

Therefore changing the environment label, adding a fixture entitlement or reusing the completed history permit would not be a legitimate local booking admission. No such change was made. Current platform account/signing availability has NOT been established in this pass; absent verification is not proof those credentials do not exist.

## Decision

**QUESTION:** Should the already-approved single-operator governance also be implemented for a separately bounded non-production staging execution in the existing AR-1 engine?

**OPTION A — recommended:** Implement an explicit versioned staging single-operator contract within the existing AR-1 writer. Do not broaden the production V2 parser, trust store or environment binding. The staging contract uses its own explicit environment and trust namespace and cannot authorize production. Preserve exact candidate/build/certificate/profile/tenant, a genuine global platform operator, explicit `independentHumanReview=false`, `reviewerId=null`, CAS, atomic audit, maximum 24 hours, no auto-renew, revoke/expiry, no plan/trial grant, HANDOFF STOP and all personal Client/Action Engine checks. There is no founder or first-tenant bypass and no second release engine. Implement and prove only on disposable synthetic databases first.

For later owner-data acceptance, prepare a separately named private staging snapshot of the retained database on this Mac, with the same identity/encryption lineage; preserve the original database untouched. Snapshot creation, real signer/session use, grant and external business effects remain separate execution steps and must not occur under this implementation-only decision. No repeated CRM setup or Telegram binding is intended.

**OPTION B:** Keep AR-1 unchanged. Continue read-only local acceptance; postpone the real widget booking cycle until a separately authorized release environment and current certificate exist. Do not substitute direct calls or a new form to evade widget admission.

**SECURITY CONSEQUENCE:** A authorizes new non-production execution semantics, not a weaker certificate, owner authority or production grant. Cross-environment authorization/trust substitution, missing disclosure, fabricated reviewer, stale CAS, expiry/replay, other tenants, old-token reuse and lost revoke access must fail. Real client data must never qualify a database for synthetic fixture grants merely by changing its name or NODE_ENV.

**WHAT IT UNBLOCKS:** Engineering preparation of one local AChat booking → result → reschedule → cancel session through current owners. It does not by itself make that session READY.

**SCHEMA:** No product model/column migration is proposed. Reuse the existing entitlement/audit persistence only if the implementation proves versioned grant/revoke lineage is sufficient; otherwise stop that sub-unit before migration.

## Preconditions after implementation, before any real cycle

1. Fresh release admission/certificate for the exact resulting candidate/profile; historical certification is not inherited.
2. Verified genuine platform account/session and operator-controlled signing, outside Git/chat. No agent-generated production private key, fake reviewer or manual JWT.
3. Approved private staging snapshot and source-bound runtime, with rollback/revoke ready and all background delivery disabled.
4. One bounded provider/model permit using saved keys: exact tenant/company/branch, verified personal Client, one create, one move of that same returned record ID, one cancel; explicit user confirmation before each action. Exact service/staff/date/slots must be selected from the current canonical source, not invented in this document.
5. UNKNOWN means inspect the original receipt/provider state, never create another booking to obtain a green result. Preserve exact original record/action identity on retries.
6. Provider notification behavior must be checked before authorizing the real effects. Current create/move code supplies suppression flags; DELETE has no equivalent flag in this adapter. This synthetic proof does not establish the salon's provider-side notification configuration.

No request for keys, login, model spend or real booking is made by this packet.
