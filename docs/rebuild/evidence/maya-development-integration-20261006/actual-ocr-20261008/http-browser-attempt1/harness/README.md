# Prepared upload-only actual OCR HTTP/current React proof

Status: **PREPARED, NOT RUN BY AUTHOR**. No PG/browser/build/test process was started while preparing these files. Root owns static checks and one serial execution slot. Base HEAD expected by parent: `9553c6beb946f7122e446bd8afc97848d1220287`; dirty runtime and current built React bytes are hashed at launch and must remain unchanged through cleanup.

Native prerequisite is pinned to `/tmp/maya-actual-ocr-20261008/actual-attempt3/actual-parser.json`, status passed, actual production parser + Vision, two changed pixel tables. `fixed-input-hashes.json` pins that result, its source-hash record, Swift source/build helper, compiled native binary and the exact Russian/changed/blank images. The fixture checks every native prerequisite source hash again before running. No replacement parser, native worker, decoder or OCR rows are installed. Expected HTTP rows are taken from the already qualified native result, including its literal recognized unit `шТ`; presentation must preserve that value. General Russian invoice accuracy is not claimed.

## Scope

Existing `bootFixtureContext` + `bootHttp` + `fixturesForHttp`; actual AppModule, auth/tenant/feature guards and real PostgreSQL. Seed one synthetic external-calendar tenant, owner, existing features and one active synthetic CRM integration, as in the previous photo proof. Configure actual DI `GoodsPhotoParser` via `GOODS_PHOTO_OCR_PROVIDER=apple_vision`. Assert its parse method and native spawn are not Jest mocks. No production parser spying or artificial pause is installed.

The only goods endpoint admitted by the browser guard is `POST /api/ai/goods/photo-preview`. All external/provider fetches and model planning are fail-closed. Search, item detail, receipt review, widget intent and chat POST are forbidden. Every checkpoint verifies unchanged AE, approvals, C9 work, attachments, team messages and outbound counts plus the existing recorder's forbidden business-write families. Intentional setup/auth/membership-revocation fixture writes are not presented as globally zero DB writes.

Six checkpoints:

1. `opened`: authenticated actual React image picker, no goods request.
2. `uploaded`: Russian synthetic pixels through the real configured parser; exact HTTP rows and actual visible names, quantity, unit, price and separate total. No line selection/matching.
3. `changed`: explicitly clear/open/upload changed pixels; exact new rows replace old ephemeral rows.
4. `blank`: actual blank image → HTTP 400 table unsupported and the descriptive five-header UI error, no lines.
5. `malformed`: a PNG signature with incomplete bytes passes the shallow transport signature and is rejected by the actual decoder, HTTP 400/image-invalid UI; no rows.
6. `revoked`: parent suspends this fixture membership after the malformed checkpoint acknowledgement; next explicit upload returns 401/403 without lines, visible bounded session/permission failure. This proves **pre-request** revocation, not an instrumented in-flight race.

Each upload is explicit and sent once. There is no receipt preparation, approval, AE or provider call, no reload/restart claim, no source photo retention beyond the synthetic evidence files. There is no parsed-buffer wipe observation hook here; that property remains covered by the existing backend tests. Browser output includes real DOM snapshots, PNG screenshots and sanitized method/path/status network observations, never auth bodies/tokens/OTP.

## Root static checks (not executed here)

From the backend directory:

```sh
node --check /tmp/maya-actual-ocr-20261008/http-carrier-harness/native-proof.mjs
node --check /tmp/maya-actual-ocr-20261008/http-carrier-harness/actual-ocr-browser.mjs
node --check /tmp/maya-actual-ocr-20261008/http-carrier-harness/actual-ocr-browser-guard.mjs
node --test /tmp/maya-actual-ocr-20261008/http-carrier-harness/actual-ocr-browser-guard.test.mjs
node --max-old-space-size=2048 node_modules/typescript/bin/tsc --project /tmp/maya-actual-ocr-20261008/http-carrier-harness/tsconfig.proof.json --noEmit --incremental false
```

## One root-controlled browser + real HTTP run

The parent reports actual Vision recognition requires the approved system execution context on this Mac; the ordinary restricted context failed with GenericObjCError. Do not weaken assertions, substitute rows or retry invisibly. Root must use its explicitly authorized execution context. Shell dist has been built; root will build the current React web bundle before launch (the earlier carrier gate was typecheck only). The launcher deliberately performs **no build** and includes the actual resulting web dist bytes in the launch/end hash check.

```sh
node /tmp/maya-actual-ocr-20261008/http-carrier-harness/native-proof.mjs --run --browser --expected-commit=9553c6beb946f7122e446bd8afc97848d1220287 --output=/tmp/maya-actual-ocr-20261008/http-browser-attempt1
```

Run from `/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration/maya-saas-backend`. Output must be new. There is **no synthetic-approve flag**. A non-browser HTTP-only mode exists by omitting `--browser`, but the requested single browser mode already runs all five real HTTP uploads.

The reduced launcher retains only the previous owned-cluster init/start/create/migrate steps, then one single-worker Jest stage. It uses the existing proof environment and dedicated random loopback PG cluster, owned process-group supervisor and Node loopback fence; it stops only its own cluster and records cleanup. The database name retains the exact existing helper guard prefix `maya_widget_gate_proof_c9occ_` followed by 12 random hexadecimal characters; it is still a new database in this launcher's own new cluster. Fixed native inputs are checked before starting. No global PID discovery, existing database or service shutdown is used. Native framework global egress is not established by the Node TCP fence; do not convert this scoped guard into a system-wide egress claim.

Expected outputs: `manifest.json`, launch-time `source-hashes.json`, archived `harness/`, `browser-jest.json`, `actual-ocr-http.json`, `output/playwright/browser.json` and six named screenshots. PASS remains **actual local synthetic image OCR through current React/HTTP**, not real documents, general invoice accuracy, A17 connection, YCLIENTS receipt rights, deployment or C10 completion.
