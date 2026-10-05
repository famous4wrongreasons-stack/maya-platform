# MAYA final completion map — working baseline

Date: 2026-10-05. Verified base: `dff728e85a97841dd72bd290992b888344780780` on `codex/maya-controlled-integration-20260930`; current local completion branch: `codex/maya-final-completion-20261005`. The rows include the local changes described below. This is a product completion map, not release authorization.

## Provenance and evidence standard

- **VERIFIED FROM CODE:** inspected base and completion branch files. **VERIFIED FROM EXECUTED TEST:** commands run in a separate writable checkout on 2026-10-05, listed below. **REPORTED BY HISTORICAL DOCUMENT:** dated reports and archival receipts, not rerun production observations. **NOT REVERIFIED:** production and real user behavior without a fresh observation. No backend completion change is release-authorized or deployed by this work. The owner separately authorized a Personal Team Debug install on their iPhone; that installation is recorded below and is not a platform release.
- The commit exists on GitHub (GitHub connector `fetch_commit`), with parent `dcf51e1e8b3e0c5e118bf0f111cbbc6bfd3287e4`. Its six-file diff changes AR-1 CI fixtures, not product behavior. Connector comparison found `codex/maya-controlled-integration-20260930` exactly at DFF, and current remote `main` at `d6583a96c58b3b75b0ecfadc3a3b01e55b3b9015`, an ancestor of DFF (1067 commits behind). The local `origin/main` ref is stale. Terminal `git fetch origin --prune` failed because `github.com` did not resolve; no network settings were changed.
- The original Desktop checkout is dirty and diverged. The clean DFF checkout and published `archive/maya-development-20261005` preserve earlier work. This task cloned DFF into a separate workspace; no original checkout, branch or production instance was changed.
- `docs/rebuild/CURRENT-STATE-2026-10-05.md` exists on the archive branch, not this DFF tree. It and chapter reports are historical evidence. `AGENTS.md` still describes the legacy HTML app as production, while DFF's [React carrier](../../maya-carrier-react/package.json), [Capacitor config](../../maya-ios-carrier/capacitor.config.json) and [carrier contract](CARRIER-INTEGRATION-CONTRACT.md) establish the current React payload direction. The owner's current instruction controls this map.

## Status convention

Every row has six independent statuses in this order: **I** implemented in current source; **T** tested now or historically (qualified in Evidence); **R** release-authorized; **D** deployed; **U** user-reachable; **E** real end-to-end accepted. `yes`, `partial`, `no`, and `unknown` describe only that column. Historical certification is written `reported`; it never implies D/U/E. `unknown` never means failed.

## Product domains

