# CYCLE 06 — PACKAGE 5 WAVE 6 A30 RUNTIME CONTRACT GATE

Status: **HISTORICAL FAIL — superseded by the approved Wave 6 Runtime Contract Gate after explicit Policy V1 approval**

Accepted source checkpoint: `ef454c1c071fb32dfa9745e4bf7adddf828301ca`.

Evidence date: 2026-09-03 UTC. No runtime or schema changes were made.

## Authority and exact remaining family

The current POST-WAVE-5 REMAINDER CHECKPOINT leaves exactly **A30** for Wave 6.
The Entry/Remainder Gate, Authority/Classification Gate AC6, A30, section 7.4
and Wave 6, approved D1-A through D7-A, and applied Common Foundation remain
authoritative. There is no Wave 7.

A30 is **AC6 bounded destructive maintenance**. Its canonical owner must be
the durable maintenance coordinator with `MaintenanceRun` and
`MaintenanceItemClaim`. Automatic platform work must not fabricate a tenant
ActionExecution. AC6 is an expressly classified exception, not an unrestricted
permission for services, schedulers or scripts to write business state.

The user requires STOP with a Proposal when a new business/schema decision is
needed. That condition applies to the five auth eligibility predicates below.
This is not a request to reconsider the approved central, versioned allowlist
model, to introduce tenant overrides, or to change the common schema.

## Exact operation inventory

Six AC6 operation classes follow from the approved initial data-class scope.
The identifiers below name the Gate inventory; no runtime registrations have
been created and no executable contracts are represented as approved.

| Gate class | Exact data class | Existing destructive owner / initiator | Existing eligibility | Contract verdict |
| --- | --- | --- | --- | --- |
| `purge_auth_sessions` | AuthSession; AuthRefreshToken only as dependent cascade | AuthRetentionRepository.deleteSessions/selectSessionIds, initiated by auth-retention-cleanup.ts through AuthRetentionService | revokedAt OR expiresAt before now minus configurable session days; default 30 | BLOCKED: interval and revoked-only trigger need explicit policy binding; refresh cascade must be bounded |
| `purge_phone_auth_codes` | PhoneAuthCode | AuthRetentionRepository.deletePhoneChallenges | expiresAt OR consumedAt before now minus configurable challenge hours; default 24 | BLOCKED: interval and consumed-only trigger need explicit policy binding |
| `purge_email_auth_codes` | EmailAuthCode | AuthRetentionRepository.deleteEmailChallenges | expiresAt OR consumedAt before the same challenge cutoff | BLOCKED: same policy decision |
| `purge_auth_flow_states` | AuthFlowState | AuthRetentionRepository.deleteOauthStates | expiresAt OR consumedAt before the same challenge cutoff | BLOCKED: same policy decision |
| `purge_auth_rate_limit_buckets` | AuthRateLimitBucket | AuthRetentionRepository.deleteRateLimitBuckets | windowEndsAt before now minus configurable rate-limit hours; default 24 | BLOCKED: interval needs explicit policy binding |
| `purge_ingestion_quarantine` | IngestionQuarantine | EventStoreService.purgeExpiredQuarantine, initiated by IngestionRetentionScheduler | row.expiresAt < now | Row expiry is already declared; coordinator/claims/bounds are not implemented |

`AuthRefreshToken` is not a seventh independent purge class. Its history belongs
to the parent session and must remain intact while the session is active.
The existing auth repository has five parent-table delete sites, a transaction
advisory lock and batch limits, but no durable policy/run/item ownership.
The quarantine delete is currently unbounded and has no run/item ownership.

Source anchors at the accepted checkpoint:

- `maya-saas-backend/src/auth/auth-retention.service.ts:30` — configurable intervals;
- `maya-saas-backend/src/auth/auth-retention.repository.ts:181` — session selection and five parent deletes;
- `maya-saas-backend/scripts/auth-retention-cleanup.ts` — dry-run/default and explicit execute entry;
- `maya-saas-backend/src/events/event-store.service.ts:285` — direct quarantine delete;
- `maya-saas-backend/src/events/ingestion-retention.scheduler.ts:84` — scheduler initiator;
- `docs/architecture/auth-retention-maintenance-runbook.md:9` — historical technical behavior.

### Additional maintenance surfaces that cannot disappear from the inventory

`scripts/ai-runtime-maintenance.ts` contains seven additional mutating branches:

1. expire pending AiApprovalRequest rows;
2. mark stale approved/executing AiApprovalRequest rows failed;
3. mark stale executing AiToolExecution rows failed with a stale-unknown code;
4. delete retained AiToolExecution rows;
5. delete retained AiApprovalRequest rows without an execution;
6. delete expired AiBrainSession rows;
7. delete expired or forgotten AiMemoryFact rows.

These are not seven newly approved Wave 6 capabilities. D7-A's initial
automatic allowlist does not authorize these AI history/memory classes.
Future convergence must fail closed for this legacy maintenance execute path,
preserve existing canonical action/history owners, and must not convert an
ambiguous execution into a fabricated known failure. Its dry-run is a reader.

