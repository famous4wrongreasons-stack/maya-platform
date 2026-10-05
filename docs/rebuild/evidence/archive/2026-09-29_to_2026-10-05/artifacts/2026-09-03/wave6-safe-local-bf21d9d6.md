<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 73313b28262ec904a6ba41fff9b54a37151cb477519225c65070c055d2cfb475 -->

# Wave 6 safe local checkpoint `bf21d9d6`

Commit/push завершены. HEAD = origin = remote branch = `bf21d9d6fde99bd91a68e54bf655cbec911ac799`.

Policy V1 и Runtime Contract Gate — PASS. Shadow 6/6, divergences 0, PostgreSQL executable proof PASS. Project lint, typechecks, build и 322/322 suites / 2675/2675 tests — PASS.

Production runtime cutover не выполнялся. Production остаётся на Wave 5, счётчик 5/6. Final Package 5 Gate и Chapter 7 не начаты. Новая schema не потребовалась. 17 исторических test DB не изменены; owned processes/watchers/Chrome/temp DB — 0.

---

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

---

# CYCLE 06 — PACKAGE 5 WAVE 6 A30 APPROVED RUNTIME CONTRACT GATE

Status: **PASS — Policy V1 explicitly approved; runtime/schema contracts sufficient**

Date: 2026-09-04. Accepted checkpoint: `178b39f2` plus the user's explicit Auth
Retention Policy V1 approval. This report supersedes the earlier contract STOP.
The existing POST-WAVE-5 remainder, Authority Gate AC6/A30, D1-A…D7-A and Common
Foundation remain authoritative. Waves 1–5 are not reopened.

## Exact scope and policy

Wave 6 contains **A30 only**, with these **six AC6 classes**:

| Class | Subject | Exact V1 predicate at server-derived frozen evaluation time T |
| --- | --- | --- |
| purge_auth_sessions | AuthSession; dependent AuthRefreshToken cascade only | expiresAt < T − 30 days OR revokedAt < T − 30 days |
| purge_phone_auth_codes | PhoneAuthCode | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_email_auth_codes | EmailAuthCode | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_auth_flow_states | AuthFlowState | expiresAt < T − 24 hours OR consumedAt < T − 24 hours |
| purge_auth_rate_limit_buckets | AuthRateLimitBucket | windowEndsAt < T − 24 hours |
| purge_ingestion_quarantine | IngestionQuarantine | expiresAt < T |

The comparison is strictly `<`; exact-boundary and null terminal timestamps do
not qualify. Old creation time alone never qualifies a row. Expiration,
consumption and revocation are exactly the approved terminal predicates.
Refresh tokens are never selected for independent deletion; active-session
replay-detection history remains intact.

Auth policy key is `package5.a30.auth-retention`, version 1. Quarantine uses
`package5.a30.quarantine-expiry`, version 1, preserving its declared row expiry.
The rules and map are frozen at runtime. The V1 policy digest is pinned at
`9fc9734d27a82ce042ec46eb26b454329749ea877811733dbc70c06bf799f9e7`.
A change requires a reviewed version; old environment duration overrides have
no authority. No tenant-configurable retention or future legal override is added.

## Authority, ownership and boundaries

AC6 owns these bounded system-maintenance operations. Automatic runs do not
fabricate ActionExecution records. There is no new HTTP/AI human command
endpoint. The internal coordinator accepts only class and a batch reduction;
clock, deadline, predicates, targets, tenant, scope, policy version and limits
cannot be supplied as request authority.

- Trusted standalone maintenance is platform scope, including legitimate
  null-tenant auth/quarantine rows.
- Existing system-tenant context derives an exact tenant scope. Human,
  public/auth-principal and unresolved request contexts fail closed.
- Branch, staff, Client and User selectors are not added to maintenance
  authority. Client profile/consent and identity holds remain untouched.
- A tenant cannot resume a platform or another tenant's envelope; a platform
  handle cannot silently widen a tenant envelope.

The local candidate connects both initiators to
`Package5Wave6MaintenanceService`: auth CLI → auth facade → coordinator, and
quarantine scheduler → EventStore maintenance adapter → coordinator. The five
legacy parent deletes and unbounded quarantine delete are removed locally.
The sole allowlisted deletion site is in the coordinator's checked transaction.
Event ingestion, DomainEvent acceptance and recovery fact/projection ownership
remain unchanged; only the A30 purge method in EventStore is replaced.

The seven write branches of `ai-runtime-maintenance.ts` are removed; execute
fails before opening the database, while dry-run remains a reader. Both
committed Python `rotate_old_pii` implementations fail closed before any SQL.
Their Client and certificate anonymization classes are not added to the
allowlist. The existing scheduler caller can no longer acquire mutation
ownership through those functions. There is no mutating legacy fallback.

## Durable identity, limits and concurrency

One run binds one class, one scope, policy/version, cutoff, server minute
window and fixed batch budget. The default is 1,000 physical row effects;
initiators may only reduce it. The common schema's hard ceiling remains
10,000, but larger/manual envelopes are not enabled by this policy version.
Session and every dependent refresh token count against the same run budget.
Oversized or newly unclaimed cascade effects fail closed.

Preparation fixes a bounded manifest in immutable per-run item identities and
a manifest hash. Item hashes include run identity, kind, row id and creation
(or quarantine receipt) timestamp; no raw subject data is stored. Repeated
preparation uses the same run. A restarted initiator finds an unfinished older
window and resumes its frozen cutoff, budget and manifest; it does not create
replacement work with a new deadline. Changing that pending run's budget fails.
Shadow reads the same durable manifest when such a run already exists.

