# Native consent canonical security correction — production evidence

2026-09-08. Approved incident `native-consent-compat-e9d3d3a2`, owner mapping
`fdecfbb4`. Production release: `20260908-a18-security-consent-0867ecea`.

## Exact correction and historical integrity

The fresh read-only audit and protected immutable pre-state snapshot matched the
approved fingerprints: one active affected link, two original successful grants
(privacy and marketing), no scope expansion. While the old public runtime was
stopped, an encrypted full database backup and encrypted exact evidence snapshot
were exclusive-created in the protected incident directory. No plaintext database
dump was created. The backup mechanism was tested by decryption/pg_restore catalogue
on the owned synthetic database. An initial stdin invocation did not enter the
backup tool's CLI entrypoint and produced no file; execution from its protected
file then completed successfully before admission.

The prepared release used existing AuthService authentication and JWT/session
validation for the configured real platform owner. It admitted and executed the
one approved A18 operation, with all five process-local schedulers disabled and
no HTTP listener. Its support session was logged out and context closed. There
was no direct maintenance SQL/model writer or fabricated identity.

Exact read-only verification passed: link inactive, both bad grants ineffective,
original grants and their full executions unchanged, original link evidence
preserved, one security execution/attempt, two invalidations, canonical audit,
unrelated consent/profile/link hashes unchanged, no new Client/User/link.
Recovery is forward-only: retry the same incident/execution, never delete history,
regrant automatically, restore a stale live database or activate the old blind
consumer. New independently verified keyed consent remains possible.

## Release and gates

- Full mandatory regression: **399 suites / 3275 tests PASS**; lint, both
  typechecks, build and Prisma validate PASS.
- Approved additive migration applied through the documented prepare-only release
  flow. Pending migrations **0**, post-apply schema drift **NONE**, no backfill.
  Historical migration manifest accounts for the established local/database count
  difference; no migration history was fabricated or rewritten.
- Prepared readiness passed on port 3199 with five schedulers disabled; the probe
  process was terminated/reaped. Current release then activated only after exact
  security verification. Health and database readiness PASS.
- **607 compiled/schema artifacts** match the locally gated build exactly.
- G1 rejects the retired User/Profile association issuer; G2 requires the existing
  keyed transition command before effects. PostgreSQL provenance/security/lifecycle
  proof: 35 cases PASS, including distinct grant/revoke/new-grant, each retry,
  concurrent admission, restart, tenant/Client boundaries and B35 eligibility.
- PWA changed only the approved consent component/helpers in `mayaos/app/index.html`.
  Exact original component matched the certified upstream component; inverse
  transformation preserved every unrelated byte. 28 inline scripts parse.
  All **9/9 aliases** were rechecked: one HTML overlay, zero PHP changes,
  other eight hashes and all ownership/modes unchanged. Existing scoped publisher
  and its bounded recovery were reused and locally proven.

Evidence: [native-consent-security-implementation](evidence/native-consent-security-implementation/).
The release's backend bytes equal both `0867ecea` and `f482a4a8`; the latter adds
only reviewed operational documentation/artifacts.

```text
SECURITY INVALIDATION FOUNDATION: PASS
ADMITTED BAD AUTHORITY REMEDIATED: YES
AFFECTED LINK ACTIVE: NO
PRIVACY BAD GRANT EFFECTIVE: NO
MARKETING BAD GRANT EFFECTIVE: NO
HISTORICAL AUDIT EVIDENCE: PRESERVED
UNRELATED CONSENT CHANGED: 0
NEW VERIFIED CONSENT REQUIRED: YES
G1 A18 PROVENANCE: PASS
G2 CONSENT IDEMPOTENCY: PASS
KEYLESS NATIVE CONSENT MUTATIONS: 0
CONSENT PRODUCTION BASELINE: CERTIFIED
R06/R08 COMBINED WIP PROOFS: RESTORATION NEXT
R-C BUSINESS/SCHEMA DECISIONS: PRESERVED
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CONTROLLED CANONICAL SECURITY OPERATIONS: 1
OTHER PRODUCTION BUSINESS/PROVIDER/MESSAGE PROOF EFFECTS: 0
```

This is a continuation checkpoint, not STOP or R-C acceptance. Reconcile the
preserved R-C commits without rewriting history, restore invalidated Client/shared
proofs, then finish the already approved eight-package wave. Main 24 dirty entries
and 17 historical databases remain untouched. Owned local PostgreSQL is still
needed for integration proof; final process/database cleanup remains required.
