# CYCLE 06 — PHASE B3.2 COMMUNICATION SHADOW MIGRATION REPORT

Date: 2026-08-23

Branch: `codex/maya-brain-systemic-release-20260815`

Implementation commit: `058b9c9c` — `feat(action-engine): add communication shadow migration`

Production release: `20260823-c06-b32-communication-shadow`

## 1. Executive decision

B3.2 is complete as a **shadow migration**, not as a communication cutover.
Every covered producer can now describe the communication it would execute as:

```text
existing initiator
  -> legacy executor performs the real delivery
  -> Action Engine SHADOW_ONLY ActionExecution
  -> lifecycle-v1 communication envelope
  -> tenant-scoped recipient delivery plan
  -> zero attempts
  -> zero provider dispatch
```

The legacy path remains the only actual sender. The new path cannot reach an
external provider and produced no SMS, APNs push, Telegram message, email or
bulk send.

Historical production evidence proves that appointment notifications,
briefings, reminders and legacy recovery communication are active. No organic
communication occurred after the B3.2 release during the observation window,
so production old-vs-shadow equivalence is honestly reported as
`NOT OBSERVED`, not inferred from tests.

Communication cutover is therefore **not approved or ready**. Direct legacy
execution remains intentionally reachable until a separate approval follows
organic equivalence evidence.

## 2. Scope and frozen boundaries

B3.2 changed only communication shadow planning and passive observation.

It did not:

- switch any communication executor;
- send a synthetic production message or campaign;
- create a production provider attempt from the new path;
- retry a legacy message;
- change attendance;
- create runtime agents;
- start Chapter 7;
- add or alter a Prisma model or database migration.

The release is rollbackable as an immutable application release. There is no
runtime fallback from Action Engine to direct delivery because Action Engine
does not own delivery yet.

## 3. Communication inventory

The direct-send inventory remains the twelve production-reachable families
identified in B3. The number is deliberately unchanged because B3.2 observes
them; it does not remove them.

| ID | Taxonomy | Initiator | Recipient source and channel | Current executor | Existing authorization / eligibility / dedup / retry | Shadow coverage | 7/30-day reachability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C01 | operational single | AI `support.contact-admin.request` | server-selected owner/admin; inbox + APNs | `InboxService` + APNs | AI tool permission; source-event inbox key; APNs is best-effort | central inbox shadow | production-reachable; dedicated event count is not separable from aggregate inbox history |
| C02 | operational single | AI `tasks.create` | authorized owner/staff; inbox + APNs | `InboxService` + APNs | AI action policy/approval; source-event inbox key; APNs best-effort | central inbox shadow | production-reachable; dedicated event count is not separable from aggregate inbox history |
| C03 | operational single | protected HTTP inbox bridge | bridge/server-resolved tenant member; inbox + APNs | `InboxService` + APNs | protected bridge token; tenant recipient resolution; source-event key | central inbox shadow | production-reachable; aggregate inbox history exists |
| C04 | transactional single | appointment lifecycle hooks | affected client/owner/staff; inbox + APNs | `InboxService` + APNs | appointment identity and source event; no external-delivery identity | central inbox shadow | **ACTIVE**: create/reschedule/cancel-related inbox rows in both windows |
| C05 | operational single | appointment reminder scheduler | server-matched clients; inbox + APNs | scheduler -> `InboxService` | scheduler eligibility; source-event key; process-local scheduling guard | central inbox shadow | **ACTIVE**: reminder/shift history exists |
| C06 | operational single | owner/staff report schedulers | owner/master memberships; inbox + APNs | report services -> `InboxService` | role/feature settings; source-event key | central inbox shadow | **ACTIVE**: morning and daily reports exist |
| C07 | bulk campaign | Nest marketing producer | frozen server audience; inbox + APNs | `MarketingService` recipient loop | campaign idempotency, audience cap and legacy consent checks | dedicated bulk shadow with audience snapshot and recipient lifecycle | **DORMANT**: 0 campaigns, recipients and attempts in 7/30 days; no production controller was found in B3 |
| C08 | provider adapter | inbox announcements | tenant device tokens; APNs | direct APNs adapter | no durable provider identity/status/reconciliation | shadow APNs capability, dispatch disabled | **UNREACHABLE for current data**: 0 device push tokens |
| C09 | operational single | legacy Python operational modules | module-selected Telegram recipient | Telegram Bot API | fragmented module rules/logs; no shared durable delivery identity | protected post-success Telegram observer | **ACTIVE family**: legacy operational/recovery sends are present in durable Python logs |
| C10 | bulk/recovery | legacy Python reactivation/broadcast loops | server-selected recovery audience; Telegram and optional app bridge | Python loop -> Telegram/push bridge | module-specific sent markers, throttling and consent | each successful Telegram delivery is passively shadowed as a single; campaign-level bulk plan still requires organic producer evidence | **ACTIVE**: reactivation/freed-slot sends exist in 7/30 days |
| C11 | transactional single | phone authentication | current tenant auth identity; SMS | SMS.ru adapter | auth challenge/rate limits; provider response is not canonical delivery truth | auth SMS shadow | **DORMANT**: 0 auth codes in 7/30 days |
| C12 | transactional single | email authentication | current tenant auth identity; email | SMTP adapter | auth challenge/rate limits; SMTP acceptance is not delivery proof | auth email shadow | **DORMANT**: 0 auth codes in 7/30 days |

