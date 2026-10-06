# Explicit occupancy: HTTP/PostgreSQL and current carrier gate — prepared

Follow-up status: the parent subsequently assigned the slot and the actual two-process gate passed after a narrow C5 fingerprint boundary fix. See [executed result, all attempts and limitations](MAYA-EXPLICIT-OCCUPANCY-HTTP-PG-RESULT-20261006.md). The following records preparation at `13abc008`; its pending statements describe that earlier checkpoint.

2026-10-06. Preserves code checkpoint `480d61dc84e6b23bfb50e7bd53f04c011e4340be` on the isolated `codex/maya-explicit-occupancy-20261006` branch. **The HTTP/PostgreSQL gate has not run.** This checkpoint adds fixtures, a two-process driver, and light tests only. Parent assigns the heavy slot before execution. No production source, migration, schema, retention decision, background C10 initiator, or multiple-opportunity behavior changes.

## Prepared proof

`maya-saas-backend/test/widgets-live/c9-occupancy-restart.probe-spec.ts` uses the existing widgets-live HTTP harness: real AppModule, loopback HTTP listener, login, JWT/membership/entitlement guards, request tenant context, PostgreSQL, TimelineStore, C5 lifecycle runner/repository, CrmService/current-capacity reader, C9 admission/work/strategy/agents and persisted reply. It does not replace these owners. Its explicit `.probe-spec.ts` entry is outside the ordinary widgets-live aggregate; the driver selects it with the existing harness config and an exact test-regex override. A direct invocation without the required two-phase settings fails, never skips or substitutes an in-memory restart.

Fixture writes create one synthetic canceled CRM mirror row and one synthetic reconciliation event per tenant. The existing `OpportunityLifecycleRunner` is called once explicitly to persist the Opportunity and shadow AgentTask; its flag is turned off afterward. This exercises C5 persistence, not live WATCH ingestion. Only `CrmAdapterFactory.create` returns a synthetic read adapter. Its schedule is fixed fixture data; availability reads the isolated fixture database, including a later synthetic occupied row. Unknown adapter methods, model calls and in-process `fetch` fail. No YCLIENTS adapter or model provider is called; this is **synthetic source acceptance only**.

The driver requires a new output directory and creates a new private local PostgreSQL cluster on `127.0.0.1`, random non-default port and database name `maya_widget_gate_proof_c9occ_<random>`. The cluster uses a local synthetic test superuser for existing migrations and application connections; it is isolated proof infrastructure, not database-role hardening evidence. It drops inherited application credentials/DB settings, refuses backend `.env` files, deploys existing migrations, builds the test carrier bundle and runs one serial test file in two separate Node processes. After `prepare` exits it restarts its own PostgreSQL and starts `resume`; both the Node PID and PostgreSQL start timestamp must differ. It never reuses, truncates or stops a shared cluster. The script stops its own cluster on completion/failure and retains its private files for diagnosis. The private restart receipt contains synthetic login credentials, is mode 0600 outside the repository, and is not a publishable artifact.

Assertions prepared:

- One explicit owner request produces `AVAILABLE`, a coherent interval/timezone explanation, native Opportunity/AgentTask evidence, one SETTLED work receipt and one saved proposal version, bound to the tenant/owner.
- Same-ID replay before and after process/PG restart preserves run/revision/receipt and complete persisted graph digest, performs zero CRM reads, and clearly identifies the result as historical.
- A fresh process/login restores the latest saved reply through `/api/ai/conversation`. The original and replay replies remain in encrypted audit history; the current conversation exposes only the latest completion per user turn.
- A new explicit request after the fixture fills the slot yields `OCCUPIED` and `c9.no_action`; a separate historically seeded opportunity yields `EXPIRED` under the real PostgreSQL clock without clock or immutable-row tampering.
- A foreign tenant cannot read the first tenant's run. Suspended membership cannot replay the request or read the run; no new run or CRM read occurs.
- Appointment, Opportunity, AgentTask and DomainEvent snapshots remain unchanged across each chat request. ActionExecution, InboxItem, marketing campaign/recipient/delivery attempts, team messages, operational alerts and expense reminders stay empty. The existing write recorder also refuses business/delivery writes, including raw statements naming those tables. Source fixture changes are outside the measured request.

`maya-carrier-react/test/occupancy-probe.mjs` runs as a separate process. The current conversation runtime creates the actual HTTP request; the existing wire projectors receive the actual response/history; the same `ReplyText` component used by ChatScreen renders each assistant reply. The probe asserts one coherent assistant response, exact visible text, and no executable widget/control. Access tokens cross stdin only and are not printed. This is current runtime + React text **SSR** regression, not a complete browser mount, screenshot, accessibility or usability acceptance.

## Light verification executed

Seven serial Node tests pass: current runtime/React text from a clearly synthetic HTTP boundary, history restore, loopback-only probe target, strict non-thenable CRM edge, environment scrubbing, dedicated-database guard and ordered two-process/PG restart plan. The edge test catches Promise assimilation of `adapter.then`, while still refusing mutation methods. Changed TypeScript fixture/support ESLint and `git diff --check` pass. `node --check` passes for both executable scripts. The driver without `--run` only prints its usage and starts nothing.

Independent preparation review found and corrected history-version, canonical no-action-key and Proxy-then fixture errors, and expanded the no-business-write perimeter to existing outbound owners. The final reviewer found no remaining concrete blocking issue by static inspection; they ran no tests or SQL. Both TypeScript files also pass syntax transpilation (not semantic typecheck). These checks are not physical persistence evidence. No PostgreSQL, HTTP AppModule, real provider/model, aggregate gate or full backend typecheck ran for this follow-up.

## Commands

From the isolated checkout root, light checks (already executed):

```sh
node maya-carrier-react/test/build-harness.mjs
node --test maya-carrier-react/test/occupancy.test.mjs maya-saas-backend/scripts/c9-occupancy-proof.test.mjs
```

After parent assigns the heavy slot, from `maya-saas-backend`:

```sh
node scripts/c9-occupancy-proof.mjs --run --output=/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/c9-occupancy-http-pg-evidence --pg-bin=/opt/homebrew/opt/postgresql@16/bin
```

The output path must not already exist. Both local dependency sets are available via isolated-checkout symlinks to the read-only source's installed dependencies; no install/generate/network command is needed. The driver executes, serially:

```text
initdb → owned pg_ctl start → createdb → existing prisma migrate deploy
→ current carrier test bundle → Jest prepare → owned pg_ctl restart → Jest resume → owned pg_ctl stop
```

Each stage writes its own log. On success, inspect `prepare.json`, `resume.json`, `manifest.json` and logs. The two JSON reports include the actual HTTP/current-carrier observations, source qualification and zero-model-call count; the manifest records completed stages and owned cluster identity. Do not publish `private-restart.json` from the private cluster directory. Any failing SQL/DI/HTTP assertion is an exact blocker to physical-persistence acceptance and must be repaired/reviewed before claiming this gate passed. Passing this gate would still not establish real-model/YCLIENTS/browser acceptance or C10 completion.