A row-locked lease has an unpredictable fencing token and expiry. Takeover
increments each unfinished claim generation; the former token cannot commit.
Class advisory locks provide consistent ordering across tenant/platform runs.
The executor locks exact claimed row incarnations, rechecks tenant and current
terminal eligibility, validates all cascade claims, deletes and writes every
terminal item outcome plus run finalization in one transaction. Missing or
renewed items are SKIPPED. Overlapping runs can record distinct bounded
attempts, but exactly one may record the physical deletion as successful.

Policy/authority/limits, item identities and terminal outcomes are protected by
the existing Common Foundation constraints and triggers. Only policy,
non-PII hashes, counters and stable outcome codes survive. No fake historical
facts or deleted PII are copied into maintenance audit.

## Schema and provider boundary

No additional schema or migration is needed. The approved unique A30
MaintenanceRun/MaintenanceItemClaim models are already applied in production
under migration `20260903120000_package5_common_authority_foundation`, checksum
`4166dcdaa50d88b715617c6a4018cb22db7e6713c09c76107d1130d60cfb0244`.
Read-only production verification confirms pending 0, drift NONE and the five
maintenance guards. The local proof clean-replays all 70 repository migrations.
No schema apply or historical backfill is performed in this cycle.

All effects are local transactional effects. No provider request or write is
needed; UNKNOWN and provider reconciliation are not applicable. Tenant hard
delete, business-value cleanup, source evidence and consent facts are outside
the allowlist. Packages 1–4, P02/P03 holds and D1-A…D7-A are preserved.

## Final-wave scope accounting

| Wave | Families | Owner boundary |
| --- | --- | --- |
| 1 | A22, A23 | Accepted production canonical owners |
| 2 | A16, A25, A26 | Accepted canonical/protocol owners |
| 3 | A15, A17, A18 | Accepted command/source owners |
| 4 | reduced A27, A28 | Accepted canonical owners |
| 5 | A29, A31 | Accepted correction and fact-plane owners |
| 6 | A30 | Six AC6 classes; non-allowlisted legacy cleanup fails closed |

The set equals the exact 13-family Entry Gate inventory, missing 0, extra 0.
After the planned Wave 6 cutover, no family needs another implementation wave.
The candidate has no production-reachable direct A30 maintenance delete owner
outside the narrow AC6 coordinator. This is local readiness, not a claim that
production has already switched. Production remains 5/6 waves until its separate
cutover. No Wave 7 or Final Package 5 Gate is created by this report.

```text
PACKAGE 5 WAVE 6 RUNTIME CONTRACT GATE: PASS
WAVE 6 FAMILIES: A30
WAVE 6 ACTION CLASSES: 6
AUTH RETENTION POLICY V1: APPROVED
ADDITIONAL SCHEMA REQUIRED: NO
SCHEMA FOUNDATION/APPLY: EXISTING APPROVED FOUNDATION REUSED; NO NEW APPLY
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FAMILIES REMAINING AFTER WAVE 6: 0
```

---

# CYCLE 06 — PACKAGE 5 WAVE 6 PRE-CUTOVER REMAINDER

Status: **CURRENT — Wave 6 safe-local proof PASS; production remains 5/6**

Date: 2026-09-04. This checkpoint supersedes the Wave 6 Contract Stop remainder
from `178b39f2` after explicit approval of Auth Retention Policy V1.

Completed:

- Policy V1 is canonical: standard auth 30 days, short-lived auth 24 hours,
  exact approved terminal predicates, central/versioned/allowlisted ownership.
- Runtime Contract Gate PASS for A30 and all six maintenance classes.
- Common Foundation reused; no additional schema, migration or fake backfill.
- Local canonical runtime alignment and fail-closed disallowed cleanup paths.
- Shadow 6/6, zero divergences; PostgreSQL executable/adversarial/concurrency
  proof PASS; 70/70 migration clean replay, drift NONE.
- Bypass ratchet and family inventory coverage 13/13 PASS.
- Project lint, both typechecks, full 322-suite/2675-test regression and build PASS.
- Read-only production verification: Wave 5 release unchanged, health/readiness
  PASS, pending 0, drift NONE, maintenance runs/claims 0.

Exact remaining work:

1. **Separately authorized Wave 6 production runtime cutover.** Verify current
   HEAD/origin, schema, health and required deployment gates, then all actual
   Nest, CLI and Python launcher surfaces. The local candidate already routes
   auth/quarantine through AC6 and removes disallowed fallback bodies. Only
   read-only/structural verification is allowed for cutover proof; real
   deletion/anonymization requires its separately approved boundary.
2. Separately initiated Final Package 5 Adversarial Gate.
3. Separately initiated Final Chapter 6 Gate.
4. After Chapter 6, separate provenance/ownership audit of the 17 pre-existing
   local test DBs. No cleanup authority is inferred from this checkpoint.

There is no Wave 7. Waves 1–5 and Packages 1–4 stay complete and preserved.
Chapter 7 has not started.

```text
PACKAGE 5 WAVES COMPLETE: 5/6
PACKAGE 5 WAVE 6 SAFE LOCAL CONVERGENCE: PASS
PACKAGE 5 WAVE 6 COMPLETE IN PRODUCTION: NO
PACKAGE 5 WAVE 6 FAMILIES: A30
PACKAGE 5 WAVE 6 ACTION CLASSES: 6
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FAMILIES REMAINING AFTER PLANNED WAVE 6 CUTOVER: 0
READY FOR PACKAGE 5 WAVE 6 PRODUCTION RUNTIME CUTOVER: YES
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS: 0
WAVE 6 PRODUCTION RUNTIME CUTOVER: NOT PERFORMED
WAVE 7 CREATED: NO
FINAL PACKAGE 5 GATE STARTED: NO
CHAPTER 7 STARTED: NO
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```

STOP after reports → commit/push → HEAD=origin. Do not start the next boundary
automatically.
