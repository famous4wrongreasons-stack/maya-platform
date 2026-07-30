# MAYA OS: email code login and clean owner information architecture

## Why this task exists

The local backend on branch `codex/maya-os-release-candidate` now supports a
tenant-scoped passwordless email login for an existing MAYA user. It also fixes
the onboarding conflict where the chip `Индивидуальный мастер` incorrectly
overrode a profession such as `парикмахер` and produced only `Консультация`.

The current frontend still has three concrete problems:

- `ALogin.lgEmailGo()` is a stub that says email login is coming soon;
- `Индивидуальный мастер` is sometimes treated as an industry instead of the
  shape `one provider`;
- `ABookFlow` mixes client appointments, the complete service/price editor,
  weekly schedule, time off and device sessions on one screen.

Do not change NestJS, Prisma, migrations or backend policy in this task.

## 1. Implement the existing email entry as a two-step code flow

Keep the current `Войти через email` row in `ALogin`, but replace the stub with:

### Start

```http
POST {apiBase}/auth/email/start
Content-Type: application/json

{
  "tenantSlug": "<current tenant slug>",
  "email": "owner@example.ru"
}
```

Success fields:

- `delivery`: `email` or local-only `debug`;
- `debug_code`: present only in local debug mode;
- `retry_after_seconds`;
- `expires_at`;
- `next_step: verify_email_code`.

After success, show a six-digit code input in the same compact login group.
Copy must remain enumeration-safe: `Если адрес привязан к этому бизнесу, код
отправлен`. Start a resend countdown from `retry_after_seconds`. In local debug
mode only, make `debug_code` usable for testing without logging or persisting
it.

### Verify

```http
POST {apiBase}/auth/email/verify
Content-Type: application/json

{
  "tenantSlug": "<current tenant slug>",
  "email": "owner@example.ru",
  "code": "123456"
}
```

The response is the normal MAYA session bundle: `access_token`,
`refresh_token`, expiry/session fields and `user`. Save it through the exact
existing tenant-scoped `me_saas_auth_v2:<namespace>` contract already used by
onboarding, Yandex and Telegram. Do not invent a second auth store. After a
read-back check, open the authenticated owner experience for the same tenant.

Use the current tenant from `window.__ME_SAAS_CTX` / `booking_tenant`. Email
alone must never search all tenants. On a fresh device without tenant context,
fail closed with `Откройте ссылку вашего бизнеса`, rather than guessing a
tenant.

Handle these backend codes in calm Russian copy:

- `email_code_invalid`;
- `email_code_expired`;
- `email_code_missing`;
- `email_too_many_attempts`;
- `email_login_invalid`;
- `email_login_unavailable`;
- `email_delivery_unavailable`;
- `email_delivery_failed`;
- the shared rate-limit response and its `retry_after_seconds`.

Keep an unobtrusive `Войти с паролем` fallback only if the existing password
flow already works. Never store the one-time code, put it in a URL, print it or
send it to analytics.

## 2. Separate work format from profession

`Индивидуальный мастер` means `providerCount = 1`; it is not an industry and
must not erase `парикмахер`, `стоматолог`, `репетитор`, etc.

Requirements:

1. Always render the resolved `blueprint.templateId` and services returned by
   the backend after each turn. Do not restore a stale selected template over
   the returned blueprint.
2. A user may say `Я парикмахер, работаю один. Услуги поставь автоматически`.
   The accepted result is `barbershop`, one provider and the full returned
   catalog, currently 17 services, not one consultation.
3. In the manual fallback, remove the unconditional
   `industryPresetId = solo_specialist` for every internal-calendar business.
   Ask for a profession/template, or send `solo_specialist` only when no
   profession is known.
4. In confirmation UI, present `Работаю один` separately from `Сфера/профессия`
   so the user can understand both values.

## 3. Stop putting every owner tool on the appointments screen

The current `ABookFlow` `myView` block renders all of these under `Мои записи`:

- appointment cards;
- provider editor;
- services with prices and duration;
- weekly working hours;
- time off;
- active devices.

Split them without deleting any working API behavior:

- `Мои записи`: only upcoming/past appointments and appointment actions
  (cancel, reschedule, book again).
- `Календарь`: the operational appointment calendar/journal.
- `Услуги`: service name, price, duration and active state.
- `Расписание`: provider details, weekly intervals, breaks/time off and server
  readiness.
- `Профиль / Безопасность`: active devices, revoke and logout actions.

The client booking flow itself contains only service, specialist, date, time
and a compact final summary. A selected service may show its price, but no
price editor or weekly schedule belongs in that flow.

The onboarding confirmation should also avoid one giant wall of inputs. Show a
compact summary with separate edit entries for `Услуги`, `Расписание` and
`Контакты`; keep all backend-required values editable before final submit.

## Visual and implementation constraints

1. Preserve the existing MAYA application and black-and-white visual system.
   No bronze/gold/accent colors.
2. Do not create a website, admin page or a second app.
3. Preserve current appointment, internal-calendar, CRM, quick-reply, logo and
   trial behavior.
4. Keep controls mobile-safe and keyboard-safe on iPhone. Focused inputs must
   stay visible and the conversation must not jump to the wrong end.
5. Work in both mirrors:
   - `сайт и приложение/app.html`;
   - `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`.
6. Parse every inline script, run `npx cap sync ios`, and confirm:

```bash
cmp -s www/index.html ios/App/App/public/index.html
```

7. Do not deploy or touch production.

## Acceptance tests

1. Log out of the owner account, reopen the same tenant, enter its email,
   obtain the local debug code, verify it and return to the owner session.
2. A wrong code shows a field-level error and decrements remaining attempts;
   resend is locked until the backend countdown finishes.
3. `Я парикмахер, работаю один. Услуги поставь автоматически` yields one
   provider and the full barbershop catalog without selecting `Барбершоп`
   manually.
4. Creating a booking still places it in the MAYA calendar.
5. `Мои записи` no longer contains services, weekly schedule, time off or
   device management; each remains reachable in its dedicated place.
6. PWA and iOS pass inline-script parsing and byte-parity checks.

Return `CLAUDE_EMAIL_LOGIN_AND_BOOKING_IA_RESULTS.md` with the commit, changed
files, checks and screenshots of email-code login plus the separated owner
screens.
