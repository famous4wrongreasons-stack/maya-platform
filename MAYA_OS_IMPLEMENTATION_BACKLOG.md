# MAYA OS Implementation Backlog

Status date: 2026-07-08

This file turns the current MAYA OS architecture prompt, previous project history,
and the dirty local worktree into an execution backlog. It is intentionally
practical: each item should be small enough to audit, test, and commit without
mixing unrelated work.

## North Star

Maya is not a CRM, chat, or booking widget. Maya is an AI Operating System for
service businesses. Beauty is the first vertical, not the architecture boundary.

Every implementation step must pass these gates:

1. AI-first: dialogue is the main interface.
2. Mobile-first: every user flow works naturally in the app.
3. API-first: business logic is not embedded in frontend code.
4. Multi-tenant-first: no new hardcode that blocks many independent companies.
5. White-label-first: branding and tenant settings are data, not code forks.
6. Security-first: permissions, PII, money, and destructive actions are gated.
7. Tool-calling-first: AI uses backend tools, never direct DB access.
8. Human-approval-first: risky actions require explicit confirmation.
9. Explainability-first: recommendations include reasons and assumptions.
10. Universal architecture: entities work beyond beauty.

## Current Worktree Audit

Branch:

- `codex/safe-booking-backend-handoff`

Dirty packages found:

| Package | Files | Status | Risk |
| --- | --- | --- | --- |
| Architecture docs | `docs/` | New documentation package | Low |
| AI Director backend | `ai администратор/owner_ai.py`, `claude_ai.py`, `bot.py`, `webhook_server.py`, `database.py`, `reactivation.py` | In progress | High until role and execution gates are verified |
| Model and voice config | `.env.example`, `config.example.py`, `ai_billing.py`, `realtime_bridge.py` | In progress | Medium/high because pricing and latency are unstable |
| PWA chat UX | `сайт и приложение/app.html` | In progress | Medium; must mirror to iOS when UI behavior is accepted |
| Marketing site media | `сайт и приложение/maya-site.html`, `сайт и приложение/site-media/` | In progress | Medium; needs asset/performance/deploy verification |

Untracked media:

- `сайт и приложение/site-media/hero.mp4` - 3.7 MB MP4.
- `сайт и приложение/site-media/scr-home.png` - 430 x 932.
- `сайт и приложение/site-media/scr-booking.png` - 430 x 932.
- `сайт и приложение/site-media/scr-services.png` - 430 x 932.
- `сайт и приложение/site-media/scr-shop.png` - 430 x 932.

No files were staged or committed during this audit.

## What Is Already Built

### Production vertical

The current production system already has a strong first vertical:

- Client PWA and Telegram surfaces.
- iOS Capacitor wrapper.
- Telegram bot and webhook backend.
- YClients booking, services, masters, schedule, and records.
- Loyalty, referrals, gift certificates, subscriptions, review requests.
- Staff panel, team chat, owner/GOD views, reports, daily operational tooling.
- Voice assistant pipeline with realtime bridge and configurable TTS.
- AI billing log and usage accounting.
- SaaS blueprint work for multi-tenant/Postgres/NestJS migration.

### New architecture docs

The new `docs/` package provides the first Maya OS documentation foundation:

- Product definition and roles.
- Core architecture and component map.
- Universal data model.
- AI architecture, agents, tools, memory, prompt registry.
- Security and permission model.
- Engineering rules.
- Roadmap waves.
- ADRs for platform core and AI tool/approval boundaries.

### New AI Director work

The current dirty backend adds an early owner AI layer:

- `owner_ai.py` builds read-only business snapshots, opportunities, risks, and
  daily briefings.
- `claude_ai.py` adds owner-facing tools such as `get_daily_briefing`,
  `get_money_opportunities`, `get_risk_signals`, and `salon_action`.
- `bot.py` adds morning briefing delivery and action cards in Telegram.
- `webhook_server.py` adds deterministic `__runjob:<job>` execution from the
  PWA action card.
- `database.py` adds `active_sold_gift_certs()` so owner summaries count only
  actually sold active certificates.
- `reactivation.py` persists the last reactivation candidate count for fast
  owner briefings.

### New PWA chat work

The current `app.html` diff adds:

