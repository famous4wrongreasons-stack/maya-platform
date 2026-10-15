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


## Owner-approved bounded AI staging continuation — 15 October

The owner's subsequent explicit “да” authorizes transferring the saved DeepSeek
credential to this staging server and one non-renewing window of at most 24 hours,
100 upstream attempts and USD 2 combined. This supersedes the pending-approval
status above for this bounded operation only. No production release, widget grant,
customer-history export or provider booking is authorized.

The deployed application/carrier candidate remains `7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3`.
Its product source, Prisma and React source match the current development HEAD.
The separately pinned operational overlay wraps the unchanged compiled AppModule
and existing HTTP/JWT/session/actor checks. It restricts chat to the exact existing
owner/tenant, exposes only three existing catalogue read owners, and refuses Action
Engine effects. It adds no tenant or platform entitlement.

Only the private model sidecar receives the root-private DeepSeek key. The backend
remains on internal networks and has no actual model credential. The sidecar accepts
only bounded canonical sanitized model payloads, reserves conservative cost before
sending, fsyncs a persistent exclusive ledger and refuses restart with that ledger.
Timeout/unknown usage latches refusal. Expiry and explicit withdrawal close access.
There is no automatic renewal, budget reset or paid retry outside the common cap.

The catalogue relay, its process/counter and existing expiry remain unchanged.
The catalogue permission expires on 16 October at 06:43:27 UTC even if the AI
window ends later. New catalogue authorization must not be inferred from this.

Fresh synthetic proofs: 58/58 unit/regression checks; native and web HTTP greeting
through the compiled AppModule and real private relay; foreign tenant, missing
login and suspended membership denied before model; zero appointment/client/grant
effects. All model credentials/responses in those proofs are artificial. These
receipts do not claim a real model response or full release certification.

Rollback: stop only model-egress; restore backend from the unchanged
`compose.catalog-public-with-setup.json` with `up -d --no-deps backend`. Never
restart catalogue-egress, reset its counter, remove the AI ledger or recreate this
window. Preserve PostgreSQL/gateway and all carrier bytes. Withdrawal needs no
new grant or migration.


### First live response and bounded adapter correction

The real greeting completed through DeepSeek (two model requests). The following
catalogue question stopped in the egress adapter after its third reservation.
Two responses completed; cumulative conservative reservation is USD 0.284668560.
The original adapter discarded the specific transport-validation error, so the
cause of that particular live refusal is not retrospectively proven.

Source comparison and an executable regression prove a separate narrow mismatch:
canonical AiCore accepts non-empty `finish_reason=length` and validates the actual
semantic plan/reply, whereas the reused qualification accounting helper required
`stop`. The phone adapter now validates the same usage/cost bounds while preserving
the original response bytes and canonical completion validation. Safe stage/status/
finish-reason metadata is retained; no content/headers/keys are captured.

One explicit operator continuation supports this repair without resetting spend:
stop the old relay, pin/hash its immutable ledger, carry every reserved attempt,
input/output token and cost (including the unresolved attempt) into one exclusive
`continuation-1.jsonl`. The original scope/deadline/100-attempt/USD2 ceilings remain.
Old ledger, first overlay and receipts remain intact. The second ledger cannot be
reopened on restart; a second continuation is refused. No automatic renewal exists.
Other qualification profiles cannot use carry-forward. This does not resume the
failed question until the canonical UI explicitly retries it.

Fresh repair proofs: 60/60; compiled HTTP native/web path and `length` canonical
validation PASS; tampered/foreign ledger refused, unresolved prior cost retained,
combined cap enforced before dispatch. Neither synthetic proof uses real providers.


### Catalogue alias refusal — proven, 15 October

After the first correction, the provider returned HTTP 200/stop with validated
usage; the canonical catalogue tool completed. Final reply was then refused by
`phone_ai_raw_email` before dispatch: canonical projection emits both
`[name removed]@<nonce>_<index>` and `[reference removed]@<nonce>_<index>`.
The additional guard admitted only the former. It now recognizes both exact
canonical patterns without altering their bytes. Real addresses and malformed
aliases remain refused. The executable test uses the compiled AiCore projection,
not a separately invented serializer. 61/61 checks and compiled HTTP proof PASS.

A second explicit repair preserves the first two immutable ledgers and verifies
their chain before carrying the combined four attempts/USD 0.391926480 reservation
into the exclusive second continuation. This supersedes the first correction's
one-continuation limit; it does not change the original owner scope, expiry or cost
cap, and does not allow automatic restart/renewal. A further continuation is not
implemented. No model key is read again from the Mac. This operational repair
changes no product, identity, booking, carrier or entitlement authority.


## Current executed checkpoint — 15 October, about 10:02 UTC

**Bounded live AI chat: PASS. Phone acceptance: pending owner response.**

- Mac Keychain transfer was automatic; no repeated owner key entry, key printed,
  private signing key, browser credential extraction or new login was used.
- Exact application image/candidate remains unchanged; operational overlay commit
  `1671d467` is active through `compose.phone-ai-alias.json`.
- A real DeepSeek greeting and catalogue/prices reply were visibly delivered in
  the existing owner React AChat. `catalog.services.read` is completed with no
  error. The same Beget backend serves the installed phone payload.
- HTTPS readiness 200; all eight public payload files still match their prior
  hashes; native origin preflight 204 with `capacitor://localhost`. No iOS build,
  sync, reinstall, UI/source change or new migration in this execution.
- Six cumulative model attempts, conservative reserved maximum USD 0.578971800,
  including the unknown earlier attempt. This is a billing safety reservation,
  not a claim of the provider's actual charge. Latest relay healthy, not halted,
  final model response HTTP 200/stop. All prior ledger charges preserved.
- Original AI deadline: **16 October 12:43:09 Moscow**. Aggregate limits remain
  USD 2 / 100 attempts, no renewal. Catalogue retains its separate earlier
  deadline **16 October 09:43:27 Moscow** and 40-read cap. Do not extend either
  implicitly. No further real reads are required by the receipt collector.
- Zero clients, appointments, widget grants. The existing three setup action
  executions are unchanged. PostgreSQL/catalogue/gateway processes and unrelated
  SMM service are unchanged. Action effects, customer history/model export and
  real bookings remain closed. This is not a full release certificate.

For immediate withdrawal, stop only `model-egress` using
`compose.phone-ai-alias.json`. If restoring the previous AI-safe backend is needed,
use prepared `compose.phone-ai-rollback.json` with `up -d --no-deps backend`.
That rollback starts existing main directly and runs no migration command.
Never remove/reset either historical ledger or restart the catalogue relay to
renew its allowance. Scope/key remain root-private; no provider credential is
mounted into the backend or exposed by a public endpoint.

Fresh safe execution receipts are in `execution/`. Private execution packet,
owner identifiers and raw browser screenshot stay outside Git; the screenshot's
hash/location and observed outcomes are recorded separately. UI wording/formatting
limitations remain disclosed in `UI-OBSERVATION.json`; availability promises in a
model greeting do not create authority. Public salon search and voice readiness
are not established by this AI-only unit. The owner has been asked to send one
message from the already installed iPhone app.
