# B36 approved schema mapping v1

Accepted checkpoint: `2ba294d5`. The user approved channel order **INBOX →
TELEGRAM → APNS**, in addition to the owner/contract/schema approval at
`3aaaeb23`. No channel-order approval remains outstanding.

Canonical owner: `OwnerReportsService`; A12 `deliver_report_briefing`;
Communication Delivery remains the transport owner. This mapping adds no
business fields beyond the approved shape and no new action classes.

| Model | Persisted columns and Prisma types |
| --- | --- |
| `OwnerReportRun` | `id String @id @default(uuid())`, `tenantId String`, `reportType String`, `periodLocalDate String`, `reportVersion Int`, `timezone String`, `intentHash String`, `intentEncrypted String?`, `admittedAt DateTime`, `expiresAt DateTime`, `payloadRetentionUntil DateTime`, `auditRetentionUntil DateTime` |
| `ActionExecution` | `ownerReportRunId String?`, `ownerReportSlotKey String?` |

SQL uses existing project conventions: TEXT, INTEGER, TIMESTAMP(3). Report type
and version are constrained to `daily_report` and `1`; no new enum is needed.
The date is a tenant-local `YYYY-MM-DD` value, not a server-midnight timestamp.
The HMAC is 64 lower-case hexadecimal characters. Payload/audit deadlines are
fixed at admission +7/+365 days. Expiry is fixed at period end +7 days in the
canonical manifest and must exceed admission.

Four relation-only Prisma fields: `Tenant.ownerReportRuns`,
`OwnerReportRun.tenant`, `OwnerReportRun.executions`,
`ActionExecution.ownerReportRun`. They add no physical columns.

Exact SQL mapping:

- Primary key: `OwnerReportRun_pkey`.
- Unique indexes: `B36_report_identity_key` on tenant/type/date/version;
  `B36_report_tenant_key` on id/tenant;
  `B36_execution_slot_key` on tenant/run/slot.
- Foreign keys: `B36_report_tenant_fkey` → Tenant;
  `B36_execution_run_fkey` → OwnerReportRun(id, tenantId), both with
  DELETE/UPDATE RESTRICT. These are the **two** relations specified in the
  approved proposal; the approval's shorthand “remaining 3 FK / indexes” does
  not define three additional relationships or authorize invented columns.
- Lookup indexes: `B36_report_resume_idx` (tenant, expiry),
  `B36_report_payload_retention_idx`, `B36_report_audit_retention_idx`.
- Checks: `B36_report_contract_check`, `B36_execution_binding_check`; the
  latter requires both binding columns null or both non-null, and bound
  executions must use the existing A12 capability/action class.
- Triggers: `B36_report_immutable_guard`, `B36_execution_binding_guard`.
  Root identity/manifest cannot be updated. Only payload clearing after its
  deadline is allowed; early deletion is prohibited. Execution binding cannot
  change or promote historical rows. New bound slots must be READY/ALLOW,
  non-dry-run, have the exact root expiry, and be inserted in the same
  PostgreSQL transaction that inserted the root. Late plan expansion is denied.

Migration: `20260907180000_b36_owner_report_run`; additive, transaction-wrapped,
5-second lock timeout and 120-second statement timeout. It does not update
historical rows or infer historical intent. Existing ActionExecution bindings
remain null.

Admission support normalizes and encrypts the complete recoverable plan, hashes
business semantics with the existing canonical HMAC, and inserts all executions
through canonical ingress in one serializable transaction. One denied slot
rolls back the entire root/slot set. The first committed candidate wins;
an explicit changed candidate conflicts. No delivery occurs in this support
layer. Runtime wiring and production verification are separate later gates.

The manifest includes explicit channel order and sorts slots within a channel
by immutable slot key. It freezes canonical User/Membership and exact verified
AuthIdentity/device evidence. Raw route destinations exist only inside encrypted
payload; fingerprints include their keyed route evidence. It excludes worker,
retry and random root/execution identities. Resume never recomposes content,
changes order, selects a route or adds a recipient/device.

```text
NEW MODELS: 1
NEW PERSISTED FIELDS: 14
NEW RELATION-ONLY FIELDS: 4
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
CHANNEL ORDER: INBOX → TELEGRAM → APNS
```

Verification and production-apply receipts are recorded separately; this
technical mapping is not a claim of runtime deployment or Package 5 completion.
