# Codex Backend Handoff For Claude

> Current backend status for Claude frontend work
> Date: 2026-07-04
> Backend branch: `codex/safe-booking-backend-handoff`

## 1. Working Split

- **Codex owns backend** in `maya-saas-backend/`
- **Claude owns frontend** in:
  - `сайт и приложение/app.html`
  - `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Do not build a second parallel backend beside `maya-saas-backend/`.

## 2. What Changed Since Claude's Last Action Plan

The main frontend blockers previously raised in
`CLAUDE_FRONTEND_ACTION_PLAN.md` have now been addressed on the backend side:

- `GET /api/mobile/config/:tenantSlug` now returns top-level:
  - `slug`
  - `active`
  - `brand`
  - `content`
- It still preserves backward-compatible nested keys:
  - `tenant`
  - `branding`
- Feature gating is normalized:
  - `available_features`
  - `available_feature_keys`
- `POST /api/appointments/preview` now returns:
  - machine-readable errors
  - `total_price`
  - `duration_minutes`
  - `currency`
- CRM-normalized frontend shapes now include:
  - service `category`
  - staff `specialization`
  - staff `avatar_url`
  - staff `rating`
- Phone-first auth now exists in safe/debug mode:
  - `POST /api/auth/phone/start`
  - `POST /api/auth/phone/verify`
- Client profile now exists:
  - `GET /api/me`
  - `PATCH /api/me`
- `GET /api/appointments/my` is now richer for cabinet UI.

## 3. Safety Boundary

These backend changes do **not** mean production cutover.

- No production deploy has been done by Codex here.
- Real current Python production backend remains unchanged.
- Real live app remains unchanged until explicit deployment.
- SMS transport is **not** connected yet.
- Phone auth is currently safe/debug-oriented for local integration.
- Frontend should still treat booking preview as the safe integration target
  unless Codex explicitly green-lights live booking UX.

## 4. Backend Endpoints Claude Should Use Now

Base URL in local safe mode:

- `http://localhost:3000/api`

### 4.1 Public mobile config

- `GET /mobile/config/:tenantSlug`

Current useful top-level response shape:

```json
{
  "slug": "demo-salon",
  "active": true,
  "brand": {
    "name": "Maya Demo Salon",
    "logo_url": null,
    "accent_color": "#111111",
    "secondary_color": "#C6A86A",
    "background_image_url": null,
    "font_family": "Manrope",
    "city": null,
    "address": "Moscow, Tverskaya 1",
    "phone": "+79990000000",
    "hours": null,
    "tagline": null
  },
  "content": {
    "hero_tag": "Добро пожаловать в «Гриву»",
    "hero_title": ["Грива.", "Стрижём так,", "что оборачиваются"],
    "stats": [["3", "года"], ["4", "мастера"], ["4.9", "рейтинг"]],
    "about": ["абзац 1", "абзац 2"],
    "ratings": [["Яндекс", "4.9"], ["2ГИС", "4.8"]],
    "socials": ["Telegram", "TikTok"]
  },
  "available_features": {
    "booking": true
  },
  "available_feature_keys": ["booking"],
  "crm": {
    "provider": "mock",
    "status": "active"
  }
}
```

Compatibility keys still returned:

- `tenant`
- `branding`

Frontend guidance:

- prefer `slug`, `active`, `brand`, `content`, `available_features`,
  `available_feature_keys`
- keep compatibility tolerance for older nested keys if you want a resilient
  adapter
- `content` is normalized from `branding.theme_json.content`
- `branding.theme_json.content` still remains for backward compatibility

### 4.2 Phone-first auth

- `POST /auth/phone/start`
- `POST /auth/phone/verify`

Start request:

```json
{
  "tenantSlug": "demo-salon",
  "phone": "+79990000000"
}
```

Current start success shape in local/debug-safe mode:

```json
{
  "ok": true,
  "tenant_slug": "demo-salon",
  "phone": "+79990000000",
  "delivery": "debug",
  "expires_at": "2026-07-03T12:00:00.000Z",
  "retry_after_seconds": 60,
  "user_exists": false,
  "next_step": "verify_code",
  "debug_code": "123456"
}
```

