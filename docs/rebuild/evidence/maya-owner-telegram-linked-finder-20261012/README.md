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

## Binary proof correction (preserved failure)

The first expanded binary run stopped after the health check. A diagnostic
rerun retained only the finder status and item count: HTTP 200, one item.
Its assertion incorrectly expected an empty list merely because the synthetic
tenant had no explicit customer-app grant. The existing public finder has a
legacy no-feature-key fallback and this fixture was otherwise client-ready.
No product rule was changed to satisfy that assumption.

The corrected binary proof first requires the exact synthetic tenant match,
then explicitly disables allowSelfRegistration in that disposable fixture and
requires an empty finder result. This is the canonical readiness condition
already covered by the HTTP proof. The initial and diagnostic failed receipts
remain local, with hashes recorded in the final proof manifest. The correction
is test-only commit 67eb820558f601eb6ca597dc4ef5e3ab340fa7c6; the local installer
fix is commit 036d8598f4e15047c4503a8928a267cd9150350c.

## Final checks

- Local unit tests: 250 PASS / 0 FAIL.
- Expanded HTTP/isolated-PG suite: 90 PASS / 0 FAIL; the runtime and live-spec
  bytes exactly match the committed source.
- Scoped TypeScript and changed-test lint: PASS. One earlier type invocation
  named a nonexistent config path; the corrected invocation passed.
- Existing restriction mutations: 38 green baseline, 11/11 killed, 38 restored.
- Actual compiled child/IPC/web-relay proof on
  67eb820558f601eb6ca597dc4ef5e3ab340fa7c6: 14 checks PASS, zero provider
  dispatches, clean child/database shutdown and unchanged source.
- The retained real owner database stayed stopped throughout these proofs.

See proof-summary.json and receipt-manifest.json for provenance, including the
two deliberately preserved binary failures and their corrected final run.
