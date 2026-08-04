# Live widgets public staging

Status: active as of 2026-07-19.

This deployment exists to test MAYA chat widgets from the current tenant PWA
and the Capacitor iOS shell without switching the existing Python backend or
the real `malesthetic` tenant. The `malesthetic.pro` domain belongs to that
tenant and is not the future platform domain of MAYA APP.

## Public contract

- API base: `https://api.111.88.148.206.nip.io/api`
- Health: `GET https://api.111.88.148.206.nip.io/api/health`
- Demo tenant slug: `demo-business`
- Calendar source: mock CRM
- Booking mode: preview
- Temporary CORS origins used by this staging test:
  `https://malesthetic.pro`, `https://www.malesthetic.pro`,
  `capacitor://localhost`

The mock tenant contains two providers and three services. It is isolated from
the existing production salon and does not use YClients, YooKassa, SMS, email
or social-login credentials.

## Runtime layout

- Release commit: `3b241e3b`
- Application: `/opt/maya-saas/current`
- Immutable release: `/opt/maya-saas/releases/3b241e3b`
- Environment: `/etc/maya-saas/live-widgets.env`
- Uploads: `/var/lib/maya-saas/uploads`
- Service: `maya-saas.service`
- Bind address: `127.0.0.1:3107`
- Database: local PostgreSQL database `maya_saas`
- Reverse proxy: `/etc/nginx/sites-available/api.111.88.148.206.nip.io`
- Certificate: Let's Encrypt, auto-renewed by Certbot
- Renewal deploy hook: `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx`

The legacy `barbershop-bot` service remains on port `8080`; its Nginx host and
realtime route are unchanged.

## Acceptance evidence

The following checks passed through the public HTTPS endpoint:

- production runtime validation and release preflight;
- all 23 Prisma migrations on the isolated database;
- membership-readiness audit with zero blockers;
- tenant-admin login without printing credentials;
- client self-registration into `demo-business`;
- `GET /staff`: 2 mock providers;
- `GET /services`: 3 mock services;
- `GET /available-days`: non-empty result;
- `GET /available-slots`: non-empty result;
- `POST /appointments/preview`: `preview=true`, `mode=preview`;
- allowed CORS preflights for PWA, `www` and Capacitor;
- untrusted origins receive no CORS permission.

## Frontend boot

The PWA must receive this trusted configuration before the existing
multi-tenant boot script runs:

```html
<script>
  window.__ME_TENANT_BOOT = Object.freeze({
    enabled: true,
    api: 'https://api.111.88.148.206.nip.io/api',
    slug: 'demo-business',
  });
</script>
```

Do not put an access token, seed password or provider secret in this object.
The frontend obtains its own tenant-scoped session. For this mock environment,
`POST /api/auth/register` is available; real SMS, email and social providers
remain disabled until their independent production acceptance gates.

The Capacitor bundle currently classifies its own `localhost` origin as local
development. Its boot code must explicitly prefer trusted
`window.__ME_TENANT_BOOT` values so the native build does not fall back to a
localhost API.

## Operations

Inspect without exposing environment values:

```bash
sudo systemctl status maya-saas.service
sudo journalctl -u maya-saas.service --since '15 minutes ago'
curl -fsS https://api.111.88.148.206.nip.io/api/health
```

Validate a release before restart:

```bash
cd /opt/maya-saas/current
sudo -u maya-saas env HOME=/var/lib/maya-saas \
  PATH=/opt/node-v24/bin:/usr/bin:/bin \
  bash -lc 'set -a; . /etc/maya-saas/live-widgets.env; set +a; \
  npm run audit:membership-readiness && \
  npm run prisma:migrate:deploy && \
  npm run release:preflight -- --env /etc/maya-saas/live-widgets.env'
```

Rollback is a release-symlink switch followed by a restart. Never copy the
legacy bot environment into this service, and never print
`/etc/maya-saas/live-widgets.env`.

## Limits

- This is a public staging endpoint, not the final commercial production URL.
- The hostname uses `nip.io` until MAYA APP receives its own neutral
  platform domain. Do not create `api.malesthetic.pro` for the platform.
- The demo tenant is mock-only and cannot create a real salon appointment.
- External authentication, payments and real CRM credentials are disabled.
- Proactive `widget` signals in `POST /api/ai/chat` are a separate contract;
  chip-driven booking works without that extension.