### Direct execution baseline

```text
DIRECT COMMUNICATION EXECUTION BYPASSES: 12
```

This is the future cutover baseline. B3.2 does not make the number zero and
does not hide the old executors behind a fallback.

## 4. Canonical communication taxonomy

B3.2 uses three distinct action classes:

| Taxonomy | Action Engine capability | Risk meaning | Recipient shape |
| --- | --- | --- | --- |
| transactional single | `communication.transactional-single.shadow.v1` | confirms or supports a concrete user/security/business action | exactly one server-authorized recipient |
| operational/proactive single | `communication.operational-single.shadow.v1` | reminder, briefing, report, recovery notice or staff/owner alert | exactly one server-authorized recipient per logical delivery |
| bulk campaign | `communication.bulk-campaign.shadow.v1` | one content identity delivered to a frozen server-owned audience | durable audience snapshot plus one lifecycle row per recipient |

Single and bulk delivery share the B3.1 recipient lifecycle primitive, but
they do not share approval, audience or risk semantics.

## 5. Shadow contract and identity

`CommunicationShadowService` creates a dry-run `ActionExecution` with:

- `policyDecision = SHADOW_ONLY`;
- `state = NOT_EXECUTED`;
- `executionAttemptCount = 0`;
- a stable logical communication hash;
- a hashed producer reference;
- channel and template/content identity;
- one tenant-HMAC recipient identity for single communication;
- a durable audience snapshot hash for bulk communication;
- frozen eligibility policy/evidence identity;
- the legacy approval requirement and risk class.

It then creates or reuses a lifecycle-v1 communication envelope and recipient
rows. The logical identity does not contain discovery time, process identity,
worker identity or lease time.

Repeated planning of the same logical communication converges to the same:

- `ActionExecution`;
- communication envelope;
- recipient delivery identity.

Restarting the service does not create another identity. The proof collapsed
four duplicate recipient-plan attempts while materializing no duplicate
delivery rows.

The shadow path persists no rendered message body, raw phone, raw email, raw
Telegram id, provider credential or CRM payload. Content is represented by a
template reference and hash; recipient references are tenant-scoped HMACs.

## 6. Provider capability matrix

The registry is intentionally conservative. It does not promise exactly-once
or reconciliation where the current provider integration cannot prove it.

| Provider/channel | Current send type | Provider idempotency | Durable provider reference | Status lookup | Reconciliation | Safe retry statement | Shadow external dispatch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| app inbox | single and bulk message of record | yes, database logical identity | inbox row identity | database row lookup | not required for storage | replay converges to the same row | disabled |
| APNs | single push announcement | not proven | not captured by current adapter | no | no | post-dispatch retry is not proven safe | disabled |
| Telegram Bot API | single and loop-produced messages | no provider idempotency | legacy success may return `message_id`, but it is not a canonical reconciliation key | no supported status lookup | no | post-dispatch blind retry is unsafe | disabled |
| SMS.ru | transactional SMS | not declared | not accepted as durable canonical proof | no canonical lookup | no | max one shadow attempt; no blind retry claim | disabled |
| SMTP | transactional email | not declared | not accepted as durable canonical proof | no canonical lookup | no | max one shadow attempt; no blind retry claim | disabled |

All five production shadow capabilities have
`externalDispatchEnabled = false`. The delivery kernel refuses a capability
that enables external dispatch.

## 7. Migration coverage

