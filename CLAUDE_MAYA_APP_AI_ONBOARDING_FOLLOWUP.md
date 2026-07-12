# Claude: final AI onboarding corrections

## Context

Codex reviewed `CLAUDE_MAYA_APP_AI_ONBOARDING_RESULTS.md` against the live local
backend and the original contract. The main flow, template loading, editable
services/schedule, owner bundle, logo upload, iOS mirroring and safe redirect
work. Keep that implementation and make only the corrections below.

Work only in the existing MAYA frontend mirrors. Do not edit NestJS, Prisma,
migrations or backend tests. Codex has already made `ownerPhone` required in the
AI confirmation contract and improved free-form service parsing.

## Required corrections

### 1. Guarantee owner return access

- Treat phone as required on the confirmation card and always send
  `ownerPhone` to `/confirm`.
- Validate a complete phone before the request and use calm copy explaining
  that it is the current recovery/login channel.
- Password can stay optional because the owner can return by phone.
- Do not display, log or persist `temporary_password`.

### 2. Resume and restart drafts safely

- Store only `{ draftId, draftToken, apiBase }` in `sessionStorage`, scoped to
  the AI onboarding flow. Never store message/transcript, owner contacts or the
  blueprint there.
- When the owner reopens onboarding in the same app session, call
  `POST /api/onboarding/ai/drafts/:draftId/read` and restore the server
  `blueprint`, `missing_fields` and stage.
- Clear the session draft after successful confirmation, explicit restart,
  expiry or invalid token.
- Add a visible `Начать заново` action. `invalid_ai_onboarding_token` and
  `ai_onboarding_expired` must not leave the user trapped retrying the same bad
  ref.

### 3. Make business type editable

- Show the selected template/type on the final confirmation card using the
  already loaded template catalog.
- Let the owner change it and send `templateId` in `/confirm`.
- Preserve the server blueprint as source of truth; do not invent new template
  IDs in the client.

### 4. Do not promise an unimplemented app icon

The current upload endpoint updates `logoUrl`, not the native iOS icon or an
installed home-screen icon. Replace:

`Логотип появится на иконке и внутри приложения.`

with accurate copy such as:

`Логотип появится внутри приложения. Иконку на экране телефона мы настроим отдельным шагом.`

Do not simulate or claim dynamic icon support in this package.

### 5. Continue into the owner workspace

- For an internal-calendar business, `Пропустить` and successful logo upload
  must open the existing in-app calendar/settings surface for the new tenant,
  not the generic client home. Reuse the existing `calendar_setup=1` route.
- For `connect_crm`, the primary action must lead to the existing protected CRM
  connection flow inside MAYA. Do not send the owner to a website or ask for a
  token in the AI conversation.
- If there is no reusable in-app CRM connector, state that exact contract gap
  in the result report instead of pretending the informational card completes
  CRM setup.

## Verification

- Text flow with required phone through internal tenant creation.
- Reload midway, restore via `/read`, continue and confirm.
- Invalid/expired token, then `Начать заново`, then successful new draft.
- Change template on confirmation and verify backend tenant preset/template.
- Internal success lands on the owner calendar/settings surface.
- CRM success lands on the protected CRM connector or is reported as a blocker.
- Parse all inline scripts, mirror both app files, run `npx cap sync ios`, and
  verify `www/index.html` equals `ios/App/App/public/index.html`.
- Return `CLAUDE_MAYA_APP_AI_ONBOARDING_FOLLOWUP_RESULTS.md`.
