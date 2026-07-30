# CLAUDE LIVE TENANT MALE ESTHETIC - handoff from Codex

Date: 2026-07-19
Status: backend ready; frontend switch and owner-entered YClients user token remain.

## Canonical connection data

| Item | Value |
|---|---|
| API base | `https://api.111.88.148.206.nip.io/api` |
| Tenant name | `Мужская Эстетика` |
| Tenant slug | `muzhskaya-estetika` |
| Tenant status | `active` |
| Plan | `business_plus` |
| Calendar source | `external` |
| Requested booking mode | `live` |
| Current effective mode | `preview` until CRM activation |
| Current live blocker | `crm_not_active` |
| Owner email | `mosinstav@gmail.com` |
| Owner role | `tenant_owner` |
| Owner login method | email + password through `POST /auth/login` |

The owner password is not committed or written into this document. It is stored in the local macOS Keychain under service:

`MAYA SaaS staging - muzhskaya-estetika owner`

Account: `mosinstav@gmail.com`.

## What Codex completed

- Created the isolated tenant and one branch for `Мужская Эстетика`.
- Assigned `business_plus`; all required entitlements are effective: `booking`, `crm.integration`, `loyalty`, `customer.portal`, `booking.public`, `booking.customer_app`, `branding.custom`.
- Set `booking_mode_requested=live`, `calendar_source=external`, self-registration enabled and branding app name.
- Created and successfully logged in the owner as `tenant_owner`.
- Added a backend privilege fence: only `platform_owner` can assign `tenant_owner`; a tenant admin cannot elevate another user.
- Put the platform YClients partner token into the protected staging environment without exposing it.
- Confirmed `yclients` is selectable, production-ready and implements staff, services, availability, create, cancel and reschedule operations.
- Confirmed the CRM encryption key is enabled on staging.
- Confirmed disconnected behavior: `/services` and `/staff` return `crm_integration_not_configured`; no mock data are substituted.
- Confirmed client email/password registration is available through `POST /auth/register`.
- Ran 402 backend tests, typecheck, lint and build; all GitHub checks are green.
- Deployed immutable backend release `b8dba10b`.

No tenant user token was copied by Codex. No real YClients booking was created.

## Claude: switch the native app

Use this boot data:

```js
var API = 'https://api.111.88.148.206.nip.io/api';
var SLUG = 'muzhskaya-estetika';
window.__ME_TENANT_BOOT = Object.freeze({ enabled: true, api: API, slug: SLUG });
```

Critical: the current iOS staging block uses the same `SLUG` variable for demo guest auto-registration. Preserve the boot assignment above, but stop the auto-registration section for every non-demo tenant:

```js
if (SLUG !== 'demo-business') return;
```

Place that explicit check immediately after assigning `window.__ME_TENANT_BOOT` and before the generated `guest_...@demo.maya` account. Do not merely replace `demo-business` with the live slug across the whole block. The live tenant must show normal login and must never create a demo guest.

Owner login request:

```json
{
  "tenantSlug": "muzhskaya-estetika",
  "email": "mosinstav@gmail.com",
  "password": "read manually from the local macOS Keychain"
}
```

Never put that password into source, logs, localStorage fixtures or this repository.

## Stas: connect YClients in Integration Center

The UI must let Stas enter the tenant user token himself. The connection payload is:

```json
{
  "provider": "yclients",
  "apiToken": "entered by Stas in the protected form",
  "settingsJson": {
    "companyId": 503759
  }
}
```

Connection sequence:

1. `POST /integrations/crm/connect` verifies credentials and returns a safe import preview.
2. Show the real staff/service counts and ask the owner to confirm.
3. `POST /integrations/crm/activate` activates the connection.
4. Re-read `GET /integrations/crm` and `/mobile/config/muzhskaya-estetika`.
5. Effective booking mode must become `live` and `booking_live_blockers` must become empty.

After activation, verify `GET /staff`, `GET /services`, `GET /available-days` and `GET /available-slots` against company `503759`. Do not create a real appointment automatically. A live booking check requires Stas's explicit confirmation, a clearly marked test client, and immediate cancellation verification.

## Client authentication

For the live tenant, client registration is normal email/password registration:

`POST /auth/register` with `tenantSlug`, `email`, `password`, optional `name`, `phone` and `branchId`.

The demo guest auto-login must remain strictly limited to `demo-business`. Phone/SMS, Telegram and Yandex production login are separate provider-enablement tasks and are not required for this first controlled live test.

## Security boundary

HTTPS, tenant isolation, role checks, encrypted CRM credentials, encrypted sensitive notes/names and PII-free AI tool payloads are active. This staging deployment is still not a production 152-FZ environment: it uses a `nip.io` host, has no production backup/retention policy, and indexed account fields such as email/phone are not fully field-level encrypted. Keep access limited to Stas and controlled testers until the production security checklist is closed.
