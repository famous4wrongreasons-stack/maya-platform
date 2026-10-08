# Actual local OCR proof — prepared for parent serial run

Run from `maya-saas-backend` only after the reviewed helper is compiled and runtime files are frozen:

```sh
node --max-old-space-size=512 /tmp/maya-actual-ocr-20261008/actual-parser-proof.mjs --run --output=/tmp/maya-actual-ocr-20261008/actual-attempt1
```

The output must be new. This script generates actual Russian/English synthetic PNG pixels through the installed sharp SVG renderer, then calls the unchanged production `GoodsPhotoParser(new ConfigService({GOODS_PHOTO_OCR_PROVIDER: 'apple_vision'}))`. It does not inject OCR words, rows, worker responses or parser results.

The only process observer calls the original Node `spawn` with unchanged arguments/options and returns the original child; it captures bounded actual stdout words, PID/count, exit state and hashes. Network fetch/socket calls are refused. The helper/production source/binary hashes are captured and must remain unchanged.

Expected: 4 serial native workers (Russian, changed Russian pixels, English, blank). A second parse called immediately while the first is pending must throw `goods_photo_ocr_busy` synchronously and start no worker. Changed pixels must change actual words and rows. Blank images produce no words and an exact table refusal. Malformed bytes refuse before a worker. Names, decimal strings, quantity and units must match actual rendered table cells; `price_kind` and row `confidence` remain null.

Evidence: `actual-parser.json`, `source-hashes.json`, synthetic `fixtures/*.svg`, `fixtures/*.png`, `fixtures/manifest.json`. Actual words are safe synthetic evidence only. This is no HTTP/current React/PG/real-document/deployment acceptance. No OCR, generator, test or service was run by the preparing agent; root controls the first invocation.
