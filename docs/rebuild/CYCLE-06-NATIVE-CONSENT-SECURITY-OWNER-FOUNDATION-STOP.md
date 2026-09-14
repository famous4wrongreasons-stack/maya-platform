# Native consent admitted-state repair — owner foundation assessment

2026-09-08, accepted checkpoint `e9d3d3a2`.

**The security outcome is approved; its required durable consent invalidation
owner is not present. COMBINED BASELINE CERTIFIED: NO.** The user's explicit
schema/owner STOP applies. No repair, migration, deployment or R-C implementation
was attempted. A [minimal schema/action mapping](package5-native-consent-security-invalidation-schema-proposal.md)
is ready for review: **one model, twelve physical fields, one AC1 action, no
backfill**. This is separate from the already approved R-C envelope.

## Repository preflight and preserved work

`git fetch origin` completed. The isolated worktree is
`/tmp/maya-native-consent-baseline`, branch `contour/native-consent-baseline`.
Starting HEAD and its origin both equal
`e9d3d3a27d63ed41f7f83040fd0e064d4280e32a`; clean, no unpushed commits.
Canonical origin remains `b6c53ff9ee31bb43d0419f5ce32aa6b0e4999ae0`.
Only documentation and sanitized evidence are added by this checkpoint.

Prospective G1/G2 WIP `770a268c` is unchanged. Its incomplete test/PWA work is
still WIP; neither G1/G2 acceptance nor production readiness is claimed.
The separate R-C worktree remains clean at `ed13d57f`; its eleven pinned WIP
trees, three synthetic database dumps and approved owner/schema decisions are
preserved. Main worktree entries/content were only read for the preservation
check; no reset, stash, clean, rewrite, deployment or database lifecycle operation.

## Exact current production evidence

Reran the existing [read-only audit](evidence/native-consent-admitted-state-readonly.cjs)
inside the existing release. The [result](evidence/native-consent-security-owner-production.json)
at `2026-09-08T09:00:32.054Z` confirms:

- Release: `20260908-native-consent-compat-b6c53ff9`.
- One affected link is still active; challenge evidence matches its verification
  evidence. Target fingerprint:
  `2f5ead7db7dc3844f52a3294f1f80e4432321eb4ca548b391b9f24bfd9f5e0cd`.
- Marketing and privacy are still historical `grant`, `client_command` facts from
  SUCCEEDED `record_client_consent` executions. Both trusted input hashes verify;
  both inputs name the exact affected link and Client. The deployed binding
  predicate still accepts the recorded fields. Receipt fingerprints:
  `8987b79ea5544cac0610cb5e68f28c887602bf363a407b6a3680dbcadc4d3db6`
  and `3dbc11747b322094cd02e8c76157c6093811c16a0406331d18bc282137d40af1`.
- Transaction: `REPEATABLE READ READ ONLY`, followed by rollback. No raw IDs,
  credentials, contact data or decrypted execution inputs emitted.

These are the same pinned affected records, not a new production surface or a
broadened heuristic selection. The audit proves provenance correspondence and
current active-link acceptance; it does not claim a full live marketing delivery
eligibility evaluation. It submitted no consent or delivery command. Production
backup and exact remediation admission remain future pre-mutation requirements.

## Why the existing owner cannot complete the approved correction

Source digests and exact line anchors are recorded in
[foundation evidence](evidence/native-consent-security-owner-assessment.json).

| Source | Finding / implication |
| --- | --- |
| `src/crm/client-channel-link.service.ts`, `revoke` / `revokeVerified` | Existing revocation semantics and replay are reusable. Runtime `verifyRevocation` is closed, and the method owns its own transaction; an incident-authorized composition seam is needed |
| `prisma/schema.prisma`, `ClientConsentFact` | Immutable historical decision, no targeted security invalidation relation |
| `20260903120000_package5_common_authority_foundation/migration.sql` | Decision CHECK is grant/revoke only; append-only trigger rejects UPDATE/DELETE |
| `src/package5-wave3/package5-wave3.service.ts`, `resolveActor` / `record_client_consent` | Consent requires verified Client channel authority and creates `sourceType=client_command`. A platform repair cannot truthfully use it as a Client revoke |
| `src/action-engine/package5-wave3-executable.contract.ts` | Closed operation/actor/input contract has no security invalidation action |
| `src/communication-delivery/communication-bulk-policy.service.ts`, `current` | Reads latest grant/revoke facts plus profile projections; has no fact invalidation check |
| `src/auth/auth-retention.repository.ts` / AC6 models | Specific cleanup owners; no security consent correction policy |
| R02 platform principal and Wave 2 platform actor mapping | Verified existing security actor foundations can be reused; no need to invent Client, User or tenant Membership |

