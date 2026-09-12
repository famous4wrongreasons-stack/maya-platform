# Chapter 7 P06 — shared measurement consumers and acceptance

P06 completes the frozen consumer scope Q16/Q17/Q19/Q20/Q21. It does not add a requirement, source owner, business action, migration or provider operation. P01/P02/P05 and Wave 3 P03/P04 production receipts remain the foundation. Production completion is recorded only after the coordinated cutover receipt below.

## Result and authority

Existing analytics, cabinet, AI, reputation and owner-report readers now consume the shared deterministic Measurement foundation. The typed `c7.measurement.read/1` projection preserves basis, unit, currency, window/timezone, asOf, completeness, qualification and attribution. Missing cash/refunds/profit remain unavailable; provider transaction gross is labelled separately. Currency groups are never collapsed into one monetary ranking. Comparisons use the P02 comparability rules.

`GET /api/analytics/measurements` is a live read, not admission. The opaque `/:id` address reads the exact unexpired historical snapshot and never substitutes the latest revision. Current membership, tenant, feature and branch/Staff permissions are checked before and after reads. Manager has no implicit company-finance permission. Own-Staff salary/goal reads retain the P04 source authority and owner-private A22 configuration boundary. Open-month goal queries disclose the normalized calendar-month window and current asOf; other windows do not manufacture progress.

AI receives the same measured values through a minimized projection: no subject IDs, raw evidence, contacts, arbitrary source dimensions or category labels. Source/scale groups remain distinguishable. AI does not compute money, completeness or attribution. Known CRM booked quotes and exact payroll source facts remain available to authorized owner reports; provider payment-account labels cannot certify cash. Operational appointment/attendance counts and verified salary detail rows are preserved.

Existing OwnerReportRun admission/delivery remains the report owner. Its stable occurrence pins one MeasurementRevision snapshot with the original asOf, hash and 365-day expiry. Retry/concurrency reuse that receipt. Later authoritative changes affect current reads, not the published report. Read-only diagnostic rendering observes facts without admitting a snapshot. Existing authorized snapshot download/retention remains unchanged; no contact/PDF export is added.

`GET /api/audit` is owner/business-owner only and rechecks current membership. It reads `scope=tenant`, eight fixed event categories, a maximum 31-day window and 100 rows. Stable timestamp/id pagination is bound to tenant/window. Only audit row ID, timestamp, action and entity type are selected; no raw payload, actor/entity IDs or platform rows are fetched. AuditLogService remains the writer.

## Requirement-to-proof mapping

| Requirement | Implementation | Executable acceptance |
|---|---|---|
| Q16 | MeasurementReadService, shared presenter, existing HTTP/AI/PWA/OwnerReport consumers | `measurement.read.spec.ts`, `measurement.pwa.spec.ts`, owner-report regression, AI surface truth; PostgreSQL consumers checks 1–10 |
| Q17 | Current role/branch/Staff/feature checks, minimized AI projection, immutable expiry, unchanged authorized download | Measurement read and tenant-audit suites; PostgreSQL revocation, historical receipt, no-User Client, same values/safe projection; inherited report retention/download guards |
| Q19 | Mandatory C7 consumer/PWA ratchets plus existing C6 owner/identity/CD/value/AI guards | Standard unfiltered mandatory Jest release command; finite 32-surface final coverage matrix |
| Q20 | Committed candidate, expected schema, exact VPS patch, standard backend canary release, read-only artifact proofs | Toolchain/replay/structural scripts, live R01 verifier, VPS consumer verifier, bounded Python/launcher preservation proof |
| Q21 | TenantAuditReadController/Service, no new writer or model | `tenant-audit-read.spec.ts`; real PostgreSQL cross-tenant/platform exclusion, timestamp ties, bounded cursor and revoked authority |

Evidence lives in [chapter7-p06](evidence/chapter7-p06/): targeted summary, toolchain, clean replay/drift, 41 P01 + 18 source-correction + 10 P03 + 9 P04 + 13 P06 PostgreSQL checks. All database scenarios use only the new owned loopback cluster; no protected database or production business state is used. The P02/P05 nine-check receipts each remain in the Wave 2 report and their unit/architectural tests remain mandatory.

