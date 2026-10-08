# Prepared actual Tesseract upload HTTP/current React proof

Status: **PREPARED, NOT RUN BY AUTHOR**. Scratch-only adaptation of the previous upload proof. No OCR, PG, Chrome, service, build or test process was started during preparation. Root owns the serial execution slot and supplies the reviewed candidate commit; the initial Tesseract code commit is `dc6684cba67659664910578ef96afe06781f7551`; the follow-up FIFO refusal fix is bound by the final native proof source hashes and will receive its own reviewed commit before launch. Neither SHA is hardcoded as an acceptance target.

Prerequisite: root's actual native Tesseract result `/tmp/maya-linux-ocr-20261008/actual-attempt3/actual-corpus.json` must be `passed`, evaluation `qualified`, source unchanged, actual spawned workers exited, with no model/provider/network calls. Its images come from `corpus-attempt2/manifest.json`. This harness must not run against the failed first attempt. No Vision binary/helper is required.

`bind-native-inputs.mjs` is a separate metadata-only step. It was run once for this revision after the parent supplied actual-attempt3 PASS; the fixed binding now exists and must not be overwritten. It verifies the exact native proof/source hashes, selected actual image hashes and pinned backend model SHA-256 values, then creates `fixed-input-hashes.json` exclusively. It does not execute OCR or any subprocess. The launcher refuses absent/changed binding before starting PG. If source changes after the native proof, rerun/qualify the native proof under root control; do not replace expected rows silently.

The actual AppModule uses `GOODS_PHOTO_OCR_PROVIDER=tesseract`, real PostgreSQL, existing auth/tenant/feature guards and production `GoodsPhotoParser`. Native executable and model assets remain the fixed paths selected by the production runner (`/opt/homebrew/bin/tesseract` on this arm64 Mac, `backend/ocr-assets/`). A plain call-through observer forwards actual `spawn` arguments/result unchanged and records only native PID, completion, bounded output lengths and stdout hash. It does not provide text/rows or replace parser logic. The observer checks the real fixed arguments and environment. Direct native corpus remains the evidence for actual word-level output.

Setup uses one synthetic owner/tenant and active synthetic CRM metadata, explicitly not A17/provider connection acceptance. All model decisions and provider/external fetches fail closed. No chat POST, goods search/detail, review, approval or widget intent is admitted. Runtime counters and write recorder assert zero AE, approvals, C9 work, attachments/messages, outbound and other business writes. Synthetic setup/auth/revocation writes are separately allowed.

Before UI, an unauthenticated actual HTTP upload must return 401, no rows and zero native workers. The six current React checkpoints are:

1. `opened`: real email debug login, settled image picker, zero uploads/workers.
2. `uploaded`: actual `ru-fractions-dot.png` → exact prior qualified native rows; all review flags, confidence/price meaning null; uncertain unit renders `единица: не определена`.
3. `changed`: explicit clear/reopen and `ru-changed-pixels.webp` upload → exact changed rows; previous rows disappear, no automatic matching.
4. `unsupported`: actual `unsupported-price-header.jpg` → HTTP 400 `goods_photo_ocr_table_unsupported`, descriptive UI refusal, no rows.
5. `malformed`: incomplete PNG → decoder HTTP 400 `goods_photo_image_invalid`; no extra native worker.
6. `revoked`: fixture membership suspended after the malformed acknowledgement; next explicit upload returns 401/403, no rows/worker/retry. This is pre-request revocation, not an instrumented in-flight race.

Exactly three native workers are expected: uploaded/changed/unsupported. Five explicit browser uploads plus one denied anonymous HTTP request. There is no source image persistence beyond synthetic evidence, no model/CRM/AE call, no reload/restart claim and no receipt preparation. HTTP-only mode uses each actual file's MIME type; browser mode uses the real file picker. No synthetic row/parser/decoder response is injected.

Root static commands, from backend cwd (not run by author):

```sh
node --check /tmp/maya-linux-ocr-20261008/http-carrier-harness/native-proof.mjs
node --check /tmp/maya-linux-ocr-20261008/http-carrier-harness/bind-native-inputs.mjs
node --check /tmp/maya-linux-ocr-20261008/http-carrier-harness/actual-ocr-browser.mjs
node --check /tmp/maya-linux-ocr-20261008/http-carrier-harness/actual-ocr-browser-guard.mjs
node --test /tmp/maya-linux-ocr-20261008/http-carrier-harness/actual-ocr-browser-guard.test.mjs
node --max-old-space-size=2048 node_modules/typescript/bin/tsc --project /tmp/maya-linux-ocr-20261008/http-carrier-harness/tsconfig.proof.json --noEmit --incremental false
```

After the native proof passes and current React is built by root:

```sh
node /tmp/maya-linux-ocr-20261008/http-carrier-harness/native-proof.mjs --run --browser --expected-commit=<full-reviewed-commit> --output=/tmp/maya-linux-ocr-20261008/http-browser-attempt1
```

The launcher performs no build. Output must be new. One fresh owned loopback PG cluster, `nodeHeapMb:3072`, one Jest worker, PostgreSQL 64 MiB shared buffers / 4 MiB work_mem / 30 connections, outer stage 300 seconds. Existing owned process-group supervision, TERM/KILL cleanup, explicit PG stop and loopback fence remain. Chrome owns a temporary profile, bounded CDP launch and finite page/API guard. No existing services/DBs are stopped. `realpath` entry guards handle macOS `/tmp` correctly. Runtime/backend source, model assets, actual native binary, scratch inputs, current React source/dist and native evidence are hashed at launch and checked after the run.

Outputs: `manifest.json`, `source-hashes.json`, archived `harness/`, `browser-jest.json`, `actual-ocr-http.json`, `output/playwright/browser.json`, and six screenshots. Auth bodies/tokens/OTP are never published. A future PASS qualifies actual local Tesseract through current React/HTTP on synthetic images only. It does **not** qualify Linux execution, production/deployment, real documents/general invoices, A17/YCLIENTS permissions or C10 completion. Linux packaging exists separately; an actual Linux build/run remains open.

Revision 1 was preserved byte-for-byte (all 13 files, including its native-attempt2 binding and freeze) in `../http-carrier-harness-attempt1-provenance`. HTTP/browser had never run against it. This working revision binds actual-attempt3 after the bounded FIFO-open fix and additionally rejects non-string email verification codes before regex coercion; its guard test includes array/number/null/object negatives. Parent reported initial harness static gates passed before this delta. Final revision gates remain root-controlled; no PASS is inferred here.
