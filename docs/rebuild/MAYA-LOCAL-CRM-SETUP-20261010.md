# Local YCLIENTS branch setup adapter — 2026-10-10

The current React carrier now has an opt-in development form over the existing A17 integration owner. It reads the signed-in tenant's saved connection and available branches, and can prepare an explicit company-to-branch credential installation. **This is not a completed connection path:** activation/import is deliberately absent, and live setup acceptance remains NOT_ISSUED.

Candidate: `codex/maya-local-crm-setup-20261010`, isolated from committed base `63b1f849af37cb82d65a6f0eb58b578675411dba`. No backend schema, backend handler, working website, provider adapter, model, background initiator or C9 orchestration changes in this slice. The prior qualified explicit-request C9 checkpoint remains [separate](MAYA-LOCAL-FIRST-YCLIENTS-CHECKPOINT-20261010.md).

## Runnable local review

Open **http://127.0.0.1:8792/?local_crm_setup=1** while the dedicated preview is running. It uses the existing `happy` mock, not a real owner backend. Its synthetic email login is `anna@example.test`, code `246810`. The new screen opens after login; no CRM status request runs until the user presses “Проверить локальное подключение”.

The mock has no A17 status endpoint and returns 404. The form truthfully blocks saving, shows empty disabled fields and allows returning to chat. Do not enter real credentials into this preview. This review demonstrates layout, opt-in routing and refusal behavior, not a live branch connection.

To reproduce from this worktree with its existing dependencies:

```sh
node maya-chat-shell/build.mjs
node maya-carrier-react/build.mjs
node --test maya-chat-shell/test/local-crm-setup.test.mjs maya-chat-shell/test/history-erasure-net.test.mjs
node maya-chat-shell/dev/serve.mjs --root=maya-carrier-react/dist/web --port=8792 --mock=maya-chat-shell/dev/fixtures --scenario=happy
```

The browser check, with that mock viewer running:

```sh
node maya-carrier-react/test/local-crm-setup-browser-probe.mjs /tmp/maya-local-crm-setup-20261010-ui
```

## Exact scope of future owner entry

The development form asks only for a **user API token**, positive YCLIENTS company ID and explicit selection of an existing branch returned for the current tenant. It never infers the branch from a name or a single result. Company `503759` from the old public booking URL is not prefilled or treated as current ownership evidence.

An isolated local backend and authenticated integration-management session must first be established through the existing owner setup. `YCLIENTS_PARTNER_TOKEN` and `CRM_ENCRYPTION_KEY` remain backend runtime prerequisites; the form neither reads nor configures them. Their presence cannot be inferred from the public provider catalog. No real tenant credential presence was established in this work.

Only explicit user consent plus submission can call `POST /api/integrations/crm/connect`. It would perform provider credential/preview reads and persist encrypted credentials through the existing A17 `install_crm_credentials` owner in `pending_activation`, with this finite settings shape:

```text
provider: yclients
settingsJson.companyId: entered positive safe integer
settingsJson.branchBinding.contract: maya.crm-branch-binding/1
settingsJson.branchBinding.companyId: same company ID
settingsJson.branchBinding.branchId: selected owned branch ID
```

No tenant, actor, role, base URL or generic settings can ride along in that body. Backend authentication, tenant scoping, role checks and branch ownership remain authoritative. Loopback/query opt-in only controls presentation; it does not authorize setup or prove that an arbitrary local proxy points to an isolated backend.

The token stays in the uncontrolled password input until submission, then is cleared synchronously before the port call; it is not copied into React state, local storage, URLs, evidence or model context. Close/unmount/signout also clear the input. The network layer projects only public connection metadata and preview counts. No raw provider error, client list or preview item enters the view.

## Exact remaining boundaries

1. **Version-bound activation is missing in the existing HTTP contract.** `POST /integrations/crm/activate` takes no expected connection revision; `Package5Wave3CanonicalCutoverService.activateCrmIntegration` selects the current saved integration. If configuration changes from A to B after a UI read, an empty activation POST may activate/import B. A frontend preflight cannot atomically prevent this. The new adapter therefore exposes no activation endpoint, method or button. Enabling it requires a reviewed extension of the existing A17 owner that atomically pins the approved source/version through activation and import; no second integration system was added.
2. **Restart recovery is not qualified.** Before dispatch, a token-free in-memory latch blocks additional writes. Only an exact successful stage response in the same live session/generation clears it. Status reads, close, signout, cancellation and late responses cannot clear uncertainty or create a new idempotency key. However, a full runtime restart loses that latch; a status snapshot is not a terminal operation receipt. Live setup needs existing-owner receipt/recovery semantics before a restarted client may resubmit. No new persistence/retention design was introduced here.
3. **Real local setup has not been performed.** Owner entry/approval, isolated backend/tenant/session and required backend configuration remain prerequisites. No user token was entered, provider request made, credential installed, integration activated or import started. This candidate must not be presented as a ready live connection flow while the two contract/recovery boundaries above remain.

## Verification and review

- Runtime build PASS. React boundary gate/typecheck/build PASS (26 carrier files, 28 runtime modules, no gate refusals).
- 24 targeted tests PASS: 12 new setup tests and 12 shared-transport regression tests. They cover explicit consent, exact body/header shaping, same-key bounded 401 refresh, lost responses, projection redaction, branch removal, foreign tenant response rejection, revocation, single flight, late completion and the uncertainty latch. All use synthetic in-process transports; no HTTP/PG aggregate or model/provider runs.
- Owned headless Chrome UI check PASS at 1280×1100 and 390×844, no horizontal overflow. Zero automatic setup reads, exactly one user-triggered setup GET (truthful mock 404), zero setup POSTs, no activation control, close returns to chat. Initial probe assertion incorrectly treated an embedded data URI as an external network origin; the probe was corrected, then passed. No product workaround or policy bypass was involved.
- Independent review identified both boundaries above. Final read-only [independent review](evidence/maya-local-crm-setup-20261010/independent-review.json) accepts saving this limited local development checkpoint after the fixes, with no remaining source blocker for that scope. It does not grant live/C10 acceptance.

Evidence: [check summary](evidence/maya-local-crm-setup-20261010/checks.json), [browser receipt](evidence/maya-local-crm-setup-20261010/summary.json), [desktop](evidence/maya-local-crm-setup-20261010/desktop.png), [mobile](evidence/maya-local-crm-setup-20261010/mobile.png), [source/artifact hashes](evidence/maya-local-crm-setup-20261010/sha256.json).

## Uploaded file correction

The owner's attached file is an architectural review of MAYA, not a credential bundle. A bounded context review found no explicit company ID, partner-token or user-token fields. The earlier long-string heuristic was a false positive. Its private original remains outside Git; no raw bytes, hashes or transfer metadata were included in evidence. The earlier derived checkpoint summary was corrected without changing its historical raw test artifacts.

No push, merge, deploy, server/hosting action or working website change. Full MAYA, C10, paid-model and live YCLIENTS acceptance remain **NOT_ISSUED**.
