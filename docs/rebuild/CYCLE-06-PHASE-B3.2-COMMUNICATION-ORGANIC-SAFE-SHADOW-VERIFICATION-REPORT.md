# CYCLE 06 - PHASE B3.2 COMMUNICATION ORGANIC/SAFE SHADOW VERIFICATION REPORT

Date: 2026-08-23

Branch: `codex/maya-brain-systemic-release-20260815`

Production release: `20260823-c06-b32-time-contract-fix`

## 1. Scope and decision

The project user performed both approved safe production proofs:

1. one `/privacy` command to the existing production MAYA Telegram bot;
2. one appointment create for the project user's own client identity through
   the existing production Telegram booking flow.

Codex did not send a message, create an appointment, start a campaign, mutate
CRM data, or switch an executor. The appointment was created only by the user.

The tested operational-single Telegram path and transactional-single inbox
path are semantically equivalent to their shadow representations. Current
production data does not contain the immutable historical audience evidence
required to prove bulk equivalence.

```text
OPERATIONAL SINGLE: EQUIVALENT
TRANSACTIONAL: EQUIVALENT
BULK AUDIENCE: NOT PROVABLE
SHADOW DIVERGENCES: 0
NEW PATH EXTERNAL SENDS: 0
COMMUNICATION CUTOVER PERFORMED: NO
```

## 2. Privacy and evidence handling

Verification used aggregate, timestamp and boolean-only production reads. This
report contains no Telegram chat id, message id, user id, tenant id, client
identity, message body, phone, email, CRM payload, access token or provider
credential.

## 3. Operational-single proof

The user sent exactly one `/privacy` command. The legacy Telegram Bot API sent
one real reply. The post-success observer then produced exactly one
non-executing communication lifecycle.

| Property | Verified value |
| --- | --- |
| source type | `legacy_bridge` |
| producer identity | exact match for `legacy.python.telegram.send_message` |
| action class | `send_operational_single` |
| capability | `communication.operational-single.shadow.v1` |
| state | `NOT_EXECUTED` |
| dry run | `true` |
| policy decision | `SHADOW_ONLY` |
| autonomy | `L2_5_SHADOW` |
| approval | `NONE` / `NOT_REQUIRED` |
| action attempts | 0 |
| delivery scope/channel | `SINGLE` / `telegram` |
| recipient eligibility | `ALLOW` |
| delivery state | `NOT_SENT` |
| external dispatch state | `NOT_CROSSED` |
| delivery attempts | 0 |
| sent/accepted/failed/unknown | `0 / 0 / 0 / 0` |

The observer runs only after the legacy Telegram API returns success. The
shadow lifecycle therefore represents the same accepted logical reply, while
the new path cannot send a duplicate.

```text
LEGACY DELIVERIES OBSERVED: 1
UNIQUE LOGICAL ACTIONS OBSERVED: 1
SHADOW DELIVERY LIFECYCLES: 1
DUPLICATES COLLAPSED IN THIS PROOF: 0
```

No deliberate duplicate was sent. Existing structural idempotency proof is
preserved, but duplicate convergence is not promoted to new organic evidence.

## 4. Transactional-single appointment proof

The user created one appointment through the existing production Telegram
booking flow. The appointment Action Engine execution reached the canonical
CRM executor once and completed successfully:

| Property | Verified value |
| --- | --- |
| appointment state | `SUCCEEDED` |
| final outcome | `provider_applied` |
| execution attempts | 1 |
| provider attempts | 1 |
| duplicate CRM mutation | none observed |

The existing appointment communication producer persisted one real
`new_appointment` inbox item. The B3.2 observer created the corresponding
transactional shadow lifecycle 27 milliseconds from that durable legacy item.

### 4.1 Semantic equivalence matrix

The verifier independently recomputed all protected identities from the same
tenant-scoped canonical inputs. It did not compare two unrelated opaque hashes.

| Dimension | Verification | Verdict |
| --- | --- | --- |
| tenant | inbox item, ActionExecution and campaign use the same tenant | equivalent |
| recipient | lifecycle is linked to the same internal user | equivalent |
| source | `legacy_bridge` | equivalent |
| producer | protected identity for `inbox.new_appointment` matches | equivalent |
| communication class | `send_transactional_single` | equivalent |
| capability | `communication.transactional-single.shadow.v1` | equivalent |
| channel | `inbox` | equivalent |
| logical identity | evidence reference matches the appointment notification event | equivalent |
| target identity | shadow target HMAC recomputes from the same tenant and recipient | equivalent |
| template identity | protected `inbox.new_appointment` template identity matches | equivalent |
| content identity | independently recomputed content hash matches campaign and recipient | equivalent |
| recipient identity | delivery-kernel recipient HMAC recomputes exactly | equivalent |
| campaign identity | canonical campaign idempotency identity recomputes exactly | equivalent |
| delivery identity | canonical logical delivery identity recomputes exactly | equivalent |
| eligibility | `ALLOW` under the recorded server-recipient policy | equivalent |

