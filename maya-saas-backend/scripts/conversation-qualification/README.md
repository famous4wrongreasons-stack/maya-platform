# Bounded conversation pilot

Offline replay and budget mechanics, not a completed live runner or a language-quality score.
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
still match the provider at dispatch. Existing ledger causes fail-closed restart; no resume or
remaining-budget inference is implemented. Never start a second ledger as a budget reset.

`http-dry-run.ts` boots the canonical AppModule/auth HTTP pipeline against the guarded local
proof DB and feeds canned DeepSeek responses through the real model parser and budget gate.
After parent clarified that the pause concerned paid/server execution, the same local-only run
was explicitly admitted and completed: 36 provider attempts, zero actual paid requests,
`replayed_ungraded`, qualification `not_evaluated`. Evidence:
`/tmp/maya-http-pilot-resume-20261005-a/` and `/tmp/maya-http-pilot-resume.log`.
It admits no inherited provider key and has no live mode. This is HTTP/parser proof with canned
transport, not real-model or YCLIENTS acceptance. Isolated paid/server setup remains separately blocked.

Before live execution, the dedicated adapter must use the canonical authenticated HTTP route in
an isolated synthetic tenant/DB and wrap every actual model fetch (including retries) in this gate.
Keep the existing widgets-live credential refusal unchanged. The live profile must deny all other
outbound effects and prove its CRM/notification/payment boundaries before receiving inherited
server-side credentials. Never copy/log credentials on the Mac. A fixture adapter, mock model,
internal calendar, or passing replay report does not establish real-model/provider acceptance.

Remaining live-run dependencies: verified isolated server runner/DB, inherited secret injection,
whole-transport interception and HTTP adapter, synthetic fixture coverage and an outcome review
rubric. The offline executable deliberately has no live switch. Pilot results diagnose client
booking; they do not establish 99% acceptance or 1000-salon capacity.

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
Do not resume through a fresh ledger or restart the broker to reset its cap. Payload compatibility
must be resolved with the setup owner and the original reservation preserved before another run.
