# Owner-approved test publication and catalogue preparation — 2026-10-15

Execution approval: `user-call_8f6852169a2b4dcb897585f0a8061ecb`, explicit owner answer
«Да, разрешаю весь описанный шаг». The permitted recipient is Aspiring Eduard,
`45.67.56.4`, and the public test host is `phone-test.mayaos.ru`.

## Executed and verified

- Existing signed Keychain helper read only the saved YCLIENTS partner key.
  An exclusive one-execution claim binds the actual owner approval, exact plan,
  destination, helper identity and four-minute transfer deadline. The old local
  provider permit was not reused. This is an operator transfer, not AR-1 authority.
- Key travelled in process memory / SSH stdin; root-only 0600
  `/srv/maya-phone-staging/private/catalog.env` is the only new persistent secret
  destination. No secret-bearing argv, stdout, logs, repository file or receipt.
  DeepSeek was not read or transferred; no Keychain ACL was changed.
- Scope is company `503759`, at most 40 calls, from `2026-10-15T06:43:27.299Z`
  to `2026-10-16T06:43:27.299Z` (09:43 Moscow). No automatic renewal or restart.
  Do not restart/recreate the catalogue relay to reset its process-local budget.
- Existing compiled release preflight: safe configuration, 106 applied migrations,
  zero pending. No migration was newly applied. Backend and database are on
  internal networks with no published ports; only the catalogue relay has outbound
  access. Four live refusal probes passed before provider traffic: writes,
  customer registry, foreign company and missing credentials. Direct backend
  egress is blocked.
- Added only the authorized A record; both authoritative and public DNS resolvers
  return the exact IP. Public HTTPS passes ordinary certificate validation and
  normal system DNS, without `--insecure` or an overridden destination.
- Public payload: all eight React web files match the prepared source manifest.
  Application source remains `7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3`.
  Only deployment-plan code/tests changed. The previously signed iOS bundle was
  not changed or installed; its provisioning expires 2026-10-20.
- The gateway retains the previously authorized SSH-loopback setup entry while
  exposing the exact public test host. Both import one unchanged canonical route
  body and use the same backend/web payload. The setup port is bound only to
  `127.0.0.1:9080`, never public. A17 UI remains localhost-only.
- Gateway-only publication did not restart backend, database or catalogue relay.
  SMM service remained unchanged. Signup stays closed; public endpoint returns
  exact 403 `self_serve_signup_disabled`. No widget entitlements are enabled.
- Scoped staging/bootstrap/catalogue tests: **73 PASS / 0 FAIL**. Caddy image's
  actual validator passed before publication. This is not full release certification.

## Pending owner form and boundaries

At the receipt timestamp, the owner exists and `CrmIntegration` is absent.
The normal owner login is open at the private setup URL; the business slug is
prefilled. The owner must enter their normal credentials and then a YCLIENTS
**user_token** through canonical A17. Partner key entry is no longer needed.
No browser session was extracted and no local database/Client/history was copied.

Real provider calls so far: **0**. No customers/journal, booking, messages, paid
model, production Maya release/grant, or iPhone installation. Catalogue activation
and import must use the existing authenticated A17 version/idempotency/confirmation
path and stay within the stated relay scope. HANDOFF remains STOP.

Rollback: preserve the database and private originals. Revert **gateway only** to
`compose.catalog-private.json` to withdraw public access without resetting the
relay budget. For full catalogue withdrawal, stop `catalog-egress` and return the
backend/gateway to `compose.owner-closed.json`; do not delete the owner database or
reopen signup. Remove only the newly added `phone-test` DNS record if needed.

Read [PUBLIC-HTTPS-PROOF.json](PUBLIC-HTTPS-PROOF.json),
[REMOTE-RECEIPTS.json](REMOTE-RECEIPTS.json), [DNS-PROOF.json](DNS-PROOF.json),
and [scoped-tests.txt](scoped-tests.txt). Older preparation receipts remain historical.
