# Private Beget phone staging preparation — 2026-10-14

## Scope and authority

Owner selected the existing Beget server and then said «готовь» after successful
read-only access. Prepare the separate synthetic phone-check environment; do not
deploy the production application, copy salon data, grant widgets.runtime or
install on iPhone. Public DNS/listener publication and device installation remain
the separate steps in [the phone plan](../../MAYA-PHONE-FIRST-CHECK-20261014.md).
No further password entry is necessary for the known SSH connection. Credentials
are neither copied here nor included in the package.

## Verified host facts

Read-only SSH inspection of the owner-selected Aspiring Eduard confirmed Ubuntu
22.04.5 x86_64, one CPU, approximately 2 GiB RAM, 1.4 GiB available and 10.5 GiB
free disk. Docker/Node/PostgreSQL/Caddy were not installed in PATH. Only SSH and
local DNS TCP listeners were present. `smm_bot.service` was active, with zero
restarts, using approximately 147 MiB. The service PID, start timestamp, unit hash
and listeners were recorded locally for before/after comparison. No service
configuration, contents or private values were printed.

Selected proposed hostname: `phone-test.mayaos.ru`. No A/AAAA answer existed at
inspection; this is a proposal, not a DNS reservation or a reachable endpoint.
Production `mayaos.ru` and `api.mayaos.ru` are not targets of this preparation.

## Exact preparation

The finite `scripts/phone-staging-plan.mjs` derives from the existing, SHA-pinned
`compose.staging.yml` and canonical Caddyfile. It generates an **offline plan**;
it cannot connect to a server, issue credentials or launch services. It is not a
new release engine, certification path or admission bypass.

- Project and private paths: `maya-phone-staging`, `/srv/maya-phone-staging`.
- Dedicated empty PostgreSQL database/role: `maya_phone_synthetic`; dedicated
  Compose volumes. No retained database or default seed.
- Canonical React PWA and existing OAuth return owner; no retired shell.
- Private gateway ports: `127.0.0.1:9080`, `127.0.0.1:9443`; not phone-accessible.
- Backend/Postgres only join the internal network. Gateway also joins a separate
  edge network. No backend or DB host port and no provider credentials.
- Memory ceilings: PostgreSQL 256 MiB, backend 640 MiB, gateway 96 MiB; total
  992 MiB. Swap disabled per container. CPU limits total 0.8 CPU, 128 PIDs per
  container and bounded container logs. These are explicit runtime caps. Actual Linux qualification is reported
  separately below; the offline plan alone is not that proof.
- No implicit image build or restart. An exact candidate-tagged image must
  already exist locally; future qualification must also record its immutable
  image ID. Image tag alone is not provenance proof.
- Normal compiled main with production configuration validation, existing
  no-provider/no-scheduler defaults, no local stage-0 launcher or guard bypass.
  New random test service keys belong outside the candidate/Git. None are made
  by the preparer. No production release/signing key is needed for this step.

Only during private bootstrap may two synthetic trial accounts be created by
the normal trial activation/signup API, as in `phone-backend-proof.mjs`. Before
public exposure, close self-service signup and prove normal login still works.
That later closed-public configuration requires exact validation; the private
plan is not permission to open its ports or change it ad hoc. Trial Ideas retains
its existing refusal; widgets, real model replies and booking are not admitted.

## Proven packaging defect and minimal correction

The existing Dockerfile omitted `prisma.config.ts` from its image. Its schema is
Prisma 7 and deliberately contains no datasource URL. Reproducing the runner
layout with the actual installed Prisma CLI failed with `datasource.url property
is required`, before a connection attempt. Adding the existing canonical file
to both stages made the same CLI proceed to the deliberate unreachable synthetic
DB (`P1001`). This initial counterfactual proves config discovery. The subsequent actual
Linux image build is reported below; it does not substitute for database replay. Neither SQL nor schema nor application behavior was changed.

`.dockerignore` now also excludes `.env.*`, retaining only the two checked-in
example templates. The distribution must still be built from an explicit clean
tracked-file list; this ignore rule is not a substitute for a package secret scan.

