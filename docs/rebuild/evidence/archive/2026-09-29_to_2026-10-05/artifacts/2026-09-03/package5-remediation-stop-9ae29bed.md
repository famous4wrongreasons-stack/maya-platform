<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 355fe362ee5a93f108b7b90110cb74d43b9fcff3c9d5d26e6186d3d640d4a881 -->

Checkpoint `9ae29bedf8bebbd1b02a5a0bf7022d1085308e8e` — commit/push complete; HEAD=origin.

# CYCLE 06 — PACKAGE 5 FINAL A18/A26 REMEDIATION STOP REPORT

Status: **STOP — new A18 identity-establishment / schema contract blocker**

Date: 2026-09-04. Accepted starting checkpoint: `ba9e9234`.

## Result

The three accepted production bypass paths remain unresolved. Remediation
stopped before runtime edits, migrations, deployment or business mutations,
following the user's explicit instruction to stop on a new business/schema
blocker. This is final-gate remediation; Waves 1–6 remain accepted and no wave
was reopened or added.

The missing contract is the verified relationship between an authenticated
legacy PWA/Telegram subject and an exact canonical Client. D2-A supplies
Client-owned facts and optional User, but it does not supply that relationship
or the authority/evidence for establishing it.

## Exact evidence

| Surface | Verified finding |
| --- | --- |
| Active Python `_authed_chat_id`, webhook_server.py:6631–6650 | Verifies Telegram or local web session; returns `chat_id`, not canonical tenant-qualified Client |
| Active `consent_submit_handler`, webhook_server.py:7155–7197 | Creates/reads legacy SQLite Client and invokes the two direct consent writers |
| Production SQLite `clients` / `web_sessions` | Read-only schema inspection confirms no canonical Client binding column; no customer rows were selected |
| Prisma `Client` / `CrmClientLink`, schema.prisma:2033 / :2075 | Optional User and CRM-provider identity links; phone hash is explicitly non-unique and is not identity |
| Prisma `AuthIdentity` / `AuthSession`, schema.prisma:777 / :855 | User required; these cannot authenticate an accountless canonical Client |
| Wave 3 `Package5Wave3Actor`, package5-wave3.service.ts:103 | Requires `userId` |
| Wave 3 `build` / `resolveActor`, :256 / :469 | Requires active User membership before resolving the consent target |
| Wave 3 Client check, :714 | Exact `client.userId === actorUserId` for self commands |
| Wave 3 executor `assertActor`, :1369 | Rejects missing ActionExecution actor binding |
| `recordClientConsent`, package5-wave3-canonical-cutover.service.ts:261 | Adapter requires User; redirecting Python to this adapter cannot meet the guest requirement |

