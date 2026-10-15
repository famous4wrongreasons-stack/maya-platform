# Phone assistant readiness diagnosis — 2026-10-15

This is a diagnosis and proposed next operation, not a release certificate or an
execution authorization. Baseline: `73c8790c85bb1503c77226f9d209c13932987b0a`.
Deployed application source: `7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3`.

## What is established

The owner reported successful password login. Their supplied screenshot shows
React AChat receiving both a greeting and a booking request and returning the
exact AI-not-connected fallback. This supersedes the earlier unverified device
launch observation in the catalogue execution log. It does not prove voice,
assistant quality, client identity, widgets or booking acceptance.

Fresh read-only server inspection confirms `AI_CORE_PROVIDER=safe`, no configured
DeepSeek/OpenAI key, and no direct backend Internet network. The backend is
running on its unchanged image, with the same start time. No key value, environment
dump, database URL, user session or client record was printed.

The fallback is authored by `src/ai-tools/ai-core.service.ts`. Provider selection
in `ai-core-model.service.ts` returns an empty candidate list for `safe`, even if
an unrelated provider key were available. Installing an iOS payload does not
configure a model on its backend. This is an incomplete staging setup, not a
successful assistant acceptance. Public salon discovery is separately disabled
by `PWA_TENANT_INSTALL_ENABLED=false`; password login is a distinct existing path.

## Proposed single owner approval — not issued

Prepare one bounded AI check for this exact staging salon/account, at
`phone-test.mayaos.ru` on Beget `45.67.56.4`. The proposal is a 24-hour maximum
window, total maximum USD 2 and 100 upstream attempts, whichever is exhausted
first; no renewal or budget reset after restart. Actual affordable requests can
be fewer because each request reserves its worst-case cost before dispatch.

Credential source: the existing DeepSeek entry in the signed Maya Keychain helper
on the Mac. Proposed destination: root-only 0600
`/srv/maya-phone-staging/private/deepseek.key`, mounted read-only only into the
bounded model transport. It must not enter Git, an iOS payload, a browser, process
arguments, logs, or application-visible provider metadata. Approval for this
new secret destination and paid execution has NOT been given. Do not read or
transfer the real key while preparing.

Use the existing AiCore/provider implementation and existing credential/budget
mechanisms, retaining request sanitization and canonical tool authorization.
Implement and prove the staging adapter before enabling it; a 24-hour profile is
NOT supplied by the current fixed local 10/30-minute qualification profiles.
Do not replay an expired local permit, remove budget validation, or give the
backend unrestricted external egress to make it work. Only the dedicated model
transport may reach the fixed official DeepSeek endpoint; it must refuse missing,
expired, revoked, foreign-tenant and over-budget admission. Persist reservations
before dispatch; no refund for ambiguous delivery; refusal on restart/reset or
unknown usage. No public model proxy. No content/secret logging.

Allowed work would be ordinary conversation and canonical public catalogue
questions. Provider inputs remain sanitized by current owners. No customer
registry, personal visits, contacts or notes may be sent to the model. Existing
YCLIENTS catalogue scope remains at most 40 calls until
2026-10-16T06:43:27.299Z; do not restart its relay or extend that approval.
Booking mutations, notifications, Telegram binding, voice-provider activation,
widget grants and HANDOFF are outside this proposed operation. No production
Maya deployment/migration and no iPhone reinstall are needed for AI configuration.

Before enabling: prove strict tenant binding, budget/deadline and reservation
persistence, missing usage/refusal handling, model-only egress, unchanged YCLIENTS
relay lifetime, and rollback to safe mode. Capture the final concrete deployment
plan and hashes. Once authorized, move the key over the existing protected SSH
channel, enable only staging AI, verify health and two actual AChat replies, then
report measured state/cost and stop on any unavailable authority instead of
claiming booking success.

## Verification performed during diagnosis

- `local-keychain.test.mjs` + `core-conversation-broker-usage.test.mjs`:
  98 PASS / 0 FAIL. Synthetic credential test store only; no actual Keychain read.
- `conversation-qualification/current-candidate.test.mjs`:
  34 PASS / 0 FAIL; receipt in `budget-tests.txt`. Local synthetic budget/replay
  checks, not proof of a deployed phone adapter.
- Official model/pricing page rechecked 2026-10-15:
  https://api-docs.deepseek.com/quick_start/pricing/
  DeepSeek V4 Pro maximum published peak cache-miss prices are USD 1.32 per
  million input tokens and USD 3.96 per million output tokens. Existing pessimistic
  reservation rates match those prices; verify again at admission if changed.

Actual staging AI activation: NOT PERFORMED. DeepSeek credential read/transfer: 0.
Paid model calls by this diagnostic: 0. YCLIENTS calls by this diagnostic: 0.
No source/product, server configuration, grants, database or iPhone changes.
