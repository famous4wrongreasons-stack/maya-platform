# Security Model

## Assets and boundaries

Protected assets include tenant business data, customer PII, integration credentials, payment identifiers, AI tool authority and platform administration. Browser/PWA, Telegram, external webhooks and CRM payloads are untrusted boundaries.

## Identity and session security

- Passwords use a modern adaptive hash; provider identities are linked explicitly.
- Access tokens are short-lived, carry a signed session ID and are validated against current session, user and Membership state.
- Opaque refresh tokens rotate once; reuse revokes the whole session family. Only token HMACs are persisted.
- Active tenant is a signed session choice backed by membership, not a raw header.
- Platform roles do not implicitly bypass tenant repositories.
- Public login slugs are resolved to database tenants before entering a tenant context; raw request values never become repository authority.
- OAuth callbacks use high-entropy one-time state. The only global read accepts that opaque state, while claims and identity writes are tenant-scoped.
- Social identity ownership is enforced by a composite database relation between identity user and tenant.
- Session device metadata is minimized to a coarse label and HMAC client IP; raw refresh tokens and raw IP addresses are not persisted.

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

- TLS only in production; an exact HTTPS/native CORS allowlist replaces wildcard, exposes only required browser headers and suppresses the Express fingerprint.
- Production startup rejects missing, placeholder or shared security secrets, debug phone delivery and unsafe blanket proxy trust before opening a port.
- DTO/schema validation rejects unknown fields.
- Public auth rate limits are shared through PostgreSQL, identity/IP/tenant aware and persist only HMAC subjects.
- Mutating public endpoints use CSRF protection when cookie authentication is introduced.
- Webhooks verify signature/secret, enforce replay windows and idempotency.
- A webhook identifier may use only a dedicated system gateway; provider state is re-fetched and matched before entering tenant context.
- OAuth provider redirects require an exact deployment-specific HTTPS allowlist before flow-state persistence or live social login.
- Phone codes and OAuth states are atomically consumed; retries after a downstream failure start a new flow.
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
- Authentication maintenance removes only bounded sets of stale sessions, challenges, OAuth states and rate-limit windows after explicit retention cutoffs.
- Refresh-token history is never purged independently; consumed tokens remain available for replay detection until the inactive parent session is eligible for deletion.
- Cross-tenant maintenance accepts no tenant selector and emits aggregate counts without authentication record values.

## Threat-driven tests

- IDOR across all tenant resources.
- Forged tenant headers/route IDs.
- Stale JWT after membership suspension.
- Cross-tenant relation writes.
- Webhook replay/signature bypass.
- Phone-code and OAuth-state replay, including concurrent requests.
- Trusted-domain and public-auth tenant conflicts.
- Cross-tenant social identity/user relations.
- Refresh-token replay races, revoked access JWTs and cross-tenant session ownership.
- Distributed auth-limit concurrency, trusted-proxy spoof resistance and HMAC-only bucket storage.
- Auth-retention dry-run safety, advisory locking, bounded batches, replay-history preservation and multi-tenant cleanup behavior.
- Production config fail-closed behavior, CORS origin isolation, Swagger default-off and OAuth redirect allowlisting.
- Secret/PII leakage in errors and logs.
- AI tool escalation and confirmation bypass.