Local disconnected diagnostic invokes the current planner's `build(...,
'execute')` with a synthetic guest principal and an in-memory membership
lookup returning null. It reproduces HTTP 403 / `Active tenant membership
required` before target resolution. No database connection, ActionExecution,
provider operation or production request occurs. This is a blocker diagnostic,
not a rerun of Wave 3 Shadow or its executable proof.

Reproduction from the repository root:

```sh
node docs/rebuild/evidence/package5-final-a18-guest-authority-blocker.probe.cjs "$PWD"
```

Machine-readable evidence:
`evidence/package5-final-a18-identity-boundary-blocker.json`.
Proposal:
`package5-final-a18-client-channel-binding-v1-proposal.md`.

## Why this is an additional decision

An authenticated bridge can resolve its installation's tenant using existing
`BridgeSourceService` protection. It does not establish Client self-authority.
Passing an arbitrary Client id, selecting a matching phone, manufacturing a
Maya User or pretending a Telegram id is a CRM observation would violate the
accepted identity rules. Removing membership checks without a replacement
principal would weaken authority protection.

The proposal identifies a durable exact Client-channel binding, fail-closed
unresolved behavior and the remaining establishment/provenance decision.
No new schema model or binding was silently introduced. There is no change to
D2-A, D3-A, consent grant/revoke semantics or accepted wave contracts.

## A26 status and remaining authorized work

The approved `TrialActivationBootstrapService.activate` remains the required
atomic tenant/first-owner/activation boundary. The public trial route still
uses the legacy flow and physical-delete compensation; the admin route still
calls the independent tenant creator. Neither was changed after the A18 STOP.
No additional A26 business/schema verdict is asserted by this report.

After resolving the new A18 contract, finish all three remediations, strengthen
the five requested final bypass ratchets and run the requested targeted proofs.
Then run mandatory deployment gates sequentially. Only a green remediation and
read-only production verification authorize resuming the full 13-family Final
Gate. That automatic resumption remains part of the user's request; it was not
reached in this cycle. The older remainder's request for a separate remediation
authorization is superseded by the current user instruction.

## Production and verification limits

`HEAD=origin` was confirmed at `ba9e923490d8dd901868c5973d7b9a5a303ac980`
before analysis. Production still points to
`20260904-c06-p5-wave6-cutover-3b545671`; PWA remains active with its existing PID
1435620 and start time. Current Python webhook/database file hashes match the
accepted blocker inventory. No source upload, restart, deployment or production
consent/trial request was performed.

Migrations/drift, full regression, deployment gates and final 13-family replay
were **not rerun** after this contract blocker. Prior migration/baseline evidence
is not presented as a new PASS. Existing deployment and full-regression gates
remain mandatory before any future release.

Only documentation and the isolated blocker diagnostic were added. Unrelated
dirty files, including local Python webhook/bot changes, were preserved.

## Closure

```text
PACKAGE 5 FINAL A18/A26 REMEDIATION: BLOCKED
EXACT NEW BLOCKER: A18 AUTHENTICATED CHANNEL → CANONICAL CLIENT BINDING AUTHORITY
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 WAVES REOPENED: 0
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL CANONICAL COVERAGE: NOT PROVEN
UNRESOLVED ACCEPTED PRODUCTION BLOCKER PATHS: 3
A18 PRODUCTION CONSENT BYPASS REMEDIATED: NO
A26 LEGACY TRIAL BOOTSTRAP REMEDIATED: NO
A26 PHYSICAL TENANT DELETE COMPENSATION REMEDIATED: NO
A26 DIRECT ADMIN TENANT CREATION REMEDIATED: NO
TENANT HARD DELETE IN PACKAGE 5: FORBIDDEN; EXISTING VIOLATION REMAINS
SCHEMA CHANGES APPLIED: 0
PRODUCTION DEPLOYMENT IN THIS CYCLE: NO
FULL REGRESSION GATE: NOT RUN — CONTRACT STOP
FINAL PACKAGE 5 GATE RESTARTED IN THIS CYCLE: NO
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
PROVIDER WRITES: 0
WAVE 7 CREATED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

All one-shot diagnostic/SSH processes exited. No watcher, browser, temporary
PostgreSQL cluster or temporary database was started. Read-only local database
inventory returned 17 historical databases and 0 task-prefix databases; none
was removed. Reports → commit/push → verify HEAD=origin → STOP.


---

# CYCLE 06 — PACKAGE 5 POST-WAVE-6 REMAINDER CHECKPOINT

Status: **CURRENT — accepted waves retained; A18/A26 remediation authorized but STOPPED on A18 channel-to-Client identity contract**

Date: 2026-09-04. This supersedes the Wave 6 pre-cutover remainder after the
explicit AC6 owner decision and successful production cutover from gated source
`3b54567174a0f7de45e4444241d74fba261bf0c3`.

The independent final verification starting at accepted `001bef4b` found live
Python consent SQL ownership (A18), noncanonical trial bootstrap with tenant
hard-delete cleanup (A26), and direct administrative tenant creation (A26).
See `CYCLE-06-BLOCKING-PACKAGE-5-FINAL-ADVERSARIAL-BLOCKER-REPORT.md` and its
machine-readable production inventory. No runtime was changed. The following
wave table records accepted checkpoints; it is not an aggregate no-bypass PASS.

The user accepted `ba9e9234` and authorized remediation of all three paths,
deployment after green mandatory gates, and automatic restart of the complete
Final Package 5 Gate after green production verification. The remediation
contract check found an additional blocker: authenticated legacy channel
identity has no approved durable binding / establishment authority to canonical
Client, while the current A18 executor requires a Maya User membership. Runtime
and production remain unchanged under the user's new-business/schema STOP rule.
See `CYCLE-06-BLOCKING-PACKAGE-5-FINAL-A18-A26-REMEDIATION-STOP-REPORT.md` and
`package5-final-a18-client-channel-binding-v1-proposal.md`.

