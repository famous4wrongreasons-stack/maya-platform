# MAYA OS Project Completion Audit

Status date: 2026-07-13.

This audit separates implemented code, frontend integration, production
operations, owner-controlled external setup and intentionally deferred product
scope. It is the canonical completion queue after the verified-trial backend
slice.

## Executive status

MAYA currently has two runtimes:

1. The current single-business MAYA product contains the deepest client,
   specialist, administrator and owner AI behavior.
2. The NestJS/PostgreSQL platform contains the isolated multi-tenant foundation,
   onboarding, booking, internal calendar, auth, trial and billing contracts.

The platform backend is not deployed to production. The current live product is
unchanged. The project is therefore not commercially complete even though the
main platform vertical slices pass CI.

## Branch and PR state

The platform work is intentionally stacked and does not modify `main` directly.
At the time of this audit:

- PR 10 integrates the multi-tenant release candidate into a branch based on
  `main`.
- PR 11 adds the MAYA-managed internal calendar.
- PR 12 adds privacy-safe conversational business onboarding.
- PR 13 adds human clarification, verified 10-day trials, subscription fencing
  and God Mode trial analytics.
- All CI checks for PRs 10-13 are green.
- None of these PRs is merged into `main` yet.
- Claude is implementing the trial/onboarding frontend on the isolated local
  branch `codex/maya-os-trial-chat-fe`; its `app.html` is currently modified and
  must not be touched by backend work.

## Implemented in the platform backend

### Multi-tenancy and security

- Tenant, Membership and TenantContext.
- Trusted tenant resolution from session, host or explicit trusted flow.
- Tenant-scoped appointments, users, CRM, branding, audit and billing writes.
- Cross-tenant negative-path tests.
- Revocable sessions and one-time refresh rotation.
- Tenant-scoped password, phone, Yandex and Telegram auth state.
- Distributed public-auth rate limiting and bounded retention cleanup.
- Production startup validation, strict CORS and OAuth redirect allowlists.
- Subscription access fence and machine-readable HTTP 402 responses.

### Business setup and booking

- Universal industry presets instead of salon-only architecture.
- Trial activation separated from completed business registration.
- Conversational onboarding draft with deterministic fallback, model-backed
  interpretation, confidence, clarification and backend quick replies.
- Privacy redaction before semantic model interpretation.
- Internal calendar services, providers, weekly availability and time off.
- External YClients/Altegio catalog, staff, availability, create, cancel and
  non-destructive reschedule operations.
- Customer booking preview/live policy, available days, own appointments,
  cancel and reschedule.
- Logo upload and compatibility branding API.

### Commercial lifecycle

- Ten-day full-access trial starts only after successful registration.
- Connected-business analytics counts only completed registrations.
- Trial expiry produces `subscription_required` and disables full trial access.
- Plan catalog, tenant entitlements and feature guards.
- YooKassa checkout, verified webhook reconciliation, saved payment method,
  recurring charge path and due-billing operation.

## In progress with Claude

These are frontend responsibilities and must not be duplicated by Codex:

- Recompose authentication so the trial CTA is primary and email joins Yandex
  and Telegram in the secondary auth group.
- Build the 10-day trial bottom sheet and activation swipe.
- Reuse the canonical MAYA chat for business onboarding instead of a separate
  settings chat.
- Render backend assistant messages, clarification state and quick replies.
- Keep activation and draft credentials in session-only state.
- Present confirmation, logo-only branding and CRM connection inside the normal
  MAYA conversation.
- Render remaining trial days and the subscription-required sheet.
- Add verified connected-business analytics to God Mode.
- Mirror the accepted PWA changes to iOS and run Capacitor sync.

Claude completion is not accepted until the result document, screenshots,
browser flows, script parsing and iOS byte-parity checks are returned.

## Backend work that still remains

### P0: truthful capability surface

Status: implemented by the branch containing this audit.

- Separate commercial entitlement from implementation maturity.
- Publish `implementationStatus`, runtime availability and limitations for
  every feature key.
- Publish a CRM provider capability catalog.
- Reject planned CRM scaffolds before storing credentials.

### P0: release integration after Claude

- Review Claude's diff without overwriting unrelated frontend work.
- Run the complete backend, legacy Python and frontend CI suites.
- Run fresh PostgreSQL migrations and the real HTTP smoke.
- Test the activation-to-onboarding-to-subscription journey in a browser.
- Create one final release-candidate branch/PR with a documented rollback path.
- Do not deploy or merge to production until the owner approves the release.

### P0: staging deployment and acceptance

- Deploy the NestJS backend on a separate API domain and dedicated PostgreSQL
  database.
