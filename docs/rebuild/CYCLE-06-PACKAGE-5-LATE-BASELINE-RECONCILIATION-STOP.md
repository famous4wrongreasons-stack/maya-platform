# Package 5 — late baseline reconciliation: runtime PASS, overlay replay STOP

**The live relay change in `7ee1e670` is compatible with the existing runtime contracts. The combined repository baseline is not certified: that same commit corrupts two documented R01 deployment replay patches. No automatic correction was made. Stage 2 Owner Decision Pack consolidation did not start because its explicit prerequisite was not met.**

Accepted checkpoint: `38010d6037ae8fa41410b73de9a82e94e5e92cf4`. Isolated worktree `/tmp/maya-b29-contour`, branch `contour/b29-remediation`, was clean; fetch passed; HEAD equalled `origin/codex/maya-brain-systemic-release-20260815`; unpushed commits and dirty files were zero. Main 24 entries and 22 file hashes, and 86 protected inventory/schema hashes, remain unchanged. The 17 old databases were not opened. There were no production business/provider/message effects, deployments, runtime changes or schema changes.

Evidence: [reconciliation record](evidence/package5-late-baseline-reconciliation.json), [reproducible pure PHP/parser proof](evidence/package5-late-baseline-php-replay.proof.py), [exact alias proof](evidence/package5-late-baseline-alias.proof.cjs). The earlier [late baseline STOP](CYCLE-06-PACKAGE-5-WAVE-R-B-LATE-BASELINE-STOP.md) and historical R-A/R-B production evidence remain intact.

## Exact upstream delta

`7ee1e670ed4fc503c632d2fc200c34dccd1561f8` has parent `60e8266473882fac12fca7fe4181b6e5344b29ce`, the certified R-B precutover source checkpoint. It changes exactly five files, with 21 insertions and 9 deletions. The preserving merge and accepted checkpoint retain the exact upstream versions of all five files.

| File | Exact change |
| --- | --- |
| `maya-saas-backend/deploy/platform/beget-edge/maya-platform-api.php` | Removes `: ?string` from the idempotency helper and replaces `??` with nested `isset` selection. |
| `сайт и приложение/maya-native-api.php` | The same helper-only change. |
| `maya-saas-backend/deploy/platform/beget-edge/r01/mayaos__maya-platform-api.php.patch` | Changes the helper inside the historical insertion hunk, adding two lines without updating its declared size. |
| `maya-saas-backend/deploy/platform/beget-edge/r01/salon__app__maya-native-api.php.patch` | The same malformed hunk change. |
| `maya-saas-backend/src/crm/client-initiator-boundary.architecture.spec.ts` | Renames the two relay checks and adds assertions forbidding the incompatible nullable return declaration and `??` in the helper. Existing assertions remain. |

For both complete PHP source files, all bytes outside the helper are identical to the certified parent. No endpoint, host, identity resolver, database writer, provider call, action class, delivery executor or compatibility fallback is added.

## Nine production aliases

Fresh read-only hashes confirm the same exact 8/9 split recorded at the prior STOP. All nine agree with the expected combination of certified R-B artifacts and the one independently published upstream MayaOS relay. Full paths and SHA-256 values are in the evidence record.

| Alias | Against certified R-B | Current SHA-256 prefix |
| --- | --- | --- |
| `salon/app/index.html` | MATCH | `880284791552` |
| `mayaos/app/index.html` | MATCH | `60725476b5c6` |
| `salon/app/index.codex-loyalty-20260721.html` | MATCH | `a1bb94b63310` |
| `salon/app/index.backup-20260731-anton-analytics.html` | MATCH | `22b10b211fbb` |
| `salon/app/tenant-test.html` | MATCH | `fb65dff693ad` |
| `salon/app/api-proxy.php` | MATCH | `2975dbe637fd` |
| `salon/app/api-proxy.codex-loyalty-20260721.php` | MATCH | `0f97f76f3de0` |
| `salon/app/maya-native-api.php` | MATCH | `91429681ea31` |
| `mayaos/maya-platform-api.php` | CHANGED; exact `7ee1e670` source | `0f33e067495b` |