Important note:

- `debug_code` exists for local safe mode only
- `retry_after_seconds` is now returned by backend and should be used for the
  resend timer instead of a frontend constant when present
- real SMS delivery is not implemented yet

Verify request:

```json
{
  "tenantSlug": "demo-salon",
  "phone": "+79990000000",
  "code": "123456"
}
```

Optional:

- `branchId`

Verify success shape:

```json
{
  "access_token": "<jwt>",
  "user": {
    "id": "user-id",
    "tenant_id": "tenant-id",
    "branch_id": null,
    "email": "phone-79990000000@demo-salon.client.local",
    "phone": "+79990000000",
    "name": null,
    "role": "client",
    "status": "active",
    "profile_completed": false,
    "missing_profile_fields": ["name"]
  },
  "is_new_user": true
}
```

Current machine-readable verify/start errors include codes such as:

- `delivery_unavailable`
- `code_missing`
- `code_expired`
- `code_invalid`
- `too_many_attempts`

### 4.3 Current user profile

- `GET /me`
- `PATCH /me`

`GET /me` success shape:

```json
{
  "id": "user-id",
  "tenant_id": "tenant-id",
  "branch_id": null,
  "email": "phone-79990000000@demo-salon.client.local",
  "phone": "+79990000000",
  "name": "Станислав",
  "role": "client",
  "status": "active",
  "profile_completed": true,
  "missing_profile_fields": [],
  "tenant": {
    "id": "tenant-id",
    "name": "Demo Salon",
    "slug": "demo-salon",
    "status": "active"
  },
  "branch": null
}
```

`PATCH /me` currently supports:

```json
{
  "name": "Станислав"
}
```

Important note:

- this endpoint currently updates **name only**
- phone change is **not** part of this profile endpoint
- client name is stored encrypted at rest on the backend

### 4.4 Protected catalog reads

Bearer JWT required:

- `GET /branches`
- `GET /staff`
- `GET /services`
- `GET /available-slots`

Useful normalized frontend fields now available:

- services:
  - `id`
  - `name`
  - `price`
  - `duration_minutes`
  - `currency`
  - `category`
- staff:
  - `id`
  - `name`
  - `title`
  - `specialization`
  - `avatar_url`
  - `rating`

### 4.5 Booking preview

- `POST /appointments/preview`

Current request:

```json
{
  "staffId": "3278920",
  "serviceIds": ["7572285"],
  "start": "2026-07-05T11:00:00",
  "branchId": "optional-branch-id",
  "notes": "optional note",
  "clientName": "optional if profile already has name",
  "clientPhone": "+79990000000"
}
```

Important behavior:

- `clientName` is now optional in the DTO
- `clientPhone` is now optional in the DTO
- backend will use authenticated client profile values if omitted
- if profile data is missing, backend returns a machine-readable error

Current success shape:

```json
{
  "ok": true,
  "preview": true,
  "mode": "preview",
  "branch_id": "branch-id",
  "branch_timezone": "Europe/Moscow",
  "client_name": "Станислав",
  "client_phone": "+79990000000",
  "staff_id": "3278920",
  "service_ids": ["7572285"],
  "requested_start": "2026-07-05T11:00:00",
  "matched_slot_start": "2026-07-05T08:00:00.000Z",
  "slot": {
    "start": "2026-07-05T08:00:00.000Z",
    "end": "2026-07-05T09:00:00.000Z",
    "staff_id": "3278920",
    "branch_id": "branch-id"
  },
  "total_price": 2500,
  "duration_minutes": 60,
  "currency": "RUB",
  "notes": null,
  "warnings": []
}
```

Current machine-readable error shape:

```json
{
  "message": "Client profile name is required before booking.",
  "error": {
    "code": "client_name_required",
    "message": "Client profile name is required before booking.",
    "field": "clientName"
  }
}
```

Current error codes:

- `client_name_required`
- `client_phone_required`
- `slot_taken`
- `staff_unavailable`
- `service_not_found`
- `validation`

