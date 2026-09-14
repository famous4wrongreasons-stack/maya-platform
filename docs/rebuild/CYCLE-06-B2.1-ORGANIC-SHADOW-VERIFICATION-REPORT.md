# CYCLE 06 B2.1 - ORGANIC SHADOW VERIFICATION REPORT

Date: 2026-08-22.

Branch: `codex/maya-brain-systemic-release-20260815`.

Canonical bridge release:
`20260822-c06-b21-legacy-appointment-shadow`.

Related implementation report:
`docs/rebuild/CYCLE-06-PHASE-B2.1-LEGACY-APPOINTMENT-BRIDGE-CONVERGENCE-REPORT.md`.

## 1. Verdict

Organic production traffic has now supplied one successful legacy Python
action for every in-scope appointment class:

- create;
- reschedule;
- cancel.

All three observations are semantically equivalent to the canonical Action
Engine preview. There are no divergent or incomplete observations. The bridge
executed no CRM write, message, campaign or other external action.

This report proves organic shadow equivalence only. It does not authorize or
perform cutover. The legacy Python path remains the sole execution owner and
the canonical bridge remains preview-only.

## 2. Production conditions

The observation window ran with the following fixed boundaries:

- legacy Python performed the real YClients mutation;
- `MAYA_LEGACY_APPOINTMENT_BRIDGE_MODE=shadow`;
- NestJS bridge execution remained disabled;
- observer network access remained disabled;
- observer state and journal cursor were durable across restart;
- attendance remained outside scope;
- no synthetic CRM mutation was performed by Codex;
- the user acted as a real client and initiated all three mutations.

Production services after verification:

- `maya-organic-appointment-shadow-observer.service`: active;
- `maya-saas.service`: active;
- `barbershop-bot.service`: active.

## 3. Organic action evidence

No record IDs, client data, phone numbers, raw payloads or CRM secrets are
included in this report.

| Action class | Organic user path | Legacy origin | Deliveries | Unique logical actions | Verdict |
|---|---|---|---:|---:|---|
| `create_appointment` | Telegram booking flow and explicit confirmation | `telegram.bot` | 1 | 1 | `EQUIVALENT` |
| `reschedule_appointment` | Telegram conversation with MAYA, same appointment retained | `claude_ai` | 1 | 1 | `EQUIVALENT` |
| `cancel_appointment` | Telegram `My appointments` card and explicit cancellation confirmation | `telegram.bot` | 1 | 1 | `EQUIVALENT` |

For every observation the passive verifier compared canonical semantics, not
transport byte equality:

- tenant resolved from the trusted CRM binding;
- action class;
- opaque target identity;
- normalized typed payload;
- logical/idempotency identity;
- authorization context;
- policy and approval requirement;
- expected canonical executor.

No mismatch was recorded in any comparison dimension.

## 4. Duplicate and identity proof

Final observer totals:

| Metric | Result |
|---|---:|
| Deliveries | 3 |
| Unique logical actions | 3 |
| Duplicate deliveries collapsed | 0 |
| Divergent deliveries | 0 |
| Incomplete observations | 0 |

There was one distinct logical action per class. The observer retained its
cursor and state across restart without increasing any action count.

No organic duplicate was delivered during this window, so duplicate collapse
was not invented as a production result. Deterministic restart, replay and
logical-identity collapse remain covered by the existing bridge and observer
test suites.

## 5. Observer ingestion correction

The first organic create reached the NestJS journal but was initially skipped
by the observer. Root cause analysis proved that systemd journal represented
the ANSI-bearing `MESSAGE` value as a JSON byte array rather than a string.
The bridge and appointment mutation were correct; only passive ingestion was
affected.

The observer was hardened to accept either:

- a normal journal string; or
- a bounded valid byte array decoded as UTF-8.

Arbitrary structures, booleans, out-of-range bytes and oversized arrays remain
rejected. The correction has 13 passing observer tests, including ANSI byte
array ingestion and invalid-array rejection.

The exact already-persisted organic create journal record was replayed through
the corrected passive parser while the observer service was stopped. This did
not call application code, CRM, messaging or any executor and did not create a
second appointment. Restart then resumed from the durable cursor without a
duplicate observation.

## 6. No-side-effect proof

Final production counters:

| Shadow counter | Result |
|---|---:|
| Bridge CRM writes | 0 |
| Bridge messages | 0 |
| Bridge campaigns | 0 |
| Bridge external side effects | 0 |
| Preview external side effects | 0 |
| External actions executed | 0 |

The observer imports no CRM writer, messaging owner, campaign executor,
billing writer or application runtime. It only reads the dedicated sanitized
journal contract and persists opaque verification state.

## 7. Observer health

At the final observation:

- overall verdict: `EQUIVALENT`;
- journal cursor: present;
- parser errors: `0`;
- ignored observation events: `0`;
- automatic cutover allowed: `false`.

The observer remains installed and active so later organic traffic can extend
the evidence window without losing restart safety.

## 8. Cutover gate

Organic equivalence is now proven for create, reschedule and cancel. Cutover
was deliberately not performed.

A separate approved cutover package is still required to:

1. enable canonical bridge execution in a controlled release;
2. switch Python from `shadow` to `cutover` without a direct fallback;
3. verify the first organic canonical execution;
4. remove the four private legacy provider owners;
5. tighten the direct-provider ratchet;
6. recount the 11 current initiator entry points as zero direct-write bypasses.

Until that package is approved and completed, Phase B2 remains open and the
next action family remains blocked.

## 9. Scope boundaries preserved

- attendance: excluded under finding 4.43;
- campaign migration: not started;
- Chapter 7: not started;
- runtime agents: not created;
- automatic cutover: not introduced;
- application behavior: unchanged by the observer parser correction.

## Final status

ORGANIC CREATE: EQUIVALENT

ORGANIC RESCHEDULE: EQUIVALENT

ORGANIC CANCEL: EQUIVALENT

DIVERGENT ACTION CLASSES: 0

UNOBSERVED IN-SCOPE ACTION CLASSES: 0

BRIDGE CRM WRITES: 0

BRIDGE MESSAGES: 0

BRIDGE CAMPAIGNS: 0

EXTERNAL ACTIONS EXECUTED BY SHADOW: 0

ORGANIC EQUIVALENCE PROVEN: YES

CUTOVER PERFORMED: NO

AUTOMATIC CUTOVER ALLOWED: NO

PHASE B2 COMPLETE: NO

READY FOR SEPARATE CUTOVER DECISION: YES

NEXT ACTION FAMILY STARTED: NO

RUNTIME AGENTS CREATED: NO

STOP
