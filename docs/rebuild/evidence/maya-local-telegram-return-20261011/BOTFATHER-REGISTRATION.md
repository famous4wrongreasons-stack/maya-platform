# Current Telegram registration — visual evidence and approved local addition

Observed in the owner's BotFather **mini app**, Login Widget, on 2026-10-11
at approximately 22:38–22:39 Europe/Moscow. These are UI observations, not an
executed real Telegram sign-in or permission to change the bot.

| Setting | Visible value | Qualification |
| --- | --- | --- |
| Web Redirect URI | `https://mayaos.ru/oauth-callback.html` | Full value visible |
| Trusted Origins | `https://mayaos.ru/` | Full value visible |
| Signing algorithm | `RS256 (Default)` | Visible selection |
| Native redirect | `https://mayaos.ru/api/auth/oauth/native/callback` | Initially clipped in screenshot; full value subsequently verified in the mini app accessibility state |

No Client Secret, bot token or account identifier is reproduced. The screenshots
are not copied into the repository: they include unrelated private chat/contact
content. The initial observations above preceded any configuration change.

The local saved launch uses `http://127.0.0.1:56151`, verified read-only from its
original stage-0 manifest's landing URL. Registration of that origin/redirect
was not present in the initial screenshots. Local HTTP acceptance by Maya's development redirect
resolver is NOT proof of Telegram provider acceptance.

## Owner-approved external step — executed on 2026-10-11

The owner explicitly approved attempting only these additions, preserving the
existing production registrations:

- Redirect URI: `http://127.0.0.1:56151/oauth-callback.html`
- Trusted Origin: `http://127.0.0.1:56151`

Observed result, completed before 20:00 UTC (23:00 Europe/Moscow):

- **Redirect URI added:** the exact local callback remained present after a
  mini-app refresh (new accessibility tree; field now an existing redirect).
- **Exact Trusted Origin not retained:** the UI first displayed the submitted
  `http://127.0.0.1:56151`, then normalized it to `http://127.0.0.1/`. A second
  exact entry followed by leaving the field reproduced the same result.
- That newly added, non-matching origin was removed. The refreshed state contains
  only the original `https://mayaos.ru/` Trusted Origin. No wildcard, port-80
  replacement or broader origin was left behind.
- Both original production redirects, original Trusted Origin and RS256 selection
  remained unchanged. No credential regeneration/revoke was performed.

This proves the observed registration state, **not** a successful provider login,
code exchange, personal binding or CRM read. No raw accessibility dump or screenshot
was persisted in the repository.

### Meaning of the origin discrepancy

Current `SocialAuthService.startTelegramLogin` builds Authorization Code + S256
PKCE. `exchangeTelegramCode` performs the `/token` POST on the backend, with the
stored redirect and verifier; the browser submits only state/code to Maya's own
complete endpoint. The carrier does not embed `telegram-login.js` and does not
make cross-origin token requests to Telegram.

The official manual OIDC instructions describe this server-side exchange. The
mini-app labels Trusted Origins as allowed origins for cross-origin token
requests. **Inference:** the unavailable exact Trusted Origin is not, on its own,
proof that this server-side flow cannot work. Real provider acceptance is still
unverified. Do not change the launcher to bypass an actual provider refusal.

If BotFather rejects local HTTP, STOP this registration attempt. Do not substitute
an HTTPS label, disable certificate checks, intercept the production domain, add
a tunnel, change DNS or deploy a page. A separate concrete HTTPS test address
would then need to be selected and approved. No such fallback is implemented.

This registration change does not authorize a real private-data run.
The retained-owner launcher needs its separately admitted finite Telegram/private
read mode; the existing catalog/setup mode remains closed. Do not request keys
until the complete mode is proved, source-pinned and its scope approved.

The official [Telegram registration instructions](https://core.telegram.org/bots/telegram-login#registering-your-allowed-urls)
require exact pre-registered redirects. The inspected instructions do not establish
that this particular loopback HTTP URI will be accepted by the provider.
