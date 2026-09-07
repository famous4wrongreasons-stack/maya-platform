# B36 schema local gate — PASS

Accepted checkpoint `2ba294d5`; channel order **INBOX → TELEGRAM → APNS** is
approved. [Exact mapping](package5-b36-schema-mapping-v1.md) implements the
approved one-model / 14-column shape with zero new action classes.

[PostgreSQL proof](evidence/package5-b36-schema-proof.json) runs actual canonical
policy resolution, ingress and Action Engine on synthetic identities in the
owned port-55506 B36 cluster. It proves same-plan concurrent convergence,
changed-plan conflict, root/slot immutability, tenant isolation, exact slot
uniqueness, all-slot rollback, expiry and payload/audit retention. A synthetic
old-date retention fixture tests SQL lifecycle only; no historical production
intent is reconstructed. [Actual PostgreSQL restart](evidence/package5-b36-schema-restart.json)
preserves the same plan/order/root/executions and UNKNOWN, including the blocked
APNS successor and independent other recipient. Transports are never invoked.

Fresh empty-database replay: **83 migrations PASS**, Prisma validate/status/diff
PASS, zero pending and no drift. Targeted report/communication/ingress tests,
lint, both typechecks and build PASS. Complete mandatory backend regression,
including all existing architectural guards: **383 suites / 3139 tests PASS**.
[Stage results](evidence/package5-b36-schema-local-gates.json),
[verification](evidence/package5-b36-schema-verification.json).

Initial fixture-secret and unused-variable errors were corrected. One broad
Node 24.19 process exited natively with SIGSEGV and no Jest verdict; it is not
reported as PASS. The subsequent complete mandatory run passed, with no test
omitted or guard waived.

Migration SHA-256: `3572d6327a1f24f055370d44004c6ddfdebdfcc6746d3a2fbb33a14955a676f0`.
The additive production apply is authorized after these gates. At this local
checkpoint production schema/runtime remain unchanged; runtime owner/transport
wiring, runtime regression/deploy, read-only production proof and fresh full
13-family Final Gate remain outstanding. B35 production remains the baseline;
Package 5 is **not complete**. No Wave 7/Chapter 7 or Chapter 6 completion.

Main 24 dirty entries and file hashes remain intact. Seventeen old DBs were not
opened. Three owned B36 fixture DBs/one cluster remain active for later runtime
proof and must be cleaned at final STOP. Production proof messages/mutations: 0.
