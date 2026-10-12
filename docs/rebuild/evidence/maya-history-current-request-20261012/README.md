# Current request versus retained history plan

2026-10-12, branch `codex/maya-local-crm-setup-20261010`.
Product change: `880b4653`. Final executable proof candidate:
`e267e9ef622aefda9eed6e35fced3e339efabd86`.

**LOCAL IMPLEMENTATION / OFFLINE PASS. LIVE LAST-VISIT REQUALIFICATION OPEN.**
This is not release certification, deployment or successful real-model acceptance.

## Observation and narrow change

The preceding [live checkpoint](../maya-history-keychain-live-20261012/README.md)
passed personal-history retrieval but failed the second question. Its recorded
model response repeated both the first question in `parent_request` and
`period=past`; empty tool arguments remained valid. Why the model made that
choice is not conclusively established. The original generic response is pinned
unchanged in a fixture; the regression still identifies its incorrect period.

The existing planner now puts `current_user_request` at the end of its serialized
input, derived from the latest already privacy-projected user message. General
instructions distinguish current meaning from retained task context, require
re-evaluation of explicit scope even when the tool stays the same, and carry only
unmentioned slots of a continuing task. There is no phrase router, extra model
call, mirror writer, new agent or expanded tool authority.

The finite local history-review guard permits this field only when it exactly
equals the already admitted latest question. Missing, stale or arbitrary/private
values fail closed. Visits remain in the server composer. The existing wire-byte
budget, Client checks and confirmed-attendance requirement are unchanged.

Persisted semantic context canonically erases historical `parent_request` prose
in `AiCoreService`; it retains the prior task/period. The HTTP proof checks this
empty parent, the previous question in user conversation and the explicit new
request. It does not reintroduce persisted prose to satisfy a test.

## Executed proof and limits

| Surface | Fresh result | What it establishes |
| --- | --- | --- |
| Scoped Jest, 9 suites | 189/189 PASS | Wire budgets, continuation/schema, model parsing, personal source/composer and owner-review regressions |
| Bounded history privacy policy | 7/7 PASS | Current question exactness and private/foreign/planning input refusals |
| Typecheck, scoped ESLint, backend build | PASS | Changed source compiles; final HTTP run rebuilt backend and React |
| Targeted counterfactuals | 4/4 killed | Exact prior planner, first-user selection, retained-parent selection and missing privacy equality each fail; baseline/restored both 11/11 PASS |
| Actual React → relay → AppModule → disposable PostgreSQL | 17/17 PASS | One login/conversation, two new persisted pairs, explicit new request versus retained `past`, rendered history and last-confirmed-visit answers, prior turns unchanged |
| HTTP negative/cleanup cases | PASS | Direct booking/import/SMS/binding refused; revoked Client and expired allowance refused; no widget grant or reimport; test PG stopped, PID absent, source unchanged |

Model replies in these new tests are scripted. They prove request construction,
parsing, authority, persistence and rendering, **not** that DeepSeek will choose
the right meaning. Both DeepSeek and OpenAI serialization paths are covered
offline; neither external model was called. The synthetic source has an attended
visit; the unit case without confirmed attendance still emits the truthful
absence message. The owner's four previously observed rows must not be presented
as a confirmed visit without attendance evidence.

Unit tests ran on the same source bytes committed in `880b4653`; mutations ran on
`61989aef`. The only later executable change is the HTTP harness correction in
`e267e9ef`; product bytes are identical. This is not a claim of full final-SHA
release certification. Receipts identify their actual candidates.

## Failed attempts retained

Two preliminary unit runs exceeded the unchanged 98,304-byte planner budget.
Instructions were compacted, not the limit increased. An initial isolated
mutation copy omitted a relay import; `61989aef` fixed that test packaging.
The initial HTTP proof wrongly required historical parent prose; `e267e9ef`
corrected the assertion to the existing privacy contract. All final runs above
passed; earlier failures and original hashes remain in the adjacent manifest.

## Next work

1. In one separately authorized live session, recheck history → last visit in the
   same conversation using the saved-key component. Do not repeat CRM setup,
   Telegram binding or import. Existing expired authorization is not renewed here.
2. Continue the first continuous booking → result → reschedule → cancel path,
   including recovery and exactly-once outcomes. Real provider effects need their
   own explicit scope; strong synthetic recovery evidence is not real acceptance.
3. Continue the remaining delivery-plan groups; current mobile/voice acceptance,
   messenger delivery, broad owner/staff/agent workflows, bounded C10 and scale
   remain distinct work. The first useful path is not the whole product.

No real credentials were read, no provider/model requests made, no retained owner
database opened, no production changed, no iPhone operation performed. Migrations
ran only in the disposable synthetic PostgreSQL created by the proof. Raw test
databases, screenshots and logs stay outside Git; inspected aggregate receipts
and hashes are archived here.
