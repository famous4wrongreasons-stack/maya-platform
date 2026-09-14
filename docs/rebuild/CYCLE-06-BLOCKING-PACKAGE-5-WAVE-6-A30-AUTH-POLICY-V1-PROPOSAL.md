# CYCLE 06 — PACKAGE 5 WAVE 6 A30 AUTH POLICY V1 — APPROVED

Status: **APPROVED — explicit user approval after checkpoint 178b39f2; implemented locally**

Source checkpoint: `ef454c1c`. Date: 2026-09-03 UTC.

## Approved decision

The user explicitly approved the exact central auth eligibility policy below
as the Wave 6 V1 contract, preserving the existing default predicates. D7-A already approved
central versioning, the narrow allowlist, caps and the maintenance schema.
This proposal resolves only the numerical auth intervals and the
consumption/revocation trigger reservation in the approved brief.

Approved immutable policy key: `package5.a30.auth-retention`, version `1`.

| Class | Approved eligible predicate at frozen evaluation time T |
| --- | --- |
| AuthSession | expiresAt < T − 30 days OR revokedAt < T − 30 days |
| PhoneAuthCode | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| EmailAuthCode | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| AuthFlowState | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| AuthRateLimitBucket | windowEndsAt < T − 24 hours |

Null consumption/revocation timestamps do not match. AuthRefreshToken is
never independently selected; only tokens belonging to an eligible parent
session may be removed with it. Active-session replay-detection history stays
intact. Sessions and all dependent token effects must fit the proven run cap;
oversized work fails closed rather than silently exceeding it.

The approved V1 values are frozen in reviewed policy, not changed by existing
environment duration overrides. A policy change needs a new reviewed version.
Batch requests may reduce the central default of 1,000 within the approved
hard ceiling of 10,000; they cannot expand the data classes or predicates.
No larger/manual destructive envelope is enabled by this proposal.

Quarantine remains a separate class/policy using its already-declared
`expiresAt < T`; its retention period is not recalculated or shortened here.
Each run binds one class, one scope, version and cutoff; the coordinator must
freeze identity and recheck exact target eligibility inside its transaction.

Why this proposal: it avoids silently moving auth cleanup to immediate expiry
and preserves the five existing default selection predicates. These values
are now explicit canonical policy under the user's approval, not merely
evidence inferred from the old code.

## Existing decisions that remain binding

- Platform-owned automatic AC6 runs use durable maintenance envelopes/claims,
  with no fabricated tenant ActionExecution or new tenant configuration.
- AI execution/approval history, AI memory/session cleanup and legacy Python
  Client/gift-certificate PII anonymization remain outside the initial
  automatic allowlist. Their legacy execute paths must fail closed during
  convergence; no new durations for them are proposed.
- No tenant hard delete, profile/consent ownership change, source-evidence
  rewrite, fake history, provider mutation or legacy mutating fallback.
- No additional schema is proposed; Common Foundation is already applied.
- Policy approval authorizes continuing the requested **safe local** Wave 6
  cycle only. Production destructive apply and Wave 6 runtime cutover remain
  separate boundaries. This proposal is not permission to run production
  cleanup, including for a smoke test.

## Safe-local implementation boundary

Re-evaluate the blocked policy rows in the Runtime Contract Gate, then complete
all six classes together: canonical AC6 runtime alignment, deterministic
read-only Shadow manifests, targeted tests, disposable PostgreSQL
adversarial/concurrency and restart proof, consolidated executable proof and
exact bypass ratchets including the disallowed maintenance paths.

Verify the planned final coverage against all 13 Entry Gate families. Preserve
Waves 1–5 and Packages 1–4. Commit/push the results and STOP before production
runtime cutover; do not start Final Package 5 Gate or Chapter 7.

## Approval invariants

```text
AUTH RETENTION POLICY V1: APPROVED
STANDARD AUTH RETENTION: 30 DAYS
SHORT-LIVED AUTH ARTIFACT RETENTION: 24 HOURS
RETENTION POLICY OWNER: MAYA CENTRAL VERSIONED POLICY
TENANT-CONFIGURABLE AUTH RETENTION IN CHAPTER 6: NO
ACTIVE/NON-TERMINAL AUTH FACT DELETED BY AGE ALONE: NO
DELETION REQUIRES ALLOWLISTED RECORD CLASS + APPROVED TERMINAL PREDICATE: YES
RETENTION CLOCK SERVER-DERIVED: YES
CLIENT/INITIATOR-SUPPLIED RETENTION DEADLINE AUTHORITATIVE: NO
POLICY CHANGE REQUIRES NEW VERSION: YES
SILENT CONSTANT CHANGE: FORBIDDEN
AUDIT/EVIDENCE REQUIRED FOR MAINTENANCE DELETION: YES
```

The policy object and its rules are frozen at runtime. The V1 predicate/period
map is pinned by the regression digest
`9fc9734d27a82ce042ec46eb26b454329749ea877811733dbc70c06bf799f9e7`.