Committed Python `database.py:4294` and the PostgreSQL blueprint
`saas_blueprint/pg/db_pg_full.py:3853` implement two anonymization operations:
client name/phone/hash clearing and gift-certificate recipient PII clearing.
The committed `bot.py:6259` daily scheduler reaches `_pii_rotation_job:6427`
and then `database.rotate_old_pii`. The blueprint is a committed alternate
implementation; it is not asserted to be an active production deployment.
D7-A explicitly keeps these other PII classes disabled until separately
allowlisted. Their write bodies and callable legacy fallback must be removed
or made unreachable at the later controlled convergence/cutover boundary.
No new retention duration for these classes is proposed here.

Read-only deployed-artifact inspection confirmed the five auth delete calls,
the direct quarantine delete and its scheduler initiator in the active Nest
release. The compiled AI maintenance CLI is absent from that release; its
committed source remains an explicit manual-entry surface in this inventory.
Deployed Python files contain the rotation caller and both anonymization SQL
statements. The unit named `barbershop-bot` reported inactive during inspection;
this cycle neither changed that unit nor established which, if any, alternate
launcher currently runs the Python scheduler. Thus deployed code presence is
not misreported as proof of a live scheduled execution. Zero legacy reachability
will still require verification before the eventual Wave 6 cutover.

Temporary speech/audio file cleanup is owned scratch-file lifecycle, not
retention of persistent business subjects. Auth issue/refresh/consumption,
notification state, accepted source ingestion and existing canonical business
actions remain with their already classified owners. No DomainEvent,
ActionExecution, ActionTargetMutation, ClientConsentFact, recovery source fact,
tenant, User, Membership or Client hard-delete class is added to the allowlist.

## Exact blocking decision

The approved D7-A option in
`CYCLE-06-BLOCKING-PACKAGE-5-BUSINESS-DECISION-CLOSURE-SCHEMA-APPROVAL-BRIEF.md:413`
explicitly says that current auth defaults/ranges are evidence, not
automatically approved legal policy. It identifies session 30 days (7–365),
challenge 24 hours (1–168), and rate-limit 24 hours (1–720).

The subsequent BUSINESS-DECISION-CLOSURE-REPORT approves central, versioned,
allowlisted policy and excludes future tenant/legal overrides. It does not
replace that reservation with an exact auth cutoff/trigger contract.

There are materially different possible executable predicates:

- delete immediately after the stored protocol expiry;
- retain the existing grace intervals after expiry;
- retain the existing grace intervals after expiry OR consumption/revocation.

Choosing expiry alone could delete security history earlier than the existing
30-day/24-hour behavior. Retaining the old OR predicates permits deletion of a
consumed/revoked row whose original expiry has not passed. Freezing the old
environment defaults as legal policy would silently approve what D7-A called
unapproved evidence. A zero-divergence Shadow cannot be interpreted until the
intended policy behavior is selected.

The accompanying **A30 AUTH POLICY V1 PROPOSAL** makes the narrow choice
reviewable. Runtime implementation and all six classes stop together here.

## Common Foundation / unique schema boundary

No additional schema is needed for the currently proposed AC6 envelope.
The approved unique A30 models are already present in Common Foundation:

- immutable scope/tenant, policy key/version, cutoff, limits and authority;
- deterministic run fingerprint and nullable explicit tenant execution binding;
- run state, counters, lifecycle and lease fields;
- unique per-run item identity hash, generation and immutable terminal outcome.

Read-only production verification at `2026-09-03T20:58:48Z` confirmed:

- release `20260903-c06-p5-wave5-cutover-2a916120` remains active;
- release preflight PASS; 70 repository / 73 applied migrations, pending 0;
- Prisma schema drift NONE;
- migration `20260903120000_package5_common_authority_foundation` applied,
  not rolled back, checksum
  `4166dcdaa50d88b715617c6a4018cb22db7e6713c09c76107d1130d60cfb0244`;
- MaintenanceRun and MaintenanceItemClaim counts both 0;
- all five A30 maintenance authority/transition/delete triggers present;
- health/readiness PASS; service active, NRestarts 0.

No migration was generated, replayed or applied in this cycle. The prior
foundation proof is cited as prior evidence, not relabelled as a Wave 6
executable/concurrency proof.

## Runtime requirements established, not yet proven

- **Identity:** one scope, one subject class and one reviewed policy version
  per run; deterministic identity includes policy/version, exact frozen cutoff
  and run window. Restart resumes that identity instead of recalculating it.
- **Boundaries:** platform auth maintenance currently accepts no tenant
  selector and may include nullable-tenant protocol rows. Quarantine also has
  legitimate unresolved/null-tenant rows. Tenant-scoped execution, if exposed,
  must bind the exact trusted tenant and must not obtain platform authority
  from a caller-supplied scope. No staff/branch/client selection authority is
  inferred from a global maintenance entrypoint.
