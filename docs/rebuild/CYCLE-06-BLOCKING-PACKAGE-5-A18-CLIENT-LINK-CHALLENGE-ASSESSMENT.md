# CYCLE 06 — A18 Client Linking Challenge / schema and TTL assessment

Status: **CHALLENGE AUTHORITY APPROVED — SCHEMA + TTL PROPOSALS — STOP**

Date: 2026-09-04. Accepted checkpoint: `813107da`.

## Accepted first-link decision

The user approved a server-issued, short-lived, single-use Client Linking
Challenge. Maya binds the exact tenant/Client before presenting an opaque token
to the consumer, only after trusted server-side identity resolution. A valid
token plus current channel authentication can create the verified link atomically.
Phone, Telegram identity, bare Client.userId, name or caller CRM/Client id alone
remain insufficient. Ambiguous resolution issues no challenge.

The former first-link mechanism decision STOP is resolved by this instruction.
No additional approval of those binding invariants is requested. PWA can reuse
already proven User↔Client evidence as the trusted issuance source; other cases
must satisfy the same trusted-resolution precondition. The guest representation
does not require a Maya User. No heuristic source or historical provenance is
fabricated by this assessment.

## Schema finding

Repository: **89 Prisma models, 71 migrations**. Fresh production catalog:
**90 public tables**, exactly the 89 models plus `_prisma_migrations`; no missing
or unmodeled application table. Read-only catalog queries returned only schema
metadata, constraints and indexes. Existing ClientChannelLink is present.

No existing model can represent pending token authority, an exact tenant-qualified
Client, immutable trusted issuance evidence and atomic consumed-link outcome
without changing its approved domain/security contract. AuthFlowState has OAuth
state/redirect/PKCE fields; phone/email code rows are contact-qualified mutable
challenges. None has a Client FK or consumed ClientChannelLink relation. Existing
account/session models require User; TrialActivation concerns tenant creation.
ClientChannelLink represents completed verification and must not hold a pending
challenge, as the user explicitly requires.

Proposed minimum: **one additional `ClientLinkChallenge` model, 14 fields**,
with tenant/Client FKs, HMAC-only token, immutable issuance/expiry/evidence,
one-time consumption tuple and exact ClientChannelLink outcome. No extra identity,
policy, pending-link or delivery model. Existing link fields/lifecycle remain.

## TTL finding

No approved TTL for this new challenge purpose exists in the checked schema,
auth code/configuration, A18 decisions or Authority/Policy documents. Observed
phone/email defaults are 300 seconds; OAuth state default is 600 seconds. These
are implementation defaults for different authentication purposes, not approval
to reuse them for Client linking. A30's 24 hours is deletion retention, not TTL.

The separate decision proposes **600 seconds / 10 minutes**, server-derived,
fixed in central versioned V1, no initiator override or sliding expiry. This
duration is **not approved and not implemented**. Token expiry does not change
A30's retention periods, predicates or allowlist.

## Reviewable proposals and next boundary

- `package5-a18-client-link-challenge-schema-v1-proposal.md`: exact 14 fields,
  constraints, authority/evidence boundary, atomic consume+link protocol,
  replay/rollback semantics and complete required proof matrix.
- `package5-a18-client-link-challenge-ttl-v1-proposal.md`: separate 600-second
  policy proposal, its rationale and explicit boundary conditions.
- `evidence/package5-a18-client-link-challenge-schema-assessment.json`: fresh
  production catalog, source hashes/anchors and reconciliation findings.

The user's schema boundary requires **proposal → STOP** when schema is
insufficient, and the TTL instruction requires a separate decision before
production implementation. Both conditions apply. No schema.prisma edit,
migration generation, runtime change, challenge issue/consume, synthetic proof,
deployment or production business/provider mutation occurred in this cycle.
Required challenge tests are a plan, not a claimed PASS.

After both approvals, implement and prove the challenge foundation using the
existing canonical link writer inside the same transaction as consumption.
Resume A18 consent → A26 trial → A26 admin → gated deployment → read-only
production verification → complete 13-family Package 5 Final Gate, subject to
the existing explicit boundaries. Preserve the accepted ClientChannelLink
foundation and all six production waves. The prior three bypasses remain open.

## Checkpoint verdict

```text
A18 FIRST CLIENT-CHANNEL LINK AUTHORITY: APPROVED
AUTHORITY MECHANISM: SERVER-ISSUED CLIENT LINKING CHALLENGE
PHONE MATCH AS CLIENT AUTHORITY: NO
CLIENT ID: SERVER-BOUND
CLIENT WITHOUT MAYA USER: SUPPORTED BY PROPOSED SCHEMA
EXISTING CHALLENGE SCHEMA SUFFICIENT: NO
ADDITIONAL SCHEMA REQUIRED: YES
PROPOSED NEW MODELS: 1 — ClientLinkChallenge
PROPOSED MODEL FIELDS: 14
CHALLENGE SCHEMA PROPOSAL: READY FOR REVIEW
EXISTING APPROVED CLIENT LINKING TTL: NOT FOUND
TTL DECISION REQUIRED: YES
PROPOSED TTL: 600 SECONDS / 10 MINUTES
TTL APPROVED: NO
CHALLENGE SCHEMA IMPLEMENTED/APPLIED: NO
CHALLENGE EXECUTABLE PROOF: NOT RUN — PROPOSAL BOUNDARY
CLIENT CHANNEL LINK DURABLE IN PRODUCTION: YES — ACCEPTED FOUNDATION PRESERVED
A18 CONSENT REMEDIATION COMPLETE: NO
A26 BLOCKERS CHANGED: NO
PACKAGE 5 COMPLETE: NO
PACKAGE 5 WAVES COMPLETE: 6/6
WAVES REOPENED: 0
WAVE 7 CREATED: NO
CHAPTER 7 STARTED: NO
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS THIS CYCLE: 0
PRODUCTION SCHEMA MUTATIONS THIS CYCLE: 0
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Verification is limited to source/catalog/proposal consistency and process
hygiene. No test database or browser was started. The 17 existing databases
are outside this cycle's ownership and were not changed or removed.