The new 27 tests cover that actual CLI counterfactual plus refusal of public DB
or gateway ports, outbound backend networking, removed resource limits, implicit
build/seed, old carrier, mutable image selection, retained/foreign DB, real
provider environment, stage-0 substitution, automatic reminders and fabricated
grant/certificate claims. They are added to the existing packaging CI workflow.
Fresh final-candidate receipts are recorded separately; local test success does
not claim the complete Platform CI or release certification.

## Reviewed server procedure and rollback

Do not run the generic `staging-up.sh` here: it starts public listeners, builds
without a shared-host resource budget and executes the broad default seed.

1. Recheck bot PID/start time/restart count/unit hash, ports, disk and free RAM.
2. Review/install the Docker prerequisites without restarting SMM or changing
   its files. Do not globally reset firewall rules. Record the selected engine,
   image digests and network routes. Resource-limit the builder as well as runtime;
   stop if the Linux build exceeds the cap rather than risking the bot with an
   unrestricted retry. Keep at least 3 GiB disk and 512 MiB available host RAM.
3. Qualify the actual Linux image and empty DB: immutable migration checksums,
   clean replay, health/readiness, canonical bytes, two-tenant normal login,
   refresh/logout, CORS, denied outbound traffic, no provider calls or grants.
4. Close signup; validate the exact closed configuration. Keep private until
   owner authorizes DNS/publication. A real certificate cannot be claimed from
   the private plan: public ACME reachability is not established.
5. At the publication step, add only the new exact hostname and its HTTPS
   listener; do not replace existing DNS. Prove public TLS, health, image/source
   binding and unchanged SMM. No public website or salon data is copied.
6. Build/sign the same React payload for this exact development API. Installation
   on the connected iPhone remains a separate authorization.

Rollback is limited to the `maya-phone-staging` Compose project: stop its
services without deleting volumes, withdraw only its new DNS/listener, preserve
the failed test evidence, recheck SMM. Do not stop Docker globally, flush firewall
tables, remove shared images or run `down -v`. Preserve the original host state.

## Committed candidate and fresh local preparation

Exact code candidate: `7aee28d297cd1d70c2f1cb6ce96740d9fd5948d3`, branch
`codex/maya-local-crm-setup-20261010`. The preceding source checkpoint is
`4169eb88e9d5f9689677e0ef6218b5ecceb3072d`. A later documentation-only commit
records these results; it is not a different image/candidate certification.

- 27 new preparation tests + 17 existing staging-selector tests: **44 PASS**.
- Canonical packaging suite: **18 PASS**.
- Actual compiled backend on fresh isolated local PostgreSQL, canonical HTTPS,
  two ordinary trial tenants, session/tenant/egress boundaries: **50 PASS** in
  [LOCAL-BACKEND-PROOF.json](LOCAL-BACKEND-PROOF.json). Local processes stopped.
- Actual Linux amd64 image: **PASS**, immutable image and compiled main hashes in
  [LOCAL-IMAGE-RESULT.json](LOCAL-IMAGE-RESULT.json). The compiled main hash equals
  the binary used by the local proof. No provider credentials entered the build.
- Exact development API `https://phone-test.mayaos.ru/api`: canonical payload
  verify and PWA/Capacitor parity **PASS**; all eight PWA files equal the uploaded
  package. Unsigned iphoneos Debug build and actual App.app verification **PASS**.
  [PHONE-TARGET-PAYLOAD.json](PHONE-TARGET-PAYLOAD.json). Not signed or installed;
  this URL is proposed and not yet reachable.
- Explicit transfer package: 2,498 allowlisted files; full package scan and
  reviewed generic false positives, **0 unresolved**. No retained salon data,
  real environment files, credentials or provisioning private material. See
  [PACKAGE-SCAN.json](PACKAGE-SCAN.json). This is not a whole-history Git scan.

### Build resource failure retained

