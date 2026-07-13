# Claude: AI onboarding inside the existing MAYA APP

## What this package is

Codex has implemented a privacy-safe backend flow on branch
`codex/ai-onboarding-foundation`. An owner can describe a service business in
ordinary Russian, answer only missing questions, confirm an editable blueprint
and receive a working trial with services, specialists and schedule.

This is a frontend-only task for the existing MAYA application. It is not a
website, landing page, separate admin panel, new design language or salon-only
wizard.

## Where to work

Create an isolated frontend branch from `codex/ai-onboarding-foundation` and
change only the existing MAYA surfaces:

- `сайт и приложение/app.html`
- mirror to `/Users/stanislavmosin/Desktop/maya-ios/www/index.html`

Keep the established Aurora/liquid-glass style, tokens, typography, navigation
and voice behavior. Do not edit NestJS, Prisma, migrations or backend tests.

## Required owner flow

1. Add `Настроить с Майей` as the primary owner-onboarding path inside MAYA.
2. Load ready choices from `GET /api/onboarding/templates`. Show them as compact
   optional starting points, not a long questionnaire.
3. Let the owner speak or type a natural-language business description. Reuse
   the existing MAYA voice/transcription stack; if voice is unavailable, text
   must remain fully functional. Do not invent a second voice architecture.
4. Start with `POST /api/onboarding/ai/drafts` and render
   `assistant_message`. Continue with the `/messages` route until
   `missing_fields` is empty.
5. Never ask email, phone or owner name in conversation messages. Collect those
   only on the final confirmation screen.
6. Show one editable confirmation card: business name, template/type, internal
   MAYA calendar or CRM, number of specialists, services/prices/durations and
   weekly schedule. Make assumed schedule clearly visible.
7. Confirm through `/confirm`, accept the returned owner session exactly like
   current self-serve signup and continue inside MAYA.
8. For `upload_logo_or_open_app`, offer one optional logo upload using the
   existing authenticated logo endpoint, plus `Пропустить`. Do not show color,
   font, radius or theme builders in this flow.
9. For `connect_crm`, open the existing safe CRM connection step. API tokens
   must never enter the AI conversation or client logs.

Full backend payloads and error semantics are documented in
`docs/product/ai-onboarding.md` and Swagger.

## Client safety

- Keep `draft_token` in session-scoped app state only. Never put it in a URL,
  analytics, console output or shared local storage.
- Do not persist the raw transcript after it has been submitted.
- Handle `invalid_ai_onboarding_token`, `ai_onboarding_expired`,
  `ai_onboarding_incomplete`, `ai_onboarding_confirmation_in_progress` and
  `ai_onboarding_not_editable` using calm MAYA-language messages.
- Disable the confirm control while a request is in flight.
- Do not implement duplicate business rules in JavaScript; render backend
  blueprint and missing fields as the source of truth.
- Use universal service wording and the selected template terminology. Avoid
  making `салон` the default product noun.

## Verification and handoff

- Test text onboarding from first message through an internal-calendar trial.
- Test template selection, editable confirmation, expired/invalid token and CRM
  next-step behavior.
- Parse all inline scripts in both app mirrors.
- Run `npx cap sync ios`, then confirm `www/index.html` matches
  `ios/App/App/public/index.html`.
- Return one report named `CLAUDE_MAYA_APP_AI_ONBOARDING_RESULTS.md` with changed
  files, tested flows and backend contract mismatches. Do not fix backend code.
