# H-1 Option A — bounded local journal preparation

Date: 2026-10-12, Europe/Moscow. Branch: `codex/maya-local-crm-setup-20261010`.
Executed source checkpoint: `f3a1992a7819788d7dfad66f7ea1b194f34670ff`.
This is local operator qualification, **not release certification or live history acceptance**.

## Decision and scope

The owner selected Option A in the [H-1 decision](../maya-personal-history-next-20261012/README.md): prepare the existing salon journal for seven days before the selected day and seven days beginning on it. The question explicitly excluded real reading at this preparation stage. No live history execution permit has been issued and no real journal has been read.

Proposed day: **2026-10-12**. Proposed inclusive interval: **2026-10-05 through 2026-10-18**, in `Europe/Moscow`; the exclusive end is local midnight on October 19. The launcher must reread the actual selected branch and tenant reconciliation timezones before execution. A mismatch refuses the run; this report is not a fresh production timezone observation.

The approved preparation may synchronize all clients' appointments in that interval. It is not an exact-Client source filter. Provider identifiers, appointment times, staff/services, statuses, amounts, contacts and notes may be received locally. The canonical personal reader subsequently selects only the current verified Client and excludes foreign records and private notes/contacts from its returned projection. Raw rows must not enter evidence, logs, Git or a model.

## Implementation and provenance

Only the existing local operator scripts and their tests changed. No backend product source, schema, React AChat, headless runtime or iOS source changed relative to `d2f851fe194d092b5a5731d7036ec0f608866ea8`.

| Commit | Purpose |
| --- | --- |
| `213a039a` | One bounded owner-authorized journal execution through the retained-database launcher |
| `1485a7a7` | Cancellation qualification and valid canonical settings-command identity |
| `1afcb413` | Final completion fence and source verification at provider/completion boundaries |
| `f3a1992a` | Synthetic failure-phase diagnostics and explicit fixture-pool cleanup |

The operator mode reuses `AppointmentReconciliationService.run`, its lease, observation/change owners, completeness rules and existing persistence. It does not create an import HTTP endpoint. The parent sends one private IPC command after actual web readiness. Login, GET and chat cannot trigger reconciliation.

The immutable local plan binds exact committed source, retained-state hashes, prior restart receipt, tenant, user, branch, company, origin, dates, timezone and explicit execution approval. It contains no caller-selected Client authority. One non-renewing session is at most 30 minutes; one reconciliation is at most 4 minutes. Provider requests are GET only, pinned to the exact company and interval: at most 25 journal pages of 200 rows (5,000), 40 total finite journal/catalogue calls, 2 MiB per response and 16 MiB total. Catalogue responses are separately bounded at 2,000 rows. No client-registry query is needed.

The runtime rereads scope/permit before canonical row writes and before marking the reconciliation completed. Changed source, cancellation, expiry, duplicate execution, wrong company, out-of-window records and excess sizes fail closed. Restrictive writer wrappers remain installed until AppModule destruction, so cancellation cannot restore an unrestricted writer during an in-flight operation. Truncation is reported honestly and cannot authorize absence-based deletion.

The existing governed settings command alone owns `client_self_visit_history`; the existing Client consent command separately owns private-history consent. The local ingress permits only confirmed, revision/CAS-bound history enablement and privacy consent with marketing false. Both require explicit inclusion in the later real execution allowance. Product authentication, Client identity and booking authority are unchanged. Model, provider writes, SMS, messages and new identity binding remain refused.

## Fresh executed evidence

All receipts below identify the exact source checkpoint above. The later documentation-only commit must not be represented as an independently executed test HEAD.

| Surface | Result | Qualification |
| --- | --- | --- |
| History, Telegram, diagnostic, retained-resume and read-profile unit suites | **146 PASS / 0 FAIL / 0 SKIP** | Includes 35 history guard tests |
| History mutation programme | **15/15 killed** | Unmutated and restored baselines each 35/35 PASS; killed by assertions, not timeouts |
| Compiled AppModule + HTTP/PostgreSQL + actual child IPC/relay | **15/15 PASS** | Synthetic provider wire; actual child external provider network denied |
| Existing Telegram batch actual-child regression | **16/16 PASS** | Synthetic; zero provider dispatch |
| Retained real-state preparation | **PASS** | File/hashes only; real database remained stopped; no migrations |

The compiled proof exercises two distinct Clients, private-reader exclusion, canonical settings/consent, one-run replay/concurrency refusal, wrong owner, forbidden effects, out-of-window/overfilled records, cancellation between rows, expiry after the final row, nonprogressing pagination, permit revocation during a response and changed company. Its actual child receives the private history command and safely reports a failed import when external networking is denied. That expected negative receipt does **not** claim a live child import succeeded.

Both disposable PostgreSQL clusters and child process groups stopped; source bytes remained unchanged. Test-only migrations ran in disposable databases. **The retained owner database was not started or migrated.** The retained-state preflight checked original artifacts/restart receipt and absence of its running database PID without printing secrets or customer data.

The 200-record truncated-response proof completed reconciliation in **3,021 ms**. Earlier repeated whole-repository source hashing inside each row caused unnecessary overhead. Full source checks remain at admission, before and after provider exchanges and before canonical completion; per-row permit and database-scope checks remain. Timeouts were not increased. A mutation proves a changed source cannot expose a returned provider response.

See [proof-summary.json](proof-summary.json) for safe projections and [receipt-manifest.json](receipt-manifest.json) for local receipt hashes and changed-source hashes. Raw state, keys, plans, database dumps and customer records are not archived here.

## Exploratory failures and supersession

Earlier attempts are not silently substituted for the final receipts:

- HTTP proof `01`: fixture settings command used a non-UUID idempotency identity and correctly received 400; the test was corrected to the canonical UUID contract.
- Mutation attempt `01`: a simultaneous backend build removed the shared compiled output; final mutation/build runs were sequential.
- Mutation attempt `02`: a deliberately broken one-run guard exposed a held test promise; test cleanup now releases/awaits it in `finally`, without extending a timeout.
- HTTP proof `02`: 14 checks passed but was superseded by the final 15-check proof and completion-fence coverage.
- HTTP proof `03`: repeated synthetic AppModules exhausted fixture database pools. Each fixture now explicitly disconnects Prisma before close. The actual launcher already did so; no product change was required.
- Final HTTP proof `04` and final mutation/legacy receipts passed on `f3a1992a`.

## Remaining boundary

**H-1 SCOPE: OPTION A SELECTED.**
**LOCAL OPERATOR PREPARATION: PASS.**
**READY TO REQUEST ONE REAL LOCAL EXECUTION ALLOWANCE: YES.**
**REAL HISTORY IMPORT: NOT AUTHORIZED / NOT EXECUTED.**
**LIVE PERSONAL-HISTORY ACCEPTANCE: NOT EXECUTED.**
**RELEASE CERTIFICATION: NOT CLAIMED.**

The next step is the single concrete allowance described in [OPERATOR.md](OPERATOR.md). Real AChat/model responses, all-time history, production, provider booking changes and full product readiness are not proven by this preparation.
