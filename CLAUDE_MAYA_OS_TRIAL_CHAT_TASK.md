# Claude: MAYA OS trial and onboarding in the canonical MAYA chat

## Context and ownership

Codex has completed the backend contract on branch
`codex/human-onboarding-trial`. It adds privacy-redacted conversational
interpretation, ambiguity handling with quick replies, verified 10-day trial
activation, automatic subscription fencing and God Mode trial analytics.

This is a frontend-only package for Claude. Create an isolated frontend branch
from `codex/human-onboarding-trial`. Do not edit NestJS, Prisma, migrations,
backend tests or backend docs. Do not merge into `main` yourself.

Read first:

- `docs/product/ai-onboarding.md`
- Swagger for the exact generated payloads
- existing `ALogin()`, `AChat()` and `APromoBanner()` in
  `сайт и приложение/app.html`
- root `AGENTS.md`

## Product decision

There must no longer be a visually separate "Настроить с Майей" settings chat.
Owner setup happens in the same familiar MAYA conversation used by the current
app. The user must feel that they opened the normal chat and MAYA is helping
them configure a business, not that they entered a wizard or questionnaire.

Universal wording is mandatory: `бизнес`, `специалист`, `клиент`, `услуга`.
Do not make `салон` the default noun. Branding in this flow is logo-only.

## Reference lock

Primary reference: the current production `AChat()` MAYA surface.

Preserve:

- its full-screen Aurora shell, header rhythm, message spacing and safe areas;
- the same MAYA/user bubble language, typography and composer;
- the existing voice input/transcription behavior;
- the existing light/dark tokens and app navigation behavior.

Borrow only:

- pointer/drag physics, snap-back, haptic feedback and completion threshold from
  the existing `APromoBanner()` `-20%` slider;
- current auth button geometry and spacing from `ALogin()`.

Reject:

- the current custom `aiWrap`, custom onboarding bubbles and second composer;
- a marketing landing page, full-screen promo, admin-style settings chat or
  long form wizard;
- new color palettes, card-inside-card layouts or a new voice architecture.

## 1. Authentication entry screen

Recompose `ALogin()` in this order:

1. Put a primary button labelled exactly `Получить пробную версию MAYA OS` in
   the position currently occupied by the `Ваш email` pill.
2. Move email into the same group and same visual hierarchy as Telegram and
   Yandex. Its row is `Войти через email`; reveal the existing email flow only
   after tapping it.
3. Keep `Войти через Яндекс`, `Войти через Telegram` and
   `Продолжить без авторизации`.
4. Do not silently start a trial from a tap. The primary button opens the
   activation sheet described below.

## 2. Bottom trial activation sheet

Open an Aurora bottom sheet above the login screen, not a new page and not the
full-screen discount promo. It must explain calmly:

- full MAYA OS functionality for 10 days;
- the period starts after business registration succeeds;
- after 10 days a subscription is required to continue.

Use a swipe control based on the existing `APromoBanner()` mechanics. It should
snap back before the completion threshold and lock after success. At the
successful threshold, call exactly once:

```http
POST /api/onboarding/trial-activations
Content-Type: application/json

{ "source": "maya_os" }
```

Do not create an analytics event that pretends a connected business exists.
The backend is the only counter. If the call fails, reset the slider, unlock it
and show a calm retry message. Do not enter onboarding without a returned
`activation_token`.

Keep `activation_token` only in component memory and session-scoped storage. It
must never appear in a URL, console, analytics, error text or `localStorage`.

## 3. Owner onboarding in normal MAYA chat

Replace the current separate `lgCreate` chat presentation with an onboarding
mode of the canonical `AChat()` shell. Reuse its visual header, scroll behavior,
bubbles, composer and voice input. Do not merely restyle the existing
`aiWrap`; the result must be recognizably the normal MAYA conversation.

Behavior:

1. After activation, MAYA opens the normal chat and invites the owner to
   describe the business naturally.
2. Optional business-template choices can appear as compact quick chips in the
   thread, not as a questionnaire above it.
3. Start the draft with `POST /onboarding/ai/drafts` and include the returned
   `trialActivationToken`.
