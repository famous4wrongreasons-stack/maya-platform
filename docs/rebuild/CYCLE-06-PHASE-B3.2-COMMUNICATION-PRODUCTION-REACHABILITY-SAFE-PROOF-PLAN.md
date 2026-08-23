# CYCLE 06 — PHASE B3.2 COMMUNICATION PRODUCTION REACHABILITY & SAFE PROOF PLAN

Date: 2026-08-23

Branch: `codex/maya-brain-systemic-release-20260815`

Repository HEAD at inspection start: `8ed99802`

Production release: `20260823-c06-b32-communication-shadow`

## 1. Decision

The twelve direct communication execution bypasses have been classified from
both current-code reachability and read-only production evidence for the last
7/30 days.

```text
ACTIVE: 6
DORMANT: 4
UNREACHABLE/DEAD: 2
DIRECT COMMUNICATION EXECUTION BYPASSES: 12
```

One safe, user-operated, single-message proof has been identified. It has not
been executed by Codex. No communication cutover is approved or performed.

The new path remains shadow-only:

```text
new-path provider attempts: 0
new-path external messages: 0
campaign cutover: NO
```

## 2. Production evidence

The inspection used aggregate-only reads. No recipient identity, message body,
phone, email, Telegram id, CRM payload or provider credential was read into
this report.

### 2.1 Nest inbox evidence

| Inbox event | 7 days | 30 days | Current source family |
| --- | ---: | ---: | --- |
| `new_appointment` | 30 | 30 | protected legacy bridge |
| `appointment_rescheduled` | 3 | 3 | protected legacy bridge |
| `appointment_cancelled` | 1 | 1 | protected legacy bridge |
| `appointment_deleted` | 2 | 2 | protected legacy bridge |
| `owner_alert` | 4 | 4 | protected legacy bridge |
| `shift_reminder` | 8 | 8 | protected legacy bridge |
| `morning_brief` | 7 | 8 | Nest scheduler |
| `daily_report` | 7 | 8 | Nest scheduler |
| `client_support_request` | 0 | 0 | AI tool reachable, not used |
| `maya_task` | 0 | 0 | AI tool reachable, not used |

There are no current `DevicePushToken` rows, so APNs dispatch is unreachable
for current production data even though the adapter remains in the code graph.

### 2.2 Authentication evidence

| Delivery family | 7 days | 30 days |
| --- | ---: | ---: |
| phone auth codes / SMS.ru | 0 | 0 |
| email auth codes / SMTP | 0 | 0 |

Both auth send paths remain code-reachable but were dormant in both windows.

### 2.3 Legacy Python durable send markers

| Legacy family | 7 days | 30 days |
| --- | ---: | ---: |
| reactivation `sent` | 2 | 8 |
| freed-slot offer `sent` | 10 | 27 |
| individual-cycle reminder `sent` | 0 | 0 |
| birthday promotion | 0 | 0 |

The same 30-day data also contains two reactivation engagements, twelve
blocked freed-slot offers and three declined freed-slot offers. Those rows are
policy/outcome evidence, not extra successful sends.

### 2.4 B3.2 shadow evidence

Production currently contains:

| Shadow action class | Executions | State | Attempts |
| --- | ---: | --- | ---: |
| operational single | 15 | `NOT_EXECUTED` | 0 |
| transactional single | 1 | `NOT_EXECUTED` | 0 |

There are no `ActionAttempt` rows for these shadow capabilities. The sixteen
`MarketingCampaign`/recipient rows currently present in production are
shadow `SINGLE` lifecycle records with zero sends and zero attempts. They are
not real historical bulk campaigns and cannot be used as bulk-equivalence
evidence.

## 3. Classification of all twelve bypasses

| ID | Bypass | Classification | Production evidence | Current-code reachability |
| --- | --- | --- | --- | --- |
| C01 | AI `support.contact-admin.request` -> inbox/APNs | **DORMANT** | `client_support_request`: `0/0` in 7/30 days | AI taxonomy, registry and handler remain wired to `InboxService` |
| C02 | AI `tasks.create` -> inbox/APNs | **DORMANT** | `maya_task`: `0/0` in 7/30 days | AI taxonomy, registry and handler remain wired to `InboxService` |
| C03 | protected HTTP inbox bridge -> inbox/APNs | **ACTIVE** | bridge-owned inbox rows exist for appointment, alert and reminder families in both windows | legacy Python calls the bridge; bridge endpoint and `InboxService` are registered |
| C04 | appointment lifecycle hooks -> inbox/APNs | **ACTIVE** | create `30/30`, reschedule `3/3`, cancel/delete `3/3` | create/reschedule/cancel hooks publish lifecycle notifications |
| C05 | appointment/shift reminder schedulers -> inbox/APNs | **ACTIVE** | `shift_reminder`: `8/8` | scheduler loop and reminder publication are reachable in the running service |
| C06 | owner/staff report schedulers -> inbox/APNs | **ACTIVE** | morning brief `7/8`; daily report `7/8` | scheduled owner/master report services are registered and running |
| C07 | Nest `MarketingService` bulk recipient loop | **UNREACHABLE/DEAD** | no real bulk campaign, recipient or attempt in 7/30 days | module/service files exist, but no production module import, controller or non-test caller reaches `previewCampaign`/`sendCampaign` |
| C08 | APNs provider adapter | **UNREACHABLE/DEAD** for current production data | current device tokens: `0` | adapter is code-reachable from inbox, but has no destination to dispatch to |
| C09 | legacy Python operational modules -> Telegram | **ACTIVE** | successful legacy Telegram traffic is reflected by durable recovery send markers and B3.2 post-success observations | production bot installs the global `send_message` observer; Telegram Bot API remains the sole executor |
| C10 | legacy reactivation/recovery loops -> Telegram/optional app bridge | **ACTIVE** | reactivation `2/8`; freed-slot sends `10/27` | scheduler/candidate loops and their sent-marker writes remain reachable |
| C11 | phone authentication -> SMS.ru | **DORMANT** | auth SMS codes: `0/0` | auth endpoint, rate limits and SMS adapter remain reachable |
| C12 | email authentication -> SMTP | **DORMANT** | auth email codes: `0/0` | auth endpoint, rate limits and SMTP adapter remain reachable |

