# Maya SaaS Backend

Multi-tenant white-label strangler-backend inside the existing Maya repository. It uses `NestJS + Prisma + PostgreSQL` to migrate selected capabilities safely while the working Python/PWA product remains compatible. One API and one client application can serve many service businesses with isolated data and configuration.

## Stack

- `NestJS`
- `TypeScript`
- `PostgreSQL`
- `Prisma ORM`
- `JWT`
- `Swagger / OpenAPI`
- `Docker / docker-compose`

## What is included in v1

- Tenant, Membership and server-side TenantContext
- Domain/subdomain/session tenant resolution without trusting client tenant headers
- Tenant-scoped Appointment repository and cross-tenant isolation tests
- Feature Registry plus plan and tenant entitlement resolution
- Tenant model and white-label BrandingConfig-compatible settings
- Branches, users, CRM integrations, subscription plans, audit logs
- Auth with `JWT` containing `user_id`, `tenant_id`, `role`
- Public/mobile API:
  - `GET /api/mobile/config/:tenantSlug`
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - `POST /api/auth/phone/start`
  - `POST /api/auth/phone/verify`
  - `POST /api/auth/oauth/yandex/start`
  - `POST /api/auth/oauth/yandex/complete`
  - `POST /api/auth/oauth/telegram/start`
  - `POST /api/auth/oauth/telegram/complete`
  - `GET /api/me`
  - `PATCH /api/me`
  - `GET /api/branches`
  - `GET /api/services`
  - `GET /api/staff`
  - `GET /api/available-slots`
  - `POST /api/appointments`
  - `GET /api/appointments/my`
  - `GET /api/features/registry`
  - `GET /api/features/effective`
- Admin API:
  - `POST /api/admin/tenants`
  - `GET /api/admin/tenants`
  - `GET /api/admin/tenants/:id`
  - `PATCH /api/admin/tenants/:id`
  - `PATCH /api/admin/tenants/:id/branding`
  - `POST /api/admin/tenants/:id/logo`
  - `POST /api/admin/tenants/:id/crm`
  - `PATCH /api/admin/tenants/:id/crm`
  - `POST /api/admin/tenants/:id/test-crm`
  - `POST /api/admin/tenants/:id/suspend`
  - `POST /api/admin/tenants/:id/activate`
  - `POST /api/admin/tenants/:id/billing/checkout`
  - `GET /api/admin/tenants/:id/billing/payments`
  - `POST /api/admin/tenants/:id/billing/charge`
  - `POST /api/admin/billing/run-due`
- Billing webhook:
  - `POST /api/billing/yookassa/webhook`
- CRM adapter architecture with:
  - `MockCRMAdapter` working end-to-end
  - `YClients/Altegio adapter` for real catalog, staff, slots and appointment creation
  - `DikidiCRMAdapter` scaffold
  - `WhitelinesCRMAdapter` scaffold
  - `SalonOnlineCRMAdapter` scaffold

## Environment

