# Personal history: live read passed; model acceptance incomplete

Date: 2026-10-12. Branch: `codex/maya-local-crm-setup-20261010`.
Live candidate: `6c13a04378c72d52cd78f253727139b1dc4a0010`.
Local qualification fix tested: `f5cf6a64` (full SHA in proof summary).
This is local acceptance after C9, not release certification or deployment.

## Executed live results

- One ordinary browser password login; secrets were entered by the owner only.
- Existing verified personal Client link and privacy consent remained valid; marketing consent false.
- Confirmed canonical A22 setting command returned 201; reread returned 200, revision 1, personal history enabled. This changed only the retained local database.
- Personal appointments endpoint returned exactly four visits matching the current verified Client's database rows. The other 158 salon rows were not returned. The retained journal has 162 rows; no second import or reconciliation run occurred.
- Three bounded public catalogue label reads occurred. No customer registry read or provider mutation.
- First AChat question returned 503 `ai_model_unavailable` before model transport. The second question was not sent. DeepSeek upstream attempts: zero; no private visit data reached the model.
- Owned launcher, runtime, broker and database were stopped. No open broker connections or requests at stop. Source stayed unchanged during the live run; retained private state remained on the Mac. Owned browser closed; temporary authentication/response references cleared.

This supersedes the earlier preparation-only status for local setting and private read. It does **not** establish successful live AChat answers.

## Exact local preparation defect and correction

The existing conversation contained a canonical `company.business_hours` plan.
C9 revalidated it against current authority/tools with empty entities/context and
no available business-hours tool. The local history-review guard admitted only
`booking.list_own`, so it refused this harmless prior intent before the broker.
Read-only diagnosis used the exact conversation returned by the canonical API;
no raw transcript, Client data, credentials or decrypted record was published.

The guard now also admits exactly this empty, revalidated prior public intent.
Unknown fields, entities, prose, other intents, dependencies, available tools,
private results, memory and prior assistant text remain refused. The available
tool remains solely `appointments.own.list`. No product prompt, permission,
authority, model deadline, budget, saved conversation or runtime behavior was
changed. Existing history was neither deleted nor rewritten to pass a test.

## Executed regression evidence

1. `8a216e63d825fcd00a72badd80c3d57a37bdc217`: new synthetic regression with the old guard reproduced the same 503 and `history_review_private_model_input_refused` after five passing setup/read checkpoints. Zero real external calls; disposable database stopped; source unchanged.
2. `f5cf6a64`: identical regression with the guard correction passed all 17 checkpoints. Full emitted AppModule, disposable PostgreSQL, current React and runtime participated. Three synthetic prior question/answer pairs were persisted through canonical typed/reply owners and restored in the browser. Both history questions then passed. The prior six transcript rows stayed byte-for-byte unchanged, and all five pairs restored in the same canonical conversation.
3. Planner inputs carried `company.business_hours` then `booking.list_own`; exactly two synthetic model calls, with no private tool result, remembered note or assistant history. Actual model interpretation remains synthetic.
4. 203 local history, ingress, launcher, admission, budget, broker, socket and credential tests passed; zero failures/skips. Public-context negatives cover identity/private slots, authority, extra tasks, arbitrary prose and context substitutions.
5. 12/12 local guard mutations killed, seven-test baseline and restored run green. Includes restoration of the original refusal and removal of public-context slot/tool/parent checks. This is not the global release mutation corpus.
6. Actual browser screenshot inspected: both deterministic synthetic history answers rendered. This checks behavior, not design acceptance. All synthetic resources closed; source unchanged.

See `live-result-summary.json`, `retained-context-proof-summary.json` and
`retained-context-receipt-manifest.json`. Real private receipts remain local;
repository evidence contains only selected safe aggregates and provenance hashes.

## Remaining boundary

The two live AChat answers using the approved external model are **NOT VERIFIED**.
Do not equate a synthetic model response with live model acceptance. No automatic
retry or renewal is authorized by this report. The original paid/read allowance
ends at 14:05:55 Moscow on 2026-10-12 and the consumed source-bound launch cannot
be reused after the tooling commit. No further manual owner attempt was requested
during diagnosis; no keys were retained for future use.

Unchanged exclusions: production/deploy/migrations/grants, repeat history import,
new Client binding, OTP/SMS/messages, YCLIENTS writes, iPhone, design changes, C10.
