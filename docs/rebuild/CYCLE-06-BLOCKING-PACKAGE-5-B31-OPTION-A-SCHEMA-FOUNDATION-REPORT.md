# Package 5 B31 — approved Option A schema foundation

Owner accepted checkpoint `724d3ef6` and approved Option A, including the schema
implementation and gated production migration followed by B31 runtime work.
The [decision sheet](CYCLE-06-BLOCKING-PACKAGE-5-B31-IDEMPOTENCY-SCHEMA-DECISION-SHEET.md)
defines the approved fingerprint/owner; its earlier approval-pending status is
superseded by this explicit owner approval.

Implemented exactly one `ActionExecutionIdempotencyBinding` model (six scalar
columns) plus `bookingIntentContract`, `bookingIntentHash`, and
`bookingIntentEncrypted` on ActionExecution: **1 model / 9 columns / 0 new action
classes**. Migration: `20260906120000_b31_immutable_booking_idempotency`.
No Appointment column or historical fingerprint/binding backfill was added.

The composite caller key is tenant/operation-qualified; Client is an immutable
binding owner, with tenant-qualified Client and ActionExecution foreign keys.
A deferred constraint requires the first binding and execution to commit
together. Database triggers reject rebinding, another Client's alias on the
same execution, fingerprint/snapshot rewrite, individual identity deletion and
adding a fingerprint to a legacy execution. Existing execution claims and
UNKNOWN transition rules remain unchanged. Identity never expires merely
because the payload/audit deadline has elapsed; no cleanup worker was added.

[PostgreSQL evidence](evidence/package5-b31-option-a-schema-proof.json): **8/8
cases PASS**, including first/secondary caller-key conflict, 12 concurrent same
requests, concurrent changed requests with one loser rollback, tenant/Client
isolation, immutable guards, no fake backfill, missing-first-binding rollback,
and reconnect to the same UNKNOWN execution. UNKNOWN was reached through the
existing kernel claim/dispatch-boundary/finalization flow using synthetic
controlled fixtures. This is a schema transaction proof, not certification of
HTTP/AI runtime remediation.

Clean replay of **80 migrations PASS**; pending 0, structural drift NONE.
Prisma validate/generate PASS. Schema ratchet **3/3 PASS**. Application
typecheck, scripts typecheck and project lint **PASS**.

Production read-only preflight found the accepted B30 release
`20260906-p5-b30-ad1d91b9`, health/readiness 200/200. Production migration is
**not yet applied by this schema commit**. Next: expected-only migration set,
pre-apply drift NONE, bounded Prisma apply, pending 0/post-apply drift NONE,
read-only no-backfill proof and unchanged runtime release. Then continue the
authorized B31 runtime remediation without an intermediate STOP, unless a new
business/schema blocker appears.

Runtime remains the unaccepted local B31 candidate until its mandatory gates
pass. The full ordinary backend regression/build and runtime deployment gate
will run after that implementation. Production booking/provider mutations: 0.
Main dirty worktree and 17 pre-existing DBs untouched. Owned local synthetic
PostgreSQL is active only for this cycle and will be dropped/stopped at final
handoff. Package 5 remains incomplete; B29/B30 are not reopened; Wave 7 and
Chapter 7 are not started; Chapter 6 is not declared complete.