Production release: `20260904-c06-p5-wave6-cutover-3b545671`.
Wave 6 behavioral proof remains the accepted `bf21d9d6` proof; it was not rerun.
The A30 owner is AC6 maintenance coordinator with MaintenanceRun/ItemClaim,
as classified in the Authority Gate. No new Action Engine route was introduced.

| Wave | Exact narrowed families | Production status |
| --- | --- | --- |
| 1 | A22, A23 | COMPLETE |
| 2 | A16, A25, A26 | COMPLETE |
| 3 | A15, A17, A18 | COMPLETE |
| 4 | A27, A28 | COMPLETE |
| 5 | A29, A31 | COMPLETE |
| 6 | A30 | COMPLETE; six AC6 classes |

The inventory is exactly the 13 narrowed Entry Gate families, missing 0 and
extra 0. Final production-wide canonical coverage is not proven: A18 and A26
have confirmed alternate mutation paths. Preserve the six accepted wave
checkpoints; resolve the aggregate blockers without inventing another wave.

Remaining work, in order:

1. Resolve the new **A18 authenticated channel → canonical Client binding
   establishment/provenance decision**. D2-A optional User and Client ownership
   are already approved. The proposal recommends exact durable binding and
   fail-closed unresolved identity; no new schema is approved/applied yet.
2. Complete the **already authorized A18/A26 remediation** for all three paths,
   final bypass ratchets and targeted adversarial proofs. Retain D2-A/D3-A;
   mandatory local/deployment gates precede release; production verification is
   structural/read-only. No A30 tenant purge or real consent/trial smoke.
3. **Automatically restart PACKAGE 5 FINAL ADVERSARIAL VERIFICATION / COMPLETION
   GATE from the beginning** once remediation production verification passes.
   Reconcile the complete Entry Gate inventory and all
   canonical owners, including approved AC3/AC4/AC5/AC6 exceptions, against
   actual Nest, CLI, Python, maintenance and scheduler surfaces. Preserve the
   accepted authority/schema decisions, D1-A…D7-A and Common Foundation. Do not
   invent Wave 7 or require fabricated ActionExecution history for AC6.
4. Separately initiated **Final Chapter 6 Gate** after Package 5 passes.
5. After Chapter 6, a separate provenance/ownership audit of the **17 historical
   local temp/test databases**. Their deletion is not authorized by this report.

Preserve Packages 1–4, Waves 1–6 production baselines, P02/P03 holds, Client
profile/consent authority, no tenant hard delete, prospective configuration,
immutable recovery evidence, central/versioned/allowlisted retention and no
legacy mutating fallback. No broader cleanup or future legal/tenant override
contract is introduced. No real business/provider mutation for verification.

```text
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 WAVE 6 COMPLETE: YES
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FINAL CANONICAL COVERAGE: NOT PROVEN
FAMILIES WITH CONFIRMED AGGREGATE BLOCKERS: A18, A26
A30 CANONICAL EXECUTION OWNER: AC6 MAINTENANCE COORDINATOR
MAINTENANCE RUN/ITEM CLAIM OWNERSHIP: ENFORCED
AUTH RETENTION POLICY V1: ENFORCED
PACKAGE 5 COMPLETE: NO
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 FINAL A18/A26 REMEDIATION: BLOCKED — NEW IDENTITY CONTRACT
UNRESOLVED ACCEPTED PRODUCTION BLOCKER PATHS: 3
SCHEMA CHANGES APPLIED IN REMEDIATION: 0
PRODUCTION DEPLOYMENT IN REMEDIATION: NO
FINAL PACKAGE 5 GATE STARTED: YES — STOPPED ON CONFIRMED BYPASSES
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR CUTOVER PROOF: 0
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Current contract STOP: reports → commit/push → HEAD=origin → STOP. After the
identity decision, the authorized remediation and conditional automatic full
Final Package 5 Gate resumption remain as listed above. Chapter 6 completion
acceptance stays separate; Chapter 7 is not started automatically.
