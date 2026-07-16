# CLAUDE_SOCIAL_AUTH_PACKET

Backend block is done on Codex side. Frontend task only.

## What is already ready on backend

New public endpoints in `maya-saas-backend`:

- `POST /api/auth/oauth/yandex/start`
- `POST /api/auth/oauth/yandex/complete`
- `POST /api/auth/oauth/telegram/start`
- `POST /api/auth/oauth/telegram/complete`

Existing profile endpoint now also accepts initial phone completion after social login:

- `PATCH /api/me`

Backend returns the same JWT shape as phone auth:

```json
{
  "access_token": "...",
  "user": { "...": "..." },
  "is_new_user": true,
  "provider": "yandex"
}
```

## Contract

### 1. Start Yandex

`POST /api/auth/oauth/yandex/start`

```json
{
  "tenantSlug": "demo-salon",
  "redirectUri": "https://malesthetic.pro/app/oauth-callback.html"
}
```

Response:

```json
{
  "ok": true,
  "provider": "yandex",
  "tenant_slug": "demo-salon",
  "auth_url": "https://oauth.yandex.com/authorize?...",
  "expires_at": "2026-07-05T11:26:53.837Z",
  "state": "ya_..."
}
```

### 2. Complete Yandex

`POST /api/auth/oauth/yandex/complete`

```json
{
  "state": "ya_...",
  "code": "..."
}
```

Optional:

```json
{
  "state": "ya_...",
  "code": "...",
  "branchId": "..."
}
```

### 3. Start Telegram

`POST /api/auth/oauth/telegram/start`

```json
{
  "tenantSlug": "demo-salon",
  "redirectUri": "https://malesthetic.pro/app/oauth-callback.html"
}
```

Response mirrors Yandex, but `provider: "telegram"` and `auth_url` points to `https://oauth.telegram.org/auth?...`.

### 4. Complete Telegram

`POST /api/auth/oauth/telegram/complete`

```json
{
  "state": "te_...",
  "code": "..."
}
```

Optional `branchId` works the same way.

## Frontend work for Claude

### A. Add two buttons to the SaaS client auth screen

- `Войти через Яндекс`
- `Войти через Telegram`

Keep phone auth as fallback, do not remove it.

### B. Callback page

Create one lightweight callback page, for example:

- `/oauth-callback.html`

Behavior:

1. Read `code`, `state`, `error`, `error_description` from URL.
2. Detect provider from `state` prefix:
   - `ya_` => Yandex
   - `te_` => Telegram
3. Call matching `/complete` endpoint.
4. Save returned JWT exactly the same way as current phone auth saves it.
5. Redirect user back into the normal client flow.

### C. Profile completion after social login

Important: backend can log the user in even if provider did not return a Russian phone number.

In that case backend returns:

- `profile_completed: false`
- `missing_profile_fields` contains `phone` and/or `name`

Current phone-first flow already knows how to finish `name`.
Now extend it so that after social login it can also finish `phone` through:

`PATCH /api/me`

Example:

```json
{
  "phone": "+79990000000"
}
```

This is for initial completion only. Treat it as “complete your profile”, not “change phone in settings”.

### D. Error mapping

Map these backend codes into normal human text:

- `social_provider_unavailable`
- `social_state_invalid`
- `social_exchange_failed`
- `social_token_invalid`
- `social_identity_conflict`
- `trial_client_registration_disabled`
- `self_registration_disabled`

## Important notes

- Backend already stores provider identities per tenant, so do not invent local account-linking logic.
- Backend already validates Telegram ID tokens via JWKS.
- Backend already uses `state + PKCE`; frontend should not try to generate PKCE itself.
- Frontend only needs to call `/start`, open `auth_url`, then call `/complete` from callback.
- If social login returns `profile_completed: false`, do not treat it as a failed login. It is a successful login with an incomplete profile.
