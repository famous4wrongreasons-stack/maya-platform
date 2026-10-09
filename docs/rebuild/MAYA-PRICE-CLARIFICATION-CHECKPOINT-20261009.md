# MAYA pricing clarification continuation — 2026-10-09

The missing code transition now retains the owner's exact raw RUB amount while
asking for one exact current service name. A service-only answer resumes the same
finite task; a later price correction prepares a new exact diff under the existing
YC-SP1 approval owner. The retained preference itself grants no preparation or
execution authority.

Base: **`2e43be9545e17c04a85bc54b5c422519075b5a18`**.
Code/proof source: **`177c930c717795e72d8162aa50f686cd1cde305b`**.
Branch: `codex/maya-pricing-clarification-20261009`.
Worktree: `/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-pricing-semantic-integration`.

## Actual missing behavior and implementation

The baseline required a complete raw service+command+price anchor. Its generic
clarification asked for parameters again, service-only clarification could not
reuse 1500, and an approval action made the next semantic context null. The new
actual-parser/AiCore transition test fails on the unchanged full base; its RED
log is retained separately.

The existing encrypted/erasable `maya.chat-semantic-context/1` now contains a
bounded pricing preference: tenant/user, current pricing source hash, stated new
price, and optional exact `{id,name}`. No approval ID, token, previous current-price
fact or dispatch receipt is retained. No schema, store or retention extension.

- The first amount comes from an explicit raw fixed-price preparation request,
  not model arguments. The unresolved service phrase never becomes an identity.
- MAYA asks one question naming the retained amount. A whole literal service-name
  answer is matched uniquely against the current catalog.
- Same-task semantic carry supports clarification/answer/correction as preference.
  Core always binds the current raw turn and server-restored marker independently.
- Successful current-turn binding is required separately from restored context.
  Compound/later-step tool selection cannot dispatch a retained proposal.
- A different service, invalid new amount, STOP, another task, missing context,
  changed actor/tenant/source, duplicate title or renamed/reused service ID cannot
  silently borrow the old amount or approval.
- Source metadata is checked around the catalog read. Its idempotency/C9 call key
  includes source revision, preventing old-company catalog replay after switching.
  Fresh and same-key pricing preparation also check exact source and service name.
- Current owner membership is reread after metadata awaits; source is reread after
  provider snapshot preparation. Current pricing integration hash already includes
  all settings, including canonical company/branch binding.
- Only the marked pricing `approval_required` action retains this preference;
  completed/UNKNOWN/other actions retain their previous context barriers.

Existing F32a/F74a fixed-RUB admission, immutable approval, fresh before-state,
canonical AE, UNKNOWN/no-resend and outbound restrictions remain in force.
No YC-SR1/F74c service rename or new background authority is admitted.

## Inherited candidate and separate lane

This branch starts directly from the full base SHA above, so it contains all
previous changes in that candidate, including pricing semantic integration,
C8 calendar refusals, review/journal continuations, staff/public source fixes and
the prior MAYA development integration. Historical gates remain dated evidence;
inheritance does not imply a new aggregate qualification.

[Git ancestry evidence](evidence/maya-price-clarification-20261009/candidate-inheritance.json)
checks all registered worktree heads under task-2. The only separate non-ancestor
at inspection is `codex/maya-union-handoff-20261009`, full head
`3faa0c4f8934c8c67a8fc564936c3f8070ce8a67`. Its three additional commits are the
frozen union readiness/launcher harness, PTY restoration test and handoff evidence.
It is not merged here; frozen9 and the existing direct-launch file are untouched.

## Qualification

The new continuation applies to the existing authenticated **web chat** path.
The non-web legacy binding is unchanged.

| Check | Result | Evidence |
| --- | --- | --- |
| Reproduced baseline failure | One selected transition fails before the change | [RED log](evidence/maya-price-clarification-20261009/baseline-red.log) |
| Targeted component regression | 747 passed, 0 failed, 7 suites | [Final Jest result](evidence/maya-price-clarification-20261009/targeted-r3.json) |
| Actual auth/HTTP/PostgreSQL/AE | 26 passed, 0 failed/pending | [HTTP result](evidence/maya-price-clarification-20261009/http-r1/http-jest.json) |
| Current headless/React carrier replay | 5 passed, 0 failed | [Carrier log](evidence/maya-price-clarification-20261009/http-r1/carrier-http-fixture.log) |
| Production and full HTTP types, scoped lint | Passed | `types-r3.log`, `http-types-r3.log`, `lint-r4.log` in the evidence directory |
| Backend and preflight build | Both exit 0 | [Build results](evidence/maya-price-clarification-20261009/build-results.json) |
| Current React types and web build | Passed | [Source-bound manifest](evidence/maya-price-clarification-20261009/http-r1/manifest.json) |

The [actual conversation transcript](evidence/maya-price-clarification-20261009/http-r1/price-clarification.json)
records three distinct application processes (38762, 38861, 38967) using the same
persisted conversation. The first asks one question with 1500 RUB; the second
accepts only «Мужская стрижка» and returns current 2000 → proposed 1500; the third
accepts only «Нет, на 1600 рублей.» and returns current 2000 → proposed 1600.
The passing test then refuses approval of the superseded card, approves the new
card through the existing widget/AE owner and verifies exactly one synthetic
provider PATCH and one SUCCEEDED action. No PATCH or AE action occurs before
explicit approval. The transcript records the resulting 1600 RUB receipt.
The exact old-control refusal response is not exported; that refusal is evidenced
by the passing source assertion in the HTTP test.

A separate HTTP test uses two actual Branch rows and canonical branch-binding
settings: changing the current binding cannot carry the old price. A foreign
tenant cannot reuse the conversation. Targeted tests also cover actor/source
changes, changed service identity, same-key catalog replay and compound-plan
attempts to dispatch a restored preference without current-turn binding.

The carrier replay covers the existing confirmed/rejected/UNKNOWN/detail
fixtures; it is not browser rendering of the new 1600 RUB conversation.
The process proof restarts Node applications on **one retained PostgreSQL**;
PostgreSQL itself is not restarted in this new proof. All owned child processes
exited and the owned PG cluster stopped; [final cleanup and source checks](evidence/maya-price-clarification-20261009/final-verification.json)
record that boundary.

Earlier failed attempts are retained: initial targeted regression had five old
pricing mocks without semantic plans; those mocks were corrected. Lint first
exhausted a 1536 MB heap, then found two proof-helper lint errors; final lint
passed after the helper fixes with a 3072 MB heap. Those logs are historical
attempts, not additional passing qualifications.

Independent source review found and verified fixes for restored-marker dispatch
and source-unqualified catalog replay. Final independent evidence review found
no blockers, checked all 11 manifest source bindings against Git, confirmed the
counts/transcript/receipt/cleanup, and stated the limits above. Its record is
[independent-review.json](evidence/maya-price-clarification-20261009/independent-review.json).

Model decisions and provider responses are explicitly scripted/synthetic.
The real parser, conversation intelligence, current chat, auth, database, C9 read,
approval and AE mechanics are exercised; no real-model, real-YCLIENTS, production,
browser or full-MAYA/C10 acceptance is claimed. No working website, frozen9,
direct-launch script, remote branch, schema, retention policy or background
authority was changed. No real CRM writes or outbound notifications occurred.