The isolated server builder reached the existing Nest compilation but was
OOM-killed inside its 768 MiB cap. It did not start Maya services or restart
SMM. [SERVER-BUILD-FAILURE.json](SERVER-BUILD-FAILURE.json) is preserved as **FAIL**,
not relabelled green. The owned failed builder/cache was removed only after
saving this evidence. No unrestricted server build retry was attempted.

The identical allowlisted context was built successfully on a dedicated local
Colima Linux VM (4 CPU, 6 GiB, no host filesystem mounts, no SSH agent or public
address). Its amd64 image is transferred directly to the owner-selected VPS;
no public image registry is involved. [IMAGE-ARCHIVE.json](IMAGE-ARCHIVE.json)
binds the compressed transfer to the code candidate.

## Actual Beget private qualification — completed 15 October (Moscow)

The official Docker engine/CLI `29.9.1`, containerd `2.4.2`, buildx `0.38.0`
and Compose `5.6.0` were installed as five new packages, with no upgrade/removal
of existing packages. This **changed server preparation**, not the Maya production
application. Docker uses its Unix socket; no public Docker API was exposed.
SMM was not restarted. Exact base-image IDs are in [base-images.json](base-images.json).

The first 250 MB image transfer reached its 900-second transport bound. Its
242,876,416-byte prefix was preserved and hash-compared with the local archive;
no writer remained, then only 8,107,659 remaining bytes were appended. The whole
archive and imported immutable image ID matched. See
[TRANSFER-RECOVERY.json](TRANSFER-RECOVERY.json) and [IMAGE-IMPORT.json](IMAGE-IMPORT.json).
No rebuilding or source alteration was used to make this pass.

[private-start-result.json](private-start-result.json): backend and PostgreSQL
healthy with the specified memory/swap caps, no OOM, no host ports, and only the
internal network. Minimum host available memory during startup: 1,179,766,784
bytes; minimum free disk: 8,335,917,056 bytes. The test does not establish sustained
load capacity. Gateway was never started.

[PRIVATE-RESULT.json](PRIVATE-RESULT.json): **35 actual Linux HTTP checks PASS**
on the normal compiled backend, including exact SHA, database readiness, native
CORS/foreign origin, anonymous refusal, ordinary trial/signup/password login for
two synthetic tenants, four current read surfaces, tenant/conversation isolation,
refresh/logout and revoked-token refusal. Existing trial Ideas refusal remained
403; successful Ideas access is not claimed. A tenant owner remained unable to
read the platform-only metrics route. Kernel outbound refusal was `ENETUNREACH`.
The exact executable probe is [private-api-proof.mjs](private-api-proof.mjs).

The empty dedicated test database replayed **106 migrations**, and the existing
strict `release:preflight` passed without skip/allow-pending flags. Two ordinary
synthetic trials were created. CRM integrations **0**, widgets.runtime grants
**0**; no retained salon data, provider calls or production migration.

After the proof both owned containers were stopped, preserving only synthetic
volumes. SMM PID/start/restart count and its unit hash matched pre-state; TCP
listeners remained SSH and local DNS only. The dedicated local builder VM was
also stopped: [LOCAL-BUILDER-CLEANUP.json](LOCAL-BUILDER-CLEANUP.json).

## Current boundary and remaining work

**Private server preparation PASS; public phone endpoint NOT READY yet.**
`phone-test.mayaos.ru` DNS/public TLS were not installed, and the gateway remains
off. The private bootstrap configuration permits normal synthetic signup only
inside its internal network; it must not be published as-is. Exact closure and
ordinary owner smoke-account access are included in the next reviewed step.

[PUBLICATION-PLAN.md](PUBLICATION-PLAN.md) specifies the concrete DNS/HTTPS,
closed-signup, signing and device steps requiring the owner's next authorization.
The unsigned phone bundle already uses the intended exact development endpoint;
no signature or device installation is claimed. No iPhone was changed.

`CERTIFICATE: NOT_ISSUED`. Full release CI/mutation certification was not run.
No Maya production deploy/migration/grant, real provider call or salon-data transfer
occurred. This private qualification is not release certification or real booking
acceptance. HANDOFF and existing identity/Action Engine/AR-1 boundaries remain.
