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