- `interactive-widget=resizes-content`.
- Visual viewport and keyboard handling.
- Contextual quick chips.
- Rich action card rendering for AI Director jobs.
- `run_job` action flow that posts a deterministic confirmation command.

### New marketing site work

The current `maya-site.html` diff adds real app media:

- Hero video from `site-media/hero.mp4`.
- App screenshots for home, booking, services, and shop/subscriptions.
- More product-real first-viewport content.

## Immediate Risks

### R-001 Owner-only boundary is not fully settled

Master prompt says dangerous owner/company actions are owner-controlled. Current
code has mixed boundaries:

- AI role tools are mostly safe: `resolve_ai_role()` maps normal admins to
  `manager`, and `_OWNER_ONLY` tools only go to `owner`/`founder`.
- Some implementation comments and fallback checks still say "owner/admin" and
  use `database.is_admin()` inside owner tool handlers.
- `_run_owner_job_from_chat()` uses panel `jobs` permission, and managers
  currently have `jobs: True`.
- `notify_owner()` sends owner briefings/action cards to `database.list_admins()`,
  not a dedicated owner/founder recipient list.

Decision needed before production: either rename the capability to
owner-or-manager operations, or tighten it to founder/owner only. Security-first
suggests tightening.

### R-002 AI Director action cards can trigger mass jobs

`salon_action` itself only prepares a card, which is good. The actual execution
path is `__runjob:<job>`. That path must be treated as a high-risk operational
action even if the current jobs are marketing/service messages.

Required:

- Server-side permission check.
- Audit log entry with actor, job, result, timestamp.
- Rate limit / duplicate guard.
- Clear confirmation copy in UI.
- No raw PII in AI prompt or action payload.

### R-003 Pro model config needs current pricing and latency checks

Dirty config moves core chat/Telegram/voice defaults toward `gpt-5.5-pro`.
This has high cost/latency risk. Pricing is now verified in `ai_billing.py`, but
live route latency still needs measurement before using Pro broadly.

Required:

- Verify official OpenAI pricing before changing `MODEL_PRICES`.
- Measure response latency in client chat, Telegram, and voice paths.
- Keep fast fallback path for service flows.
- Confirm Responses API function calling behavior with existing tools.

### R-004 iOS mirror can drift from PWA

AGENTS rules require PWA UI changes to be mirrored to
`/Users/stanislavmosin/Desktop/maya-ios/www/index.html`. Current platform status
only shows `сайт и приложение/app.html`; the iOS repo must be checked separately
before shipping UI behavior.

Required:

- Compare PWA and iOS web source for the chat/action/keyboard changes.
- Run `npx cap sync ios` after iOS web source edits.
- Confirm `cmp -s www/index.html ios/App/App/public/index.html`.

### R-005 CutMatch is still active in the current app/backend

The app and backend still contain active CutMatch/face analysis paths. SaaS
blueprint disables the feature, but the production vertical still exposes routes
and UI for founder users.

Required:

- Decide if CutMatch remains private founder-only, disabled, or consent-gated.
- Add explicit consent and retention policy before wider rollout.
- Keep biometric/photo processing away from generic Maya OS assumptions.

### R-006 Multi-tenant work is documented but not productionized

The production vertical is still effectively single-tenant. Multi-tenant
blueprints exist, but the live backend relies on SQLite, local settings, and
vertical-specific code.

Required:

- Treat current production as vertical MVP.
- Build Maya OS core as a separate universal platform boundary.
- Avoid adding more hardcoded salon-specific behavior to the future core.

## Wave 0: Stabilize Current Foundation

Goal: freeze the current dirty state into safe, testable, separately committable
packages before building new features.

### W0-01 Freeze and verify dirty changes

Status 2026-07-08:

- Changed backend Python files compile successfully.
- `git diff --check` passes for the current worktree.
- PWA `app.html` inline scripts parse successfully: 22 script blocks.
- iOS `www/index.html` inline scripts parse successfully: 21 script blocks.
- `docs/` and this backlog pass the current secret-pattern scan.
- Marketing site media references resolve to existing local files.
- Existing dirty packages are still not staged; commit splitting remains open.

Scope:

- Classify each dirty package.
- Run syntax and smoke checks.
- Split docs, backend, PWA, and marketing site into separate commits later.

Files:

