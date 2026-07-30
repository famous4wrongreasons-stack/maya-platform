# MAYA OS: stop the broken Telegram Safari redirect and route social login correctly

## Context and reproduced root cause

Work on branch `codex/maya-os-release-candidate`. Do not change `main`, do not
deploy production and do not change NestJS/Prisma/backend policy.

The owner tapped `Войти через Telegram` on the main MAYA OS login screen. The
phone left the app, opened Safari and the page did not load.

This is not the new tenant social-auth flow failing after OAuth. The main
`ALogin` button is wired to the wrong system:

```js
onClick: () => window.__meTgLogin && window.__meTgLogin()
```

`window.__meTgLogin()` invokes the legacy `__meNativeTgLogin()` flow, calls the
production `api-proxy.php?action=applogin_start` and opens:

```text
https://t.me/malesthetic_bot?start=app_<nonce>
```

That flow belongs to the existing single-business `Мужская Эстетика` app. It
returns the legacy `web_session_token`; it is not tenant-scoped MAYA OS auth
and must not be used by the universal `ALogin` screen.

The correct tenant flow already exists in `ABookFlow.authSocial(provider)`:

```http
POST {apiBase}/auth/oauth/telegram/start
Content-Type: application/json

{
  "tenantSlug": "<current tenant>",
  "redirectUri": "<approved callback>"
}
```

The current local backend intentionally reports Telegram as unavailable:

- `TELEGRAM_LOGIN_ENABLED=false`;
- no local `TELEGRAM_CLIENT_ID`;
- no local `TELEGRAM_CLIENT_SECRET`;
- no local `OAUTH_ALLOWED_REDIRECT_URIS`.

Therefore the safe local behavior is an in-app `Скоро`/unavailable message,
not leaving MAYA for a dead Safari page.

## 1. Remove the legacy cross-wiring from universal MAYA OS login

When `window.__ME_SAAS_CTX` / `booking_backend=saas-local` is active:

1. `ALogin` Telegram must never call `window.__meTgLogin()`.
2. `ALogin` Yandex must never call the legacy `window.loginYandex()`.
3. Do not call `api-proxy.php`, create a legacy app-login nonce, open
   `malesthetic_bot` or write `web_session_token` from the MAYA OS login
   screen.
4. Preserve those legacy handlers only for the existing production
   `Мужская Эстетика` mode outside MAYA OS tenant context.

## 2. Add one tenant-scoped social starter to `ALogin`

Implement an `ALogin` helper equivalent to the safe parts of
`ABookFlow.authSocial(provider)`:

1. Resolve only the current `apiBase` and current tenant slug.
2. Fail closed without tenant context.
3. POST `/auth/oauth/{provider}/start` with `tenantSlug` and callback URI.
4. Verify that response `state` equals the `state` inside `auth_url`.
5. Store pending context only under `me_oauth_pending:<state>` and only after
   a successful backend response.
6. Navigate to `auth_url` only after the pending write has been read back.
7. Use the existing tenant-scoped callback/session bundle
   `me_saas_auth_v2:<namespace>`; do not invent another auth store.

Reuse the existing calm backend error mapping. In particular:

- `social_provider_unavailable`;
- `social_redirect_invalid`;
- `auth_rate_limited` with server countdown.

If start fails, stay inside MAYA and show the error under the social buttons.
Never open Safari on a failed or unavailable provider.

## 3. Local and unconfigured provider behavior

The buttons remain visible, as agreed for future functions.

For `social_provider_unavailable` in the local RC:

- show the existing MAYA-style bottom notice or compact inline state;
- title: `Скоро`;
- text: `Вход через Telegram подключается. Пока войдите через email.`;
- do not navigate, open a new tab, start a legacy bot flow or leave a spinner
  running.

Use equivalent copy for Yandex. Email login remains active.

Do not fake a successful Telegram login and do not enable the backend by
hardcoding credentials in HTML.

## 4. Callback rules

Telegram OIDC allowed URLs are registered in BotFather and the authorization
code is returned only to an approved callback. A LAN address such as
`http://192.168.x.x:8890/oauth-callback.html` is not a production callback.

Rules:

1. Never silently send a LAN/HTTP callback to Telegram.
2. For the web production origin, use the approved HTTPS callback.
3. For the native iOS app, do not assume `capacitor://localhost` is a website
   callback. Leave the button in the safe unavailable state until the native
   SDK or an approved HTTPS callback-to-app handoff is configured.
4. Never place access/refresh tokens in a URL.

The backend remains the source of truth: if the callback is not allowlisted,
`/start` returns `social_redirect_invalid` and the frontend stays in-app.

## 5. Visual and mirror requirements

- Preserve the existing black/white MAYA visual system.
- No browser alert for expected unavailable-provider states.
- No separate website or admin screen.
- Mirror the change in:
  - `сайт и приложение/app.html`;
  - `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`.
- Run all inline-script parsing, `npx cap sync ios` and confirm:

```bash
cmp -s www/index.html ios/App/App/public/index.html
```

## Acceptance tests

1. MAYA OS local RC, Telegram disabled: tap `Войти через Telegram`; the app
   stays open and shows `Скоро`. Safari/Telegram does not open.
2. MAYA OS local RC, Yandex disabled: same safe behavior.
3. The legacy non-MAYA-OS `Мужская Эстетика` login remains unchanged.
4. With a mocked successful tenant `/oauth/telegram/start`, `ALogin` uses the
   returned state/auth URL and never calls `api-proxy.php` or
   `malesthetic_bot`.
5. A mismatched state, unavailable provider or invalid redirect never causes
   navigation.
6. Email code login still works.
7. PWA/iOS scripts parse and the iOS public mirror is byte-identical.

Return `CLAUDE_TELEGRAM_LOGIN_ROUTING_FIX_RESULTS.md` with the commits, changed
files, checks and one screenshot of the local `Скоро` state.
