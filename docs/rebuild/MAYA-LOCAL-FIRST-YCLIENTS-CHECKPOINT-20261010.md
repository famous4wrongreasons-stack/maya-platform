# Local-first MAYA: current React and the existing YCLIENTS setup path

**The current React is running at `http://127.0.0.1:8791/` in the existing `happy` mock profile.** Login and the composer were exercised. This persistent viewer is a UI fixture, not a connected business backend. Separately, the current candidate completed three canonical UI logins and five rendered HTTP 201 replies against its own actual AppModule/PostgreSQL. Scripted decisions drove a Client booking preview, a bounded C7 + cancellation-opportunity recommendation, and an administrator secret refusal. Real YCLIENTS and model acceptance remain unissued.

Executed candidate: `f1e6f2f3f09b66fc944f6236551ff7746b93f8c3`. The server/hosting investigation is paused and **does not gate local acceptance**. No runtime feature, schema, retention, autonomy or production change was added here.

## What works locally now

- R1 deliberately canned every answer as «Уточните синтетический запрос». It establishes transport only and is retained separately.
- R2 uses the existing declared `synthetic-accept-20261009` replay fixture. Client UI first shows slot selection, then the exact synthetic 17:00 option with «Запись ещё не создана»; no COMMIT occurs.
- Owner UI asks permission to use a limited published report instead of inventing a requested current-period report. After clarification it renders one coherent response with separately identified observation periods and the saved cancellation-window proposal.
- The owner response reports `AVAILABLE`, `noSideEffects=true`, `executionAuthority=false`. The existing C9 run persists revision **1**, **two evidence items**, and settled C7/availability work. The five observed turns have unchanged business hashes and empty business-write lists.
- Administrator UI refuses disclosure of credentials and private contacts.
- Both isolated PostgreSQL clusters, brokers and proof browsers were stopped; source checks passed. No restart acceptance is claimed by this run. The separate mock viewer remains running on loopback.

[R2 rendered replies and logins](evidence/maya-local-first-20261010/r2/current-react/browser.json), [domain state and saved C9 evidence](evidence/maya-local-first-20261010/r2/http-report.json), [owned cleanup](evidence/maya-local-first-20261010/r2/runner-report.json), [zero paid/upstream calls](evidence/maya-local-first-20261010/r2/broker-report.json), [R1 transport-only result](evidence/maya-local-first-20261010/r1/http-report.json).

The raw status remains `passed-ungraded` / `transport_pass_language_ungraded`, not model-quality or overall product acceptance. Raw `modelCalls=5` counts the local canned/replay transport invocations; the broker confirms `paidAuthorized=false`, `credentialsLoaded=false`, **`upstreamCalls=0`**. Provider facts are synthetic domain/native-adapter fixtures, not live CRM.

## Runnable UI and its limits

Existing command, from the worktree root:

```sh
node maya-chat-shell/dev/serve.mjs --root=maya-carrier-react/dist/web --port=8791 --mock=maya-chat-shell/dev/fixtures --scenario=happy
```

Use only the existing synthetic fixture login `anna@example.test`, code `246810`. [The actual viewer check](evidence/maya-local-first-20261010/viewer/result.json) proves email start/verify 201 and a visible composer. Its mock `/api/ai/conversation` returns 404, and the UI explicitly says this server does not restore history. This is not a substitute for the real AppModule/PG proof above or a permanent live pilot runtime. The `package.json` serve command references a missing `tools/serve.mjs`; the existing shell dev server is the verified invocation, with no source workaround added.

The existing Node listener on port 8770 belongs to `/Users/stanislavmosin/Desktop/Projects/maya-web`. It was not stopped, edited or used as this candidate. Shared PostgreSQL instances were not modified.

The current UI still has previously noted limitations: a fixed «АДМИНИСТРАТОР» header and a top privacy control overlapping long history in the owner screenshot. This checkpoint verifies the scoped flows, not complete visual acceptance. See [owner screenshot](evidence/maya-local-first-20261010/r2/current-react/core-owner-compound-clarification-2.png).

## Minimal live YCLIENTS connection path

Reuse the existing authenticated, tenant-scoped `CrmIntegrationController` and A17 owner. Do not copy production identities or invent a Client link.

