# Package 5 — Wave R-A Stage 1 consolidated assessment

**R01, R02 and R10 have sufficient existing approved foundations. No new owner decision, schema proposal, model, persisted field, action class, migration or backfill is required. All three are ready for implementation; none is ready for production.** This checkpoint completes Stage 1 assessment with executable local foundation proofs. It does not claim the six assigned blockers are remediated.

Accepted entry: `4a253449d6a5071dc73a96044f92f0c7ad779e7c`. The isolated worktree `/tmp/maya-b29-contour`, branch `contour/b29-remediation`, was clean; fetch passed, HEAD equalled `origin/codex/maya-brain-systemic-release-20260815`, unpushed commits were zero. Main 24 dirty entries and their 22 file hashes match the protected baseline. No old database was opened.

The [accepted exhaustive inventory](CYCLE-06-BLOCKING-PACKAGE-5-EXHAUSTIVE-REMAINDER-INVENTORY-COMPLETE.md) and [exact master definitions](evidence/package5-remainder-inventory-final.json) remain unchanged. Inventory is closed at **32/32 surfaces, 24 blockers and 14 remediation packages**. This work traced only the already inventoried R01/R02/R10 contracts and paths. No new production surface was discovered and no discovery loop or full Final Gate was run.

## 1. Exact package assessment

[Machine-readable assessment](evidence/package5-wave-ra-stage1-assessment.json) preserves the exact package definitions, membership and dependencies from the accepted master.

| Required assessment | R01 | R02 | R10 |
| --- | --- | --- | --- |
| PACKAGE | R01 | R02 | R10 |
| BLOCKERS INCLUDED | B38, B39, B54 | B40, B41 | B50 |
| CANONICAL OWNER | Canonical Client/profile and Appointment owners; B31/B32/B33 identity/intent ingress | Canonical User/Membership/CrmStaffAccess/platform access owner | AI invocation/approval receipt owner over existing ActionExecution |
| EXISTING FOUNDATION SUFFICIENT | YES | YES | YES |
| BUSINESS DECISION REQUIRED | NO | NO | NO |
| SCHEMA REQUIRED | NO | NO | NO |
| NEW MODELS | 0 | 0 | 0 |
| NEW FIELDS | 0 | 0 | 0 |
| NEW ACTION CLASSES | 0 | 0 | 0 |
| MIGRATION REQUIRED | NO | NO | NO |
| BACKFILL REQUIRED | NO | NO | NO |
| RUNTIME-ONLY | YES | YES | YES |
| DEPENDENCIES SATISFIED | YES — no external package prerequisite | YES — no external package prerequisite | YES — no external package prerequisite |
| READY FOR IMPLEMENTATION | YES | YES | YES |
| READY FOR PRODUCTION | NO | NO | NO |

R01 includes B38's **internal** dependency on B54 header propagation. That constraint is not waived or reported as already fixed. R02's staff/platform authority is not an extra prerequisite for an already verified canonical Client in R01. R10 relies on existing lower Action Engine owners, not future R01/R02 remediation. Independent assessment does not remove the need to coordinate shared Python/proxy files and one wave cutover.

There are **zero Decision Sheets** and **zero schema proposals** for this wave: the contracts already determine the required behavior. No repeated approval is requested for those contracts. The requested first STOP is retained after this report; it does not introduce a new business-decision gate.

### R01 — canonical Client and Appointment initiators

[R01 assessment](evidence/package5-wave-ra-r01-assessment.md) maps every unchanged B38/B39/B54 path to its existing foundation. Verified account/channel → exact active Client binding → tenant-qualified owner command is the accepted boundary. A Client without Maya User remains supported through the existing B32 principal. Booking uses B31 immutable intent and B33 confirmation identity, then the existing internal/CRM Action Engine executor; accepted Appointment ownership remains exact `mayaClientId + tenantId`.

Both PHP relays must preserve the caller's approved idempotency header, including browser preflight, without changing the logical identity. All inventoried public booking aliases and backup/test variants must converge or fail closed before a provider operation. Editing one PWA bundle cannot certify every recorded deployment overlay.

