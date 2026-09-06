# Package 5 remainder — B31 production PASS; B32 Owner Decision pending

Current report: [B31 deployed / Final Gate STOP](CYCLE-06-BLOCKING-PACKAGE-5-B31-DEPLOYED-FINAL-GATE-STOP-REPORT.md).
Approved Option A `724d3ef6`; schema `05ea5c25`; production migration evidence
`25119d99`; runtime `2aeaacff`. Active release:
`/opt/maya-saas/releases/20260906-p5-b31-2aeaacff`.

B32 Stage 1 contract reconstruction is complete at the accepted `70f37ba1`
baseline. Continue from the [B32 actor/principal Owner Decision Sheet](CYCLE-06-BLOCKING-PACKAGE-5-B32-ACTOR-PRINCIPAL-DECISION-SHEET.md).
An existing bounded `client_channel` principal supports Client without Maya
User, but its allowlist and Client-as-target contract cannot simply be passed
to appointment create. Generic authority extension needs an Owner decision.
Recommended **B32 Option A** reuses immutable ActionExecution evidence references
and existing ClientChannelLink history: 0 models, 0 persisted fields, 0 action
classes, no migration/backfill. It is a proposal, not an approved runtime change.
B31's earlier Option A approval does not approve B32 Option A. No runtime,
schema, migration, database or production work occurred during this assessment.

B31 HTTP/AI immutable Client booking is production PASS. Every accepted key is
bound to one normalized intent/execution. Changed intent conflicts; internal
and CRM creates use the existing Action Engine and exact mayaClientId/tenant.
Canonical Client without Client.userId is supported. Real PostgreSQL concurrency,
alias, crash/restart and UNKNOWN proof PASS. Mandatory/deployment backend:
373 suites / 3046 tests PASS. Health/readiness PASS; pending 0; drift NONE;
577/577 deployed artifacts match. No fake historical backfill.

The fresh full Final Gate inventoried all 13 families and stopped at **B32 / A18**:
valid signed channel → verified canonical Client → published chat create enters
`runAsPublicTenant`, supplies `authenticated_request` without actorUserId, and
is denied by the real create policy (`actor_required`). Both Client-with-User
and Client-without-User fixtures return NOT_EXECUTED and never dispatch the
provider. The compiled controller/verifier/resolver/policy/kernel/PostgreSQL
[proof](evidence/package5-b32-channel-create-authority.proof.json) is committed.
This is a failing canonical authority/eligibility path, not a demonstrated
production duplicate-provider exploit. The separate old channel idempotency
scope remains unmodified and must be considered in a separately authorized B32
repair. Do not bypass policy by manufacturing a User or trusted-service source.

```text
PACKAGE 4 COMPLETE: YES
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
B29 PRODUCTION REMEDIATION: PASS
B30 PRODUCTION REMEDIATION: PASS
B31 PRODUCTION REMEDIATION: PASS
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL — B32
ACTIVE BLOCKER: B32 / A18 CHANNEL CREATE ACTOR POLICY
PACKAGE 5 COMPLETE: NO
B32 CONTRACT RECONSTRUCTION: COMPLETE
B32 EXISTING GENERIC ACTOR/PRINCIPAL FOUNDATION SUFFICIENT: NO
B32 RECOMMENDED OPTION: A — existing storage, common Client authority contract
B32 NEW SCHEMA REQUIRED: NO — recommended option
B32 RUNTIME REMEDIATION CAN RESUME: NO — Owner decision pending
B32 IMPLEMENTATION / DEPLOYMENT: NOT STARTED
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO
MAIN PRE-EXISTING DIRTY FILES PRESERVED: YES
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

All three owned synthetic databases, their PostgreSQL process/data/socket and
the remote schema tooling stage were removed. Main checkout retains its 24
pre-existing status entries; the 17 old test databases remain untouched.
[Hygiene evidence](evidence/package5-b31-final-hygiene.json).

STOP after assessment/remainder commit and push. B32 needs approval of its
proposed authority contract before runtime remediation. Preserve Packages 1–4,
six accepted waves, B29/B30, B31 immutable
intent/UNKNOWN rules and D1-A…D7-A. Chapter 6 acceptance follows only a future
clean Package 5 Final Gate; it is not automatically complete.
