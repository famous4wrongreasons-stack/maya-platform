# CYCLE 06 — PACKAGE 5 WAVE 6 A30 SAFE LOCAL CONVERGENCE

Status: **PASS — Shadow 6/6 and PostgreSQL executable proof complete; STOP before production runtime cutover**

Date: 2026-09-04. Accepted source checkpoint: `178b39f2`, followed by explicit
user approval of Auth Retention Policy V1. The approved Runtime Contract Gate
now passes; no new business/schema blocker or additional migration was needed.

## Implemented result

All six A30 classes use the canonical AC6 coordinator and existing durable
MaintenanceRun / MaintenanceItemClaim foundation. The exact class/predicate
inventory is in the approved Runtime Contract Gate. Standard auth retention is
30 days; short-lived auth retention is 24 hours. Only approved expiry,
consumption or revocation predicates qualify. Quarantine retains its declared
expiry contract. Age of creation alone cannot delete active records.

The local candidate replaces all five legacy auth parent-table deletes and the
unbounded quarantine delete with coordinator delegation. Old configurable
retention intervals and caller-supplied mutation deadlines are removed from the
auth initiator. The coordinator is the only allowlisted destructive owner.
It has no provider adapter, external write or fabricated ActionExecution path.

Disallowed AI maintenance execution fails before opening a DB connection and
its seven legacy write branches are removed. Both Python PII rotation bodies
are replaced with fail-closed guards; no alternate Client/certificate
anonymization fallback remains in those committed implementations. Their
scheduler callers retain no independent mutation ownership. Read-only AI
maintenance and quarantine count paths remain readers.

The implementation is a local cutover candidate. No runtime release, systemd
unit, production scheduler or provider was switched or invoked by this cycle.

## Shadow and consolidated PostgreSQL proof

The script `scripts/package5-wave6-all6-executable-proof.ts` refuses any DB
except the dedicated loopback port 55486 and `maya_c06_p5_wave6_` name prefix.
Each proof run uses a newly initialized owned PostgreSQL cluster, with all 70
migrations clean-replayed and drift checked as NONE. It never copies production
business rows. Cleanup traps stop the owned PID and remove the whole owned
cluster/database/socket directory on both success and failure.

The final proof passed all six Shadow classes with zero divergences and **53
negative assertions**. Golden eligibility is constructed independently from
the approved terminal windows; production predicate helpers are not reused as
the oracle. The final fixture has **13 durable maintenance runs**.

Proven behavior:

- read-only Shadow creates no run, claim, deletion or ActionExecution;
- exact-boundary timestamps are retained; null and recent terminal timestamps
  do not qualify; old-created but active rows remain;
- expired and explicitly consumed/revoked terminal rows qualify only after the
  approved 30-day/24-hour window;
- active-session consumed refresh-token history is retained;
- initiator payload cannot override time, cutoff, expiry/terminal predicate,
  tenant, scope, policy version, target set or run cap;
- two concurrent preparations converge to one run and durable manifest;
- two workers claiming one run have one live lease winner;
- an expired lease can be taken over with generation advancement, while the
  old token and a fabricated token cannot commit;
- a restarted initiator in a later minute resumes the earlier frozen run,
  budget, cutoff and manifest; Shadow resolves that same durable identity;
- overlapping independent tenant/platform runs produce one successful physical
  deletion for the same item, with the other attempt safely skipped;
- an injected failure after domain deletion but before audit terminalization
  rolls deletion and all outcomes back; restart then completes exactly once;
- renewed targets are rechecked under lock and retained;
- each session and every dependent token consume the same physical-row cap;
  oversized or newly unclaimed cascades cause refusal with no deletion;
- tenant/foreign/platform envelope misuse fails; platform maintenance can
  explicitly process legitimate null-tenant quarantine without granting that
  authority to a tenant;
- policy/cutoff changes, terminal outcome rewriting and run audit deletion are
  rejected; audit contains only allowed metadata and non-PII item hashes;
- ActionExecution, ClientConsentFact and DomainEvent fabricated rows remain 0.

The injected concurrent-token fixture is removed only inside the disposable
proof to restore its originally claimed set before retry. This is not an
independent production refresh-token purge capability.

Initial local iterations corrected the advisory-lock result type for Prisma
and one invalid test-fixture rate-limit scope. The final clean replay and proof
passed after these corrections. The usual initiator restart path was also
added and proved, so recovery does not depend on retaining an in-memory handle.