- **Policy/approval:** D7-A central versioned allowlist; one data class/scope,
  default batch 1,000, hard ceiling 10,000; no generic arbitrary-table purge.
  No automatic tenant override or new human maintenance endpoint is needed.
  Larger/manual destructive scope cannot bypass the existing schema ceiling.
- **Concurrency/idempotency:** run ownership and fenced claims; exact
  transactional recheck of eligibility; deletion and durable terminal outcome
  in the same local transaction; retries/restarts must not add a second effect.
  Session-token fan-out must be explicitly bounded and proven, not hidden
  behind the parent-row count. Independent runs must not double-delete an item.
- **Audit:** only non-PII deterministic hashes, policy, limits, counters and
  stable outcomes survive. No deleted phone/email/token/provider payload is
  copied into audit. No fake historical maintenance facts or backfill.
- **Provider:** no provider requests or writes are required. UNKNOWN and
  provider reconciliation are not applicable to these local transactions.
- **Shadow:** a deterministic read-only manifest for every approved class;
  no fabricated ActionExecution for automatic AC6 work. Independent reference
  predicates must compare against the resolved policy, not merely mirror the
  new implementation.
- **Ratchet:** exact allowed coordinator write sites; exact initiator/read
  exceptions; fail on new direct parent deletes, direct PII clearing, hidden
  reader mutations, AI maintenance execute fallback and alternate Python
  writers. None of this protection is claimed ready before implementation.

## Final-wave family accounting

| Wave | Exact narrowed families | Actual status |
| --- | --- | --- |
| 1 | A22, A23 | Production complete; unchanged |
| 2 | A16, A25, A26 | Production complete; unchanged |
| 3 | A15, A17, A18 | Production complete; unchanged |
| 4 | reduced A27, A28 | Production complete; unchanged |
| 5 | A29, A31 | Production complete; unchanged |
| 6 | A30 | Contract blocked in this cycle |

The union equals the exact Entry Gate set of 13, with missing 0 and extra 0.
This proves inventory coverage, not canonical implementation coverage.
Actual production completion remains 12/13 families and 5/6 waves. A30 is the
exact uncovered scope. `FAMILIES REMAINING AFTER WAVE 6: 0` and zero future
bypasses cannot yet be asserted. There is no additional implementation wave.

## Checkpoint verdict

```text
PACKAGE 5 WAVE 6 RUNTIME CONTRACT GATE: FAIL
WAVE 6 FAMILIES: A30
WAVE 6 ACTION CLASSES: 6 IDENTIFIED AC6 CLASSES; CONTRACT BLOCKED
ADDITIONAL SCHEMA REQUIRED: NO
SCHEMA FOUNDATION/APPLY: ALREADY APPLIED; VERIFIED READ-ONLY; NO NEW APPLY
WAVE 6 SHADOW ACTION CLASSES: 0/6 — NOT RUN
SHADOW DIVERGENCES: NOT MEASURED
WAVE 6 EXECUTABLE PROOF: NOT RUN — CONTRACT GATE FAILED
DUPLICATE BUSINESS MUTATION POSSIBLE: NOT YET PROVEN FOR WAVE 6
TENANT/AUTHORITY ISOLATION: NOT YET PROVEN FOR WAVE 6
LEGACY BYPASS RATCHET READY: NO
PACKAGE 5 FAMILY INVENTORY COVERAGE: 13/13
PACKAGE 5 FAMILY COVERAGE: 12/13 COMPLETE; A30 BLOCKED
PACKAGE 5 FAMILIES REMAINING AFTER WAVE 6: 1 — A30 NOT COMPLETED
REAL PRODUCTION BUSINESS/PROVIDER MUTATIONS: 0
PROVIDER WRITES: 0
READY FOR PACKAGE 5 WAVE 6 PRODUCTION RUNTIME CUTOVER: NO
PACKAGE 5 WAVES COMPLETE: 5/6
WAVE 6 PRODUCTION RUNTIME CUTOVER: NOT PERFORMED
FINAL PACKAGE 5 GATE STARTED: NO
CHAPTER 7 STARTED: NO
```

No production cleanup command, scheduler tick, correction or provider call was
invoked. No app instance or test DB was started. Only source/document reads,
read-only schema/health/structural queries and documentation writes occurred.
Packages 1–4, Waves 1–5, D1-A…D7-A, P02/P03 holds, all immutable evidence and
prospective configuration baselines were preserved without implementation edits.

The 17 historical `maya_c06_%` databases remain present and untouched. The
local cluster has other databases as well; 17 is the established Chapter 6
test-database subset, not the total cluster database count. No ownership of
these pre-existing databases or browser processes is claimed by this cycle.

```text
PRE-EXISTING LOCAL TEMP/TEST DATABASES: 17
OWNED BY THIS CYCLE: 0
OWNED TEMP PROCESSES STILL RUNNING: 0
BACKGROUND WATCHERS LEFT: 0
OWNED PLAYWRIGHT/CHROME PROCESSES REMAINING: 0
OWNED TEMP DATABASES REMAINING: 0
```
