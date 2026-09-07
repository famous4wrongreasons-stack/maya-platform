# B36 — Channel Order Decision Sheet

**STOP at the explicit channel-order boundary. Contract/schema scope approved;
only channel order remains a business decision. No implementation or deployment.**

User approval accepts checkpoint `3aaaeb23`, `OwnerReportsService`,
`operational_single`, existing `deliver_report_briefing` / A12 ActionExecution /
Communication Delivery, 1 `OwnerReportRun` model, 14 persisted fields (12 + 2),
0 action classes, migration YES, backfill NO. The full
[owner/report proposal](package5-b36-owner-report-contract-schema-proposal.md)
is accepted subject to this remaining boundary. Technical Prisma/SQL types,
relation-only fields and constraint/index names may follow project conventions;
they do not require another business approval or authorize extra business fields.

The approval explicitly requires:

> Если repository не содержит уже утверждённого порядка и от него зависит, какие эффекты выполняются: STOP с коротким Channel Order Decision Sheet. Не выбирать порядок молча.

## Evidence: no single approved three-channel order

| Existing source | What is established |
| --- | --- |
| `maya-saas-backend/src/owner-reports/owner-reports.service.ts:345` | Daily owner report supplies canonical `userIds` to Inbox, with no Telegram destinations. |
| `maya-saas-backend/src/inbox/inbox.service.ts:384–390` | For each canonical User, Inbox is awaited before APNS devices. |
| Same file `:337–357`, `:311–315` | Generic Package 2 input with Telegram IDs dispatches Telegram first, before the User Inbox/APNS loop. Device query has no `orderBy`. This is existing control flow, not an approved unified staff-report order with UNKNOWN fencing. |
| [Cycle 04 P4 report](CYCLE-04-P4-BRIEFINGS-REPORTS-MIGRATION-REPORT.md) | Canonical report facts/composition migration; no unified Telegram/Inbox/APNS priority decision. |
| [Package 2 report](CYCLE-06-BLOCKING-PACKAGE-2-COMMUNICATION-CONVERGENCE-REPORT.md) | Canonical A12 ownership, single attempts and UNKNOWN preservation; no three-channel staff-report priority contract. |
| [B36 proposal](package5-b36-owner-report-contract-schema-proposal.md), §4 | Permits all three channels and requires frozen deterministic order; does not choose that order. |

Current production's direct Telegram-first bypass is already the B36 defect; it
cannot authorize a new report policy. B35 Client marketing order also does not
decide staff report order. Existing recipient/date/plan/schema approvals remain
accepted; no new blocker outside B36 is asserted.

## Options — per canonical recipient, after atomic all-slot admission

Only slots present in the initially admitted plan participate. An absent channel
is omitted. These are proposed choices, not implemented policies.

| Option | Fixed order | Consequence of the first external UNKNOWN |
| --- | --- | --- |
| **A — recommended** | **Inbox → Telegram → APNS** | Inbox already exists if successful. Telegram UNKNOWN blocks that recipient's not-started APNS slots. |
| B | Inbox → APNS → Telegram | Inbox already exists if successful. APNS UNKNOWN blocks remaining devices and Telegram for that recipient. |
| C | Telegram → Inbox → APNS | Telegram UNKNOWN can leave that recipient without even an Inbox projection; both later channels wait for reconciliation. |

**WHY A:** establish the canonical in-app report before an uncertain external
send, then prioritize the existing Telegram report experience. This is a proposed
product choice, not a claim that repository documentation already approved it.

**WHAT USER/BUSINESS LOSES with A:** APNS may not be attempted when Telegram is
UNKNOWN; mobile push latency includes the preceding Telegram attempt. Existing
approved losses remain: no raw legacy recipient, no later recipient/device
expansion, no changed-content resend, no channel fallback after UNKNOWN, and a
possible omitted transition-day report at prospective cutover.

## Common exact ordering/resume rules proposed for approval

- Freeze the selected option and ordered slots inside `intentEncrypted`; include
  that order in the normalized `intentHash`. **No extra persisted field/model.**
- Within each channel, order multiple already-approved slots by immutable
  `ownerReportSlotKey`, ascending bytewise lexical order. This also specifies APNS
  device order without interpreting DB result order as a device preference.
- Execute a recipient's slots serially; different workers must not dispatch later
  slots while an earlier slot is unresolved/in flight. Persisted existing A12 /
  Communication Delivery state remains the execution authority after restart.
- Confirmed success is skipped; an unstarted slot resumes only after current
  authority/policy checks. Deterministic failure remains terminal for its slot;
  no new replacement slot/channel may be selected. The order does not expand
  the approved plan or grant permission to retry a failed delivery.
- UNKNOWN fences all not-started channels/devices **of that recipient**. Only
  existing reconciliation/manual handling may resolve it. Restart does not clear
  the fence. Do not increment revision, choose another route or recompute content.
- Pending work for other canonical recipients remains independent and can
  continue. One Inbox receipt never marks the entire report completed.
- An Inbox UNKNOWN likewise blocks later slots until its exact canonical reread
  resolves the outcome. Revoked authority/expired payload never permits a new
  effect, irrespective of ordering.

```text
B36 OWNER REPORT CONTRACT + SCHEMA: APPROVED
EXISTING APPROVED B36 THREE-CHANNEL ORDER: NOT FOUND
CHANNEL ORDER CHANGES POSSIBLE EFFECTS AFTER UNKNOWN: YES
RECOMMENDED OPTION: A — Inbox → Telegram → APNS
B36 CHANNEL ORDER: PENDING APPROVAL
APPROVED NEW MODELS / PERSISTED FIELDS / ACTION CLASSES: 1 / 14 / 0
ADDITIONAL MODELS / PERSISTED FIELDS / ACTION CLASSES FOR ORDER: 0 / 0 / 0
B36 SCHEMA IMPLEMENTATION / MIGRATION APPLY / RUNTIME / DEPLOYMENT: NOT STARTED
B35 PRODUCTION BASELINE: PRESERVED — PASS
PACKAGE 5 COMPLETE: NO
PRODUCTION MESSAGES / BUSINESS / PROVIDER MUTATIONS: 0 / 0 / 0
MAIN DIRTY ENTRIES/HASHES PRESERVED: 24
OLD DATABASES TOUCHED: 0 — 17 PROTECTED
OWNED DATABASES/PROCESSES/PRODUCTION STAGING REMAINING: 0
PROCESS HYGIENE: 0
```

Preflight: `/tmp/maya-b29-contour`, branch `contour/b29-remediation`, fetched
origin, HEAD `3aaaeb23` = canonical origin, ahead/behind 0/0, unpushed 0,
dirty 0 before documentation edits. Main worktree status/content hashes match
the preserved 24-entry baseline. No database, provider, production endpoint or
service was accessed in this decision-only cycle. No runtime gates, migration or
fresh post-remediation Final Gate are claimed.

Channel decision/report → commit/push → **STOP**. After approval, continue the
already authorized schema → PostgreSQL proofs → migration gates/apply → runtime
proofs/gates → documented deployment → read-only production verification → fresh
13-family Final Gate. Mandatory FAIL forbids deployment. STOP at a new B37+.
No Wave 7/Chapter 7; do not declare Chapter 6 complete.