- `docs/`
- `ai администратор/*.py`
- `сайт и приложение/app.html`
- `сайт и приложение/maya-site.html`
- `сайт и приложение/site-media/`

Checks:

- `python -m py_compile` for changed backend Python files.
- Existing backend unit tests where available.
- Parse inline scripts in `app.html` with `new Function(...)` workflow.
- Verify marketing HTML references existing media.
- Check secrets patterns in new docs/backlog.

Acceptance:

- Every package has a clear commit scope.
- No generated docs contain secrets.
- No package depends on an unverified production deploy.

### W0-02 Tighten owner/action permissions

Status 2026-07-08:

- AI Director tool handlers now use resolved role `owner`/`founder` as the
  second server-side gate instead of a broad admin check.
- PWA chat `__runjob:<job>` execution is owner-only, audited through
  `tool_audit`, and deduplicated for 60 seconds per owner/job.
- Proactive AI Director notifications now target configured founder/owner
  recipients instead of every admin.
- Added `test_claude_ai_rbac.py`: manager/admin is denied owner Director tools,
  while founder can prepare a `salon_action` card without executing the job.
- Panel jobs are intentionally unchanged for now; manager access there remains
  a separate product/permission decision.

Scope:

- Decide exact semantics for `OWNER`, `FOUNDER`, `ADMIN`, and `MANAGER`.
- Make AI Director tools and action-job execution match that decision.
- Rename misleading functions/copy if managers are intentionally allowed.

Recommended implementation:

- Add a deterministic helper such as `is_owner_or_founder(tg_id)`.
- Use it for AI Director delivery and owner-only action cards.
- If managers can run jobs, call the feature "operator jobs", not "owner jobs".
- Add audit for `__runjob:<job>`.
- Send owner briefings to founder/owner recipients, not every admin.

Acceptance:

- A manager cannot access owner-only AI Director tools unless explicitly allowed.
- The action execution path cannot be triggered by a client or master.
- Every action run is auditable.

### W0-03 Validate AI Director behavior

Status 2026-07-08:

- Added `test_owner_ai.py` with smoke coverage for action-card generation,
  empty reactivation state, daily briefing ranking, and sold certificate counts.
- Local regression/smoke suite passes: `test_identity_regressions`,
  `test_bot_branding`, `test_schedule_regressions`, `test_owner_ai`,
  `test_ai_billing`, `test_claude_ai_rbac`.
- `test_schedule_regressions.py` now stubs the top-level `anthropic` import so
  the slot recheck regression does not require installing external AI SDKs.

Scope:

- Confirm `owner_ai.py` is read-only except existing deterministic job launch
  after explicit confirmation.
- Test briefing, opportunities, risk ranking, and action payload creation.

Checks:

- Unit tests with mocked analytics/YClients/database.
- Empty-data cases.
- Error cases when YClients is unavailable.
- Estimates visibly marked as estimates.

Acceptance:

- Daily briefing never invents exact revenue beyond available facts.
- Potential revenue is labeled as an estimate.
- Action cards are generated without executing jobs.

### W0-04 Validate Pro model route

Status 2026-07-08:

- Official OpenAI API pricing verified for `gpt-5.5-pro`: $30 input and $180
  output per 1M tokens; no cached-input discount.
- `ai_billing.py` now uses Pro pricing instead of temporarily counting Pro as
  ordinary `gpt-5.5`.
- Added `test_ai_billing.py` coverage for Pro input/output pricing and cached
  token no-discount behavior.
- Added `test_claude_ai_rbac.py` coverage that `gpt-5.5-pro` uses the Responses
  API route, sends `input` instead of Chat Completions `messages`, parses
  `output_text`, and parses Responses `function_call`.
- Remaining: live latency/tool-call check against the actual API, only after an
  explicit cost decision because Pro calls are expensive.

Scope:

- Verify `gpt-5.5-pro` routing through OpenAI Responses API.
- Keep fallbacks for latency-sensitive paths.

Checks:

- Tool calls through Responses API.
- Chat, Telegram, and voice flows.
- AI billing usage logging.
- Official current pricing.

Acceptance:

- Billing reports do not silently misprice usage.
- Voice/client flows remain usable on mobile latency.
- Fallback model is documented and tested.

### W0-05 PWA/iOS chat action parity

