# Claude Frontend Ownership And Workflow

> Working agreement for Claude and Codex on the MAYA project
> Date: 2026-07-03

## 1. Decision

From this point forward, the work is split like this:

- **Codex fully owns backend work**
- **Claude fully owns frontend work**

This is the operational split for the new SaaS direction.

It does **not** mean Claude's existing backend research and migration work is
discarded. It remains valuable as:

- reference architecture for the current Python production stack
- migration/cutover knowledge
- source of shared SaaS contracts that must not drift

But it **does** mean Claude should stop building a second parallel new backend
next to `maya-saas-backend/`.

## 2. Codex Scope

Codex owns the new backend in:

- `maya-saas-backend/`

That includes:

- tenant-facing API design
- auth / JWT / guards
- user and role model
- branch model
- CRM adapter layer
- YClients integration on the new backend
- available slots API
- booking preview API
- future live-booking API path
- backend validation / DTOs / Swagger / contracts
- backend-side documentation of request and response shapes

Primary files and areas:

- `maya-saas-backend/prisma/schema.prisma`
- `maya-saas-backend/src/auth/*`
- `maya-saas-backend/src/admin/*`
- `maya-saas-backend/src/tenants/*`
- `maya-saas-backend/src/branches/*`
- `maya-saas-backend/src/staff/*`
- `maya-saas-backend/src/services/*`
- `maya-saas-backend/src/crm/*`
- `maya-saas-backend/src/appointments/*`

## 3. Claude Scope

Claude owns frontend work for the MAYA product.

Primary frontend files and areas:

- `сайт и приложение/app.html`
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

That includes:

- booking flow UX
- white-label presentation and branding behavior in UI
- onboarding screens
- client cabinet UX
- staff-facing UI flows when they move to the new backend
- state handling in the frontend
- API consumption from the new backend
- mobile/PWA polish
- iOS mirror updates when frontend changes are made

## 4. Files Each Side Should Avoid Rebuilding

### Claude should not rebuild

- a second new backend parallel to `maya-saas-backend/`
- a second auth/JWT system for the greenfield backend
- a second booking preview API
- a second branch-aware REST API surface
- a second frontend-facing booking contract if the backend contract already exists

### Codex should not rebuild

- the current-production Python migration layer
- the PG/RLS porting layer for the legacy Python stack
- the white-label patcher and current cutover mechanics for the existing product
- Telegram tenant resolver / bot registry logic for the current Python stack
- legacy feature gating for the existing 67 production routes

## 5. How We Work From Here

### Rule 1: one backend owner

All new backend behavior is implemented by Codex in `maya-saas-backend/`.

If Claude needs a backend capability for frontend work, Claude should:

- consume the existing endpoint
- or request a backend contract change
- but not implement a second backend path in parallel

### Rule 2: one frontend owner

All frontend behavior and UI integration is implemented by Claude in:

- `сайт и приложение/app.html`
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

If Codex needs a frontend behavior change to verify backend work, Codex can:

- document the needed contract
- make a minimal safe-mode integration only when necessary for backend testing
- otherwise leave the UX implementation to Claude

### Rule 3: shared contracts must be explicit

Claude should build against backend contracts, not guesses.

If a contract is missing or ambiguous, the contract must be written down before
the frontend flow expands.

### Rule 4: no silent divergence

Neither side should independently redefine:

- tenant identity
- tenant status enum
- public tenant config JSON
- CRM credential payload shape
- plan / feature keys
- booking request/response shapes

## 6. Backend Contracts Claude Should Consume

These are the main frontend-facing backend endpoints currently available in the
new backend.

Base URL in local safe mode:

- `http://localhost:3000/api`

### Public config

- `GET /mobile/config/:tenantSlug`

Purpose:

- get public white-label config by slug

Current controller:

- `maya-saas-backend/src/tenants/tenants.controller.ts`

### Auth

- `POST /auth/register`
- `POST /auth/login`

Request examples:

- register:
  - `tenantSlug`
  - `email`
  - `password`
  - optional `phone`
  - optional `branchId`
- login:
  - optional `tenantSlug`
  - `email`
  - `password`

Response shape:

- `access_token`
- `user`

Current files:

- `maya-saas-backend/src/auth/auth.controller.ts`
- `maya-saas-backend/src/auth/auth.service.ts`
- `maya-saas-backend/src/auth/dto/register.dto.ts`
- `maya-saas-backend/src/auth/dto/login.dto.ts`

### Protected tenant-scoped reads

Use JWT bearer token from login/register.

- `GET /branches`
- `GET /staff`
- `GET /services`
- `GET /available-slots`

`GET /available-slots` query:

- `date`
- optional `staffId`
- optional `branchId`
- optional `serviceIds`

Current files:

- `maya-saas-backend/src/branches/branches.controller.ts`
- `maya-saas-backend/src/staff/staff.controller.ts`
- `maya-saas-backend/src/services/services.controller.ts`
- `maya-saas-backend/src/appointments/availability.controller.ts`

### Booking preview

- `POST /appointments/preview`

Purpose:

- validate booking against live CRM availability without creating a live booking

Current request shape:

- `staffId: string`
- `serviceIds: string[]`
- `start: string`
- optional `branchId: string`
- optional `notes: string`
- `clientName: string`
- `clientPhone: string`

Current files:

- `maya-saas-backend/src/appointments/appointments.controller.ts`
- `maya-saas-backend/src/appointments/dto/preview-appointment.dto.ts`
- `maya-saas-backend/src/appointments/appointments.service.ts`

### Future live booking

- `POST /appointments`

This exists in backend ownership, but frontend should currently treat preview as
the safe integration target unless Codex explicitly marks live-booking flow as
ready.

## 7. Safe Mode Frontend Integration

The current local safe mode already exists in:

- `сайт и приложение/app.html`

Current switch:

- `?booking_backend=saas-local`

Optional params:

- `booking_api_base`
- `booking_tenant`

Current behavior:

- frontend creates its own local test session
- loads branches/staff/services/slots from the new backend
- submits final booking step to `/appointments/preview`
- does not create a real live appointment

Claude should treat this as the current integration path for frontend work on
the new backend.

## 8. Shared Contracts To Respect

Until changed explicitly, Claude should treat these as frozen or near-frozen:

### Tenant identity

- public identity = `slug`

### Tenant status set

- `trial`
- `active`
- `past_due`
- `suspended`
- `cancelled`

### Public tenant config minimum shape

```json
{
  "slug": "tenant-slug",
  "active": true,
  "brand": {
    "name": "...",
    "logo_url": null,
    "accent_color": null,
    "secondary_color": null,
    "background_image_url": null,
    "font_family": null,
    "city": null,
    "address": null,
    "phone": null,
    "hours": null,
    "tagline": null
  }
}
```

### Booking preview request

```json
{
  "staffId": "string",
  "serviceIds": ["string"],
  "start": "2026-07-05T11:00:00",
  "branchId": "string",
  "notes": "string",
  "clientName": "Станислав",
  "clientPhone": "+79990000000"
}
```

### Plan and feature keys

The shared business taxonomy should come from Claude's existing
`pg/plan_catalog.py`, not a parallel key system invented in the frontend.

## 9. Claude's Immediate Task On This Project

Claude's concrete task from this point is:

1. Treat `maya-saas-backend` as the backend source of truth for new frontend work
2. Build or refine frontend flows against the documented backend endpoints
3. Own the booking UX, cabinet UX, onboarding UX, and white-label UI behavior
4. Keep the iOS mirror aligned with frontend changes
5. Avoid extending a second backend path in parallel
6. Raise contract mismatches explicitly instead of solving them with duplicate backend logic

## 10. Codex's Immediate Task On This Project

Codex's concrete task from this point is:

1. Continue implementing the new backend end-to-end
2. Stabilize and document frontend-facing contracts
3. Extend preview/live-booking capabilities safely
4. Align shared SaaS contracts with Claude where needed
5. Avoid reimplementing the current-production migration layer

## 11. Delivery Format Between Claude And Codex

When Claude needs backend changes, the best format is:

1. exact frontend screen or flow
2. exact endpoint needed
3. exact missing request/response field
4. whether it is blocking or non-blocking

When Codex needs frontend integration changes, the best format is:

1. endpoint contract
2. sample request
3. sample response
4. success/failure states the UI must handle

## 12. Final Rule

Backend evolves in one place.
Frontend evolves in one place.
Shared contracts evolve only by explicit agreement.

That is the operating model for this project from here.