The changed MayaOS hash is `0f33e067495b40ab64b91e4aa1eb179f7403903ccc404bac1872e025671dfb50`; the certified prior hash was `ca9e7bd28fd62822816cc9eacf21f06db401740e376dd03c2c5f594799c40d46`. The salon relay was not independently replaced even though its repository source changed. This observed deployment distinction is retained; no attempt was made to synchronize or overwrite either live relay.

## Runtime contract assessment and proof

| Concern | Result |
| --- | --- |
| Production-reachable behavior | PHP 5.6 syntax compatibility changes: the old full sources fail its parser, and the new sources pass. Once parsed, the changed helper preserves the same header result/refusal. CLI evidence does not establish the configured web SAPI version for each site. |
| Authority / identity / tenant / Client | Unchanged. Header forwarding does not grant authority. Canonical backend authentication, verified Client binding and exact ownership remain authoritative. |
| Business mutation / provider calls | Unchanged. No new direct writer or provider call. Fixed canonical backend upstream and the existing single transport call remain. |
| Delivery / admission / UNKNOWN | Unchanged. No delivery route, new execution, retry or fallback is introduced. Existing response status/body handling remains byte-identical. |
| Routing / compatibility | Only PHP syntax compatibility changes. Hosts, paths, methods, CORS, redirects, TLS checks, authorization forwarding and request/response transport outside the helper are unchanged. |
| Idempotency | Same exact opaque key or same refusal. No normalization, regenerated identity or changed-intent retry path. |
| Inventory membership | Existing R01/B54 relay transport, within already inventoried S02/S03/S05. B38 alias refusal remains protected. No new Bxx or production surface. |
| Package 4 value owners | No changed Package 4 owner, value operation or provider path. |

Executed proofs:

- **PHP header contract: PASS.** 631 cases per relay, each evaluated against the old PHP 8.4 helper, new PHP 8.4 helper and new PHP 5.6 helper: 3,786 expected-result comparisons. Cases include case variants, absent/null values, SAPI fallback, conflicting and duplicate headers, non-string values, empty strings, CR/LF, Unicode and long opaque values. Only exact extracted pure helpers execute; no application imports, network calls or database connections occur in those fixtures.
- **Full PHP syntax: PASS for both new sources on PHP 5.6.40 and 8.4.6.** Both old sources fail PHP 5.6 as an expected negative control and pass PHP 8.4. Full sources are syntax-checked only, never executed.
- **Nine exact alias checks: PASS.** Fresh production hashes match the locally checked exact artifacts; existing R01 refusal guards run over all five HTML aliases and both legacy create PHP proxies. Both relay byte identities and boundaries are checked separately.
- **Targeted regression and relevant architectural ratchets: 5 suites / 32 tests PASS.** `client-initiator-boundary.architecture`, `legacy-staff-principal.architecture`, `client-booking-idempotency.architecture`, `ai-invocation-receipt.architecture`, and `client-channel-appointment-create.service`.
- **Production structural readback: PASS.** The R-B release, 101 Python files, 594 compiled backend files, VPS PWA, scheduler flags, environment flags, service states and PIDs are unchanged. Health/readiness return 200. Pending migrations: 0; schema drift: NONE. B36 schema and zero populated B36 runtime bindings remain as recorded.

This is a targeted reconciliation, not a new Package 5 Final Gate or full backend recertification.

## Exact unresolved conflict — documented R01 overlay replay

The R01 overlay manifest explicitly states:

> Zero-context unified diff; apply with git apply --unidiff-zero. Candidate bytes unchanged.

Source: [R01 overlay manifest](evidence/package5-wave-ra-r01-overlay-manifest.json). The approved Stage 1 report also requires ratchets for **all inventoried aliases and overlays, with no backup-file exemption**: [R-A Stage 1](CYCLE-06-PACKAGE-5-WAVE-R-A-STAGE-1-ASSESSMENT.md).

