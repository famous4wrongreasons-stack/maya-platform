# A17 connection version and recovery — 2026-10-10

Qualified local development follow-up to [the first local setup UI checkpoint](MAYA-LOCAL-CRM-SETUP-20261010.md), on `codex/maya-local-crm-setup-20261010` from committed `1a43694e9e0b3513a5e00cdd9b64cb762b2421a6`. The current React form now carries the reviewed configuration version into the existing A17/Action Engine install, activation and import owners. An exact authenticated operation read recovers the original receipt after response loss. Import projection and its successful receipt share the existing database transaction.

This is a bounded local development candidate. Real YCLIENTS connection acceptance, booking readiness, broader MAYA completion and C10 completion are **not issued**. No working website, hosting, production database, provider booking, model invocation, outbound notification or background initiator is part of this change. Historical real-model evidence remains [separate and ungraded](MAYA-CURRENT-REACT-REAL-MODEL-20261010.md).

## Existing owners and source binding

`configVersion` is an opaque digest of the integration identity, tenant, provider, encrypted credential, base URL and configuration settings. Status/health timestamps and the accepted import hash do not change it. The required `expectedVersion` is checked against current facts and again under the existing Action Engine target lock. A change during provider verification refuses the old request. Current presentation never authorizes a different configuration.

An explicitly stored branch binding must still resolve to the current tenant's branch before provider reads and under that lock. Actor authority is rechecked after the final awaited metadata read. The import callback must preserve the approved configuration version before its receipt can be marked successful.

`GET /api/integrations/crm/operation?operation=install|activate&requestId=<UUIDv4>` reads the existing actor- and tenant-scoped AE occurrence. It does not create, resume or reread the provider. A completed activation requires the original `import_confirmed` receipt with the atomic projection marker. A historical receipt remains historical when the current connection differs. Missing, cleaned or unqualified evidence cannot become a success claim.

No schema, second operation store or retention change was introduced. Existing AE payload retention and audit lifecycle remain in force. A payload removed by the existing lifecycle produces unavailable evidence; this UI does not recreate it.

## Browser continuation and consent

The opt-in local route remains `/?local_crm_setup=1` on loopback only. Before a write, the carrier saves only operation kind and a random UUID in the current URL's `crm_operation` and `crm_request` query parameters. This nonauthorizing locator can remain in browser history. It contains no token, company, branch, actor, tenant, configuration version or consent. Storage failure prevents sending. A matching successful operation receipt clears it; an ordinary connection read does not.

Reloading that same URL and signing in again allows an explicit result check. The browser proof covers same-URL reload and the existing local email login; preservation across every OAuth/navigation flow is not claimed. `READY` can only be explicitly continued with the original key and material. Unknown/unavailable/not-observed results cannot create a new key or automatic retry. Separate consent remains required for credential installation and activation/import.

## Future real pilot entry — not performed here

After separately authorized isolated backend and tenant preparation, the owner would sign into the local form, press “Проверить подключение и результат”, select the existing MAYA branch, enter the company's positive YCLIENTS ID and **user API token**, and explicitly confirm “Проверить и сохранить подключение”. They would then review the saved company and branch and separately confirm “Активировать и импортировать”. A supplied company ID is never ownership proof; the server verifies the credential and scope.

The server must already have its own `YCLIENTS_PARTNER_TOKEN` and `CRM_ENCRYPTION_KEY`. The form does not configure either prerequisite. The user token is cleared from the password input before sending and on close/signout/unmount. It is sent only to the authenticated backend and stored in `CrmIntegration.encryptedApiToken` using the existing AES-256-GCM encryption service. It is not placed in React state, browser storage, URL, model input or proof artifacts.

Verification reads provider company/profile metadata, service/category data, bookable staff and CRM team membership. Depending on the source, team/profile records can contain employee names and contact details; these are handled by the existing backend import owner, not sent to a model or returned as raw preview data to this form. Client lists, appointments, sales and payments are not requested by this setup path. Activation/import changes local integration/calendar state and the existing team/presentation projection; it does not mutate YCLIENTS or send notifications.

The local synthetic checks make no paid model or real provider calls. A future real pilot's YCLIENTS account/API charges have not been verified; no zero-cost provider promise is made.

## Boundaries still visible

