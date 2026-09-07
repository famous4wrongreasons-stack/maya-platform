# Package 5 B36 — contract/schema approved; channel-order STOP

Accepted source checkpoint: `3aaaeb23`. B35 production PASS is preserved;
the active release remains `20260907-p5-b35-c8c7a8eb`. No B35 remediation was
reopened and no production runtime/configuration/schema was changed.

Canonical continuation: [B36 Channel Order Decision Sheet](package5-b36-channel-order-decision-sheet.md)
and [approved owner / contract / schema proposal](package5-b36-owner-report-contract-schema-proposal.md).
The user's approval authorizes technical schema mapping from project conventions
and the gated migration/runtime/deployment path. It explicitly requires a STOP
when existing repository semantics do not establish the effect-significant channel
order. The original foundation diagnostics below remain evidence of the missing
implementation; they do not mean the owner/schema approval must be requested again.

```text
B36 COMMUNICATION CLASSIFICATION: operational_single — A12, staff/business report
B36 CANONICAL OWNER: OwnerReportsService → deliver_report_briefing
B36 RECIPIENT AUTHORITY FOUNDATION: SUFFICIENT NO
B36 IDEMPOTENCY FOUNDATION: SUFFICIENT NO
B36 CONTENT/PLAN FOUNDATION: SUFFICIENT NO
B36 COMMUNICATION DELIVERY FOUNDATION: SUFFICIENT YES
```

The missing foundation is an immutable, tenant+report period/version root with
canonical staff recipients and permitted routes. Individual A12 keys already
reject changed input; they do not freeze the whole report. Executing the current
owner and Inbox methods with fixtures reproduces a partially completed report
being skipped because one Inbox receipt exists. Raw Telegram also reaches the
delivery owner without a resolved canonical identity.

Fresh read-only source/launcher checks preserve 72 Python sources and match 113
backend artifacts. The four exact production Python functions again reproduce
eight synthetic pre-admission sends; six executed backend artifact hashes match
production. [Verification](evidence/package5-b36-stage1-verification.json).
No real message, database access or business/provider operation was used.

**Approved**: existing `OwnerReportsService` owns one new
`OwnerReportRun` record; existing A12 executions receive tenant-qualified root/slot
relations; existing Communication Delivery retains transports and attempts.
Approved delta: 1 model, 14 persisted scalar columns (12 + 2), 0 action classes;
migration required, historical backfill forbidden. Approval includes recipient
authority, route eligibility, prospective cutover and retention.

**Only remaining business decision:** channel order. Canonical OwnerReports
currently uses Inbox → APNS without Telegram; the generic bridge uses Telegram
before its Inbox/APNS loop. Neither establishes the new frozen three-channel
report policy under a per-recipient UNKNOWN fence. Recommended pending option A:
Inbox → Telegram → APNS. Alternatives and exact effects are in the decision sheet.
No extra persisted fields/models/actions are proposed for order; store it inside
the already approved immutable plan. Do not silently choose an order.

Runtime, schema/migration, deployment, new ratchets and the later full 13-family
Final Gate were not run. B35's accepted 382 suites / 3130 tests PASS remains
historical validation, not a B36 runtime result.

```text
B35 PRODUCTION REMEDIATION: PASS — BASELINE PRESERVED
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY: 13/13
PACKAGE 5 COMPLETE: NO
ACTIVE BLOCKER: B36
B36 FOUNDATION SUFFICIENT: NO
B36 OWNER/CONTRACT/SCHEMA APPROVAL: APPROVED
B36 CHANNEL ORDER APPROVAL: PENDING — EXPLICIT STOP BOUNDARY
B36 IMPLEMENTATION / DEPLOYMENT: NOT STARTED / NOT STARTED
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: DO NOT DECLARE
PRODUCTION MESSAGES / BUSINESS / PROVIDER MUTATIONS FOR PROOF: 0 / 0 / 0
MAIN DIRTY ENTRIES/HASHES PRESERVED: 24
OLD DATABASES TOUCHED: 0 — 17 PROTECTED
OWNED DATABASES/PROCESSES/PRODUCTION STAGING REMAINING: 0
PROCESS HYGIENE: 0
```

Channel decision/remainder → commit/push → **STOP**.
