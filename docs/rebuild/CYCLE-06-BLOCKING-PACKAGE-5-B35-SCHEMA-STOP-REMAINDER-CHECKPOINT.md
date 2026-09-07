# Package 5 remainder — B35 exact schema mapping complete; approval STOP

Business direction A approved after accepted checkpoint `1e524c2a`.
Current source of truth: [B35 exact schema mapping V1](package5-b35-exact-schema-mapping-v1-proposal.md).
The [Stage 1 direction](package5-b35-canonical-bulk-owner-contract-v1-proposal.md)
and accepted [B34 production / B35 finding](CYCLE-06-BLOCKING-PACKAGE-5-B34-DEPLOYED-FINAL-GATE-STOP-REPORT.md)
remain background evidence; B34 is not reopened.

All 25 requirements are mapped to exact production fields and gaps. Read-only
PostgreSQL catalog inspection covered 18 tables, 367 columns, 119 constraints,
96 indexes and 11 triggers. Production schema file matches repository; release
remains `20260906-p5-b34-6f6745f2`. No business rows or old test DBs were accessed.

Recommended schema delta, **not applied**:

- 0 new models; 12 new persisted columns across existing campaign, audience,
  recipient, delivery-attempt and policy models.
- 2 existing Campaign columns (`channel/provider`) become nullable for a B35
  orchestration root; CHECKs preserve non-NULL requirements for old/transport
  rows. No fake provider value represents the bulk owner.
- 3 unique constraints; 2 non-unique indexes (5 physical including unique
  backing indexes); 3 composite FKs; 0 new enums/enum values/action classes.
- Explicit freeze/shape/transition/graph guards reuse existing models and the
  transport attempt lifecycle. Six virtual ORM relation properties add no columns.
- Root and slot ActionExecution success proves admission only. Real delivery
  states/evidence remain in Communication Delivery, so an UNKNOWN recipient does
  not strand independently pending siblings or mutate a finished admission attempt.
- A new write-once canonical-history epoch supports conservative frequency
  lookback without fake history. Explicit 7/14/30-day frequency waits for complete
  prospective coverage; this cutover behavior is included in the schema proposal
  awaiting approval. No implicit weekly cap, auto-reschedule or consent bypass.

The PostgreSQL concurrency/restart/partial/UNKNOWN/cross-tenant proof matrix is
specified for a later newly owned isolated database. **It was not executed at
this schema-decision stage.** No runtime, schema.prisma, migrations, deployment
or production messages changed. The schema inventory and documentation checks
are not a mandatory runtime regression or Package 5 Final Gate PASS.

```text
B35 OPTION A BUSINESS CONTRACT: APPROVED
B35 EXACT SCHEMA MAPPING: COMPLETE
EXISTING SCHEMA FULLY SUFFICIENT: NO
NEW MODELS: 0
NEW FIELDS: 12
ALTERED EXISTING FIELDS: 2 — Campaign.channel/provider nullability with role CHECKs
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
FAKE HISTORICAL BULK BACKFILL: 0
DURABLE PARTIAL RESUME SUPPORTED AFTER DELTA: YES — specified runtime/guards/proofs required
CLIENT WITHOUT MAYA USER SUPPORTED: YES
CROSS-CHANNEL RETRY AFTER UNKNOWN: NO
B35 IMPLEMENTATION READY AFTER SCHEMA APPROVAL: YES
B35 RUNTIME / SCHEMA / MIGRATION / DEPLOYMENT THIS STAGE: NOT CHANGED
B29–B34 PRODUCTION BASELINES: PRESERVED
B34 PRODUCTION REMEDIATION: PASS
ACTIVE BLOCKER: B35
PRODUCTION MESSAGES: 0
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
WAVE 7 CREATED: NO
MAIN DIRTY WORKTREE: 24 entries / 22 recorded hashes preserved
PRE-EXISTING DATABASES TOUCHED: 0 — all 17 untouched
OWNED RESOURCES REMAINING: 0
PROCESS HYGIENE: 0
```

Schema decision/report/evidence/remainder → commit/push → **STOP**. Only after
schema approval may implementation and the mandatory verification sequence begin.
Only after B35 production PASS may a fresh full 13-family Final Gate run. Any
B36+ finding then requires its own report and STOP; Chapter 6 acceptance is separate.
