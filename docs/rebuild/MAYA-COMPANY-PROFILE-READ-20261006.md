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

Full-project `tsc --noEmit` exhausted its 3072 MB heap. No TypeScript semantic pass
is claimed. That retry and actual HTTP/auth/C9/Postgres/current React proof remain
pending separate heavy-slot coordination; main owns that slot. Real model/provider
acceptance, aggregate/release certification and C10 completion are not established.
Qualification remains `NOT_ISSUED`.

Commands used from `maya-saas-backend` (the local launcher scrubs environment and
does not start/connect a database for these units):

```sh
node /tmp/maya-unified-gate-20261006/launch.cjs node --max-old-space-size=1536 node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/ai-tools/ai-core.service.spec.ts src/ai-tools/ai-tool-handler.service.spec.ts src/ai-tools/ai-tool-policy.service.spec.ts src/ai-tools/ai-tool-extended-capabilities.spec.ts src/crm/adapters/yclients-crm.adapter.spec.ts src/orchestration/c9.conversation-reads.spec.ts --json --outputFile=/tmp/maya-company-profile-cohort5.json
node /tmp/maya-unified-gate-20261006/launch.cjs node --max-old-space-size=1536 node_modules/eslint/bin/eslint.js src/ai-tools/ai-core.service.ts src/ai-tools/ai-core.service.spec.ts src/crm/adapters/yclients-crm.adapter.ts src/crm/adapters/yclients-crm.adapter.spec.ts
node /tmp/maya-unified-gate-20261006/launch.cjs node node_modules/typescript/bin/tsc --noEmit
```

[Hashed unit evidence, failed typecheck and review](evidence/maya-development-integration-20261006/company-profile-read/manifest.json).