### 4.6 Appointments list for cabinet

- `GET /appointments/my`

Current enriched response item shape:

```json
{
  "id": "appointment-id",
  "tenant_id": "tenant-id",
  "client_id": "user-id",
  "branch_id": "branch-id",
  "crm_external_id": "external-id",
  "staff_external_id": "3278920",
  "service_ids": ["7572285"],
  "start_at": "2026-07-05T08:00:00.000Z",
  "status": "confirmed",
  "notes": null,
  "is_upcoming": true,
  "timeline": "upcoming",
  "branch": {
    "id": "branch-id",
    "name": "Main Branch",
    "address": "Moscow, Tverskaya 1",
    "phone": "+79990000000",
    "timezone": "Europe/Moscow"
  },
  "staff": {
    "id": "3278920",
    "name": "Anton Sokolov",
    "title": "Senior Barber",
    "specialization": "Senior Barber",
    "avatar_url": null,
    "rating": 4.9
  },
  "services": [
    {
      "id": "7572285",
      "name": "Signature Haircut",
      "price": 2500,
      "duration_minutes": 60,
      "currency": "RUB",
      "category": "Haircuts"
    }
  ],
  "total_price": 2500,
  "duration_minutes": 60,
  "currency": "RUB"
}
```

Frontend tolerance note:

- if CRM catalog lookup fails during serialization, nested `staff` and
  `services` can be partially degraded
- frontend should not hard-crash if nested arrays are empty or staff only has
  `id`

## 5. Time Semantics

For booking preview/create:

- `start` should be treated as **local wall-clock salon time**
- backend normalizes it against the branch timezone
- default fallback timezone is `Europe/Moscow`

Claude should preserve this assumption in UX formatting and slot selection.

## 6. Concrete Frontend Work Claude Can Do Now

### A. White-label boot and feature gating

Claude can now implement:

- boot branding from `GET /mobile/config/:tenantSlug`
- gating by `available_features` or `available_feature_keys`
- tenant-aware UI states without waiting for backend changes

### B. Phone-first onboarding flow

Claude can now implement:

1. phone input
2. `POST /auth/phone/start`
3. code input
4. `POST /auth/phone/verify`
5. save JWT
6. `GET /me`
7. if `profile_completed === false`, ask for missing name and call `PATCH /me`

### C. Booking flow refinement

Claude can now build booking UX against:

- staff
- services
- slots
- preview

Recommended frontend behavior:

- do not force retyping name/phone every time if `GET /me` already has them
- if preview returns `client_name_required`, route to profile completion
- if preview returns `slot_taken`, route back to slot selection with refresh
- keep preview clearly separate from real live booking success language

### D. Cabinet / my appointments

Claude can now implement cabinet UI against `GET /appointments/my` with:

- upcoming vs past grouping using `timeline`
- branch presentation
- service list
- staff card
- total price / duration display

## 7. What Claude Should Not Build

Claude should **not** build:

- a second backend auth path
- a second phone auth server flow
- a second booking-preview API
- a second tenant public-config contract
- frontend assumptions that `PATCH /me` can change phone
- production SMS delivery logic

## 8. If Claude Needs More Backend Changes

Best request format back to Codex:

1. exact frontend screen or flow
2. exact endpoint
3. exact missing field or behavior
4. blocking or non-blocking
5. desired request/response delta

Example:

> Screen: onboarding/profile completion  
> Endpoint: `PATCH /api/me`  
> Missing: phone update support  
> Blocking: yes for production phone-change flow  
> Desired delta: allow `{ phone: string }` with normalized response and
> machine-readable validation errors

## 9. Best Next Move For Claude

The most logical next frontend pass is:

1. finalize white-label boot from public config
2. implement phone-first onboarding against debug-safe auth
3. add profile completion gate via `GET /me` + `PATCH /me`
4. wire booking preview to stored profile identity
5. build cabinet UI from `GET /appointments/my`
6. mirror the same changes into iOS web source

That work can proceed now without waiting for more backend redesign.
