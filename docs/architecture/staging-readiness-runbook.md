# Staging Readiness Runbook

## Scope

This runbook moves the consolidated Maya platform from a green pull request to
an isolated staging environment. It does not authorize a production deploy,
change the existing salon application, enable live CRM writes or copy production
data.

The default staging posture is fail-closed:

- use a dedicated PostgreSQL database and dedicated provider applications;
- use synthetic tenants and synthetic client data;
- keep every tenant in `preview` booking mode;
- keep real SMS, payments and CRM writes disabled until their individual gates
  are approved;
- store secrets only in the deployment platform's secret store;
- never paste secret values into source, documentation, issues or chat.

## Gate 0: Merge readiness

The integration pull request must be green before staging work begins:

1. NestJS typecheck, script typecheck, lint, unit tests, e2e tests and build pass.
2. Prisma validates and all migrations apply to a clean PostgreSQL database.
3. Legacy Python compilation and tests pass.
4. Browser bundles parse without conflict markers or invalid inline JavaScript.
5. The iOS mirror builds from its own reviewed pull request.
6. Dependency audit has no high or critical production dependency finding.
7. The compiled-backend HTTP smoke confirms tenant fencing, session rotation,
   preview booking and a fail-closed live-write boundary.

Do not bypass a failed gate by weakening CI, tenant checks, CORS, OAuth callback
validation or production configuration validation.

## Gate 1: Private staging foundation

Prepare an environment that is not connected to existing production traffic:

1. Create a dedicated staging PostgreSQL database with backups enabled.
2. Create a staging API service and run `prisma migrate deploy` before starting
   the application.
3. Generate every required secret independently in the platform secret store.
4. Configure exact staging CORS origins and exact OAuth callback URLs.
5. Keep Swagger private or disabled and expose only the required API routes.
6. Add HTTPS, health checks, structured logs and basic error/latency alerts.
7. Confirm that production DNS and the current Python/SQLite runtime are
   unchanged.

## Gate 2: Synthetic tenant verification

Use only synthetic records at this gate:

1. Bootstrap the default Maya tenant and a separate demo tenant.
2. Create owners and clients independently in both tenants.
3. Verify that JWTs, refresh sessions, memberships, branding, appointments and
   client state from one tenant cannot be read or changed from the other.
4. Verify onboarding, logout, refresh rotation, revocation, rate limits and
   retention cleanup.
5. Verify the storefront to onboarding to admin to client-app path.
6. Verify PWA offline restore and the iOS wrapper against the staging API.
7. Keep booking in `preview`; no external CRM mutation is allowed.

Any tenant-isolation failure blocks the release. Fix it in code and repeat the
clean-database test rather than patching staging data manually.

## Gate 3: Provider sandbox verification

Enable integrations one at a time with dedicated staging credentials:

1. Register exact Yandex ID and Telegram callback URLs in their provider
   dashboards, then test success, denial, expiry and replay paths.
2. Connect an SMS provider test account and verify delivery, resend cooldown,
   rate-limit responses and fallback copy without logging phone numbers.
3. Connect a payment-provider sandbox only after webhook signature,
   idempotency and entitlement tests exist.
4. Confirm logs and alerts contain no tokens, authorization codes, phone numbers
   or provider profile payloads.

Provider credentials remain outside Git and are entered directly by the account
owner or deployment operator.

## Gate 4: Read-only CRM canary

A real salon may be connected only after Gates 0-3 pass and the owner approves
the selected account:

1. Create dedicated least-privilege YClients credentials when the provider
   supports them.
2. Start with service, staff, schedule and availability reads only.
3. Reconcile displayed data against YClients without changing appointments.
4. Confirm tenant binding before every adapter request and confirm encrypted
   credential storage.
5. Keep `booking_mode=preview` until the owner accepts the reconciliation.

The existing salon application continues to operate independently throughout
this gate.

## Gate 5: Live-write canary

Live booking is a separate, explicit decision:

1. Select one tenant, one location and a limited time window.
2. Take a database backup and record the previous feature and booking settings.
3. Enable live writes only for the selected tenant.
4. Test create, cancel and non-destructive reschedule operations with a reviewed
   appointment.
5. Monitor duplicates, provider errors, latency and audit events.
6. Disable live mode immediately if reconciliation differs from YClients.

Do not use delete-and-recreate for rescheduling. YClients remains the source of
truth during the canary.

## Rollback

Rollback is configuration-first:

1. Set the affected tenant back to `preview` and disable provider writes.
2. Keep the existing production application and DNS serving their previous
   versions.
3. Preserve audit logs and provider request IDs for investigation.
4. Restore a database only for database loss or corruption, not to hide an
   application defect.
5. Ship a reviewed forward fix through CI before retrying the failed gate.

## Actions requiring the project owner

Codex can prepare and verify code, migrations, CI and staging commands. The
following actions require the project owner because they change external
accounts, costs or production exposure:

- choose the staging host and approve its budget;
- create or authorize DNS records and TLS/domain ownership;
- create provider applications/accounts for Yandex ID, Telegram, SMS, payments
  and YClients;
- enter provider credentials directly into the selected secret store;
- approve which real salon account may be used for the read-only canary;
- approve the exact tenant and time window before enabling live CRM writes;
- approve the final production cutover and rollback window.

Until these actions are explicitly approved, production and the existing salon
application remain unchanged.
