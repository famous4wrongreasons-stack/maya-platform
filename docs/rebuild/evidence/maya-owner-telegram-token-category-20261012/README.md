# Telegram token-exchange refusal: response category diagnostic

Date: 2026-10-12 (Europe/Moscow).
Branch: codex/maya-local-crm-setup-20261010.
Executed code checkpoint: fc34d9c5522c85ef73753fa5e62008eaf55f7a65.
Real attempts: 6f297f80d5906e39e3a19f261bf7a91fc4463a21.
Local owner acceptance after C9; not release certification or deployment.

## Actual attempts 02 and 03

Both clean-Chrome callbacks reached the canonical Telegram link completion.
Each made exactly one permitted token exchange. The provider returned HTTP 200
and parseable JSON, but the canonical application refused with HTTP 400 /
social_exchange_failed before any JWKS request. Current code and this trace
prove a missing or falsy id_token at the exchange parser, not the provider's
exact error. No raw response, authorization code, secret or token was retained.

After attempt 02 the owner explicitly said the second input had been the bot
API Token from the main bot menu. That is not the Login Widget Client Secret
required by the current OIDC flow. This is confirmed input provenance for that
attempt, not proof that it explains every failed exchange.

The owner authorized a fresh attempt (03) and was directed to the Login Widget
Client Secret. The agent did not inspect the entered value. This attempt showed
the same exchange refusal, so key correction cannot yet be reported as a fix.

Read-only local queries for each attempt found zero Telegram identities for
the selected owner, one new consumed flow, and zero selected-owner audit actions.
No fresh login, personal Client binding or registry lookup was reached. Each
session was stopped deliberately; database/process cleanup, retained private
state and source equality passed. No code changed while either session ran.

## Narrow diagnostic extension

The existing local transport now classifies an already-read successful token
response into a fixed outcome vocabulary. It distinguishes a present ID token,
a missing token, unexpected shape, contradictory token/error and an exact
allowlist of OAuth error categories. Unknown errors become oauth_other_error.
It never copies error_description, arbitrary error strings, tokens, identity
fields, response bodies, URLs, headers or credentials into receipts.

The existing strict IPC projector permits the category only on a completed
2xx POST response from the exact Telegram token route. JWKS and non-OK replies
have no category. Non-OK bodies remain unread/cancelled. Returned response bytes,
HTTP semantics, guards, expiry, counters and one-use behavior are unchanged.
There is no new authentication writer or authority source.

Product src, schema/migrations, React, headless runtime and callback sources
are byte-identical to the real-attempt checkpoint. Only three local diagnostic
script/test files and one synthetic HTTP proof changed in the code commit.

## Fresh checks on the executed checkpoint

| Surface | Result |
| --- | --- |
| Local read / Telegram / callback units | 232 PASS / 0 FAIL |
| Actual AppModule + isolated PostgreSQL, synthetic wire | 88 PASS / 0 FAIL |
| Compiled child / IPC / relay | 11 checks PASS; zero provider dispatches |
| Existing local restriction mutations | 38 green baseline; 11/11 killed; 38 restored |
| New diagnostic mutations | 11 green baseline; 4/4 killed; 11 restored |
| New tests against old committed sources | 9 PASS / 2 expected FAIL |
| Same tests against changed sources | 11 PASS / 0 FAIL |
| Scoped type check and changed TypeScript lint | PASS |

The added HTTP cases use synthetic invalid_client and invalid_grant responses
with HTTP 200. Both still refuse completion, consume once, reject replay and
create no identity or Client binding. Their receipts retain only the category.
These fixtures are not claims about the unretained real provider error.
All mutation edits occurred in isolated committed-source copies.

## Remaining boundary

Real owner binding and fresh Telegram login remain NOT PROVEN. The old private
plans and codes are consumed and must not be reused. A new live attempt needs
new explicit owner approval and a fresh one-use plan pinned to the current
committed source; correct credentials must be entered manually and kept local.
The next attempt can distinguish a known OAuth error from an absent or unexpected
token response without capturing secrets. No fresh live authorization was issued
as part of these offline checks.

No production change, deploy, migration/grant, SMS, booking, message, model call,
iPhone action or push occurred. The retained owner database was not restarted
for synthetic testing. Historical evidence is preserved in its original files.

Protocol reference checked read-only: https://core.telegram.org/bots/telegram-login
(BotFather Login Widget credentials and manual OIDC exchange).

## Later real attempt

[Attempt 04](LIVE-ATTEMPT-04.md) on the documentation-follow-up checkpoint
reached the provider and retained the exact category invalid_client. It narrows
the refusal to application-client authentication; the exact credential cause
and successful real binding remain unproven. Earlier results above are unchanged.
