# Native consent — already admitted production authority requires a repair decision

2026-09-08. Accepted checkpoint `ed13d57f` and **keyless retirement Option A
APPROVED**. That decision remains approved and is not reopened.

**COMBINED BASELINE CERTIFIED: NO.** Read-only production evidence discovered
already admitted effects of the unproven issuer: **one active ClientChannelLink
and two successful grant receipts that actually reference it**. This is the
separate historical authority/consent repair boundary, not a new production
surface, a new Bxx, a schema request, or a failure to implement keyless rejection.

## Baseline and isolation

`git fetch origin` confirmed canonical origin `b6c53ff9` and the existing contour
checkpoint `ed13d57f`, clean and without unpushed work. A separate isolated
worktree `/tmp/maya-native-consent-baseline`, branch
`contour/native-consent-baseline`, starts from canonical `b6c53ff9`. The existing
R-C worktree/commits were not rewritten, merged or reapplied.

Production still points to `20260908-native-consent-compat-b6c53ff9`.
`maya-saas` / `barbershop-bot` are active and health/readiness return HTTP 200.
No deployment, service restart or production migration was performed.

## Exact new evidence

[Read-only audit source](evidence/native-consent-admitted-state-readonly.cjs) and
[sanitized result](evidence/native-consent-admitted-state.json), observed
`2026-09-08T08:52:15.935Z`:

| Observation | Result |
| --- | --- |
| Challenges from `a18.maya-user-client-association.v1` | 1, consumed |
| Resulting links | 1, active; the only link in the observed aggregate |
| Challenge issuance digest matches link Client-authority digest | YES |
| Affected privacy fact | grant, client_command, SUCCEEDED record_client_consent |
| Affected marketing fact | grant, client_command, SUCCEEDED record_client_consent |
| Each execution's decrypted input passes its existing canonical input hash | YES |
| Each trusted input references that exact link and exact Client | YES |
| Existing `assertConsentChannelBinding` accepts those recorded binding fields | YES |

Target fingerprint:
`2f5ead7db7dc3844f52a3294f1f80e4432321eb4ca548b391b9f24bfd9f5e0cd`.
The two exact receipt fingerprints are in the result. These are hashes of the
tenant/Client/link/challenge/receipt identities and immutable evidence. No raw
identity, credential, contact or decrypted action input is exported.

The first aggregate only established two facts for the same Client. The final
audit established the stronger relationship by decrypting the existing execution
inputs **inside the production process running the read-only audit**, validating
their hashes with the release's own ActionIdentityService and comparing exact
binding references. The production binding predicate was then evaluated against
the read snapshot, with an in-memory lookup returning that same recorded link.
This is not a live authenticated consent submission or business effect.

All database queries ran inside `READ ONLY` transactions and rolled back; the
final audit uses `REPEATABLE READ READ ONLY`. Initial attempts used an absent
release `.env`, then omitted the production module's existing secret fallback;
neither attempt made a database write. The successful audit reads the service's
documented environment file and mirrors `requiredActionSecret` exactly. Secrets
and decrypted payloads remain local to that short-lived remote read process.

## Why disabling the issuer alone cannot certify this baseline

1. `ClientChannelRuntimeService.resolve` / `ClientChannelLinkService.resolveActive`
   and downstream consumers use the completed, active binding and its immutable
   verification digest. They do not rerun the original retired issuer.
2. `assertConsentChannelBinding` verifies exact tenant/Client/provider/subject,
   active status, version and evidence hash. All of those fields pass for the
   observed improperly issued link; hash integrity does not repair its authority.
3. `ClientConsentFact` and successful ActionExecution history already contain
   grants attributed through that link. They cannot be turned into verified
   Client intent merely by deploying the corrected issuer.
4. An ad hoc runtime filter against expiring ClientLinkChallenge history would
   introduce a new lifetime authority dependency. The approved link contract
   explicitly preserves evidence independently of expiring challenge records.
   A hardcoded blacklist, hidden User/Profile fallback, or treating missing
   challenge history as renewed trust is not a valid repair.

The approved [ClientChannelLink contract](package5-final-a18-client-channel-link-schema-v1-proposal.md)
allows an immutable link's first complete verified revocation tuple; original
verification facts cannot be rewritten or deleted. It requires a verified
revocation actor/receipt, exact tenant/provider/subject and an identity lock.
`ClientChannelLinkService.revoke` implements that owner. The production runtime's
`verifyRevocation` dependency is deliberately closed; there is no approved
incident-repair verifier that derives actor authority from this audit alone.

Moreover, ordinary channel revocation is not a new Client consent decision:
existing truthful historical consent remains historical. Fabricating a Client
`revoke` command, changing a SUCCEEDED action, editing profile timestamps directly,
or deleting the two facts would invent business history. Deciding how the two
unproven grants cease to qualify as consent needs an explicit incident-repair
contract, distinct from retiring future keyless mutation requests.

