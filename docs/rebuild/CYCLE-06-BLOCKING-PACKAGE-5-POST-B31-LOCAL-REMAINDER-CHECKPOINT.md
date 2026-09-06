# Package 5 remainder — B31 local candidate; contract STOP at G1

The [B31 local contract STOP report](CYCLE-06-BLOCKING-PACKAGE-5-B31-LOCAL-CONTRACT-STOP-REPORT.md)
at accepted checkpoint `49e3376f` remains the executable evidence baseline.
The owner confirmed STOP and requested only a
[B31 Idempotency Schema Decision Sheet](CYCLE-06-BLOCKING-PACKAGE-5-B31-IDEMPOTENCY-SCHEMA-DECISION-SHEET.md).
That sheet is a proposal awaiting approval, not authority to implement it.
Read both before changing runtime or schema. The candidate is **not deployed
and not accepted for deployment**.

B29/B30 remain accepted production baselines; the last documented release is
`20260906-p5-b30-ad1d91b9`. Package 4 remains complete. Package 5 has 6/6 waves
and 13/13 inventoried families, but is **not complete**. Chapter 6 is not
complete. No Wave 7 or Chapter 7.

B31 HTTP/AI creation now locally resolves the existing verified Client binding
and uses `create_appointment` / Action Engine for internal and CRM calendars.
Accepted rows carry exact `mayaClientId + tenantId`. The candidate also
coalesces concurrent loops after canonical ingress, while preserving database
claims and UNKNOWN/reconciliation. No schema/model/action class was added.

**STOP / B31-G1:** one ActionExecution stores only the first caller key.
A second key accepted as a logical duplicate is not durably bound. Reusing
that second key with changed booking data creates a second successful
Appointment/Execution. The first-key control correctly rejects the change.
This violates the existing Schema Gate's changed-payload conflict rule.

[Exact real-PostgreSQL proof](evidence/package5-b31-secondary-idempotency-alias.proof.json)
uses compiled HTTP/canonical execution, synthetic fixtures and zero provider
calls. Required alias storage must be approved before a schema extension is
implemented. No in-memory or unrelated-ledger substitute was introduced.

Current gate: ordinary regressions/architecture/lint/typechecks/build and clean
79-migration replay pass; the mandatory executable alias case fails. Full
ordinary backend result is recorded in the STOP report. **Do not deploy this
checkpoint just because ordinary Jest is green.** No post-B31 production
Final Gate has run.

Next: obtain approval of the schema decision; do not implement migration/runtime
before it. Recommended A adds one alias model and three execution columns
(9 persisted scalar columns in total); alternative B uses two models. Neither
is implemented. Historical fingerprints are not backfilled. After approval,
resolve G1, complete B31's failing regression, repeat every mandatory gate, and
deploy only after all pass. Then restart the full Package 5 Final Completion
Gate across all 13 families. Chapter 6 acceptance remains separate.

The main dirty worktree and all 17 pre-existing test databases were untouched.
The existing isolated worktree is retained. Owned synthetic database/process
state and the final commit are recorded at handoff; no destructive cleanup was
performed.
