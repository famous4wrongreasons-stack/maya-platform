# CYCLE 06 — PACKAGE 5 POST-WAVE-6 REMAINDER CHECKPOINT

Status: **CURRENT — A18/A26/AI deployed baseline ACCEPTED; B5/B6 contracts
reconstructed; STOP on minimal schema and explicit preference/CRM policy proposals**.

Date: 2026-09-04. Latest accepted checkpoint: `225ba5e1`; the user accepted the
A18/A26/AI deployment and authorized conditional B5/B6 remediation.
Runtime source `94543056` is deployed at
`/opt/maya-saas/releases/20260904-p5-final-remediation-94543056`.
Package 5 is not complete. No Wave 7 or Chapter 7 is created or started.

Current evidence and exact STOP:

- `CYCLE-06-BLOCKING-PACKAGE-5-B5-B6-CONTRACT-RECONSTRUCTION-STOP-REPORT.md`;
- `package5-b5-visit-mood-v1-decision-proposal.md`;
- `package5-b5-b6-client-preferences-schema-v1-proposal.md`;
- `evidence/package5-b5-b6-contract-reconstruction.json`;
- `CYCLE-06-BLOCKING-PACKAGE-5-DEPLOYED-REMEDIATION-FINAL-RECHECK-STOP-REPORT.md`;
- `evidence/package5-deployed-remediation-final-recheck.json`;
- `CYCLE-06-BLOCKING-PACKAGE-5-A26-INTERNAL-BOOTSTRAP-REMEDIATION-REPORT.md`.

This replaces the prior request to authorize B5/B6 reconstruction. That
authorization is now supplied; implementation stops only because the user's
Stage 1/2 require approval of the newly identified schema/business decisions.
Earlier STOP reports remain historical evidence; their unresolved statuses
are not the current statuses of already repaired paths.

## Accepted work preserved

| Wave | Families | Accepted production baseline |
| --- | --- | --- |
| 1 | A22, A23 | COMPLETE |
| 2 | A16, A25, A26 | COMPLETE |
| 3 | A15, A17, A18 | COMPLETE |
| 4 | reduced A27, A28 | COMPLETE |
| 5 | A29, A31 | COMPLETE |
| 6 | A30 | COMPLETE; six AC6 maintenance classes |

Waves 1–6 are not reopened. Their accepted completion is separate from the
aggregate no-alternate-owner certification, which remains incomplete.
The inventory set is exactly 13 families; missing/extra inventory labels
are zero. Global canonical coverage and zero remaining bypasses are not proven.

The approved ClientChannelLink, 600-second ClientLinkChallenge V1 and three-field
AI confirmation receipt foundations are durable in production. Do not recreate
them, backfill fake facts, or request their already supplied approvals again.
Production has all 73 repository migrations plus three historical migration
records: pending 0, drift NONE at postdeploy verification. The current A26
internal-bootstrap cycle added no schema.

The previously confirmed consent, public trial, admin creation and AI confirm
paths are remediated and deployed:

- Consent uses the durable verified channel binding and canonical Client command;
  direct Python consent SQL helpers fail closed. First linking still requires
  approved challenge authority, without phone/User heuristics.
- Public/admin trials use atomic TrialActivation. Internal mode creates one
  initial owner/provider only, without schedules, services, prices, extra staff
  or CRM identities. No physical tenant deletion or legacy bootstrap fallback.
- AI uses immutable receipt and exact revision, durable child outcomes, waiting
  for real CRM connection/import and A17/A16 continuation. No mock linking,
  direct A28 write or internal-bootstrap substitution for CRM mode.

AI/A26 PostgreSQL proof 47/47, A18 PostgreSQL proof 22/22, Python/PHP transport
8/8 each, candidate regression 327 suites / 2726 tests and sequential mandatory
deployment gates passed. The deployed source, bounded Python/PHP/caller patches,
health/readiness, targeted ownership and AC6 policy were verified read-only.
No real business/provider smoke mutation was issued.

## Current exact blockers

**B5 — A18 `POST /api/set-visit-mood`.** The active Python PWA handler uses
legacy client lookup and phone matching, then directly upserts `visit_mood`
and updates `clients.default_visit_mood`, including the future-visit profile
preference. No verified canonical Client/command execution owns that mutation.
Its deployed `yclients.append_record_comment` also performs a direct provider
PUT before shadow observation. This live helper differs from committed source
and prevents certification of the Package 1 appointment baseline. It was not
changed in the approved remediation deployment.

**B6 — client/A22 notification preferences, `POST /api/cabinet/notify-prefs`.**
The active handler directly writes `notify_prefs` via a legacy chat-derived
Client. Even a read-mode payload can create a new legacy Client through
`get_or_create_client`. There is no demonstrated canonical owner for these
client notification fields; existing membership-oriented A22 commands must not
be assumed to cover different subjects/policies. This also affects the A18
Client identity and no-hidden-read-mutation boundary.

