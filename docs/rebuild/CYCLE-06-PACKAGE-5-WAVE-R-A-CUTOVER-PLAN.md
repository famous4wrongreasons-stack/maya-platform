# Wave R-A — coordinated cutover plan

The owner approved implementation and a single production cutover for R01
(B38/B39/B54), R02 (B40/B41), and R10 (B50) at checkpoint `45688886`.
This plan implements that authorization; it does not reopen the closed inventory
or grant authority to another remediation package.

## Release boundary

- Canonical source stays on `codex/maya-brain-systemic-release-20260815` through
  the isolated `/tmp/maya-b29-contour` worktree. Package commits are separated.
- The accepted production baseline is
  `/opt/maya-saas/releases/20260907-p5-b35-c8c7a8eb`, with B36 schema applied and
  B36 runtime **not deployed**. The runtime/flag/service hash comparison and
  read-only schema preflight must still match immediately before cutover.
- R-A adds **zero models, fields, action classes and migrations**. The existing
  83 migrations, including B36, remain unchanged. Pending migrations must be 0
  and structural schema drift must be NONE.
- Canonical history contains the separately accepted B36 runtime WIP checkpoint
  `7201f7bd`. Deploying the whole canonical checkout would incorrectly activate
  that WIP. The [release-view generator](evidence/package5-wave-ra-release-view.py)
  produces an auditable, clean Git release tree from the pushed R-A source,
  excluding only that exact checkpoint's 20 runtime paths and its matching
  schema-proof constructor adjustment. It retains B36 schema and the compatible
  d779 schema proof, every R-A change, and all canonical history. Any merge
  conflict, unexpected changed path, or schema difference stops preparation.
- The release view has its own immutable commit and pushed release ref. Both
  canonical source and release view must be clean and equal their remote refs.
  The report records both hashes and the exact exclusion manifest. No reset,
  stash, clean, or history rewrite is performed in either user worktree.

## Required gates

Each package must first pass its exact acceptance matrix and permanent ratchet.
Wave acceptance then requires all architectural guards, lint, application and
scripts typechecks, build, unchanged-schema/pending checks, and the full mandatory
backend regression. The clean release view runs the documented deployment gate
and build again because its source deliberately preserves the production B35
report runtime. A failing gate permits no production deployment.

The B36 runtime PostgreSQL proof remains a known, separately recorded FAIL; R-A
does not repair it, relabel it PASS, or publish its runtime. B36's two known
defects remain IDEMPOTENCY KEY and CONCURRENT WRITE CONFLICT.

## Coordinated publication

1. Recheck exact current backend release, Python/edge source hashes, health and
   readiness, migration history and structural schema. Hash mismatches stop the
   cutover before publication.
2. Prepare all Python and Beget candidates with reviewed, bounded overlays over
   the inventoried deployed sources. Preserve unrelated deployment differences
   and launcher wiring. Pin before/after hashes; parse candidates and execute
   package ratchets against them. Do not publish a whole local PWA/Python file
   over an unrelated deployed variant.
3. Publish the fail-closed legacy PHP appointment admission overlays and exact
   `Idempotency-Key` relay propagation. They reject unverified legacy creation
   before provider dispatch and do not depend on the new staff resolver.
4. From the clean, verified release view use the existing
   `maya-saas-backend/deploy/vps/deploy.sh`. Preserve its full local gate, fresh
   server `npm ci`, Prisma generation, preflight, no-op migration deploy,
   structural diff, bounded spare-port readiness check, atomic release switch,
   health/readiness check and rollback behavior. Dependencies are never borrowed
   from another production release.
5. Publish the reviewed R01/R02 Python overlay, including the actual production
   application middleware wiring, then perform the documented bot restart. The
   new backend principal endpoint must be available before this step. Publish
   exact PWA variant overlays with canonical token transport and retired legacy
   create initiators. Preserve all unrelated B35 and other production behavior.
6. Verify exact artifacts and closure guards on every assigned deployment alias;
   inspect service state, health/readiness and schema read-only. Record R01,
   R02 and R10 production acceptance separately.

Publication uses the existing scoped file replacement and deployment processes.
The stage directory retains the exact prior artifacts for bounded recovery.
Backend health failure invokes the documented previous-release rollback. A
Python/edge publication failure stops further publication, restores only its
owned changed artifacts if needed for service recovery, and cannot be reported
as Wave PASS. Successful earlier steps and remaining exposure must be recorded.

## Proof and continuation

No authenticated business command, real booking, provider mutation, message,
cron trigger, or report execution is used for production proof. PHP fixtures
contain extracted pure branches only, run without application/config imports,
network/process/file mutation functions, or persistent remote files. Concurrency,
restart and receipt proofs use a newly owned local PostgreSQL cluster and fake
provider effects. The 17 pre-existing databases are never used.

After all three production acceptances PASS, mark the six existing blockers
REMEDIATED in a separate progress ledger; preserve the historical inventory.
Assess the next eligible parallel group R03/R04/R07 using the existing dependency
graph. Do not implement that group in this wave. Do not run the Package 5 Final
Gate here, declare Package 5/Chapter 6 complete, or start Chapter 7.

The final report must include artifact and proof evidence, cleanup of all owned
processes and temporary staging resources, preserved main 24 dirty entries,
commit/push confirmation, and the requested STOP.

The VPS PWA alias `vps/app.html` maps exactly to `/var/www/maya-platform/app.html`
as established by the S13 public-hash probe. It is separate from the Python root
`/home/botadmin/barbershop-bot`. The first staging-only check caught and corrected
a publication mapping error before any runtime file was written. The revised
publisher pins per-file destinations and preserves original ownership and modes;
five independent offline rollback cases pass against this exact version.
