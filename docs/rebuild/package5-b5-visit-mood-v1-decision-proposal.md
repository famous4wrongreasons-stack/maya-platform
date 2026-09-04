# B5 — Client visit preference and CRM synchronization: decision proposal V1

Status: **OWNER DECISION APPROVED; implemented by B5/B6 final remediation**.
The latest owner decision supersedes proposed inherited constants below: no hidden three-hour Client default; inherit the existing approved effective policy. The historical options/table below retain their proposal provenance, not independent approval authority.
Accepted baseline: `225ba5e1`; production runtime `94543056`.
This is Package 5 final remediation, not another wave.

## Reconstructed behavior

`red` means the customer prefers quiet; `blue` means the customer welcomes
conversation. The authenticated legacy endpoint requires one provider record,
checks its phone against the legacy client, then performs three distinct effects:

1. Upsert the preference for that exact visit in SQLite `visit_mood`.
2. Remember it as `clients.default_visit_mood` for future visits.
3. Replace the corresponding marker in that CRM appointment's comment, preserving
   unrelated comment content. Live code directly PUTs; committed code calls the
   Package 1 bridge. Neither phone matching nor deployment compatibility proves
   canonical Client authority.

The app submits this after booking as best effort. Its success is not the
booking's success. Staff journal/client cards read the per-visit mood from Maya.
The UI also stores a device-local default. The SQLite default getter has no
production caller in the inspected committed Python code, so the stored default
must not be described as proven automatic application to every future visit.
Unselecting the UI pill prevents submission; it is not currently a server-side
revoke/reset command. The existing endpoint accepts only `red` or `blue`.

## Ownership reconstruction

- Business owner: **canonical Client**, independent of Maya User/account.
- Default preference: the Client-owned **CustomerProfile** aggregate under D2-A.
- Exact-visit choice: a **Client-owned per-Appointment preference**, distinct from
  the profile default. A later default change must not overwrite old visit choices.
- CRM: optional delivery/presentation destination for this Maya-authored choice;
  it is not the authority for the preference.

Existing CustomerProfile has locale, consent compatibility timestamps and
encrypted staff notes. It has no mood field. Existing Appointment has provider
notes/payload, but no Maya Client-owned mood slot. Encoding mood in notes,
providerPayload or ActionExecution input as its sole store would conflate owners.
The minimum additive storage proposal is in
`package5-b5-b6-client-preferences-schema-v1-proposal.md`.

## CRM decision to approve

**A — recommended: Maya-local visit preference in V1.** Store the default and
exact-visit choice canonically; show the latter to the assigned staff in Maya.
The mood command does not write CRM or promise CRM delivery. Remove the legacy
comment-sync fallback from this flow. No provider UNKNOWN/reconciliation is
needed for this local command; all existing Package 1 provider contracts remain.

**B — optional alternative: retain automatic CRM comment synchronization.**
The local preference is still authoritative and is not rolled back after a
provider problem. Use the existing approved A07 `crm.appointment.fields.v1`
boundary, with a durable child identity bound to the accepted preference
generation and exact tenant/provider/appointment. Show local saved state and
provider synchronization state separately. Verified Client/appointment authority
must be established before dispatch; never promote the legacy phone check or
borrow an owner's authority. UNKNOWN is not FAILED; no blind retry; reconcile
read-only through the existing same-execution contract. No direct Python PUT.
Choosing B requires the bounded durable local-to-provider handoff to be included
in its runtime contract before implementation; the current generic A07 executor
does not by itself prove this linkage.

A07 comment mutation and its provider-safe execution contract are **already
approved** in Package 1. No new CRM API operation is invented here. What is not
established by the approved B5 contract is a requirement to automatically sync
every Client mood choice, or the durable coupling of its local and provider
outcomes. Existing code and UI wording are implementation evidence, not approval.

```text
VISIT MOOD CANONICAL OWNER: CLIENT — CUSTOMERPROFILE DEFAULT + PER-APPOINTMENT CLIENT PREFERENCE
CRM SYNC REQUIRED: NO — NOT REQUIRED BY AN ESTABLISHED APPROVED B5 CONTRACT
CRM WRITE AUTHORITY ALREADY APPROVED: YES — GENERIC PACKAGE 1 A07 EXECUTION BOUNDARY ONLY
B5 AUTOMATIC CRM SYNC / DURABLE HANDOFF APPROVED: NO
RECOMMENDED V1: A — MAYA-LOCAL, NO CRM WRITE
OWNER DECISION STILL REQUIRED: YES
```

The NO for required sync is not authorization to silently remove existing UI
behavior. Option A is a proposal and needs approval before deployment.

## Proposed V1 local mutation contract (option A)

Authenticate PWA/Telegram → verified tenant/channel-qualified ClientChannelLink
→ exact active canonical Client → exact existing Appointment whose
`mayaClientId` equals that Client → canonical Action Ingress/Action Engine.
No caller `clientId`, phone match, bare `Client.userId`, implicit appointment
import or Client creation. Missing/ambiguous/broken binding and P02/P03 hold
fail closed. Reject another tenant/Client/branch target.

Proposed accepted scope: an existing upcoming, non-cancelled appointment before
its server-observed start time. Do not edit historical visit choices as a side
effect of profile configuration. This explicit prospective limit needs approval;
the legacy endpoint does not currently enforce it. Values remain `red`/`blue`;
no new reset/history-rewrite operation is included in V1.

The bounded command identifies one Client preference aggregate and one exact
owned appointment slot. In one local transaction, lock/revalidate that Client's
preference generation and appointment, then set the chosen per-visit value and
remember it as the default. No appointment time, price, attendance, provider
payload or staff-authored note changes. The extension must be versioned explicitly
at the canonical command boundary; do not silently widen the locale-only V1
normalizer or reopen accepted Wave 3 behavior.

Stable intent identity and expected generation are server-validated; duplicate
or restarted commands return the existing outcome. Competing updates from one
generation have one winner; stale requests reject. Same-state checks compare
both the default and exact visit value before admitting a mutation. Reads and
identical no-ops create no Client, profile, preference slot or applied mutation
fact. Use existing ActionExecution/ActionTargetMutation for durable execution
and immutable audit; do not add another receipt/journal model.

Current preference state is mutable only through the command; prior applied
generation/authority/before-after evidence remains immutable. Do not backfill
legacy choices by phone or fabricate historical preference decisions. Existing
CRM source facts and appointment snapshots remain owned by their original plane.

Approval of option A plus the linked exact schema/policy proposal permits the
existing B5/B6 remediation cycle to resume. No implementation, migration,
ratchet change or production mutation is included in this proposal checkpoint.
