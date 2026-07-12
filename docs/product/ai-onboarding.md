# MAYA AI onboarding

## Product flow

AI onboarding is a conversational owner setup flow inside the existing MAYA
application. The owner can describe the business in ordinary language, answer
only the missing questions, review an editable blueprint and confirm it. It is
not a separate website or admin product.

The first safe backend slice uses a deterministic Russian-language interpreter.
This keeps setup available without an external model and prevents raw owner
speech from being sent to an LLM. A model-backed interpreter can be added later
behind the same contract after redaction and consent are defined.

## Privacy and lifecycle

- Raw messages and voice transcripts are never stored in PostgreSQL.
- The database stores a structured blueprint and a SHA-256 digest of the latest
  input for abuse/debug correlation.
- Owner email, phone and name are accepted only by the final confirmation call.
- A random draft token is returned once; only its SHA-256 hash is stored.
- Drafts expire after 24 hours.
- Confirmation claims a draft with `draft -> confirming -> confirmed`, so two
  concurrent requests cannot create two businesses.
- If internal-calendar provisioning fails after signup, the newly created
  tenant is removed and the draft becomes editable again.

## Templates

`GET /api/onboarding/templates` is public and returns `branding_mode:
"logo_only"` plus ready templates for individual specialists, service teams,
beauty, barbershops, clinics, wellness, education/consulting, automotive and
pet services. Templates reuse the canonical industry presets.

Suggested services are examples for the UI. They do not become real services
until the owner confirms them in the blueprint.

## Draft API

Start a draft:

```http
POST /api/onboarding/ai/drafts
Content-Type: application/json

{
  "message": "Я частный массажист...",
  "templateId": "solo_specialist"
}
```

The response contains `draft_id`, a one-time `draft_token`,
`assistant_message`, `blueprint`, `missing_fields` and `expires_at`.

Continue the conversation:

```http
POST /api/onboarding/ai/drafts/:draftId/messages
Content-Type: application/json

{
  "draftToken": "...",
  "message": "Услуги: массаж 3000 руб 60 минут"
}
```

Read a draft after an app restart:

```http
POST /api/onboarding/ai/drafts/:draftId/read
Content-Type: application/json

{ "draftToken": "..." }
```

The token belongs in app session storage, not logs, URLs, analytics or shared
local storage.

## Confirmation

`POST /api/onboarding/ai/drafts/:draftId/confirm` accepts the draft token,
owner contact data and optional edits from the confirmation card:

```json
{
  "draftToken": "...",
  "ownerEmail": "owner@example.ru",
  "ownerName": "Алексей",
  "ownerPhone": "+79990000000",
  "businessName": "Север",
  "calendarSource": "internal",
  "providerCount": 3,
  "services": [
    { "name": "Стрижка", "price": 2000, "durationMinutes": 60 }
  ],
  "weeklyRules": [
    { "weekday": 1, "startTime": "10:00", "endTime": "20:00" }
  ]
}
```

For `internal`, confirmation creates the owner provider, additional login-free
providers, services and weekly schedules. For `external`, it creates the trial
in safe preview mode and returns `next_step: "connect_crm"`.

The response contains the normal owner session, tenant, one-time temporary
password when needed, `branding_mode: "logo_only"` and one of these next steps:

- `upload_logo_or_open_app`
- `connect_crm`

## Current limits

- The interpreter currently supports Russian natural-language input.
- Voice recording/transcription is a MAYA client responsibility and should
  reuse the existing voice stack; this backend accepts the resulting text.
- Existing advanced branding APIs remain for backward compatibility, but this
  onboarding contract intentionally exposes only logo-based branding.
- Real CRM credentials are never requested during the conversation. They are
  entered only in the existing encrypted CRM connection step after signup.
