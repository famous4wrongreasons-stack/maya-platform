# MAYA platform host

The neutral MAYA host serves the universal PWA and proxies `/api` to the
isolated multi-tenant backend. It must never reuse `malesthetic.pro`, because
that domain belongs to one tenant.

Temporary acceptance host:

- `https://maya.111.88.148.206.nip.io/app.html`
- web OAuth callback: `https://maya.111.88.148.206.nip.io/oauth-callback.html`
- native OAuth callback: `https://maya.111.88.148.206.nip.io/api/auth/oauth/native/callback`

## Shared platform login

The platform uses one neutral identity contour for every tenant. A business
does not need to create its own Telegram bot or Yandex application.

- Telegram bot: `@mayaos_login_bot` (`MAYA OS`)
- Telegram protocol: OpenID Connect Authorization Code Flow with PKCE
- Telegram scopes: `openid profile phone`
- Yandex application: `MAYA OS`
- Provider credentials live only in `/etc/maya-saas/live-widgets.env` on the
  platform server and must never be committed to Git.

Telegram allows exactly these temporary acceptance addresses:

- redirect URI: `https://maya.111.88.148.206.nip.io/oauth-callback.html`
- redirect URI: `https://maya.111.88.148.206.nip.io/api/auth/oauth/native/callback`
- trusted origin: `https://maya.111.88.148.206.nip.io`

The existing `malesthetic.pro` OAuth configuration and salon Telegram bot are
separate tenant infrastructure and are not modified by this platform setup.

The final neutral domain uses the same path layout. Only the hostname, DNS,
certificate and exact provider callback allow-list change during cutover.

Final-domain cutover order:

1. Point the neutral domain to the platform server and issue TLS.
2. Run `configure-staging-env.sh` with the final hostname.
3. Add the final web and native callbacks to Yandex ID.
4. Add the final redirects and trusted origin to `@mayaos_login_bot`.
5. Run `npm run release:preflight`, restart `maya-saas.service`, and verify
   both `/api/auth/oauth/yandex/start` and `/api/auth/oauth/telegram/start`.
6. Remove the temporary `nip.io` entries only after PWA and iOS acceptance.
