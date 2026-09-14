# E2 / R04 — B42 contract and schema assessment

**R04 is ready for implementation over the existing approved foundation. No new owner decision, schema or action class is required.** This is Stage 1 assessment only; B42 remains unremediated and has no package-local or production PASS.

Source baseline: `b1a937fe4cb1a179cec315c0b49ec4e384e52161`, isolated worktree `/tmp/maya-b29-contour`. Scope is exactly R04/B42 in the [closed master inventory](../CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md), table rows B42/R04 and execution tranche E2, and [machine-readable master](package5-remainder-inventory-final.json). R02/B41 dependency is satisfied by the parent’s verified Wave R-A production PASS, release `20260907-p5-ra-d8049d47`. This assessment did not repeat production checks or reopen inventory.

```text
PACKAGE: R04
BLOCKERS INCLUDED: [B42]
CANONICAL OWNER: A23 OperationalWorkItem; A29/A31 fact/projection read boundaries
EXISTING FOUNDATION SUFFICIENT: YES
BUSINESS DECISION REQUIRED: NO
SCHEMA REQUIRED: NO
NEW MODELS: 0
NEW FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
RUNTIME-ONLY: YES
DEPENDENCIES SATISFIED: YES — R02/B41 production PASS
READY FOR IMPLEMENTATION: YES
READY FOR PRODUCTION: NO
```

## Approved owner and limits

The [Wave 1 contract](../CYCLE-06-BLOCKING-PACKAGE-5-WAVE-1-A22-A23-RUNTIME-CONTRACT-GATE.md), lines 33–71, already fixes canonical ingress, server-derived authority, exact target generation, ActionExecution and local executor. Operational task creation is immutable, binds one exact active tenant assignee and one creation execution; the sole task transition is `OPEN → COMPLETED`, performed only by the exact assignee. Existing A23 classes are `create_operational_task`, `complete_operational_task` and `request_administrator_contact`. Inbox is a separate projection. The [Wave 1 completion report](../CYCLE-06-BLOCKING-PACKAGE-5-WAVE-1-A22-A23-COMPLETION-REPORT.md) records their accepted runtime cutover.

Foundation sufficiency applies to these supported commands and retirement of unsupported legacy behavior. It does **not** authorize legacy cancel/reopen/reassign/postpone/start/blocked transitions, role-wide assignments, autonomous task creation, or arbitrary job execution. Such controls must fail closed or become read-only recommendations; they must not be disguised as an existing task command. This follows the master’s explicit “supported existing commands, no added autonomous permission” rule and requires no repeat approval.

The [Wave 5 contract](../CYCLE-06-BLOCKING-PACKAGE-5-WAVE-5-A29-A31-RUNTIME-CONTRACT-GATE.md), lines 15–34 and 42–77, separates authenticated immutable facts, deterministic projections and explicitly governed corrections. Its narrow recovery/CRM protocols do not authorize arbitrary owner-journal impact writes during a read.

## Exact implementation map and evidence

Line references below describe the assessed checkout; earlier master offsets remain historical evidence.

| Known B42 path | Current evidence | Bounded remediation |
| --- | --- | --- |
| Panel control create/update and staff task update | `ai администратор/webhook_server.py:2463`, `:2511`, `:2706`; `owner_ai.py:1626`, `:1714` | Reuse current R02 principal and existing A23 create/complete ingress. Require exact canonical assignee and current tenant; reject unsupported transitions and legacy task IDs without an existing canonical binding. |
| Legacy mutable owner journal | `ai администратор/database.py:3961`, INSERT `:3980`; UPDATEs `:4105`, `:4270`, `:4333`, `:4404` | Retire operational business writes to `owner_action_journal`; canonical work state comes from OperationalWorkItem and confirmed execution. Preserve historical rows without fabricated canonical links or backfill. |
| Nominal reads evaluate/write facts and perform DDL | `owner_ai.py:5976` (`command_center`), `:6807` (`daily_briefing`); `database.py:3918` (ensure/ALTER), `:4418` (list), `:4538`, `:4568`, `:4581` (evaluation/update) | Remove read-triggered evaluation and schema repair. Current work projections read canonical truth; any retained historical journal display is strictly read-only. Explicit `panel/action/evaluate` at `webhook_server.py:2331` cannot remain an ungoverned impact writer. |
| Model/scheduler autonomy | `owner_ai.py:5000`, `:5711`, `:5798`, `:5841`; `claude_ai.py:2503`, `:2512`, `:2521`, `:2530`, `:2544`, `:2561`; `webhook_server.py:10383` | Retire unsupported autonomous mutation entry points, model permissions/prompts and scheduled execution. R02 request authority must not become background authority. Read-only recommendations may remain. |
| Generic panel/chat job execution | `webhook_server.py:3376`, `:3454`, `:3489`, `:3550`, `:8287`, `:8838` | Remove generic registry-to-effect launch, process-local task/cooldown-as-command behavior and `__runjob` execution. Route only an exact already-supported owner command through its canonical initiator; otherwise fail closed. |
| Assignment fanout from the legacy owner | `webhook_server.py:2413`, `:2433`, `:2442`, `:2454` | Remove legacy journal assignment → team message/push/delivery-status writes. Existing A23 projection follows canonical outcome; do not create another assignment aggregate or direct delivery. |
| Active PWA initiators | `сайт и приложение/app.html:27091`, `:27153`, `:27181`, `:27247`, `:27281`, `:29549`, `:40509` | Align known deployed aliases with supported canonical commands and truthful read-only/unsupported responses using bounded publication overlays. No production changes in this assessment. |

