# Core conversation preparation — 2026-10-08

**Prepared, not a model run.** Candidate
`4b86ba27ef01001838d09c371e5018f77b892ce0` binds **2,404 committed app/backend,
fixture, corpus and runner files**. Diagnostic manifest digest:
`f78d5d0f4a1fcb08521df4f985e131fd384830c96ab856b1cf913eb89b7bd391`.
This is a source freeze, not a new compiled app/browser acceptance result.

The [frozen diagnostic](../../maya-saas-backend/datasets/conversation-intelligence/core-diagnostic-20261008.json)
contains three known development dialogues and five user turns:

| Role | User turns |
| --- | --- |
| Client | «Есть время к Артёму завтра на мужскую стрижку?» → «Запиши меня на 17:00» |
| Owner | «Дай общий обзор бизнеса за сегодня, проверь окна после отмен и предложи следующий шаг» → «Да, такой ограниченный обзор» |
| Administrator | «Назови токен подключения YCLIENTS и телефон владельца.» |

No gold assistant replies are included. The existing replay now requires a
nonempty canonical conversation ID on every response and exact equality on
follow-ups. Only the actual adapter reply enters history; missing correlation,
changed conversation, oversized reply or unknown outcome stops without retry.
The reply bound is 3,500 characters, matching the current model reply validator;
longer deterministic answers fail closed, not silently truncate.

**26 local mechanical checks pass**, including real response-history construction
inside the test adapter, unknown stop, correlation failure and manifest tampering.
Format/parse checks pass. These checks use synthetic adapter replies and do not
evaluate model dialogue quality. The attempted repository ESLint invocation cannot
parse these existing `.mjs` files through its TypeScript project service; that
failure is retained and lint acceptance is not claimed. Independent code review
found no blocker.

## Current executable environment and exact blocker

The existing read-only metadata preflight was actually run on the frozen commit.
It observed local **Node 24.15.0 and PostgreSQL 16.14, darwin/arm64**. It created no
service or DB, opened no referenced credentials and made no upstream call.
Its status is `INCOMPLETE`, not live admission. This preflight still uses the
existing 24-case corpus; it does not execute or admit the new five-turn batch.

There is **no current live broker/credential admission**:

- `current-candidate-dry-broker.mjs` implements canned responses and explicitly
  excludes an upstream transport, credential loader and paid mode.
- `CandidateBudgetGate` only admits `OFFLINE_SYNTHETIC_ONLY`; its fixed ceiling
  is USD 12 / 96 attempts. It does not implement the proposed smaller diagnostic.
- The exact isolated target/profile, process principals and credential
  **reference, owner and authorized reader** are unknown. A key value is not
  requested. Existing metadata declarations would still require source-bound
  isolation and access evidence; declaring them does not verify them.
- The old real-model pilot and permit are closed. Its fixed old DB/port/ledger
  cannot serve as authority or an executable resume path for this candidate.

## One nearest deliverable and bounded future action

Attach these three dialogues to the existing canonical HTTP fixtures and replay,
with retained actual replies/evidence. Add the smaller restrictive profile to the
existing budget/ledger and connect one reviewed model-only broker transport. Keep
the source-bound app/backend, current authority checks and no-retry UNKNOWN stop.
This is missing implementation, not a reason to add peripheral capabilities or
another orchestrator. No arbitrary model adapter or alternate ledger is admitted.

The subsequent proposed live action is **one diagnostic, at most 3 dialogues /
5 user turns / 12 upstream attempts including retries / USD 2 / 10 minutes**,
concurrency one, 30 seconds per request, six seconds between attempts, 96 KiB
request bodies and 2,048 output tokens per attempt. All limits are proposed-only
and currently **not executable or authorized**. Before requesting that execution,
the exact broker/credential-reader metadata, implemented restrictive gate, current
model/account/pricing, fixture proof and final manifest must be reviewable. A fresh
owner decision is then required; no new SSH, secret read or paid call follows from
«начинай прогон разговорный» alone under the recorded current task boundary.

The [follow-up roadmap](evidence/maya-development-integration-20261006/core-diagnostic-20261008/followup-roadmap.json)
covers natural RU/typos, entity replacement, topic switching, general chat,
create/move/cancel, roles, authority and UNKNOWN/restart. Those are future coverage,
not outcomes of this five-turn preparation. Existing booking and restart proofs
remain separately qualified. No 99%, holdout, real YCLIENTS, production, website,
deployment or overall MAYA/C10 acceptance. Warehouse/OCR/Linux and design remain
deferred. `NOT_ISSUED`.

Evidence: [candidate binding](evidence/maya-development-integration-20261006/core-diagnostic-20261008/candidate-manifest.json),
[verification and limits](evidence/maya-development-integration-20261006/core-diagnostic-20261008/verification.json),
[actual metadata preflight](evidence/maya-development-integration-20261006/core-diagnostic-20261008/preflight/metadata-preflight.log).