Both changed patches still declare `@@ -69,0 +70,29 @@`, but now contain **31 inserted lines** in that hunk. Both fail parsing before any target file could be modified:

| Patch | Certified parent parse | Current parse / read-only apply check |
| --- | --- | --- |
| `r01/mayaos__maya-platform-api.php.patch` | PASS, exit 0 | FAIL, exit 128: `patch fragment without header at line 38: @@ -71 +100 @@` |
| `r01/salon__app__maya-native-api.php.patch` | PASS, exit 0 | FAIL, exit 128: `patch fragment without header at line 38: @@ -75,0 +105 @@` |

The recorded relay candidate hashes still describe the old R01 outputs, while the changed patch payloads describe different PHP bytes. Historical hashes are not rewritten to pretend the prior proof covered new bytes.

The already deployed publisher uses staged whole-file artifacts with before/after hashes; it does **not** execute these patches. Consequently this defect is **not evidence of a live business-authority violation or an outage**. It does, however, break the repository's explicit reproducible-overlay contract. It cannot be dismissed as an inert review-only artifact while the accepted manifest still instructs executable replay.

The existing Jest ratchet checks the registration list, hashes' shape, patch additions and dangerous statements; it does not parse/apply the archived hunks. Its 32 passing targeted tests therefore do not certify that missing property. The added upstream PHP syntax checks do not catch this defect.

**STOP boundary:** the user explicitly requires an exact conflict report rather than automatic repair when the upstream change conflicts with an approved contract. No patch, manifest, runtime, schema or production file was repaired, reverted or reset. Reconciliation requires an upstream-preserving, coherent overlay replay/evidence resolution before the combined baseline can be certified. This is an existing R01/B54 artifact issue, not a new owner/schema decision and not a newly discovered production surface.

## Stage 2 and retained accounting

The eight prepared Decision Sheets are retained unchanged. They were not consolidated or presented for approval in this checkpoint because the user allowed Stage 2 **only after** combined-baseline certification. No approval block or new production-wave plan is issued past this explicit STOP. Existing dependency definitions and all historical remediation counts remain unchanged.

```text
LATE BASELINE CHANGE: RUNTIME COMPATIBLE; R01 OVERLAY REPLAY CONFLICT
COMBINED BASELINE CERTIFIED: NO
INVENTORY DEFECT: NO
NEW PRODUCTION SURFACES: 0
NEW BLOCKER IDS: 0
PACKAGES COMPLETE: 6/14
PACKAGES REMAINING: 8/14
BLOCKERS REMEDIATED: 10/24
BLOCKERS REMAINING: 14/24
OWNER DECISIONS PRESENTED: 0/8 — STAGE 2 NOT STARTED
PROPOSED NEXT REMEDIATION WAVES: NOT COMPUTED — STAGE 1 STOP
WAVE R-C: NOT PROPOSED IN THIS CHECKPOINT
WAVE R-D: NOT PROPOSED IN THIS CHECKPOINT
B36 SCHEMA: ALREADY APPLIED
B36 RUNTIME: NOT DEPLOYED
B36 DEFECT 1: IDEMPOTENCY KEY
B36 DEFECT 2: CONCURRENT WRITE CONFLICT
B36 REPEAT SCHEMA MIGRATION: NO
PACKAGE 5 FINAL GATE RUN: NO
PACKAGE 5 COMPLETE: NO
CHAPTER 6 COMPLETE: NO
CHAPTER 7 STARTED: NO
PRODUCTION MUTATIONS/MESSAGES FOR PROOF: 0
PRODUCTION PROVIDER EFFECTS FOR PROOF: 0
DEPLOYMENT: NO
PROCESS HYGIENE: 0
```

The pre-edit checkpoint equalled origin. This report, evidence and current-ledger hold clarification are the only commit scope; post-push HEAD/origin equality is verified separately. No runtime implementation has resumed.
