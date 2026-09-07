# B36 production schema — PASS; runtime outstanding

Source checkpoint `d7794b31` was committed/pushed after the complete local gate:
383 suites / 3139 tests PASS, PostgreSQL proof, actual restart, clean replay,
lint, both typechecks, build and schema/drift checks.

[Production preflight](evidence/package5-b36-production-schema-preflight.json)
found only the expected B36 migration pending, no baseline drift, no competing
migration and healthy B35 services. The checksum-verified additive apply used
the existing documented schema-only staging procedure, lock timeout 5 seconds,
statement timeout 120 seconds and overall migration deadline 180 seconds.

[Post-apply receipt](evidence/package5-b36-production-schema-apply.json):
14 columns, 2 foreign keys, 7 physical indexes including the primary key,
2 checks and 2 immutable-binding guards verified. OwnerReportRun rows 0;
bound historical ActionExecution rows 0; pending migrations 0; drift NONE.
Health/readiness 200. No runtime/config switch and no service restart occurred.
Active baseline remains `/opt/maya-saas/releases/20260907-p5-b35-c8c7a8eb`.
The applied migration checksum is
`3572d6327a1f24f055370d44004c6ddfdebdfcc6746d3a2fbb33a14955a676f0`;
its SQL is now immutable release history.

B36 OwnerReportRun is durable in production; runtime enforcement is not yet
deployed. Runtime implementation/proof, mandatory gates, deployment/read-only
verification, then the fresh full 13-family Final Gate remain required.
Package 5 is not complete. No Wave 7/Chapter 7; do not declare Chapter 6 complete.

Production proof messages/business/provider mutations: 0. Fake historical
backfill: 0. Main 24 dirty entries and 17 old DBs were not changed. The owned B36 local cluster and `/tmp/maya-b36-schema-d7794b31` staging were
subsequently removed at the B37 STOP; see [final hygiene](evidence/package5-b36-b37-stop-hygiene.json).
