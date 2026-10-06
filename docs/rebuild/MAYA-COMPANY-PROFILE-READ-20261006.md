# Public salon address and hours — development checkpoint

Code `b62a8099` makes the existing `company.business-hours.read` result useful in
chat: current public address and hours are composed directly from CRM evidence.
A short follow-up rereads current facts. Missing address or hours remains explicit,
while the known part is preserved. The answer does not infer “open now”, capacity,
directions or a booking. No extra model wording call is needed after the read.

The existing READ grant, tenant binding, tool handler/runtime, C9 conversation
receipt and chat persistence remain their owners. No schema, authority, retention,
background initiator, notification or CRM mutation was added. This is an explicit
request path; the prior own-schedule HTTP/browser proof is not evidence for this
new runtime version.

The actual YClients adapter now rejects a different company ID in the detailed
profile, then uses its existing discovery fallback for the configured company.
Neither direct profile nor discovery substitutes a city for an absent address.
Absent, empty, Boolean or fractional timezone offsets stay unknown; valid IANA
names and exact whole-hour offsets retain their existing meaning.

Grounding validates provenance, verified/current state, bounded field shape and
schedule availability before composing the reply. The public-location/hours hint
does not intercept client dossier, IP/email, settings, booking-opening or email/site
address questions. It remains within the existing model/tool selection mechanism.

Six targeted unit suites pass 289/289; scoped ESLint reports zero errors and two
pre-existing warnings in the AiCore test helper. Independent read-only review found
no remaining blocker after address, timezone and hint corrections. The unit model
and CRM values are scripted/synthetic.

Full-project `tsc --noEmit` exhausted its 3072 MB heap; that OOM remains evidence,
not a semantic code failure. The later parent-authorized production-only check
(`tsconfig.build.json`, 4096 MB, incremental disabled) passes in 5.52 seconds. Tests
and scripts are excluded by that config, so no full-project semantic pass is claimed.
Real model/provider acceptance, aggregate/release certification and C10 completion
are not established.
Qualification remains `NOT_ISSUED`.

Commands used from `maya-saas-backend` (the local launcher scrubs environment and
does not start/connect a database for these units):

```sh
node /tmp/maya-unified-gate-20261006/launch.cjs node --max-old-space-size=1536 node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/ai-tools/ai-core.service.spec.ts src/ai-tools/ai-tool-handler.service.spec.ts src/ai-tools/ai-tool-policy.service.spec.ts src/ai-tools/ai-tool-extended-capabilities.spec.ts src/crm/adapters/yclients-crm.adapter.spec.ts src/orchestration/c9.conversation-reads.spec.ts --json --outputFile=/tmp/maya-company-profile-cohort5.json
node /tmp/maya-unified-gate-20261006/launch.cjs node --max-old-space-size=1536 node_modules/eslint/bin/eslint.js src/ai-tools/ai-core.service.ts src/ai-tools/ai-core.service.spec.ts src/crm/adapters/yclients-crm.adapter.ts src/crm/adapters/yclients-crm.adapter.spec.ts
node /tmp/maya-unified-gate-20261006/launch.cjs node node_modules/typescript/bin/tsc --noEmit
```

[Hashed unit evidence, failed typecheck and review](evidence/maya-development-integration-20261006/company-profile-read/manifest.json).

The subsequent parent-authorized actual proof at application HEAD `9d1baa9f` passes
AppModule HTTP/auth/C9 and current React/Chromium against a fresh PostgreSQL 16
cluster. It checks current public profile, changed-address follow-up, absent hours,
city without address/timezone, unavailable CRM and revoked membership. Tenant B
gets only its own profile; foreign run access is rejected. Same-request replay is
checked before restart. A real application/PG restart preserves the canonical graph,
and fresh UI login restores encrypted conversation history. Seven browser
checkpoints pass; business-effect counters and unexpected-fetch guards stay clear.
The model is scripted and CRM responses are synthetic through the actual adapter.

The first sandbox attempt could not bind loopback before starting services. Approved
r2 then failed in a test projection that decoded null widget-turn text; the harness
now selects assistant turns with text before asserting both encrypted replies. Failed
r2 evidence is retained; fresh r3 passes. Independent review confirms the functional
checkpoint. Screenshots expose existing generic SCHEDULE raw-JSON cards, and
changed.png caught an intermediate reveal: this is not full visual acceptance.
All owned services are stopped, postmaster.pid is absent, and `SLOT FREE` was
reported. No external provider/model acceptance or C10 completion follows.

Exact proof command (backend cwd; loopback execution was approved):

```sh
node scripts/company-profile-proof.mjs --run --output=/tmp/maya-company-profile-http-react-20261006-r3
node /tmp/maya-unified-gate-20261006/launch.cjs node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false --project tsconfig.build.json
```

[Actual proof, screenshots, failed run, bounded types and review](evidence/maya-development-integration-20261006/company-profile-http-react/manifest.json).
