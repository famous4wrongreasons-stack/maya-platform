<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: c19d747d6b002b6ba769c11a3e5610c35737ca8e2362afa763102daf574fce72 -->

Checkpoint `55380a90881d9d96c9bd929fc161f978a61b3ee0` — commit/push complete; HEAD=origin.

# CYCLE 06 — PACKAGE 5 FINAL A18 BINDING V1 / SCHEMA ASSESSMENT

Status: **BINDING CONTRACT COMPLETE — ADDITIONAL SCHEMA REQUIRED — PROPOSAL STOP**

Date: 2026-09-04. Accepted starting checkpoint: `9ae29bed`.

## Accepted decision

The user has completed A18's Client ↔ authenticated channel binding V1 contract.
Phone, name, CRM external id and heuristic matches alone are not Client
authority. Client owns CustomerProfile and ClientConsentFact; Maya User remains
optional. Tenant/provider-qualified durable verified binding is mandatory;
ambiguous identity fails closed and requires linking/re-linking.

For a Maya-authenticated PWA session, reuse a proven tenant-qualified User↔Client
relationship. Missing User or proven binding fails closed; no automatic phone
link. Telegram identity proves control only of the Telegram subject. Initial
Client binding requires explicit verified linking/challenge; subsequent commands
may reuse the verified durable link. Rebinding requires another explicit verified
operation and preserved audit evidence. Consent itself does not resolve Client
through phone or create bindings.

The contract is complete at this level. It does not assert that an existing
historical association has been verified or that guest consent is implemented.

## Existing foundation assessment

The assessment examined the canonical Prisma schema (88 models), 70 repository
migrations, relevant identity/auth/consent writers and production schema catalogs.
Production has 89 public tables: the 88 modeled application tables and
`_prisma_migrations`. There is no unmodeled application table hiding another
identity-link foundation. Catalog inspection ran in a read-only transaction;
no application rows, consent requests or provider operations were used.

| Existing foundation | What can be reused | Why it is not the required complete binding |
| --- | --- | --- |
| AuthIdentity | Authenticated provider→User identity | User and Membership required; no Client link/verification lifecycle |
| AuthSession | PWA account authentication | Requires User; session lifetime is not permanent linking evidence |
| Client.userId | Existing proven account↔Client association | Bare field is not verification evidence; no provider subject, link history or active uniqueness |
| CrmClientLink | Exact provider CRM observation | CRM identity is not authenticated channel authority; no verified challenge |
| AuthFlowState, PhoneAuthCode, EmailAuthCode | Existing authentication mechanisms | No durable Client relation; transient A30 artifacts; phone/email proof alone insufficient |
| CustomerProfile, ClientConsentFact | Client-owned projection / immutable consent | Effects of Client commands, not identity-link authority |
| UnresolvedClientIdentityHold | P02/P03 fail-closed guard | Denies ambiguous identity; does not prove a positive binding |
| UserMerge | Account merge provenance | No accountless channel→Client binding |
| MarketingConsentEvidence | Existing marketing evidence | No canonical Client FK/authenticated-subject relationship |
| AuditLog, DomainEvent | Supporting audit / observation references | Generic JSON lacks required relation, active uniqueness and guarded lifecycle |

`AuthFlowState` is specifically covered by the accepted A30 24-hour terminal
retention rule. It must not be repurposed as the only durable identity receipt,
nor made undeletable through a new permanent evidence FK. The existing Python
clients/web_sessions lack a canonical Client link, as confirmed in accepted
`9ae29bed` evidence. This cycle did not reinterpret those rows or synthesize links.

Sources: `prisma/schema.prisma` model definitions; identity/auth repository
writers; `src/package5-wave6/package5-wave6.policy.ts`; production catalog
inspection. Exact model line anchors, hashes, live table inventory and Client
foreign keys are recorded in
`evidence/package5-final-a18-client-channel-schema-v1-assessment.json`.

## Minimal proposal

`package5-final-a18-client-channel-link-schema-v1-proposal.md` proposes one new
`ClientChannelLink` table. It combines the durable provider-qualified identity
key with one immutable verified binding episode, active-subject partial unique
index, tenant-qualified Client FK, one-way audited revocation and explicit
successor history. It supports Client without User and reuses the current
canonical consent/execution facts.

