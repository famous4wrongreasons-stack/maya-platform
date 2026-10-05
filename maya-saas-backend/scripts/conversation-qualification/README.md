# Bounded conversation pilot

Offline replay, bounded live broker runner, and budget mechanics. The real-model diagnostic below is not a language-quality certification.
The owner approved at most $20 total for the existing DeepSeek account, up to 50 synthetic
dialogues. One runner owns that total; no per-worker budgets or top-ups. Production services,
credentials and CRM effects remain outside this pilot.

```sh
node --test scripts/conversation-qualification/*.test.mjs
mkdir /tmp/maya-client-pilot-offline
node scripts/conversation-qualification/dry-run.mjs /tmp/maya-client-pilot-offline
```

The dry run uses no HTTP or model, writes exclusive output files, and selects 12 CLIENT booking
variants / 7 independent families / 36 user turns from the existing dev split. No held-out test
family is selected. `freezePilot` supports a larger bounded diagnostic selection. Each manifest
records the source and case hashes; a changed manifest cannot silently reuse the old digest.
Existing corpus expected intents/checks are review hints, not a grading oracle. Gold assistant
responses never enter replay: only the actual adapter's response enters the next request history.
An unresolved response stops the batch without replaying a possibly effectful chat request.

`PilotBudgetGate` reserves a pessimistic amount before each actual provider request, including
retries. Exclusive, fsynced ledger; no refunds for failed/unknown usage; max 600 requests, 200 turns,
50 dialogues, concurrency 1, 10 requests/minute, 30 seconds/request, 2 hours, $20 total. Model and
endpoint are closed; output at most 2048 tokens, thinking disabled. Peak uncached prices verified
2026-10-05 at https://api-docs.deepseek.com/quick_start/pricing/. Reservation uses serialized UTF-8
bytes plus framing allowance as a conservative input-token bound. Price/token assumptions must
still match the provider at dispatch. Ordinary restart with an existing ledger fails closed. Explicit checked resume preserves the original
start time, reservations and counters, validates broker compatibility handoff hashes and uses an
exclusive writer lock. Truncated/changed/exhausted ledgers are refused; stale locks are not
automatically stolen. Never start a second ledger as a budget reset.

`http-dry-run.ts` boots the canonical AppModule/auth HTTP pipeline against the guarded local
proof DB and feeds canned DeepSeek responses through the real model parser and budget gate.
After parent clarified that the pause concerned paid/server execution, the same local-only run
was explicitly admitted and completed: 36 provider attempts, zero actual paid requests,
`replayed_ungraded`, qualification `not_evaluated`. Evidence:
`/tmp/maya-http-pilot-resume-20261005-a/` and `/tmp/maya-http-pilot-resume.log`.
It admits no inherited provider key and has no live mode. This is HTTP/parser proof with canned
transport, not real-model or YCLIENTS acceptance. At that checkpoint isolated paid/server setup was still blocked; the subsequently authorized run is recorded below.

Before live execution, the dedicated adapter must use the canonical authenticated HTTP route in
an isolated synthetic tenant/DB and wrap every actual model fetch (including retries) in this gate.
Keep the existing widgets-live credential refusal unchanged. The live profile must deny all other
outbound effects and prove its CRM/notification/payment boundaries before receiving inherited
server-side credentials. Never copy/log credentials on the Mac. A fixture adapter, mock model,
internal calendar, or passing replay report does not establish real-model/provider acceptance.

The offline executable deliberately has no live switch. The separately isolated broker profile
now has actual model evidence below. Pilot results diagnose client booking; they do not establish
99% acceptance, actual CRM booking acceptance or 1000-salon capacity.

## Authorized isolated pilot attempt (2026-10-05)

`http-live-pilot.ts` is a separate broker-only profile pinned to the dedicated proof DB/port.
It does not change the production DeepSeek HTTPS validator or widgets-live credential refusal.
The six-dialogue slice has 18 turns, five independent families and manifest
`6abcad88012540dbdfff75cf34eeb1971a923f188f31a46e4a42a5106868747d`.

Server canned preflight replayed 18 attempts with zero paid calls. The first live broker request
then stopped with HTTP 400: its 79,230 UTF-8 bytes exceeded the broker's 65,536-byte envelope.
The broker rejects this before incrementing its upstream count or contacting DeepSeek.
Thus **zero actual provider calls/tokens/cost, zero completed dialogues**; the original ledger
retains its $0.11474232 reservation. The first raw report's `actualPaidRequests=1` was a broker-call
counter and is corrected by `pilot-evidence/qualified-outcome.json` in the task workspace.
No provider language-quality conclusion is possible.

The runner now validates the exact broker byte bound in both canned and paid paths before transport,
and labels broker requests separately. Paid permit is closed; production PID/release stayed unchanged.
Do not resume through a fresh ledger or restart the broker to reset its cap. That checkpoint required payload compatibility with the setup owner and preservation of the original
reservation. The verified recovery and completed diagnostic are recorded below.


## Completed real-model diagnostic (2026-10-05, 21:31–21:45 Moscow)

The broker owner raised the isolated envelope to 96 KiB and carried the prior attempt/reservation
into the same ledger. The runner verified that handoff and resumed without budget or TTL reset.
Every request kept the canonical prompt and authenticated AppModule HTTP path. Only synthetic
fixtures/internal calendar were reachable; production credentials were unavailable to the runner.

