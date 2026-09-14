# Package 5 Final Remediation — B7 schema foundation

Owner checkpoint `47454962` accepted. B7 exact limits and B8 linking-only option A
are approved. This is remediation of the final gate, not Wave 7.

Added only nullable `CustomerProfile.encryptedClientPreferences`, with Client
ownership and ciphertext byte/format guards. No new model, default or backfill.
Canonical V1 policy checks all four limits simultaneously: 12 entries, 200 Unicode
code points per entry, 8192 complete UTF-8 JSON bytes, 10963 persisted ciphertext
bytes. Overflow rejects without changing existing ciphertext or generation.
No LLM compression, eviction or truncation is introduced.

PostgreSQL schema/adversarial/concurrency proof: **19/19 PASS**. Includes exact
8192/10963 and 8193/10964 cases, 12/13 entries, 200/201 Unicode code points,
byte-identical rejected state, one concurrent CAS winner, guest Client,
composite tenant FK and unchanged staff/B5/B6/consent state. This is schema
proof; canonical runtime proof follows remediation and is not claimed here.

Clean replay: PASS, drift NONE, no backfill. Prisma validate, schema ratchet 3/3,
application and script typechecks, project lint and build: PASS. Owned isolated
PostgreSQL cluster, socket and database removed; historical 17 databases untouched.
Evidence: `evidence/package5-b7-schema-foundation.json`.

Production migration is **not yet applied at this checkpoint**. Next: expected-only
pending set, additive schema and read-only health/drift gates; apply the single
approved migration if green, then continue B7/B8 runtime without intermediate STOP.
Runtime deploy and a fresh full 13-family Final Gate remain required. Package 5
remains incomplete; accepted Waves 1–6 and B5/B6 production baseline are preserved.
Real production business/provider mutations: 0. Chapter 6 completion not declared;
Chapter 7 and Wave 7 not started.
