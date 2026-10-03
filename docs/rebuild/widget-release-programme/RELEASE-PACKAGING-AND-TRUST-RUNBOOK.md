# Certified React release packaging and AR-1 operator procedure

This procedure prepares a release; it does not authorize execution. The packaging/trust pass permits local builds, synthetic proofs and read-only verification only. Production deployment, migration, trust installation/restart, login/session issuance, entitlement grant, OTP, provider actions and device installation require the separate execution boundary. An unsigned certificate proposal is evidence for review, never release authority.

## One delivered web payload

`maya-carrier-react/src/main.tsx` is the fixed entrypoint for both production PWA and Capacitor. From `maya-ios-carrier`, run `npm run sync`; from `maya-carrier-react`, run `npm run release:verify` and `npm run test:release`. The first command builds the headless runtime, builds the React web/Capacitor artifacts, verifies both, syncs the latter, and checks the copied native bytes. It does not install an app or deploy anything.

Publish only `maya-carrier-react/dist/web/`, mounted at `/maya-chat-shell/`. The existing manifest install ID, start URL, scope and approved icons retain that identity. The name of the URL is not a shell selection. `maya-chat-shell/dist/web` and `dist/capacitor` are runtime/reference artifacts, never the selected release UI. No legacy application screens are copied.

`maya-ios-carrier/capacitor.config.json` pins `webDir` to `../maya-carrier-react/dist/capacitor`. Only the existing API endpoint string, content-addressed script path and CSP endpoint differ between targets. Styles, metadata and icons are identical. The verifier reconstructs expected bytes from source, rejects extra/missing/changed files and symlinks, and never repairs a failed verification. Only the two empty Capacitor Cordova placeholders are allowed in native output. Generated native configuration and plugin set must match.

Xcode runs the same verifier before every build. After an authorized build, verify the actual `.app` with `node maya-carrier-react/tools/release.mjs verify-app /absolute/path/App.app` from the repository root. A local unsigned simulator build proves packaging, not device installation or signed device acceptance. Record source SHA plus backend, web, Capacitor and actual-app inventories. Any code/runtime-byte change invalidates the candidate.

## R01 provenance

The release manifest now includes the existing `.well-known/.htaccess` and `apple-app-site-association` at their existing production paths and committed bytes. Their contents are unchanged from `aecd770b91e94b74b26f76f6dc9e69775dc6bcab`. The same R01 gate checks all 44 rows and all four committed sources. Follow `maya-saas-backend/deploy/platform/beget-edge/RELAY-RELEASE.md`; the existing off-root archive is selected with `MAYA_R01_ARCHIVE_DIR=legacy-bundle-archive`. Run `node deploy/platform/beget-edge/relay-release.cjs verify` from the backend. This verify mode makes no repairs and does not evaluate PHP source or send business requests.

## 1. Obtain identities and public trust material from the real custodians

The owner/approver and independent security reviewer supply their own Ed25519 public keys, key IDs and stable principal IDs through the operator's authenticated channel. The reviewer must differ from both approver and platform operator. They must control different private keys. Private keys remain in their existing custody/signing service; do not generate production keys in this repository, send them to chat, copy them to the application, or use the ephemeral test keys. Verify public-key fingerprints directly with each custodian.

The platform operator is a real active global `platform_owner` User, with `tenantId=null` and `membershipId=null`. Product `tenant_owner` is not this role. Do not promote the business owner, insert an AuthSession, mint a JWT manually, or reuse a tenant token. If the actual account credentials are unavailable, stop this execution step; use the established account recovery owner outside this release unit.

Before actual installation, the operator prepares a private configuration file outside the repository, excluded from logs/backups exposed to users. It contains these exact settings, with supplied values (not these placeholders):

```dotenv
NODE_ENV=production
WIDGET_RELEASE_ENVIRONMENT=production
WIDGET_RELEASE_CANDIDATE_SHA=<exact newly certified 40-character SHA>
WIDGET_RELEASE_PRODUCTION_TENANTS_JSON='["<exact authorized tenant id>"]'
WIDGET_RELEASE_PRODUCTION_TRUST_JSON='{"<owner key id>":{"principalId":"<approver id>","purpose":"owner","publicKey":"<Ed25519 SPKI PEM with JSON escaped newlines>"},"<reviewer key id>":{"principalId":"<reviewer id>","purpose":"security","publicKey":"<different Ed25519 SPKI PEM with JSON escaped newlines>"}}'
```

No wildcard/additional tenant, staging trust fallback, private PEM or shared signer is admissible. The public settings themselves do not grant authority. Validate offline from the exact built backend:

```sh
node scripts/widget-release-operator.cjs check-config "$AR1_ENV_FILE" "$AR1_TENANT" "$AR1_CANDIDATE_SHA"
```

This prints only fingerprints/identities and `authorityGranted:false`, `sessionVerified:false`. Installation is a separate authorized operator action: first capture the current service/environment and rollback; then insert only these reviewed settings into the service's actual environment source, preserving unrelated settings and file ownership/mode. The tracked deployment unit names `/etc/maya-saas/live-widgets.env`; verify the running unit's EnvironmentFile before using that path. Use proper systemd environment quoting and verify effective parsed values/fingerprints without printing secrets. Never replace the entire production environment with the five-field preflight file. No restart or installation is performed by the offline checker.

## 2. Independent certificate review and signature

Use only the new candidate's complete fresh strict-collector evidence and artifact hashes. The reviewer verifies all 163 applicable clauses, isolation, revocation, FBE2E and packaging; the two global HANDOFF duties remain STOP. Full-contract certification remains false. Inspect the production backend artifact with the existing compiled `WidgetReleasePolicy.buildDigest()` from its backend working directory; this hashes executable backend JS and its package lock. Compare web/native inventories separately to the certified carrier digest. A candidate label alone is insufficient.