Six unique dev dialogues (five families) were reached: two cancellation/no-existing-booking
cases completed all three turns; four availability/booking cases stopped on their first turn.
The first failure was repeated once to obtain diagnostic evidence; it is not a seventh unique case.
The remaining cases ran independently in fresh synthetic tenants, preserving stop-on-unknown
inside each dialogue and without replaying an effectful user turn.

18 real DeepSeek HTTP200 responses: 270,996 input tokens (40,576 cache hit; 230,420 cache miss),
4,128 output tokens. Estimated off-peak cost from the official verified rates: $0.161143312;
account debit was not separately queried. Persistent worst-case reserved budget is $2.01215388,
including the initial pre-upstream rejection; no reservation was refunded. Nineteen counted broker
attempts remain below the original 30-call ceiling, and the total budget remains $20.

Blocking result: the model repeatedly emits semantic `date` while the taxonomy requires
`date_or_period`; plan normalization requires clarification, then its simultaneous availability
tool call fails `conversation_tool_plan_mismatch`. The canonical HTTP route returns503 before
tool execution. Reproduced locally using captured synthetic output without another paid request.
Do not weaken required-slot/identity checks or call this successful booking qualification.
Next implementation path is the existing planner/semantic contract owner, with captured-response
regression coverage, before another bounded live-model check.

Two completed dialogues truthfully reported no existing bookings and acknowledged stop; these do
not qualify actual move/cancel behavior against an existing appointment. Public staff-name redaction
was also observed and is a separate entity-resolution limitation, not a production change here.

Evidence: task-3/pilot-evidence/final-pilot-summary.json and final-evidence.tar.gz. Paid permit is
closed, writer lock absent, all pilot processes stopped. Production PID21721 and release
20260929-recon-fix-eb43bc22 remained unchanged. No production deploy, real CRM effects or notifications.


## Semantic contract repair candidate (2026-10-05)

Separate branch `codex/maya-chat-semantic-contract-20261005`, based on
`3a5388aafc3fc9cb19024e7430e82c0001ac3d66`; stable guest backend remains
`dcba8c8f4d230de31fb93f3d613f7524c3310df9`. The original six cases and corpus
are unchanged. Eight raw synthetic DeepSeek responses are immutable parser fixtures.

The taxonomy's declared slots now publish finite aliases in the planner contract.
Normalization accepts date/period only when the selected intent declares date_or_period,
and service only when it declares services. Conflicting, missing and invalid values
still refuse execution. Tool arguments, identity and Action Engine authority are unchanged.
No user-phrase routing, date invention, provider-name bypass or permissive catch was added.
The prompt/schema explicitly distinguish semantic slot names from tool argument names;
follow-up context uses canonical keys where unambiguous across all tasks.

The pilot runner now consumes canonical HTTP `user_turn.conversationId` rather than
nonexistent camelCase `userTurn`; it refuses missing correlation and retains the same
conversation across actual assistant replies. This makes repeat follow-up evidence useful.

Validation: 61 tests across four unit suites; one actual AppModule/auth/HTTP/PostgreSQL
regression using captured transport and actual parser/read owner; zero mutation executions.
TypeScript/script compilation, targeted lint and diff checks pass. The regression's second
response is explicitly constructed, so it is not live-model or live-provider evidence.
Server canned preflight then completed 18 original turns without a paid request.
Runtime patch archive SHA256: 8efbbd0164bcb66146a7f06aef5381287c54139f593755d327cdd968941c1680.

Live recheck uses the original ledger, unchanged $20/30-attempt cap and original proof
autostop; no production candidate promotion, deploy or real CRM writes. Its outcome is
recorded separately below after closing the paid permit.

### Bounded recheck outcome (22:07–22:10 Moscow)

Only original cases0 and2 were repeated: six new real model calls, six HTTP responses,
no contract mismatch. Same-intent follow-up kept services and moved today to tomorrow.
Business staff names still collapse to `[name removed]`, and labels were emitted in
provider-ID arguments; no availability result was confirmed. The cross-intent transition
to create at17:00 dropped the known date. Its final clarification said
“Подтверждаю запись ... Всё верно?” with no tool call or action receipt: misleading
confirmation wording is a quality failure, not a completed booking.

Overall semantic qualification remains NOT_PASSED. Do not promote this diagnostic as
booking acceptance or broaden the paid run merely because all six HTTP calls completed.
The additional six calls cost an estimated $0.062510712. Cumulative24 real DeepSeek calls
used375,689 input and5,627 output tokens (55,552 cache hit;320,137 cache miss), estimated
$0.223654024 at the previously verified off-peak rates. This is usage-based estimation,
not an account debit query. The original ledger now conservatively counts25 attempts
of30 and reserves$2.72331312 of$20; initial rejection remains counted/reserved.
No new dialogues were added to the original six-case set.

Permit closed and writer lock absent at19:10:14UTC; both recheck units inactive/PID0,
production PID21721 and proof DB PID152549 unchanged. TTL was not extended.
Evidence: task-3/pilot-evidence/semantic-final-summary.json and
semantic-final-evidence.tar.gz, SHA256
04508d420917c9711395e6376263a5d94e04facffebb53dfc79c099650b62f1c.

Next independent gaps: tenant-scoped business-reference resolution without exposing PII
or trusting arbitrary IDs; grounded slot transfer between availability/create intents;
evidence-bound confirmation language. Their fixes need regression coverage before any
further bounded live test. Original corpus, production service, CRM and notifications
remain unchanged.
