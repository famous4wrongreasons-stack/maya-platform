# Authentication Abuse Protection Runbook

## Scope

This slice adds shared PostgreSQL-backed rate limits to public authentication and self-serve onboarding. It protects password login, registration, phone start/verify, Yandex and Telegram start/complete, refresh rotation and trial signup.

The implementation does not use process memory, so multiple NestJS instances enforce the same counters. It does not change the website, PWA, iOS bundle, Python runtime, live providers or production infrastructure.

## Storage and privacy

`AuthRateLimitBucket` stores one anchored fixed-window row per policy and HMAC subject:

- `policyKey`, action and scope;
- optional resolved tenant ID;
- HMAC-SHA256 subject hash;
- attempt count and window timestamps.

Raw IP addresses, tenant hints, email addresses, phone numbers, OAuth states and refresh tokens are never persisted. Tenant and identity rules run only after a server-resolved tenant or authenticated session context. IP rules remain global across tenants so cycling tenant slugs cannot bypass one source budget.

Rules are consumed in deterministic low-cardinality order: IP, tenant, then identity. Once an IP or tenant rule is blocked, the transaction returns without creating a new identity row. This prevents attackers from growing the table by varying email or phone values after they already receive `429`.

## Default policies

| Action | Preflight limits | Resolved limits |
|---|---|---|
| Password login | IP 50/15m; tenant-hint identity 12/15m | tenant 500/15m; email 10/15m |
| Registration | IP 20/1h; tenant-hint identity 5/1h | tenant 100/1h; email 3/1h |
| Phone start | IP 20/10m; tenant-hint phone 5/10m | tenant 200/10m; phone 1/60s and 5/10m |
| Phone verify | IP 60/10m; tenant-hint phone 15/10m | tenant 1000/10m; phone 10/10m |
| OAuth start | IP 30/10m | tenant 500/10m |
| OAuth complete | IP 60/10m; state 5/10m | tenant 1000/10m; state 3/10m |
| Refresh | IP 240/15m; refresh credential 6/15m | tenant 5000/15m; session 20/15m |
| Trial signup | IP 10/24h; owner email 3/24h | none before tenant creation |

The existing phone challenge still allows at most five invalid code attempts. The new phone-start identity rule additionally makes the advertised 60-second resend cooldown enforceable on the server.

## HTTP contract

Every distributed limit returns status `429`, a standard `Retry-After` response header and:

```json
{
  "message": "Too many authentication attempts. Try again later.",
  "error": {
    "code": "auth_rate_limited",
    "message": "Too many authentication attempts. Try again later.",
    "retry_after_seconds": 60
  }
}
```

Clients must disable only the affected action for the supplied duration. They must not retry automatically in a loop.

## Trusted proxy configuration

Authentication metadata now uses only Express `request.ip`. Raw `X-Forwarded-For` is never parsed by application code.

- Leave `AUTH_TRUST_PROXY` empty when clients connect directly to NestJS.
- For a same-host reverse proxy, use an explicit value such as `loopback`.
- For a private proxy network, provide a comma-separated allowlist such as `loopback,10.0.0.0/8`.
- Never configure a blanket trust value for an internet-exposed application port.
- The trusted reverse proxy must overwrite, not append to, untrusted client forwarding headers.

An incorrect allowlist can collapse all clients into the proxy IP or let clients rotate spoofed IP values. Verify the deployment path before enabling public auth.

## Configuration and rollout

- Generate an independent high-entropy `AUTH_RATE_LIMIT_SECRET`. JWT/session secrets are compatibility fallbacks, not the recommended production configuration.
- All running instances must use the same rate-limit secret.
- Apply migration `20260711233000_auth_abuse_protection` before starting code that writes buckets.
- Secret rotation starts new HMAC subjects and temporarily resets active limits. Rotate only in a controlled maintenance window.
- The limiter fails closed on database errors; auth requests do not silently bypass unavailable shared storage.

No current user, session or tenant data is modified by the migration.

## Verification

```bash
cd maya-saas-backend
npm run prisma:generate
npx prisma validate
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

Database verification must cover fresh and upgrade migrations, schema drift, check/FK rejection, HMAC-only subjects and separate hashes for the same identity in two tenants.

HTTP verification must cover:

- the second immediate phone-start request returning `429`;
- exactly one successful request in a concurrent same-phone burst;
- IP limits remaining effective while `X-Forwarded-For` values change;
- `Retry-After` matching `retry_after_seconds`;
- password and invalid-refresh limits;
- no identity-row growth after an IP is blocked;
- an expired window resetting atomically.

## Remaining work

- Bounded auth retention cleanup continues in [auth-retention-maintenance-runbook.md](auth-retention-maintenance-runbook.md); production scheduling remains a separate cutover step.
- Export privacy-safe blocked-action metrics and alert on sustained attack patterns.
- Move policy thresholds to a validated operations configuration only if production traffic requires per-environment tuning.
- Consider edge rate limits as an additional layer; they do not replace application identity and tenant limits.

Production remains unchanged until a separately reviewed migration and cutover is approved.
