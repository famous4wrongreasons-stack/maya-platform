# Claude: final corrections for MAYA APP internal calendar UI

## Why this follow-up exists

The first frontend pass is directionally correct and must be preserved, but it
is not ready to merge yet. Continue from the current uncommitted changes in
`/Users/stanislavmosin/Desktop/maya-app-local`.

Do not create another site or visual language. This remains the existing MAYA
APP and its current design.

## Required corrections

### 1. Move self-serve onboarding into MAYA APP

The product must not depend on `maya-start.html`. Add an owner entry such as
`Создать свою MAYA` to the existing application entry/auth experience and run
the complete `POST /api/onboarding/trial` flow inside `app.html`.

The in-app flow must collect the current required owner/business fields and ask:

- `Вести расписание в MAYA` -> `calendarSource: "internal"` and
  `industryPresetId: "solo_specialist"`;
- `Подключить CRM` -> `calendarSource: "external"`.

After success, switch to the returned tenant namespace/session and open the
usable owner experience. Do not send the owner to a website or separate admin
page. `maya-start.html` may remain only as a backward-compatible fallback, but
it must no longer be required.

Use universal copy: `бизнес`, `специалист`, `услуги`, `клиенты`, `название
проекта/бренда`. Remove `салон`, `барбершоп` and salon-only placeholders from
the owner onboarding surfaces.

### 2. Complete service editing

The current pass creates and activates/deactivates services but does not edit
them. Add compact editing through:

`PATCH /api/internal-calendar/services/:serviceId`

At minimum support name, price and duration. Keep server validation/errors as
the source of truth and preserve the existing MAYA visual system.

### 3. Make weekly schedules lossless

The current loader keeps only the first rule for each weekday and the PUT then
deletes every additional interval. This can silently turn a split day such as
`09:00-13:00 + 14:00-18:00` into one interval.

Render all intervals per weekday, with compact add/remove controls, and submit
the full rules array to:

`PUT /api/internal-calendar/providers/:providerId/schedule`

Loading and saving without edits must be a lossless round trip. Let backend
validation reject overlap or invalid ranges; show its message as-is.

### 4. Keep iOS isolated

The iOS repository is now safely on branch
`codex/maya-app-internal-calendar`; `main` itself remains unchanged. Continue
only on that branch. Do not stage or remove unrelated untracked `android/` or
backup files.

Mirror the final `app.html` to:

- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`
- generated Capacitor public bundle via `npx cap sync ios`

Do not deploy, install on a real phone or touch production.

## Acceptance check

Run one local end-to-end flow against the isolated backend:

1. Open MAYA APP directly and choose `Создать свою MAYA`.
2. Create an internal-calendar specialist without an API token.
3. Enter the returned owner experience without a website/admin redirect.
4. Create a service, edit its price/duration, deactivate and reactivate it.
5. Configure two intervals on one weekday, reload setup, save again and prove
   both intervals still exist.
6. Add/remove time off.
7. Confirm the existing client `/services`, `/staff`, `/available-slots` and
   `/appointments` flow still works.
8. Parse all inline scripts, run `npx cap sync ios`, and confirm the iOS web
   source and generated public bundle are byte-identical.

Return `CLAUDE_MAYA_APP_INTERNAL_CALENDAR_FOLLOWUP_RESULTS.md` with changed
files, exact test results and screenshots of the in-app onboarding and split
schedule. Do not change NestJS, Prisma, migrations, billing or production.
