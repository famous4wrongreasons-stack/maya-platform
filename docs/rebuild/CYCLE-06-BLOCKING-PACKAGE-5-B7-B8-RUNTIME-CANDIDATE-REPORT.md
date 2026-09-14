# Package 5 Final Remediation — B7/B8 runtime candidate

Accepted owner checkpoint `47454962`. The approved additive B7 migration was
applied from schema checkpoint `5e3a8e7a`: expected-only pending set, health and
baseline drift PASS; after apply pending 0, drift NONE, nullable field/backfill 0.
The accepted B5/B6 process remained running throughout schema apply.

B7 now admits `package5.client-habits.add.execute.v1` through canonical ingress,
verifies the tenant-qualified active ClientChannelLink/Client eligibility, and
commits encrypted CustomerProfile state with ActionExecution/Attempt and immutable
target-generation evidence in one serializable transaction. Guest Client needs no
Maya User. Exact V1 limits act together; overflow preserves ciphertext/generation.
Normalized command material is encrypted by existing ActionExecution storage;
audit fingerprints are keyed and results contain no raw preferences.

The pure policy module lives in action-engine, avoiding a CRM owner dependency.
The existing architecture ratchet found that import and remained unchanged.
No broad allowlist or mutation detection exception was added.

Python AI becomes an initiator with original signed request context outside model
arguments, across ordinary, streaming and realtime dispatch. Numeric chat id and
legacy phone-derived sessions cannot authorize Client habits. Retry uses the same
statement/child ordinal and durable outcome. The SQL habit writer fails closed;
self-reads use verified request context. Phone-only staff dossier lookup returns
an explicit access-required result, never another Client's habit data or invented
empty history. No new staff read authority is introduced.

B8 SMS verification returns transient possession evidence only. The endpoint
requires existing canonical binding or consumes an existing server-bound challenge,
then checks exact Client eligibility. No Client create/update, phone persistence,
legacy session issuance or fallback. The PWA accepts a linking token and reports
binding completion without claiming that contact phone was saved. Shared changes
are mirrored to native web assets; Capacitor sync and generated-copy equality PASS.

Validation: PostgreSQL runtime **20/20**, including 12/13 entries, 200/201 code
points, exact 8192/10963 and over-limit bytes, unchanged ciphertext/generation,
concurrent one-winner, durable admission/crash/restart, guest and isolation.
Schema proof **19/19**, targeted ratchets **39/39**, Python **28/28**, PHP strict
transport and all inline HTML scripts PASS. Full regression **331 suites / 2758
tests PASS**; project lint, both typechecks and build PASS.

Live Python/HTML/PHP candidates apply only exact bounded deltas over captured
live hashes. Unrelated dirty changes are not part of deployment. Evidence is in
`evidence/package5-b7-b8-runtime-candidate.json`.

**Runtime cutover is not performed at this checkpoint.** Next: mandatory server
candidate/deployment gates, production cutover and structural/read-only verification,
then automatically restart the full 13-family Final Gate. Package 5 remains
incomplete until that entire gate passes; any new bypass causes exact-evidence STOP.
Waves 1–6 remain accepted. No Wave 7/Chapter 7/automatic Chapter 6 completion.
Real production business/provider mutations for proof: 0. Historical 17 DBs untouched.