Copy `.env.example` to `.env` and adjust values:

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/maya_saas?schema=public"
JWT_SECRET="change-me-in-production"
AUTH_REFRESH_TOKEN_SECRET="change-me-to-an-independent-random-secret"
AUTH_SESSION_METADATA_SECRET="change-me-to-another-independent-random-secret"
AUTH_RATE_LIMIT_SECRET="change-me-to-a-third-independent-random-secret"
CRM_ENCRYPTION_KEY="change-me-in-production"
PORT=3000
NODE_ENV="development"
CORS_ALLOWED_ORIGINS="http://127.0.0.1:8787,http://localhost:8787,capacitor://localhost"
SWAGGER_ENABLED="true"
SELF_SERVE_TRIAL_SIGNUP="false"
TENANT_BASE_DOMAIN="malesthetic.pro"
SEED_DEFAULT_TENANT_SLUG="malesthetic"
SEED_DEFAULT_TENANT_NAME="Мужская Эстетика"
SEED_PLATFORM_OWNER_PASSWORD="replace-me-before-seeding"
SEED_DEMO_TENANT_ADMIN_PASSWORD="replace-me-before-seeding"
YCLIENTS_BASE_URL="https://api.yclients.com/api/v1"
YCLIENTS_PARTNER_TOKEN="change-me-in-production"
PHONE_AUTH_PROVIDER="auto"
PHONE_AUTH_DEBUG="false"
PHONE_AUTH_SECRET="change-me-to-a-fourth-independent-random-secret"
PHONE_AUTH_CODE_TTL="300"
PHONE_AUTH_RESEND_COOLDOWN_SECONDS="60"
PHONE_AUTH_MAX_ATTEMPTS="5"
PHONE_AUTH_SMS_TEMPLATE="MAYA: код входа {{code}}. Никому не сообщайте его."
SMSRU_API_ID=""
SMSRU_FROM=""
SMSRU_TEST="false"
SMSRU_TIMEOUT_MS="15000"
AUTH_FLOW_STATE_TTL_SECONDS="600"
OAUTH_PROVIDER_TIMEOUT_MS="15000"
OAUTH_ALLOWED_REDIRECT_URIS="http://127.0.0.1:8787/oauth-callback.html,http://localhost:8787/oauth-callback.html"
YANDEX_LOGIN_ENABLED="false"
YANDEX_CLIENT_ID=""
YANDEX_CLIENT_SECRET=""
TELEGRAM_LOGIN_ENABLED="false"
TELEGRAM_CLIENT_ID=""
TELEGRAM_CLIENT_SECRET=""
TELEGRAM_JWKS_URL="https://oauth.telegram.org/.well-known/jwks.json"
YOOKASSA_SHOP_ID=""
YOOKASSA_SECRET_KEY=""
YOOKASSA_RETURN_URL="http://127.0.0.1:8787/maya-admin.html"
YOOKASSA_API_BASE_URL="https://api.yookassa.ru/v3"
YOOKASSA_REQUEST_TIMEOUT_MS="15000"
UPLOAD_ROOT="./uploads"
```

Development keeps a narrow localhost/Capacitor CORS fallback. Production is fail-closed: it requires independent secrets, exact CORS origins, real SMS transport and complete settings for every enabled social provider. See [the production bootstrap hardening runbook](../docs/architecture/production-bootstrap-hardening-runbook.md) before any deployment.

Phone auth delivery modes:

- `SELF_SERVE_TRIAL_SIGNUP=true`: enables public self-serve trial salon signup in production

- `PHONE_AUTH_PROVIDER=auto`: local/test defaults to debug, production requires SMS creds
- `PHONE_AUTH_PROVIDER=debug`: always returns `debug_code`
- `PHONE_AUTH_PROVIDER=smsru`: always uses SMS.ru and fails if creds are missing
- `PHONE_AUTH_DEBUG=true`: emergency override that forces debug delivery in any env

Social login toggles:

- `YANDEX_LOGIN_ENABLED=true`: enables `POST /api/auth/oauth/yandex/start` and `/complete`
- `TELEGRAM_LOGIN_ENABLED=true`: enables `POST /api/auth/oauth/telegram/start` and `/complete`
- `AUTH_FLOW_STATE_TTL_SECONDS`: lifetime for OAuth `state + PKCE` records in PostgreSQL
- `OAUTH_PROVIDER_TIMEOUT_MS`: timeout for Yandex and Telegram token exchanges
- `OAUTH_ALLOWED_REDIRECT_URIS`: exact comma-separated callback allowlist; production callbacks must use HTTPS

## Run locally

Install dependencies:

```bash
npm install
```

Start PostgreSQL and the backend with Docker:

```bash
docker compose up --build
```

Or run PostgreSQL separately and start the app directly:

```bash
npm run prisma:migrate:deploy
npm run start:dev
```

## Migrations

Apply migrations:

```bash
npm run prisma:migrate:deploy
```

Create/update Prisma client:

```bash
npm run prisma:generate
```

## Seed demo data

Run the seed:

```bash
npm run prisma:seed
```

Seed creates:

- Platform owner user
- Default existing Maya tenant `malesthetic` with Aurora branding tokens
- Demo tenant `demo-salon`
- Demo branding
- Demo branch
- Mock CRM integration
- Demo subscription plan
- Demo tenant admin user

Set local seed credentials explicitly before running seed. Never use local defaults in production:

```env
SEED_PLATFORM_OWNER_EMAIL=
SEED_PLATFORM_OWNER_PASSWORD=
SEED_DEMO_TENANT_ADMIN_EMAIL=
SEED_DEMO_TENANT_ADMIN_PASSWORD=
```

## Verify the demo tenant

Public config:

```bash
curl http://localhost:3000/api/mobile/config/demo-salon
```

Login as platform owner:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@maya.local","password":"ChangeMe123!"}'
```

Login as demo tenant admin:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"tenantSlug":"demo-salon","email":"admin@demo-salon.local","password":"ChangeMe123!"}'
```

Swagger docs:

```bash
open http://localhost:3000/api/docs
```

Swagger is enabled by default only outside production. Set `SWAGGER_ENABLED=true` explicitly only behind a reviewed private boundary.

## Safe appointment preview

To validate a booking request against the tenant CRM without creating a live record in YClients, use:

```bash
curl -X POST http://localhost:3000/api/appointments/preview \
  -H 'Authorization: Bearer <tenant-client-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "staffId": "3278920",
    "serviceIds": ["7572285"],
    "start": "2026-07-04T10:15:00"
  }'
