# Wave R-C — durable intent versus expiring policy attestation

**NEW SHARED SECURITY DECISION REQUIRED — PROPOSAL ONLY.** No change below is
implemented or approved. R05–R14 Option A business/schema decisions remain
accepted. This is an interoperability contradiction with the earlier Package 3
claim contract, not a new production surface or another Bxx discovery cycle.

## Exact demonstrated gap

R05/B36 admits a complete immutable OwnerReportRun and its A12 slots, preserves
those exact ActionExecutions through restart, and allows the original plan to
resume until its fixed expiry. The [approved R05 sheet](package5-remainder-e3-r05-decision-sheet.md)
requires pending slots to continue without a new root, slot, content or identity.

The [Package 3 ingress/claim contract](CYCLE-06-BLOCKING-PACKAGE-3-CANONICAL-INGRESS-RUNTIME-WIRING-REPORT.md)
requires **both persisted and current policy validity horizons**, including
approval-free executions. Production policy registration uses `validityMs=60000`
for every registered capability. `CanonicalApprovalBindingService.authorizeForClaim`
returns `APPROVAL_EXPIRED` when the stored `policyValidUntil` expires, even when
`approvalRequirement=NONE`, the current resolver returns ALLOW and the business
intent remains valid. No existing refresh/rebind API was found; retry of the
same identity loads the original row and its original attestation.

Actual owned PostgreSQL restart reproduced this on the original R05 Inbox slot:

- admission policy evaluated `2026-09-08T10:24:37.309Z`, expires `10:25:37.309Z`;
- report expiry `2026-09-15T21:00:00.000Z`, payload deadline `2026-09-15T10:24:37.286Z`;
- original execution still READY, no execution attempts, no approval required;
- current manifest/recipient checks PASS and newly evaluated policy ALLOW;
- original claim denied `APPROVAL_EXPIRED`; zero new attempts, row mutations or effects.

[Reproducer and sanitized evidence](evidence/package5-rc-policy-resume-stop/policy-gap.json).
A short restart within 60 seconds can pass and therefore does not prove the
promised durable lifetime. The original B36 UNKNOWN execution correctly remains
UNKNOWN/manual-required and does not redispatch. Its independent recipient is
what cannot continue after the old policy horizon.

**R05 LOCAL ACCEPTANCE: FAIL.** Other short restart proofs are retained as facts,
not promoted to proof beyond their attestation lifetime. The same shared guard
is a dependency of R06/R08/R12/R13 durable slots and delayed R-C commands; their
long-delay behavior must be covered together after the decision. This is static
impact analysis of already-inventoried paths, not a claim that a second production
incident occurred.

## Option A — recommended: fresh claim authority, same immutable execution

Explicitly distinguish **business intent expiry**, **short policy observation
expiry**, and **human approval expiry**. For a finite allowlist of R-C-owned
approval-free durable executions, permit a fresh canonical policy observation
at claim time after the original observation expires. Never extend an expired
business intent or human approval.

Owner remains CanonicalActionPolicyResolver → CanonicalApprovalBindingService →
ActionEngineKernel. Initiators, report stores, routes and schedulers cannot
supply or extend authority. Requirements:

1. Lock the exact tenant-qualified original READY execution. Verify original
   attestation/HMAC as admission evidence, original normalized input/hash,
   capability/version, owner binding, plan and idempotency identity. Preserve
   every original admission field; no re-signing history or replacement execution.
2. Re-resolve current tenant, User/Membership/Client provenance where applicable,
   entitlement, source owner, consent/preferences, route and policy. Require
   ALLOW, `approvalRequirement=NONE`, unchanged material subject/authority
   context, unexpired exact business intent and payload. Timestamp-only policy
   drift is not a new intent. Material policy/authority drift fails closed.
3. Current owner guards remain mandatory: frozen report/audience/order and
   predecessor outcome; exact feedback/Client/Appointment; team reservation,
   sender and retention; expense receipt/card and P407 authority; configuration
   revision; community moderation and cash expected revision. Fresh policy does
   not replace any of these checks.
