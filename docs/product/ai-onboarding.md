# MAYA conversational onboarding and verified trial

## Permanent architectural boundary

The canonical [service-business principles](../architecture/README.md#service-business-principles)
and [target onboarding flow](../architecture/README.md#business-onboarding-target)
apply to this existing product surface (owner decision, 2026-09-12). Conversation
is the primary interface; forms remain fallback/admin/advanced editors. LLM output
is a proposed structured draft, never policy authority. Deterministic validation,
explicit owner confirmation and the existing canonical configuration action are
required before persisting a Tenant Policy; personal preferences retain their
separate scope. Chat history is not configuration storage.

Business type/profile, branches, timezone and provider are candidates until
verified/confirmed by the appropriate flow. Ask only missing relevant questions;
a business without staff does not need payroll questions. Profile defaults are
recommendations, not universal rules or permission/consent grants. The first
barbershop and YClients integration do not define every tenant's business model.

Credentials use the [separate secure connector flow](../architecture/README.md#conversational-policy-and-secrets).
Raw secrets must never enter LLM prompts, conversation history, ordinary logs,
business configuration or analytics. Existing draft/activation tokens below are
protocol credentials, not chat messages; Maya receives only permitted status/ref.

Website/map/public links follow [user-bound external-source rules](../architecture/README.md#external-source-capabilities):
candidate entity → owner confirmation → canonical binding → actual connector
capability check. A link is not verified access or automatic monitoring. Target
report policies and external-source bindings are architectural requirements;
this note does not claim new APIs/connectors exist or extend Chapter 7 scope.
The API sections below describe their own existing slice, not the whole target.

## Product flow

Owner onboarding runs inside the existing MAYA conversation. It is not a
separate settings chat, questionnaire, website or admin product. The owner can
describe a service business in ordinary Russian, including colloquial wording,
slang, spelling mistakes and short replies. MAYA collects a structured
blueprint, asks only for missing facts and creates the business after an
editable confirmation step.

The interpreter is hybrid:

- `deepseek` uses the OpenAI-compatible DeepSeek Chat Completions endpoint with
  JSON Output;
- `openai` uses the Responses API with strict Structured Outputs when
  `OPENAI_API_KEY` is configured;
- `safe_fallback` is a deterministic Russian parser used when the model is
  disabled, unavailable or times out;
- a low-confidence or ambiguous answer never overwrites collected facts;
- `needs_clarification: true` is accompanied by one short question and 2-4
  `quick_replies` that the client can send as normal user messages.

## Privacy

- Raw messages and voice transcripts are never stored in PostgreSQL.
- The database stores a structured blueprint and a SHA-256 digest of the latest
  input for abuse/debug correlation.
- Email, phone, personal names, links, account handles and API/CRM tokens are
  redacted before model input. The previous business name is not sent to the
  model, and collected service names are redacted again before reuse.
- Model responses are validated against the complete server-side contract.
  OpenAI additionally uses strict Structured Outputs and `store: false`;
  DeepSeek uses JSON Output and fails closed when required fields are absent.
- Owner contacts are accepted only by the final deterministic confirmation
  call. CRM secrets belong only in the encrypted CRM connector after signup.
- Draft and activation secrets are stored only as SHA-256 hashes.

## Verified 10-day trial

The swipe is a deliberate activation gesture, but it is not itself a connected
business and does not start analytics counting.

Create a pending activation only after the user completes the slider:

```http
POST /api/onboarding/trial-activations
Content-Type: application/json

{ "source": "maya_os" }
```

The response returns a one-time `activation_token`, a 24-hour
`expires_at`, `trial_days: 10`, `trial_starts_when: "registration_completed"`
and `counted_as_connected_business: false`. Keep the token in session-scoped
memory only. Never put it in a URL, log, analytics event or shared storage.

Pass the same secret when starting and confirming the AI draft:

```json
{
  "message": "У меня детейлинг, работаем втроем...",
  "trialActivationToken": "..."
}
```

```json
{
  "draftToken": "...",
  "trialActivationToken": "...",
  "ownerEmail": "owner@example.ru",
  "ownerName": "Алексей",
  "ownerPhone": "+79990000000"
}
```

The activation is claimed once. It becomes `completed`, gains its `tenantId`
and starts the full-access trial only after signup succeeds. Failed provisioning
releases it for a safe retry. A swipe abandoned before registration expires but
is never counted as a connected business.

Legacy signup without an activation token remains setup-only and does not gain
full trial access or enter verified-trial analytics.

## Templates

`GET /api/onboarding/templates` is public and returns `branding_mode:
"logo_only"` plus ready templates for individual specialists, service teams,
beauty, barbershops, clinics, wellness, education/consulting, automotive and
pet services. Templates reuse the canonical industry presets.

Suggested services are examples. They become real services only after the
owner confirms the blueprint.

## Draft API

Start a draft:

```http
POST /api/onboarding/ai/drafts
Content-Type: application/json

{
  "message": "Я частный массажист...",
  "templateId": "solo_specialist",
  "trialActivationToken": "..."
}
```

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

Every draft response includes:

```json
{
  "assistant_message": "Как вас лучше понять: вы работаете один или командой?",
  "confidence": 0.31,
  "needs_clarification": true,
  "quick_replies": [
    { "label": "Работаю один", "message": "Я работаю один" },
    { "label": "У нас команда", "message": "У нас несколько специалистов" }
  ],
  "interpreter_source": "deepseek",
  "turn_count": 2,
  "blueprint": {},
  "missing_fields": ["provider_count"]
}
```

The frontend renders `assistant_message` in the normal MAYA bubble and sends a
selected `quick_replies[].message` through the same `/messages` endpoint. The
frontend must not infer fields from confidence or recreate parser rules.

## Confirmation

`POST /api/onboarding/ai/drafts/:draftId/confirm` accepts the draft token,
matching activation token, required owner contact data and optional edits from
the confirmation card. For an internal calendar it creates the owner provider,
additional providers, services and weekly schedules. For an external calendar
it creates only a non-production mock preview and returns
`next_step: "connect_crm"`. A real credential is never collected in chat.

The response contains the owner session, tenant, trial state,
`trial_activation.counted_as_connected_business: true`, `branding_mode:
"logo_only"` and one of these next steps:

- `upload_logo_or_open_app`
- `connect_crm`

For `connect_crm`, the app opens the protected integration screen and uses the
tenant-scoped lifecycle from `docs/architecture/crm-integration.md`. The owner
first sees normalized services and specialists, then explicitly activates the
connection. Choosing "connect later" keeps external booking blocked and leaves
a permanent "Integrations" entry in owner settings; it must never become an
unreachable onboarding dead end.

## Expiry and subscription fence

The public tenant config includes `access_state`, `trial.days_remaining`,
`trial.full_access`, `subscription_required` and `subscription_cta`. During a
verified, unexpired trial the internal MAYA calendar can use live booking and
client registration is enabled. External CRM booking remains preview-only until
a real CRM connection is verified.

Effective entitlements for that trial temporarily include every feature whose
registry readiness declares `platform_backend` availability. Explicit tenant
denies still win. Planned flags and capabilities that exist only in the legacy
single-business runtime are never unlocked merely because a trial says "full
access".

When the trial expires, the server lazily and during billing checks transitions
the tenant to `past_due`, clears full trial access and blocks tenant features
with HTTP `402`:

```json
{
  "error": {
    "code": "subscription_required",
    "trial_ended_at": "...",
    "plans_path": "/api/billing/plans",
    "checkout_path": "/api/admin/tenants/:id/billing/checkout"
  }
}
```

`GET /api/billing/plans`, tenant details and billing checkout remain available
so the owner can recover access. Successful payment uses the existing billing
flow to reactivate the tenant.

## God Mode analytics

`GET /api/admin/analytics/trials` is platform-owner only. Its canonical metric
is `totals.connected_businesses`: completed trial activations that still have a
successfully created tenant. It also returns total swipes, pending and abandoned
registrations, active and expired trials, paid conversions and conversion
rates. The frontend must display these values, not count local gestures.

## Configuration

```env
AI_ONBOARDING_PROVIDER="auto" # auto/deepseek/openai/safe
DEEPSEEK_API_KEY=""
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_AI_ONBOARDING_MODEL="deepseek-v4-flash"
DEEPSEEK_AI_ONBOARDING_TIMEOUT_MS="12000"
DEEPSEEK_THINKING="disabled"
OPENAI_API_KEY=""
OPENAI_AI_ONBOARDING_MODEL="gpt-5.4-mini"
OPENAI_AI_ONBOARDING_TIMEOUT_MS="12000"
```

`auto` selects DeepSeek when `DEEPSEEK_API_KEY` is present, otherwise OpenAI
when its key is present, otherwise the deterministic fallback. If the selected
model later fails or times out, the turn falls back locally instead of sending
the same content to a second external provider. An explicit `deepseek` or
`openai` selection also never silently switches providers. No API key is
required for the fallback. Broad semantic and slang coverage requires a
model-backed path.

Keep the DeepSeek key only in the backend runtime environment. Never place it
in `app.html`, Capacitor assets, Git, API responses or onboarding draft data.
The endpoint must use HTTPS; invalid configuration fails back to the local
interpreter.

## Current limits

- The interpreter currently answers in Russian.
- Voice recording and transcription remain a MAYA client responsibility and
  reuse the existing voice stack; this backend accepts the resulting text.
- Existing advanced branding APIs remain for compatibility, but this owner flow
  exposes logo-only branding.
- Payment-provider production credentials and production deployment are not
  part of this local slice.