| Requirement / real user path | Canonical owner and code location | I | T | R | D | U | E | Evidence, missing link, next action |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Natural owner and client conversation: free Russian, follow-ups, correction, general questions | `ai-tools/ai-core.controller.ts`, `ai-core.service.ts`; `conversation-intelligence/`; React runtime `maya-chat-shell/src/shell/conversation.ts` | partial | partial | unknown | unknown | unknown | no | **CODE:** `/ai/chat` invokes `AiCoreService`; conversation taxonomy/validation exists. Runtime sends up to 11 prior turns; scoped server text resume is now implemented locally (checkpoint below). No real multi-turn acceptance at DFF. Next: exercise representative multi-turn corpus through the actual route and fix observed failures without exact-phrase routing. |
| One task owner for natural chat, domain routing and multi-agent result | `orchestration/c9.orchestrator.ts`, `c9.registry.ts`, `c9.controller.ts`, `ai-tools/ai-core.service.ts` | partial | partial | no for bridge | no for bridge | no for bridge | no | **CODE + EXECUTED:** persisted web `/ai/chat` turns now send registered deterministic READ work through the existing C9 owner. Current source runtime keeps its authorization and live results; no fake C7 revision is minted. 204 focused tests and 10 HTTP/PostgreSQL regressions pass, with a scripted model (synthetic analytics source only in stale/scope tests). Structured C7/C8 multi-agent work still uses the existing endpoint. Next: broader task/agent completion wiring, voice/inbound canonical turn identity and real model multi-turn acceptance. This partial bridge does not complete P2. |
| Canonical business truth and YCLIENTS reads | `src/crm/`, C4/C5 facts and adapter, `src/ai-tools/` | partial | reported | reported | reported | unknown | no | **CODE + HISTORICAL:** CRM/adapter boundaries exist; no current live provider acceptance performed. Next: check service, price, staff, branch, availability and client history through one real tenant with source-qualified responses. |
| Mutation authority, idempotency and UNKNOWN | `src/action-engine/action-engine.runtime.ts`, appointment contracts | yes | reported | reported | reported | unknown | no | **CODE:** runtime distinguishes `SUCCEEDED`, `FAILED`, `UNKNOWN`, and reconciliation. [C6 report](CYCLE-06-FINAL-COMPLETION-REPORT.md) is historical. Next: real create/reschedule/cancel with exactly-one provider effect, lost-response and retry checks under separate production authorization. |
| Client identity separate from provider card | `src/crm/client-identity.service.ts`, `client-appointment-create.service.ts`, `ClientChannelLink` | yes | reported | reported | unknown | unknown | no | **CODE:** client create requires active verified link and personal context; no raw name/phone authority. Next: prove enrollment and booking across two tenants and restarts with actual provider. |
| Versioned business knowledge and salon policies | A22 `TenantBusinessConfigurationRevision`, `package5-wave1/governed-settings.read.ts`, `governed-settings.contract.ts` | partial | unknown | unknown | unknown | unknown | no | **CODE:** A22 already owns tenant-scoped immutable `business_rules` revisions, normalized/PII-filtered guidance and content-hash-verified reads; writes use confirmed Action Engine. C9 context currently reads C7/C8, not these rules. The new staff-only `business.rules.read` now reads that owner through current AiToolRuntime/C9 ADMIN. HTTP proof covers two revisions, absent configuration, two tenants, Client/customer-audience refusal and revoked membership. Guidance is not authorization or a typed cancellation/deposit policy. Next: define customer-visible knowledge separately from internal guidance; no second knowledge store. |
| Admin inbound: original channel → consultation → availability → booking → reply/handoff | `src/orchestration/c9.agents.ts`, messaging/provider adapters, Action Engine | partial | reported | unknown | unknown | unknown | no | **CODE + EXECUTED:** ADMIN owns the new A22 guidance READ for authenticated staff conversations; current source runtime is reused. Full customer inbound → original-channel reply remains absent. The structured agent context still uses C7/C8 revisions. Next: establish canonical ingress model and route an actual customer thread into existing Admin ownership. |
| Unified channel-neutral inbound boundary, delivery identity and tenant scope | messaging/communications source; channel adapters | partial | unknown | unknown | unknown | unknown | no | **CODE:** legacy Telegram receives updates but hands client text to the app. A18 authenticates JWT or Telegram login/widget proof, not a bot Update. CD is outbound; Team Communications is staff chat; WidgetTimelineTurn is carrier audit. No canonical durable customer inbound receipt/dedupe found. Next: authenticated adapter → tenant/channel/thread receipt → exact A18 binding or explicit unlinked state; never infer Client authority from `from.id`. |
| Marketing campaign: audience → preview → approval → delivery → measurement | `src/marketing/canonical-bulk.service.ts`, `communication-bulk-delivery.service.ts`, Action Engine | partial | reported | unknown | unknown | unknown | no | **CODE:** B35 snapshots canonical Client audience and checks review hash/approval; old `MarketingService.sendCampaign` refuses. Current delivery channels include inbox, Telegram, push and APNS. Local B35 HTTP/PostgreSQL concurrent retry/restart and UNKNOWN/Inbox reconciliation now pass (checkpoint below); no real provider acceptance. Cost, replies/conversion, SMS/WhatsApp/MAX coverage remain unestablished. Next: extend B35, not a second campaign system. |
| React AChat PWA, voice and widget presentation | `maya-carrier-react/`, `maya-chat-shell/src/`, `src/net/project.ts` | yes | yes | reported | unknown | unknown | no | **EXECUTED:** `npm ci --offline`, 93 React tests and `release:build` pass locally. **CODE:** chat resolution flows through `projectChat` → `conversation` → widget store; old carrier contract's B4 warning is superseded. Build emits 8-file web payload and manifest. Next: browser/mobile reachability, keyboard/login/voice and real widget action smoke tests. |
| Capacitor/iOS same payload | `maya-ios-carrier/`, `maya-carrier-react/tools/release.mjs` | yes | yes | owner-approved Debug install only | installed on owner phone | process launch yes; UI unknown | no | **EXECUTED/RECEIPT VERIFIED:** canonical React payload signed and installed; after owner-reported trust, saved devicectl receipt confirms process launch success. Payload/API unchanged. UI/login/CRM remain unverified; wait for owner screenshot, do not reinstall/repeat trust or iPhone Mirroring setup. See device checkpoint below. |
| Conversation memory, reconnect/restart and audit | `maya-chat-shell/src/shell/conversation.ts`, `/ai/chat` DTO, backend turn log | partial | partial | unknown | unknown | unknown | no | **CODE + EXECUTED + LOCAL BROWSER:** authenticated GET `/ai/conversation` restores the current principal’s bounded text from existing WidgetTimelineTurn. Assistant replies encrypted, 180-day parent ceiling/atomic erasure retained; incomplete user turns excluded from model context, no restored actions. Mac browser reload + fresh login restored both roles and continued the same conversation. Not deployed; credentials remain memory-only. See resume checkpoint below. |
| Booking self-service and admin-for-client, create/reschedule/cancel | `src/appointments/`, `src/crm/client-appointment-create.service.ts`, `src/widgets/booking/`, Action Engine | partial | partial | reported | unknown | unknown | no | **CODE + EXECUTED:** 83 focused create/cancel/reschedule/idempotency tests pass. UNKNOWN cancel/reschedule tells the user to check current state before another action. `test/widgets-live/e2-booking.live-spec.ts` passes real HTTP + PostgreSQL + headless shell/widget create → reschedule → cancel as CLIENT, with exactly 3 SUCCEEDED ActionExecutions. Provider is the isolated internal calendar, not YCLIENTS; model/real user acceptance is absent. Admin HTTP/PostgreSQL proof now passes 6 scenarios with a stateful synthetic CRM: another-customer create/move/cancel, same-key replay, two salons, CLIENT denied at Admin boundary, unresolved UNKNOWN manual hold, authoritative recovery, and UNKNOWN HTTP preservation on all three mutations. Fixed generic 500 masking UNKNOWN in Admin journal; returns 503 + `crm_outcome_unknown` and safe check-current-state wording. Next: natural dialogue and authorized YCLIENTS E2E; synthetic provider proof is not provider acceptance. |
| Salon website native wizard | `сайт и приложение/index.html`, `app.html`, `src/appointments/` | partial | unknown | unknown | unknown | unknown | no | **CODE:** marketing homepage booking CTAs point to YCLIENTS; legacy app wizard has refusal and SaaS appointment endpoint. Next: resolve website's intended entry and verify final write through verified Client create path on mobile/Safari. Do not restore retired phone/name PHP create. |
| Measurement, qualified outcomes and evaluator regressions | `src/measurement/`, `src/orchestration/` evaluation, conversation intelligence dataset | partial | reported | reported | reported | unknown | no | **HISTORICAL:** C7/C9 reports describe offline proofs; C9 report states C7/C8 reader boundary unwired in executable proof. **CODE:** dataset/eval tooling exists. Next: feed production defects into regression corpus and verify source-qualified outcomes for real workflows. |
| Prediction and recommendation separation | `src/valuation/`, C8 qualification | partial | reported | reported | reported | unknown | no | **HISTORICAL:** [C8 final](CYCLE-08-FINAL-COMPLETION-REPORT.md) says T01–T08 numerical models disabled for limited data. Next: keep numeric predictions unavailable until qualified calibration; test no invented figures in user replies. |
| Scoped autonomy / C10 | C6 Action Engine + C7 Measurement + C9 Orchestrator; no C10 owner in DFF | no | no | no | no | no | no | **CODE + HISTORICAL:** C9 explicitly forbids self-initiation and its final report says C10 not started. Next: specify first proactive action class with tenant/capability/action-level L0→L4 controls only after real shadow and reconciliation evidence. |
| Multi-tenant onboarding, isolation and operations at 1000+ salons | tenant/auth/config/CRM integrations, queue and worker operations | partial | reported | unknown | unknown | unknown | no | **CODE:** tenant IDs and boundaries are implemented; no 1000-salon load envelope or second-salon acceptance verified. Next: collect owner SLO/traffic targets, derive measurable load envelope, test queues, quotas, pools, hotspots, backup/restore and noisy-neighbor isolation. Do not invent traffic numbers. |
| Single-operator platform release governance | AR-1 `src/entitlements/widget-release-*.ts`, release programme | yes | reported | reported | no for DFF | no for DFF | no | **GITHUB CODE:** DFF changes only fixture DB selection. [Archival state](https://github.com/famous4wrongreasons-stack/maya-platform/blob/archive/maya-development-20261005/docs/rebuild/CURRENT-STATE-2026-10-05.md) reports DFF certification but no deployment, trust installation or grant; not independently reverified here. Keep platform signer separate from tenant owner; no fictitious second operator. Production release, migrations and grant require separate owner authorization. |

## Actual architecture at this HEAD

`React AChat` → `maya-chat-shell` → `/ai/chat` `AiCoreService` → persisted web user turn → existing C9 `conversationRead` for registered READ capabilities → current `AiToolRuntime` policy/idempotency → source owner → unchanged result → one chat reply. General no-tool conversation does not start C9 work. Mutation routes retain their approval and Action Engine owners. Other surfaces lack the same persisted turn wiring and retain the existing source path. C9's structured C7/C8 agent endpoint remains the owner for qualified strategy work; current live reads with `revisionId: null` are not passed off as published facts. Widgets remain presentation-only. Full task/multi-agent routing and the real inbound Admin path remain product gaps.

### P2 local checkpoint: evidence and limits

- C9 derives age from a tenant/principal-scoped persisted turn (database clock), never from a retry. Read receipts retain execution provenance, not business numbers or raw conversation. Digests are keyed; valid long Cyrillic histories do not hit a C9 record-size gate.
- Concurrent replay dispatches the source once. Lost settlement recovers the exact durable source receipt. Missing/expired source evidence never causes replay to dispatch. A completed source can reconcile after its coordination lease expires without extending age or budget. A failed compound read cannot claim a complete answer.
- Existing verified stale fallback is preserved with explicit stale provenance and the failed attempt ID. Replay rechecks current source policy, exact snapshot identity and TTL. Fresh-only recovery refuses a lost stale settlement. Read cache identity now binds authenticated role, membership and branch scope, plus current Staff/provider/access and Client/provider/channel bindings for personal reads; old unscoped read snapshots are deliberately invalidated. Stale results do not create widgets mislabeled as live; text/source freshness remains intact. Mutation/approval hashes are unchanged. This is not proof of every authority-change race during a long provider call.
- Two synthetic salons return their own current catalog values; foreign C9 run access is denied. This proves a specific read boundary, not second-salon onboarding or 1000-salon capacity.
- **Executed:** backend and widgets-live TypeScript checks, ESLint on changed code; 9 focused suites / **204 tests**; `c9-chat-reads.live-spec.ts` / **10 tests** plus `e2-booking.live-spec.ts` / **1 test**, all PASS. The HTTP harness uses fresh local proof DB `maya_widget_gate_proof_completion`, all 101 existing migrations, test-only credentials and no provider secrets. Expected missing-YCLIENTS-token and injected outage logs are not production observations.
- C9 read accounting uses its existing zero-charge read contract. Provider quota/cost accounting and whole-model-call budgeting are not newly qualified here. No numerical predictions were enabled.

## Executed local checks and immediate sequence

1. `npm --prefix maya-carrier-react test`: **93/93 PASS**. `npm --prefix maya-carrier-react run release:build`: **PASS**, web/Capacitor parity and 8-file payload. `npm --prefix maya-ios-carrier run sync` and `npm --prefix maya-ios-carrier run verify`: **PASS**, native payload parity. Backend dependency install from the offline npm cache failed on missing `debug`. Initially the build used the existing DFF checkout's dependencies through a local symlink; the P1 fix now selects the carrier's pinned TypeScript 5.9.3 in the shell and R01 source scanner. After removing that symlink and with **no backend `node_modules`**, `release:build` passed again. The three affected R01 architecture suites pass, 36 tests. The initial sandboxed Xcode attempt failed on standard Swift cache access; an approved local retry completed an unsigned generic iOS Debug build (`BUILD SUCCEEDED`), and `release.mjs verify-app` confirmed its embedded payload. This is packaging evidence, not a signed/installable device build or user acceptance.
2. P0: maintain the isolated source checkout, preserve original work and refresh origin refs when DNS works. P1: verify native build and a real browser/device path. P2: connect natural tasks to C9 with a bounded adapter and preserve general conversation. P3: verify and repair canonical client/admin booking. P4–P8: inbound, campaigns, remaining domains, scoped C10 and measured scale. P9: real owner/client/admin/marketing/voice/restart/second-salon acceptance. P10: design polish.
3. No production deployment, secret use, real provider mutation, customer message, monetary action or ambiguous migration is authorized by this map.

## Non-production iOS path and current limits

The current Xcode Debug target has a development-only `mayaos://` callback and no Associated Domains entitlement; Release has Associated Domains and refuses that scheme. Unsigned generic Debug build and `verify-app` pass. Read-only **current Xcode UI** shows an authenticated account, `Stanislav Mosin (Personal Team)`, one existing development certificate and `0 Provisioned Devices`. Canonical target Debug has `Team=None` and the explicit error requiring a development team. No team selection, certificate/profile creation, remote provisioning, build signing or phone installation was performed. Earlier cache-only team mismatch inference is not established by the fresh UI observation.

Read-only device inventory confirms `ru.mayaos.app` is already installed on the paired phone. All three generated native payload copies point to `https://mayaos.ru/api`; installing/launching them is not an isolated test and may replace the existing bundle. The local completion branch now supports an explicit `--development-api=https://HOST/api` build input using the same React payload; production remains the default. Xcode accepts `MAYA_DEVELOPMENT_API` only for Debug. Trusted HTTPS, canonical URL, production-host refusal and exact-byte/parity checks prevent a silent target mix. Safe existing Mac-only React testing uses `maya-chat-shell/dev/serve.mjs --root=../maya-carrier-react/dist/web --port=8788 --api=http://127.0.0.1:3310/api` with the isolated development backend; both bind loopback. This does not make the backend reachable from a phone. Executed: development and production `release.mjs build` PASS, 17 release packaging tests PASS (including wrong/default target refusal), targeted trailing-dot-host regression PASS, and the actual Debug Xcode `verify-native --xcode` phase PASS on restored production payload. No dev server was contacted. Next: owner-approved signing and an isolated HTTPS endpoint reachable from the device. No network/security settings or public listener were changed.

## P3 Admin checkpoint and live-model prerequisites

- `test/widgets-live/admin-booking.live-spec.ts`: **6/6 PASS**, real Nest HTTP/auth/Action Engine/PostgreSQL with a stateful synthetic MOCK adapter. Another-customer ADMINISTRATOR flow creates one provider record, moves it, then cancels it, with exactly three successful actions. CLIENT cannot invoke the Admin endpoint; tenants sharing a caller key remain separate. Lost responses preserve UNKNOWN without repeat dispatch; authoritative reconciliation restores success, while unresolved/manual-required state stays UNKNOWN. This verifies the existing contract rather than relaxing it.
- `crm-integration.controller.ts` now preserves the existing `crm_outcome_unknown` HTTP contract for create/reschedule/cancel; the response never claims success or invites blind retry. Widgets-live TypeScript and changed-file ESLint pass. No production/provider call occurred.
- Existing Conversation Intelligence corpus has **13,470** synthetic rows; the evaluator scores supplied predictions, and its gold-copy self-test is not live-model evidence. The existing isolated local backend pins `AI_CORE_PROVIDER=safe` and rejects model/provider secrets. Current process has no OpenAI/DeepSeek/YCLIENTS key; no secret value was read. A real-model run needs an explicit isolated profile, scoped test key and bounded paid-call authorization, retaining synthetic tenant data and disabled external writes. Existing Mac-only loopback servers do not provide phone HTTPS.
- Latest terminal `git fetch origin` retry still fails DNS resolution (`github.com`); no refs were published and no network configuration was changed.

### Conversation numeric evidence correction

A reproduced defect allowed caller-supplied prior assistant text to whitelist an unsupported business number. `/ai/chat` history remains model context, but prior assistant text no longer supplies numeric grounding. Explicit user scenario inputs remain available under the existing input semantics; they do not become CRM facts. The new forged-history regression failed before the fix and passes after it. AiCore/routing/owner-money suites: **161/161 PASS**; backend TypeScript and changed-file ESLint PASS. This is a deterministic regression, not real-model factuality acceptance.

## P4 first connected knowledge read and current acceptance boundary

- Staff `/ai/chat` → current C9 ADMIN READ → AiToolRuntime → A22 `GovernedSettingsReadService`, with one configuration owner and no schema change. Empty configuration is explicit; reader failure is not an empty policy. Rules are quoted by the server, never sent as model instructions. Client role and staff/owner customer-audience mode do not expose the internal tool.
- `business-rules.live-spec.ts`: **2/2 PASS**, real HTTP/PostgreSQL, actual A22 owner writes through Action Engine, current revision reads, replay and scope checks. Model selection is scripted. Seven focused suites: **166 tests PASS** (141 source/registry/CI/A22 + 25 provider-adapter tests); provider HTTP responses are test doubles. Backend/widgets and scripts TypeScript checks, changed-file ESLint pass.
- The actual semantic planner now rejects a missing tool only for pending ready source tasks. General chat, denied/unavailable tasks, completed reads and semantic clarification remain valid without a call. A compound ready-read + clarification test confirms one clarification response; invalid planning is bounded by the existing two-attempt limit. No new retry loop or orchestrator was added.
- The corpus had pre-existing CF5 drift: retired marketing intents in exported taxonomy and evaluation rows. Scoped synchronization preserves 10,824 ordinary utterances and 2,000 evaluation rows unchanged, archives all 646 retired examples, adds four missing/current families, and changes only the retired action scenarios to canonical Client booking. New IDs distinguish changed evaluation cases. Current active set: 13,602 rows, 86 intents, 65 entity slots. Source-validated manifest, idempotent sync, negative retired-intent gate and existing scorer self-test pass. No expected label was changed to match model predictions; no live model was run.

### Compact remaining product path

1. **P1:** React/PWA/native packaging works locally; signed build and in-place phone installation now verified; launch is blocked by iOS trust. Isolated HTTPS, login/voice/mobile/restart acceptance remain unverified.
2. **P2:** persisted web deterministic reads are connected to C9; live-model understanding, full task/agent coordination, voice and inbound turn identity remain incomplete.
3. **P3:** Client internal-calendar and Admin synthetic-CRM paths execute through canonical owners; actual YCLIENTS and customer acceptance still need authorized provider access/effects.
4. **P4:** staff internal guidance is connected. The [next inbound slice](MAYA-INBOUND-COMPLETION-PLAN.md) now identifies the exact missing owners and implementation sequence. Existing P-33 is the one planned Telegram command/message door, currently absent and HANDOFF-only; A18 Login proofs do not authenticate Bot API updates. A durable channel-neutral receipt needs installation/tenant routing and an explicit content/metadata lifecycle before its schema is added. Preserve exact verified Client resolution or explicit unlinked state, then use existing C9 ADMIN and Action Engine delivery. Internal A22 guidance is not customer-visible knowledge.
5. **P5–P9:** campaign preview/approval/delivery/measurement, remaining agents, scoped C10, measured load/onboarding and real owner/client/admin/marketing/voice/restart/second-salon acceptance remain open. No production, reachability or 1000-salon claim follows from local tests.

### Telegram authority correction and inbound implementation boundary

- **CODE:** restored the polling carrier ceiling to `CHANNEL_IDENTITY`, as K7 and owner ruling R-03 already require. The previous `BOUND_CLIENT` value came from the initial Gate 5 implementation, not a later owner decision. This changes no A18 Client binding or first-party principal resolution.
- **EXECUTED:** new regressions failed against the old ceiling, then passed after correction. Gate 5 and authority bindings: **20/20 PASS**; widgets-live TypeScript and changed-file ESLint PASS. The same bound-client control remains admitted by Gate 5 on a first-party carrier and is refused on Telegram. This is a function-level authority proof, not a live Telegram run.
- **NOT REVERIFIED:** P-33 and real customer inbound remain absent; no bot was connected and no edge deployed. [MAYA-INBOUND-COMPLETION-PLAN.md](MAYA-INBOUND-COMPLETION-PLAN.md) makes the two remaining product/data-lifecycle choices concrete without adding a competing ingress or unapproved migration.


### Resume checkpoint — 2026-10-05 (local only)

- Observed defect before the change: React reload followed by fresh login opened an empty chat; database held the user turn and no ordinary assistant text. Fixed through existing `TypedStep0Service`/`TimelineStore`, not a second memory store. GET has no caller-selected tenant/thread/principal; live principal, retention and erasure are rechecked.
- Assistant completion text is encrypted in the existing erasable column. Identical outcome dedupes; changed authoritative completion (including C9 reconciliation) appends an immutable revision with the parent's original retention ceiling. Resume returns only the latest saved answer per user turn. It never substitutes an old reply into fresh action/widget fields. Historical answers remain context, not current CRM truth/approval.
- Runtime waits for restore, aborts/clears on a new login epoch (including login over an active session), ignores late old-session responses, excludes unfinished work from subsequent model context and never auto-replays actions. Network failure keeps the draft and the next send retries the read. A genuine 404 from an older server visibly reports unsupported resume and retains that server's existing chat behavior; 401/403/network failures do not use this compatibility path.
- **Executed:** 13 HTTP/Postgres cases across conversation-history and existing C9 read/reconciliation suites; 109 focused backend/architecture cases; 75 net/runtime cases; 93 React cases; TypeScript, changed-source ESLint, React web/Capacitor release build. Synthetic tenants, scripted/safe model, no external AI/provider writes. Browser proof used the same frontend and normal single-completion path; final append-only reconciliation implementation was verified by HTTP tests after browser observation.
- **Observed on the user's Mac:** Codex IAB, debug email login → message → reload → fresh login → both messages restored → next user/assistant turn. Four rows share conversation `da52ad11-7a79-49ac-afe6-570a9d573bba` in the owned isolated database. Screenshot: `evidence/final-completion-20261005/react-resume-after.jpg`. Safe provider replies expose the missing live-model capability and are not natural-language acceptance. Synthetic fixture tenant was cancelled and local HTTP/relay stopped.
- C9's immutable turn-age read now goes through the same TimelineStore owner (metadata only); the existing single-table-owner architecture gate remains enforced.
- Six statuses for this increment: **IMPLEMENTED yes (text resume); TESTED local; RELEASE-AUTHORIZED no; DEPLOYED no; USER-REACHABLE local proof only; REAL-E2E-ACCEPTED no.** Remaining: signed-device and real production/model/action restart acceptance, deployed server support. No production migration/deploy was performed.
- Owner subsequently authorized existing Personal Team automatic signing and installation over the existing app, and narrowly scoped CRM test records with cleanup of only our records. Production deployment remains unauthorized. Signing/install is the next priority; CRM writes require exact pilot scope and safe test-client identity first.


### Owner-authorized iPhone install — 2026-10-05

- Actual target **iPhone Mo**, Developer Mode already enabled. Existing `ru.mayaos.app` 1.0 (1) was present before installation. No uninstall, data reset, trust override or production backend deployment was performed.
- Selected the existing **Stanislav Mosin (Personal Team)** for Debug; automatic signing was already enabled. Xcode created a managed profile matching `YCL5U4L56W.ru.mayaos.app`, including this phone, valid until **2026-10-12 11:05:57 UTC**. No private certificate/key material is in this report.
- `xcodebuild … -configuration Debug -destination 'name=iPhone Mo' -allowProvisioningUpdates build`: **BUILD SUCCEEDED**. `codesign --verify --deep --strict`: **PASS** with normal macOS trust access. Sandbox-only verification could not access trust; no trust policy was weakened. `release.mjs verify-app`: **PASS**, canonical React web/native parity.
- Packaged API: **https://mayaos.ru/api**. Main bundle SHA256: `ca98092e7a464721d9b6857673298b2030e460953a6dc39f60b12757a4768c20`. Sorted public-file inventory SHA256: `c7014ae3984d52958cc587907a1b70be57a42c994aee26fcaf2483234ac90ffc`. Source increment: `b56965f992a74f5453eecd63acf3421392f035ff`; generated runtime manifest and local Debug team selection are the packaging changes in this checkpoint.
- `devicectl device install app`: **confirmed installed**, same bundle, in-place. The first process launch was denied by iOS Security. **Superseding evidence:** after owner-reported developer trust, `/tmp/maya-phone-launch-after-trust.json` reports `devicectl.device.process.launch` outcome `success`, PID 32663, for `ru.mayaos.app`. Process launch is **YES**; UI, login and CRM acceptance are **NOT VERIFIED**. The receipt was inspected without issuing another device command; its SHA256 and the prior failed attempt are retained in the install proof. Do not repeat install/trust or iPhone Mirroring setup.
- Evidence metadata: [iphone-install-proof.json](evidence/final-completion-20261005/iphone-install-proof.json). The signed `.app` is local under `maya-ios-carrier/build/DerivedData/Build/Products/Debug-iphoneos/App.app` (generated, not committed).
- CRM test authorization is narrow: only marked records created by this work may be changed/cleaned up; no real appointment, customer message or payment. No real CRM writes have occurred. Before them: exact pilot tenant/branch, baseline, owner-approved test contact, notification behavior and retained created IDs.


### Isolated B35 completion checkpoint — 2026-10-05 11:54 UTC

- Base rechecked before isolation: original checkout clean at `4ec18c130820ce3a8b63566a475d625d6602835f`; no newer local commits. Worktree: `/Users/stanislavmosin/Documents/Codex/2026-10-05/task-3/maya-platform`, branch `codex/maya-b35-completion-20261005`. Source fix: `5492be8cf1250d51e86e92cd6b48fc2d67bbd154`. No original worktree files were changed and nothing was pushed or merged.
- **Observed local defect:** B35 Telegram classified every HTTP 4xx (including ambiguous timeout/gateway responses) as FAILED and any truthy `message_id` as ACCEPTED. Sixteen regression cases failed against the original implementation. This could prematurely make unresolved recipients terminal or fabricate provider acceptance.
- **Implemented:** the existing CommunicationBulkDeliveryService remains the only changed delivery owner. Only HTTP 400 with an existing executor rejection code and no contradictory message reference proves rejection. Unrecognized/invalid JSON, ambiguous statuses and malformed/contradictory message references stay UNKNOWN. Canonical positive integer/string references retain ACCEPTED. No new schema, retry, transport, route fallback or automatic Telegram reconciliation was introduced; Action Engine admission and the delivery kernel remain unchanged.
- **Executed:** 83 Jest tests across bulk delivery, bulk policy, canonical bulk contract/controller/architecture passed; the architecture suite also ran 14 Python R07 boundary tests. The focused delivery suite passed 37 tests again after test lint cleanup. Backend build TypeScript check, changed-file ESLint and `git diff --check` passed. All transport calls were mocked; no real messages, payment, CRM writes, database migration, deployment or phone operation occurred.
- **Evidence scope:** two dispatch-path regressions verify that HTTP timeout/malformed success calls the existing `finalizeUnknown` with owned attempt/revision, never `finalizeAccepted`/`finalizeDeterministicReject`; a second resume neither claims nor sends the manual UNKNOWN leaf. These are service tests with mocked persistence/kernel, not HTTP/PostgreSQL, real provider or end-user acceptance. The other classification cases preserve known executor rejections and canonical success references.
- **Website path remains open:** current homepage CTA URLs go to YCLIENTS. The canonical carrier deep-link parser intentionally accepts only closed route keys/opaque handles, not tenant/staff query authority. Simply replacing website URLs cannot establish verified Client booking, preserve provider-specific staff selection or prove a native wizard. Next website slice must resolve the intended canonical entry and reuse Client/booking owners; no speculative URL contract was added.
- **Next path:** independent review/cherry-pick of the local B35 source checkpoint; then isolated HTTP/PostgreSQL proof of campaign partial delivery/restart using the existing machinery, before any separately authorized real campaign acceptance. Website entry and remaining inbound topology/lifecycle decisions remain separate. Phone acceptance still waits for the owner's screenshot; installed app targets the old production API and backend has not been updated. Do not reinstall or repeat trust steps.
- Six statuses for this increment: **IMPLEMENTED yes (bounded B35 response correction); TESTED local synthetic only; RELEASE-AUTHORIZED no; DEPLOYED no; USER-REACHABLE no for this correction; REAL-E2E-ACCEPTED no.** Full campaigns, website booking and 1000-salon readiness remain partial/unverified.


### Website canonical entry — bounded contract finding, 2026-10-05

- `MAYA-WIDGET-CONTRACT-V1.md` NT8 (line 6111) and `MAYA-CHAT-FIRST-UX-OWNER-DECISIONS.md` (line 113) require a closed `{ route_key, opaque_handle }` parser and expressly forbid reading tenant slug/staff/record/price from URLs. Calling them preferences does not remove that explicit rule.
- Existing `TenantPwaService` owns public install/invite metadata, but `buildStartUrl` still emits legacy `booking_backend`, `booking_api_base`, `booking_tenant` query fields. This is not a compatible React booking entry. A18 owns verified channel-to-Client binding; a public website link does not acquire that authority.
- Existing `HandoffTargetSigner` signs a widget intent/principal-bound destination; it is not a public salon-entry registrar/resolver. The carrier recognizes `#r=w&h=...` but currently returns `widget_unavailable` without resolving it. No approved, executable public opaque website booking-entry path was found in these owners. Reusing a Client-link challenge as a public marketing link would conflate identity proof and navigation.
- **Minimal product decision (recommended compatible first slice):** website booking CTAs open the canonical MAYA root; visitors explicitly select their salon in the existing business finder, sign in and choose branch/master within the authorized booking conversation. No automatic salon/master preselection and no URL business parameters. The existing site layout can remain. This changes the current staff-card preselection promise, so it must be explicit rather than silently losing it. A deployed canonical web target must also be established before publishing links.
- If contextual preselection is required instead, an approved public opaque-entry resolution contract under the existing invite/booking owners is needed: server-resolved preferences, current public-catalog validation, no Client/tenant/approval authority from the handle, and the same downstream A18/Action Engine checks. No competing store/endpoint was added by inference.
- Public pilot candidate `muzhskaya-estetika-3` (Мужская Эстетика, ул. Лермонтова 343) is parent-reported public discovery only; authenticated tenant/branch/Client scope is not verified. SMS flags do not disable provider automation/reminders. No CRM writes are permitted by this checkpoint.


### Checked B35 HTTP/PostgreSQL restart checkpoint — 2026-10-05

- Source/test checkpoint: `33e564f8ba741f6d537b6f15cdc2880ac813503d`, descendant of local correction `5492be8cf1250d51e86e92cd6b48fc2d67bbd154`, on `codex/maya-b35-completion-20261005`. [Sanitized evidence](evidence/final-completion-20261005/b35-http-restart-proof.json) records exact process IDs, PostgreSQL start times, source SHA, log hashes and limitations. Raw restart receipt with synthetic credentials remains in `/tmp`, not Git.
- **EXECUTED:** new HTTP suite uses AppModule, real login/guards, database entitlements, immutable campaign owner, canonical approval/Action Engine and delivery kernel. One scenario ran in separate `prepare` and `resume` Jest processes with a real restart of a newly initialized PostgreSQL 16 cluster between them. Both phases PASS. The default one-process/app-reboot mode also PASS. Widgets-live TypeScript, scripts TypeScript, changed-file ESLint and whitespace checks PASS.
- **Proved:** repeated preview preserves identity; changed intent conflicts; concurrent confirm admits one root; original UNKNOWN remains manual-required with one attempt; independent pending Client resumes exactly once after process/database restart; original logical IDs and attempts remain. Concurrent Inbox resume recovers the expired dispatch attempt, rereads the committed Inbox row and reconciles to COMPLETED, with one Inbox row and exactly one execution plus one reconciliation attempt. Changed hash, another tenant's owner and suspended membership refuse with HTTP 409/404/401 respectively and no additional sends/attempts.
- **Fault/source limits:** Telegram `fetch` is replaced only at the provider edge; fixtures use synthetic A18 proof through the real link owner. A proof-only database trigger causes a real finalization failure after Inbox upsert commits; it is removed before restart. Persisted synthetic lease hold/expiry models downtime. No Action Engine/delivery/policy/entitlement method is mocked. This is real local HTTP/PostgreSQL state-machine evidence, not provider, CRM, phone, model-quality, real customer or scale acceptance.
- The older `package5-b35-runtime-proof.ts` fixture now returns canonical positive message IDs and explicit bridge rejection JSON/400 rather than malformed success strings/arbitrary403. It was typechecked, not rerun or upgraded to the new proof standard; its older internal test doubles remain disclosed in source.
- Reproduce in a dedicated guarded proof DB after applying committed migrations: run `JEST_B35_STAGE=prepare JEST_B35_RECEIPT=<private-tmp-file> npm run test:widgets:live -- --runTestsByPath test/widgets-live/b35-campaign-restart.live-spec.ts`; restart only the owned PostgreSQL cluster; run the same command with `JEST_B35_STAGE=resume`. `DATABASE_URL` must pass the existing proof-db guard. Omitting stage uses the default app-reboot mode. The two-phase resume asserts both process PID and PostgreSQL start time changed.
- **Concrete remaining live blockers:** no production release or real message authorization; no authenticated pilot tenant/branch and controlled verified Client with owner-controlled channels; provider automation/reminder behavior unresolved (SMS flags alone do not suppress it). The public salon candidate is not authorization. Device process launch is confirmed by the existing receipt, but UI/login remain unseen and its API is the unchanged production backend. No CRM writes occurred.
- Status: **IMPLEMENTED bounded correction yes; TESTED local HTTP/PostgreSQL restart yes; RELEASE-AUTHORIZED no; DEPLOYED no; USER-REACHABLE no for correction; REAL-E2E-ACCEPTED no.**


### Checked single Telegram + wanted-slot transport follow-through — 2026-10-05

- Single Telegram source checkpoint: `1d2611a811d2a12d8b2c76a2d6f1c2ac88be6ac0`. [Outcome evidence](evidence/final-completion-20261005/single-telegram-outcome-proof.json). Existing package2 and privacy senders shared the B35 defect: arbitrary 4xx were terminal failures and malformed nonempty message IDs could be accepted. Both now use one response classifier within Communication Delivery, with separate executor-specific explicit rejection allowlists. B35 uses the same helper. No new owner, retry, fallback or transport was introduced.
- **Executed regression:** 3/5 new real PostgreSQL/Action Engine privacy delivery cases failed against `764ed4bb481831348c46c0f707bea5330ef606ab`; all 5 pass after correction. Exact event replay leaves one ActionExecution and one MarketingDeliveryAttempt for UNKNOWN, FAILED and accepted outcomes. Combined B35 HTTP/app-restart + single runtime suites: 6 PASS. Unit/architecture suites: 119 PASS plus their 14 Python R07 checks. TypeScript (widgets-live/scripts), changed-source ESLint and whitespace PASS. Only external fetch is replaced; the single privacy producer is invoked at the service boundary, not claimed as full HTTP inbound or live Telegram acceptance. Full package2 producer behavior remains separately qualified.
- Eight older executable proof scripts contained nonnumeric synthetic message IDs or arbitrary403 error bodies. Their response fixtures now match the actual executor protocol; scripts typecheck PASS, but those historical standalone proofs were not rerun. Old evidence is not silently upgraded.
- Wanted-slot source checkpoint: `0f7333fb781f6a01ac480c1a791f79f24e3814b4`. Existing approved B9 `ClientWantedSlotService` submits `wanted_slot_available` through Communication Delivery after verified endpoint/consent/current-interest checks. Python's protected executor omitted that message type and always returned400 before delivery. Added that exact existing type to the closed allowlist, with no handler/credential change and no new sender.
- **Executed regression:** actual Python bridge function and actual allowlists are AST-loaded without importing bot runtime. Two of five cases failed before correction; all five pass after. Existing package2, B35 and R07 guards plus new cases: 26 Python PASS; wanted-slot runtime/schema architecture: 7 Jest PASS. Known type sends once, missing bridge credential/unknown type/malformed destination refuse before transport, lost provider response raises without retry. All sends are AsyncMock; no real notification or CRM mutation. The existing protected-handler fingerprint stays unchanged.
- Website decision remains pending, explicitly **generic canonical finder now vs approved opaque preselection**. Generic finder loses automatic salon/master preselection and was not approved; no CTA was silently changed. NT8 remains intact.
- No additional safe C10 loop is inferred: `CYCLE-09-PREFLIGHT-AND-SCOPE.md` separates autonomous repeated initiation into C10 under separately approved autonomy policy. Measurement/scale acceptance requires source-qualified real outcomes and workload evidence; these synthetic tests establish neither sales attribution, prediction accuracy nor 1000-salon capacity. Inbound topology/retention decisions remain pending; no receipt schema was guessed.
- **Remaining live blockers are concrete:** separately authorized deployment/message/CRM scope; authenticated pilot tenant/branch/owner plus a controlled verified Client and owner-controlled channels; provider automation/reminder behavior; phone UI/login observation against the unchanged production API. Local fixes are implemented/tested only, not released, deployed or real-E2E-accepted. No publication/merge occurred.


### Final bounded readiness pass — 2026-10-05

[Remaining readiness decisions](MAYA-REMAINING-READINESS-DECISIONS.md) consolidates the pending website, inbound, C10 and live-pilot choices with code references, distinguishes already permitted request-driven L0/L1 work from autonomous initiation, and proposes an explicitly hypothetical isolated load envelope. No implementation or load test was added by this pass. One fetch succeeded: origin/main `d6583a96c58b3b75b0ecfadc3a3b01e55b3b9015` remains an ancestor (1067 commits behind) of integration `dff728e85a97841dd72bd290992b888344780780`; no push/merge/deploy. The selected website/inbound/C10 slices await their stated decisions; this is not a claim that all safe L0/L1 work or the full MAYA product is complete.


### Request-driven dormancy read correction — 2026-10-05

- **Provenance:** isolated branch `codex/maya-b35-completion-20261005`, worktree `/Users/stanislavmosin/Documents/Codex/2026-10-05/task-3/maya-platform`, created from clean confirmed `4ec18c130820ce3a8b63566a475d625d6602835f`; previous local fixes preserved. Last successful read-only fetch observed origin/main `d6583a96c58b3b75b0ecfadc3a3b01e55b3b9015` and origin/codex/maya-controlled-integration-20260930 `dff728e85a97841dd72bd290992b888344780780`. No second fetch, push, merge or source-worktree mutation in this slice.
- **Traced path:** `/api/ai/chat` → existing AiCoreService tool selection → C9 registered CLIENT_LIFECYCLE conversationRead → existing runtime/catalog/validator → AiToolHandlerService.readDormantClients → C8ReadService.forAi(kind=POLICY_SIGNAL) → existing chat deterministic fallback. Natural-language production selection was inspected, not accepted against a real model. Some broader retention phrasing has a separate existing clients.retention.scan hint; no new router or orchestrator was added.
- **Canonical basis:** CYCLE-08-P06-CONSUMERS-AND-ACCEPTANCE requires bounded privacy-safe C8 projections and forbids caller arguments reinstating universal dormancy periods; CYCLE-09-PREFLIGHT-AND-SCOPE assigns qualified dormancy reads to existing Lifecycle ownership, not autonomous execution.
- **Confirmed and fixed:** catalog/validator required inactive_days and suggested universal 30/90 even though C8 owner ignores it. `3c5383075bf33a7166303d32817a29d250881ba8` makes that deprecated compatibility input optional, still rejects malformed supplied values, and removes taxonomy promises of named/contact exports. The existing C8 20-result bound stays authoritative. No new threshold, query, policy or computation.
- **Confirmed and fixed:** fallback still expected legacy named rows/inactive_days and returned null for actual C8 results. `72641e3275d011d396eaf40a979fd086eb1ee46e` consumes only the canonical projection, reports current available boolean dormancy signals with rule/version/as-of/completeness and ephemeral result labels; stale/missing/unconfigured signals remain unavailable. Empty output never means active base, no return prediction/contact permission is invented, and legacy contact payloads are refused.
- **Evidence:** two new contract tests failed before the first correction; one formatter test failed before the second. Final four suites: **144 PASS** (`ai-tool-extended-capabilities`, `ai-tool-registry.service`, `ai-tool-handler.service`, `ai-core.service`). Includes actual registry→handler delegation with a C8 double, legacy compatibility/invalid-input controls, stale/unconfigured/partial/false-signal rendering, and chat with scripted tool selection then unavailable model continuation. Build TypeScript, changed-source ESLint and diff whitespace PASS. Raw local logs: `/tmp/maya-dormancy-red.log`, `/tmp/maya-dormancy-render-red.log`, `/tmp/maya-dormancy-final-green.log`.
- **Limits:** these are isolated unit/wiring tests with C8/runtime/model doubles, not PostgreSQL C8 source acceptance, live model quality, phone/CRM acceptance or 1000-salon load evidence. No real model call, production deployment, notification, payment, benchmark or phone operation occurred. Status: implemented/tested locally; not released/deployed/real-E2E accepted.
- **Next path:** qualify this exact dormancy response against existing isolated C8 source fixtures and HTTP C9 receipts if further integration proof is needed; real natural-language selection/owner usability requires separately permitted model/device acceptance. Other owner questions remain candidates, not audited or declared complete. Existing website/inbound/live-pilot decisions remain pending; this checkpoint does not declare MAYA finished.


### Owner-reported iPhone input blocker — 2026-10-05

- **Priority switch:** owner could not test because the chat page moved and composer disappeared behind the keyboard. Both supplied Library PNGs were materialized on this Mac and inspected before UI decisions; they show chat/keyboard, not login. No iPhone Mirroring was used.
- **Source correction:** `1bdcf81eb0b78a27a0f520a0992980dd1c983bb0`. Fixed html/body/root to one visible frame shared by chat/login; native WebView outer scrolling off and native keyboard resize on, with no double subtraction. Kept the existing chat colors/header/pill identity; composer now uses 16px, supports bounded multiline growth, and has the standalone carrier bottom inset instead of space for a nonexistent tab bar. Login uses existing Aurora/mark/pill styling and one visible entry method at a time; shared auth/runtime behavior is unchanged. Packaging now refuses keyboard overlay/outer-scroll regressions.
- **Evidence:** [iOS keyboard UI proof](evidence/final-completion-20261005/ios-keyboard-ui-proof.json): 93 carrier tests +18 release tests PASS, typecheck/ratchets/canonical parity/verify-app and strict signing PASS; Simulator and signed device builds PASS. Actual iOS26.5 WKWebView software keyboard leaves header stable and composer visible; direct software key input observed. Chat used the explicitly separate simulator-only `ru.mayaos.keyboardproof` presentation fixture, never installed on owner phone. Browser checked multiline and portrait/landscape plus exact no-outer-scroll bounds. Simulator real app verified login focus. Baseline and after screenshots remain at the exact local paths/hashes in evidence for later design comparison.
- **Installed:** canonical signed `ru.mayaos.app` updated in place on owner iPhone; devicectl install receipt SUCCESS. No uninstall/data deletion. The subsequent launch attempt was refused because device was LOCKED, not signature/profile trust. Owner must unlock and open the updated app for real keyboard acceptance; do not repeat install/trust. API remains unchanged production `https://mayaos.ru/api`; no production backend, CRM, message or payment mutation occurred.
- **Deferred backend checkpoint:** `92ce547b1e679051aee05ea84f2f1c7e0f899375` adds real HTTP/C8/AE/PostgreSQL qualification (PASS: policy+compute+chat, replay, cross-tenant/revocation, changed-source invalidation). Synthetic model selection and source fixtures are explicit. The three other owner-path cases are visibly skipped pending UI priority, with two confirmed failing regressions captured in `/tmp/maya-owner-paths-red.log`: `сейчас` matched `час`, and C7 money fallback omits causal-unavailability explanation. No backend production correction was claimed for these. The isolated PG data is retained, cluster stopped after handoff.
- **Next dependency:** owner unlocks iPhone and verifies typing in the installed update. Product/backend acceptance remains separate. Broader design directions were authorized for later, not performed in this usability fix.

## Coherent functional delivery directive — 2026-10-05 owner update

- Deliver the agreed functional scope as one qualified **new backend + canonical app** candidate.
  Do not ask the owner to debug each phrase or install more UI-only updates against the old backend.
  Design exploration waits for functional completion. Production deployment/rollback execution still
  requires separate release approval; local isolated implementation continues.
- Mandatory YCLIENTS scope is now explicit in [canonical product requirements](../product/README.md):
  every operation supported by official API and current integration/user permission, including goods,
  stock, services/prices, working schedules/days off/breaks and staff lifecycle. API capability inventory
  must map provider → adapter → domain/action owner → chat → permission/confirmation → outcome/reconciliation.
  Separate provider-unsupported, missing integration scope and missing MAYA implementation. This does not
  authorize real CRM mutations, arbitrary model HTTP or fake verified Client linkage.
- Current highest-leverage path is conversation/task continuity + role-safe routing + canonical verified
  Client transition + honest model failure, followed by existing multi-turn/generalization corpus and
  one candidate qualification matrix. No phrase-specific booking regex patch is planned.
- Parent reports a fresh read-only production observation: running release
  `/opt/maya-saas/releases/20260929-recon-fix-eb43bc22`, owner role with CRM card but no active verified
  Client booking binding. Full deployed tree is not independently proven by the directory suffix.
  This branch remains local; real-model/provider acceptance is still distinct from scripted tests.

### Keyboard timing candidate and measured limitation

- Owner MP4 materialized locally and decoded: 4.15 seconds, HEVC 1320×2868 at 60fps.
  Frames show the keyboard covering the composer until a delayed final reposition. Installed Capacitor
  Keyboard 8.0.5 schedules native resize for keyboard animation duration **plus 0.2 seconds**.
- Candidate removes plugin resize and native JS VisualViewport competition. A UIKit keyboard guide is
  the geometry owner. Directly constraining WKWebView was rejected after Simulator recording showed an
  immediate DOM destination jump and a transient blank gap. The current candidate follows the guide's
  presentation frame through CADisplayLink only during native keyboard transitions, with no CSS duration
  guess. Browser VisualViewport behavior remains separate; no runtime/auth/backend behavior changes.
- Executed: Simulator native build, real software-keyboard open/close and 216-key wrapped draft, carrier
  93 tests and release 18 tests. Recorded before/direct-guide/follow variants. Follow variant removes the
  long delayed final jump and visibly traverses intermediate positions. **A short WebKit layout lag remains
  in the first opening frames; no frame-perfect/60fps or owner acceptance claim.** Native scroll gesture
  testing was inconclusive; do not label that pass. iOS 15/16 retain the keyboard guide safe-area bottom;
  this device run is iOS 26.5 only.
- No further phone installation was performed. This is a bounded candidate checkpoint, with motion and
  full integrated acceptance still requiring qualification before a coherent release.

### Scope narrowing supersedes blanket API coverage — owner 2026-10-05

The [product requirement](../product/README.md) now records the owner's later narrowing:
YCLIENTS only, own app chat; goods from invoice/order photo with explicit price/quantity
semantics; no full procurement/supplier module, telephony, content publishing, universal
accounting/payroll/fiscalization or new external messaging integrations. Bounded autopilot
remains required; unsupported numeric predictions/growth guarantees are excluded. The 304-operation
API inventory is a coverage input, not a mandate to implement excluded domains. Telegram topology
and new inbound lifecycle decisions are deferred, not blockers of this YCLIENTS-first delivery.
No real provider mutation is authorized by this product scope.

### Semantic-first candidate — systemic booking/report substitution regression

Reproduced five failures: an owner booking dialogue followed by a date/correction executed an
analytics read before semantic planning, and a failed planner could be masked by the unrelated
report. Removed that pre-planner execution. Existing server argument normalization remains usable
only after the planner explicitly selects the same tool. Validated denied/unavailable/clarification
and non-data tasks no longer trigger forced metric reads. Model unavailability is not reported as
CRM unavailability. No role, audience, Client binding or action authority was widened.

HTTP/auth/C9/PostgreSQL proof now exercises a three-turn booking request/correction with no
analytics call and no ActionExecution, plus an actual 503 model-failure boundary. Existing reporting,
PII and number-grounding tests now explicitly script the planner's read before the continuation;
they no longer encode the obsolete server preload as an acceptance criterion. Executed 234 focused
mechanics tests, six HTTP cases, backend TypeScript and widgets-live TypeScript, changed-file ESLint.
All model choices and CRM facts here are synthetic. This proves ordering/authority/outcome mechanics,
not language generalization or the owner's 99% real-model criterion. PersonalClientContextService
and reverification remain the next canonical wiring dependency, not a reason to grant Client role
from user text.

Official YCLIENTS artifacts were materialized through Library onto this Mac; all three SHA256
checks matched the research handoff. They remain source evidence, not proof of provider execution.

### Client booking release priority and offline pilot preparation

The owner's later directive prioritizes the existing designed website plus reliable canonical
client booking as a coherent backend/web release. Broader goods/analytics/autopilot work continues
as backlog; it is not a prerequisite for this booking candidate. One codebase, isolated stable and
test environments; no salon-specific fork. Production deployment awaits a concrete release and
rollback approval, and no production change is made by this checkpoint.

The owner explicitly approved the bounded DeepSeek pilot: at most $20 total from the existing
balance, up to 50 synthetic dialogues; no top-up. The new offline replay/budget core preserves that
ceiling and keeps actual assistant responses in history instead of gold dataset responses. A
client-first frozen diagnostic slice contains 12 variants / 7 independent families / 36 user turns;
manifest SHA256 `6a1f0500c9479af7847218044a9750dedcb3d1e880d9a9b287d63fa5a66c7334`.
Ten mechanics tests passed, including no-approval refusal, failed-call reservations, caps,
concurrency, scope/holdout separation, no gold-history injection and stop-on-unknown without retry.
Local evidence: `/tmp/maya-qualification-client-offline-20261005-a/` and
`/tmp/maya-qualification-offline-tests.log`. Provider requests, HTTP requests and real CRM effects
in this dry run: zero. This is **not** real-model qualification. The live runner still needs an
isolated server DB/environment and actual HTTP/transport integration; do not weaken the existing
widgets-live secret refusal. See `maya-saas-backend/scripts/conversation-qualification/README.md`.


## Website guest booking backend checkpoint — 2026-10-05

Implemented on isolated `codex/maya-b35-completion-20261005`, preserving parent checkpoint
`2da0f90d414c911dc3142f004eee04ef219207c4`. Contract and local launch instructions:
[WEBSITE-GUEST-BOOKING-PORT-V1.md](WEBSITE-GUEST-BOOKING-PORT-V1.md).

- Six real HTTP ports: session, staff-specific services, per-date availability, immutable quote,
  durable idempotent create attempt and read-only status. Exact server site/tenant/branch/origin
  mapping, secure cookie, CSRF, rate limits, features/live-mode checks; no MAYA account required.
- Existing CRM appointment owner and existing Action Engine execute the only provider mutation.
  Explicit `public_booking` source is limited to create, with application policy and SQL binding
  to active session/quote/tenant/payload hash/target. No synthetic User, Client or verified link.
- Four additive local migrations create immutable guest evidence, preserve nonce receipts while
  releasing only definitively rejected intent guards, narrowly extend AE source constraints,
  and enforce UTC expiry/defaults independently of PostgreSQL session timezone.
- Guest UNKNOWN never retries by empty phone lookup; generic post-dispatch errors remain UNKNOWN.
  Status never dispatches. Contact is confined to existing encrypted AE payload; evidence tables
  store hashes and public quote facts, including consent document version/URL.
- Seven guest HTTP/PostgreSQL tests and four canonical Client HTTP regression tests passed
  (four suites / eleven tests); `/tmp/maya-guest-release-http.log`. Sixty-five policy/registry/
  YCLIENTS adapter unit tests passed; `/tmp/maya-guest-unit.log`. TypeScript, targeted ESLint,
  Prisma validation and git diff whitespace checks passed. No generated Prisma client was written
  through the shared node_modules symlink.
- `scripts/public-booking-preview.ts` supplies a bounded 30-minute loopback with its own synthetic
  proof tenant, no inherited provider secrets and outbound fetch denied. Website worker can use
  the emitted baseURL/siteKey/date via the existing same-origin adapter. This is synthetic CRM
  integration evidence, **not real YCLIENTS, customer, notification, phone or scale acceptance**.

Remaining release dependencies: actual styled frontend/backend browser integration, approved
production mapping/schema/config/deployment with rollback, and source-qualified real YCLIENTS
acceptance. Exact provider-correlated UNKNOWN recovery is not implemented; fail-closed UNKNOWN
is preserved for investigation. Paid/server pilot setup remains independently blocked; this
checkpoint performs no production writes, migrations, notifications, payments, publish or merge.

Separately, the authorized offline HTTP conversation replay completed after parent clarification:
36 canned provider attempts, zero paid requests, qualification not evaluated. Evidence lives in
`/tmp/maya-http-pilot-resume-20261005-a/` and `/tmp/maya-http-pilot-resume.log`.


## Guest UNKNOWN recovery follow-up — 2026-10-05

Supersedes the preceding checkpoint's “exact provider-correlated recovery not implemented” limit.
The official public-create description and schema disagree on api_id type; the adapter now sends a
JSON-safe numeric api_id and full opaque HMAC marker in comment, requiring both on exact readback.
It never treats the response's echoed id as record_id. Guest provider reminders are zero and
newsletter consent false; real company notification behavior is still an acceptance prerequisite.

GET attempt status performs rate-bounded provider reads only. A complete day listing and exact
record re-read must match company/correlation/active status/staff/services/instant/duration before
the existing Action Engine reconciliation receipt can finalize SUCCEEDED. It can settle a guest
MANUAL_REQUIRED state from positive proof under the existing execution lock. There is no dispatch
callback or READY/redispatch transition in this path. Missing, duplicated, truncated, changed,
foreign or unavailable source remains UNKNOWN; no phone search or Client identity is created.

Evidence: `/tmp/maya-guest-recovery-release-http.log` — four suites, eleven HTTP/PG tests PASS,
including AppModule restart, delayed positive readback, concurrent status and one provider create
per recovered execution; `/tmp/maya-guest-recovery-unit.log` — five suites, eighty-six tests PASS.
TypeScript and targeted ESLint PASS. Synthetic preview adds `--lose-first-reply` for browser E2E.
No new schema migration is needed for recovery. See
[WEBSITE-GUEST-BOOKING-RELEASE-GATES.md](WEBSITE-GUEST-BOOKING-RELEASE-GATES.md) for exact official
contract findings, controlled real test prerequisites, migration hashes and rollback boundaries.

Remaining: styled browser integration; actual company/contact/notification qualification and
approved release target; real provider correlation preservation; qualified negative-outcome/manual
support resolution for genuinely absent/changed records. Email-empty acceptance and phone
confirmation settings are explicit activation gates. No real provider writes, payments, paid model
calls, production migration/deploy, phone changes, push or merge have occurred.


## One-record provider qualification handoff — 2026-10-05

Existing owner test-record/own-cleanup authorization is preserved; no new broad create approval
is requested. [WEBSITE-GUEST-ONE-RECORD-ACCEPTANCE.md](WEBSITE-GUEST-ONE-RECORD-ACCEPTANCE.md)
reduces acceptance to one controlled record with optional qualified response-loss injection and
exact readback/reload evidence. The missing inputs are concrete approved company/tenant/branch,
owner-controlled contact, company notification/phone-confirmation settings and isolated environment.
Guest contact does not require a verified Maya Client; earlier app-Client pilot requirements must
not be imposed on the guest website flow.

Negative/manual resolution remains evidence-bound: absence, unavailable reads and an operator's
empty screen cannot establish non-execution. Official create docs enumerate error codes but lack
qualified negative response envelopes; a provider specification/redacted exact rejection and its
single-item atomic no-create semantics are needed before adding a safe reset code. An exact record
later moved/cancelled is not proof that create failed. No blind retry, forced FAILED, destructive
cleanup, notification, real CRM mutation, production change or paid model request was performed.


## Separate chat semantic-contract candidate — 2026-10-05

Branch `codex/maya-chat-semantic-contract-20261005` starts from
`3a5388aafc3fc9cb19024e7430e82c0001ac3d66`; the stable guest backend remains
`dcba8c8f4d230de31fb93f3d613f7524c3310df9`. Finite taxonomy-scoped date/period
and service aliases now normalize before required-slot checks; planner/schema and
follow-up context share that vocabulary. Missing/conflicting values still refuse,
execution/identity/tool argument authority is unchanged. The runner uses canonical
HTTP user_turn correlation. Original six dialogues and dataset are frozen.

61 unit tests, one AppModule/HTTP/PostgreSQL captured-transport regression, script
compilation and lint PASS. Two previously failing dialogues were rechecked through
real DeepSeek, same ledger/cap/TTL: six HTTP responses without the previous plan
mismatch. Semantic qualification is NOT_PASSED: redacted staff labels cannot resolve
provider references, availability-to-create loses the date, and a clarification
implies confirmation without an Action Engine receipt. No booking success claimed.

Cumulative24 real calls, estimated$0.223654024;25 conservatively counted attempts
of30; reserved$2.72331312 of$20. Permit closed and pilots stopped, production
PID21721 unchanged. See scripts/conversation-qualification/README.md in backend and
task-3/pilot-evidence/semantic-final-summary.json. No deploy, real CRM mutation,
notification, merge or phone operation. Next path is grounded entity resolution,
cross-intent slot carry and receipt-bound confirmation language; no phrase routing
or weaker identity/UNKNOWN safety. This remains separate from guest website release.


## Chat follow-up checkpoint — receipt wording and context (2026-10-05)

Separate candidate based on755c3726f2edb7b59425bc5f30853612f5ec20aa. Mutation final text
now comes from authoritative AE receipt projection; clarification wording cannot claim
completion. Booking preferences persist through the existing encrypted transcript owner
with current principal/tenant scope, ordered-turn bounds, original erasure/retention and
fresh permission validation. No new storage owner or schema. Date/service carry and current
correction precedence are covered; no confirmation is inherited from conversation context.

196 unit/architecture and7 HTTP/PostgreSQL tests PASS, including AppModule restart,
foreign/expired/future-context refusals and explicit canonical carrier selection through
one successful synthetic booking receipt. Compiler/lint checks PASS. Immutable captures
remain diagnostic evidence, not model training or real-provider acceptance.

One bounded live recheck used2 calls: date/service/time retained; unresolved business labels
as IDs caused safe HTTP503 on turn2. No additional retry. Total26 real calls, estimated
$0.24586914; ledger27/30, reserved$2.96327064/$20; permit closed. Production unchanged.
Overall semantic acceptance NOT_PASSED. Staff redaction is production behavior; fixture
catalog mismatch is an additional limitation. Next owner is existing public booking catalog
reference grounding, not weaker PII or Client/provider-card authority. See backend pilot
README and task-3/pilot-evidence/followup-repair for full grading and shutdown evidence.
Stable guest website/backend candidates and production remain unmodified/unpromoted.


## Chat catalog → canonical booking checkpoint (2026-10-05)

Separate chat branch based on `e875da85b789de89e8fef5c71ebe84bf6d2fa791`.
After a validated Client booking plan, current `catalog.staff.read` and
`catalog.services.read` results resolve exact public labels/IDs within the tenant.
Original user text stays local; only an unambiguous catalog name can recover a
redacted staff preference. Current staff switches win; a new unmatched redacted name
cannot silently reuse the previous staff. Preferences remain encrypted transcript
context and are revalidated each turn. No phone/name-based Client authority.

Completed availability now includes catalog-qualified selection facts and the existing
timezone owner. The existing single widget minter supplies service/staff noun handles,
so a chat availability selector can reach the existing booking preview and explicit
carrier confirmation. Client create requests in this bounded path prepare that read;
they do not create a legacy AI approval or execute a booking from model text.
All final mutations still belong to Action Engine and its canonical receipt.

Local evidence: 253 unit/architecture tests and 11 HTTP/PostgreSQL tests PASS;
production and widgets-live typechecks and targeted lint PASS. The new connected
scripted-model test uses natural multi-turn messages, carries omitted date/service,
switches Антон → Илья, then selects 17:00 through the production headless carrier.
It verifies the resulting synthetic appointment's staff/service/start/Client,
exactly one SUCCEEDED AE with one attempt, and a receipt-backed CONFIRMED terminal line.
Actual foreign-tenant catalog IDs and duplicate names refuse before availability,
approval or booking AE. Existing encrypted context restart/expiry/principal fences,
raw captured transcripts and receipt wording regressions also pass.

Qualification boundary: model transport is scripted; catalog/provider is synthetic
INTERNAL, not YClients acceptance. Original raw captures/frozen paid corpus are unchanged.
The raw captured «к Антону» in the mismatching fixture now asks for clarification,
instead of producing an invalid-ID 503. Conservative exact matching intentionally does
not guess inflections, multiple candidate names or multiple services. This is not a
complete natural-language acceptance result or proof of 1000-salon throughput.

Next prerequisites: source-qualified disambiguation/aliases for inflected or ambiguous
staff references, then a separately authorized real-model check against a matching
synthetic public catalog, preserving the original corpus as diagnostic evidence.
No paid environment or expired server proof restarted; counters/TTL unchanged. No new
paid calls, deploy, production writes, real notifications, migrations, phone operations,
push or merge. Stable guest backend/frontend candidate SHAs remain unchanged.


## Client name references and bounded conversational follow-up (2026-10-05)

Based on `6b6b8b5819c3b4c9227e867bb2f54dde923b34db`, same isolated chat branch.
Independent review found and this checkpoint fixes the raw-name override: an incidental
self-name or excluded name must not select staff. The existing sanitizer now supplies
request-local opaque mention tokens; the semantic owner selects the employee token;
only its local value is matched against current tenant catalog name forms. Existing
name-form logic is shared with redaction; no salon dictionary, nickname guessing,
fuzzy best-match or second intent router was added. Stale/invented/collapsed references
refuse. Colliding forms (e.g. Александр/Александра) require disambiguation.

Catalog qualification also runs after a valid booking intent on an incomplete first
turn. «Хочу у Стаса» can preserve the qualified public staff preference while asking
for service/date. Unresolved request-local token strings are not persisted as reusable
preferences. Current corrections, date/service carry and exact time/time_of_day carry
remain in the existing encrypted context owner. A daypart cannot satisfy required
clock time. Semantic single-day date now wins over conflicting tool date/start, using
existing business-calendar functions; ranges are never narrowed by guessing.

Multi-service is an explicit current carrier limitation: SERVICE_SELECTOR currently
emits single selection, booking templates retain one service handle, and the preview
adapter builds serviceIds:[serviceId]. A tool's service_ids array is not evidence of
multi-service carrier support. The response states that limit and retains known
preferences rather than silently dropping a service or asking for an already-known
master. «Вечером» requires an exact-time clarification because this path has no
owner-configured daypart bounds; no invented cutoff or automatic slot filtering.

271 unit/architecture tests and11 HTTP/PostgreSQL tests PASS; production/widgets-live
typechecks, targeted ESLint, diff check PASS. A ten-turn scripted-model/local INTERNAL
fixture covers partial first turn, у Стаса → у Александра, negation, self-identification,
two-service limitation → one-service correction, tomorrow, evening clarification,
18:30, then production carrier preview/explicit confirmation and one successful AE
attempt with a canonical terminal receipt. Availability includes morning and evening;
model tool date is deliberately stale. Actual appointment staff/service/start/Client
is asserted. Foreign IDs and duplicate names refuse. This is NOT semantic acceptance,
real-provider acceptance or scale certification.

Prepared `maya-saas-backend/datasets/conversation-intelligence/frozen-client-catalog-followup-20261005.json`:
6 cases /4 existing families /20 user turns, source snapshots and dataset hash retained,
explicit original-versus-derived labels, synthetic catalog requirements and grading
prerequisites. Status FROZEN_NOT_RUN. Independent read-only review artifact:
`task-3/pilot-evidence/name-followup-independent-review.md`; no remaining blocking
finding in reviewed code, tests not independently rerun. Finite name morphology,
service-label ambiguity, daypart limits and multi-service contract remain visible
qualification boundaries. No paid calls or server-proof restart; all old ledgers/TTL
unchanged. Local proof DB stopped. Stable website/backend pair untouched; no push,
merge, production writes, deploy, migrations, notifications, payments or phone actions.


## Chat aggregate regression checkpoint — 2026-10-05

Code `15b88f52bf39a544ba2448970731f3c3b6d528fa`, based on accepted
`d2168e737321a6c2708262e388ec6762483b3ea6`; compared with stable backend
`dcba8c8f4d230de31fb93f3d613f7524c3310df9`. Two new regression details fixed:
pilot fixture grants now stay with the existing Fixtures owner; semantic-context
size checking uses the existing canonical serializer. Ratchets/allowlists/counts
were not relaxed. Three new UTF-8 boundary tests pass.

Full backend:5816 PASS/17 FAIL; all17 assertions reproduce on baseline, with the two
additional failure details now removed. Full HTTP/PostgreSQL on the code checkpoint:
487 PASS/3 FAIL; all3 failure bodies exactly reproduce on baseline. Documented runner:
20/27 PASS on both versions. React:93/93 PASS. Shell:428 PASS/2 baseline FAIL/7 explicit
skips. Types/build/Prisma/e2e/event SQL checks pass; full lint's22 errors are unchanged
from baseline. **Aggregate is not green; this is not release or real-model acceptance.**

Detailed matrix, evidence paths, remaining Client gaps, six-case/twenty-turn bounded
live proposal and website-only release blockers are in
[CHAT-AGGREGATE-READINESS-20261005.md](CHAT-AGGREGATE-READINESS-20261005.md).
Owned local proof PostgreSQL is stopped. No paid calls, remote-proof restart,
production writes, phone work, push, merge or deployment occurred in this pass.
