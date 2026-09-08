# Wave R-C — WIP checkpoint and production baseline divergence STOP

**2026-09-08. STOP; not a package acceptance, release candidate, or production completion report.** Owner approvals from checkpoint `0ad0eef2` remain accepted. No contract is reopened by this report. R05/R06/R08/R09/R11/R12/R13/R14 implementation was stopped after a read-only production check proved the owner's explicit `production baseline divergence` STOP condition.

## Exact reason

| Item | Certified baseline | Observed now |
| --- | --- | --- |
| Canonical checkpoint | `0ad0eef23985c0a23b6e680b3ca9d26a9c94efbc` | origin `b6c53ff9ee31bb43d0419f5ce32aa6b0e4999ae0` |
| Production release | `/opt/maya-saas/releases/20260907-p5-rb-cb4fb27c` | `/opt/maya-saas/releases/20260908-native-consent-compat-b6c53ff9` |
| Later upstream commits | None in approved R-C entry | `e5ec27fd` and `b6c53ff9` |

`e5ec27fd` is titled `fix(client): restore verified native consent linking`; `b6c53ff9` is titled `fix(client): support installed native consent flow`. Their combined diff changes **11 paths**: Client channel runtime, native association issuer, profile-read authority, customers controller, associated tests, and the canonical PWA. The exact path list is retained in [production-divergence.json](evidence/package5-wave-rc-baseline-stop/production-divergence.json). The PWA overlaps this wave's composed artifact; compatibility cannot be inferred from successful old-baseline proofs or healthy endpoints.

The read-only check was repeated: both `maya-saas` and `barbershop-bot` were active; `/api/health` and `/api/health/ready` on the existing local port `3107` returned **200**. `ffprobe` exists at `/usr/bin/ffprobe`. An initial inspection queried the nonexistent unit name `maya-saas-backend`; its empty WorkingDirectory was not accepted as service evidence. The actual `maya-saas` unit confirms `/opt/maya-saas/current`.

There was no deployment, production migration, restart, provider call, business write, or outgoing message for proof. Neither upstream commit was reverted, reset, merged, force-pushed, or overwritten. Discovery/inventory was not restarted. No new Bxx or inventory defect is asserted from the release-name difference alone. The current combined baseline is **not certified**.

## Preserved implementation

Schema foundation is in `b35c4cef`: **11 models / 197 physical fields / 21 action classes (13 AE + 8 AC6)**, nine ordered forward migrations, no backfill. Local Prisma validation, clean replay of 92 migrations, approved-constraint proof (45 cases), and schema drift checks had passed; these are historical local evidence, not a check of the newly observed production database. R05 only extends the existing report CHECK; OwnerReportRun is not recreated.

Runtime is saved as package-local WIP commits followed by one shared-integration WIP commit. Individual commits are logical review boundaries; shared registration and module dependencies are supplied by the final integration commit. None is independently certified for deployment.

| Package | Blockers | WIP commit | Preserved local work |
| --- | --- | --- | --- |
| R05 | B36, B43 | `eb9143e2` | OwnerReportRun/A12 plan, morning reports, ordered delivery, canonical downloadable snapshot; legacy report push retirement |
| R06 | B44, B45, B48, B49 | `b29f969a` | OperationalAlertRun, canonical Inbox projection and producer mapping, AC6 payload verifier |
| R08 | B47 | `790ee48b` | NativeFeedback request/revision, exact Client/Appointment authority, approved invitation consent, durable delivery |
| R09 | B52 | `46cd6bb9` | Anonymous source facts, human moderation, AE, retained observation/revision identities; no auto-publication |
| R11 | B51, B59 | `b39fcb61` | A22 tenant revisions and separate exact personal Telegram mute/preferences |
| R12 | B53, B58 | `6bd6d4e0` | Team message/attachment owner, AE-only final publish, private streaming storage, Inbox-only plan, scoped AC6 |
| R13 | B37 | `5bc3c75c` | ExpenseReminderRun/intake bindings, existing A13/CD and R02/AI approval/R10/P407; explicit default-off opt-in |
| R14 | B55 | `064a9e6f` | Immutable cash observation/correction/withdrawal, exact confirmation, AE, scoped reason retention |
| Shared | Approved wave interactions | `180a4aba` | AE/ingress/CD/module registration, existing AI policy/receipt adapters, shared AC6, bounded Python/PWA composition |

