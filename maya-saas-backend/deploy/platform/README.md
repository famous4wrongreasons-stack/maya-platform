# MAYA platform host

The neutral MAYA host serves the universal PWA and proxies `/api` to the
isolated multi-tenant backend. It must never reuse `malesthetic.pro`, because
that domain belongs to one tenant.

Temporary acceptance host: **retired 2026-09-29 and permanently dead.**

It was `maya.111.88.148.206.nip.io`, and the name carried the address inside it. When the
ephemeral address was lost on 2026-09-23 the name began resolving to an unrelated tenant, and
because ACME HTTP-01 validates against whatever the name resolves to, its certificate can never
renew either. That is the defect the canonical host below exists to avoid.

Canonical API host (since 2026-09-29):

- `https://api.mayaos.ru` — a real name on a reserved address, certificate renews normally

Final production host:

- `https://mayaos.ru/app.html`
- web OAuth callback: `https://mayaos.ru/oauth-callback.html`
- native OAuth callback: `https://mayaos.ru/api/auth/oauth/native/callback`
- trusted origin: `https://mayaos.ru`

The production edge is hosted as an isolated Beget site. Static application
files are served by Beget and `/api/*` is relayed to the platform VPS through
`deploy/platform/beget-edge/maya-platform-api.php`. This avoids exposing the
salon's `malesthetic.pro` contour and keeps mobile access stable when direct
routes to the VPS are unavailable.

## Shared platform login

The platform uses one neutral identity contour for every tenant. A business
does not need to create its own Telegram bot or Yandex application.

- Telegram bot: `@mayaos_login_bot` (`MAYA OS`)
- Telegram protocol: OpenID Connect Authorization Code Flow with PKCE
- Telegram scopes: `openid profile phone`
- Yandex application: `MAYA OS`
- Provider credentials live only in `/etc/maya-saas/live-widgets.env` on the
  platform server and must never be committed to Git.

🔴 **Owner action outstanding — shared platform login.** Telegram's allow-list still permits only
the retired acceptance addresses, which no longer resolve to us:

- redirect URI: `https://maya.111.88.148.206.nip.io/oauth-callback.html` — **dead**
- redirect URI: `https://maya.111.88.148.206.nip.io/api/auth/oauth/native/callback` — **dead**
- trusted origin: `https://maya.111.88.148.206.nip.io` — **dead**

Until they are replaced in the Telegram bot's settings with the final production addresses below,
Telegram login cannot complete. Nothing in this repository can change a provider allow-list; it is a
change in the provider's own console.

The existing `malesthetic.pro` OAuth configuration and salon Telegram bot are
separate tenant infrastructure and are not modified by this platform setup.

The final neutral domain is `mayaos.ru` and uses the same path layout. Only
DNS, certificate and exact provider callback allow-list change during cutover.

Final-domain cutover order:

1. Point the neutral domain to the platform server and issue TLS.
2. Run `configure-staging-env.sh` with the final hostname.
3. Add the final web and native callbacks to Yandex ID.
4. Add the final redirects and trusted origin to `@mayaos_login_bot`.
5. Run `npm run release:preflight`, restart `maya-saas.service`, and verify
   both `/api/auth/oauth/yandex/start` and `/api/auth/oauth/telegram/start`.
6. Remove the temporary `nip.io` entries only after PWA and iOS acceptance.
