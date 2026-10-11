# Local Telegram link succeeded; fresh-login finder refusal

Date: 2026-10-12 (Europe/Moscow).
Branch: codex/maya-local-crm-setup-20261010.
Real attempt candidate: 8d311022e0d1169bbbec4f92b5bec1a0da26ba73.
This is local owner acceptance after C9, not production or release certification.

## What the real attempt proved

The owner authorized one new session and manually supplied a freshly copied
Login Widget Client Secret. Its value was not inspected or retained. Telegram
returned an ID token, canonical JWKS verification completed, and the existing
A23 link completion returned HTTP 201. React displayed that Telegram was linked.
A read-only local query confirmed exactly one Telegram AuthIdentity for the
selected owner. The new auth flow was consumed.

There were exactly two provider requests: one Telegram token exchange and one
JWKS read. No YCLIENTS registry read occurred. No personal ClientChannelLink was
created during the attempt. The actor's role and identity authority were not
manually changed. Linking Telegram does not itself prove Client ownership.

## Exact next failure

The ordinary React fresh-login screen called the canonical business finder with
the exact approved saved tenant slug. The finder returned HTTP 503 with
`tenant_pwa_install_disabled`. An exact loopback read reproduced the same
response. The retained stage-0 environment sets
`PWA_TENANT_INSTALL_ENABLED=false`; the canonical finder shares that switch
with tenant PWA installation. Earlier synthetic local-guard tests started
Telegram directly and did not exercise this finder with the retained setting.

This is a local harness configuration gap. The session was stopped before any
code edits. Source equality, private-state equality, database shutdown and
child-process cleanup passed. The saved real Telegram link remains in the
retained local database. Raw identifiers, credentials, tokens and provider
bodies are absent from this archive; the receipt file contains safe counts
and source hashes only.

## Narrow correction and limits

Only the separately authorized local Telegram installer enables the shared
flag in its in-memory ConfigService and restores its prior value on stop.
The base stage-0 profile, product code and production configuration stay
unchanged. Existing ingress still admits only the exact saved-slug search;
other searches, extra query fields and PWA installation/manifest/QR endpoints
remain refused. Canonical client readiness is still required.

Regression coverage starts with the real disabled setting, searches through
the actual AppModule, then completes a fresh signed synthetic login. It also
checks hidden non-ready tenants, forbidden routes, expired scope, no provider
calls from finder reads, and restoration on stop. The compiled-child proof
now exercises the finder through the actual local web relay.

Before the correction, these expanded HTTP tests reported 88 PASS / 2 FAIL,
both failures receiving 503 where the exact finder should return 200. With
the correction, 90 PASS / 0 FAIL. These are synthetic HTTP/PG proofs, not a
claim that the real owner has completed a fresh login or personal Client match.
Final committed-source binary and restriction receipts are recorded separately.

## Remaining live boundary

A fresh Telegram login and the exact personal Client match remain NOT PROVEN.
The completed one-use plan cannot be reused. Another real attempt needs a new
bounded owner approval. Linking Telegram again and repeating owner password
entry should not be necessary for that fresh-login path.

No production/deployment/migration/grant, SMS, booking, model, outbound message,
iPhone operation or push occurred. Synthetic proof databases are separate from
the retained owner database.