4. Admit the ordinary attempt/lease and **durable claim-policy audit in the same
   transaction before effect**. Reuse `AuditLogService.log(..., tx)` with an
   exact execution/attempt reference, previous attestation hash, fresh signed
   policy evidence/hash/time/expiry and contract version. No direct audit writer,
   best-effort audit, post-effect receipt, or replacement of admission evidence.
   Existing AuditLog schema/lifecycle is reused. Locked attempt creation gives
   concurrent claim/audit one winner; transaction rollback creates neither.
5. Fresh policy must remain current before dispatch; a crash before effect cannot
   rely on an expired fresh observation. Reuse existing lease/recovery and exact
   claimed audit. Proven non-dispatch may follow only the existing bounded retry
   contract. UNKNOWN/MAY_HAVE_CROSSED never enters a fresh dispatch path: reconcile
   the same execution, preserve manual-required and cross-channel barriers.
6. No automatic renewal for REQUIRED approval, expired/rejected human approval,
   DENY/SHADOW_ONLY, terminal outcomes, expired owner/source or unavailable payload.

**Finite scope to approve:** the 13 R-C AE classes already listed in the Owner
Decision Pack, and existing A12/A13 executions only when carrying the verified
R05/R06/R08/R12/R13 durable owner/slot binding; existing `create_expense` only with
the R13 exact ExpenseIntakeBinding → original per-card approval/R10 receipt.
Existing A22 assistant-preference extension is included only for the R13 original
keyed preference command and current authorized principal. The shared helper must
not enable every approval-free capability by default. A18 consent/security,
B31/B33 booking/confirmation and unrelated Package 4/R-A/R-B actions retain their
current contract. AC6 and provider retry policies are not extended.

Why A: fulfills the approved durable same-intent/same-execution resume while
preserving short-lived current authority, original evidence and all owner gates.
The user loses no approved R-C feature. A changed/revoked authority still prevents
continuation; this is not a promise that an old intent will always execute.

**Mapping: 0 models / 0 physical fields / 0 action classes / no migration / no
backfill.** The new decision is the claim-policy security contract and its
versioned existing-audit evidence, not a new business owner or schema. Exact
allowlist/binding tests are implementation requirements, not delegated discretion
to widen this scope.

## Option B — retain the hard persisted horizon

Keep the current immutable policy lifetime as the maximum dispatch lifetime.
Explicitly narrow all affected durable-resume promises: after that horizon,
remaining never-dispatched slots become canonically NOT_EXECUTED without a new
slot/channel/identity. UNKNOWN still reconciles; historical committed outcomes
remain. Any new business intent must be explicit under its existing policy.

This needs owner approval because reports and other pending work can be lost
merely because a restart lasted more than one minute, even with valid authority
and an unexpired business plan. It does not meet the currently approved R05
resume promise. 0 models / 0 fields / 0 action classes / no migration/backfill;
a terminalization path still needs canonical runtime implementation and proof.

## Required proof after approval

Use controlled time plus real PostgreSQL/process restart, not a timing race:
original claim at admission; restart after 60 seconds and after 15 minutes but
before business expiry; unchanged current authority resumes the same IDs/order;
revoked/changed authority and expired owner cannot; required approval cannot renew;
concurrent claim has one attempt/audit; crash before/after claim preserves evidence;
UNKNOWN does not resend or cross channels; old attestation/intent unchanged;
A18 and B31/B33 regressions preserved; per-package delayed R-C proof then aggregate
mandatory gates. Do not shorten the test wait or inflate the registry TTL to
make the current failure disappear.

```text
RECOMMENDED OPTION: A
EXISTING R-C BUSINESS/SCHEMA DECISIONS: PRESERVED
NEW SHARED SECURITY DECISION REQUIRED: YES
NEW MODELS: 0
NEW PHYSICAL FIELDS: 0
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: NO
BACKFILL REQUIRED: NO
ORIGINAL EXECUTION / INTENT / ADMISSION ATTESTATION: PRESERVED
REQUIRED HUMAN APPROVAL AUTO-RENEWAL: NO
UNKNOWN REDISPATCH / CHANNEL FALLBACK: NO
PROPOSAL APPROVED: NO
WAVE R-C CUTOVER: NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
```
