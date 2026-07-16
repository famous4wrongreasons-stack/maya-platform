# MAYA OS: finish owner email return, app shell session and real calendar

## Context

Continue on branch `codex/maya-os-release-candidate` after frontend commit
`2b6da8f3`. Do not work in `main`, do not deploy production and do not change
NestJS, Prisma, migrations or backend policy.

Codex accepted the two-step email-code transport itself: start, local debug
code, verify and tenant-scoped session persistence work. Codex also verified
that a completed owner profile restores `saasAuth = authed` inside
`ABookFlow`.

The package is not yet accepted because live browser verification found three
frontend integration gaps:

1. After a successful owner email login, the app opens the generic home and
   the bottom navigation still says `Войти`.
2. Every owner tab keeps the heading `Мои записи`, including services,
   schedule and security.
3. `Календарь` duplicates `/appointments/my` and its button opens the legacy
   salon journal. That screen does not understand the MAYA OS tenant session
   and says `Войдите как сотрудник`.

Codex has now added the real tenant-scoped internal-calendar journal API. Use
that API; do not reuse `panel_journal`, `SS_PROXY` or the legacy salon
`schedule` route for a MAYA OS tenant.

## Backend contract ready for frontend

```http
GET {apiBase}/internal-calendar/journal
  ?from=2026-07-14T00:00:00.000Z
  &to=2026-07-21T00:00:00.000Z
  &providerId=<optional>
Authorization: Bearer <current tenant access token>
```

The range is inclusive at `from`, exclusive at `to`, and may not exceed 31
days. The endpoint is tenant-scoped and restricted to tenant owner/admin
roles. It returns only the internal calendar:

```json
{
  "calendar_source": "internal",
  "timezone": "Europe/Moscow",
  "range": {
    "from": "2026-07-14T00:00:00.000Z",
    "to": "2026-07-21T00:00:00.000Z"
  },
  "provider_id": null,
  "count": 1,
  "appointments": [
    {
      "id": "...",
      "client": { "id": "...", "name": "Алексей" },
      "provider": { "id": "...", "name": "Артём", "title": "Парикмахер" },
      "branch": { "id": "...", "name": "...", "timezone": "Europe/Moscow" },
      "service_ids": ["..."],
      "services": [
        {
          "id": "...",
          "name": "Стрижка",
          "price": 2000,
          "duration_minutes": 60,
          "currency": "RUB"
        }
      ],
      "start_at": "2026-07-15T09:00:00.000Z",
      "end_at": "2026-07-15T10:00:00.000Z",
      "status": "confirmed",
      "notes": null,
      "total_price": 2000,
      "currency": "RUB"
    }
  ]
}
```

Relevant errors:

- `calendar_range_invalid`;
- `calendar_range_too_large`;
- `internal_calendar_disabled` for an external-CRM tenant;
- normal auth/role/tenant errors already handled by the shared authenticated
  fetch pipeline.

## 1. Return email-authenticated owners to the owner experience

`lgEmailVerify()` currently always calls `lgOpenApp()`. For an owner/admin
role returned by `/auth/email/verify`, open the in-app owner calendar/cabinet
surface (`lgOpenAppCal()` / `calendar_setup=1`) instead of generic guest home.
Client roles may keep the client route.

Manager roles to treat as owner experience:

- `tenant_admin`;
- `tenant_owner`;
- `business_owner`;
- `administrator`.

Do not infer a role from the email. Use only `response.user.role` and let the
server continue to enforce every privileged request.

## 2. Teach the app shell about the current tenant session

The current `window.__meHasSession()` only checks legacy Telegram/web tokens,
so a valid `me_saas_auth_v2:<namespace>` bundle still renders the guest label
`Войти`.

Add a narrow MAYA OS session bridge:

1. Read only `me_saas_auth_v2:<window.__ME_SAAS_CTX.ns>` for the current
   tenant. Never scan other tenant namespaces.
2. Use bundle presence only for shell navigation/display. Never grant a
   backend capability from local storage; `ABookFlow` must still restore or
   refresh the session through `/me`, and the server remains authoritative.
3. After successful restore, show the current user name/profile instead of
   `Войти` and make the profile action open the MAYA OS cabinet, not the
   legacy salon cabinet.
4. On tenant logout, expired refresh, `me-saas-logout`, storage or
   `BroadcastChannel` logout, immediately return the shell to the guest state.
5. A forged, expired or wrong-tenant bundle must never expose working owner
   requests; the restore failure must clear only that tenant bundle and return
   to login.

## 3. Give every owner section its own identity

Keep the five sections, but make their page titles and contents exact:

- `Записи` -> heading `Мои записи`; only the current user's upcoming/past
  appointments and cancel/reschedule/rebook actions.
- `Календарь` -> heading `Календарь`; real operational tenant journal from
  `/internal-calendar/journal`.
- `Услуги` -> heading `Услуги`; only service name, price, duration and active
  state.
- `Расписание` -> heading `Расписание`; provider profile, weekly intervals,
  time off and readiness.
- `Профиль` -> heading `Профиль и безопасность`; devices, revoke and logout.

Do not leave the global `Мои записи` heading above all tabs. Do not render the
services editor or schedule underneath appointment cards.

## 4. Build the internal-calendar journal in the existing MAYA style

For `calendar_source = internal`:

1. Default to a compact seven-day range containing today in the tenant
   timezone.
2. Provide previous/next range and `Сегодня`; never request more than 31 days.
3. Group appointments by local day and sort by start time.
4. A row needs time, client name, service names, provider and status. Price may
   be secondary. Do not expose email/phone because the API intentionally does
   not return them.
5. Handle empty, loading, retry and auth-expired states without jumping to the
   legacy salon journal.
6. After a new internal booking is created, reopening/refreshing `Календарь`
   must show it.

For `calendar_source = external`, do not call this internal endpoint and do
not silently show an incomplete fake calendar. Keep an honest CRM-specific
state until a provider journal adapter is delivered by backend.

## 5. Preserve the agreed visual and platform constraints

- Existing MAYA app only; no website, separate admin or second design.
- Black, white and neutral greys only. No bronze/gold accents.
- Mobile-safe and keyboard-safe on iPhone.
- Preserve onboarding, quick replies, logo, trial, client booking, cancel,
  reschedule and rebook behavior.
- Mirror changes in:
  - `сайт и приложение/app.html`;
  - `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`.
- Run inline-script parsing, `npx cap sync ios` and confirm byte parity:

```bash
cmp -s www/index.html ios/App/App/public/index.html
```

## Acceptance tests

1. Log out, reopen a completed tenant, sign in with owner email/code and land
   directly in the owner cabinet. The shell no longer says `Войти`.
2. Reload the same tenant URL: the tenant session restores and the owner
   cabinet/profile remains reachable.
3. An invalid or wrong-tenant bundle returns to login and does not make a
   successful privileged request.
4. Every tab has the exact heading and only its own content listed above.
5. `Календарь` sends authenticated GET requests to
   `/internal-calendar/journal`, never the legacy salon `panel_journal` path.
6. Create one internal booking, then verify the same appointment appears in
   the calendar journal on the correct local day.
7. PWA/iOS scripts parse, Capacitor sync succeeds and public iOS web content is
   byte-identical.

Return `CLAUDE_EMAIL_OWNER_SHELL_AND_CALENDAR_FOLLOWUP_RESULTS.md` with commit
hashes, changed files, checks and screenshots of: post-email owner landing,
the five section headings and one populated calendar day.
