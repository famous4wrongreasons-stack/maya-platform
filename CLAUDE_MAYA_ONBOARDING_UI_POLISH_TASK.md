# MAYA OS: frontend handoff for onboarding and cabinet polish

## Context and ownership

Codex owns the backend and has implemented the stateful onboarding flow, category catalogs, deferred optional fields, tenant-safe provider photo upload, and owner workspace recovery. Claude owns only the frontend integration and visual polish described below.

Work only on the existing release-candidate branches. Do not modify `main`, do not deploy production, do not rewrite the app, and do not edit backend onboarding logic.

Frontend sources to keep in sync:

- `/Users/stanislavmosin/Desktop/maya-os-release-candidate/сайт и приложение/app.html`
- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Do not remove the owner-only `recoverOwnerDefaultWorkspace` block or `window.__meReturnToLegacyWorkspace` from the iOS source. Do not delete saved `me_saas_auth_v2:*` sessions.

User references:

- `/Users/stanislavmosin/Downloads/Снимок экрана 2026—07—14 в 13.15.29.png`
- `/Users/stanislavmosin/Downloads/Снимок экрана 2026—07—14 в 13.17.20.png`

## Backend contract now available

`GET /api/onboarding/templates` now returns:

- `onboarding_flow.work_modes`: `solo` and `business`;
- `categories[]`: `id`, `work_mode`, `label`, `selection_message`, `template_id`, `industry_preset_id`, `provider_title`, `suggested_services`;
- legacy `templates[]` remains for compatibility.

Draft responses now include these blueprint fields:

- `workMode`;
- `categoryId`;
- `businessNameDeferred`;
- `businessNameGenerated`;
- `calendarSourceConfirmed`;
- `servicesDeferred`.

`quick_replies[]` may include:

- `label`;
- `message`;
- `templateId`;
- `action`: `confirm`, `edit`, or `focus`.

Provider photo endpoint:

```http
POST /api/internal-calendar/providers/:providerId/avatar
Authorization: Bearer <tenant JWT>
Content-Type: multipart/form-data
avatar=<PNG|JPEG|WEBP|GIF, max 2 MB>
```

Response:

```json
{
  "provider_id": "...",
  "avatar_url": "/api/public/uploads/provider-avatars/..."
}
```

Refresh `GET /api/internal-calendar/setup` after upload; the provider will contain `avatar_url`.

## A. Short onboarding in the normal MAYA chat

1. Replace the onboarding greeting with exactly:

   `Здравствуйте! Я Майя, помогу настроить ваш бизнес. Вы работаете на себя или у вас бизнес?`

2. Before a draft exists, show only two initial quick replies:

   - `Работаю на себя` sends `Я работаю на себя`;
   - `У меня бизнес` sends `У меня бизнес`.

3. Remove the old ungrouped broad-template chooser from the first screen. Profession/business choices now come from backend `quick_replies` and `categories`.

4. Quick replies must execute actions, not merely highlight:

   - `action=confirm` and `action=edit`: open the editable confirmation card immediately;
   - `action=focus`: focus the normal MAYA composer, keep the keyboard/input visible, and do not send an empty message;
   - otherwise call `onbSend(message, templateId)`;
   - prevent double taps while a request is pending;
   - keep the selected/pressed visual state only during the actual request.

5. Do not render the duplicate `К подтверждению` chip when the backend already returned `Можем начинать` / `Отредактировать данные` actions.

6. The chat must stay pinned above the iOS keyboard without jumping to the absolute bottom. On focus and every `visualViewport` resize, scroll the active composer/message into view; do not continuously force-scroll while the user is typing or manually reading earlier messages.

## B. Confirmation card

1. Business name is optional when `businessNameDeferred=true`. Show `Без названия — можно добавить позже`; do not fail local validation and omit `businessName` from confirm JSON when empty.

2. Services may be empty when `servicesDeferred=true`. Do not fail local validation. A service price of `0` means `Цена не указана`, never `Бесплатно`.

3. Show the actual category label from `categories` / `categoryId`, not only a broad legacy template.

4. Human-readable rows:

   - work mode: `Работаю один` or `Команда: N специалистов`, not a bare `1`;
   - schedule source: `Внутренний календарь MAYA` or `CRM`;
   - schedule, services, owner contacts remain editable.

5. Phone field defaults to `+7 `, but supports international registration. Add a compact country-code selector with a manual `Другой код` option. Preserve any valid international `+` number with 10–15 digits; never forcibly rewrite a non-Russian code to `+7`.

6. `Можем начинать` confirms only after the user has reviewed the card. `Отредактировать данные` opens the same card without creating a tenant.

## C. Cabinet visual fixes

1. Horizontal cabinet tabs:

   - hide the scrollbar track in Safari and other browsers (`::-webkit-scrollbar` and `scrollbar-width`);
   - add enough bottom spacing so no line touches the pills;
   - keep swipe/drag horizontal navigation and selected-tab visibility.

2. Uploaded tenant logo:

   - never apply `filter: brightness(0)` or any recoloring to uploaded raster logos;
   - use `object-fit: contain`, preserve aspect ratio, and never crop;
   - no forced circular mask or background;
   - use the MAYA seed mark only as loading/error fallback;
   - verify the existing black-background image visibly shows its white `M`, instead of becoming a solid black square.

3. `Специалисты` home tile:

   - remove the enclosing circle/border around the MAYA seed;
   - render the standalone `SeedLogoAnimated` mark;
   - use restrained continuous rotation (roughly 14–20 seconds);
   - respect `prefers-reduced-motion`.

4. Solo specialist photo:

   - when the internal calendar has exactly one provider, add `Загрузить фото мастера` to profile/settings;
   - upload through the new avatar endpoint;
   - show progress and friendly file/type/size errors;
   - refresh setup after success and render the image with `object-fit: cover`;
   - keep the MAYA seed fallback when no photo exists.

5. Use the established MAYA black-and-white palette only. Do not introduce bronze, gold, or unrelated accent colors.

## D. Safe workspace recovery

The owner's phone must open the original `Мужская Эстетика` workspace by default, while retaining test-tenant sessions. Add a clear owner-only workspace action in profile/settings:

- `Вернуться в Мужскую Эстетику` calls `window.__meReturnToLegacyWorkspace()`;
- MAYA OS test businesses remain available through their saved auth bundles;
- never delete a tenant, booking, or saved SaaS session;
- public users must not see this owner-only control.

## Acceptance checklist

- Complete both flows: solo barber without a brand name, and business barbershop with three specialists.
- No question about the name appears after the user chose `Без названия`.
- Every quick reply performs its declared action on first tap.
- The confirmation card accepts deferred name/services and international phone codes.
- Provider photo upload survives refresh.
- Uploaded `M` logo is visible and uncropped.
- The `Специалисты` mark has no circle and animates with reduced-motion fallback.
- Cabinet tab scrollbar is invisible and no line touches the pills.
- Owner can return from a test tenant such as `Вася` to `Мужская Эстетика` without losing the test session.
- Parse every inline script with `new Function(...)`.
- Run `npx cap sync ios`, verify `cmp -s www/index.html ios/App/App/public/index.html`, build the iOS Debug app, and visually test on the phone.

## Deliverable

Commit only frontend-related files on the existing release-candidate branches and create:

`CLAUDE_MAYA_ONBOARDING_UI_POLISH_RESULTS.md`

The result must list commits, files, screenshots/checks, exact tested flows, and anything still blocked. Do not claim completion without a real phone-sized visual check.
