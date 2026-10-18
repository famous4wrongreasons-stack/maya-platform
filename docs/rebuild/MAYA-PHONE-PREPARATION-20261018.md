# Phone preparation: Maya icon, actual server prestate and restore proof

Date: 2026-10-18. Parent engineering checkpoint:
`33da499bba32426f133a98018f7f4d1da0c1c027`.
Branch: `codex/maya-local-crm-setup-20261010`.
Application source remains `6356db1875545337e34b6c8888b7ca858bb64361`;
profile `closed-input.no-handoff.no-price-goods@1`.

**SCOPED PREPARATION, NOT RELEASE CERTIFICATION. Not ready for real booking.**
This packaging change is new release input; it does not inherit a certificate.
There was no application deployment, migration, entitlement grant, provider/model
call, phone installation, role promotion or real business operation in this unit.
The 1,333 intentional working-file deletions remain unstaged and unrestored.

## Actual server evidence

With the owner's explicit confirmation, the existing Mac public SSH key was added
to Aspiring Eduard (`45.67.56.4`). The Beget access key was preserved. Both public
fingerprints and successful key-only SSH authentication were checked. No private
key was generated/transferred and no password was changed. This changes
administrator access to the test VPS; it does not create platform application
authority. The former production host was not accessed.

Fresh [server prestate](evidence/maya-phone-preparation-20261018/SERVER-PRESTATE.json):

- Running backend image still identifies the historical `7aee28d2` deployment.
  Its immutable Docker image is
  `sha256:d8f6a5b33529e4a7f2e4503cc7e867de88d259f35236fb38d6b8886fcb5a9f6f`.
  The canonical compiled-code/lockfile digest was measured separately:
  `1541cea0869f6d1c9288c0e2479eb6ef50cfc3a34f4faebe8c22bdddd34db237`.
  A tag is not treated as evidence that the new candidate is deployed.
- Backend and database are healthy; public HTTPS home, health and database
  readiness endpoints all returned 200. See
  [read-only smoke](evidence/maya-phone-preparation-20261018/public-readonly-health.json).
- One active personal `maya_user` link exists for the selected tenant. Repeating
  Telegram linkage is not the missing release step.
- No global active platform owner/session and no `widgets.runtime` entitlement
  were found. Production trust/tenant-allowlist configuration is absent.
- Old catalogue and model windows expired on 2026-10-16. They were not renewed;
  their counters/ledgers were not reset. Telegram egress was already stopped.
- Each running service's actual Compose owner was inspected separately; they
  do not all come from the same historical Compose file.

The selected database has **106 applied migrations, 0 unfinished**. Every applied
name and checksum matches the 106 SQL files in application candidate `6356db18`:
no missing, unexpected or altered migration. See
[schema comparison](evidence/maya-phone-preparation-20261018/schema-comparison.json).
No migration was applied.

## Retained backup and isolated restore

Backup directory on that same server:
`/srv/maya-phone-backups/20261018T140602Z` (root, mode 0700).
Database dump, actual mounted configuration/uploads/private settings and immutable
Docker images are mode 0600. Raw backup/credentials/data remain there and are not
downloaded or committed. The administrator-only Compose download retained locally
is excluded from Git. This is a same-host rollback copy, not off-site disaster
recovery.

[Restore receipt](evidence/maya-phone-preparation-20261018/server-restore-existing.json):

- The retained image archive loads; the database dump restores using PostgreSQL 16.
- A temporary read-only-root container had `network=none`, no published ports and
  no original database volume. The database itself used disposable tmpfs storage.
- Exact row counts and whole-table content digests matched for **all 134 tables**
  between source-before, restored copy and source-after. No customer rows or
  per-customer hashes were exported in the receipt.
- Original service container IDs/start times/restart counters remained unchanged.
  The original backend remained healthy. Temporary restore container was removed.

The first restore attempt was correctly recorded as failed: `pg_isready` observed
the temporary initialization server, then restore encountered "database system
is starting up". The corrected check waits for PID 1 to become PostgreSQL and
for a successful SQL query against the target database. The second attempt used
the **same retained backup**, not a replacement dump. No working service was
restarted to make the proof pass.

