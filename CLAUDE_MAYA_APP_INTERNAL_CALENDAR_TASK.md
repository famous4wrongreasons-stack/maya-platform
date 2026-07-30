# Claude: internal calendar inside the existing MAYA APP

## Context

Codex has added a tenant-scoped Maya-managed calendar to the isolated branch
`codex/maya-app-internal-calendar`. It allows an individual specialist to use
MAYA without YClients or another CRM. Businesses that already use a CRM keep
the same external-calendar path.

This is not a request for a website, a landing page, a second admin panel or a
new visual concept. Extend the existing MAYA application in its established
Aurora/liquid-glass style.

## Scope owned by Claude

Implement the frontend only in the existing application surfaces:

- `сайт и приложение/app.html`
- mirror the result in `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Preserve the existing Aurora tokens, components, typography, navigation,
voice/chat and team-chat behavior. The application must still open directly
into the usable MAYA experience, not a marketing screen.

## Owner onboarding

Add one clear choice inside the existing onboarding flow:

`Как вы ведете расписание?`

- `В самой MAYA` sends `calendarSource: "internal"`.
- `Подключить CRM` sends `calendarSource: "external"`.

For an individual specialist, send `industryPresetId: "solo_specialist"` and
`calendarSource: "internal"` to `POST /api/onboarding/trial`. Do not request an
API token in that path. Keep the current CRM connection fields only for the
external path.

## Internal setup screens

Add compact owner settings inside MAYA, not a separate dashboard:

1. Read `GET /api/internal-calendar/setup`.
2. Let the owner create/edit/deactivate services.
3. Let the owner edit the provider name, role and slot interval.
4. Let the owner replace weekly working hours.
5. Let the owner add/remove time-off intervals.
6. Show a calm readiness state based on `ready`.

Use the exact backend routes and payloads documented in
`docs/product/internal-calendar.md` and Swagger. Render server error messages
without inventing duplicate eligibility logic in JavaScript.

## Client booking

Do not create a second booking implementation. Both calendar sources already
use the existing endpoints:

- `/api/services`
- `/api/staff`
- `/api/available-slots`
- `/api/appointments`
- appointment cancel and reschedule routes

Read `calendar_source` from `/api/mobile/config/:tenantSlug` only to explain the
owner setup state. The backend remains the source of truth.

## Boundaries

- Do not edit NestJS, Prisma, migrations, billing or production deployment.
- Do not change `main` or the live MAYA application.
- Work from this feature branch or an isolated frontend branch based on it.
- Do not introduce salon-only wording. Use `специалист`, `услуга`, `клиент`,
  `место работы` and industry-preset terminology.
- Do not add a new color palette, generic SaaS cards or marketing sections.

## Verification and handoff

- Parse every inline script in both application files.
- Run `npx cap sync ios` after mirroring the iOS source.
- Confirm `www/index.html` matches `ios/App/App/public/index.html`.
- Exercise onboarding and internal setup against the local backend.
- Return one report named `CLAUDE_MAYA_APP_INTERNAL_CALENDAR_RESULTS.md` with
  changed files, tested flows and any backend contract mismatch. Do not make
  backend fixes yourself.
