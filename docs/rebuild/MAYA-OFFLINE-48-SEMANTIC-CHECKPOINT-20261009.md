# Offline 48: source and task semantics checkpoint

The final local HTTP run completed all **48 dialogues / 81 turns**. The 17:00
staff-continuation fixture is fixed and proven through the actual application.
Every turn now has a source/task verdict and its raw actual reply is auditable.

| Final finite verdict | Turns |
| --- | ---: |
| Pass | 41 |
| Semantic failure | 25 |
| Unsupported in the bounded scenario | 9 |
| Insufficient evidence | 6 |

Critical checks: **0 observed failures, 2 turns with missing schedule evidence**.
This is not a blanket safety pass. A semantic failure takes precedence over
missing evidence in the main count. The runner exits **2** because the diagnostic
contains semantic failures; HTTP execution itself completed (80 HTTP 201 and one
expected membership-revocation 401). There were no skipped or unresolved turns.

Read the [actual 81-turn audit](evidence/maya-offline-48-semantics-20261009/ACTUAL-81-TURN-AUDIT.md),
[machine score](evidence/maya-offline-48-semantics-20261009/http/r2/semantic-score.json)
and [raw runner report](evidence/maya-offline-48-semantics-20261009/http/r2/runner-report.json).
The [96-file evidence manifest](evidence/maya-offline-48-semantics-20261009/manifest.json)
has SHA256 `5dd949372d7b1e9fd1555acebb61be38f7f4e37e705ff2eea2e25c417a83ecec`.

This candidate extends the separate offline-only 48-dialogue / 81-turn diagnostic
at `5445c932a9968374584e30f47c2f4f2a69b305dd`. It does not change the frozen
9-dialogue candidate, its prepared handoff, the production website, live provider
access, or any product authority. Scripted model output is not real model or
linguistic acceptance. No C10 completion is claimed.

## Diagnosed continuation fixture

The repeated staff question after the explicit 17:00 request was reproduced with
the existing AiCore sanitizer, current semantic projection and booking binder.
Historical message name aliases are not current name references. The old scripted
recipe copied a historical alias. The fixture now carries the current projected
semantic employee only when the current user turn does not name a replacement.
Production AiCore and booking owners are unchanged. Two component controls prove
the current Artem alias resolves and an explicit Maxim correction takes priority.
An actual HTTP run is still required to close the end-to-end observation.

## Independent finite assessment

The frozen expectations document was derived from the existing user corpus and
canonical owners before evaluating this candidate's actual replies. Its SHA256 is
`48ff54a9b02e404f18515aa9d4070fadbb231f4c72adc96b1aed6ce95403e7cf`.
The evaluator contains 81 descriptors and imports neither scripted recipes nor
historical assistant/gold replies. It separates `pass`, `semantic_fail`,
`unsupported`, and `insufficient_evidence`, with critical safety checks recorded
separately. A pass covers finite observed predicates only.

The HTTP probe captures the actual existing AiCore completion arguments, validated
semantic tasks and READ results, typed current selectors, persisted C9 evidence,
membership and bounded synthetic source facts. Private fields are omitted or
hashed. Explicit public company fields have a separate strict projection. Raw
actual assistant replies and their actual replay history are retained and hashed.
The score binds the source commit, corpus, manifest, per-turn expectation and raw
report. HTTP 201 alone, a generic refusal or missing evidence cannot earn a pass.

Legacy finite replay checks remain recorded but no longer stop dependent turns in
this offline-only profile. In particular, identical generic prose does not prove
that a newly bound selector/date is wrong. Existing transport, UNKNOWN and
side-effect safety gates remain blocking. The new report scores all 81 planned
turns, including absent attempts, without replacing assistant history or gold.
If execution stops, the separate score artifact is explicitly incomplete and
non-successful even when observed per-turn checks passed.

## Validation before actual HTTP proof

- Focused Node aggregate: 57/57 passed, including 24 evaluator controls and 5
  scored-report controls (overlapping suite counts are not additional tests).
- Actual sanitizer/binder continuation component controls: 2/2 passed.
- Audit projection component controls: 9/9 passed.
- Widgets-live TypeScript check and scoped TypeScript ESLint passed.
- Formatting passed for all changed code files.

Independent source review found and drove three evaluator corrections before
the actual run: unrelated negation cannot hide a positive completion claim;
availability requires the canonical typed receipt/envelope relation and current
exact-time review; C9 recommendations explicitly require no side effects and no
execution authority. These are diagnostic checks, not new product permissions.

## First actual run and assessor corrections