No standalone duplicate identity table, nullable-User rewrite of account auth,
phone backfill or runtime workaround is proposed. Ordinary historical User/CRM
associations do not automatically become verified links. Database constraints
protect storage consistency; the verifier must still prove channel control and
exact Client authority. Schema approval does not turn a digest into proof.

## STOP and remainder

The user's instruction explicitly requires proposal → commit/push → STOP when
schema is insufficient. Accordingly, schema.prisma, migrations, runtime, deployment
and A26 paths are unchanged. No replay/proof/deployment gates were run for an
unapproved schema; none is reported as passing.

After schema approval and binding foundation completion, return to the same
authorized Package 5 Final A18/A26 Remediation cycle. The exact A26 remainder is:

- `/api/onboarding/trial` legacy bootstrap ownership;
- physical tenant-delete compensation after failure;
- direct `/api/admin/tenants` creation outside TrialActivation.

These remain unmodified and unresolved. After successful A18/A26 remediation,
mandatory gates and read-only production verification, the complete 13-family
Package 5 Final Gate must restart automatically as already authorized. Waves
1–6 stay accepted; Chapter 6 acceptance remains a separate later cycle.

## Verdict

The following YES values describe the approved contract and proposed schema
capability, not deployed guest-binding/consent functionality.

```text
A18 CLIENT-CHANNEL BINDING CONTRACT: COMPLETE
PHONE MATCH AS CLIENT AUTHORITY: NO
PWA VERIFIED CLIENT BINDING: DEFINED
TELEGRAM VERIFIED CLIENT BINDING: DEFINED
AMBIGUOUS IDENTITY FAILS CLOSED: YES
CLIENT WITHOUT MAYA USER SUPPORTED: YES
DURABLE BINDING REQUIRED: YES
EXISTING SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES
A18 CONSENT REMEDIATION CAN RESUME: NO
SCHEMA PROPOSAL: READY FOR REVIEW
SCHEMA IMPLEMENTED/APPLIED: NO
PRODUCTION MUTATIONS: 0
PROVIDER WRITES: 0
A26 BLOCKERS CHANGED: NO
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
PACKAGE 5 WAVES REOPENED: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

No temporary DB, watcher or browser was started. The catalog SSH process exited;
historical DBs were not altered or removed. Documentation/source-evidence
consistency and unchanged schema/runtime are checked before the commit.


---

# CYCLE 06 — PACKAGE 5 POST-WAVE-6 REMAINDER CHECKPOINT

Status: **CURRENT — A18 binding V1 contract COMPLETE; schema insufficient; STOP after minimal schema proposal**

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

The user then accepted `9ae29bed` and completed the A18 binding V1 business
decision: verified durable tenant/provider-qualified Client binding, no heuristic
authority, explicit initial Telegram linking/rebinding and fail-closed ambiguity.
The resulting schema assessment found no equivalent existing foundation in
repository or production catalogs. One `ClientChannelLink` model is proposed;
schema/runtime are not implemented. Current documents:
`CYCLE-06-BLOCKING-PACKAGE-5-FINAL-A18-BINDING-V1-SCHEMA-ASSESSMENT.md` and
`package5-final-a18-client-channel-link-schema-v1-proposal.md`.

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

1. Review/approve the **minimal A18 ClientChannelLink schema proposal**. The
   binding V1 business contract is COMPLETE. Existing schema is insufficient;
   no new schema is approved/applied yet. After approval, complete the additive
   binding foundation with required isolation/concurrency/evidence proof and
   migration gates. No heuristic backfill or runtime workaround.
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
PACKAGE 5 FINAL A18/A26 REMEDIATION: BLOCKED — SCHEMA PROPOSAL STOP
A18 CLIENT-CHANNEL BINDING CONTRACT: COMPLETE
EXISTING SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES
A18 CONSENT REMEDIATION CAN RESUME: NO
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

Current schema proposal STOP: reports → commit/push → HEAD=origin → STOP. After
schema approval and binding foundation completion, remediation and automatic full
Final Package 5 Gate resumption remain as listed above. Chapter 6 completion
acceptance stays separate; Chapter 7 is not started automatically.
