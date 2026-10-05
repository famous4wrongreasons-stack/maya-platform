<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 8853c4ce44cab0b1c3a04e842e82681f779e104b752fedb1666397b4a5289cca -->

# Controlled production release — pre-deploy STOP

Candidate: `76df1766a74212f2c8a06ab879386fc8e4468d73`.
Profile: `closed-input.no-handoff@1`.
Owner authorization: current conversation, 2026-10-03, exact candidate and owner's tenant only; no source/runtime byte changes; no real SMS, successor binding or YCLIENTS effects.

## Completed preparation

- Clean exact Git HEAD. All 2,766 files in the four certified artifact trees match. All 149 referenced certification receipts match their recorded hashes. The original certification records are unchanged.
- Read-only production transaction identified one active tenant-owner membership: tenant `cmsuavtar0003bjyrfngxsne6`, slug `muzhskaya-estetika-3`, owner User `cmsuavtfr0008bjyrkcyu7gep`. No `widgets.runtime` entitlement row exists for that tenant.
- Production remains `/opt/maya-saas/releases/20260929-recon-fix-eb43bc22`. Health and readiness returned HTTP 200 before and after preparation. Full deployed Git SHA is not independently attested; the authorized candidate has NOT been deployed.
- Migration history matches candidate checksums plus the existing acknowledged historical baseline. Exactly two candidate migrations are pending: `20260929190000_client_link_challenge_json_v2` and `20260930120000_journal_detail_retained_date`. Neither was applied. No unknown checksum, unfinished migration or new history mismatch was observed. Full post-migration structural validation has not run.
- Private VPS backup created at `/opt/maya-saas/backups/controlled-76df1766-20261003`: database custom archive, complete previous backend release, service definition, environment and previous-current pointer. Directory mode 0700; six payload files mode 0600. Archive readers and independent rehash passed. A real restore was not performed. SSH lost its response after backup creation; read-only inspection recovered the completed manifest, and a separate rehash verified it. No retry overwrote the backup.
- R3 archive discovered in the existing off-root `legacy-bundle-archive`. Canonical archive validator passed: 45 files; all five required archived entries and the exact historical rollback manifest present. No archive bytes were copied or restored. The missing default pointer is resolved operationally via the already-supported operator-local archive selector; it is not a remaining blocker.
- Xcode device inventory sees the paired `iPhone Mo`. No build, sync, install or launch was attempted after the release blockers were established.

## Exact blockers

### REL-1 — R01 manifest and committed AASA configuration disagree

The unmodified mandatory production relay gate fails at `validateObserved`, line 97:
`Unreconciled local routing/handler configuration`.

The only unregistered routing file is `/home/m/mocine3388/mayaos.ru/public_html/.well-known/.htaccess`.
Its SHA-256 is `ab3175467446655265bcaf284c3d7d9447825a3f4801999996e62bd90e5dd251`.
It exactly matches the existing candidate source `maya-saas-backend/deploy/platform/beget-edge/well-known/.htaccess`, introduced by `aecd770b91e94b74b26f76f6dc9e69775dc6bcab` for Apple Universal Links.
It supplies the AASA JSON content type and cache header. The certified `relay-release-manifest.json` does not register it.

All registered file hashes, public roots and PHP inventory match; no unexpected symlink or scan error was observed. This does not waive the unregistered routing file. Full live denial probes were not reached by the official failed gate.

Smallest proposed correction, NOT IMPLEMENTED: register this exact existing routing source and hash under `hosting_config` with its `committedSource`, preserving whole-root discovery, three-way equality and all refusal rules; prove unknown routing and altered AASA configuration still refuse. Do not delete the live AASA rule to make the gate green. This changes the candidate manifest and therefore needs a separately authorized correction and the applicable fresh certification before release.

### REL-2 — Production signing and operator prerequisites are not provisioned

Production has no `WIDGET_RELEASE_PRODUCTION_TRUST_JSON`, no production tenant allowlist and no widget release candidate/environment settings. These settings select the exact production path but do not replace the required signatures.