`UNREACHABLE/DEAD` here describes the current production graph/data, not a
request to delete code during this phase.

## 4. Exact production scenarios for ACTIVE paths

| ID | Exact user/system scenario | Legacy execution owner |
| --- | --- | --- |
| C03 | YClients produces an organic appointment create/change/delete event; legacy Python publishes the resulting owner/staff inbox item through the protected bridge | legacy Python bridge -> `InboxService` -> optional APNs |
| C04 | a client or staff member creates, reschedules or cancels an appointment through an already connected production channel | appointment lifecycle hook -> `InboxService` -> optional APNs |
| C05 | a configured appointment/shift reminder becomes due for an eligible recipient | legacy/Nest reminder scheduler -> `InboxService` -> optional APNs |
| C06 | the tenant-local morning/daily report schedule becomes due for an owner or master | owner report scheduler -> `InboxService` -> optional APNs |
| C09 | the production Telegram bot successfully replies to a real user command or conversation | legacy Python `barbershop-bot` -> Telegram Bot API |
| C10 | an organic scheduler run selects an eligible dormant client or a client suitable for a newly freed slot | legacy Python recovery loop -> Telegram Bot API, plus the existing optional app bridge |

## 5. Safest single-message production proof

### Selected flow

The safest proof is the existing `/privacy` command in the production MAYA
Telegram bot.

Reasons:

- it is user-initiated;
- the user is the only recipient;
- it does not create/change/cancel an appointment;
- it does not mutate CRM;
- it does not enter a marketing audience;
- it produces exactly one deterministic privacy-policy reply;
- it passes through the same legacy Telegram `send_message` executor observed
  by B3.2.

### Exact instruction for the project user

1. Open the existing production MAYA Telegram bot that you already use.
2. Send exactly `/privacy` as one standalone message.
3. Do not press any other bot buttons and do not send another command until the
   observer has been checked.
4. Expected legacy result: exactly one bot reply headed
   `Политика конфиденциальности`.

### Expected execution and observation

```text
user sends /privacy
  -> production Python CommandHandler("privacy")
  -> cmd_privacy
  -> Telegram Bot.send_message (the only external executor)
  -> Telegram returns message_id
  -> installed post-success observer
  -> protected POST /api/inbox/internal/observe-legacy-telegram
  -> SHADOW_ONLY communication.operational-single.shadow.v1
  -> one tenant-scoped Telegram recipient lifecycle row
  -> ActionAttempt count remains 0
  -> new-path external messages remain 0
```

Codex must not send this command or message for the user. After the user reports
completion, the observer check must compare the legacy success with exactly one
shadow logical identity and then report `EQUIVALENT`, `DIVERGENT` or
`NOT OBSERVED` without performing cutover.

## 6. Bulk proof without send

### Nest bulk (`C07`)

Full equivalence cannot be proven from current production artifacts:

- the producer is unreachable from the current production graph;
- there are no real 7/30-day bulk campaign executions;
- the sixteen current campaign rows are shadow `SINGLE` records, not bulk
  campaign history.

Therefore no real/historical Nest bulk input exists from which to compare old
and new audience plans.

### Legacy recovery/broadcast loops (`C10`)

The durable Python logs prove successful recipient-level sends, but they do not
preserve the complete historical pre-send decision snapshot needed to compare:

- full candidate audience;
- exclusions;
- channel;
- consent and eligibility evidence;
- delivery identities before dispatch;
- approval/risk decision.

Reconstructing that historical snapshot from today's CRM/business state would
be guessed evidence and is not acceptable. Recipient send markers alone are a
partial proof, not bulk equivalence.

The safe future proof is passive dual planning during one organic bulk/recovery
run: freeze the old candidate plan before legacy dispatch, compute the new
shadow plan from the same frozen input, compare all six dimensions, and keep
new-path dispatch disabled. This is not implemented or executed in this plan.

```text
BULK NO-SEND EQUIVALENCE PROVABLE FROM CURRENT ARTIFACTS: NO
NEW-PATH BULK SENDS: 0
```

## 7. Gates and stop condition

- No synthetic communication was sent.
- No campaign was started.
- No provider dispatch was enabled.
- No communication executor was switched.
- No production data was mutated by this inspection.
- No application, Prisma schema or database migration was changed.
- Chapter 7 was not started.
- Runtime agents were not created.

```text
REACHABILITY CLASSIFIED: YES
ACTIVE: 6
DORMANT: 4
UNREACHABLE/DEAD: 2
SAFE SINGLE-MESSAGE PROOF IDENTIFIED: YES
SAFE SINGLE-MESSAGE PROOF EXECUTED: NO
BULK NO-SEND EQUIVALENCE PROVED: NO
NEW-PATH EXTERNAL MESSAGES: 0
CUTOVER PERFORMED: NO
WAITING FOR USER PROOF
```

STOP. Wait for the project user to execute the selected `/privacy` proof.