Both routes are registered in the active PWA process and exposed by the
published PHP proxy. Exact deployed function bodies, hashes and isolated
in-memory reproductions are recorded in the evidence. No request was
submitted to those live mutation endpoints. Global bypass totals are not
inferred from the two observed endpoints: further inventory certification
stopped when these blockers were confirmed.

## Current reconstruction result

B5 is a Client-owned default plus an exact per-visit preference. CustomerProfile
and Appointment have no local mood fields. CRM presentation is a separate effect;
Package 1 A07 already supplies a canonical comment executor, but does not decide
whether B5 must automatically synchronize or how its local/provider outcomes
are coupled. Proposed option A keeps V1 local to Maya; option B retains CRM sync
only with an explicitly proved durable handoff and Client/appointment authority.

B6 is Client-owned communication preference state, separate from consent.
Existing tenant-wide/member-owned preference models cannot represent it. Row
existence currently changes downstream policy, and enabled reminder hours 0 has
inconsistent meanings. Those decisions cannot be inferred from legacy constants.
The exact proposal is three nullable fields, no new models, no backfill, plus
explicit V1 default/no-op/reminder semantics. Neither proposal is yet approved.

Production catalogs/source hashes and health were checked read-only; runtime is
unchanged, all 73 repository migrations are present, pending 0. No new schema,
runtime, ratchet, proof or deployment implementation has begun.

## Remaining work, in order

1. Obtain the owner decision on the exact **B5 mood/CRM option** and
   **B5/B6 three-field schema plus V1 preference policy** proposals. Preserve
   the deployed A18/A26/AI baseline. Do not request repeat approval for the
   already accepted Client binding/challenge/receipt or generic A07 foundation.
2. After approval, implement the bounded additive schema, guards, local proof
   and clean replay; apply only after an expected-only green production migration
   gate. Then finish the canonical runtime/callers/readers and strict ratchets.
   After local adversarial proof and mandatory deployment gates, deploy and
   verify actual live Python/PHP/Nest routing read-only.
   A local helper's canonical code is not evidence that production runs it.
3. Restart **PACKAGE 5 FINAL ADVERSARIAL VERIFICATION / COMPLETION GATE** from
   the beginning, including all 13 families, production-reachable scripts,
   provider callbacks, schedulers, read paths and narrowly proven exceptions.
   Then run the required fresh sequential schema/ratchet/adversarial/full
   regression/type/lint/build gates and Packages 1–4 baseline verification.
   The current final gate stopped before that sequence; prior deployment PASS
   results cannot stand in for it.
4. Only after Package 5 COMPLETE: YES may the separately authorized
   **CHAPTER 6 FINAL COMPLETION / ACCEPTANCE GATE** begin. Do not declare Chapter
   6 complete automatically or start Chapter 7.

Permanent boundaries: D1-A…D7-A, P02/P03 hold, no tenant hard delete,
Client-owned profile/consent, prospective configuration, immutable recovery
evidence, central/versioned allowlisted retention and no legacy mutation
fallback. A30 remains AC6 coordinator → durable MaintenanceRun/ItemClaim with
Policy V1 (30 days standard / 24 hours short-lived), without an artificial
Action Engine route. Existing provider-write UNKNOWN/reconciliation contracts
remain required where applicable.

```text
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
APPROVED A18/A26/AI REMEDIATION DEPLOYED: YES
REMEDIATION PRODUCTION VERIFICATION: PASS
CURRENT BLOCKERS: B5 /api/set-visit-mood; B6 /api/cabinet/notify-prefs
B5/B6 CONTRACT RECONSTRUCTION: COMPLETE
EXISTING SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES — THREE NULLABLE FIELDS PROPOSED
B5/B6 SCHEMA/POLICY APPROVED: NO
B5/B6 RUNTIME IMPLEMENTATION STARTED: NO
PACKAGE 5 GLOBAL CANONICAL COVERAGE: NOT PROVEN
REMEDIATION FULL REGRESSION: PASS — 327 SUITES / 2726 TESTS
FINAL FULL REGRESSION: NOT RUN — STOP AFTER NEW INVENTORY BLOCKERS
PENDING MIGRATIONS: 0
SCHEMA DRIFT: NONE AT ACCEPTED DEPLOYMENT BASELINE; FULL GATE NOT RERUN
REAL PRODUCTION MUTATIONS FOR FINAL PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 6 COMPLETE: NOT DECLARED
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
PRE-EXISTING DATABASES DELETED: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

The 17 historical local databases remain outside this task's ownership and are
untouched. Their provenance/cleanup audit is separate and deferred until after
Chapter 6. No new implementation wave accounts for these blockers.