Existing reusable backend components:

- `maya-saas-backend/src/package5-wave1/package5-wave1.service.ts:358`, `:404`, `:1010`, `:1034`: exact tenant/current actor/assignee planning; only canonical work-item create and locked one-time completion, with mutation fact.
- `maya-saas-backend/src/package5-wave1/package5-wave1-canonical-cutover.service.ts:144`, `:192`: normalized intent and `executeOrResume`; completion resolves exact tenant/actor Inbox projection to its canonical work item. Local integer journal IDs are not interchangeable with either canonical ID.
- The same cutover service at `:170` and `:231` projects only after canonical outcome. Its existing generic Inbox/APNS delivery remainder is **B49/R06**, not a new R04 blocker or a newly invented R04 dependency. Team conversation lifecycle is **B58/R12**. R04 removes its own legacy assignment source and does not claim either downstream package complete.
- `maya-saas-backend/src/ai-tools/ai-tool-handler.service.ts:1317`, `:1358`: existing A23 AI initiators. `ai администратор/canonical_staff_access.py:54` enforces current request/task authority; a child background task cannot inherit it as business permission.

## Package-local acceptance and permanent ratchet

Implementation must prove the following before its later coordinated cutover:

1. An authorized current tenant management actor creates one task for one exact active assignee through existing A23/Action Engine. Only that assignee completes `OPEN → COMPLETED`; management role alone cannot override this rule. Missing/revoked/wrong-tenant authority and forged assignee/role fail before admission or business writes.
2. Same canonical intent/key, including concurrent requests and restart, resumes the same execution/outcome; changed intent under the same identity conflicts. No cooldown timestamp or process task supplies durable command identity. Local PostgreSQL commit/rollback is authoritative: A23 itself has no provider `UNKNOWN`. A lost response resolves the same execution, not a newly launched job.
3. Unsupported transitions, generic role assignments, unmapped historical task IDs, model autonomy, scheduler/job triggers and chat job commands create no work item, ActionExecution, legacy journal write, message or provider effect.
4. Repeated command-center, daily-briefing, task/history and journal reads perform no evaluation writes, DDL, business admission or delivery. Current status is projected from canonical owner truth. Historical rows remain unchanged and never become fabricated canonical bindings.
5. Confirmed business commit precedes projection; projection failure cannot relabel the committed task as failed, recreate it or trigger a second outcome. No legacy assignment team-message/push path remains. This proof isolates R04 behavior and does not mark the separately inventoried B49/B58 fixes PASS.

Extend the existing `maya-saas-backend/src/action-engine/package5-wave1-bypass-ratchet.architecture.spec.ts:59`, `:72`, `:82`, `:91` with a permanent R04 guard in the normal backend architectural test run. Cover the known Python SQL writers and indirect calls, model tool declarations/prompts, read handlers, scheduler/job entry points and PWA/proxy command wiring. The guard must reject direct/indirect parallel work-owner mutation, read-time mutation/DDL and background effects without canonical admission; no blanket Python or legacy-directory exemption. Negative fixtures must demonstrate detection when each bypass class is reintroduced. Keep the existing canonical-executor-only TypeScript rule.

Future verification is package-local authorization/idempotency/read-purity/ratchet proof followed by the coordinated wave’s mandatory checks and documented cutover. Do not run a full Package 5 Final Gate here; it remains reserved for production PASS of all 14 packages.

```text
ASSESSMENT ONLY: YES
IMPLEMENTATION / RUNTIME / SCHEMA / MIGRATION / DEPLOYMENT CHANGES: 0
TESTS EXECUTED IN THIS ASSESSMENT: 0
DATABASE CONNECTIONS / PRODUCTION READS / PRODUCTION MUTATIONS / MESSAGES: 0 / 0 / 0 / 0
NEW BLOCKERS / INVENTORY REOPENINGS: 0 / 0
MAIN DIRTY WORKTREE / 17 OLD DATABASES: UNTOUCHED
PROCESS HYGIENE: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
```

Only this assessment document is authored by the R04 assessor. No staging, commit or push; parent consolidates the E2 report.
