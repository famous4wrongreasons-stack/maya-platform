# Own staff schedule: local functional checkpoint

An employee asking «Я завтра работаю?» now receives the current CRM shift or an
explicitly confirmed day off, with its date and YClients attribution. A follow-up
«А послезавтра?» reads that new day again. Missing staff linkage gets a useful
explanation; incomplete or contradictory data is never presented as a day off.

Code: `4a05b45ac132d0d867b9b15c955f68573e010657`, from clean development
checkpoint `a1721df6d67da3da3f3d7e972287bb3069ad0d12`, in the isolated
`codex/maya-development-integration-20261006` branch.

## Existing owners and the observed gap

`staff.schedule.own.read` was already an approved READ in the runtime and C9
OCCUPANCY registry. The handler already resolved the active CRM staff link by
current tenant and account. Unlike the team schedule, its result did not have a
server-composed chat reply and went back to the model. The owner Client audience
filter also omitted this staff-only read.

The change uses the same AiCore → C9 conversationRead → runtime/policy → handler
→ CrmService → YClients adapter path. No new capability, endpoint, orchestrator,
agent, schema, retention rule or authority was introduced. Existing C9 receipt and
timeline owners remain responsible for persisted conversations. A focused real-C9
unit test verifies the registered READ and source receipt without fabricated C7
context or an agents-answer call; persistence/restart over HTTP/PG was not rerun.

## Behavior and boundaries

- Current role/audience and tenant checks still run. The handler rechecks the
  active staff link on every read; no caller-supplied colleague ID is admitted.
- The existing schedule command owner's calendar logic binds one date from the
  latest user turn in the business timezone before tool execution. Supported
  forms are today, tomorrow, day after tomorrow, ISO date and numeric day/month
  with an optional two- or four-digit year. An explicit year is preserved, even
  for a past date. Raw text is used only for local date extraction because PII
  sanitization may redact a numeric date; external model input is unchanged.
- Missing, invalid, ambiguous, corrected or range date expressions request
  clarification. This is a bounded single-day path, not general language/date
  acceptance; weekday or named-month requests require a supported explicit date.
- The adapter rejects missing/duplicate date rows, incomplete intervals,
  missing work status and contradictory status/slots. Explicit Boolean or 0/1
  provider status remains supported. Schedule preview/verification uses that
  same stricter reader; no mutation dispatch or recovery behavior was added.
- The reply checks source verification, date, freshness, interval validity and
  work status. Its original slot count is checked before sanitizer truncation.
  More than 200 intervals blocks a complete-schedule claim.
- A successful read produces one server reply and no second model call. No
  schedule/customer/booking mutation or outbound notification is added.

## Executed local evidence

[Evidence manifest](evidence/maya-development-integration-20261006/own-schedule-read/manifest.json)
pins the code files and raw test output. The initial 12 focused reproductions
failed before the implementation; final six full targeted suites pass **279/279**,
with no skipped tests. These are local scripted model and synthetic CRM fixtures:

| Suite | Tests |
| --- | ---: |
| AiCoreService | 118 |
| YClients adapter | 72 |
| AiToolHandler | 38 |
| StaffScheduleCommand | 35 |
| C9 conversation reads | 9 |
| AiToolPolicy | 7 |

Regressions cover working/off days; short follow-up; incorrect model-selected
date; Moscow/Los Angeles midnight; invalid/corrected/range dates; absent and
revoked linkage; foreign tenant; Client/customer refusal; injected colleague ID;
partial/contradictory provider data; stale/wrong-source/wrong-date data; oversized
source; no final model call and no action output. The layers use their actual
owners with mocked I/O; this is not a single HTTP end-to-end receipt.

Backend `tsc --noEmit --project tsconfig.build.json --incremental false` passes.
Scoped lint passes with two unchanged unsafe-argument warnings at lines 76 in
the existing AiCore test. Independent read-only review found and then confirmed
closure of source completeness, date binding and truncation issues; its exact
final response is archived with the evidence. The final lint fix was test
formatting only, after the final cohort; runtime bytes did not change.

Reproduce from `maya-saas-backend` using the already archived local launcher:

```sh
node ../docs/rebuild/widget-release-programme/development-v14/parked-local-launch.cjs node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/ai-tools/ai-core.service.spec.ts src/ai-tools/ai-tool-handler.service.spec.ts src/ai-tools/ai-tool-policy.service.spec.ts src/orchestration/c9.conversation-reads.spec.ts src/ai-tools/staff-schedule-command.service.spec.ts src/crm/adapters/yclients-crm.adapter.spec.ts
node ../docs/rebuild/widget-release-programme/development-v14/parked-local-launch.cjs node node_modules/typescript/bin/tsc --noEmit --project tsconfig.build.json --incremental false
```

## Remaining qualification

The model still selects the approved tool. The scripted two-turn proof does not
establish natural-language generalization or real-model acceptance. Real model,
YClients, production, phone, browser, HTTP/PG and full mutation qualification were
not run. No services were started. Website/booking work and the parent's UNKNOWN
provider tests were not touched.

The V1.4 qualification campaign stays parked. Prior evidence is retained at its
original code pins; this checkpoint does not promote it. Certificate stays
**NOT_ISSUED**. MONEY/FK/HANDOFF decisions, schedule mutation availability, C10
background authority and production authorization remain unchanged. Further
HTTP/PG/browser/build gates require the parent's resource coordination; there is
no remaining blocker to this bounded local code checkpoint.