4. Continue through `/onboarding/ai/drafts/:id/messages`.
5. Render backend `assistant_message` as a normal MAYA bubble.
6. Store and render backend `quick_replies` directly beneath the latest MAYA
   reply. A tap sends that item's `message` through the same `/messages`
   endpoint. The visible chip uses `label`.
7. Disable all quick replies while a request is in flight and remove stale
   replies after the owner sends a new message.
8. Do not show `confidence` or `interpreter_source` to the user. Do not parse
   assistant text to invent onboarding replies. The backend response is the
   source of truth.
9. Preserve the draft token and activation token only in the current
   session-scoped onboarding state so reload/recovery and final confirmation
   use the same activation.

If `needs_clarification` is true, do not advance to confirmation even if a
client-side heuristic thinks enough fields exist. Let the user answer MAYA's
question. A one-word reply must remain a normal message, not be expanded or
guessed by JavaScript.

## 4. Confirmation, logo and CRM inside the conversation

Keep the backend blueprint editable, but present confirmation as an inline
interactive message/card in the same MAYA thread. Contacts are collected only
at this deterministic final step, never in messages sent to the interpreter.

The `/confirm` request must include both:

- `draftToken`
- the same `trialActivationToken`

After success:

- show `trial.days` and `trial.ends_at` from the server;
- trust `trial_activation.counted_as_connected_business`, but do not increment
  any local counter;
- offer only optional logo upload or skip for internal-calendar businesses;
- open the existing protected in-app CRM connector for external businesses;
- never put a CRM token into chat, logs or browser storage.

Logo-only means no color, font, radius or theme builder in this flow.

Handle the new activation errors with calm MAYA copy and a recoverable action:

- `invalid_trial_activation_token`
- `trial_activation_expired`
- `trial_activation_not_pending`
- `trial_activation_draft_exists`
- `trial_activation_draft_mismatch`
- `trial_activation_token_required`

Keep all existing AI draft error handling.

## 5. Trial state and subscription screen

Read these fields from `GET /mobile/config/:tenantSlug`:

- `access_state`
- `subscription_required`
- `trial.days_remaining`
- `trial.full_access`
- `subscription_cta`

The server is authoritative. Do not unlock features from a local timestamp.
During `trial_active`, show the remaining days unobtrusively in the owner area.

When config says `subscription_required`, or an authenticated request returns
HTTP `402` with `error.code: "subscription_required"`, show an in-app
subscription sheet instead of a generic error. Load plans from
`GET /api/billing/plans` and use the authenticated `checkout_path` returned by
the server. The owner must still be able to reach billing and tenant details.

## 6. God Mode analytics

For platform owners, fetch:

```http
GET /api/admin/analytics/trials
Authorization: Bearer <platform-owner JWT>
```

Add the primary metric exactly as:

`Подключенные бизнесы` = `totals.connected_businesses`

This is not `trial_swipes`. Swiped-but-abandoned registrations must never enter
that number. You may also show pending, abandoned, active trials and paid
conversions from the same response, but do not calculate them from frontend
events or local storage.

## Files and mirroring

Primary web bundle:

- `сайт и приложение/app.html`

Mirror every production app change to:

- `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Then run `npx cap sync ios` from `/Users/stanislavmosin/Desktop/maya-ios` and
confirm `www/index.html` is byte-identical to
`ios/App/App/public/index.html`.

## Required verification

Test against a fresh backend process from `codex/human-onboarding-trial`:

1. Login layout and all four non-trial auth actions remain reachable.
2. Tap trial CTA, incomplete swipe snaps back, complete swipe creates exactly
   one activation.
3. Natural/slang business story advances the blueprint.
4. Ambiguous one-word reply shows backend quick choices and preserves prior
   facts.
5. Reload restores the same pending activation/draft without leaking tokens.
6. Internal-calendar confirmation creates a full 10-day trial.
7. Abandoning after the swipe does not increase connected businesses.
8. Completed registration increases `connected_businesses` by exactly one.
9. Simulated expired trial shows the subscription sheet and routes to plans.
10. Both app mirrors parse cleanly; iOS Capacitor sync is byte-identical.

Return `CLAUDE_MAYA_OS_TRIAL_CHAT_RESULTS.md` with changed files, screenshots,
tested flows, exact API mismatches and any deliberately deferred frontend work.
Do not repair backend code in the frontend branch.
