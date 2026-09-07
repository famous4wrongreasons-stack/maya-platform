# Wave R-A — R01 local acceptance

Accepted baseline: `45688886`. Exact package: **R01 = B38, B39, B54**. This report records package-local implementation/proof; the wave coordinator owns mandatory aggregate gates, deployment and production verification. It does not reopen the completed inventory.

`R01 LOCAL ACCEPTANCE: PASS`

`CANONICAL OWNER: existing Client/profile authority + Appointment Action Engine`

`NEW MODELS: 0` / `NEW FIELDS: 0` / `NEW ACTION CLASSES: 0`

`MIGRATION REQUIRED: NO` / `BACKFILL REQUIRED: NO`

The approved fail-closed option retires guest PHP `create_record` and native raw Telegram Client authority. Personal Client history, profile/contact changes, direct booking/cancellation, freed-slot actions, and stale booking callback cards return a static handoff to the existing verified MAYA entry. Native raw chat identity can no longer be exchanged for an integration-system Appointment principal in either the Python bridge or Nest origin allowlist. No Client principal or binding is fabricated. The `cmd_start` retirement also removes legacy `app_*` session issuance shared with R02/B41.

The two PHP `create_record` aliases return HTTP 410 with `accepted=false`, `success=false`, `retry_allowed=false` and no business receipt. Eleven inventoried raw create call sites across all six PWA variants are retired. Three existing public Next booking bundles are covered by their shared PHP admission boundary. All known aliases, including backup/test paths, are included; no directory or filename exemption was added.

Both active B54 relays preserve the exact supplied `Idempotency-Key`, including its browser CORS declaration. Missing keys are not invented. Duplicate, malformed, conflicting or multiline header values fail before forwarding. Existing B31 behavior when the caller omits a key remains unchanged; no browser pending-key system or duplicate-booking policy was introduced. The canonical authenticated PWA route still forwards its request and supplied key to the existing transport. B32/B33 verified channel confirmation paths remain unchanged.

Evidence: [`evidence/package5-wave-ra-r01-implementation-proof.json`](evidence/package5-wave-ra-r01-implementation-proof.json).

| Proof | Result |
|---|---|
| Package/foundation Jest suites | 10 suites, 130 tests PASS |
| Actual native handler ASTs with dependencies trapped | 6 tests PASS, nested in the guard; separately PASS against an R01-only baseline projection |
| Actual PHP pure source slices on PHP 8.4 with application/network/file effects disabled | 48 checks PASS |
| Existing B31 compiled HTTP/AI + actual Action Engine + new owned PostgreSQL | PASS: exact Client/tenant, denied missing/revoked/wrong authority, concurrent winner, intent conflicts, new-process restart and cross-process race |
| Existing B32 signed channel proof + actual Client resolver/policy/Action Engine + new owned PostgreSQL | PASS: internal/CRM × with/without Maya User, eight concurrent requests per scenario, rejected changed intent, UNKNOWN/reconciliation preserved |
| Exact deployment candidates | 10 registered targets PASS; eight bounded source transformations plus two canonical relay candidates |
| Targeted lint / diff whitespace | PASS / PASS |

PostgreSQL proofs use only the new wave-owned `maya_ra_r01` database, after its 83-migration clean replay. Provider adapters are synthetic. No protected old database is used. The existing UNKNOWN proof demonstrates one provider dispatch and the same durable execution across replay; changed intent conflicts and never starts another operation.

Permanent guards execute every retired native leaf and stale Client callback with dependency traps. The PWA guard rejects provider/profile/raw-phone calls before refusal and any raw `create_record` transport. PHP denial bodies must remain the exact provider-free refusal. The deployment checker requires every registered target, rejects unknown or duplicate aliases regardless of directory/name, pins candidate bytes, and validates the complete bounded before/after transition. Adversarial tests inject writers before denial/delegation and prove rejection.

Deployment provenance is recorded in [`evidence/package5-wave-ra-r01-overlay-manifest.json`](evidence/package5-wave-ra-r01-overlay-manifest.json). PHP candidates were regenerated from root-captured exact live source, preserving configuration bytes outside bounded changes. Earlier inventory PHP copies were redacted and are not publishable artifacts. Only bounded patches and hashes enter Git. The four exact source slices and entire PHP fixture are byte-identical to the successful 48-check fixture; the earlier superglobal-naming fixture error is corrected.

R01-only staging contents for shared `bot.py` and `app.html` are reconstructed from `45688886`. Their hashes and precise shared-function ownership are in [`evidence/package5-wave-ra-r01-hunk-ownership.json`](evidence/package5-wave-ra-r01-hunk-ownership.json). R02 PWA auth helpers and staff prefixes are excluded from those staging contents and compose separately at cutover. No R01 changes were made to `claude_ai.py`, `database.py`, `memory.py`, or `webhook_server.py`.

`B36 SCHEMA: APPLIED` / `B36 RUNTIME: NOT DEPLOYED`

`B36 PROOF DEFECT 1: IDEMPOTENCY KEY` / `B36 PROOF DEFECT 2: CONCURRENT WRITE CONFLICT`

B36 code is untouched. The wave coordinator preserves its existing production function while preparing the release projection.

`PRODUCTION MUTATIONS/MESSAGES: 0`

`PROCESS HYGIENE: 0`

`PACKAGE 5 COMPLETE: NO`

`CHAPTER 6 COMPLETE: NO`