The integration corrections retire only assertions contradicted by approved D4/D6/D7: unqualified transaction totals as cash/profit, default salary/potential and incomparable period claims. Existing golden operational fields, expense command/approval behavior and confirmed source salary rows are retained. No suite is excluded, no timeout is increased and no lint/test configuration is weakened. New negative tests cover forged/current permissions, PII minimization, unsupported windows and malformed/mixed-currency displays.

## Schema and release boundary

P06 adds zero models, physical fields, migrations, business actions and AC6 classes. C7 remains one MeasurementRevision / 37 physical fields / one applied migration / one AC6 retention class. The source-safe Appointment FK and immutable source/history rules are unchanged. Clean replay validates all 94 repository migrations; production has 97 recognized historical entries, pending 0 and no drift.

The active VPS PWA is a separately versioned production variant without the repository's rich chat component. The exact patch preserves its unrelated identity/routing/UI code, changes only existing cabinet measurement consumption and inserts identical pure formatting helpers. The full recovered HTML is private and is not committed. Both variants parse all 25 inline scripts and satisfy the permanent PWA guard. Server-rendered chat text covers the VPS variant; the repository rich card displays the same facts.

After all local gates and HEAD/origin verification, the coordinated P06 cutover publishes only the pinned `/var/www/maya-platform/app.html` candidate, immediately followed by the standard backend release. During that short transition, absent typed finance is explicitly unavailable. Exact pre-state hashes, allowed backend identities, private immutable recovery backup and atomic replacement are enforced by `deploy/platform/chapter7-consumers/publish-vps-pwa.py`. Recovery may restore only that own candidate if backend cutover cannot complete. No Beget maintenance or backup file is published.

The standard backend release now runs the live VPS PWA guard alongside the R01 relay guard before upload, before activation and after activation. The production structural proof pins all compiled JavaScript, all C7 schema definitions and read-controller authority metadata, then checks unauthenticated reads, migration/drift and health/readiness. No real business/provider/message scenario is executed.

## Finite preservation, not a new inventory

The frozen manifest supplies the 32 surface groups and their inherited ratchets. The bounded preservation proof reads 122 known Python artifacts, runs 15 existing static guards, compares seven known cron/config files and five known service states. Its hashes include already accepted `31126aa5` and maintenance/registry-refresh upstream receipts; it does not mistake the older C6 snapshot for the later certified baseline. R01 verifies the established 42-entry public manifest and 128 denied HEAD paths. No private Beget vhost access or theoretical-alias search is required.

The dormant/loyal scenario remains split: C7 provides exact observed Client visits/outcomes and qualified monetary facts; C8 owns valuation/ranking, C9 strategy/orchestration and C10 autonomy. Unknown visit history is not dormancy; scoring is not consent. PushSMS, mass contact export, causal uplift without evidence and the broader bridge credential migration before L3 remain deferred.

P06 LOCAL/PRODUCTION and final Chapter 7 verdicts are recorded in the subsequent gate receipts. Chapter 8 is not started. Production proof business/provider/message effects: 0.

## Final local acceptance

P06 LOCAL ACCEPTANCE: PASS. P06 REQUIREMENTS: 5/5 local PASS (Q16/Q17/Q19/Q20/Q21; production attestation follows cutover). Mandatory regression: 435 suites / 3653 tests PASS, zero skipped/failed tests. Exact architecture-only and architecture-plus-ratchet selections are recorded in [mandatory summary](evidence/chapter7-p06/mandatory-summary.json). Lint, both typechecks, build, Prisma, clean replay and schema drift PASS. Full P01/source-owner/P03/P04/P06 PostgreSQL proof: 91 checks PASS. Targeted consumer/compatibility/relay selection: 30 suites / 359 tests PASS. No production acceptance is inferred from this local result.
