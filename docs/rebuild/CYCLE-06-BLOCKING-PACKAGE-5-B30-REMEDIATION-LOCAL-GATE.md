# Package 5 — B30 local remediation gate

Handoff checkpoint **22c00d2d**. Isolated worktree `contour/b29-remediation` at `/tmp/maya-b29-contour`. The main dirty worktree was not modified.

## Remediation

`POST /api/appointments/:id/reschedule` is now an initiator only.

Authenticated account → one active versioned `maya_user` ClientChannelLink → exact canonical Client → `Appointment.mayaClientId + tenantId` → existing `crm.appointment.reschedule.v1` / `reschedule_appointment` → Action Engine.

- Missing, revoked, ambiguous, merged and wrong-tenant bindings fail closed before Action Engine ingress. No Appointment write and no ActionExecution.
- Client A cannot reschedule Client B's Appointment. Knowledge of the Appointment id is not authority.
- `Appointment.clientId`, `Client.userId` alone, phone and raw chat_id are not reschedule authority.
- A Client without Maya User is allowed through a verified `maya_user` binding.
- Internal-calendar reschedule uses the same capability; the executor writes local Appointment fields by `id + tenantId + mayaClientId` after `authorizationCheck`.
- CRM-backed reschedule reuses `executeRescheduleAppointmentWithReceipt`. Provider `UNKNOWN` still maps to HTTP 503 and does not reload/write the local row. Reconciliation remains Action Engine owned. Local CRM mirror catch-up moved into the existing reschedule plan dispatch/reconcile, not the HTTP route.
- Repeat/concurrent reschedules share one deterministic Action Engine identity. Invalid new time is rejected before ingress.
- AI `rescheduleOwnAppointment` uses the same initiator. B17/B18/B19/B25/B26/B29 surfaces were not rewritten.

No schema, model or new action class was added.

## Local gates

```text
TARGETED TESTS: PASS
APPOINTMENT / B17-B30 RATCHETS: PASS
LINT: PASS
TYPECHECK: PASS
TYPECHECK SCRIPTS: PASS
PRISMA VALIDATE: PASS
BUILD: PASS
MANDATORY BACKEND REGRESSION: PASS — 367 SUITES / 2990 TESTS
SCHEMA CHANGES: 0
MIGRATIONS APPLIED: 0
SYNTHETIC PG MISSING LINK: RESCHEDULE DENIED
SYNTHETIC PG REVOKED LINK: RESCHEDULE DENIED
SYNTHETIC PG CLIENT A / APPOINTMENT B: RESCHEDULE DENIED
SYNTHETIC PG OWNED INTERNAL RESCHEDULE: ACCEPTED THROUGH EXISTING ACTION
SYNTHETIC PG CLIENT WITHOUT MAYA USER: ACCEPTED THROUGH VERIFIED BINDING
SCHEMA DIFF: NONE
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES
PRE-EXISTING DATABASES TOUCHED: 0
```

HTTP create still uses the historical User-shaped input and was not certified by this cycle.

Next: fast-forward push to `origin/codex/maya-brain-systemic-release-20260815`, then canonical `deploy/vps/deploy.sh` with structural/read-only production verification only. No real reschedule or provider write for proof. After production PASS, restart Package 5 Final Adversarial Verification 13/13.
