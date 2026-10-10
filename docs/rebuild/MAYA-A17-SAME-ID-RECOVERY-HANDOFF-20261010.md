# MAYA: локальное приложение и восстановление подключения — 10 октября 2026

Development follow-up from **`77d41ef56254972d6ae849d497046ea02ac2487c`**, branch `codex/maya-local-crm-setup-20261010`. The current React form and the existing A17 backend now allow an explicit same-ID submission when a connection request was lost before durable registration. This closes the permanent `NOT_OBSERVED` form latch documented in the [previous checkpoint](MAYA-A17-CONNECTION-RECOVERY-CHECKPOINT-20261010.md).

The local recovery and runnable-launch checks passed. This does not declare real YCLIENTS, model, booking or full MAYA/C10 acceptance. The working website, production, deployment and iPhone installation are outside this local run.

## What the owner can use

The local candidate uses the current React application, real AppModule/auth, existing A17/Action Engine and an isolated PostgreSQL database on this Mac. The setup form supports selecting an existing MAYA branch, entering a YCLIENTS company ID, separately consenting to credential installation and activation/import, and recovering the same operation after a lost request or response.

The runnable test session uses **synthetic YCLIENTS data only**. Its launcher rejects real tokens; it is not a place to enter a production credential. The native adapter and the backend owners execute normally against a finite synthetic provider transport. No model, provider write or outbound notification is enabled by the launcher.

The actual one-minute developer smoke completed and automatically stopped its backend and database. **No new owner demo session is running or scheduled.** The latest owner instruction asks for real connection preparation, not another synthetic demonstration.

The developer-only command remains reproducible if explicitly requested: `node scripts/crm-setup-local.mjs --run --output=/absolute/fresh/directory --minutes=1` from `maya-saas-backend`. It starts the current React form and normal backend authentication; a separate local no-store notice page shows the actual debug email code held only in memory. It accepts only the documented synthetic tokens. Its successful smoke covered local login, branch selection, credential installation, activation/import and owned cleanup. No request is made to enter real credentials into this profile.

The next owner-facing handoff is the [separate one-time real YCLIENTS preparation](MAYA-LOCAL-YCLIENTS-ONE-TIME-HANDOFF-20261010.md). It does not relax the synthetic profile, start a provider request or imply a live connection is already accepted.

## Recovery behavior

Only an explicit authenticated operation read can enable a new submission after `NOT_OBSERVED`. The user re-enters the material and gives fresh consent. The request keeps the original operation and UUID. Missing status never proves non-dispatch, never clears the locator and never authorizes an automatic POST or a new key.

The first durably admitted material wins. If the original body never reached admission, its exact contents cannot be reconstructed after a browser reload; the form does not claim otherwise. Once material is admitted, the existing owner rejects changed actor, source version, branch, settings or credential fingerprint. `READY` continues the admitted operation; `UNAVAILABLE` does not authorize recreation.

Two backend race fixes preserve that contract. A delayed original preview can return the exact same-key success committed meanwhile. Conflicting independently planned target generations get at most one rebuild through the existing trusted occurrence; unmatched or repeated conflict stops. The complete current actor/source/material check runs under the existing target lock before mutation. Retention is checked again on the locked row. There is no new table, store, retention rule or lifecycle.

## Verification record

Runtime source: `2fdd6cf13e38b15f178dad7787eb8eea9fbe8bbf`. Actual recovery proof source: **`cbe2c2103f6ee12d35fe3b509fb7eafc9d6754d5`**. Runnable launcher source: **`792cc10af9d27524446b07911b73c553c8f8c4ee`**. [Evidence archive](evidence/maya-a17-same-id-recovery-20261010/summary.json).

