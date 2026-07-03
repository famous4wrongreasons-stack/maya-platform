# Maya SaaS Backend

Multi-tenant white-label backend for Maya App. This service is a standalone `NestJS + Prisma + PostgreSQL` backend that lets one API and one mobile app serve many salons with isolated tenant data, branding, CRM integrations, branches, users, and plans.

## Stack

- `NestJS`
- `TypeScript`
- `PostgreSQL`
- `Prisma ORM`
- `JWT`
- `Swagger / OpenAPI`
- `Docker / docker-compose`

## What is included in v1

- Tenant model and white-label branding settings
- Branches, users, CRM integrations, subscription plans, audit logs
- Auth with `JWT` containing `user_id`, `tenant_id`, `role`
- Public/mobile API:
  - `GET /api/mobile/config/:tenantSlug`
  - `POST /api/auth/login`
  - `POST /api/auth/register`
  - `GET /api/me`
  - `GET /api/branches`
  - `GET /api/services`
  - `GET /api/staff`
  - `GET /api/available-slots`
  - `POST /api/appointments`
  - `GET /api/appointments/my`
- Admin API:
  - `POST /api/admin/tenants`
  - `GET /api/admin/tenants`
  - `GET /api/admin/tenants/:id`
  - `PATCH /api/admin/tenants/:id`
  - `PATCH /api/admin/tenants/:id/branding`
  - `POST /api/admin/tenants/:id/crm`
  - `PATCH /api/admin/tenants/:id/crm`
  - `POST /api/admin/tenants/:id/test-crm`
  - `POST /api/admin/tenants/:id/suspend`
  - `POST /api/admin/tenants/:id/activate`
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
CRM_ENCRYPTION_KEY="change-me-in-production"
PORT=3000
NODE_ENV="development"
YCLIENTS_BASE_URL="https://api.yclients.com/api/v1"
YCLIENTS_PARTNER_TOKEN="change-me-in-production"
```

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
- Demo tenant `demo-salon`
- Demo branding
- Demo branch
- Mock CRM integration
- Demo subscription plan
- Demo tenant admin user

Default seed credentials:

- Platform owner: `owner@maya.local` / `ChangeMe123!`
- Demo tenant admin: `admin@demo-salon.local` / `ChangeMe123!`

Optional seed overrides:

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

## Safe appointment preview

To validate a booking request against the tenant CRM without creating a live record in YClients, use:

```bash
curl -X POST http://localhost:3000/api/appointments/preview \
  -H 'Authorization: Bearer <tenant-client-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "clientName": "Станислав",
    "clientPhone": "+79990000000",
    "staffId": "3278920",
    "serviceIds": ["7572285"],
    "start": "2026-07-04T10:15:00"
  }'
```

What preview does:

- validates `clientName`, `clientPhone`, `staffId`, `serviceIds`, `start`
- loads real availability from the tenant CRM adapter
- confirms that the selected local wall-clock slot still exists
- returns normalized payload details
- does not create a live appointment in YClients

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
- Tenant-scoped endpoints use JWT tenant context plus guards and service filters.
- `platform_owner` can manage all tenants.
- `tenant_admin` can manage only its own tenant on allowed admin endpoints.
- v1 keeps tenant isolation enforced in app logic; the initial SQL migration notes the future RLS hardening path for per-request PostgreSQL session settings.

## Adding a new CRM adapter

1. Create a new adapter in [src/crm/adapters](/Users/stanislavmosin/Desktop/сайт и приложение/maya-saas-backend/src/crm/adapters).
2. Implement the `CRMAdapter` contract in [src/crm/crm-adapter.interface.ts](/Users/stanislavmosin/Desktop/сайт и приложение/maya-saas-backend/src/crm/crm-adapter.interface.ts).
3. Register the provider in [src/crm/crm-adapter.factory.ts](/Users/stanislavmosin/Desktop/сайт и приложение/maya-saas-backend/src/crm/crm-adapter.factory.ts).
4. Keep all provider-specific business logic inside the adapter, not in controllers.

## Useful commands

```bash
npm run build
npm run test
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
docker compose up --build
```