## Narrow repair decision requested

The recommended direction for this **one fingerprint-pinned incident** is:

- Authorize verified security revocation of the one improperly issued link via
  the existing canonical link lifecycle, using an explicitly authorized incident
  actor/receipt. Do not relabel its original verification evidence as valid.
- Preserve the challenge/link, two facts and successful executions as audit
  evidence of what actually happened; do not fabricate a Client revocation or
  retroactive verification.
- Treat these two identified grants as **unproven authority, not effective
  verified Client consent**. Require independently verified Client linkage and
  a fresh explicit keyed consent event before re-enabling consent-dependent
  behavior. Do not infer consent from a replacement binding or existing profile.
- Approve the exact authority and durable eligibility rule for that incident
  before implementation. The existing revocation owner is reusable, but this
  report does not invent a verifier, misuse a CRM identity hold, select a new
  retention dependency, or claim that a complete historical invalidation mapping
  has already been proved. No new model/schema is proposed or added here.

This decision does **not** reopen keyless Option A, G1's prohibition of User/Profile
authority, the canonical keyed consent command, B6/B25/B35, or any R-C decision.
Until resolved, production cannot be certified even if prospective G1/G2 tests
pass. A real revocation would be an explicitly authorized remediation action,
never a smoke test; this cycle performed zero such mutations.

## Preserved prospective implementation and proof limits

WIP commit **`770a268c`**, four runtime/guard files:

- Remove the FK issuer from challenge routing; keep its old class fail closed
  so a stale internal caller cannot recreate its heuristic authority.
- Reinstate existing verified-link issuance and strengthen tenant/provider
  reauthentication checks.
- Reject missing/invalid consent transition keys with
  `consent_transition_identity_required` before any compatibility owner call.
- Forward the existing key to canonical consent; remove automatic issue/consume
  and tuple-derived identity from the compatibility method.
- Remove the profile-read guard exception that permitted FK-based authority.

[Narrow executable WIP proof](evidence/native-consent-wip-boundary-proof.cjs) and
[result](evidence/native-consent-wip-boundary-proof.json) show four keyless cases
denied before effects, unchanged event key forwarding for G1/retry, R1/retry,
G2/retry, and the retired issuer rejecting without DB reads. These use the actual
WIP adapter with a synthetic effect sink. They do not prove PostgreSQL lifecycle,
concurrency, production G1/G2 acceptance, or safety of already admitted records.

**Do not deploy this WIP.** The old upstream positive-FK/keyless tests have not yet
been revised and the changed retired constructor is not source-compatible with
those test fixtures. PWA pending-event persistence, new permanent ratchets,
PostgreSQL proofs, full 125-test regression, lint/typechecks/build/schema gates,
R06/R08 restoration, baseline deployment and R-C resumption all remain pending.
No mandatory PASS or complete remediation is claimed. The new STOP is the
explicit admitted-state policy gap, not those ordinary unfinished test edits.

## Status

```text
KEYLESS NATIVE CONSENT OPTION A: APPROVED — NOT REOPENED
G1 PROSPECTIVE FOUNDATION SUFFICIENT: YES
G2 KEYED FOUNDATION SUFFICIENT: YES
NEW SCHEMA IMPLEMENTED: NO
ADMITTED-STATE REPAIR CONTRACT: OWNER DECISION REQUIRED
PRODUCTION UNPROVEN ACTIVE LINKS: 1
PRODUCTION CONSENT GRANTS FROM THAT LINK: 2
G1 A18 PROVENANCE: FAIL — production remediation incomplete
G2 CONSENT IDEMPOTENCY: FAIL — local WIP only, not certified
COMBINED BASELINE CERTIFIED: NO
R06/R08 PROOFS RESTORED: NO
WAVE R-C WIP: PRESERVED
WAVE R-C READY TO RESUME: NO
NEW PRODUCTION SURFACES: 0
INVENTORY DEFECT: NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION MUTATIONS/MESSAGES/PROVIDER EFFECTS: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES: 0
OWNED WATCHERS: 0
OWNED BROWSERS: 0
OWNED TEMP DATABASES: 0
PROCESS HYGIENE: 0
```

WIP and this report are pushed only to `contour/native-consent-baseline` without
force. Canonical `b6c53ff9` is preserved. R-C contour `ed13d57f`, its 11 pinned WIP
trees, three synthetic dumps, main 24 entries/22 file hashes remain unchanged.
No old database or temporary PostgreSQL server was started or touched. The new
worktree and copied dependencies are preserved local files, not running processes
or a deployable certified artifact. **STOP at the admitted-state repair decision.**