### NestJS inbox, push, schedulers and hooks

All current NestJS producers that call `InboxService` pass through the central
shadow hook. The old inbox write and APNs behavior remain first-class
production behavior. A shadow planning failure is logged and cannot trigger a
second old send.

The shadow plan preserves:

- tenant;
- source/producer identity;
- logical source-event identity;
- recipient identity;
- channel;
- template/content identity;
- eligibility evidence;
- approval/risk classification.

### Authentication SMS and email

Phone and email delivery services plan a transactional-single shadow action
from server-owned auth context. Auth remains a separate security family; its
recipient and rate-limit logic is not reclassified as marketing consent.

### NestJS bulk campaigns

The legacy campaign flow produces a bulk shadow plan from the same frozen
audience input. The plan requires:

- a durable audience id;
- an audience snapshot hash;
- one tenant-scoped recipient row per audience member;
- `ALLOW` eligibility evidence;
- consent evidence where required.

An audience hash mismatch or cross-tenant audience reference fails closed.
The shadow kernel cannot claim a recipient for dispatch and creates zero
attempts.

### Legacy Python / Telegram

The production Telegram bot's existing `send_message` call remains the only
executor. Only after that legacy call succeeds, a protected asynchronous
observer reports minimal metadata to:

```text
POST /api/inbox/internal/observe-legacy-telegram
```

The endpoint is bridge-token protected, tenant-resolved server-side and plans
an operational-single shadow record. Observer failure cannot repeat or replace
the already completed Telegram send.

This observer survives the Codex session because it is deployed inside the
running `barbershop-bot` service, not held by a local terminal process.

## 8. Audience, consent and indirect prompt-injection boundary

Customer or external text is accepted only as untrusted content identity. It
cannot set or change:

- tenant;
- action taxonomy;
- recipient or audience;
- channel permission;
- bulk permission;
- autonomy;
- entitlement;
- approval requirement;
- consent/eligibility decision.

The adversarial proof supplied content that asked to send to every tenant,
switch to SMS, waive approval and raise autonomy. The persisted result remained
one inbox recipient under `SHADOW_ONLY`; none of the injected directives was
stored as routing truth.

Bulk audience membership is server-owned. The shadow audience must be equal to
the frozen snapshot; it cannot be wider. Production audience/consent
equivalence remains unobserved because no organic campaign occurred after
deployment.

## 9. Verification before deployment

The implementation passed:

- `git diff --check`;
- Python syntax compilation for the changed bridge files;
- application typecheck;
- scripts typecheck;
- lint;
- production build;
- full NestJS suite: `169` suites / `1691` tests;
- current B3.1 communication-delivery proof: `32` checks;
- B3.2 communication-shadow proof: `19` checks.

The B3.2 proof covered:

1. transactional single shadow;
2. repeated single converging to one delivery identity;
3. restart preserving identity;
4. scheduler-produced `ActionExecution`;
5. legacy producer bridge planning;
6. recipient tenant isolation;
7. channel preservation;
8. content/template identity preservation;
9. external text unable to expand the audience;
10. empty recipient input failing closed;
11. multiple recipients in a single action failing closed;
12. bulk recipient plan with zero sends;
13. audience and consent preservation;
14. audience snapshot mismatch rejection;
15. cross-tenant audience rejection;
16. `ActionExecution` linkage;
17. recipient lifecycle linkage;
18. new-path provider dispatch being impossible;
19. direct old executor remaining the only actual sender.

Proof result:

```text
duplicate recipient plans collapsed: 4
shadow divergences: 0
delivery attempts: 0
new-path external messages: 0
new-path SMS: 0
new-path push: 0
new-path bulk sends: 0
```

No B3.2 schema or migration change was introduced.

## 10. Production deployment

Release `20260823-c06-b32-communication-shadow` was deployed with the NestJS
shadow implementation and the passive legacy Telegram observer.

Production checks:

- release symlink points to the expected immutable release;
- `/api/health`: `ok`, expected release stamp;
- `/api/health/ready`: `ready`;
- Prisma migrations: up to date;
- `maya-saas.service`: active;
- `barbershop-bot.service`: active;
- release observation start: `2026-08-23T00:26:50.097Z`;
- aggregate evidence snapshot: `2026-08-23T00:53:02.873Z`.

Since the release, production contained:

```text
communication ActionExecutions: 0
lifecycle-v1 communication envelopes: 0
lifecycle-v1 recipients: 0
delivery attempts: 0
shadow planning failures: 0
legacy Telegram observer failures: 0
new-path external messages: 0
```

