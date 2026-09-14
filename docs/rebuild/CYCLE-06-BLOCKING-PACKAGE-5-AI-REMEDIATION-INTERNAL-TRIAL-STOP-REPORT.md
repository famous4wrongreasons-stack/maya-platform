# Package 5 — D1 migration applied; final remediation stopped on ordinary internal trial

Status: **STOP — new A26 initial owner/provider contract decision required**

The user accepted `35dd890e` and approved the exact D1 receipt V1 and D2 CRM
handoff A. The approved D1 foundation was implemented, proved, committed and
pushed at `8e517147d5ba6d4fd489e0f0653e03a73e400dc7` and migrated to production
after its expected-only additive gate. Runtime remediation continued as
instructed. It now stops under the user's explicit new-business/schema rule.

## Completed approved foundation

Exactly three AiOnboardingDraft fields; no new models/actions. PostgreSQL
foundation proof 42/42, schema ratchets 6/6, separate clean replay of 73 repo
migrations, Prisma validation, typechecks, project lint and build/preflight PASS.
The migration gate/apply passed: pending 0, drift NONE, receipt backfill 0.
No real business/provider mutation was used for proof. See the foundation report
and `evidence/package5-ai-confirmation-foundation.json` for exact evidence.

## Undeployed runtime candidate

- AI confirmation claims an immutable revision/authority/complete child plan,
  delegates tenant creation to canonical TrialActivation, restores durable
  ActionExecution results and waits for a real A17 import before A16 commands.
  An authenticated exact-owner resume endpoint survives original claim expiry;
  a separate pending-confirmation read returns only that owner's scoped ids.
- Direct AI branding/calendar/team creation and tenant-delete/reset compensation
  have been removed from the candidate. Legacy UsersService team provisioning
  and TenantsService direct create/delete entry points fail closed.
- External ordinary trial and authorized admin creation delegate to the same
  canonical activation. Bootstrap rejects a draft-bound activation lacking its
  immutable receipt inside the transaction, closing the precheck race.
- Python consent submit/status forward original channel proof to the backend;
  old SQL writers are closed. Read-only delivery checks resolve only an existing
  tenant-qualified verified Telegram/Client link and read canonical consent,
  so legacy SQLite cannot override revocation. Challenge consumption forwards
  only the opaque token and original channel proof.
- Caller updates and full compatibility review are incomplete. The site
  candidate passes expectedDraftRevision and resumes the same receipt after
  an explicit canonical CRM activation; the separately served app still needs
  its matching AI caller updates. These are **not deployed artifacts**.

Current runtime proof: 32/32 PostgreSQL PASS using actual canonical bootstrap,
Wave 2 children, A17 transactions and AC5 projection with synthetic provider
reads. It includes fresh processes, partial failure, concurrent confirmations,
one tenant/user outcome, unchanged successful children, suspended recovery,
wrong tenant/owner/company, no mock substitution and no internal A28 writes.
Targeted backend tests 68/68; new final bypass ratchets 8/8; Python bridge tests
8/8. Any later checkpoint validation is recorded in the evidence JSON.

These results prove the external/AI candidate within its stated scope. They do
not establish complete A26 compatibility or a full regression/deployment gate.

## Exact blocker: B2-C1

Fresh production inspection on 2026-09-04 confirms the registered public
ordinary trial endpoint, enabled self-serve flag, internal-mode branch and
direct `bootstrapEnsureProviderForUser` upsert for the already created owner.
Unlike the dormant internal **AI** branch, this ordinary trial path has no
NODE_ENV/test-only gate. The published manual form also selects internal mode.

The approved atomic TrialActivation creates tenant/branch/owner/membership/
branding only. Existing A28 creation sets provider.userId=null; existing A26
provider-user creation requires a new User. Neither is an approved operation
to bind that initial provider to the already reserved owner.

Silently broadening bootstrap, creating a second owner account, directly
binding userId, or silently restricting all ordinary trial signup to CRM-only
would choose a new contract. D2 A authorizes CRM-only **AI onboarding**, not that
broader restriction. The local candidate currently rejects the unsupported
internal mode; that is an undeployed guard, **not an approved product decision
or a completed remediation**.

Decision proposal:
`package5-a26-internal-trial-bootstrap-v1-decision-proposal.md`.
No implementation of that proposed extension has begun.

## Production and remaining work

Production remains `/opt/maya-saas/releases/20260904-c06-p5-wave6-cutover-3b545671`.
Fresh health/readiness PASS; service `maya-saas` active, PID 1470307, restarts 0.
The D1 schema migration is durable, but A18/A26/AI runtime remediation is not
deployed. Do not report the production bypasses as zero.

After the owner decision, resume the same final-remediation cycle: resolve
ordinary internal trial contract, finish all DTO/caller compatibility and A18
transport wiring, prove the complete candidate, pass mandatory deployment
gates, deploy without real consent/trial/onboarding/provider smoke effects,
then perform structural/read-only production checks. Only after that passes,
restart the full Package 5 Final Adversarial Gate over all 13 families.

The final gate was not rerun; its last accepted FAIL at `ba9e9234` remains the
aggregate baseline. Accepted Waves 1–6 are not reopened. No Wave 7, Chapter 7,
or automatic Chapter 6 completion. Seventeen historical local databases remain
outside ownership and untouched.

```text
AI CONFIRMATION RECEIPT SCHEMA FOUNDATION/APPLY: PASS
CLIENT LINK CHALLENGE DURABLE IN PRODUCTION: YES
RUNTIME REMEDIATION CANDIDATE: LOCAL / INCOMPLETE
NEW BLOCKER: A26 ORDINARY INTERNAL TRIAL — INITIAL OWNER/PROVIDER AUTHORITY
PRODUCTION RUNTIME REMEDIATION DEPLOYED: NO
PACKAGE 5 FINAL ADVERSARIAL VERIFICATION: NOT RE-RUN — LAST ACCEPTED FAIL
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS FOR PROOF: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
```

Checkpoint validation: current A18 PostgreSQL proof **22/22 PASS**, targeted
ESLint and both application/scripts typechecks PASS; both HTML inline-script
sets parse (27 site / 28 app scripts). Full regression, build/deployment gates
and final production inventory were not run after the new contract STOP.
Thirty pre-existing dirty files are preserved; mixed bot/webhook/site files
stage only this task's hunks, verified by reconstructing original content hashes.

```text
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```