- Configure TLS, reverse proxy, backups, log retention and health monitoring.
- Apply migrations and seed only synthetic staging tenants.
- Verify tenant isolation with two independent tenants.
- Verify YClients in preview mode before enabling any live write.
- Verify OAuth, SMS and YooKassa sandbox behavior without printing secrets.

This block cannot be completed from code alone. It requires owner-controlled
infrastructure and provider credentials.

### P1: universal role-aware AI runtime

This is the largest remaining product gap.

- The current MAYA product has rich owner, administrator, specialist and client
  tools, but the full tool runtime still lives in the single-business Python
  backend.
- The platform backend currently has AI onboarding, not a complete tenant-aware
  runtime for `ai.owner`, `ai.admin` and `ai.consultant`.
- Build a typed Tool Registry and policy engine in the platform boundary.
- Port read-only client booking tools first, then specialist context, admin
  operations and owner analytics.
- Require tenant context, membership, entitlement, role, ownership and approval
  policy for every tool execution.
- Preserve PII redaction and never grant direct model-to-database access.
- Keep money, permissions, mass messaging and destructive actions behind human
  approval.

### P1: tenantize current-product modules

The following capabilities exist in the current MAYA product but are not yet
complete universal platform modules:

- loyalty and points ledger;
- certificates, memberships and redemption;
- referrals;
- staff cabinet and team chat;
- notifications and campaign delivery;
- customer records beyond basic identity/profile;
- expenses and finance;
- specialist, location and business analytics;
- owner tasks, control loops and safe autonomous director behavior.

Each module needs a tenant-owned data model, API, role/ownership tests, migration
or compatibility adapter and event/audit behavior before the feature registry
may mark it platform-ready.

### P1: production operations

- Add production metrics for auth, booking, CRM, payment and AI latency/errors.
- Alert on failed webhooks, recurring billing failures, rate-limit spikes and
  cross-tenant denials.
- Schedule due billing and retention cleanup through a reviewed single-runner or
  distributed lease.
- Add database backup and restore drills.
- Add provider request IDs and reconciliation dashboards.
- Define incident rollback from live booking to preview per tenant.

### P2: additional integrations and optional modules

- Implement DIKIDI only after obtaining an official API contract and test
  account.
- Implement Whitelines only after obtaining an official API contract and test
  account.
- Implement Salon Online only after obtaining an official API contract and test
  account.
- Add custom-domain verification, certificate issuance and routing.
- Decide whether video analytics is a real product module or remove its reserved
  flag from sellable plans.
- Keep CutMatch founder-only until consent, biometric/photo retention and wider
  product policy are approved.

## External actions required from the project owner

The owner must perform or authorize these actions directly. Secrets must be
entered into a server secret store, never pasted into chat or committed:

- Choose the staging/production server and PostgreSQL service.
- Choose the API hostname and authorize DNS/TLS changes.
- Create independent production secrets for JWT, refresh sessions, rate limits,
  phone auth and CRM encryption.
- Create and configure the SMS.ru account.
- Create Yandex ID and Telegram applications and register exact callbacks.
- Configure the YooKassa shop, sandbox/production keys and webhook URL.
- Provide a least-privilege YClients/Altegio tenant token and company ID for
  staging acceptance.
- Choose which additional CRM should be implemented first; API access must be
  available before coding starts.
- Approve the final release candidate and production cutover window.

## Voice and natural language

- The current app already has voice input and realtime MAYA.
- Claude's current package is required to reuse that voice input inside the
  canonical onboarding chat.
- No separate platform voice endpoint should be added until the frontend result
  proves the existing transcription path cannot submit normal onboarding text.
- Broad slang interpretation requires a configured model provider. Without an
  API key, the deterministic safe parser remains intentionally narrower.
- Model configuration is an operational dependency, not a reason to bypass
  privacy redaction or clarification.

## Intentional boundaries, not unfinished work

The following restrictions are product safety rules and must not be removed to
claim project completion:

- MAYA does not change prices, salaries or access permissions autonomously.
- MAYA does not charge, refund or transfer money autonomously.
- MAYA does not launch mass customer messaging without confirmation.
- MAYA does not change a customer's appointment without an authorized request.
- MAYA does not send raw PII or CRM credentials to a language model.
- MAYA does not cross tenant boundaries.
- Potential revenue remains an estimate, not a guaranteed result.

## Recommended execution order

1. Complete and review Claude's trial/chat frontend package.
2. Integrate the stacked release candidate and repeat all checks on a fresh DB.
3. Perform isolated staging deployment with owner-provided credentials.
4. Complete YClients/Altegio preview acceptance and only then enable live mode
   for the test tenant.
5. Build the universal role-aware AI Tool Registry and read-only client tools.
6. Tenantize staff/admin/owner modules in small vertical slices.
7. Add optional CRM adapters and future features only after the core platform is
   stable and observable.