The current active global platform-owner User is `cmrqx5xva002eohyru7djyogq`; it has zero non-revoked, non-expired global AuthSessions. The tenant owner's role is not release authority and was not widened.

The existing certificate deliverable is an **unsigned synthetic proposal**, explicitly marked unsigned and never an execution authorization. Production needs an independently attested and security-signed production certificate, separately owner-signed exact release authorization, trusted keys with actual named principals, current platform operator login, exact-tenant allowlist, CAS and bounded timestamps. None were fabricated or issued.

The owner has authorized execution in this conversation. What is missing is the operational independent reviewer/signing path and current operator session, not another repetition of the same owner release consent. A concise question requesting the reviewer and established signing path was sent; no response had arrived when this checkpoint was written. No private key/password should be sent in chat. Do not invent reviewer identities or generate both approvals as a substitute for independent review.

### REL-3 — Default carrier packaging does not deliver the certified AChat payload

- `maya-ios-carrier/capacitor.config.json` selects `../maya-chat-shell/dist/capacitor`.
- `maya-ios-carrier/package.json` sync first rebuilds that shell, then runs Capacitor sync.
- The requested certified AChat payload is `maya-carrier-react/dist/capacitor`. Running the default sync would select a different artifact. No alternate packaging was improvised.
- The exact `maya-carrier-react/dist/web` contains three files. The canonical static-shell candidate validator refuses it with `A shell release input needs exactly one web app manifest`; its source HTML also has no manifest link. The existing old shell manifest/icons do not automatically constitute an admitted AChat release package.

Smallest proposed correction, NOT IMPLEMENTED: establish one canonical packaging route for the React AChat web/Capacitor outputs, include the approved PWA identity/manifest/icon assets and source linkage, point native sync to the same certified carrier target, and prove the actual packaged web and native payloads. Preserve presentation design and existing authentication/authority behavior. Do not rebuild an old shell or overwrite another certified artifact tree to hide the mismatch. Any required source/config/runtime-byte change must be explicitly authorized and certified on a new exact SHA. No claim is made that current browser parity tests certify the native packaging path.

## Release checkpoint

```yaml
PRODUCTION DEPLOYED SHA: NOT DEPLOYED
CURRENT PRODUCTION RELEASE: 20260929-recon-fix-eb43bc22
MIGRATIONS APPLIED: 0
MIGRATIONS PENDING: 2
BACKEND HEALTH: PASS — existing production
READINESS: PASS — existing production
RECONCILIATION: NOT RUN — new candidate not deployed
WEBHOOKS: NOT RUN — new candidate not deployed

PROFILE EFFECTIVE: NOT GRANTED
PROFILE EXPIRY: NONE
HANDOFF REFUSED: CERTIFIED LOCALLY — new production check not run
REVOKE READY: CODE CERTIFIED; operational signatures/session not provisioned
BACKUP: PASS — private archives and hashes verified; restore not exercised

PWA: NOT DEPLOYED — packaging gate fails
IOS INSTALLED: NO — default sync target mismatch
LOGIN: NOT RUN
ACHAT: NOT RUN
NORMAL CHAT: NOT RUN
VOICE: NOT RUN
READ-ONLY WIDGETS: NOT RUN

CERTIFIED BYTES MATCH PRODUCTION: NO — candidate not deployed
LOCAL CERTIFIED BYTES UNCHANGED: YES
READY FOR OWNER-CONTROLLED REAL OTP + BOOKING: NO
EXACT BLOCKERS: REL-1, REL-2, REL-3
```

## Effects and certification boundary

Only authorized private backup files were created on the VPS. No production runtime/configuration switch, migration, DB data mutation, entitlement grant, external business effect, OTP, Client successor, YCLIENTS call, device install, website work or Chapter 10 work occurred. Existing production environment hash and release pointer remained unchanged. HANDOFF global STOP and the fixed profile contract are unchanged.

The prior exact-candidate test certification remains recorded as issued. This fresh operational preflight fails; test certification must not be represented as a successful production release or ready-to-execute production package. Stop before fixing candidate bytes and before all restricted effects.
