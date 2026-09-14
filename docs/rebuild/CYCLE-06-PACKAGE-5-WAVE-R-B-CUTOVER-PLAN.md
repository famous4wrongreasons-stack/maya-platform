# Wave R-B — coordinated cutover plan

Owner authorization: checkpoint `cb4fb27c`. Exact package membership remains R03/B56, R04/B42 and R07/B46+B57 from the accepted E2 assessment and closed master inventory. No new model, schema field, action class, migration or parallel owner is authorized.

## Baseline and immutable release boundary

- Production baseline is `/opt/maya-saas/releases/20260907-p5-ra-d8049d47`, exact release view `4891f5e758a51bf7f680d0ba27aee490b413dc93`. R01/R02/R10 remain production PASS.
- Entry read-only checks match all 95 Python and 593 compiled artifact hashes, nine Beget aliases and the exact VPS PWA alias `/var/www/maya-platform/app.html`. Runtime flags and service state match the recorded R-A baseline. Pending migrations 0, structural schema drift NONE, health/readiness HTTP 200.
- B36 schema remains APPLIED and runtime NOT DEPLOYED. Its IDEMPOTENCY KEY and CONCURRENT WRITE CONFLICT proof defects remain R05 work. No second schema is created.
- Use the same exact B36 WIP exclusion as R-A: a clean immutable release view excludes only checkpoint `7201f7bd`'s 20 runtime paths and matching schema-proof constructor adjustment, retaining its applied schema and compatible d779 schema proof. Record canonical and release commits, tree and exclusion manifest; preserve canonical history and the protected main worktree.
- Keep separate logical R03/R04/R07 commits. Both canonical source and the exact release view must be clean and pushed before deployment. No conflicting projection or unexpected source/path change is silently repaired.

## Local proof and aggregate gate

Each package must pass its full approved acceptance matrix and meaningful permanent architectural ratchet. Test actual native/provider/writer bodies with synthetic dependencies, not only marker presence, and prove the composed production overlay so existing local/production differences cannot hide a bypass. Reuse existing A15/A23/B35/P405 owners, R02 principal and R10 receipts.

Durable proofs use only the newly owned loopback PostgreSQL cluster on port 55508 and its recorded `maya_rb_*` databases, with synthetic providers/delivery. Never connect to the 17 old databases. Retire unsupported native mutation/approval/job behavior without inventing credentials, authority, audience expansion or fallback. Preserve supported existing canonical flows.

After all local acceptances PASS, run combined architectural ratchets, lint, application typecheck, scripts typecheck, build, schema validation, pending migration check, structural schema diff and full mandatory backend regression. New migrations from R-B must be 0. Run the actual release-view gate as well. Any mandatory failure blocks cutover until corrected within owned scope; record failed and repeated runs truthfully.

## Coordinated publication and recovery

1. Recheck the exact production baseline, schema, health/readiness and artifact hashes immediately before publication. An unexplained divergence stops cutover.
2. Construct bounded Python/PWA overlays from hash-matched R-A production originals. Shared files have explicit package hunk ownership and must compose without overwriting another package or activating B36. Preserve unrelated source variants and known remaining blocker behavior. Pin before/after hashes, destination paths, modes and ownership; keep private original source outside Git.
3. Run syntax checks, ordinary executable package proofs and active-source guards against every candidate alias. Exercise the scoped publisher's copy/restart failure recovery offline before any production write.
4. Deploy the clean verified backend release with the existing unchanged `maya-saas-backend/deploy/vps/deploy.sh`: full local gate, fresh server dependencies, Prisma generation, preflight, no-op migration deploy, structural diff, bounded spare-port readiness process, atomic switch and health/readiness. Do not borrow dependencies from another production release.
5. Publish the approved Python overlay only once the required canonical backend endpoints are available. Restart the bot using the existing documented process; then publish exact affected PWA aliases. Preserve OAuth/service-worker files and unrelated deployment variants. No whole local source overwrites a different deployed variant.
6. Verify exact deployed hashes and package guards, current release, service/listener state, health/readiness and schema read-only. Record R03/R04/R07 production acceptance separately, backed by the exact release's local executable proofs.

On publication failure, stop further publication and restore only owned changed artifacts from pinned originals as needed for service recovery. Preserve original modes/ownership. Backend rollback follows the documented deploy script. A partial cutover cannot be reported PASS. Remove only owned staging and temporary files after success; reap all owned proof/smoke processes.

No real business/provider/message mutation, Cron/job trigger or report execution is permitted for production proof. Ordinary deployment/restart is the authorized operational action; zero proof effects does not claim that normal production activity ceased.

## Accounting and continuation

After all three packages have production PASS, mark only B56/B42/B46/B57 and R03/R04/R07 REMEDIATED in the separate progress ledger. Historical inventory remains unchanged. Expected cumulative progress is 10/24 blockers and 6/14 packages, with eight packages remaining.

Then assess the next dependency-eligible R05/R06/R08/R09/R11/R12/R13/R14 group. Prepare one owner/schema Decision Sheet per package that still requires decisions; do not implement an unapproved contract. Keep B36's existing approved foundation and defects within R05, and its B43 extension approval distinct.

Do not run Package 5 Final Gate until all 14 packages have production PASS. Do not declare Package 5 or Chapter 6 complete, or start Chapter 7. Finish with evidence/reports, commit/push, clean isolated worktree, protected main 24 entries and 17 old databases unchanged, process hygiene 0, then STOP.
