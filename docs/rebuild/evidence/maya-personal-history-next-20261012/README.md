# Next personal-history acceptance — current facts and scope decision

Date: 2026-10-12, Europe/Moscow. Branch:
`codex/maya-local-crm-setup-20261010`.
Executed checkpoint: `0ae634f1c745ebac8d376ada4ef50d65efe52f0b`.
No product, runtime, schema, carrier or authentication source changed in this pass.

## What is already verified

The preceding [live binding report](../maya-owner-telegram-batch-20261012/live-fixed-binding-summary.json)
proves the owner's real Telegram login and exactly one personal Client link in
the retained local database. It does not prove that appointment history was
imported. That database remained stopped and untouched during this new pass.

A fresh synthetic run on the checkpoint above passed **132/132 tests**, zero
failures/skips: 92 Telegram/history/browser cases, 21 local admission cases and
19 successor cases. The actual React/runtime and HTTP relay browser scenarios
passed 14 checkpoints for CLIENT and 19 for TENANT_OWNER, contained within the
132 tests. Both use the existing reconciliation owner explicitly, then ask for
past visits, the last confirmed visit and upcoming appointments. Re-login
restores exactly three message pairs. Foreign records, private notes and
contacts are not disclosed; prior private results do not enter the external
model's request. Telegram, CRM and model responses are synthetic.

Both browsers/listeners and disposable PostgreSQL stopped; source hashes stayed
unchanged. This is not release certification, live-model acceptance or a
qualified history-import operator path. See `proof-summary.json` and the local
receipt hashes in `receipt-manifest.json`.

## Actual canonical owners and the remaining gap

- `TelegramClientBindingService` establishes Client identity; login does not
  import appointment history or enable a history setting/consent.
- `AppointmentReconciliationService.run` owns journal synchronization under the
  existing lease, observation/change services and completeness rules. Its input
  binds a tenant and a time interval; it has no exact-Client filter.
- `CrmService.getJournal` and `YclientsCrmAdapter.getJournal` read the selected
  company's journal, including other clients in that interval. This also reads
  staff and service labels. The journal is not a single-card request.
- `ClientAppointmentReadService` subsequently rereads the verified link and
  queries exact `tenantId + mayaClientId` in a database-enforced read-only
  transaction. It does not synchronize from GET, login or chat.
- Existing governed settings own `client_self_visit_history` through a
  confirmed, authenticated revision/CAS command. Existing Client consent is
  separate; neither is implied by identity binding.
- AChat already presents the saved history through `appointments.own.list` and
  the server-owned personal-history formatter. It reports limited synchronized
  coverage rather than claiming an all-time complete history.

The all-tenant `appointment-reconciliation-run.ts` CLI is **not** a substitute
for an exact retained-owner launch. The bounded Telegram batch explicitly
refuses journal import, consent/settings mutation, chat/model calls and business
writes. Do not widen that consumed allowance or bypass it with direct SQL.

There is a legacy `getClientAppointments(phone)` adapter path, but it resolves
by phone and does not provide the same journal completeness contract. Existing
architecture checks exclude that path from canonical personal reads. It is not
an approved shortcut for Option B below.

## H-1 — Choose the data boundary before implementation/live admission

The owner's previous real allowance explicitly excluded history import. The
new instruction to continue authorizes independent local preparation; it does
not select between importing other clients' journal rows and a new exact-Client
source contract. No real journal request or retained-state write occurred here.

### Option A — Existing salon-journal synchronization (recommended)

Prepare a separately bounded local operator pass through the existing owner:
the same exact tenant/company and one fixed 14-day interval (seven calendar
days before the selected day and seven beginning on that day, in the canonical
branch/tenant timezone). Pin the actual dates before execution.

The pass may receive and locally synchronize **all clients' appointments** in
that interval, including provider IDs, names/contact fields, appointment times,
staff, services, attendance/status, amounts and notes carried by the provider.
The private reader exposes only the current verified Client's projection.
Raw provider/client data must not enter logs, repository evidence or a model.

Proposed execution limits: one non-renewing local window of at most 30 minutes,
one reconciliation invocation, at most 25 journal pages of 200 rows (5,000 rows),
with a separate finite catalogue/request/response budget verified before live
admission. Oversized, truncated, revoked or changed-source results must remain
explicitly incomplete/refused. No blanket all-time history claim or deletion
based on absence. Local projections/events may be written by existing owners;
outbound consumers, provider mutations and messaging remain disabled.

This option preserves the canonical synchronization model. It requires a tested
finite operator launcher and an explicit real-data allowance before execution.
Approval of scope alone does not mean the launcher already exists or is ready.
No new schema or presentation work is proposed.

### Option B — Only the exact personal Client's source records

Keep other customers' journal rows outside this acceptance scope. First define
and prove a distinct bounded source-selection/coverage contract using the
verified Client's server-resolved CRM identity, never a caller-selected Client
or phone lookup. Reuse canonical observation/change owners; do not disguise a
partial Client feed as a complete salon reconciliation or establish a global
baseline from it. This is additional implementation/contract work, not an
existing proven switch. Persistence needs, if any, must be decided separately.

### Common unchanged boundaries

No production, grants, provider create/reschedule/cancel, OTP/SMS, outgoing
messages, iPhone or C10. No automatic marketing consent. History setting and
privacy consent, if needed, must use existing owners and be named in the final
live allowance. Real model routing/cost requires its own explicit bounded
allowance; today's synthetic proof is not that allowance.

**H-1: OWNER SCOPE CHOICE PENDING.**
**READY FOR REAL HISTORY IMPORT: NO.**
**PRODUCT HISTORY PATH ON SYNTHETIC DATA: PASS.**

## Subsequent owner decision and preparation — 2026-10-12

The owner subsequently selected **H-1 Option A**, the existing salon journal for
14 days. This supersedes only the scope-choice-pending status above; the
question explicitly authorized preparation and did not authorize real reading.

The [bounded local operator implementation and fresh proofs](../maya-owner-history-14d-20261012/README.md)
are now complete on source checkpoint `f3a1992a7819788d7dfad66f7ea1b194f34670ff`:
146 unit checks, 15 killed mutations, 15 compiled HTTP/PG/IPC checks and 16
existing-batch compatibility checks passed. The retained owner database remained
stopped. No product/schema/carrier source changed.

**H-1: OPTION A SELECTED; LOCAL PREPARATION PASS.**
**READY TO REQUEST ONE REAL LOCAL EXECUTION ALLOWANCE: YES.**
**REAL HISTORY IMPORT: NOT AUTHORIZED / NOT EXECUTED.**

## Subsequent authorized local execution — 2026-10-12

The owner later approved and ran the bounded H-1 journal session. It completed
one import of 162 appointments; a read-only aggregate found four belonging to
the current verified personal Client. Own privacy consent was saved with
marketing false. The actual personal-history GET returned 500 and governed
configuration returned 403 for the `trial` salon; live AChat acceptance was not
performed. The local runtime and retained database were stopped cleanly.

[The live result and synthetic correction](../maya-owner-history-14d-20261012/LIVE-RESULT.md)
preserve the exact executed candidate, receipt hashes, proven catalogue-refresh
defect and correction, and the separate H-2 trial-configuration decision. This
supersedes the earlier no-execution status only; it is not release certification
or authority to repeat the consumed import.
