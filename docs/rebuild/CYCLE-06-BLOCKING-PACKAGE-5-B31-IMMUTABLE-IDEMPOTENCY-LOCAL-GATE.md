# Package 5 B31 — approved Option A runtime gate

Owner approval: decision checkpoint `724d3ef6`. Schema foundation `05ea5c25`
and production schema PASS `25119d99` precede this runtime. The applied
migration is unchanged. No further model, persisted column or action class is
introduced by this runtime change.

## Resulting boundary

HTTP `POST /api/appointments` and AI `createOwnAppointment` use the same
verified Client creator and common scope `appointments.client.create.v1`.
The existing `maya_user` ClientChannelLink resolver selects the exact
tenant-qualified Client; optional Client.userId is contact data, never
ownership authority. Missing/revoked/wrong-context authority fails before
ActionExecution creation. Internal and CRM calendars use the existing
`crm.appointment.create.v1` / `create_appointment` Action Engine flow.
The canonical executor persists `Appointment.mayaClientId + tenantId`.
No route/AI Appointment write, provider write or legacy fallback was added.

The kernel normalizes the registered create input and fingerprints only the
approved `maya.client-appointment-create-intent/1` descriptor with the existing
versioned HMAC facility. Inputs are tenant, canonical Client, canonical calendar
source/provider/company, branch, staff, sorted unique services, UTC start,
explicit duration or null, normalized contact/notes and the fixed Client create
options. Transport ordering, actor/link evidence, timestamps, headers and
current catalog labels/prices/buffers do not enter this intent fingerprint.
Timezone is encrypted resolution context; it is not a second intent hash.

First execution plus first binding commit atomically. Every accepted secondary
key is inserted against that execution in the same canonical ingress
transaction. A unique-race loser retries the transaction and rereads its
winner. Same identity with a changed Client or business descriptor raises
`IDEMPOTENCY_CONFLICT`; no new execution/outcome/provider dispatch is created.
The database namespace is tenant + common scope + key HMAC, exactly as approved:
a forged tenant context is denied; a separately authenticated tenant has an
independent identity. Client is immutable on the binding and is deliberately
not an escape hatch in the unique key.

Different keys with the same logical create follow the existing action
identity/duplicate policy and are all durably bound. No new duplicate-booking
policy was introduced. A known historical caller identity without a provable
fingerprint fails closed; historical rows are never backfilled or upgraded.
The new foundation applies to new B31 creates after cutover.

Accepted encrypted defaults let retries reconstruct the original normalized
contact/timezone despite profile or catalog presentation changes. SUCCEEDED
restores the existing outcome. A committed READY execution survives process
restart. UNKNOWN stays on the same execution and the existing provider
reconciliation path; a changed request cannot escape it.

## Concurrency correction and proof

The initial PostgreSQL concurrent alias proof exposed connection-pool
contention: an alias INSERT locks its execution owner while the existing claim
policy check needs another connection. Identical local requests now wait
outside the connection pool. Each waiter still rechecks verified Client
authority and executes its own atomic canonical ingress, including alias
registration. It cannot return another caller's cached receipt or skip
authorization. Database constraints and claims, not this scheduling map, remain
the cross-process authority. The already-applied schema was not modified.

[Executable probe](evidence/package5-b31-immutable-idempotency.probe.cjs) and
[sanitized PostgreSQL result](evidence/package5-b31-immutable-idempotency.proof.json)
run compiled HTTP/AI services and the real kernel/Prisma against the owned
loopback PostgreSQL database. Catalog/calendar/provider I/O is synthetic;
live HTTP is forbidden. Cases include missing/revoked bindings, a Client
without a Maya User, exact ownership, HTTP/AI key parity, normalized equivalent
requests, every significant changed term, K1+A / K2+A / K2+B, 12 concurrent
same-key requests, concurrent changed intents, independent Node runtimes,
crash after binding commit before Appointment, restart, SUCCEEDED replay and
both resolved/unresolved provider UNKNOWN. All pass. Conflicts preserve the
binding and produce zero additional business outcomes/provider operations.

Ordinary tests cover authorization/ownership, canonical normalization,
immutable kernel decisions, alias rollback and queued authority revocation.
Permanent guards prohibit direct route/AI writes, alternate scopes, unbound
B31 ingress, non-kernel binding writes and raw-request fingerprinting.

## Mandatory gate

| Gate | Result |
| --- | --- |
| Final targeted tests | 6 suites / 68 tests PASS |
| Appointment/booking regressions | 33 suites / 317 tests PASS |
| Existing and new architectural guards | 84 suites / 483 tests PASS |
| Project lint | PASS after correcting type/test lint findings |
| Application and scripts typechecks | PASS / PASS |
| Build and compiled PostgreSQL executable proof | PASS / PASS |
| Prisma validate; migration status; structural diff | PASS; pending 0; drift NONE |
| Exact approved clean migration replay | 80 migrations PASS; no backfill |
| Full mandatory backend regression | 373 suites / 3046 tests PASS |

Production runtime deployment has not started at this local checkpoint.
The mandatory gate must be completely PASS before commit/push and the unchanged
documented deployment process. Afterwards: structural/read-only production
verification, then a fresh Package 5 Final Gate across all 13 families.

Package 5 remains incomplete. B29/B30 are unchanged. No Wave 7, Chapter 7 or
automatic Chapter 6 completion. The main dirty checkout and all 17 pre-existing
test databases are untouched. Owned test resources are recorded for final
cleanup; production business/provider mutations for proof: 0.