```

What preview does:

- validates the booking identity from the request or the authenticated client profile
- loads real availability from the tenant CRM adapter
- confirms that the selected local wall-clock slot still exists
- returns normalized payload details
- does not create a live appointment in YClients

If the authenticated client already has a saved profile name and phone, `clientName` and `clientPhone` can be omitted. If the profile is incomplete, backend returns a machine-readable error so the frontend can prompt the user to complete it first.

## Phone-first client auth and profile

Start phone auth in safe local debug mode:

```bash
curl -X POST http://localhost:3000/api/auth/phone/start \
  -H 'Content-Type: application/json' \
  -d '{
    "tenantSlug": "demo-salon",
    "phone": "+79990000000"
  }'
```

Verify the code and receive a tenant client JWT:

```bash
curl -X POST http://localhost:3000/api/auth/phone/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "tenantSlug": "demo-salon",
    "phone": "+79990000000",
    "code": "123456"
  }'
```

Update the current authenticated user profile name:

```bash
curl -X PATCH http://localhost:3000/api/me \
  -H 'Authorization: Bearer <tenant-client-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Станислав"
  }'
```

Update the current authenticated user profile phone after a social login that did not return one:

```bash
curl -X PATCH http://localhost:3000/api/me \
  -H 'Authorization: Bearer <tenant-client-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "+79990000000"
  }'
```

Notes:

- In local/test mode with `PHONE_AUTH_PROVIDER=auto`, the backend returns `debug_code`.
- In production with valid `SMSRU_API_ID`, `POST /api/auth/phone/start` returns `delivery: "sms"` and omits `debug_code`.
- `SMSRU_FROM` is optional and requires a pre-approved sender name in SMS.ru.
- The backend forwards the requesting client IP to SMS.ru when available, which helps SMS flood protection on auth-code flows.
- Social login stores provider identities per tenant, so the same Yandex/Telegram account can belong to different salons without cross-tenant leakage.
- Client profile names are stored encrypted at rest.
- `GET /api/me` now returns `name`, `profile_completed`, and `missing_profile_fields`.

## OAuth login via Yandex ID and Telegram

Start a Yandex login:

```bash
curl -X POST http://localhost:3000/api/auth/oauth/yandex/start \
  -H 'Content-Type: application/json' \
  -d '{
    "tenantSlug": "demo-salon",
    "redirectUri": "https://malesthetic.pro/app/oauth-callback.html"
  }'
```

Complete the Yandex login after your callback page receives `code` and `state`:

```bash
curl -X POST http://localhost:3000/api/auth/oauth/yandex/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "state": "<state-from-start>",
    "code": "<code-from-yandex>"
  }'
```

Start a Telegram login:

```bash
curl -X POST http://localhost:3000/api/auth/oauth/telegram/start \
  -H 'Content-Type: application/json' \
  -d '{
    "tenantSlug": "demo-salon",
    "redirectUri": "https://malesthetic.pro/app/oauth-callback.html"
  }'
```

Complete the Telegram login after your callback page receives `code` and `state`:

```bash
curl -X POST http://localhost:3000/api/auth/oauth/telegram/complete \
  -H 'Content-Type: application/json' \
  -d '{
    "state": "<state-from-start>",
    "code": "<code-from-telegram>"
  }'
```

Provider notes:

- Yandex flow uses OAuth Authorization Code with PKCE against `https://oauth.yandex.com/authorize` and `https://oauth.yandex.com/token`, then loads profile data from `https://login.yandex.ru/info`.
- Telegram flow uses OIDC Authorization Code with PKCE against `https://oauth.telegram.org/auth` and `https://oauth.telegram.org/token`.
- Telegram ID tokens are verified against JWKS before the backend trusts the user identity.
- If Yandex or Telegram do not return a Russian phone number, the login still succeeds, but the frontend should ask the user to complete their phone in `PATCH /api/me`.

## YooKassa billing

Create a checkout for a tenant subscription:

```bash
curl -X POST http://localhost:3000/api/admin/tenants/<tenant-id>/billing/checkout \
  -H 'Authorization: Bearer <platform-owner-or-tenant-admin-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "planId": "plan-salon",
    "returnUrl": "http://127.0.0.1:8787/maya-admin.html"
  }'
```

Handle YooKassa notifications at:

```text
POST /api/billing/yookassa/webhook
```

Billing notes:

- Checkout payments are created with `save_payment_method=true`, so a successful YooKassa payment can attach `billingMethodId` to the tenant.
- The webhook fetches the payment from YooKassa again before applying success/cancel state locally.
- `POST /api/admin/billing/run-due` is the cron-friendly endpoint: it charges due tenants with a saved method and marks expired tenants without one as `past_due`.
- Real YooKassa credentials and the HTTPS webhook URL must be configured outside the repository.

## Upload tenant logo

Upload a logo file from the admin:

```bash
curl -X POST http://localhost:3000/api/admin/tenants/<tenant-id>/logo \
  -H 'Authorization: Bearer <platform-owner-or-tenant-admin-jwt>' \
  -F 'file=@./logo.png'
```

Notes:

- Accepted formats: PNG, JPEG, WEBP, GIF.
- Max file size: 2 MB.
- Uploaded files are stored under `UPLOAD_ROOT/tenant-logos`.
- The response is the updated branding payload with `logo_url`.
- The public logo URL is served by the backend, for example `/api/public/uploads/tenant-logos/<file>.png`.

## Connect YClients / Altegio

Set platform-level env:

```env
YCLIENTS_BASE_URL="https://api.yclients.com/api/v1"
YCLIENTS_PARTNER_TOKEN="your-platform-partner-token"
```

Then connect a tenant CRM with the tenant's own user token:

```bash
curl -X POST http://localhost:3000/api/admin/tenants/<tenant-id>/crm \
  -H 'Authorization: Bearer <platform-owner-or-tenant-admin-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "yclients",
    "apiToken": "tenant-user-token",
    "baseUrl": "https://api.yclients.com/api/v1",
    "settingsJson": {
      "companyId": 123456,
      "activeMasterIds": [111, 222]
    }
  }'
```

Notes:

- `apiToken` is the tenant salon user token and is stored encrypted.
- `YCLIENTS_PARTNER_TOKEN` stays platform-side only and is never returned by API.
- `settingsJson.companyId` is required for `yclients` and `altegio`.
- `activeMasterIds` is optional; if present, staff and aggregated slots are filtered to those masters.

## Import the current salon from the existing Python backend

If your current salon is already configured in `ai администратор/config.py`, you do not need to paste the YClients tokens into chat or manually type them again. The backend now includes a local import command that reads that Python config on your machine, stores the salon user token encrypted, and creates or updates the tenant data in PostgreSQL.

Preview the import without writing anything:

```bash
npm run import:current-salon -- --dry-run
```

Run the actual import:

```bash
npm run import:current-salon
```

If you also want to sync the platform-level YClients env vars into `maya-saas-backend/.env` from the same local Python config, use:

```bash
npm run import:current-salon -- --sync-env
```

Useful flags:

```bash
npm run import:current-salon -- --config '../ai администратор/config.py'
npm run import:current-salon -- --slug malesthetic
npm run import:current-salon -- --branch-name 'Мужская Эстетика'
```

What the import does:

- Reads `BARBERSHOP_NAME`, `APP_URL`, `SITE_URL`, `BARBERSHOP_PHONE`, `BARBERSHOP_ADDRESS`
- Reads `YCLIENTS_BASE_URL`, `YCLIENTS_PARTNER_TOKEN`, `YCLIENTS_USER_TOKEN`, `YCLIENTS_COMPANY_ID`, `ACTIVE_MASTER_IDS`
- Creates or updates one active tenant, branding settings, one branch, and one `yclients` CRM integration
- Encrypts the salon `YCLIENTS_USER_TOKEN` before it is stored in the database
- Never prints the raw YClients tokens in command output

## Tenant isolation and security

- CRM API tokens are stored only in encrypted form.
- The mobile app never receives CRM secrets.
- JWT validation reloads the active Membership from PostgreSQL.
- Tenant resolution middleware creates AsyncLocalStorage TenantContext per request.
- Tenant-scoped Appointment reads and writes inject `tenantId` from context and use tenant/client predicates.
- Route, body and arbitrary tenant headers cannot grant tenant access.
- `platform_owner` can manage all tenants.
- `tenant_admin` can manage only its own tenant on allowed admin endpoints.
- Application-layer isolation is mandatory; PostgreSQL RLS remains a documented defence-in-depth hardening step.

Detailed local, migration and verification instructions are in [the tenancy foundation runbook](../docs/architecture/tenancy-foundation-runbook.md).

## Adding a new CRM adapter

1. Create a new adapter in `src/crm/adapters`.
2. Implement the contract in `src/crm/crm-adapter.interface.ts`.
3. Register the provider in `src/crm/crm-adapter.factory.ts`.
4. Keep all provider-specific business logic inside the adapter, not in controllers.

## Useful commands

```bash
npm run build
npm run typecheck
npm run lint
npm run test
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
docker compose up --build
```
