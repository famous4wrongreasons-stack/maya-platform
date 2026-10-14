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
  container and bounded container logs. These are proposed caps, **not measured
  Linux capacity or egress-isolation receipts**.
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
DB (`P1001`). This proves config discovery, **not a Linux image build or successful
migration**. Neither SQL nor schema nor application behavior was changed.

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

## Next bounded server step and rollback

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

## Status boundary

Prepared configuration is not a running staging server. Docker installation,
Linux build/resource qualification, actual internal-network denial, empty-server
DB replay, public DNS/TLS, signed phone bundle and device acceptance are still
required. `CERTIFICATE: NOT_ISSUED`. No production deploy/migration/grant, real
provider call, salon-data transfer or iPhone installation is authorized by this
packet. Server preparation does not certify a release.