The ActionExecution target HMAC and durable recipient-reference HMAC use
different intentional namespaces. Each was independently recomputed and both
matched its own canonical contract.

### 4.2 Shadow safety

| Property | Verified value |
| --- | --- |
| shadow state | `NOT_EXECUTED` |
| dry run | `true` |
| policy decision | `SHADOW_ONLY` |
| action attempts | 0 |
| execution attempt count | 0 |
| campaign scope/channel | `SINGLE` / `inbox` |
| aggregate state | `READY` |
| recipients | exactly 1 |
| recipient delivery state | `NOT_SENT` |
| external dispatch state | `NOT_CROSSED` |
| recipient attempts | 0 |
| delivery attempt rows | 0 |
| sent/accepted/failed/unknown | `0 / 0 / 0 / 0` |

The recipient currently has no registered push destination. This proof covers
the durable in-app inbox branch of the transactional family. It does not claim
production equivalence for APNs delivery.

```text
REAL INBOX ITEMS OBSERVED: 1
UNIQUE TRANSACTIONAL ACTIONS OBSERVED: 1
SHADOW TRANSACTIONAL LIFECYCLES: 1
SHADOW EXTERNAL SENDS: 0
TRANSACTIONAL VERDICT: EQUIVALENT
```

## 5. Bulk no-send proof

Production contains no durable `BULK` communication envelope and no bulk
delivery attempt. Existing Python send markers preserve recipient-level
outcomes, but not the complete immutable pre-send decision snapshot needed to
reconstruct and compare:

- included recipient identities;
- excluded recipient identities;
- eligibility and consent evidence at decision time;
- channel;
- duplicate collapse;
- approval and risk classification.

Rebuilding an old audience from today's CRM state would invent evidence. No
campaign was created and no bulk message was sent for this verification.

```text
DURABLE BULK ENVELOPES: 0
BULK DELIVERY ATTEMPTS: 0
BULK EXTERNAL SENDS: 0
BULK AUDIENCE VERDICT: NOT PROVABLE FROM CURRENT DATA
```

The missing proof requires passive dual planning from the same frozen audience
input during a future organic bulk/recovery run. The legacy path may execute;
the canonical path must remain shadow-only while recipient identity sets,
exclusions, consent, channel, deduplication and approval/risk are compared.

## 6. Bypass readiness after both proofs

The direct communication execution bypass inventory remains unchanged because
cutover was explicitly forbidden:

```text
ACTIVE: 6
DORMANT: 4
UNREACHABLE/DEAD: 2
DIRECT COMMUNICATION EXECUTION BYPASSES: 12
```

| Family / route | Verification status | Cutover readiness |
| --- | --- | --- |
| operational single - legacy Telegram reply (`C09`) | `EQUIVALENT` | ready for a separate bounded cutover review |
| transactional single - appointment inbox (`C03`/`C04`) | `EQUIVALENT` | ready for a separate bounded inbox cutover review |
| operational inbox reports/reminders (`C05`/`C06`) | structural/shadow evidence only | not production-equivalence approved |
| APNs (`C08`) | no current destination | not production-equivalence approved |
| bulk/recovery (`C07`/`C10`) | `NOT PROVABLE` | not ready |
| auth SMS/email (`C11`/`C12`) | dormant | not part of this proof |
| AI support/task inbox (`C01`/`C02`) | dormant | not part of this proof |

The two equivalent bounded routes do not justify a global communication
cutover. Any future cutover approval must name the exact action family and
exclude all unproved routes.

## 7. Safety assertions

- The user initiated both real actions.
- Codex sent no message and created no appointment.
- The new communication path created no `ActionAttempt`.
- The new communication path created no `MarketingDeliveryAttempt`.
- The new communication path sent zero external messages.
- No bulk campaign was created or sent.
- No communication execution owner changed.
- No runtime fallback or dual communication execution was introduced.
- Codex changed no application code, Prisma schema or production data. The
  only new production business datum was the appointment created by the user;
  its normal legacy inbox and shadow audit artifacts followed automatically.
- Chapter 7 was not started.
- Runtime agents were not created.

## 8. Final status

```text
OPERATIONAL SINGLE: EQUIVALENT
TRANSACTIONAL: EQUIVALENT
BULK AUDIENCE: NOT PROVABLE
SHADOW DIVERGENCES: 0
NEW PATH EXTERNAL SENDS: 0
READY FOR BOUNDED OPERATIONAL TELEGRAM CUTOVER REVIEW: YES
READY FOR BOUNDED TRANSACTIONAL INBOX CUTOVER REVIEW: YES
READY FOR COMMUNICATION CUTOVER APPROVAL: NO
CUTOVER PERFORMED: NO
```

STOP. Do not perform communication cutover, send a bulk campaign, begin
Chapter 7, or create runtime agents.
