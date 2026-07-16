# Production Bootstrap Hardening Runbook

## Scope

This slice hardens startup and browser/provider boundaries for the NestJS/PostgreSQL platform backend. It adds no database migration, changes no tenant data and does not deploy or modify the website, PWA, iOS bundle, Python/SQLite runtime or live provider applications.

Production configuration is validated before NestJS opens its listening port. Unsafe configuration stops startup with setting names and policy violations only; secret values are never included in validation errors.

## Fail-closed production configuration

The following independent secrets are required in `NODE_ENV=production` and must each contain at least 32 characters:

- `JWT_SECRET`;
- `AUTH_REFRESH_TOKEN_SECRET`;
- `AUTH_SESSION_METADATA_SECRET`;
- `AUTH_RATE_LIMIT_SECRET`;
- `PHONE_AUTH_SECRET`;
- `CRM_ENCRYPTION_KEY`.

Known placeholders such as `change-me`/`replace-me` are rejected. Reusing one value for two purposes is rejected so a leak or rotation of one key does not silently compromise another security boundary.

Production also requires:

- an absolute PostgreSQL `DATABASE_URL`;
- explicit `CORS_ALLOWED_ORIGINS`;
- `PHONE_AUTH_PROVIDER=auto` or `smsru`;
- a non-empty `SMSRU_API_ID`;
- debug/fixed-code/SMS test modes disabled;
- provider IDs/secrets and an OAuth redirect allowlist whenever Yandex or Telegram login is enabled;
- an HTTPS Telegram JWKS URL when Telegram login is enabled.

The validator rejects unsafe blanket `AUTH_TRUST_PROXY` values, invalid booleans and security-sensitive integer values outside their supported ranges. The phone resend cooldown cannot exceed the phone code lifetime.

## CORS policy

`CORS_ALLOWED_ORIGINS` is a comma-separated exact origin allowlist:

```env
CORS_ALLOWED_ORIGINS="https://app.example.com,https://admin.example.com,capacitor://localhost"
```

Production rules:

- wildcard origins are rejected;
- web origins must use HTTPS;
- entries cannot include a path, query, fragment or credentials;
- `capacitor://localhost` and `ionic://localhost` are accepted for an explicitly listed native wrapper;
- requests without an `Origin` header remain available to native/server/provider clients;
- only the configured origins receive browser CORS approval;
- supported methods and request headers are explicit;
- `Retry-After` is exposed so browser auth countdowns can read it.
- the Express implementation fingerprint is disabled.

Development uses a narrow built-in localhost/loopback/Capacitor allowlist only when `CORS_ALLOWED_ORIGINS` is empty. It never falls back to `*`.

## OAuth redirect policy

`OAUTH_ALLOWED_REDIRECT_URIS` is a comma-separated exact callback allowlist:

```env
OAUTH_ALLOWED_REDIRECT_URIS="https://app.example.com/oauth-callback.html"
```

The URI sent by a client must exactly match a normalized server allowlist entry before an auth flow is persisted. Production callbacks must use HTTPS. Userinfo, query strings and fragments are rejected.

Development may use an unlisted HTTP callback only on `localhost`, `127.0.0.1` or `::1`. This exception cannot activate under `NODE_ENV=production`.

The same exact callback must be registered in the Yandex/Telegram provider dashboard. A rejected callback returns the stable `social_redirect_invalid` code before provider exchange or identity writes.

## Swagger policy

- Swagger remains enabled by default in development/test.
- Swagger is disabled by default in production.
- `SWAGGER_ENABLED=true` is an explicit operator override and should be used only behind a reviewed private access boundary.

## Numeric boundaries

