# Maya-managed Calendar

## Purpose

Maya supports two interchangeable scheduling sources without forking the
client application:

- `internal`: Maya stores services, providers, availability and appointments;
- `external`: a CRM adapter remains the source of truth.

The public booking flow always uses the same endpoints. The backend chooses the
source from `Tenant.calendarSource`, so the Aurora MAYA app does not duplicate
booking logic.

## Solo onboarding

`POST /api/onboarding/trial` accepts `calendarSource`.

- `internal` creates no mock CRM integration, assigns the Solo feature set,
  creates the owner as the first provider and adds a Monday-Friday 09:00-18:00
  default schedule.
- `external` keeps the safe CRM-preview onboarding path.
- If `calendarSource` is omitted, `solo_specialist` resolves to `internal`; all
  other presets currently resolve to `external` for backward compatibility.

Trial tenants stay in preview mode until platform activation. A tenant admin
cannot change protected activation, plan, billing or calendar-source fields.

## Owner setup API

All routes are tenant-scoped, require a bearer token and are limited to owner
or administrator roles.

| Method   | Route                                                                | Purpose                                                        |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET`    | `/api/internal-calendar/setup`                                       | Read readiness, services, providers, weekly rules and time off |
| `POST`   | `/api/internal-calendar/services`                                    | Create a service and link it to active providers               |
| `PATCH`  | `/api/internal-calendar/services/:serviceId`                         | Update a service                                               |
| `DELETE` | `/api/internal-calendar/services/:serviceId`                         | Deactivate a service                                           |
| `PATCH`  | `/api/internal-calendar/providers/:providerId`                       | Update provider profile and slot interval                      |
| `GET`    | `/api/internal-calendar/providers/:providerId/schedule`              | Read weekly availability and time off                          |
| `PUT`    | `/api/internal-calendar/providers/:providerId/schedule`              | Atomically replace weekly availability                         |
| `POST`   | `/api/internal-calendar/providers/:providerId/time-off`              | Add an unavailable interval                                    |
| `DELETE` | `/api/internal-calendar/providers/:providerId/time-off/:exceptionId` | Remove an unavailable interval                                 |

`ready=true` requires at least one active provider who has both an active
linked service and an active weekly availability rule.

## Shared client API

The existing client contracts remain canonical for both sources:

- `GET /api/services`
- `GET /api/staff`
- `GET /api/available-slots`
- `POST /api/appointments`
- `GET /api/appointments/my`
- `POST /api/appointments/:id/cancel`
- `POST /api/appointments/:id/reschedule`

Live booking is fail-closed. For `internal`, it requires an active tenant, the
booking entitlement, a ready internal calendar and an explicit live request.
For `external`, it still requires an active non-mock CRM integration.

## Data and concurrency

Internal services, providers, provider-service links, weekly rules and
availability exceptions always carry `tenantId`. Internal appointments store
their service/provider references in the existing appointment aggregate with
`source=internal`.

Service duration plus before/after buffers forms the blocked interval. A
PostgreSQL exclusion constraint prevents overlapping active internal bookings
for the same tenant and provider, including concurrent requests. Application
code converts that database conflict to `slot_taken`.

## Compatibility and limits

- Existing tenants and demo data default to `external`.
- The migration is additive and does not delete or rewrite CRM data.
- The first slice supports weekly availability and unavailable exceptions; it
  does not yet model recurring holidays, resources/rooms or group capacity.
- CRM synchronization is deliberately outside internal mode: a tenant uses one
  scheduling source at a time.
