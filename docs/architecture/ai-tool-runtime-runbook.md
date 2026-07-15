# AI Tool Runtime Runbook

## Scope

The platform backend exposes a tenant-scoped tool runtime for Maya OS, Maya
Admin and Maya Consult. It does not give an LLM database, shell, generic HTTP,
CRM credentials or arbitrary tenant access. Native, web, Telegram and voice use
the same contracts.

Migration `20260715210000_ai_tool_runtime` adds durable approval and execution
records. Tool arguments and results are encrypted with `CRM_ENCRYPTION_KEY`;
audit rows contain only technical metadata.

## Endpoints

All routes require a bearer session and an authenticated tenant membership:

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/ai/tools?surface=web` | List tools allowed for the current role, plan and channel |
| `POST` | `/api/ai/tools/:toolName/execute` | Execute a read or create an immutable approval request |
| `GET` | `/api/ai/approvals?surface=web` | List approvals visible to the requester or required approver |
| `POST` | `/api/ai/approvals/:id/approve` | Approve the exact `payload_hash` and execute once |
| `POST` | `/api/ai/approvals/:id/reject` | Reject the exact `payload_hash` without execution |

Supported surfaces are `native`, `web`, `telegram` and `voice`. A write request
must include a UUID `idempotencyKey`. Reusing that key with another actor,
surface, tool or payload fails closed.

## Registry

| Tool | Roles | Risk | Approval |
|---|---|---|---|
| `catalog.services.read` | customer, staff, business | read | none |
| `appointments.own.list` | customer | read | none |
| `loyalty.own.read` | customer | read | none |
| `analytics.employee.read` | provider/employee/staff | read | none |
| `analytics.business.read` | owner/admin/manager/accountant | read | none |
| `expenses.read` | owner/admin/manager/accountant | read | none |
| `customers.count` | owner/admin/manager/accountant | read | none |
| `appointments.own.cancel` | customer | medium write | same customer |
| `loyalty.internal.adjust` | owner/admin | high write | tenant owner |

Every request is re-authorized at execution time against TenantContext, current
user status, role, AI profile entitlement and domain feature entitlement. A
model cannot supply a tenant ID. External CRM loyalty remains read-only.

## Output minimization

- Appointment output omits customer contacts, notes and provider payloads.
- Expense output omits encrypted/free-text notes.
- Customer analytics exposes a count, not a customer list.
- Loyalty output contains the authoritative balance and sync state only.
- Approval previews use internal entity IDs and reject phone/email content in
  free-text reasons.

## Approval lifecycle

1. The validated payload is hashed together with tool, actor and surface.
2. Arguments are encrypted and a safe preview is returned to the UI.
3. Pending approvals expire after ten minutes.
4. The actor confirms a cancellation; an owner confirms a high-risk loyalty
   adjustment.
5. The backend verifies the unchanged hash, role, entitlement and requester
   status again.
6. One execution row claims the idempotency key and stores the encrypted result.
7. A completed replay returns the original result; ambiguous failures are never
   retried automatically.

## Maintenance

Dry-run is the default:

```bash
cd maya-saas-backend
npm run ai:maintenance
npm run ai:maintenance -- --execute --batch-size 1000
```

The command uses a PostgreSQL advisory lock, expires pending approvals, marks
stale/ambiguous executions failed and removes old encrypted payloads in bounded
batches. It never prints payloads. Configure:

```env
AI_TOOL_RETENTION_DAYS="30"
AI_TOOL_STALE_EXECUTION_MINUTES="15"
```

Run dry-run daily and `--execute` from one controlled maintenance job after
reviewing aggregate counts.

## Release gates

Before staging or production:

```bash
npm run release:preflight -- --env .env.staging --skip-db
npm run release:preflight
```

The first command validates an environment file before containers start. The
second runs inside the backend environment and verifies PostgreSQL plus every
local Prisma migration. Neither command prints secret values.

Any cross-tenant test failure, unfinished migration, stale execution spike or
approval policy regression blocks release. Do not recover an ambiguous write by
manually changing an execution row; reconcile the domain source first.