1. Establish a real local owner session and its local tenant/branch through the normal account/business flow. A test fixture membership is not pilot authority. The real local owner/tenant/branch have not been established in this checkpoint.
2. At action time, admit the platform `YCLIENTS_PARTNER_TOKEN` through the normal local runtime configuration and a tenant user credential through owner entry. No secret is read from a production host, copied from another process, or supplied to a model.
3. Read `GET /api/integrations/crm` as that owner. It returns `configured`, status, `has_credentials`, verification timestamps and a normalized public settings projection without the credential. An existing same-provider credential can be reused by the same local integration owner; its presence is not assumed here.
4. Optional `POST /api/integrations/crm/discover` uses an owner-supplied `apiToken` for provider discovery and does not persist it. It is a real provider read and has not been invoked.
5. `POST /api/integrations/crm/connect`, with the actor's idempotency key, verifies the credential and stages `install_crm_credentials` in **pending_activation**. Supply an explicit `settingsJson.branchBinding` with contract `maya.crm-branch-binding/1`, companyId matching `settingsJson.companyId`, and an existing branchId owned by that local tenant. A branch name or the only branch is not sufficient authority.
6. The separate explicit `POST /api/integrations/crm/activate` follows the existing `activate_crm_integration` → `confirm_crm_import` path. These installation/activation operations change local integration state and need the owner's action-time approval/input. Nothing in this checkpoint performs them or authorizes provider mutations, notifications, model calls or autonomous work.

Relevant source: [connect/status controller](../../maya-saas-backend/src/crm/crm-integration.controller.ts), [input contract](../../maya-saas-backend/src/crm/dto/connect-crm-integration.dto.ts), [A17 install/activation owner](../../maya-saas-backend/src/package5-wave3/package5-wave3-canonical-cutover.service.ts), [native YCLIENTS adapter](../../maya-saas-backend/src/crm/adapters/yclients-crm.adapter.ts). The adapter uses the platform partner token plus the stored tenant user token; a company ID or a single unclassified key cannot replace both. A dedicated CRM-connection form in the current React was not exercised; API availability is not a claim of completed credential-entry UX.

Client booking identity is separate from owner CRM setup. Importing/connecting CRM does not prove a verified `maya_user` link. Use existing canonical A18/account linking; never seed a real Client authority from phone/name, public booking data, or these synthetic fixtures.

## Identifiers and credential presence: known versus unknown

The repository's public business-booking link is `https://n532637.yclients.com/company/503759/personal/menu?o=`. One anonymous read at **11:14:33 UTC** returned HTTP 200 and a JavaScript shell with no visible business title or company ID in the received HTML. [Receipt](evidence/maya-local-first-20261010/public-booking.json). Therefore **503759 remains the candidate encoded in the published link**, not a fresh confirmation of the business identity, availability or integration rights. No public booking action or authenticated provider API call was made. A public page cannot establish the internal local Maya branch ID; that must come from the current owner-scoped tenant.

Presence-only checks in this executor environment found no `YCLIENTS_PARTNER_TOKEN`, `CRM_ENCRYPTION_KEY`, `JWT_SECRET` or `DATABASE_URL`. The current worktree has no `.env` or backend `.env.local`. This does not claim these values are absent from all other local installations. No other process environment, secret file or real tenant database was opened. The stored real tenant API-token presence is **unknown**, because no real local tenant session/DB was established. Tests generated their existing ephemeral test configuration; it is not reused as a live configuration.

The owner's attached Library file was materialized separately into a private directory outside Git (directory 0700, file 0600), then classified locally without printing raw content. It contains potentially sensitive YCLIENTS-related material; partner/user role and credential validity are **unconfirmed**. The file, values, transfer metadata and content hashes are excluded from this archive. It was not installed, sent to a provider/model or used to create a Client link. Receiving it is not action-time authorization to configure credentials.

Next live step is a concrete local-owner setup with an identified credential role and explicit user entry/approval. SSH/hosting access is not a prerequisite. Meanwhile the qualified local checks and UI viewer above remain usable. Overall MAYA/C10 and live YCLIENTS acceptance are **NOT_ISSUED**.

[Machine-readable checkpoint](evidence/maya-local-first-20261010/summary.json), [artifact hashes](evidence/maya-local-first-20261010/artifact-hashes.json).
