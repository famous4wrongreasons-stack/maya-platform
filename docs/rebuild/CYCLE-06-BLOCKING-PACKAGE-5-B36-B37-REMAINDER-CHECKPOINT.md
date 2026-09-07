# Package 5 current remainder — B36 schema PASS, runtime WIP, B37 STOP

> Current user-directed cycle: [Exhaustive remainder inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY.md), entry checkpoint `8400a7ff`. **24 known blockers B36–B59**, grouped into 14 owner packages; no remediation. Independent reverse pass added 4 IDs and 3 path groups. **Inventory COMPLETE: NO** — Beget scheduled-task inventory is unavailable; 31/32 surface groups covered. Do not continue B36 WIP or fix B37. B35 runtime/B36 applied schema preserved; Package 5 and Chapter 6 remain incomplete. This instruction supersedes the historical first-new-blocker STOP/resume strategy below.

Canonical report: [B36 schema-applied / B37 STOP](CYCLE-06-BLOCKING-PACKAGE-5-B36-SCHEMA-APPLIED-B37-STOP-REPORT.md).
Current Stage 1 continuation: [B37 owner/contract/schema proposal](package5-b37-owner-contract-schema-proposal.md).
Checkpoint `7201f7bd` was accepted. B37-A reminder and B37-B financial mutation
are reconstructed separately; existing Expense owner is P4-07, but the complete
Telegram authority, reply context and source-intent binding are insufficient.
The proposal is NOT APPROVED; runtime/schema/migration remain unchanged.
This supersedes the earlier B36 channel-order STOP. Owner/contract/schema and
**INBOX → TELEGRAM → APNS** are fully approved; do not request them again.

Production has B35 runtime `20260907-p5-b35-c8c7a8eb` plus the authorized additive
B36 migration from schema checkpoint `d7794b31`. OwnerReportRun and the two
execution binding columns are durable. Pending migrations 0; drift NONE against
the new schema; new report/binding rows 0; health/readiness 200. The migration
checksum is `3572d6327a1f24f055370d44004c6ddfdebdfcc6746d3a2fbb33a14955a676f0`.
Do not modify this applied migration. No B36 runtime was deployed or service
restarted; no prospective runtime cutover configuration was established yet.

B36 runtime implementation is saved as WIP. Targeted regression 11 suites / 96
tests PASS; its complete PostgreSQL runtime proof is FAIL, with oversized/invalid
generic campaign idempotency keys and concurrent write-conflict observations.
Actual runtime restart proof and remaining runtime/deployment gates are
outstanding. The earlier schema-only full regression 383/3139 PASS does not
approve this WIP for deployment.

Both B36 runtime failures remain mandatory blockers after the B37 decision:
`campaignIdempotencyKey must be a stable opaque code` and
`TransactionWriteConflict` during concurrent continuation. The failed first
PostgreSQL case observed 2/8 expected synthetic effects. Fix both and repeat
PostgreSQL/order/restart proof; neither partial unit PASS nor this Stage 1
diagnostic permits B36 runtime deployment.

**New STOP boundary B37:** active weekly staff expense reminder directly sends
Telegram to a legacy raw ID and arms process-local expense intake. The reply and
`/rashod` paths write/delete legacy SQLite expenses without the canonical
tenant/actor/Expense action contract. Fresh production source/launcher evidence
and exact-source synthetic reproduction are linked in the report. B37 was found
in required B36 background inventory, **not** in a completed post-B36 Final Gate.
No B37 remediation or business/schema choice was made.

Resume requires a separate decision for the weekly expense reminder/intake
contract. Preserve all accepted B36 decisions. Then complete/fix B36 runtime,
all required PostgreSQL/authorization/order/UNKNOWN/restart proofs and broad
background ratchets. Run the complete mandatory gates before any runtime
deployment. After actual production PASS, run the fresh full Package 5 Final
Gate across all 13 families and stop at any next newly confirmed blocker.

```text
PACKAGE 4 COMPLETE: YES — ACCEPTED BASELINE
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY: 13/13
PACKAGE 5 COMPLETE: NO
B36 PRODUCTION SCHEMA: PASS
B36 RUNTIME POSTGRESQL PROOF: FAIL
B36 PRODUCTION REMEDIATION: NOT COMPLETE
B36 PRODUCTION RUNTIME DEPLOYMENT: NOT STARTED
NEW STOP BLOCKER: B37
B37 REMEDIATION: NOT STARTED
FRESH POST-B36 FULL FINAL GATE: NOT RUN
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: DO NOT DECLARE
PRODUCTION REAL MESSAGES / BUSINESS / PROVIDER MUTATIONS FOR PROOF: 0 / 0 / 0
MAIN DIRTY ENTRIES / CONTENT HASHES: PRESERVED — 24
OLD DATABASES TOUCHED: 0 — 17 PROTECTED
OWNED DATABASES / POSTGRES PROCESSES / PRODUCTION STAGING REMAINING: 0 / 0 / 0
PROCESS HYGIENE: 0
```

[Final hygiene](evidence/package5-b36-b37-stop-hygiene.json). Report/evidence/WIP
checkpoint → commit/push → **STOP**. Chapter 6 needs its own later acceptance
cycle; Chapter 7 is not started automatically.
