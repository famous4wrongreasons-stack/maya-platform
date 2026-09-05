# Package 5 B13 exact contract mapping STOP report

Status: **Package 5 Final Remediation stopped at unmapped B13 mutations**

Accepted checkpoint: `2f647179`.

No runtime, schema, migration, ratchet or production change was made in this
cycle. Waves 1–6 and the B7–B12 production baselines remain accepted.

## Exact source-of-truth comparison

The B13 route bodies were compared to the immutable Wave 1/A22 and Wave
2/A16/A26 executable registries and services at accepted `HEAD`.

- A16 exposes only `configure_crm_staff_access` and
  `claim_crm_team_owner`. `configure_staff_access` requires an exact canonical
  `CrmStaffAccess.id` and accepts only `administrator` or `staff`.
- A22 exposes only assistant preferences, finance dashboard preferences and
  appointment notification settings. Its finance payload contains a monthly
  target and staff targets, not a tenant daily/datetime/capacity goal.
- A26 tenant creation remains TrialActivation. Its post-tenant registry contains
  configuration, branding, logo, tenant/internal-provider User creation,
  suspension, reactivation and branch creation. It does not own a second
  subscriber registry, arbitrary MRR/plan values or a reverse-to-pending state.

## Exact blocker list

`/api/panel/team` performs three unmapped authority mutations: creation of a
legacy Telegram staff bind code, reset that clears an existing channel binding
and reactivates the row, and grant/revoke of a legacy cashier value-redemption
privilege. None is represented by either accepted A16 action.

`/api/panel/managers` grants/removes panel authority by rewriting raw Telegram
ids in a tenant-unqualified settings row. The id is not a canonical
`CrmStaffAccess` target, A16 does not accept a `manager` role, and removal does
not define the canonical successor role.

`/api/panel/plan_target` has two different unmapped operations. The default
mode writes a daily revenue target. Growth mode writes a dated strategic goal,
monthly gross target, optional workstation count and derived snapshot. Neither
is the accepted A22 finance-dashboard preference contract.

`/api/god/subscribers` creates and changes an independent SQLite
`maya_tenants` registry. Creation combines subscriber presentation, contact,
caller-supplied plan/MRR and arbitrary active/suspended/pending state without
TrialActivation. State changes target a legacy row, and `pending` has no A26
lifecycle action. Canonical suspend/reactivate can be used only for an exact
canonical Tenant and with the existing authority/entitlement evidence.

These are exact contract gaps, so the required STOP boundary applies. The
minimal owner choices and recommended no-new-schema dispositions are recorded
in `package5-b13-control-plane-contract-v1-proposal.md`.

## Verdict

`B13 EXACT CANONICAL MAPPING: FAIL`

`UNMAPPED B13 MUTATION: LEGACY STAFF CHANNEL BIND-CODE CREATE/RESET`

`UNMAPPED B13 MUTATION: LEGACY CASHIER VALUE-REDEMPTION AUTHORITY`

`UNMAPPED B13 MUTATION: RAW TELEGRAM MANAGER AUTHORITY ADD/REMOVE`

`UNMAPPED B13 MUTATION: TENANT DAILY REVENUE TARGET`

`UNMAPPED B13 MUTATION: DATED GROWTH/CAPACITY GOAL AND SNAPSHOT`

`UNMAPPED B13 MUTATION: LEGACY SUBSCRIBER CREATION WITH PLAN/MRR/CONTACT/STATUS`

`UNMAPPED B13 MUTATION: LEGACY SUBSCRIBER REVERSE-TO-PENDING STATE`

`B13 MINIMAL CONTRACT PROPOSAL: READY`

`PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL`

`PACKAGE 5 COMPLETE: NO`

`PACKAGE 5 WAVES COMPLETE: 6/6`

`PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13`

`B12 PRODUCTION BASELINE REOPENED: NO`

`NEW ACTION CLASSES CREATED: 0`

`RUNTIME/SCHEMA/MIGRATION IMPLEMENTATION STARTED: NO`

`REAL PRODUCTION MUTATIONS: 0`

`P4-11 CREATED: NO`

`WAVE 7 CREATED: NO`

`CHAPTER 7 STARTED: NO`

The 17 pre-existing local test databases were not modified or deleted. Owned
temporary processes, watchers, browser processes and temporary databases are
zero.

Machine-readable evidence:
`evidence/package5-b13-contract-mapping.json`.
