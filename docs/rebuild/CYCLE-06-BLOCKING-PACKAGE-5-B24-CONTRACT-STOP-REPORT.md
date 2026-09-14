# Package 5 B24 / A18 — Web Push contract reconstruction STOP

Accepted checkpoint: `b40e24747f993c305d1131dd243220fa462d23bd`. B23 remains accepted at `/opt/maya-saas/releases/20260906-p5-b23-68e0048f`; active release and Python code hashes were checked read-only. B9/B23 and Waves 1–6 are not reopened.

**STOP follows the user's explicit schema/lifecycle boundary.** The B9 encrypted delivery field is a reversible verified Telegram/Maya User subject with identity-HMAC validation, not a browser Web Push subscription. `DevicePushToken` is User-required and lacks the required Client/link ownership and encrypted lifecycle. Neither safely represents this contract unchanged.

Legacy permits multiple subscriptions per raw identity with unbounded sending. No approved Client single/multi-device policy was found. The owner must choose **A: multiple verified endpoints (recommended, proposed cap 5)** or **B: one active endpoint with explicit replacement**. The cap and proposed storage/lifecycle rules require approval; they are not silently adopted.

Proposal: [Web Push Delivery Endpoint Schema V1](package5-b24-web-push-delivery-endpoint-schema-v1-proposal.md). It proposes one `ClientWebPushEndpoint` model, no new business action class, no backfill, immutable ownership/material episodes, audited terminal transitions and separate endpoint HMAC/encryption. ClientChannelLink remains identity authority; endpoint/keys never become Client authority. No schema or runtime code was added.

The canonical Communication Delivery normalizer currently accepts inbox/APNS/Telegram, not Web Push. A Web Push transport profile/adapter must be implemented and proven inside that foundation after contract approval. No new outreach permission is proposed; registration sends nothing. Unknown send outcome must not become a blind retry or identity reassignment.

The active handler, SQLite writer/readers, direct Web Push senders, both PWA subscription calls and proxy remain documented in the proposal/evidence. Existing B24 synthetic proof was retained, not rerun. No live subscription credentials, Client PII, production business data or production PII endpoints were accessed. Only code/release metadata was read remotely.

## Verification status

This cycle checks contract evidence and documentation only. Runtime/schema/migration files are unchanged from accepted HEAD; no test DB or background runtime was started. The previous B23 deployment's 353 suites / 2884 tests, pending migrations 0 and drift NONE remain **accepted baseline evidence**, not freshly executed B24 gates. No B24 runtime proof, deployment gate, migration gate or new aggregate Final Gate is claimed.

Evidence: `evidence/package5-b24-contract-assessment.json`. Previous executable reproduction: `evidence/package5-b24-push-subscribe.probe.py`, with results in `evidence/package5-b23-deployed-final-recheck.json`.

```text
B23 PRODUCTION REMEDIATION: ACCEPTED BASELINE
B24 CONTRACT RECONSTRUCTION: COMPLETE
B24 EXISTING DELIVERY SCHEMA SUFFICIENT: NO
B24 ADDITIONAL SCHEMA REQUIRED: YES
B24 MULTIPLE-DEVICE POLICY: OWNER DECISION REQUIRED
B24 NEW MODELS PROPOSED: 1
B24 NEW BUSINESS ACTION CLASSES PROPOSED: 0
B24 RUNTIME REMEDIATION CAN RESUME: NO — SCHEMA/LIFECYCLE APPROVAL REQUIRED
B24 PRODUCTION REMEDIATION: NOT PERFORMED
B24 PRODUCTION BYPASS: STILL OPEN
RUNTIME/SCHEMA/MIGRATION CHANGES: 0
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — ACCEPTED B24 BLOCKER
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13 — ACCEPTED INVENTORY
NEW FULL FINAL GATE RUN: NO — CONTRACT STOP
FULL REGRESSION GATE THIS CYCLE: NOT RUN — DOCUMENTATION ONLY
REAL PRODUCTION MUTATIONS FOR PROOF: 0
P4-11 CREATED: NO
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17 — PROTECTED BASELINE
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Proposal/report/remainder are the only checkpoint changes. No old database was queried, created, changed or deleted for this cycle; no browser/watcher/server process was launched. Commit/push this documentation checkpoint, confirm HEAD=origin, then STOP for owner approval. After separately authorized implementation/deploy, restart the full Package 5 Final Gate from the beginning; Chapter 6 acceptance stays a separate cycle.
