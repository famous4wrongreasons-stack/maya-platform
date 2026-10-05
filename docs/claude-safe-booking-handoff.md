# Claude Handoff: Safe Booking Backend

## Goal

Review the new safe booking path for MAYA without touching production and without creating a live appointment in YClients.

## Scope In This PR

- New backend in `maya-saas-backend/`
- Local safe-mode booking integration in `сайт и приложение/app.html`
- Documentation for local import, tenant setup, and safe appointment preview

## Important Safety Boundary

- Production Python backend is unchanged
- Production PWA, iOS app, Telegram bot, and VPS are unchanged
- Live booking through the new backend is intentionally not enabled yet
- Safe mode validates a booking request against real YClients availability, but does not create a live record

## What Already Works

### Backend

- Multi-tenant NestJS + Prisma + PostgreSQL backend
- Imported current salon from local `ai администратор/config.py`
- Tenant slug: `muzhskaya-estetika`
- Real YClients/Altegio adapter for:
  - staff
  - services
  - available slots
  - appointment creation code path
- New safe endpoint: `POST /api/appointments/preview`
  - validates `clientName`, `clientPhone`, `staffId`, `serviceIds`, `start`
  - checks that the selected slot still exists in YClients
  - does not create a live appointment

### Frontend

- `ABookFlow` supports local safe mode via query params:
  - `?booking_backend=saas-local`
  - optional `&booking_api_base=http://localhost:3000/api`
  - optional `&booking_tenant=muzhskaya-estetika`
- In safe mode the booking flow:
  - creates its own local test session
  - loads masters from the new backend
  - loads services from the new backend
  - loads dates and times from the new backend
  - submits final confirmation to `/api/appointments/preview`
  - shows a successful preview state without creating a real booking

## Verification Already Done

- `npm run lint` in `maya-saas-backend`
- `npm run test -- --runInBand` in `maya-saas-backend`
- `npm run build` in `maya-saas-backend`
- inline script parsing for `сайт и приложение/app.html`
- inline script parsing for `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`
- real smoke checks against local backend:
  - public tenant config
  - auth/register/login
  - branches
  - staff
  - services
  - available slots
  - `appointments/preview`

## Review Focus For Claude

Please focus on:

1. Whether the booking flow logic in `ABookFlow` is clean enough for the current stage
2. Whether the local safe-mode branching is understandable and low-risk
3. Whether the new `appointments/preview` contract is sensible before live booking is enabled
4. Any frontend UX or state-management issues in the booking flow
5. Any obvious backend validation, naming, or API-shape issues

## Known Non-Goals In This PR

- No production cutover
- No public preview deployment
- No live booking through the new backend
- No iOS repo PR yet

## Note About iOS Mirror

The same booking-flow changes were mirrored locally into:

- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

That file lives in a separate repository and is not included in this PR.

## Suggested Local Run Path

If a reviewer can run the project locally:

1. Start Postgres for `maya-saas-backend`
2. Run migrations
3. Start backend on `http://localhost:3000`
4. Open the local app with:

`?booking_backend=saas-local&booking_api_base=http://localhost:3000/api`

5. Walk the booking flow through the preview submit step

## Expected Outcome Of Review

After review, we should know whether the safe path is ready for:

- a manual browser pass
- a controlled live-booking flag
- or a cleanup pass before either of those
