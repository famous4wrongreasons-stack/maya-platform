# B5/B6 — minimal Client preference schema and local policy proposal V1

Status: **OWNER DECISION APPROVED; implemented by B5/B6 final remediation**.
The latest owner decision supersedes proposed inherited constants below: no hidden three-hour Client default; inherit the existing approved effective policy. The historical options/table below retain their proposal provenance, not independent approval authority.
Baseline: `225ba5e1`. No new wave, tenant creation flow or consent model.
This proposal assumes B5 option A (Maya-local) from the accompanying decision.

## Exact ownership and schema gap

B6 stores **Client-owned communication preferences**, an additional restriction
on communication policy. It is not a consent grant/revoke, tenant-wide reminder
policy, staff membership dashboard or delivery receipt. Switching a category on
cannot supply missing consent or override a tenant/system prohibition.

The live PostgreSQL catalog matches the relevant committed definitions:

- CustomerProfile is tenant/Client-qualified and supports optional User, but has
  no mood or notification preference fields.
- AppointmentNotificationSetting is unique by tenant and holds tenant-wide
  `enabled` / `leadTimesMinutes`; it cannot represent one guest Client.
- DashboardPreference requires membership/User and is a dashboard configuration.
- ClientConsentFact is append-only consent evidence, not notification tuning.
- Appointment notes/providerPayload are source/mirror fields, not a local
  Client preference store. Existing action/audit JSON is not a domain-store
  substitute. There is no equivalent durable Client preference model.

## Minimum additive fields: three, no new models

| Existing model | New field | Meaning |
| --- | --- | --- |
| CustomerProfile | `defaultVisitMood String?` | Explicit current Client default: `red`, `blue`, or null/unset |
| CustomerProfile | `notificationPreferencesJson Json?` | Exact versioned envelope of explicit Client preference overrides, separate from consent |
| Appointment | `clientVisitMood String?` | Explicit Maya Client choice for that appointment: `red`, `blue`, or null/unset |

No schema defaults populate these fields. Existing rows stay NULL. No data
migration/backfill, fake user, inferred link or historical decision is created.
Do not reuse legacy SQLite identifiers as canonical FK values.

Required database guards:

- Both mood fields allow only NULL / `red` / `blue`.
- Any non-NULL new CustomerProfile field requires non-NULL canonical `clientId`.
  Retain the existing composite Client FK, `(tenantId, clientId)` uniqueness and
  immutable established owner guard. Legacy user-only rows are not auto-linked.
- Non-NULL `Appointment.clientVisitMood` requires `mayaClientId`; its existing
  composite Client FK remains in force. Once a mood is established, the slot's
  tenant/Client/appointment identity cannot be silently reassigned. Provider
  ingestion may update its own columns but never write this local preference.
- Notification JSON must be an object with exactly `version: 1` and `overrides`.
  `overrides` is a nonempty object containing only the ten keys below with exact
  types/ranges; no unknown keys, arbitrary JSON, JSON null or runtime coercion.
  No overrides is represented by SQL NULL, not a fabricated empty preference.
- A new policy/envelope version requires an explicit new version change and
  matching validator/guard. Never silently reinterpret version 1.

Re-use ActionExecution/ActionTargetMutation identities, CAS generations and
immutable audit; do not add revision/audit columns that duplicate that foundation.
Use separate logical target kinds for visit preference and notification settings
to avoid accidental cross-command generation collision. The B5 command's exact
Client plus one owned appointment write envelope must be versioned as described
in the B5 proposal; it cannot mutate arbitrary appointment fields.

## B6 exact V1 policy decision included for approval

The following legacy defaults are **observed evidence today**, not an already
approved canonical policy. This proposal asks to make them explicit V1 defaults,
with the two corrections explained below. They are not applied by this checkpoint.

| Key | Strict stored override | Proposed inherited V1 value |
| --- | --- | --- |
| `record_changes` | boolean | true |
| `reminder` | boolean | true |
| `reminder_hours` | integer 1–48 | 3 |
| `marketing` | boolean | true |
| `marketing_freq` | `week`, `2weeks`, `month` | `week` (7 / 14 / 30 days respectively) |
| `cycle` | boolean | true |
| `birthday` | boolean | true |
| `freed_slot` | boolean | true |
| `quiet_from` | integer 0–23 or null | null |
| `quiet_to` | integer 0–23 or null | null |