- 78 backend tests in four suites, 38 frontend/net/URL tests and five driver/browser guard tests passed. Production and focused types, scoped lint, runtime build and current React build passed.
- Independent source review found no remaining recovery/authority blocker. Its UI finding was fixed: the general form describes storage at the connected backend, while the isolated-Mac guarantee is made only for the separately verified launcher.
- Actual HTTP/current React/PostgreSQL restart proof **passed**: prepare 298 assertions and resume 97. Nine React checkpoints cover loss before admission, same-URL reload/relogin, explicit same-ID resubmission and later lost activation-response recovery. There are three browser POST attempts, two admitted setup POSTs; only recovery of the completed activation uses GET without resend.
- Held original preview and concurrent same-ID retry converge to one execution, attempt, mutation and receipt. Changed material refuses with 409. Both `NOT_OBSERVED` and genuinely admitted `READY` survive an actual Node/PostgreSQL restart and remain inert until explicit submission. Original READY execution is preserved. Foreign tenant/actor, revoked membership and expired signed access token refuse. The prior transactional import rollback and stale-version cases remain covered.
- The launcher passed six argument/route guards, focused types/lint and an actual one-minute local run. HTTP smoke verified current form and notice, normal email login, real branch/status reads, rejection of a non-fixture token, and actual install/atomic import against synthetic YCLIENTS. Its natural expiry left the owned form process group absent, stopped PostgreSQL and preserved its source binding. This smoke is distinct from the earlier browser proof. Independent source/evidence reviews qualified both.
- The first actual attempt stopped during module bootstrap because a new test-only import changed CommonJS evaluation order. Its database was stopped. The correction restores the established import order; no production behavior was changed for that failure.

The expiry regression uses component test clocks/ports. Actual passage of the existing 30-day payload retention interval is not claimed; no immutable deadline or database timestamp was rewritten. Expired authentication and revoked membership are separate checks. A post-admission test exception is not worker-crash acceptance. Browser reload and PostgreSQL restart remain distinct checks.

## Handoff to real YCLIENTS

The safe next step is the same current UI against a separately authorized isolated backend with the normal native YCLIENTS transport. The synthetic launcher cannot be converted into a real pilot by pasting a token.

1. Prepare the existing backend's `YCLIENTS_PARTNER_TOKEN` and `CRM_ENCRYPTION_KEY` privately, and confirm the isolated tenant and its existing MAYA branch. Do not put secrets into chat, Git or evidence.
2. Sign in as the authorized owner/admin. Open the local setup and press **«Проверить подключение и результат»**. Select the MAYA branch, enter the positive YCLIENTS company ID and user API token, and explicitly consent to **«Проверить и сохранить подключение»**.
3. Review the saved company, branch and connection version. Give separate consent to **«Активировать и импортировать»**. Credential verification performs provider reads; activation/import writes only to the selected local backend. The existing flow does not write to YCLIENTS or send notifications.
4. Confirm current services/staff and branch-scoped reads before a separately authorized booking move/cancel check. Setup success alone is not booking readiness.

The owner must authorize the real provider-read session and enter the credentials privately. Real model use, if required for chat acceptance, is a separate explicit approval. These are external inputs, not uninvestigated code blockers. Account/API charges were not verified and are not promised to be zero.

Historical imported identity migration across company/branch/provider/endpoint remains conservatively refused. Existing import preview/team bounds remain; this work does not certify complete import of a larger organization or solve a multi-company schema decision.

## Minimum path to iPhone acceptance

The existing [Debug API override](../../maya-ios-carrier/README.md#explicit-isolated-api-target-debug-only) already selects an isolated backend without changing the working website. The phone first needs a reachable trusted HTTPS endpoint for that backend and the normal backend origin permissions. `127.0.0.1` on the phone is the phone; the production phone API cannot reach this isolated Mac by changing a local URL.

After that endpoint and device installation are explicitly authorized, build the same React carrier with `npm run sync -- --development-api=THE_APPROVED_HTTPS_API`, use the exact same `MAYA_DEVELOPMENT_API` in Debug, verify the packaged app with the existing `verify-app` command and install the Debug build. Use isolated email login, then check chat, real branch reads and individually confirmed move/cancel on the agreed test data. Do not reinstall a default production-target build as an isolated test. The existing bundle identity may replace the installed app; no device change is performed here.

## Remaining work and timing

The local recovery code, HTTP/browser/restart proof and runnable local setup are complete. The current setup form has been exercised against the real local backend. The completed developer session is stopped; an unsolicited owner demonstration will not be opened. Real connection is the next finite step after separate runtime preparation, exact owner/source admission, private credentials and provider-read authorization; subsequent chat/real-read/booking acceptance must use that source, not be inferred from this setup result.

A date for a real connected iPhone application depends on credential entry, any requested model approval, reachable HTTPS and device access. There is no measured basis yet for a duration of that whole path. The broader MAYA/C10 scope remains separate from this first usable connection flow. OCR/design remain later work; messaging campaigns are not silently removed from the product scope.
