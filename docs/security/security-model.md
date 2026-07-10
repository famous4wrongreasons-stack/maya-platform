# Security Model

## Assets and boundaries

Protected assets include tenant business data, customer PII, integration credentials, payment identifiers, AI tool authority and platform administration. Browser/PWA, Telegram, external webhooks and CRM payloads are untrusted boundaries.

## Identity and session security

- Passwords use a modern adaptive hash; provider identities are linked explicitly.
- Access tokens are short-lived and validated against current user and membership state.
- Refresh token rotation/session revocation is required before broad production rollout.
- Active tenant is a signed session choice backed by membership, not a raw header.
- Platform roles do not implicitly bypass tenant repositories.

## Authorization

- Default deny.
- Membership, permission, resource scope and entitlement are separate checks.
- Foreign IDs do not disclose resource existence.
- Sensitive operations write an immutable audit record with actor, tenant, action, target and request ID.

## Data protection

- PII is encrypted at rest where required and minimized in responses/logs.
- Searchable identifiers use keyed hashes scoped to appropriate boundaries.
- CRM, SMS, OAuth, payment and AI secrets live in secret storage/environment, never docs or source.
- Key rotation metadata and re-encryption jobs are designed before production migration.
- Backups are encrypted and restore-tested.

## API and transport

- TLS only in production; strict CORS allowlist replaces wildcard.
- DTO/schema validation rejects unknown fields.
- Rate limits are identity, IP and tenant aware.
- Mutating public endpoints use CSRF protection when cookie authentication is introduced.
- Webhooks verify signature/secret, enforce replay windows and idempotency.
- File uploads validate bytes, type, size, path and serving headers.

## AI security

- LLM receives redacted context and no raw credentials.
- Tool calls use typed schemas and trusted TenantContext.
- Permission, entitlement, confirmation and rate-limit policy run outside the model.
- Prompt output cannot select another tenant or arbitrary backend operation.

## Logging and observability

Technical logs include request ID, tenant ID, route, duration and error class, but no token, password, CRM credential, payment details or raw customer PII. Audit logs and application logs have separate retention/access policies.

## RLS

PostgreSQL RLS is a planned defence-in-depth control. Application isolation remains authoritative. RLS rollout requires transaction-local tenant context, a non-bypass application role and integration tests proving jobs/admin paths cannot leak data.

## Retention and privacy workflows

- Consent version and source are auditable.
- Export and deletion requests have scoped, asynchronous workflows.
- Legal retention can produce a tombstone/anonymized record rather than unsafe hard deletion.
- Tenant closure includes export, credential revocation, retention window and eventual purge.

## Threat-driven tests

- IDOR across all tenant resources.
- Forged tenant headers/route IDs.
- Stale JWT after membership suspension.
- Cross-tenant relation writes.
- Webhook replay/signature bypass.
- Secret/PII leakage in errors and logs.
- AI tool escalation and confirmation bypass.