| Setting | Accepted range |
|---|---:|
| `PORT` | 1-65535 |
| `JWT_ACCESS_TTL_SECONDS` | 300-3600 |
| `AUTH_REFRESH_TOKEN_TTL_DAYS` | 1-90 |
| `PHONE_AUTH_CODE_TTL` | 60-900 |
| `PHONE_AUTH_RESEND_COOLDOWN_SECONDS` | 1-900 and no greater than code TTL |
| `PHONE_AUTH_MAX_ATTEMPTS` | 1-10 |
| `AUTH_FLOW_STATE_TTL_SECONDS` | 60-1800 |
| `OAUTH_PROVIDER_TIMEOUT_MS` | 1000-60000 |
| `SMSRU_TIMEOUT_MS` | 1000-60000 |
| `AUTH_RETENTION_SESSION_DAYS` | 7-365 |
| `AUTH_RETENTION_CHALLENGE_HOURS` | 1-168 |
| `AUTH_RETENTION_RATE_LIMIT_HOURS` | 1-720 |
| `AUTH_RETENTION_BATCH_SIZE` | 1-10000 |

## Secret preparation

Generate every required secret independently in the deployment secret store. For example, run the following separately for each secret and never paste the results into source, docs, issues or chat:

```bash
openssl rand -base64 48
```

Changing `JWT_SECRET` invalidates access JWTs. Changing `AUTH_REFRESH_TOKEN_SECRET` invalidates outstanding refresh credentials. Changing `CRM_ENCRYPTION_KEY` without a re-encryption migration makes existing encrypted values unreadable. Key rotation therefore remains a separately planned operation.

## Rollout checklist

1. Keep production traffic on the existing runtime.
2. Prepare independent secrets in the target environment's secret store.
3. Set exact web/native CORS origins and OAuth callbacks for that environment.
4. Register the exact OAuth callback in each enabled provider dashboard.
5. Configure the real reverse-proxy allowlist; never trust all internet sources.
6. Keep `PHONE_AUTH_DEBUG=false`, `PHONE_AUTH_FIXED_CODE` empty and `SMSRU_TEST=false`.
7. Keep `SWAGGER_ENABLED=false` unless private access is deliberately provided.
8. Start the backend in a private pre-production environment and confirm validation succeeds before exposing a route.
9. Verify allowed and denied CORS preflights, a denied OAuth callback, SMS transport and health.
10. Only then proceed through the separately reviewed migration/cutover plan.

Example checks against a private pre-production endpoint:

```bash
curl -i -H 'Origin: https://allowed.example.com' https://api.example.com/api/health
curl -i -H 'Origin: https://denied.example.com' https://api.example.com/api/health
curl -i https://api.example.com/api/docs
```

The allowed response must contain its exact `Access-Control-Allow-Origin`. The denied response must not contain an allow-origin header. Production docs should return `404` when Swagger is not explicitly enabled.

## Verification

```bash
cd maya-saas-backend
npm run prisma:generate
npx prisma validate
npm run typecheck
npm run typecheck:scripts
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

Security tests must cover:

- development defaults without production credentials;
- production startup with a complete independent secret set;
- missing, short, placeholder and duplicate secrets;
- wildcard/insecure/path-bearing CORS entries;
- requests with allowed, denied and absent origins;
- debug phone delivery and missing production SMS transport;
- enabled providers with missing credentials or redirect allowlist;
- exact allowed/unlisted/loopback OAuth callbacks;
- production Swagger default-off behavior.

## Recovery and remaining work

This slice has no database rollback. A configuration rejection is recovered by correcting the named environment setting and restarting the unopened process. Code rollback should be a reviewed forward deployment; do not re-enable wildcard CORS or arbitrary redirects as an incident workaround.

Remaining hardening:

- add reviewed HTTP security headers/CSP/HSTS at the reverse proxy and application boundary;
- move production values into the selected managed secret store and exercise rotation procedures;
- export privacy-safe auth/config rejection metrics and alerts;
- minimize/encrypt retained provider profile PII;
- complete backup/restore and data export/deletion exercises before external tenants.

Production remains unchanged until a separately reviewed deployment and cutover is approved.
