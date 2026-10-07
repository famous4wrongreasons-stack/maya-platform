# Personal owner booking read boundary — qualified local checkpoint

At `f8e6f9d4`, an explicitly selected, verified personal context can preview a
booking and read its saved canonical outcome without changing the account's
owner role. Actual local HTTP proves successful creation once, natural UNKNOWN,
and preservation of both outcomes after application and PostgreSQL restart.
The unknown request is not dispatched a second time. This is backend evidence;
the owner's React booking entry is not implemented by this checkpoint.

## Existing owners and new projections

- `POST /api/personal-client/appointments/preview` uses the existing closed
  CreateAppointmentDto, PersonalClientContextService and
  ClientAppointmentCreateService.quoteForAccount. It checks the same live-booking
  admission as create, then revalidates context before returning. The projection
  contains selected service/staff labels, measured price/duration or null, exact
  start/timezone, source and read time. It carries no contact, Client/link, booking
  key or quote authority. An existing request is marked as such; availability
  describes the read, not a promise that a future create will succeed.
- `GET /api/personal-client/appointments/results` selects at most 20 recent
  canonical create executions, with explicit hasMore and a separate bounded
  pending-existence query. Tenant, current link, actual user and membership
  evidence constrain the query before pagination and the existing AE result
  reader. Client-principal executions intentionally have no actorUserId; the
  immutable personal evidence binds the actual owner. Only id, recorded time
  and canonical state are returned. No execution, retry or reconciliation occurs.
- Both require `x-maya-authority-context: personal_client` on the individual
  authenticated request. The existing create route, CLIENT_ROLES, C9 policy,
  session role and identity owners are unchanged. Selection is not authority:
  the server still requires the current verified link and current session and
  membership. Revocation during a read discards the response.

No schema, retention, background trigger, production activation, second C9 or
general capability framework was added.

## Actual evidence and limits

Fresh r7 uses AppModule/auth, current C9, the existing canonical create/AE,
PostgreSQL and a loopback provider that persists a test booking then destroys
the response socket. No real YCLIENTS adapter is instantiated. The fixture uses
a supported configured provider with a synthetic company and a substituted
local adapter; this is not provider acceptance.

The successful owner retains `tenant_owner`, one SUCCEEDED execution with one
attempt and one canonical appointment. The lost-response owner retains UNKNOWN,
one attempt, zero canonical appointments and exactly one provider ledger row.
A new application process and restarted PostgreSQL return those same outcomes.
Explicit HTTP replay reaches the existing idempotency owner: resume dispatches
zero requests and starts zero provider reconciliations. This proves backend
restart/idempotency, not a browser's treatment of an old confirmation button.

Canonical link revocation causes preview/results/create to return 403 without
changing AE/appointment state. A different tenant sees no result; foreign staff
and caller-supplied Client authority are refused. A synthetic account with one
Client row but no verified predecessor cannot issue an SB-1 successor challenge.
No first binding is fabricated.

Four complete serialized model bodies are intercepted before network I/O. Actual
chat first displays a nonempty private appointment with its service and time;
the next request carries that assistant reply. The outgoing model bodies contain
only user messages and no tested private service, branch, visit time, count,
contact name or account/link identifiers. The check repeats after app/PG restart
and link revocation. Suspended membership returns 401 with no additional model
request. These are scripted responses through the actual serializer, not real
model acceptance. No headers or credentials are archived.

Call-through Prisma observation reports zero model/raw writes inside the new
preview/results service scopes. Separate read intervals leave provider dispatch
and reconciliation counters unchanged. This claim does not cover create/replay:
those existing methods retain their existing audit/inbox/recovery behavior.
The synthetic internal fixture lacks canonical Staff notification lineage, and
its existing inbox publication fails closed; notification acceptance is not claimed.

Targeted units: 85/85 PASS. Production-only TypeScript at 4096 MB and scoped
ESLint, including the proof, pass. Full-project test/script types remain
unqualified. Independent code and r7 evidence review found no blocker within this
scope. All seven owned clusters were stopped and independently checked with
`pg_ctl status` (exit 3); HTTP and provider listeners closed. There is no owner
React/browser acceptance in this package. All attempts, including failures, are
[preserved with source hashes and review](evidence/maya-development-integration-20261006/personal-owner-http-restart/manifest.json).

r1 refused unsupported mock live booking; r2 lacked the synthetic companyId;
r3 lacked strict verifier configuration; r4 correctly refused the incomplete
branch source; r5 rejected a too-short synthetic revocation proof; r6 rejected an
invalid membership fixture enum. The final r7 includes the corrected fixtures
without weakening these production checks.

## Carrier entry and identity boundary

The [SB-1 integration contract](widget-release-programme/postdecision/INTEGRATION-AND-ACTIVATION.md)
permits a future carrier to explicitly select personal_client and call its
documented route. There is no existing fixed personal carrier port/receiver.
The existing fs.booking registry entry alone is not an implemented opener.

A proposed `LIMITATION(source=appointments.own.create) → NAVIGATE(fs.booking)`
from an owner's denied create cannot be admitted: [R3.9.6](MAYA-WIDGET-CONTRACT-V1.md)
and Gate6 reauthorize the retained source for the current principal. The denied
capability remains denied. A fabricated c9.no_action/run or unrelated permitted
read would be a false source and is not used.

An entry from an **actually completed appointments.own.list/SCHEDULE** is a
separate permitted implementation path for an already verified user. It still
needs a finite navigation template, current-context sealed child and fixed
transient receiver. The current PersonalScheduleAdapter also requires an eligible
appointment row, so an empty list is not yet a booking entry. No ad-hoc action
field, role switch, generic route handler or standalone launcher was added.

For revoked/unlinked identity, the [approved SB-1 JSON V2](widget-release-programme/sb1-v2/CONTRACT.md)
only proves a successor to the exact latest revoked episode. It cannot issue the
first link. The concrete context question is: **«У этого аккаунта раньше уже был
подтверждённый клиентский профиль MAYA, или это первая привязка?»** First binding
requires its own identity decision; no phone equality, User relation or synthetic
fixture can supply it. The denied/unlinked carrier entry also needs an honest
admitted source/entry contract, while the verified read work above remains usable.

No production identity, SMS, provider/model, deploy, push, merge, autonomy or C10
completion is claimed. Qualification remains **NOT_ISSUED**.
