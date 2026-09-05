# Package 5 Final — B13 control-plane contract V1 proposal

Status: **OWNER DECISION REQUIRED — RUNTIME/SCHEMA IMPLEMENTATION NOT STARTED**

Source checkpoint: `2f647179`

Proposal date: 2026-09-05

## 1. Exact mapping result

The accepted A16, A22 and A26 runtime contracts do not honestly express every
mutation currently exposed by the four B13 compatibility endpoints. The
existing action registries remain the source of truth; this proposal does not
reopen Waves 1 or 2 and does not add an implementation wave.

| Endpoint / mode | Exact current mutation | Candidate family / accepted owner | Mapping verdict |
| --- | --- | --- | --- |
| `/api/panel/team`, `list` | reads provider roster and legacy bind/cashier presentation | read surface | mapped as read-only; no command |
| `/api/panel/team`, `bind_code` create | inserts a legacy `masters_telegram` row and opaque bind code from a caller-supplied provider staff id/name | A16 has `configure_crm_staff_access` and `claim_crm_team_owner` | **unmapped**: no accepted staff-channel challenge/binding command |
| `/api/panel/team`, `bind_code` reset | rotates the legacy code, clears `telegram_chat_id` and `bound_at`, changes the name and reactivates the row | A16 | **unmapped**: this is identity unlink/rebind plus activation, not access configuration |
| `/api/panel/team`, `cashier` | toggles `masters_telegram.can_redeem` | A16 access, with Package 4 value-redemption authority implicated | **unmapped**: A16 accepts only canonical `administrator`/`staff` access roles and owns no cashier/value privilege |
| `/api/panel/managers`, `list` / `recent` | reads legacy manager/candidate presentation | read surface | mapped as read-only; no command |
| `/api/panel/managers`, `add` / `remove` | rewrites a tenant-unqualified list of raw Telegram ids in `settings.panel_manager_ids` | A16 `configure_crm_staff_access` | **unmapped**: raw Telegram id is not a canonical `CrmStaffAccess`; removal has no defined canonical successor role |
| `/api/panel/plan_target`, default | writes tenant business setting `owner_daily_target_rub` | A22 | **unmapped**: accepted A22 actions contain no daily business target |
| `/api/panel/plan_target`, `growth` | writes a goal JSON, monthly gross target and optional workstation count, then rebuilds a derived plan snapshot | A22 | **unmapped**: finance dashboard preferences own only a monthly target and staff targets for one actor; they do not own tenant growth-goal revision, deadline, workstation capacity or snapshot lifecycle |
| `/api/god/subscribers`, `list` | reads the legacy subscriber registry and aggregates count/MRR | presentation/read surface | mapped as read-only only if it cannot create or repair facts |
| `/api/god/subscribers`, `add` | inserts a separate `maya_tenants` row with name, city, plan, status, owner, phone and caller-supplied MRR | A26 TrialActivation / tenant lifecycle; Package 4 owns payment-derived value/entitlement | **unmapped**: this is neither a TrialActivation nor an existing canonical tenant; plan/MRR cannot be accepted as admin-authored entitlement facts |
| `/api/god/subscribers`, `set_status=suspended` | mutates legacy subscriber state | A26 `suspend_tenant` only for an exact canonical Tenant | conditionally expressible only after resolving a canonical Tenant; not expressible for a legacy registry row |
| `/api/god/subscribers`, `set_status=active` | mutates legacy subscriber state and may stamp activation time | A26 `reactivate_tenant` only for a suspended canonical Tenant with current entitlement evidence | conditionally expressible; arbitrary activation of a legacy row is unmapped |
| `/api/god/subscribers`, `set_status=pending` | moves any legacy subscriber row to `pending` | A26 | **unmapped**: no accepted reverse-to-pending tenant lifecycle action |

The accepted A16 command takes an exact tenant-qualified `CrmStaffAccess.id` and
allows only the roles `administrator` or `staff`. It does not issue a Telegram
bind token, clear a channel identity, or grant cashier authority. The accepted
A22 finance command stores `monthly_target_rub` and `staff_targets_rub` in an
actor's finance dashboard preference; a tenant-wide daily or dated capacity
goal is a different aggregate. A26 creation remains the one-time
`TrialActivation` protocol, while its lifecycle actions operate on canonical
Tenants and preserve entitlement checks.

## 2. Required decision D1 — legacy staff bind codes

### Option A — retire the legacy bind-code mutation in the panel (recommended)

Keep team roster/status presentation read-only. `bind_code` create/reset returns
an explicit unsupported/retired outcome and performs no write. Staff access is
created or changed only through the accepted A16 command. Telegram identity may
be linked only through an already approved authenticated identity operation;
the panel does not invent a new channel-link protocol.

Consequences: no new schema or action class. The old Telegram code onboarding
and reset button no longer bind staff until a separately approved verified
staff-channel linking flow exists.

### Option B — approve a verified staff-channel linking contract

Define a short-lived, single-use, tenant/provider/staff-bound challenge and a
durable verified channel identity linked to an exact canonical
`CrmStaffAccess`. Reset must be an explicit revoke/rebind operation with audit
evidence; it cannot silently clear an active subject. Before implementation the
owner must approve issuer authority, TTL, recovery/rebind rules and whether the
existing User/AuthIdentity foundation is sufficient.

This is a new identity contract justified only if staff Telegram onboarding is
a required product capability. It must not reuse the Client linking challenge
or the legacy SQLite row.