- Provider verification can fail before AE admission. Recovery then honestly returns `NOT_OBSERVED`; the form keeps the unresolved locator and blocks another write. An absent row does not prove that an in-flight request cannot still commit; clearing the locator and starting a new key would be unsound. A definitive failure/abandonment contract within the existing owner remains unresolved. This is a concrete usability blocker for general real-pilot readiness, not permission for a second lifecycle.
- The pilot refuses unproved migration of imported identities to another company, branch, provider or source endpoint, including disconnected historical mappings. Qualified confirmation conservatively refuses disabled/unlinked CRM identity history even for a same-company reimport. This is a limitation of this pilot, not a new product rule for identity migration.
- The inherited preview bounds (30 displayed services/staff, 50 imported team entries) remain. This candidate does not certify complete import of a larger organization.
- The HTTP proof covers response loss after commit and a test-induced transactional rollback followed by explicit same-key READY continuation. It does not cover an interrupted worker or an external UNKNOWN effect. Browser reload and HTTP/PG restart were checked separately; browser survival across a database restart is not claimed.

## Verification

Runtime commit: `e87217e751d1d099b3ca4a79e53245a98547c203`. Executed candidate: **`95cd7d58415e644ce25aca727aae47b8aa0ff03b`**, adding two harness-only corrections. [Evidence summary](evidence/maya-a17-connection-recovery-20261010/summary.json) and [source hashes](evidence/maya-a17-connection-recovery-20261010/candidate-source.json) bind this result to the candidate.

- **65 backend unit tests / 4 suites**, **35 frontend/net/URL tests**, **12 shared transport regressions**, **5 runner/browser guard tests** PASS. Runtime build, React gate/types/build, backend and probe scoped types/lint PASS.
- **Actual HTTP/auth/owned PostgreSQL:** [prepare](evidence/maya-a17-connection-recovery-20261010/http-prepare.json) and [resume](evidence/maya-a17-connection-recovery-20261010/http-resume.json) PASS. Different Node process and PostgreSQL start time were observed. The original three executions/attempts/mutations and receipt evidence survive unchanged; recovery performs zero provider reads.
- Both stale-before-read and replacement-during-native-verification return 409. Foreign tenant cannot observe the receipt; wrong actor/role and revoked membership refuse. Historical receipts retain their original version after replacement.
- A test-only error after actual projection writes rolls back the confirm transaction. Explicit same-key continuation preserves the existing confirm execution and finishes once. No production failure switch was added.
- **Current React in Chrome:** six checkpoints PASS, including separate consent, cleared token, actual committed activation-response loss, same-URL reload/relogin and GET recovery. Exactly two setup POSTs occur: installation and activation. There is no automatic retry. [Browser evidence](evidence/maya-a17-connection-recovery-20261010/browser.json), [desktop](evidence/maya-a17-connection-recovery-20261010/screenshots/recovered.png) and [mobile](evidence/maya-a17-connection-recovery-20261010/screenshots/recovered-mobile.png) screenshots are retained.
- All three disposable clusters were stopped. [Final manifest](evidence/maya-a17-connection-recovery-20261010/http-manifest.json) records the bounded single-worker profile. Real YCLIENTS/model calls and provider writes were zero.

The first full attempt failed at a Jest cross-realm `instanceof Error` assertion; the fix still requires exact `ECONNRESET`, one forwarded request, actual upstream 201 and a valid receipt. The second attempt passed prepare and restart recovery, then failed because the test expected 403 instead of the existing session owner's 401 after membership revocation. Both failures remain archived; only the third full attempt is PASS. No business code was changed to accommodate those test expectations.

Independent source review closed the reported identity migration, final actor-check and frontend cancellation/foreign-result issues. Its [record](evidence/maya-a17-connection-recovery-20261010/independent-source-review.json) is source/component qualification, separate from the executed proof. Earlier mock-only evidence stays historical.

Reproduce only in an authorized local test slot, with the existing dependencies and no `.env` files:

```sh
cd maya-saas-backend
node scripts/c9-occupancy-proof.mjs --run --crm-setup --output=/private/tmp/maya-a17-recovery-NEW --pg-bin=/opt/homebrew/opt/postgresql@16/bin
```

The runner creates its own loopback database, builds the current React carrier, uses finite synthetic native-adapter GETs and stops its cluster. It does not use the shared database or a real provider credential.
