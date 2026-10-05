# Certified React release packaging and AR-1 operator procedure

This procedure prepares a release; it does not authorize execution. The packaging/trust pass permits local builds, synthetic proofs and read-only verification only. Production deployment, migration, trust installation/restart, login/session issuance, entitlement grant, OTP, provider actions and device installation require the separate execution boundary. An unsigned certificate proposal is evidence for review, never release authority.

## One delivered web payload

`maya-carrier-react/src/main.tsx` is the fixed entrypoint for both production PWA and Capacitor. From `maya-ios-carrier`, run `npm run sync`; from `maya-carrier-react`, run `npm run release:verify` and `npm run test:release`. The first command builds the headless runtime, builds the React web/Capacitor artifacts, verifies both, syncs the latter, and checks the copied native bytes. It does not install an app or deploy anything.

Publish only `maya-carrier-react/dist/web/`, mounted at `/maya-chat-shell/`. The existing manifest install ID, start URL, scope and approved icons retain that identity. The name of the URL is not a shell selection. `maya-chat-shell/dist/web` and `dist/capacitor` are runtime/reference artifacts, never the selected release UI. No legacy application screens are copied.

`maya-ios-carrier/capacitor.config.json` pins `webDir` to `../maya-carrier-react/dist/capacitor`. Only the existing API endpoint string, content-addressed script path and CSP endpoint differ between targets. Styles, metadata and icons are identical. The verifier reconstructs expected bytes from source, rejects extra/missing/changed files and symlinks, and never repairs a failed verification. Only the two empty Capacitor Cordova placeholders are allowed in native output. Generated native configuration and plugin set must match.

Xcode runs the same verifier before every build. After an authorized build, verify the actual `.app` with `node maya-carrier-react/tools/release.mjs verify-app /absolute/path/App.app` from the repository root. A local unsigned simulator build proves packaging, not device installation or signed device acceptance. Record source SHA plus backend, web, Capacitor and actual-app inventories. Any code/runtime-byte change invalidates the candidate.

## R01 provenance

The release manifest now includes the existing `.well-known/.htaccess` and `apple-app-site-association` at their existing production paths and committed bytes. Their contents are unchanged from `aecd770b91e94b74b26f76f6dc9e69775dc6bcab`. The same R01 gate checks all 44 rows and all four committed sources. Follow `maya-saas-backend/deploy/platform/beget-edge/RELAY-RELEASE.md`; the existing off-root archive is selected with `MAYA_R01_ARCHIVE_DIR=legacy-bundle-archive`. Run `node deploy/platform/beget-edge/relay-release.cjs verify` from the backend. This verify mode makes no repairs and does not evaluate PHP source or send business requests.

## 1. Single-operator identities and public trust material (owner decision 2026-10-03)

One actual founder may be release approver and platform operator. No second human is required for V2. The operator supplies one Ed25519 public key, key ID and the actual global platform User ID through an authenticated channel. Its private key stays under their control in a secure signer outside this repository and chat. Do not generate production keys during preparation, use ephemeral test keys, invent a reviewer, or produce a second self-signature. Verify the public-key fingerprint with the real custodian. Record `governance=single-operator`, `independentHumanReview=false`, `reviewerId=null`. V1 independent-review remains available under its unchanged contract; this procedure describes V2.

The platform operator is a real active global `platform_owner` User, with `tenantId=null` and `membershipId=null`. Product `tenant_owner` is not this role. Do not promote the business owner, insert an AuthSession, mint a JWT manually, or reuse a tenant token. If the actual account credentials are unavailable, stop this execution step; use the established account recovery owner outside this release unit.

Before actual installation, the operator prepares a private configuration file outside the repository, excluded from logs/backups exposed to users. It contains these exact settings, with supplied values (not these placeholders):