The assessed source set includes the existing maintenance/security owners,
registry/contracts, all non-test consent fact references and the corresponding
schema models. Audit JSON, CRM holds and expense invalidation owners cannot be
relabelled as a consent owner. No existing canonical path was found that could
atomically revoke this link **and** invalidate the exact grants with durable
tenant/Client-qualified history and retry semantics.

The proposal therefore adds a typed append-only `ClientConsentInvalidation`
relation and a narrow action inside the existing A18 owner. Existing ActionExecution
owns admission/outcome; existing link owner owns revocation. All effects and
canonical effective projection changes must be one transaction. Consumers must
deny an invalidated current grant, never resurrect an older grant by filtering
the invalidated row out of history. New verified consent remains a new existing
Client command, not a migration or an automatic grant.

## Verification performed and limits

Completed: repository/source/closed-contract assessment; fresh read-only exact
production evidence; document/source-anchor and diff checks; main/R-C preservation
checks. [Hygiene evidence](evidence/native-consent-security-owner-hygiene.json)
records the preserved entries, file hashes, WIP trees and dumps.

**Not run:** synthetic PostgreSQL remediation proof, runtime acceptance,
125-consent-test suite, lint/typechecks/build, migration replay or production
cutover gates. There is no approved new schema/action implementation to test.
The required proof matrix and safe cutover dependencies are in the proposal;
they are requirements, not PASS results. No test databases or persistent test
processes were created. No old databases were accessed.

No production mutation exception was consumed. In particular, the affected link
was not revoked, consent projections were not cleared, historical facts were not
changed, and no fake Client revoke was submitted. The current authority therefore
remains unremediated; baseline certification and R-C must remain blocked.

## Status

```text
ADMITTED-STATE SECURITY BUSINESS DECISION: APPROVED
KEYLESS NATIVE CONSENT OPTION A: APPROVED
EXISTING LINK REVOCATION FOUNDATION: REUSABLE
EXISTING CANONICAL SECURITY/CONSENT REMEDIATION OWNER SUFFICIENT: NO
NEW SCHEMA REQUIRED: YES — PROPOSED, NOT IMPLEMENTED
PROPOSED NEW MODELS: 1
PROPOSED NEW PHYSICAL FIELDS: 12
PROPOSED NEW ACTION CLASSES: 1
BACKFILL REQUIRED: NO
AFFECTED LINK REVOCATION: NOT PERFORMED
AFFECTED PRIVACY/MARKETING SECURITY INVALIDATION: NOT PERFORMED
HISTORICAL AUDIT EVIDENCE: PRESERVED
NEW VERIFIED CONSENT REQUIRED: YES
G1 A18 PROVENANCE: NOT CERTIFIED
G2 CONSENT IDEMPOTENCY: NOT CERTIFIED
COMBINED BASELINE CERTIFIED: NO
R06/R08 PROOFS RESTORED: NO
WAVE R-C WIP: PRESERVED
WAVE R-C READY TO RESUME: NO
NEW PRODUCTION SURFACES: 0
INVENTORY DEFECT: NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION REMEDIATION MUTATIONS: 0
PRODUCTION MUTATIONS/MESSAGES/PROVIDER EFFECTS FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES: 0
OWNED WATCHERS: 0
OWNED BROWSERS: 0
OWNED TEMP DATABASES: 0
PROCESS HYGIENE: 0
```

Report/proposal/evidence are pushed only to `contour/native-consent-baseline`
without force; HEAD equals that branch's origin after push. Canonical `b6c53ff9`
and R-C `ed13d57f` remain unchanged. **STOP at the new schema/action mapping**,
as explicitly required when the existing security/consent owner is insufficient.
