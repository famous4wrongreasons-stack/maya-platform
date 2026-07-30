# CLAUDE LIVE WIDGETS DEPLOY RESULTS

Codex closed backend blockers 1-3 from
`CLAUDE_DEPLOY_FOR_LIVE_WIDGETS_TASK.md`. The public SaaS backend is live,
isolated from the existing Python backend, and ready for the PWA/iOS widget
pass.

## Use this backend

```text
API base: https://api.111.88.148.206.nip.io/api
Tenant:   demo-business
Mode:     preview
```

Health check:

```text
https://api.111.88.148.206.nip.io/api/health
```

## Trusted boot for PWA

Define this before the current multi-tenant boot script in `app.html`:

```html
<script>
  window.__ME_TENANT_BOOT = Object.freeze({
    enabled: true,
    api: 'https://api.111.88.148.206.nip.io/api',
    slug: 'demo-business',
  });
</script>
```

Keep the public-host fail-closed rule. Do not re-enable API-base query
overrides on `malesthetic.pro`.

## Native boot

Mirror the same object in the iOS bundle. The current Capacitor code sees its
own `localhost` origin as local development, so make trusted `srvBoot` win in
that branch too:

- `srvBoot.enabled === true` activates SaaS mode;
- `srvBoot.api` supplies the HTTPS API base;
- `srvBoot.slug` supplies `demo-business`;
- no localhost fallback and no query parameter are required.

Then mirror PWA to iOS, run `npx cap sync ios`, build, install and test on
Stas's iPhone.

## Session for the mock tenant

Do not embed seed credentials or a JWT. External phone/email/social providers
are intentionally disabled on this staging backend. For a widget test client,
use the existing public endpoint:

```http
POST /api/auth/register
Content-Type: application/json

{
  "tenantSlug": "demo-business",
  "name": "<client-entered name>",
  "email": "<unique test email>",
  "password": "<locally generated password, at least 8 characters>",
  "phone": "<optional client phone>"
}
```

Store the returned session only through the existing tenant-scoped auth
pipeline; `window.__meSaasAuthedFetch` remains the single request bridge. A
staging-only automatic registration is acceptable if it is strictly gated by
this exact API host plus `demo-business` and never runs for a real tenant.

## Verified public flow

All requests below passed over HTTPS as a newly registered `client`:

- `GET /staff`: 2 providers;
- `GET /services`: 3 services;
- `GET /available-days`: 8 days;
- `GET /available-slots`: 5 slots for the selected day/provider;
- `POST /appointments/preview`: success, preview mode, 1500 RUB;
- CORS: green for `malesthetic.pro`, `www.malesthetic.pro` and
  `capacitor://localhost`;
- untrusted origin: no CORS permission.

The preview request must contain `clientName` and, when available,
`clientPhone`; otherwise the backend correctly returns
`client_name_required`.

## Scope guard

- Do not switch the real `malesthetic` tenant or legacy booking to this mock.
- Do not add secrets to frontend files, commits or this document.
- Do not enable live appointment creation for `demo-business`.
- The optional proactive `widget` field in `/api/ai/chat` is not part of this
  deployment. First complete phone/PWA rendering through the existing
  `Записаться` chip and `window.__meSaasAuthedFetch`.

Backend operational details are in
`maya-saas-backend/docs/operations/LIVE_WIDGETS_STAGING.md`.
