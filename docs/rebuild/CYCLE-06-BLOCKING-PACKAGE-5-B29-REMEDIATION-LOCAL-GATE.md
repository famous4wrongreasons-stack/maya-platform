# Package 5 — B29 local remediation gate

Handoff checkpoint **01f6d909**. Isolated worktree `contour/b29-remediation` at `/tmp/maya-b29-contour`. The main dirty worktree was not modified.

## Remediation

`POST /api/appointments/:id/cancel` is now an initiator only.

Authenticated account → one active versioned `maya_user` ClientChannelLink → exact canonical Client → `Appointment.mayaClientId + tenantId` → existing `crm.appointment.cancel.v1` / `cancel_appointment` → Action Engine.

- Missing, revoked, ambiguous, merged and wrong-tenant bindings fail closed before Action Engine ingress. No Appointment write and no ActionExecution.
- Client A cannot cancel Client B's Appointment. Knowledge of the Appointment id is not authority.
- `Appointment.clientId`, `Client.userId` alone, phone and raw chat_id are not cancel authority.
- A Client without Maya User is allowed through a verified `maya_user` binding.
- Internal-calendar cancel uses the same capability; the executor writes `Appointment.status` by `id + tenantId + mayaClientId` after `authorizationCheck`.
- CRM-backed cancel reuses `executeCancelAppointmentWithReceipt`. Provider `UNKNOWN` still maps to HTTP 503 and does not reload/write the local row. Reconciliation and `already_gone` remain Action Engine owned. Local CRM mirror catch-up moved into the existing cancel plan dispatch/reconcile, not the HTTP route.
- Repeat/concurrent cancels share one deterministic Action Engine identity. Already-cancelled future appointments are idempotent through the executor rather than a User-association `updateForClient`.
- AI `cancelOwnAppointment` uses the same initiator. B17/B18/B19/B25/B26 surfaces were not rewritten.

No schema, model or new action class was added.

## Local gates

```text
TARGETED TESTS: PASS
APPOINTMENT / B17-B29 RATCHETS: PASS
LINT: PASS
TYPECHECK: PASS
TYPECHECK SCRIPTS: PASS
PRISMA VALIDATE: PASS
BUILD: PASS
MANDATORY BACKEND REGRESSION: PASS — 365 SUITES / 2970 TESTS
SCHEMA CHANGES: 0
MIGRATIONS APPLIED: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES
PRE-EXISTING DATABASES TOUCHED: 0
```

Create/reschedule HTTP methods still use the historical User-shaped input and were not certified by this cycle.

Next: fast-forward push to `origin/codex/maya-brain-systemic-release-20260815`, then canonical `deploy/vps/deploy.sh` with structural/read-only production verification only. No real cancellation or provider write for proof. After production PASS, restart Package 5 Final Adversarial Verification 13/13.