```dotenv
NODE_ENV=production
WIDGET_RELEASE_ENVIRONMENT=production
WIDGET_RELEASE_CANDIDATE_SHA=<exact newly certified 40-character SHA>
WIDGET_RELEASE_PRODUCTION_TENANTS_JSON='["<exact authorized tenant id>"]'
WIDGET_RELEASE_PRODUCTION_TRUST_JSON='{"<owner key id>":{"principalId":"<actual global platform User id>","purpose":"owner","publicKey":"<Ed25519 SPKI PEM with JSON escaped newlines>"}}'
```

No wildcard/additional tenant, staging trust fallback, private PEM or fabricated reviewer is admissible. The public settings themselves do not grant authority. Validate offline from the exact built backend:

```sh
node scripts/widget-release-operator.cjs check-config "$AR1_ENV_FILE" "$AR1_TENANT" "$AR1_CANDIDATE_SHA" single-operator
```

This prints only fingerprints/identities and `authorityGranted:false`, `sessionVerified:false`. Installation is a separate authorized operator action: first capture the current service/environment and rollback; then insert only these reviewed settings into the service's actual environment source, preserving unrelated settings and file ownership/mode. The tracked deployment unit names `/etc/maya-saas/live-widgets.env`; verify the running unit's EnvironmentFile before using that path. Use proper systemd environment quoting and verify effective parsed values/fingerprints without printing secrets. Never replace the entire production environment with the five-field preflight file. No restart or installation is performed by the offline checker.

## 2. Review exact fresh evidence; prepare an unsigned canonical certificate

Use only the newly certified candidate's complete strict-collector receipts and artifact hashes. The owner/operator reviews all 163 applicable clauses, isolation, revocation, FBE2E and packaging; the two global HANDOFF duties remain STOP, full-contract certification remains false. This is explicitly not independent human review. Inspect the exact production backend artifact with compiled `WidgetReleasePolicy.buildDigest()` from its backend working directory. Compare web/native inventories to the certified carrier digest; a SHA label alone is insufficient.

Prepare the existing production `ProfileCertificate` payload validated by `profileCertificate`. Preserve exact candidate/build/carrier/registry/evidence/integration/FBE2E/revocation/isolation/dependency digests, matrix and global audit digest from the newly reviewed receipts, plus the fixed profile and registry digests. Set a current reviewed issuance/expiry window and `environment=production`; an expired synthetic proposal cannot simply be relabelled as fresh evidence. Do not change certified artifact bytes.

For V2 there is NO separate certificate signature. `certificateDigest=releaseHash(rawCertificate)` hashes canonical sorted certificate JSON, not raw file formatting. The sole owner execution signature in step 4 binds that exact digest and therefore the whole certificate. An unsigned certificate by itself grants nothing. An old V1 signed certificate wrapper is refused in a V2 command.

## 3. Real platform-owner session and current CAS

After separate execution authorization, the operator uses the existing `POST /api/auth/login` password route with `{email,password}` and **omits `tenantSlug`**. This is the global platform-owner login; it issues the canonical AuthSession. It is not SMS verification. Keep credentials, response/token and HTTP header files in the operator's private directory with mode 0600; do not put them in command-line arguments, chat, git or logs. Use an authenticated HTTPS client, no TLS bypass. Verify the returned User is the expected global platform owner. A decoded token alone is not session evidence.

Use that session to call `GET /api/platform/widget-release/<exact-tenant>/status`. The controller and writer verify the actual User/AuthSession in the database. Record the exact returned `version` (possibly `absent`), tenant, current enabled state and expiry. Never invent or derive the CAS from a historical report. Session issuance and status execution are deliberately not automated by this preparation pass.

## 4. Separate owner execution authorization

The owner signs exactly the production contract `maya.widget-release-production-authorization/2`, not a staging authorization. All fields below are mandatory:

| Field | Binding |
| --- | --- |
| `authorizationId`, `releaseId` | Fresh execution identity and identified release |
| `operation` | `grant` |
| `tenantId`, `environment` | Exact single authorized tenant; `production` |
| `candidateSha`, `buildDigest` | Exact newly certified source and running compiled bytes |
| `certificateDigest`, `evidenceDigest` | Canonical raw certificate hash; its reviewed evidence digest |
| `profileId`, `profileDigest` | Fixed `closed-input.no-handoff@1`; canonical fixed digest |
| `operatorId` | Actual authenticated global platform User |
| `approverId` | Same actual global User as operatorId and installed owner-key principal |
| `reviewerId` | Literal null; no reviewer or second self-signature |
| `governance`, `independentHumanReview` | Literal single-operator and false |
| `rollbackOwnerId` | Real designated rollback owner |
| `expectedVersion` | Current canonical status version |
| `notBefore`, `expiresAt` | UTC ISO instants; positive window of at most 24 hours |
| `grantExpiresAt` | Future instant, no later than authorization/certificate expiry and at most 24 hours after application |

The one real owner/operator signs the UTF-8 bytes returned by compiled `canonical(authorizationPayload)` using Ed25519 with no prehash. Wrap exactly `{payload,keyId,signature}`; signature is unpadded base64url (86 characters). Package the grant command as exactly `{authorization:<one signed owner wrapper>,certificate:<raw ProfileCertificate>}`. Changing a signed field or certificate requires a new owner signature. Keep signing material outside Git, chat and logs; the checker never generates keys or signs. No plan/trial grant or automatic renewal exists. The offline validation is:

```sh
node scripts/widget-release-operator.cjs check-command "$AR1_ENV_FILE" "$AR1_TENANT" "$AR1_CANDIDATE_SHA" "$AR1_SIGNED_COMMAND_FILE" "$AR1_PLATFORM_OPERATOR_ID"
```

This delegates to the **compiled canonical policy**, verifies current time/signatures/digests/operator binding, but cannot attest the real session, CAS or database. Next, under the separately authorized execution, POST the same command to `/api/platform/widget-release/<tenant>/validate` with that actual platform session. Require `dryRun:true` and the exact candidate/profile/version/expiry. Dry-run acquires/checks the existing authority locks without granting. It is not permission to bypass a later refusal. Only after the release execution authorization and all preflight checks may the operator POST the unchanged signed command to `/grant`. Retain its atomic `AuditLog` receipt, then reread status/effective feature and prove HANDOFF refusal. A timeout requires status/audit inspection; do not create a second authorization to guess success.

## 5. Revocation and expiry readiness

Keep the designated rollback operator/session and owner signer available for the window. Revoke uses a new owner-signed production authorization with `operation=revoke`, `grantExpiresAt=null`, a fresh authorization ID/window and the **current** entitlement version. Preserve exact stored candidate/build/certificate/release/profile/evidence bindings and designated identities. Submit exactly `{authorization:<signed wrapper>}` to `/revoke`; the canonical writer validates the stored release binding in its transaction and writes AuditLog atomically. The offline checker can validate revoke syntax/signature but cannot replace that stored-binding check. There is no revoke dry-run endpoint; do not send revoke to the grant-only `/validate` route.

After authorized revoke, status must be disabled and old widget tokens refused. Natural expiry also fails closed; no auto-renew. Revoke the entitlement before rolling the backend back to an artifact that cannot interpret this state. Retain the independent database/runtime rollback artifacts and the exact migration plan. Do not roll back unrelated production data. Readiness for this procedure is distinct from performing a grant/revoke or asserting an unobserved production result.

## Unified owner actions before execution

1. Confirm access to the existing global platform_owner account (not the salon tenant_owner). If credentials are unavailable, complete established account recovery outside this unit. Do not fabricate/promote an account or mint a session manually.
2. Supply one controlled Ed25519 signer's public key, key ID and fingerprint, with principal equal to that global User. Keep the private key in a secure signing location; no private secret belongs in Git or chat. If no signer exists, prepare it outside the repository after explicit owner approval.
3. Review the new exact candidate, fresh certificate evidence, tenant, runtime bytes, current CAS, max-24-hour window and rollback owner. Provide separate production execution authorization and the single V2 execution signature. No independent reviewer is required; absence of review is explicitly recorded.
4. For the later iPhone installation, connect/unlock the correct device and permit local developer access. Confirm the existing Apple development signing identity/profile is valid and covers that device. Renew expired provisioning through the actual Apple account owner; no silent certificate/profile generation during preparation.

