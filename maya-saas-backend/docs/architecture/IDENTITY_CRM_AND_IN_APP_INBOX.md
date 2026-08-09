# MAYA OS: identity, CRM access and the in-app inbox

## Decision

MAYA OS uses one neutral platform identity layer for every tenant. A salon
domain, including `malesthetic.pro`, must never be an OAuth callback for the
whole platform.

The tenant is selected before authentication by a tenant smart link, QR, NFC
tag or business search. The social provider proves who the person is; it does
not select the business.

The native client consumes the server-owned mode list defined in
[`NATIVE_APP_ACCESS_CONTRACT.md`](./NATIVE_APP_ACCESS_CONTRACT.md). It must not
reconstruct owner, staff or client access from local state.

## Owner onboarding

1. The owner activates MAYA OS and creates a tenant.
2. The owner connects YClients or Altegio in the protected integration card.
3. The backend validates the user token and branch, stores the token encrypted
   and imports the business profile, active staff, services and schedule.
4. The owner confirms their identity and role. A provider identity is linked to
   the tenant-scoped owner user; the CRM token is never used as a login token.
5. MAYA generates one tenant smart link. The same URL can be encoded as QR or
   NFC and can install a tenant-branded PWA.

## Client login

1. The client opens the smart link for one business. MAYA now knows the tenant.
2. The client chooses Yandex ID or the shared MAYA Login Telegram bot.
3. The provider returns a verified phone only after the client grants the phone
   permission.
4. The backend links the provider identity inside the selected tenant and uses
   the verified phone to find the client in that tenant's YClients branch.
5. Appointments, visit history and loyalty are always loaded from YClients by
   that phone. They are not inferred by the language model.

If the provider does not return a verified phone, MAYA must not expose CRM
history or loyalty. The UI asks the client to grant phone access or use another
verified method. If the verified phone is not yet present in YClients, the user
can have a new limited client profile and book; history and loyalty remain empty
until the CRM contains that client.

## One Telegram bot

There is one platform bot / Telegram OIDC application named MAYA Login. It is
an identity and access channel only:

- it confirms the Telegram account and, with consent, the phone;
- it returns the user to the tenant-scoped MAYA application;
- it never decides tenant membership from Telegram ID alone;
- it never receives a CRM token;
- a separate bot per salon is not required.

The existing production bot for `Мужская Эстетика` remains operational during
migration. It must not be removed until the in-app delivery path has production
parity and an explicit cutover has been completed.

## Reports and persistent MAYA chat

Operational reports, daily plans and MAYA recommendations belong in a
tenant-scoped in-app inbox. Telegram or push may announce a new item, but the
message of record is stored by the MAYA backend.

Every inbox item must contain:

- `tenant_id` and one or more recipient user IDs or roles;
- an immutable type and source event ID for idempotency;
- title, safe display payload and creation time;
- read, archived and user-deleted timestamps;
- no raw CRM token and no unencrypted personal data.

Messages remain visible across devices until the user deletes or archives them.
The AI chat may explain an inbox item, but the model must not invent or mutate
the underlying report values.

## OAuth callback contract

- Web/PWA: `https://<maya-platform-domain>/oauth-callback.html`.
- iOS: provider returns to
  `https://<maya-platform-domain>/api/auth/oauth/native/callback`; the backend
  validates the state shape and returns only one-time `code` + `state` to
  `mayaos://oauth-callback`.
- JWT and refresh tokens are never placed in provider callback URLs.
- Both HTTPS callbacks must be exact entries in the provider settings and in
  `OAUTH_ALLOWED_REDIRECT_URIS`.

## Required deployment boundary

A neutral HTTPS platform domain is mandatory before real Yandex or Telegram
login can work in the universal iOS/PWA product. This is infrastructure for the
application, not a marketing website. The platform domain hosts the PWA and
routes `/api` to the MAYA backend. Tenant domains remain optional.

## Migration order

1. Deploy the neutral platform domain, DNS, TLS and `/api` reverse proxy.
2. Register both callback URLs in Yandex ID and the shared Telegram bot.
3. Enable native/PWA OAuth and verify phone-to-YClients matching on staging.
4. Add the persistent in-app inbox and dual-write legacy bot reports to it.
5. Verify owner/staff/client role routing and notification delivery.
6. Stop sending business reports to Telegram only after in-app parity is
   measured and the existing salon explicitly accepts the cutover.