The reviewer creates a production certificate payload satisfying `profileCertificate` in `src/entitlements/widget-release-profile.contract.ts`. Preserve the exact candidate/build/carrier/registry/evidence/integration/FBE2E/revocation/isolation/dependency digests, matrix and global audit digest from reviewed receipts; use the fixed `closed-input.no-handoff@1` profile digest. Set `environment=production` and an actual reviewed issuance/expiry window. Do not simply relabel or sign an expired synthetic proposal without that review.

Sign the UTF-8 bytes returned by the existing compiled `canonical(payload)` function using Ed25519 (no prehash). Wrap as exactly `{payload,keyId,signature}`, where `signature` is unpadded base64url (86 characters). `releaseHash(signedCertificate)` is SHA-256 of the canonical entire signed wrapper, not the raw JSON file and not just its payload. The operator may prepare bytes for review, but may not manufacture the reviewer's signature. The repository ships no production signing command or private key.

## 3. Real platform-owner session and current CAS

After separate execution authorization, the operator uses the existing `POST /api/auth/login` password route with `{email,password}` and **omits `tenantSlug`**. This is the global platform-owner login; it issues the canonical AuthSession. It is not SMS verification. Keep credentials, response/token and HTTP header files in the operator's private directory with mode 0600; do not put them in command-line arguments, chat, git or logs. Use an authenticated HTTPS client, no TLS bypass. Verify the returned User is the expected global platform owner. A decoded token alone is not session evidence.

Use that session to call `GET /api/platform/widget-release/<exact-tenant>/status`. The controller and writer verify the actual User/AuthSession in the database. Record the exact returned `version` (possibly `absent`), tenant, current enabled state and expiry. Never invent or derive the CAS from a historical report. Session issuance and status execution are deliberately not automated by this preparation pass.

## 4. Separate owner execution authorization

The owner signs exactly the production contract `maya.widget-release-production-authorization/1`, not a staging authorization. All fields below are mandatory:

| Field | Binding |
| --- | --- |
| `authorizationId`, `releaseId` | Fresh execution identity and identified release |
| `operation` | `grant` |
| `tenantId`, `environment` | Exact single authorized tenant; `production` |
| `candidateSha`, `buildDigest` | Exact newly certified source and running compiled bytes |
| `certificateDigest`, `evidenceDigest` | Canonical signed certificate hash; its reviewed evidence digest |
| `profileId`, `profileDigest` | Fixed `closed-input.no-handoff@1`; canonical fixed digest |
| `operatorId` | Actual authenticated global platform User |
| `approverId`, `reviewerId` | Principals bound to installed owner/security keys |
| `rollbackOwnerId` | Real designated rollback owner |
| `expectedVersion` | Current canonical status version |
| `notBefore`, `expiresAt` | UTC ISO instants; positive window of at most 24 hours |
| `grantExpiresAt` | Future instant, no later than authorization/certificate expiry and at most 24 hours after application |

The owner signs canonical UTF-8 bytes with the same wrapper convention. Package the grant command as exactly `{authorization:<signed owner wrapper>,certificate:<signed reviewer wrapper>}`. Changing any field requires a new appropriate signature. No plan/trial grant or automatic renewal exists. The offline validation is:

```sh
node scripts/widget-release-operator.cjs check-command "$AR1_ENV_FILE" "$AR1_TENANT" "$AR1_CANDIDATE_SHA" "$AR1_SIGNED_COMMAND_FILE" "$AR1_PLATFORM_OPERATOR_ID"
```

This delegates to the **compiled canonical policy**, verifies current time/signatures/digests/operator binding, but cannot attest the real session, CAS or database. Next, under the separately authorized execution, POST the same command to `/api/platform/widget-release/<tenant>/validate` with that actual platform session. Require `dryRun:true` and the exact candidate/profile/version/expiry. Dry-run acquires/checks the existing authority locks without granting. It is not permission to bypass a later refusal. Only after the release execution authorization and all preflight checks may the operator POST the unchanged signed command to `/grant`. Retain its atomic `AuditLog` receipt, then reread status/effective feature and prove HANDOFF refusal. A timeout requires status/audit inspection; do not create a second authorization to guess success.

## 5. Revocation and expiry readiness

Keep the designated rollback operator/session and owner signer available for the window. Revoke uses a new owner-signed production authorization with `operation=revoke`, `grantExpiresAt=null`, a fresh authorization ID/window and the **current** entitlement version. Preserve exact stored candidate/build/certificate/release/profile/evidence bindings and designated identities. Submit exactly `{authorization:<signed wrapper>}` to `/revoke`; the canonical writer validates the stored release binding in its transaction and writes AuditLog atomically. The offline checker can validate revoke syntax/signature but cannot replace that stored-binding check. There is no revoke dry-run endpoint; do not send revoke to the grant-only `/validate` route.

After authorized revoke, status must be disabled and old widget tokens refused. Natural expiry also fails closed; no auto-renew. Revoke the entitlement before rolling the backend back to an artifact that cannot interpret this state. Retain the independent database/runtime rollback artifacts and the exact migration plan. Do not roll back unrelated production data. Readiness for this procedure is distinct from performing a grant/revoke or asserting an unobserved production result.

## Remaining external inputs

Real owner public key/identity/custody confirmation; independent reviewer public key/identity and reviewed production certificate signature; actual global platform-owner login/session; separately signed execution authorization tied to the **new** candidate and current CAS. If any is missing, stop that execution step. No tenant authority, caller-authored JSON, test signature or historical receipt substitutes for it.