Status 2026-07-08:

- PWA and iOS both contain the key chat/action/keyboard markers:
  `interactive-widget=resizes-content`, `chatSuggest`, `Maya Action`,
  `__runjob:`, `visualViewport`, and Capacitor Keyboard handling.
- `maya-ios/www/index.html` is currently byte-identical to
  `maya-ios/ios/App/App/public/index.html`.
- iOS chat and voice payloads now pass canonical `mode=staff/client`, matching
  the PWA behavior for server-side Maya scope.
- Ran `npx cap sync ios` after the iOS web-source patch.
- PWA `app.html` and iOS `www/index.html` are not byte-identical. The iOS repo
  already has a large dirty `www/index.html`; do not overwrite it blindly.
  A deliberate mirror pass is still required before release.

Scope:

- Make action cards, chips, and keyboard behavior consistent across PWA and iOS.

Checks:

- PWA `app.html` parse.
- iOS `www/index.html` mirror.
- `npx cap sync ios`.
- `cmp -s www/index.html ios/App/App/public/index.html`.
- Manual screenshot/interaction pass for keyboard and action card.

Acceptance:

- Chat input is not hidden by mobile keyboard.
- Action card renders without layout shift.
- iOS bundle contains the same markers as PWA.

### W0-06 CutMatch legal/security decision

Status 2026-07-08:

- Local backend route registration already has CutMatch routes removed with a
  152-FZ note.
- PWA navigation hides CutMatch for everyone except founder.
- Added fail-closed `CUTMATCH_ENABLED=False` gate to CutMatch HTTP handlers, so
  accidental route restoration returns disabled by default.
- Added `CUTMATCH_ENABLED=False` to example env/config.
- Local ignored PHP proxy `pwa-assets/tg-auth/api-proxy.php` now returns
  `disabled` for `try_haircut`, `haircut_status`, and `analyze_face` instead of
  forwarding photos or generation requests to the bot server.
- Deployed the ignored proxy change to Beget after creating a backup outside
  `public_html`.
- Verified live `/app/api-proxy.php` CutMatch actions now return `404 disabled`.
- Verified remote syntax with `/usr/local/bin/php8.2 -l`; default SSH `php` is
  PHP 5.6 and is not valid for this file.
- Remaining: define explicit consent/retention policy before any re-enable.

Scope:

- Audit active photo/face routes and UI entry points.
- Decide founder-only, disabled, or consent-gated.

Acceptance:

- No tenant/customer can access biometric-like analysis without explicit policy.
- The SaaS plan catalog and production app agree on feature availability.

### W0-07 Security remediation and secret rotation

Scope:

- Continue the existing security remediation track.
- Rotate any historical secrets that appeared in imported/local logs.
- Keep docs free of secrets.

Acceptance:

- Live `.env` uses rotated keys where needed.
- Example configs contain placeholders only.
- No secrets are printed into chat, docs, or commits.

## Wave 1: Universal Maya OS Core

Goal: move from a strong single-vertical assistant to a reusable OS core.

### W1-01 Domain event layer

Create a universal event model:

- `AppointmentCreated`
- `AppointmentMoved`
- `AppointmentCancelled`
- `VisitCompleted`
- `PaymentReceived`
- `ClientReactivated`
- `SubscriptionSold`
- `CertificateSold`
- `NotificationSent`
- `ActionApproved`
- `ActionExecuted`

Acceptance:

- Events contain `tenant_id`, actor, source surface, timestamp, and idempotency
  key.
- AI tools use events/facts, not raw vertical-specific tables.

### W1-02 KPI and analytics layer

Build materialized facts for owner/solo/master analytics:

- Revenue.
- Gross profit.
- Net profit.
- Average check.
- Load/utilization.
- Retention.
- LTV.
- New/lost/returning clients.
- Service performance.
- Staff performance.

Acceptance:

- AI Director reads a stable KPI API.
- Explanations include source periods and assumptions.
- Metrics are tenant-scoped and vertical-neutral.

### W1-03 Tool Registry

Extract tool definitions from large prompt/code blobs into a registry:

- Tool name.
- Description.
- JSON schema.
- Risk tier.
- Required role/permission.
- Confirmation policy.
- Audit policy.
- Tenant feature flag.

Acceptance:

- The model receives only tools allowed for the resolved role and surface.
- Tool permissions are tested without the LLM.
- New tools require an explicit risk tier.

### W1-04 Prompt Registry and Context Builder

Move system prompts into versioned prompt modules:

- Maya Brain.
- Maya OS owner.
- Maya Admin.
- Maya Consult.
- Maya Finance.
- Maya Analytics.
- Maya Marketing.
- Maya Reception.
- Maya HR.
- Maya Assistant.

Acceptance:

- Prompt versions are auditable.
- Context is built from role, tenant, surface, task, and safe memory.
- No PII is inserted unless a deterministic backend policy allows it.

### W1-05 Action Engine

Create a central action lifecycle:

- Suggested.
- Approved.
- Queued.
- Executing.
- Completed.
- Failed.
- Cancelled.

Acceptance:

- Every operational action has status, actor, tenant, idempotency key, risk tier,
  and audit trail.
- UI action cards and Telegram buttons call the same action API.
- Dangerous actions cannot bypass approval.

## Wave 2: Multi-Tenant SaaS Platform

Goal: productionize Maya OS as a universal platform rather than a single salon
deployment.

### W2-01 Tenant platform

Scope:

- Postgres tenant isolation.
- Tenant settings.
- White-label branding.
- Plans/add-ons.
- User roles per tenant.
- CRM adapter credentials per tenant.

Acceptance:

- No tenant can read another tenant's data.
- Branding can change without code deploy.
- Feature access is controlled by plan/add-on flags.

### W2-02 CRM Adapter Layer

Scope:

- YClients as first adapter.
- Stable universal booking API above adapter-specific behavior.
- Later adapters: fitness, clinic, dental, education, repair/rental systems.

Acceptance:

- Core AI tools call universal adapter interfaces.
- Adapter-specific failures are normalized.
- Booking moves remain non-destructive.

### W2-03 Notification Engine

Scope:

- Telegram.
- Push.
- Email.
- WhatsApp.
- SMS.

Acceptance:

- Notification consent is tenant/client scoped.
- Templates are white-labelable.
- Delivery events feed analytics and action history.

### W2-04 Marketplace and plugin system

Scope:

- AI skills.
- Tools.
- CRM adapters.
- Notification providers.
- Industry packs.
- MCP compatibility.

Acceptance:

- Plugins cannot bypass tenant isolation.
- Plugins declare permissions and risk tiers.
- Marketplace install/uninstall is auditable.

## Commit Plan

Recommended commit sequence:

1. `docs: add maya os architecture foundation`
2. `backend: add ai director read-only briefing core`
3. `backend: add owner action cards and deterministic job execution`
4. `app: add chat action cards and mobile keyboard fixes`
5. `site: add product media to maya marketing page`
6. `security: tighten owner-only gates and action audit`

Do not combine docs, backend, PWA UI, and marketing media in one commit.

## Immediate Command Checklist

Run before any backend commit:

```bash
python -m py_compile 'ai администратор/owner_ai.py' 'ai администратор/claude_ai.py' 'ai администратор/bot.py' 'ai администратор/webhook_server.py' 'ai администратор/database.py' 'ai администратор/reactivation.py' 'ai администратор/realtime_bridge.py' 'ai администратор/ai_billing.py'
```

Run before any PWA/iOS UI commit:

```bash
node -e "const fs=require('fs'); const s=fs.readFileSync('сайт и приложение/app.html','utf8'); for (const m of s.matchAll(/<script[^>]*>([\\s\\S]*?)<\\/script>/g)) new Function(m[1]); console.log('ok')"
```

Run before docs/backlog commit:

```bash
# Run the repository secret-scan command from SECURITY_REMEDIATION.md.
# The result must be empty before staging docs.
```

Run before marketing deploy:

```bash
rg -n "site-media/(hero\\.mp4|scr-home\\.png|scr-booking\\.png|scr-services\\.png|scr-shop\\.png)" 'сайт и приложение/maya-site.html'
```

## Next Best Action

Start with W0-02 and W0-03 before shipping AI Director:

1. Tighten owner/action permission semantics.
2. Add audit for `__runjob:<job>`.
3. Add smoke tests for `owner_ai.py`.
4. Verify backend syntax.
5. Then split and commit docs separately from code.