Raw phone/contact/chat IDs and local Client records do not establish authority. A native Telegram update does not automatically become one of the existing accepted signed channel proofs. Unproven native entry requires the existing verified sign-in/channel flow or a fail-closed response; no synthetic User, locally minted provider signature, automatic phone linking or integration-system substitute is approved. Native contact/profile/history/cancel/freed-slot work stays within the existing owner commands. No new generic profile contract or duplicate-booking policy is selected here.

### R02 — canonical staff, tenant and platform access

[R02 assessment](evidence/package5-wave-ra-r02-assessment.md) covers exactly B40/B41. Current canonical authentication/session validation, active User/Membership, tenant/provider-qualified staff access, and separately validated platform authority already exist. A16 owns supported CRM access configuration/owner claim; A25 owns explicit security commands. AC3 authentication protocol and AC5 source projection retain their narrow approved scope.

The direct native rebind branch, startup raw-admin regrant, FOUNDER_IDS/admin promotion and legacy phone/social-map session promotion must cease to grant authority. Panel/GOD/chat/history/team/native entries must validate the exact current canonical principal. Session or membership revocation must affect the next request; tenant owner does not become platform owner. Existing records are not migrated into canonical authority by inference.

R02 supplies an access boundary to later packages. Successful authentication does not resolve those packages' journal, delivery, expense, cash, settings or media business ownership. No dependent package is silently absorbed into R02.

### R10 — truthful invocation and approval receipts

[R10 assessment](evidence/package5-wave-ra-r10-assessment.md) covers B50. ActionExecution and its existing attempts, encrypted normalized input, safe results, leases and reconciliation remain the canonical lifecycle. AiToolExecution/AiApprovalRequest remain compatibility/audit records; relabelling their local `failed` state as `unknown` would not establish the required linkage.

The existing tenant/idempotency/actor/tool/surface/input-hash identity and encrypted compatibility result can retain an opaque canonical execution reference. Runtime integration must attach the reference durably after canonical admission and before possible dispatch. A failed attachment cannot permit dispatch. Recovery before attachment uses the same approved identity at canonical ingress; recovery after attachment resolves the same tenant-qualified ActionExecution and its existing executor/reconciler. No new key, provider request or second business owner is created by wrapper retry.

An outer timeout, lost response, persistence failure or audit failure does not prove canonical failure. UNKNOWN remains unresolved until existing reconciliation/manual-required policy resolves it. Late completion and proven success must remain visible; post-effect reporting errors cannot overwrite the business outcome. Only a proven terminal canonical failure may be projected as such. These are implementation obligations under the already approved contract, not a new schema or business proposal.

## 2. Local executable proof and its limits

The per-package records contain exact commands, suite/test names and source hashes:

| Package | Existing foundation proof | Known-path witness | Acceptance meaning |
| --- | --- | --- | --- |
| R01 | [R01 proof](evidence/package5-wave-ra-r01-proof.json) | Existing B38/B39/B54 evidence retained | Reusable Client/create/ownership/idempotency/confirmation foundation and existing ratchets; no relay/native remediation claim |
| R02 | [R02 proof](evidence/package5-wave-ra-r02-proof.json) | [Fake-only B40/B41 witness](evidence/package5-wave-ra-r02-known-paths.proof.py) | Reusable authentication/access foundation; current direct rebind, raw-admin role and legacy staff-session defects remain reproduced |
| R10 | [R10 proof](evidence/package5-wave-ra-r10-proof.json) | [Isolated wrapper/runtime probe](evidence/package5-wave-ra-r10-local-probe.cjs) | Existing receipt/reconciliation primitives pass; current wrapper timeout/UNKNOWN/post-success-audit collapse remains reproduced |

Observed foundation results: **18 Jest suites / 149 tests PASS**, plus **10 Python tests PASS** and **2 canonical UNKNOWN/reconciliation probe checks PASS**. Six fake-only witness cases reproduce the already known B40/B41/B50 behavior and are not remediation PASS.

The final [wave assessment verification](evidence/package5-wave-ra-stage1-verification.json) aggregates the observed counts. Tests use fake repositories/provider handlers or read-only source guards. They do not connect to PostgreSQL, invoke provider APIs, bootstrap a production application or send messages. These are executable **foundation proofs**, not repaired-package acceptance, a real PostgreSQL concurrency/restart proof or a coordinated wave release gate. Expected reproduction of the known defective paths is explicitly labelled as such; it is not a production PASS.