Quiet endpoints must be supplied as a valid pair after merging a patch: both
NULL or both integer. Use the server-derived business tenant timezone, never
an initiator-supplied timezone. The interval includes its start and excludes its
end, supports midnight crossing, and equal endpoints means no quiet window.
It constrains the currently applicable non-urgent communication policy; it does
not change Package 2 message classes or authorize additional delivery.

Two deliberate policy decisions require approval rather than compatibility code:

1. Legacy accepts reminder hours 0–48, but one reader interprets enabled + 0 as
   disabled while the existing-record refresh substitutes 3. Proposed V1 uses
   **1–48 when enabled; `reminder: false` disables the reminder**. No hidden 0→3
   fallback and no coercion/clamping.
2. Legacy `has_saved_notify_prefs` lets row existence activate a marketing cap
   and CRM reminder override, even if effective values equal the defaults.
   Proposed V1 makes **effective versioned values**, not row existence, the
   policy input. The inherited frequency cap applies consistently, including
   when overrides are absent. This may reduce legacy marketing eligibility; it
   is an explicit policy change to approve, not a schema-only side effect.

Consent remains independently authoritative: preferences do not insert,
update or revoke ClientConsentFact and cannot turn missing/revoked consent
into permission. Delivery must satisfy existing consent, tenant/system policy
and applicable preference restrictions. These are preferences, not proof of
historical consent. No new messages are sent to prove the policy.

V1 local preference commands do not directly update existing CRM appointment
SMS/reminder fields. The legacy webhook's phone-based automatic reminder
override must not remain a hidden writer. If existing-record CRM synchronization
is required, it needs an explicitly approved handoff through existing Package 1
A07, including exact Client/appointment authority and UNKNOWN/reconciliation.
Normal future booking commands retain their existing provider boundaries; this
proposal does not create an extra provider dispatch or widen their input policy.

## Read, no-op, update and concurrency contract

Resolve the authenticated channel through verified ClientChannelLink and the
active tenant-qualified Client, with P02/P03 holds and no phone fallback. A
missing/ambiguous Client fails closed; reading preferences cannot create it.
No User/account or membership is fabricated for a guest Client.

Read returns canonical explicit overrides plus the approved inherited policy,
without inserting Client, CustomerProfile, preferences or any consent/fact row.
Only validated changed keys may enter the canonical command. An empty patch,
identical effective values or a request matching inherited defaults is a no-op:
no business row, applied generation or new user-choice evidence is created.
There is no implicit 'pin the defaults' operation. The server stores only
necessary explicit overrides; when a value returns to the inherited default,
remove that key rather than adding fake explicit choices for other keys.

Stable request identity, expected target generation and the exact active binding
are revalidated under a local transaction/lock. One generation has one winner;
stale concurrent updates reject, duplicate/restart returns the same outcome.
Preserve successful immutable execution/audit facts; identical reads/no-ops
cannot change `updatedAt` or manufacture business facts. This does not prohibit
bounded transport diagnostics or returning an already existing execution receipt.

No broader profile fields, legal overrides, categories, channels, new delivery
scheduler, arbitrary Client creation, retention scope or historical migrations
are part of V1. Authorize mutation through a versioned Client preference command;
do not pass guest data through membership/tenant-wide A22 configuration commands.

## Approved-cycle resumption, only after owner approval

Additive schema → guarded migration → PostgreSQL isolation/concurrency/no-op
proof → clean replay/validate/type/lint → expected-only production migration
gate/apply. Then finish B5/B6 canonical runtime/caller/read-path and narrow
ratchet changes, targeted adversarial proof, mandatory regression/deployment
gates and structural/read-only production verification. No real profile,
preference or provider smoke command.

After remediation production PASS, restart the complete 13-family Final Package
5 Gate from the beginning. New business/schema ambiguity or another bypass
requires STOP. No Wave 7, Chapter 7 or automatic Chapter 6 completion.

```text
B6 CANONICAL OWNER: CLIENT-OWNED COMMUNICATION PREFERENCES IN CUSTOMERPROFILE
B6 PREFERENCES ARE CONSENT FACTS: NO
EXISTING SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES — THREE NULLABLE FIELDS, ZERO NEW MODELS
NEW CANONICAL POLICY DECISIONS REQUIRED: YES — EXPLICIT V1 DEFAULT/NO-OP/REMINDER SEMANTICS
SCHEMA/POLICY PROPOSAL APPROVED: NO
RUNTIME/MIGRATION IMPLEMENTATION STARTED: NO
PRODUCTION MUTATIONS: 0
```