This proves backup readability and data restoration. It does **not** claim the
complete previous/new application cutover + canonical revoke rollback rehearsal.
That remains dependent on the final execution wiring and certification.

## Native icon and release packaging

The source is the existing approved companion-v1 `maya-logo.png`, SHA-256
`53d4b9fb9aa48915d89d88b5fc945568afa1aa7f532475c34333b8096bc41600`.
The packaging-only Swift converter preserves that artwork, composites it on
white and emits an opaque RGB 1024×1024 PNG. It does not redraw the logo or bake
in rounded corners. Output SHA-256:
`0ad282fd8d686d39d430f675efdb9fa5bde7b96e370519533ce9ba6711fe68b8`.
The asset catalogue selects it instead of the Capacitor placeholder.

The canonical React release owner checks the exact selected native icon and its
bytes in all five modes: build, sync, verify, verify-native and verify-app.
`npm run test:release` includes the icon proofs. A regression exposed a prior CLI
problem: Node resolved a linked directory but the entrypoint comparison did not,
so the script could exit 0 without running verification. Resolving the entrypoint
path fixes it. A real CLI test exercises every mode through both ordinary and
linked directory paths and requires the precise icon refusal, not just any error.

Fresh scoped results:

- Carrier: **200 PASS**, no failures/skips.
- Release packaging: **25 PASS**, including seven icon tests and ten actual
  CLI refusals. The recorded pre-fix entrypoint failure is retained separately.
- Production-default packaging build, then phone-test endpoint sync, succeed.
- Unsigned `iphoneos` Xcode build succeeds; actual app payload verification uses
  the existing source-bound React/Capacitor parity owner.
- The compiled home-screen image was decoded for visual inspection and contains
  the approved blue Maya mark on white. Signing/device installation are separate.

The read-only device/signing check finds the paired iPhone currently disconnected
and one valid local signing identity. This is not proof of a completed signature,
provisioning renewal or device install. No signing private key was read/exported.

One invocation of the production-default parity tests against the intentionally
phone-test-addressed output failed. It was a mismatched test target, not waived:
the final run rebuilt the production-default artifacts before running that suite,
then independently synced and verified the phone-test artifacts again. Failed
attempt logs remain in the local evidence inventory.

A bounded packaging export reused existing dependencies. Capacitor generated
relative package paths resolving those same dependencies; those machine-specific
paths are not source changes and are not committed. No backend, headless runtime,
React presentation behavior or booking implementation changed.

Proof/source hashes: [PACKAGING.json](evidence/maya-phone-preparation-20261018/PACKAGING.json).

## Remaining route to the first real phone test

1. Finish the real execution-admission bridge and bounded ordinary AiCore transport
   described in [the native run guard checkpoint](MAYA-NATIVE-RUN-GUARD-20261018.md).
   Synthetic callbacks, a provider key and an AR-1 grant alone are insufficient.
2. Complete uninterrupted full certification/admission on the final exact source
   and packaging. The interrupted V6 mutation programme has no final receipt;
   this unit does not replace it or issue `CERTIFIED_FOR_PROFILE`.
3. Rehearse application cutover/revoke/rollback with the final wiring, using the
   actual prestate above. Then request the concrete bounded deployment decision.
4. Use the existing narrow platform bootstrap, normal global login and existing
   AR-1 signing/grant owners; install the verified signed phone build; perform
   read-only acceptance before an explicitly authorized real booking lifecycle.

All necessary owner actions remain grouped in
[First platform operator](MAYA-FIRST-PLATFORM-OPERATOR-20261015.md): choose the
separate platform credentials and log in; provide the operator-owned public key
and exact external signature; approve the concrete final update/grant and bounded
real test. No secret is requested in chat. No real signing private key is generated
or stored by the agent. The existing salon account and personal link are retained.

**CERTIFIED != DEPLOYED != USER ACCEPTED.** Full release readiness remains NO.