## Architectural and preservation gates

- Initial targeted adapter/policy suites: 4/4 suites, 12/12 tests PASS.
- Wave 6 architectural ratchet: 5/5 tests PASS.
- Python fail-closed execution proof: 2 implementations / 10 calls PASS,
  using isolated AST function extraction without importing DB/runtime modules.
- Final project lint: PASS.
- Final application and scripts typechecks: PASS.
- Final full regression suite: **322/322 suites, 2675/2675 tests PASS**.
- Final build and preflight compilation: PASS.
- Clean migration replay: 70/70 PASS; drift NONE.
- Compiled policy: exactly six classes; frozen rules and map.

The ratchet checks all production TypeScript source/script surfaces for direct
allowlisted deletes, pins the one checked coordinator SQL deletion site,
verifies both initiators and read-only paths, and rejects ORM/bracket/raw-SQL
business-delete injections. Test-named production helpers remain in scope.
Both Python rotation bodies and the AI maintenance execution boundary are
checked explicitly. No guard or ratchet from earlier waves was weakened.

The existing full suite includes Package 1–4 and Wave 1–5 preservation checks.
Only EventStore's A30 purge adapter changes; its source acceptance and recovery
fact-plane behavior remain intact. No changes are made to frozen appointments,
Client-owned consent/profile semantics, P02/P03 holds, prospective config,
immutable recovery evidence, tenant hard-delete policy or common schema.

## Production read-only verification

At `2026-09-03T21:56:55Z`, the active release remained
`20260903-c06-p5-wave5-cutover-2a916120`, with its original start time and
NRestarts 0. Health/readiness and release preflight passed. Pending migrations
were 0, drift NONE; all five maintenance guards and the approved foundation
checksum matched. Production MaintenanceRun and MaintenanceItemClaim both
remained empty. This verification did not invoke a cleanup command, scheduler
tick or business/provider operation.

The earlier inventory found the named Python unit inactive; its code was
present. This cycle does not activate it or claim that all possible alternate
Python launchers were deployed. The later cutover must verify the actual Nest,
CLI and Python launch surfaces against the committed guards. No production
mutation may be used merely to prove that cutover.

## Final checkpoint

```text
PACKAGE 5 WAVE 6 RUNTIME CONTRACT GATE: PASS
WAVE 6 FAMILIES: A30
WAVE 6 ACTION CLASSES: 6
AUTH RETENTION POLICY V1: APPROVED
STANDARD AUTH RETENTION: 30 DAYS
SHORT-LIVED AUTH RETENTION: 24 HOURS
WAVE 6 SHADOW ACTION CLASSES: 6/6
SHADOW DIVERGENCES: 0
WAVE 6 EXECUTABLE PROOF: PASS
DUPLICATE DELETION POSSIBLE: NO
TENANT/AUTHORITY ISOLATION: PROVEN
MAINTENANCE RUN/ITEM CLAIMS DURABLE: YES
LEGACY BYPASS RATCHET READY: YES
LEGACY MUTATING FALLBACK: NO
ADDITIONAL SCHEMA REQUIRED: NO
SCHEMA FOUNDATION/APPLY: EXISTING APPROVED FOUNDATION REUSED; NO NEW APPLY
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FAMILIES REMAINING AFTER WAVE 6: 0
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS: 0
PROVIDER WRITES: 0
READY FOR PACKAGE 5 WAVE 6 PRODUCTION RUNTIME CUTOVER: YES
PACKAGE 5 WAVES COMPLETE IN PRODUCTION: 5/6
WAVE 6 PRODUCTION RUNTIME CUTOVER: NOT PERFORMED
FINAL PACKAGE 5 GATE STARTED: NO
CHAPTER 7 STARTED: NO
```

The zero remaining-family claim is the complete scope after the **planned**
Wave 6 cutover. Production completion is still 5/6, not 6/6. All 13 narrowed
families are mapped without a missing or extra family; no Wave 7 is created.

## Process hygiene

All owned proof clusters were stopped and their PIDs verified dead; cluster,
socket and temporary database directories were removed by their cleanup traps.
No browser or development watcher was started. The 17 historical Chapter 6
local databases remain present and untouched; their audit stays deferred.

```text
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

Commit/push this proof checkpoint and verify HEAD=origin. STOP before production
runtime cutover, Final Package 5 Gate and Chapter 7.
