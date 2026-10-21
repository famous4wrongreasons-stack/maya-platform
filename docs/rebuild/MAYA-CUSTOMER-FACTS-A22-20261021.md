# Explicit public customer facts through A22

This finite development slice implements the public knowledge work in
[the delivery plan](MAYA-DELIVERY-PLAN-20261010.md#незавершённые-функции-и-соединительные-задачи).
It adds no salon facts or production configuration. Real acceptance remains
`NOT_ISSUED`; this is separate from the 961fa196 phone test candidate.

## One source and publication authority

`TenantBusinessConfigurationRevision` remains the sole encrypted, immutable
source. The new `customer_facts` namespace is separate from `business_rules`.
There is no automatic migration, copying, fallback or audience conversion from
internal rules. The retired `AiKnowledgeSource` / `AiKnowledgeChunk` tables
remain unused, as required by [Maya Brain](../architecture/maya-brain-v1.md).

The existing `POST /api/governed-settings/tenant` is the writer. The caller
must be the current `tenant_owner` or `business_owner`, with
`confirmed: true`, a stable idempotency UUID, exact `expectedRevision` and
`previousRevisionId`. Existing A22 planning, execution, compare-and-swap,
Action Engine receipts and role rechecks remain in place. No public write tool
or alternate publication endpoint is introduced.

The PostgreSQL `R11_config_guard` independently requires the exact active
owner membership/user, matching non-dry-run ALLOW execution of
`update_tenant_business_configuration`, and the namespace predecessor.
Its deferred receipt requires SUCCEEDED and resolved reconciliation. The new
migration extends only the namespace CHECK, and refuses an unexpected prior
constraint. It does not change these guards or create rows.

## Finite content contract

The owner explicitly supplies exactly:

- `audience: "customer"`;
- `source: "tenant_owner_confirmed"`;
- `effectiveAt` and `expiresAt`: canonical UTC timestamps, with a nonempty
  interval; neither has an implicit default;
- `facts`: zero to 20 unique objects containing only `text`, normalized
  Unicode/whitespace, 8–500 characters per fact.

The source label is not self-issued authority: a read also verifies the
current same-tenant A22 row, contract/revision/content hash, actor and successful
canonical owner execution. The preserved database guard establishes the role
at publication; a later owner-role change does not silently erase a valid
publication. Current reader membership and tenant/user status are checked
independently on every read/replay.

The validator rejects known contact/identifier patterns, credential and
permission/security-override text, markup, unknown keys and duplicates.
These conservative text checks are not a general semantic PII classifier;
the owner must publish only non-personal public facts. Text never becomes
instructions, model input, booking policy, permission, consent or execution
authority. CRM profile, service, availability and price facts retain their
existing source owners.

This slice intentionally supplies no sample business configuration. A real
owner chooses the actual facts and validity interval through the existing
confirmed writer. An empty latest revision withdraws publication. Expiry is a
read-validity boundary, not a new retention rule: existing A22 encrypted
revision/superseded-payload retention remains unchanged.

## Customer read and conversation

`company.customer-facts.read` accepts only an empty argument object. It is
available to current interactive tenant roles through the existing AI tool
policy and C9 `ADMIN` registration. Anonymous public access, a caller-selected
tenant/namespace and personal Client authority are not introduced.

`company.customer_facts` is the corresponding semantic intent. Current
AiCore uses a plain server-composed reply, labelled as an owner publication
and revision, without a raw JSON widget or a second model paraphrase. Internal
rules remain staff-only. Customer-facing errors expose no stored text,
internal namespace or writer/member identity.

Only the latest public revision is read. An absent/empty/future/expired
publication yields no facts and an explicit unconfirmed answer. A malformed,
foreign, unreadable or hash/receipt-mismatched source fails closed.
Effective time is inclusive and expiry exclusive.

The existing AI execution owner binds the current projection to read cache
identity. Same-key execution and C9 completed-read replay recheck current
membership, policy, revision and expiry; they cannot return old facts or
silently dispatch another read under a stale receipt. Changes during an
awaited execution/presentation are checked again. Restored historical chat is
not promoted to current source evidence.

## Verification and integration boundary

Focused tests exercise normal chat with scripted model selection, public
handler dispatch, current source reads, owner planner, exact role catalogue,
C9 registration and cached/replayed read refusals. No paid model or provider
effects are used.

`maya-saas-backend/test/customer-facts-schema.probe.py` starts a separate
small PostgreSQL cluster with Unix sockets only. It uses minimal synthetic FK
targets, the actual R11 guard/receipt SQL and the new migration. It verifies
namespace admission, owner/tenant/policy/dry-run/receipt refusals, current
predecessor, append-only protection and unchanged writer guard bytes.
Retention helper predicates in that fixture deny all claims; the retention
exception and a full application migration are not qualified by this probe.
It always stops its owned cluster and retains the proof SQL/result.

The separate `scripts/customer-facts-http-proof.mjs` now verifies the full
application path. From `maya-saas-backend/`, run with Node 22:

```sh
node scripts/customer-facts-http-proof.mjs --run --output=/absolute/new/proof-directory
```

This macOS proof requires PostgreSQL 16 in the existing Homebrew location,
Chrome, and the checkout's installed backend/React build dependencies. It
refuses existing output or backend environment files, creates an owned fresh
loopback PostgreSQL cluster, applies all 107 real migrations, builds the current
React carrier and starts the ordinary `AppModule` without replacing providers,
guards, Prisma, A22, C9 or source owners. Synthetic tenants/users and entitlement
fixtures are explicitly restricted to its owned proof database. They do not
constitute signed candidate admission. Only model selection is scripted; an
outbound-fetch trap and inherited OS network policy deny provider/model effects.

The real HTTP path signs in with passwords, publishes via the existing
confirmed A22 writer, checks every resulting owner/SUCCEEDED receipt, and reads
through the actual AI tool and ordinary chat endpoints. Controls cover absent
public source, private rules only, cross-tenant injection/read, non-owner write,
exact same-key and C9 deduplication, revision change, real wall-clock expiry of
the **same revision**, and revoked reader membership. Old direct source reads
return 409; ordinary C9 chat retains its existing 201 transport envelope with an
exact blocked reply and non-COMPLETED coordination, without old fact text or
internal source namespace. This is a source refusal, not a successful answer.

The browser signs in through the actual current React email/debug UI, waits
for authenticated history readiness, and displays the verified owner-labelled
fact followed by an expired/blocked answer. Exact DOM text, grounding and
absence of raw JSON widgets are asserted and screenshots retained. Existing
historical chat remains history, not current evidence. Chrome uses an ephemeral
profile, a non-forwarding external proxy and an exact page-request allowlist.
Its internal macOS sandbox cannot nest inside `sandbox-exec`; the owned browser
therefore uses `--no-sandbox` **inside the still-inherited OS loopback-only
network fence**. No real user browser profile or external page is opened.

The driver then really restarts PostgreSQL and starts a new AppModule process.
Persisted JWT/source/C9 identities still reject stale or revoked access; fresh
reads/chat return no expired facts. Appointment, marketing delivery and team
message counts remain zero. The owned cluster is stopped and the temporary
credential checkpoint removed in cleanup. Output retains exact proof sources,
hashes, migrations/Jest logs, phase controls and screenshots. The final scoped
proof passed both stages; this is not paid-model language acceptance, native
packaging, general retention qualification or the full certification programme.

Before integration/deployment: reconcile the changed C9 registry with that
candidate's admission profile and perform fresh candidate qualification. Existing signed
profiles and prior receipts do not admit this new capability. No server feature,
user database, real owner publication, production signature or phone build is
changed by this development commit.

## Planner integration budget

All existing intents, roles, tools, slots, machine policy fields, substantive
readiness notes and required null notes remain present. Equivalent explanatory
prose is shorter; no typed or wire contract shape is changed. A comparison
against 961fa196 checks the complete projection for all 15 roles after restoring
only the enumerated prose changes and removing the new D3 intent. Focused
regressions retain every note and intent boundary, and the actual provider
serializers round-trip the complete contract.

The existing 61,000-byte planner-contract budget and 98,304-byte serialized
provider-request budget are unchanged. The measured owner contract with the
existing budget fixture is 60,934 bytes, leaving only 66 bytes. Further intents
(such as the separate D2 work) require a fresh combined budget check; this slice
makes no claim that the combined candidate fits. No capability or constraint
may be dropped to make it fit.