`RECOMMENDED D1: OPTION A`

## 3. Required decision D2 — cashier and manager authority

### Option A — use only existing A16 roles; retire legacy privileges (recommended)

- Retire the `cashier` mutation. Value redemption remains with its approved
  Package 4 command, authority and audit boundary.
- Retire raw-Telegram-id manager add/remove. An owner may configure an existing
  canonical `CrmStaffAccess` only as `administrator` or `staff` through A16.
- Panel role/candidate lists become canonical read projections. A recently seen
  Telegram id never becomes staff or administrator authority by itself.

No schema or action class is added. If the product calls an A16
`administrator` a “manager” in presentation, that label does not create a third
authority role. Removal must target the exact access and set it to the approved
`staff` role; owner access and suspended-tenant constraints remain protected.

### Option B — approve additional canonical capabilities

Define a cashier value-redemption capability and/or a distinct manager role,
including exact target, grant/revoke authority, tenant and branch scope,
separation of duties, session revocation and audit semantics. This would change
the accepted A16/Package 4 authority contract and requires a separate bounded
decision before any schema choice.

`RECOMMENDED D2: OPTION A`

## 4. Required decision D3 — plan target semantics

### Option A — narrow to the existing finance preference (recommended for this remediation)

The compatibility endpoint may initiate only the existing A22
`update_finance_dashboard_preferences` command for `monthly_target_rub`, while
preserving the actor's current widget and staff-target configuration. Daily
target and strategic growth modes return an explicit unsupported outcome and
perform no write. Existing legacy settings remain historical/read-only input;
they are not backfilled as canonical owner decisions.

No schema or action class is added. The product loses mutable daily targets,
dated growth goals and workstation-capacity goals until their own business
contract is approved.

### Option B — approve a tenant growth-goal aggregate

Define a tenant-owned, versioned goal containing target amount, period/deadline,
optional workstation capacity, server-derived authority/audit facts, current
generation and deterministic derived-plan snapshot identity. This is not an
actor dashboard preference. It requires an A22 contract extension and likely a
minimal additive tenant goal model; exact replace/archive/history behavior must
be approved before schema implementation.

`RECOMMENDED D3: OPTION A`

## 5. Required decision D4 — GOD subscriber registry

### Option A — canonical read projection; retire registry mutations (recommended)

`/api/god/subscribers` becomes read-only and derives its presentation from
canonical Tenant, TrialActivation, subscription and entitlement facts. Legacy
`maya_tenants` rows remain untouched as historical compatibility data but are
not created, updated, merged or treated as authority.

New tenant creation continues through the already approved TrialActivation
flow. Canonical suspension/reactivation continues through the A26 actions from
their existing authorized surfaces. `pending` is derived from canonical
activation state, never written as a reversible tenant lifecycle state. Plan and
MRR are derived from Package 4 subscription/entitlement/payment facts; caller
payload is not authoritative.

No new schema or action class is needed.

### Option B — retain mutating GOD controls as canonical initiators

Redefine `add` to initiate the exact existing TrialActivation contract and
reject legacy-only `plan`, `mrr`, arbitrary status and contact fields. Redefine
`set_status` to accept only an exact canonical Tenant and initiate
`suspend_tenant` or `reactivate_tenant`; reject `pending`. This preserves some
admin controls but changes the request/response contract and requires all
TrialActivation input, idempotency and entitlement evidence demanded by the
existing owner.

`RECOMMENDED D4: OPTION A`

## 6. Non-negotiable invariants

`PANEL/GOD ROUTE: AUTHORIZED INITIATOR OR READ PROJECTION ONLY`

`PANEL-SUPPLIED TELEGRAM ID AS STAFF AUTHORITY: NO`

`DIRECT STAFF BINDING/ROLE WRITES: 0`

`CASHIER VALUE AUTHORITY FROM LEGACY ROLE: NO`

`DIRECT BUSINESS SETTING WRITES: 0`

`DIRECT ADMIN TENANT CREATION: 0`

`LEGACY SUBSCRIBER/TENANT FACT WRITES: 0`

`ADMIN-SUPPLIED PLAN/MRR AS ENTITLEMENT AUTHORITY: NO`

`TENANT HARD DELETE IN PACKAGE 5: FORBIDDEN`

`LEGACY MUTATING FALLBACK: NO`

`READ/NO-OP CREATES BUSINESS FACT: NO`

## 7. Resume boundary

After D1–D4 are approved, the same B13 Final Remediation cycle may resume. The
implementation must use only the approved dispositions, add active-PWA and
published-proxy ratchets, run targeted adversarial and mandatory deployment
gates, deploy without real control-plane mutations for smoke, and restart the
complete 13-family Package 5 Final Adversarial Verification.

No schema proposal is authorized by this document. If the owner selects D1-B,
D2-B or D3-B, first return the corresponding minimal contract/schema proposal
required by that choice.

`B13 EXACT EXISTING-ACTION MAPPING COMPLETE: NO`

`UNMAPPED B13 MUTATIONS: STAFF CHANNEL BIND/RESET; CASHIER CAPABILITY; RAW TELEGRAM MANAGER AUTHORITY; DAILY/GROWTH GOALS; LEGACY SUBSCRIBER CREATION/PENDING STATE/PLAN-MRR FACTS`

`NEW ACTION CLASSES CREATED: 0`

`SCHEMA/RUNTIME/MIGRATION CHANGES: 0`

`PRODUCTION MUTATIONS: 0`