No organic communication occurred in this bounded window. The observer remains
installed for later evidence; the work did not wait indefinitely or fabricate
traffic.

## 11. Historical 7/30-day reachability

Only aggregate counts were inspected. No recipient identity, raw message,
phone, email, provider credential or CRM payload was read into this report.

### NestJS inbox history

| Type | 7 days | 30 days |
| --- | ---: | ---: |
| appointment cancelled | 1 | 1 |
| appointment deleted | 2 | 2 |
| appointment rescheduled | 3 | 3 |
| daily report | 7 | 8 |
| morning brief | 7 | 7 |
| new appointment | 29 | 29 |
| owner alert | 4 | 4 |
| shift reminder | 6 | 6 |
| **total persisted inbox rows** | **59** | **60** |

These rows prove that transactional and operational single producers are
historically active. They do not prove post-release old-vs-shadow equivalence.

### Legacy Python durable send markers

Only actual `sent` markers are counted below; engagement, decline and blocked
business states are not misreported as deliveries.

| Family | Sent in 7 days | Sent in 30 days |
| --- | ---: | ---: |
| reactivation | 2 | 8 |
| cycle reminder | 0 | 3 |
| freed-slot recovery | 10 | 27 |
| birthday promotion | 0 | 0 |

Legacy recovery communication is therefore active. However, the post-success
observer saw no organic send after this release, and the campaign-level
audience for a legacy loop cannot be inferred from an individual Telegram
delivery.

### Dormant and unreachable channels

| Path | 7 days | 30 days | Classification |
| --- | ---: | ---: | --- |
| Nest marketing campaigns | 0 | 0 | DORMANT |
| Nest marketing recipients | 0 | 0 | DORMANT |
| Nest marketing attempts | 0 | 0 | DORMANT |
| phone auth codes | 0 | 0 | DORMANT |
| email auth codes | 0 | 0 | DORMANT |
| current APNs device tokens | 0 | 0 | UNREACHABLE for current production data |
| birthday promotion | 0 | 0 | DORMANT in the 30-day window |

## 12. Organic old-vs-shadow observation

| Class | Organic old deliveries after release | Shadow planned deliveries | Duplicates | Divergences | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| transactional single | 0 | 0 | 0 | 0 | NOT OBSERVED |
| operational/proactive single | 0 | 0 | 0 | 0 | NOT OBSERVED |
| bulk campaign | 0 | 0 | 0 | 0 | NOT OBSERVED |

`0 divergences` means that no observed pair diverged and the adversarial proof
found none. It does **not** mean that production equivalence has been proven in
the absence of organic pairs.

## 13. Production safety proof

The new path has no production executor adapter. Every registered production
shadow capability disables dispatch, recipient claim returns no work, and no
delivery attempt or `ActionAttempt` is created.

After deployment:

```text
NEW PATH EXTERNAL MESSAGES = 0
NEW PATH SMS = 0
NEW PATH PUSH = 0
NEW PATH BULK SENDS = 0
```

The old delivery path continued unchanged. A shadow error cannot trigger a
legacy retry or a second provider call.

## 14. Cutover blockers

Communication cutover requires a separate approval and remains blocked by:

1. no organic post-release single-message pair has been observed;
2. active appointment/report/reminder/recovery families require a bounded
   multi-event comparison, not one synthetic message;
3. no organic bulk campaign has produced a comparable frozen audience;
4. active legacy recovery loops currently yield recipient-level observations,
   not a proven campaign-level audience comparison;
5. APNs cannot be production-verified while no device token is registered;
6. SMS and email auth are dormant and remain a separate security family;
7. provider-specific post-dispatch uncertainty and retry rules must remain
   conservative at cutover;
8. all twelve direct execution families are still reachable by design.

No cutover, attendance work, runtime agent work or Chapter 7 work was started.

## Final status

PHASE B3.2 COMPLETE: YES

SINGLE COMMUNICATION SHADOW EQUIVALENT: NOT OBSERVED

BULK CAMPAIGN SHADOW EQUIVALENT: NOT OBSERVED

DIRECT COMMUNICATION EXECUTION BYPASSES: 12

SHADOW DIVERGENCES: 0

NEW PATH EXTERNAL MESSAGES: 0

READY FOR COMMUNICATION CUTOVER APPROVAL: NO