Run `r1`, source `0caf2002aab75213fce35db201b589a9491e388d`, completed all
81 attempts (80 HTTP 201 and one expected auth 401), without skips or unresolved
transport outcomes. The runner exited 2 for semantic failures. Its unmodified
report and raw replies are archived under
`evidence/maya-offline-48-semantics-20261009/http/r1/`.

The 17:00 continuation now exposes one current canonical selector for 17:00
Europe/Moscow, carries Artem, explicitly says the booking has not been created,
and does not ask for the known staff member again. The independent explicit Maxim
19:30 correction also passes. This closes the fixture diagnosis through HTTP.

The first score (39 pass / 33 semantic fail / 7 unsupported / 2 insufficient)
is retained as an intermediate evaluator result, not the final assessment.
Independent raw-reply review found both false failures and a false pass:

- Four critical flags misread local negative propositions, including a negative
  predicate after its subject. Those actual replies did not confirm success.
  Removing the false critical flag does not complete either failed schedule read.
- A safe secret-data refusal should not require a connection-status READ intent.
- Moscow October begins at `2026-09-30T21:00Z`; a UTC string prefix rejected valid
  period evidence. Conversely, a word in a scripted clarification does not prove
  that the task preserved both periods for comparison.
- A timestamp containing `30` and the word `Исходные` falsely satisfied the
  lifecycle threshold explanation. The actual reply did not explain 30 days.
- Absence of the entire C9 recommendation must be insufficient evidence, not a
  skipped safety check.

The actual published C7 range ends at Moscow `2026-10-31T23:59:59.001`; it is
preserved exactly and is not labelled a complete month. A post-HTTP inventory of
published snapshots cannot establish that another finance period is unsupported.
Finance clarification without an observed owner READ is insufficient evidence;
a lost comparison request remains a semantic failure. Unsupported finance needs
an observed owner limitation on the exact requested period. Requested-price
metadata can demonstrate carryover, but cannot create price preview authority.

Final corrected-source checks before the next HTTP run: 63/63 focused Node tests
(including 30 evaluator controls), 12/12 audit helper controls, TypeScript,
scoped ESLint and formatting passed. The unchanged continuation controls remain
2/2 passed. Earlier failed checks and evaluator reports remain in the evidence.

These corrections change the diagnostic predicates, not the frozen user corpus,
assistant history, scripted answers or production owners. Adversarial controls
must cover the general mistakes. The original report is not overwritten.

Several observations require further development and must not be waived by a
safe generic reply: no confirmed employee schedule after the topic switch;
unanswered own appointment despite a seeded future appointment; lost comparison
request; journal request routed to a staff roster; missing lifecycle rule details;
generic service/price/BI answers; a stop command that again offers to prepare an
action. Some of these originate in scripted planning/output, so this run cannot
attribute all of them to a real model or to production owners. Profit-055 is a
scripted clarification with no observed owner READ, not proof of unsupported
profit functionality. Appointment dates were already empty objects in the
captured sanitized tool result; the audit helper supports native Date values, so
this alone does not establish the cause of the blocked personal response.

All six owned process groups were absent, the broker closed, PostgreSQL stopped,
the postmaster pid file was absent and source pins remained unchanged. The broker
recorded zero upstream calls, no loaded credentials and no paid authorization.

## Final source-bound proof

Run `r2` used clean source `e02dfde6619e7f838dd1323d9c7c6961f9f4347b` and
manifest `c22434ab717a088d9ae6807e994708daa02bc60d4fcc87e1d591fe92cf4f555b`.
The expectation-descriptor hash is
`30b7da0df828ff253115625406d991edf5b489cb8bfe880a3728272ceb67d916`.
The frozen human expectation document retains its original hash above; corrections
to the executable diagnostic predicates are explicitly described in this report.

The final run again recorded zero upstream calls, no loaded credentials and no
paid authorization. All six owned groups were absent, the broker closed,
PostgreSQL stopped, the pid file was absent and source pins remained unchanged.
The occupancy transition remained AVAILABLE to CLOSED after the controlled
synthetic source change, with no execution authority. No app business mutation
or outbound notification was observed. Test setup/source transitions are fixture
writes, not claims of a real CRM operation.

The frozen nine-dialogue candidate remained clean at
`b74d62851de075a48f2c10bf5da48524c8ca0e47`; the prepared handoff remained clean at
`3faa0c4f8934c8c67a8fc564936c3f8070ce8a67`. No prompt window, paid model,
live YCLIENTS, production, phone, website, push, merge or deployment was used.

UNKNOWN/restart are not exercised by this corpus and cannot be claimed as passed.
Scripted transport cannot qualify a real model, real language quality, live branch
binding or overall MAYA/C10 completion. The 25 failing turns and six insufficient
turns above are remaining development/verification work, not a green release gate.