[Exact commit/file ownership](evidence/package5-wave-rc-baseline-stop/wip-commits.json) is preserved. All owner-approved Option A semantics and the schema envelope remain binding. Commit messages intentionally say **WIP**. No package was promoted to local acceptance or production PASS at this stop.

## Last observed local proof

[Proof index and original local logs](evidence/package5-wave-rc-baseline-stop/proof-index.json) retain source paths and hashes. Earlier successful runs do not certify later shared edits. In particular, final full B36/combined tests remain required.

- R05: existing B36 PostgreSQL idempotency/concurrency and actual restart checks passed earlier; R05 runtime proof passed six groups with synthetic delivery only. Full B36 repetition after the final shared changes remains outstanding.
- R06: synthetic occurrence/audience, projection, independent delivery, real PostgreSQL restart, event ownership and actual AC6 retention proofs passed earlier.
- R08: exact Client with/without Maya User, request/response, delivery restart and AC6 proofs passed earlier. Repeat the runtime proof after its last transaction-conflict changes.
- R09: runtime, actual PostgreSQL restart, claimed retention, Python guard and public/PWA initiator proofs passed earlier.
- R11: governed configuration/preferences and real AC6 proof passed earlier; the earlier targeted run recorded four suites / 40 tests.
- R12: actual private filesystem + PostgreSQL runtime, lost publish receipt/UNKNOWN, actual restart, original Inbox plan and claimed filesystem retention passed. Latest safe-receipt and shared changes still need the final package regression.
- R13: latest full runtime proof passed five groups, including concurrent complete source bundles; per-card R10/P407 confirmation; no second expense after lost response after commit; and recovery of the same admitted execution before local effect. Existing R13/R10 targeted run: three suites / 28 tests PASS. The Python candidate test passed four tests.
- R13: actual AC6 retention passed resolved/pending/UNKNOWN/empty cases. Only eligible encrypted payloads were erased; immutable identity/hash/audit and execution rows remained; ordinary clear/delete failed; no approval or Expense was created by retention.
- R13/R14: **actual owned PostgreSQL process restart `54563 → 64652`**, followed by PASS. R13 reused original slots/cards without reparse or resend; R14 reused the confirmed outcome and resumed an admitted READY command to one declaration without a new execution. [Process evidence](evidence/package5-wave-rc-baseline-stop/r13-r14-restart-process-evidence.json).
- R14: stale concurrent correction is now terminal through the existing kernel, with no orphan READY command in the race proof. `finalizeDefinitiveFailure` gained the same optional transaction integration pattern as existing success finalization; its complete kernel regression remains pending.

**Unfinished/failed checks are not hidden:** the most recent targeted command named a nonexistent `src/action-engine/action-engine.kernel.spec.ts`. Jest exited 1: four actual suites / 21 tests passed, one nonexistent path failed to load. This is not an aggregate PASS and does not prove the kernel change. The earlier scripts typecheck reported three overly narrow `null` fixture types; those were corrected before STOP, but the command was not rerun afterward. An application typecheck passed before the last R14/kernel change; it is stale for the final checkpoint. No combined mandatory gate or Package 5 Final Gate was run.

## Required continuation after baseline reconciliation

1. Read this report, the approved [Owner Decision Pack](CYCLE-06-PACKAGE-5-OWNER-DECISION-PACK.md), package sheets and the closed inventory. Preserve both upstream commits and the WIP branch. Reconcile their exact runtime/authority/PWA changes and actual deployed composition; do not restore the old PWA over the installed-native-consent work. Do not claim compatibility or a new inventory surface without evidence.
2. Once the combined baseline is certified, resume approved R-C implementation. No additional Option A decisions are required merely because work was checkpointed. Schema/runtime remains held until reconciliation, not abandoned.
3. Finish package-local review/proofs below, then all eight local acceptance decisions. Only then run the combined mandatory gate, a single coordinated production migration/cutover, and read-only production verification. The final 13-family/32-surface gate remains after all 14 packages / 24 blockers are production PASS.

Concrete unfinished review items, kept within existing package scope:

- **R05:** review `OwnerReportStore.purgeExpiredPayloads` against live execution/UNKNOWN retention holds; its current broad `updateMany` is not accepted yet. Finish the Python report retirement ratchet/composition and repeat the full B36 PostgreSQL proof before B43 acceptance.
- **R06:** repeat the latest projection fixture and the affected old B9/communication fixtures. Update existing Python communication ratchets to the approved producer mappings across R06/R08/R13; do not weaken their violation-class checks.
- **R08/R09:** repeat R08 after the last concurrency changes; verify the assembled public webpack consumer, the hash-pinned PHP/JS aliases and the combined PWA against the newly reconciled baseline.
- **R11:** repeat shared A22/role/preference integration after all consumers are composed.
- **R12:** repeat final receipt/retention/runtime proof; add actual bounded audio-container validation evidence and reject mismatched MIME; verify persistent private storage configuration/permissions and the legacy public-media deny artifact in the cutover plan. The production `ffprobe` presence alone does not prove those paths. Review pending PWA behavior after deterministic rejection without discarding UNKNOWN identity.
- **R13:** expand exact confirmed provider-message correlation, route revocation/mute, deterministic delivery-failure checks; review strict immutable-manifest normalization and the final PWA canonical-outcome display. The accepted existing R02 principal remains mandatory. The source capsule is only encrypted transport provenance (hash, not original text), submitted under an actual Maya session; it is not a second human authority or business execution owner.
- **R14:** repeat full package/kernel regression after terminal stale-revision handling; keep cash observation distinct from Expense, ledger and reconciliation.
- **Shared:** all architectural guards; cross-package integration; lint; application/scripts typechecks; build; Prisma validation; clean replay; pending migrations and drift; complete mandatory backend regression. Do not use the absent kernel-test path from the failed command.

## Local artifacts and hygiene

Worktree: `/tmp/maya-b29-contour`, branch `contour/b29-remediation`.

Scratch directory: `/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/package5-wave-rc-implementation`.

`composed-rc` retains candidate Python and seven PWA artifacts; PHP candidates are under `edge/r08-php` and `edge/r12-php`. **Its old manifest/publisher metadata still refers to R-B and must not be executed.** Recompose with reviewed new-baseline hashes. Old scratch schema generators are superseded by the committed schema/migrations and must not overwrite them.

Only the owned PostgreSQL cluster on `127.0.0.1:55509` / user `maya_rc` was used. At STOP, custom dumps of its three owned databases were retained under `stop-synthetic-db-backups`; then only `maya_rc_replay`, `maya_rc_b36_runtime`, `maya_rc_clean_replay` were dropped and the owned server stopped. No operation targeted port 5432 or any of the 17 pre-existing databases. [Cleanup evidence](evidence/package5-wave-rc-baseline-stop/cleanup.json). Restart/replay instructions and exact local proof commands are in the committed scripts; preserve these synthetic dump/checkpoint files if resuming previous restart proofs.

The main worktree still has the same **24** dirty entries, with all **22** protected file hashes unchanged. The **85** protected historical migrations/inventory documents remain unchanged. [Protected-state evidence](evidence/package5-wave-rc-baseline-stop/protected-state.json).

## Status at STOP

```text
STOP REASON: PRODUCTION BASELINE DIVERGENCE
COMBINED BASELINE CERTIFIED: NO
OWNER OPTION A APPROVALS: PRESERVED 8/8
WAVE R-C LOCAL ACCEPTANCE: NOT COMPLETE
WAVE R-C PRODUCTION MIGRATIONS: 0
WAVE R-C PRODUCTION DEPLOYMENTS: 0
PACKAGES COMPLETE AT LAST CERTIFIED BASELINE: 6/14
BLOCKERS REMEDIATED AT LAST CERTIFIED BASELINE: 10/24
REMAINDER INVENTORY REOPENED: NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
MAIN DIRTY WORKTREE TOUCHED: NO
PRE-EXISTING DATABASES TOUCHED: 0
OWNED TEMP PROCESSES: 0
OWNED WATCHERS: 0
OWNED BROWSERS: 0
OWNED TEMP DATABASES: 0
PROCESS HYGIENE: 0
HEAD = canonical origin: NO (upstream divergence retained)
```

B36's last certified production state remains the historical reference: schema ALREADY APPLIED, runtime NOT DEPLOYED, two proof defects (idempotency key and concurrent write conflict) addressed by this local WIP. The newly observed external release's B36 composition was **not re-certified**. No repeat B36 schema migration is proposed or performed.

The WIP and this report are published only to the isolated branch. Canonical origin at `b6c53ff9` is left intact. The branch's remote equality is a checkpoint-integrity check, never a substitute for `HEAD = canonical origin` or production certification. **STOP.**