After separate execution permission, the agent can capture backup/pre-state, validate trust configuration, apply only the certified pending migrations, deploy exact artifacts, obtain the actual canonical session using privately supplied credentials, perform health checks, dry-run/grant/revoke, sync/build and install as authorized. Passwords, private keys and token values must not enter chat or logs. Owner-controlled signing/interactive account access cannot be fabricated by the agent. Stop if any necessary external input is absent; technical certification alone does not mean READY for production.

Before execution, rehearse backup/restore, migration, canonical global login, trust validation, exact signed dry-run/grant/revoke/expiry/old-token refusal and packaging in an isolated test database with ephemeral keys. Real production state is read-only during preparation. Record all actual manual prerequisites in the release checkpoint and do not perform deploy, migration, grant, real OTP/provider effects or iPhone installation until separately authorized.

## Local inspection versus preparation with writes

`MAYA_DEPLOY_INSPECT_ONLY=1 bash maya-saas-backend/deploy/vps/deploy.sh`
performs **local source inspection only**: Git HEAD and backend working-tree status,
then exits before temporary files, build commands, relay probes, SSH, upload,
dependency installation or database access. No release stamp or credentials are
required. This does not qualify an artifact or inspect the actual target, migration
inventory, grants, backups or rollback. Combining inspection with preparation, or
using an invalid mode value, fails before work. The fake-command regression is:

```sh
node --test maya-saas-backend/deploy/vps/deploy-inspect.test.cjs
```

`MAYA_DEPLOY_PREPARE_ONLY=1` retains its documented incident-cutover semantics:
remote release files and fresh dependencies are written, **all pending migrations
are applied**, schema/drift checks and Prisma generation run, then it exits before
spare-port startup and public activation. It is not a dry run and must not be run
under read-only inspection permission. Before authorizing it, inventory and certify
the complete actual pending migration list; four known guest migrations do not
prove they are the only pending migrations. A local build is a separate action.

## Profile cutover and rollback order

Before replacing a runtime with a different profile digest, inspect the durable
current grant and CAS version. Revoke any active old-profile grant **on its matching
old runtime**, using a separately signed revoke authorization, exact original
candidate/build/certificate/release/profile/evidence bindings and current
`expectedVersion`. The authorization parser requires the running profile digest;
the writer also requires the original stored grant digest. A new runtime cannot
normally revoke an old-profile grant. Revoke does not require the running-build
certificate check that applies to grant.

Retain the atomic revoke audit/receipt and confirm the durable row is disabled.
`status.enabled=false` alone is insufficient: an incompatible profile can make the
policy view unavailable while the stored entitlement remains `enabled=true`.
Expiry is distinct from revocation. An unrevoked old grant may become effective
again if its runtime is restored inside its original validity window.

For rollback, first revoke the new grant **on the new matching runtime**, then
restore the recorded compatible artifact. Keep signer/operator availability for
both directions. Never cross the digest boundary first and assume revoke can be
performed afterward. A new grant/certificate needs its own exact candidate and
profile evidence; an old certificate or source hash is not a fresh runtime digest.

Before cutover or rollback, close admission of new guest POST attempts; retain
status GET, cookie scope and access to original in-flight Action Engine receipts
and reconciliation. UNKNOWN stays unknown: do not mint a replacement nonce,
resend create, clear the original intent or fall back to PHP booking. The retired
`create_record` relay remains 410. Restore a guest-compatible runtime and website;
otherwise keep admission closed for investigation.

Record actual previous artifacts/configuration references, encryption-key-reference
continuity and a rehearsed backup/restore procedure. A symlink rollback changes
runtime, not schema. Preserve encrypted history, AE/nonce/receipt state and retention;
no down-migration, source-constraint shrink or generic database restore over newer
effects. The stable/current chat codecs are structurally compatible, but rolling
back loses newer semantic continuity and fixes; source compatibility is not proof
of an operational rollback rehearsal. Recheck this against each actual release set.
