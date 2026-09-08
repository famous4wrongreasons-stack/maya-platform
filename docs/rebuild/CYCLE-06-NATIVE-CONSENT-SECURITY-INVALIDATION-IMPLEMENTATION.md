# Native consent security invalidation — approved implementation

2026-09-08. Owner approval accepts checkpoint `fdecfbb4` and the exact twelve-field
`ClientConsentInvalidation` mapping. The earlier proposal/STOP reports remain
historical. This report records implementation; production certification is
pending the controlled correction and read-only post-state verification.

## Exact foundation and local result

- A18 owns `invalidate_client_consent_authority`, through existing Action Engine
  admission, encrypted immutable payload, canonical attempts and transaction
  outcome. One model, twelve physical fields, one AC1/A18 action; no AC6 class,
  no historical backfill, no R-C schema changes.
- Existing link owner composes verified revocation in the same transaction as the
  two exact append-only invalidations, profile reprojection and audit. Composite
  tenant/Client/fact/link/execution FKs, evidence and authority guards, uniqueness,
  deferred atomic-outcome checks and incident evidence retention are permanent.
- The production approval adapter accepts only the target and two original receipt
  fingerprints already recorded in the approved evidence. An additional affected
  record, changed head/provenance or scope mismatch rejects before security effects.
- Current consent selects the head first, then applies its exact invalidation.
  It never filters the invalidated head away to resurrect an older grant. Original
  grants, executions/inputs and verification evidence remain unchanged. A new
  independently verified keyed grant can become effective.
- G1 retires the User/Profile association issuer. The existing canonical challenge
  resolver alone may authorize issuance. G2 rejects keyless native mutations before
  dependencies/effects and preserves each keyed logical transition. Concurrent
  consent planning reuses the existing canonical receipt's server timestamps after
  verifying unchanged business material and authority; different decisions conflict.
- B35's final policy, Web Push, appointment/wanted-slot policy and Client projections
  share the invalidation-aware resolver. A18 security, ordinary consent and B35's
  dispatch-boundary policy share the same Client consent lock. Retired legacy
  marketing shadow code remains outside the production canonical marketing owner.
- PWA persists immutable pending consent choices/event identity before submitting.
  Lost response/restart reuses that event; a changed unresolved choice is rejected;
  successful completion permits a new explicit transition. Local storage scopes
  retry material, never Client authority. Read-only compatibility is preserved.

## Executable evidence

Evidence directory: [native-consent-security-implementation](evidence/native-consent-security-implementation/).

| Check | Result |
| --- | --- |
| Prisma validation; 84-migration clean replay | PASS, no backfill |
| Local pending migrations / structural drift | 0 / NONE |
| PostgreSQL security + provenance + lifecycle proof | PASS, 35 cases |
| Exact concurrent security retries; injected failure after link revocation | one execution/attempt/outcome; both halves roll back |
| B35 policy against PostgreSQL invalidations | DENY; prior policy claim ordered by shared lock |
| Grant / revoke / new grant and their retries | distinct events; same-event receipts stable |
| Concurrent first requests with deliberately different server timestamps | one execution |
| Concurrent opposite events | existing optimistic policy: one winner, one conflict |
| Full mandatory backend regression | 398 suites / 3272 tests PASS |
| Additional operational cutover/schema ratchet | 1 suite / 3 tests PASS |
| Invalidation/PWA/B35/profile ratchets | 6 suites / 59 tests PASS |
| Application + scripts typechecks, lint, build | PASS |
| PWA inline script parse | 28 scripts PASS |
| Real application DI, AuthService login, signed JWT validation, session logout | synthetic PostgreSQL PASS; all schedulers disabled |

The first regression pass exposed obsolete upstream tests that expected FK-based
issuance/keyless mutation; those expectations were replaced with the approved
fail-closed contract. Executable proof also found a driver-adapter serialization
classification issue and same-event concurrent timestamp planning conflict. Both
were corrected within existing transaction/receipt semantics and rerun. No failed
run is represented as acceptance.

## Authorized cutover and recovery

1. Commit/push this clean isolated release and verify canonical origin and current
   production `20260908-native-consent-compat-b6c53ff9`. R-C worktree and all WIP
   commit trees/dumps remain preserved. Recheck exact incident before mutation.
2. Use the documented VPS deploy process with `MAYA_DEPLOY_PREPARE_ONLY=1`: all
   existing gates, fresh server dependencies, preflight, approved additive migration,
   strict post-apply pending/drift checks and generation. It exits before spare-port
   startup or public symlink change. This option cannot skip an existing gate.
3. Stop the old `maya-saas` unit. Create a protected encrypted database backup and
   immutable encrypted exact pre-state snapshot with the read-only evidence tool.
   Scope must still be exactly the approved active link and two original grants.
4. From the prepared release, run `a18-consent-security-remediation` with its exact
   approved flag and protected snapshot. It refuses an active old unit, disables all
   process-local schedulers, opens no listener, authenticates via the existing
   configured platform credential/AuthService, verifies its issued JWT through
   JwtStrategy, and invokes only A18 admission/execution. Admission evidence is
   encrypted and exclusive-created before effects. Its support session is logged
   out and application context closed. No fabricated User, session, JWT or Client.
5. Run protected read-only verification against exact original rows, unrelated
   facts/profiles/links, audit and the deployed effective-consent resolver. Only
   then activate the prepared release using the documented symlink/systemd and
   health/readiness steps. It contains G1/G2 and all invalidation-aware readers.
6. Publish only the bounded consent component/helper overlay to hash-pinned active
   PWA variants containing that component, preserving every unrelated production
   variant. Structural/read-only verification only; no real consent/booking/message
   smoke. Record post-state and baseline certification before R-C resumption.

No old issuer/consumer runs between the correction and activation. After security
invalidation, recovery is forward repair/retry of the same admitted execution;
never regrant, delete invalidations, restore a stale live DB or roll back to an
invalidation-blind release. Before any security effect, a failed pre-state check
stops the correction without expanding scope. The old release is not a recovery
option after the corrected outcome commits.

The production mutation exception is only the approved one logical A18 correction:
one link revocation plus two invalidation facts and their required canonical
execution/audit/projection effects. Normal authentication/session lifecycle supports
that operation. Other production proof business/provider/message effects remain 0.

## State before production phase

```text
SECURITY INVALIDATION LOCAL FOUNDATION: PASS
G1/G2 LOCAL PROOF: PASS
ADMITTED BAD PRODUCTION AUTHORITY REMEDIATED: NO
COMBINED BASELINE CERTIFIED: NO
R-C WIP: PRESERVED
R-C BUSINESS/SCHEMA DECISIONS: STILL APPROVED
WAVE R-C RESUMED: NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
MAIN 24 DIRTY ENTRIES: UNCHANGED
PRE-EXISTING DATABASES TOUCHED: 0
PRODUCTION BUSINESS/PROVIDER/MESSAGE EFFECTS SO FAR: 0
```

Local evidence uses only the owned loopback PostgreSQL cluster on port 55517.
Its two temporary databases remain active for cutover/recovery proof at this stage;
final cleanup is required before process hygiene 0 can be declared.
