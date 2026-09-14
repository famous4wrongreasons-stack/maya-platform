# Package 5 B35 — approved schema foundation, local proof checkpoint

The owner approved checkpoint `c3641411` and the exact
[schema mapping V1](package5-b35-exact-schema-mapping-v1-proposal.md), including
production migration after its gates and continuation into runtime in the same
cycle. The earlier schema-approval STOP is superseded by that instruction.

## Implemented delta

`20260907120000_b35_canonical_bulk_foundation` adds exactly 12 nullable columns,
changes only Campaign channel/provider nullability, adds three unique indexes,
two ordinary indexes and three tenant-qualified RESTRICT foreign keys. No new
model, enum/value or action class; no historical UPDATE or invented backfill.
The DDL is transactional with bounded lock/statement timeouts. Existing defaults
and historical values remain unchanged; role CHECKs retain non-null transport
channel/provider requirements.

The migration extends the existing version gates and adds B35-scoped audience
sealing, immutable approval/Client/route identity, exact audience/child-set and
slot/endpoint correlation, successful Action Engine admission before transport,
attempt sequencing/leases, dispatch-evidence sealing, terminal/UNKNOWN barriers
and aggregate correlation. Existing payload-retention boundaries may redact
ciphertext without changing identity or delivery evidence. The prospective
history epoch is assigned database time on first establishment and cannot be
cleared, backdated or deleted/recreated. The migration establishes no epoch.

## Executable evidence and limits

- [Ownership proof](evidence/package5-b35-schema-ownership.proof.json): sealed
  Client audience, duplicate/foreign Client rejection, atomic approval binding,
  content/audience/expiry/authority conflict, fixed routes, one concurrent
  logical claim, stale-revision/live-lease rejection and immutable epoch.
- [Transport storage proof](evidence/package5-b35-schema-transport.proof.json):
  existing Action Engine and Communication Delivery kernels on real PostgreSQL;
  User-free verified Telegram graph, exact slot leaves, one concurrent claim,
  ALLOW proof before dispatch, accepted outcome reuse, lost-response UNKNOWN,
  independent pending Client progress, terminal failure and immutable attempts.
- [PostgreSQL restart proof](evidence/package5-b35-schema-restart.proof.json):
  accepted/UNKNOWN/failed outcomes remain durable, no new attempts for them,
  original pending child continues under the same root and Client child set.
- [Schema inventory and gates](evidence/package5-b35-local-schema-foundation.json):
  complete clean migration replay PASS; Prisma structural diff NONE; validate,
  lint and both typechecks PASS; existing communication/marketing/B31–B34
  compatibility selection 5 suites / 38 tests PASS.

These are schema/ownership proofs, not certification of the new marketing
runtime. They use synthetic data and no provider calls. The pre-boundary crash
case demonstrates the approved pending recovery transition in SQL; implementing
that B35-only recovery in the runtime remains required. Existing generic v1
retry budgets are unchanged. Fresh dispatch consent/preferences/authority,
quiet/frequency, the panel initiator, all production route executors, device
fanout and admission reconciliation must still receive the mandatory runtime
proofs after schema apply. No B35 runtime or Package 5 completion PASS is claimed.

## Production baseline and next step

[Read-only preflight](evidence/package5-b35-pre-migration-baseline.json) confirms
the accepted B34 release `20260906-p5-b34-6f6745f2`, pending migrations 0, drift
NONE, health/readiness 200/200, zero incompatible Campaign rows for the approved
nullability change and zero B35 columns before apply. B34 is not reopened.

Next: commit/push this exact schema candidate; use the previously documented
schema-only process from the
[B31 migration report](CYCLE-06-BLOCKING-PACKAGE-5-B31-OPTION-A-PRODUCTION-MIGRATION-REPORT.md),
including exact expected-only pending set and checksum, pre-apply baseline diff,
bounded migrate deploy, strict post-preflight and structural diff. Do not switch
the runtime release during schema apply. After PASS, continue the already
approved runtime remediation without an intermediate STOP. Any new contract gap
or mandatory failure blocks deployment until resolved or reported as required.

The isolated worktree is the only edited checkout. The main worktree's 24 dirty
entries and 22 recorded file hashes are preserved. All proof databases belong to
the new isolated PostgreSQL cluster on port 55505; none of the 17 pre-existing
databases was accessed. Owned implementation resources must be removed at the
final checkpoint. No real production message or business/provider proof mutation.

```text
B35 EXACT SCHEMA MAPPING: APPROVED / IMPLEMENTED LOCALLY
NEW MODELS: 0
NEW FIELDS: 12
ALTERED EXISTING FIELDS: 2
NEW UNIQUE INDEXES / NON-UNIQUE INDEXES / FOREIGN KEYS: 3 / 2 / 3
NEW ACTION CLASSES: 0
MIGRATION REQUIRED: YES
BACKFILL REQUIRED: NO
B35 PRODUCTION MIGRATION AT THIS CHECKPOINT: NOT STARTED
B35 RUNTIME REMEDIATION: PENDING
B35 PRODUCTION REMEDIATION: NOT COMPLETE
PRODUCTION MESSAGES: 0
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
WAVE 7 CREATED: NO
```
