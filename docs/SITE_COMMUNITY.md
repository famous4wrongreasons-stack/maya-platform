# Guest Discussion and MAYA

## Status: 2026-09-04

The existing MAYA backend now serves the website's guest discussion and guest
chat. The new website UI is available in the sibling `maya-web` project and on
localhost:8770. The old public homepage has not been replaced by this deployment.
The additive owner inbox is published at
`https://malesthetic.pro/events/moderation/`.

No new Telegram bot, polling loop, scheduler, payment writer or booking writer
was introduced. `barbershop-pwa.service` was restarted; the deliberately disabled
`barbershop-bot.service` remains inactive. The configured bot was verified as
`malesthetic_bot` without reading or acknowledging its incoming update queue.

## Visitor Experience

- Reading, likes and comments do not require registration. Commenters can use
  a name or pseudonym; guest names are explicitly unverified.
- Consent is required before submitting a comment or starting guest chat.
- Comments remain private while MAYA checks them. Healthy criticism is allowed.
  Obvious profanity, insults, personal contact data and spam are rejected.
- Ambiguous comments and model failures stay pending for a human decision.
  Serious but non-abusive complaints remain public and are flagged for the owner.
- Useful public replies are signed `Мужская Эстетика`. Generic praise does not
  automatically produce filler replies. Replies cannot invent bookings, prices,
  compensation or completed investigations.
- Guest chat uses MAYA's existing public consultation tools for services,
  masters, availability and hair care. It does not access private customer
  records, create bookings, take payments or change appointments. Booking is
  completed in the existing booking form.

## Moderation

Only an account verified by the existing backend administrator check can open
the inbox or approve/hide a message. Ordinary login does not grant this access.
The existing Telegram bot sends owner alerts with a link to the inbox; it does
not send commenter text or personal details to Telegram. Alerts are capped at
one per minute and twelve per day. Every flagged message remains in the inbox
even when an alert is suppressed or cannot be delivered. There is no background
delivery retry job. Actual owner alert delivery was not triggered during QA.

MAYA's configured active provider/model is reused through existing clients and
billing. The previous helper selected a separate unavailable OpenAI fast model;
the website adapter now follows the working MAYA model instead. Moderation gets
no booking/business tools, and commenter names are never included in its prompt.
Detected contact information is rejected before a model call.

## Abuse Protection and Limits

The existing PHP proxy checks the origin, creates a signed httpOnly guest cookie,
derives hashed visitor/network identities and signs backend requests. Browser
supplied IDs/IPs are discarded. Anonymous direct backend requests are forbidden.
The frontend establishes the cookie before concurrent feed requests, avoiding
first-visit identity races. Likes use an idempotent desired state; comments use
durable request IDs and duplicate checks. Hidden parent comments hide their
brand replies, including replies that finish after an owner decision.

- Comment form: signed, visitor-bound token; hidden bot-trap field.
- Comments: 3/minute and 20/day per network, 2/minute per visitor.
- AI moderation: 120/day total, at most two simultaneous jobs; overflow waits
  for manual review rather than bypassing moderation.
- Guest chat: 12/minute and 80/day per network, 400/day total, plus existing
  session/concurrency limits. Guest conversation memory expires after 30 minutes.
- Likes: 30/minute per network. Views: 90/minute per network.

There is no CAPTCHA provider connected. Cookies/rate limits reduce abuse but
cannot guarantee one real person per like or defeat distributed attackers.
Moderation is not infallible; the human inbox is the fallback.

## Deployment and Recovery

Production files were patched from freshly fetched live copies, not replaced
with unrelated local changes. New tables are additive to the existing SQLite
database. No customer, financial or booking schema was altered.

- VPS backup: `~/site-community-backup-1788517898/` (includes a SQLite backup).
- Beget proxy backup: `~/site-community-proxy-backup-1788517921/`.
- VPS modules: `site_community.py`, `site_engagement.py`, `site_guest_chat.py`,
  `site_publications.py`, and two registration lines in `webhook_server.py`.
- PHP: community/publication helpers plus scoped dispatch and localhost:8770
  permission for site-only preview requests.
- Owner page: additive `/events/moderation/` and hashed static assets only.
- Local deployment snapshots are private and gitignored. Never commit them.

Rollback should restore reviewed module/proxy files and restart only the PWA
HTTP service. Do not overwrite the current database with the backup without
checking for newer customer data; additive unused site tables can safely remain.

## Verified

43 isolated backend tests passed, including guest identity, duplicate delivery,
consent, spam/PII, criticism, rate limits, owner permissions, hidden replies,
guest chat isolation and publication storage. The website export build passes.
Telegram transport URLs are redacted before HTTP client logs are written.

Real MAYA calls against temporary storage approved a question and healthy
criticism, rejected moderator manipulation, and generated a useful brand reply.
Browser checks against the actual PHP/backend verified guest chat, a persisted
like and its removal, abusive-comment rejection, readable guest forms on desktop
and mobile, and denial of anonymous owner access. No synthetic public comments
were published. The owner approval logic is covered by isolated tests; an actual
owner login/approval was not performed in the user's account.

Telegram photo/video publication commands remain a separate, inactive ingress
integration; see `SITE_PUBLICATIONS.md`. The public publication read endpoints
are now deployed, but this change does not enable Telegram polling or `/post`.