Runtime/schema/migration implementation was not performed in this Stage 1 checkpoint. No package-wide architectural guard is claimed installed. The existing foundation guards were exercised. The following permanent package ratchets are mandatory before a future package is declared remediated:

| Package | Permanent guard and executable negative cases required |
| --- | --- |
| R01 | All inventoried PHP/PWA/native aliases and overlays; direct appointment/provider/profile writes; phone/raw-channel/legacy authority; unchanged key transport; exact Client/tenant; same-key changed-intent conflict; concurrent/restart/UNKNOWN continuation. No directory or backup-file exemption. |
| R02 | Every native bind/admin grant and panel/GOD/chat/history/team/session gate; raw identity/legacy role promotion; canonical session/user/membership/access revocation; tenant/platform separation; mutation only through A16/A25; narrow AC3/AC5 boundaries. |
| R10 | Wrapper timeout/error/completion/replay and approval projections; durable receipt before dispatch; same-execution recovery; UNKNOWN/manual-required; late success; audit/persistence error after effect; no broad catch that fabricates terminal business failure or starts another operation. |

Each guard must run in the normal package/backend checks and include adversarial fixtures that reintroduce forbidden paths and are rejected. A comment, filename list or expected delegation string alone is insufficient. Exact proof matrices and component mappings are retained in the package assessments. This Stage 1 does not weaken the requirement to leave a permanent guard when each remediation package completes.

## 3. Wave continuation and cutover boundary

The assessed packages can enter runtime implementation using their existing contracts. Package changes must remain logically separated and integrate shared Python/proxy code deliberately. The next acceptance sequence is **package-local proof → Wave R-A integration proof → coordinated cutover plan → documented production cutover**. No package gets an independent production deployment before that plan is agreed.

The cutover plan still needs exact artifact/overlay mapping for the known Beget and VPS/Python surfaces, dependency-safe rollout/rollback ordering, preservation of B35 runtime and the applied B36 schema, and package/wave ratchets plus mandatory regression. A source proof alone cannot certify all deployed aliases. No cutover has been approved or executed by this assessment.

Do not run the full Package 5 Final Gate after each package. Run it **once after production PASS of all 14 remediation packages**, across all 13 families. Until then Package 5 remains incomplete. Chapter 6 requires its separate final acceptance gate; Chapter 7 remains unstarted. A truly new production surface absent from the closed inventory requires an inventory-defect STOP; internal details of these six existing blockers do not become new Bxx IDs.

## 4. Preserved B36 and first STOP

```text
B36 SCHEMA: APPLIED
B36 RUNTIME: NOT DEPLOYED
B36 PROOF DEFECT 1: IDEMPOTENCY KEY
B36 PROOF DEFECT 2: CONCURRENT WRITE CONFLICT
B36 NEW SCHEMA CREATED: NO

R01 STATUS: ASSESSED — FOUNDATION PROOF PASS; READY FOR IMPLEMENTATION
R02 STATUS: ASSESSED — FOUNDATION PROOF PASS; READY FOR IMPLEMENTATION
R10 STATUS: ASSESSED — FOUNDATION PROOF PASS; READY FOR IMPLEMENTATION
DECISIONS REQUIRED FROM OWNER: 0
SCHEMA PROPOSALS REQUIRED: 0
PACKAGES READY FOR IMPLEMENTATION: R01, R02, R10
PACKAGES READY FOR PRODUCTION: NONE
BLOCKERS COVERED THIS WAVE: 6/24
BLOCKERS REMEDIATED THIS STAGE: 0/24
REMEDIATION PACKAGES ASSESSED: 3/14
KNOWN REMAINING BLOCKERS: 24
PACKAGE 5 REMAINDER INVENTORY COMPLETE: YES
PRODUCTION SURFACES INVENTORIED: 32/32
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
PRODUCTION MUTATIONS/MESSAGES: 0
PRODUCTION ACCESS THIS STAGE: 0
OLD DATABASES TOUCHED: 0
MAIN 24 DIRTY ENTRIES: PRESERVED
PROCESS HYGIENE: 0
```

Package assessment/proof commits → consolidated report/evidence → push → **STOP**. The six blockers remain open for implementation and coordinated acceptance; no additional owner approval is needed for the contracts already established above.
