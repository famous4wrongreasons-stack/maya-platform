# Independent actual local OCR proof review

**Qualified PASS:** `actual-attempt3` demonstrates unchanged production `GoodsPhotoParser` → compiled native Apple Vision → deterministic rows from actual synthetic image pixels. It closes the injected-extractor gap for these narrow RU/EN table fixtures. It is not HTTP/current React, representative-document quality, provider receipt or deployment acceptance.

Read/hash/source inspection and viewing existing synthetic PNGs only. This reviewer ran no OCR, generator, test, compiler, app, PG, network or escalated action and edited no repository file.

## Exact binding

All **11** final `source-hashes.json` entries match current bytes: eight repository source/package/config files, two scratch scripts and the compiled helper. Swift source is `342062af23e3d8288a02e599806472ff1c81c2b1b8742943ff85e75b46cc6281`; binary is `a5b6069f56ca6433a6fb8c0dc778a57da7e1b8d40c274a146ed44530d434217b`, matching the original build record. No CPU-selection or diagnostic code was introduced into the production helper. Source is a frozen dirty candidate, **not yet Git-commit-bound**.

All four final fixture PNG hashes and byte lengths match both report and fixture manifest. Viewed Russian, changed Russian and English PNGs contain the simple rendered cells asserted by the proof. They are synthetic generated tables, not real supplier/customer documents. The final report records `sourceUnchanged: true`.

| Artifact | SHA-256 |
|---|---|
| `actual-attempt3/actual-parser.json` | `ffd40e32e3bf806f66102302325dc9f3ed17b27cdad3c33b99a13c415b3cdadc` |
| `actual-attempt3/source-hashes.json` | `f756b027d5834968ff227101a6969f9a4b41788def5cf39fcc9b9fad75fc9e28` |
| `actual-attempt3/fixtures/manifest.json` | `adab4df24e8e1e7292a415822f5f29a7e81d02f74b20118b711b2f77e0e7a753` |
| Executed final `actual-parser-proof.mjs` | `403c8c1822321f0eac6b89e82b515023b3a180061df0b6f4214d8898331c1c26` |
| `synthetic-images.mjs` | `713e546de93964165413b7297a2c6c415ec6784544083c2067ae6c5a83a13b7e` |

Detailed mechanical checks, including retained attempts, are in `independent-actual-artifact-verification.json`. Native stdout hashes are internally correlated between the observed worker record and case result; standalone original stdout bytes were not retained for a second independent byte rehash. The captured parsed words/boxes and their source observer are inspected instead.

## What was actually exercised

The harness imports the production parser through ts-node. Its spawn observer asserts the fixed binary, empty argv, exact minimal environment and pipes, calls the original spawn with unchanged arguments, and returns the original child. It copies actual output before the production cleanup wipes buffers. Expected rows are used only for assertions; no words/rows/provider/model results are injected.

Four actual native workers ran serially and closed with exit 0 and empty stderr: Russian (18 words), changed Russian (18), English (17), blank (0). The three nonblank images yield exactly two rows each with exact names, quantities, unit-price/line-total decimal strings and null price_kind/confidence. Changing the source image from «Шампунь Кедр», quantity 2, total 700.00 to «Шампунь Лес», quantity 3, total 1050.00 changes both native words/hash and resulting rows. This is positive evidence of pixel-dependent extraction, not merely successful process launch.

Only the **test comparison of unit-label case** is tolerant: actual «шТ» is compared to rendered «шт» using lowercase. The returned literal remains «шТ» and is explicitly recorded in the Russian and changed-Russian cases. No product/catalog unit is resolved, no production output is normalized to conceal the variation, and names/counts/numbers are not relaxed. Diff against the preserved attempt2 launcher confirms this is the only assertion change plus variation recording. It is a qualified case-insensitive unit-label match, not exact character fidelity across every cell.

The blank image runs the actual engine, returns zero words, then produces `goods_photo_ocr_table_unsupported`. Malformed bytes produce `goods_photo_image_invalid` before spawning. A concurrent call produces `goods_photo_ocr_busy` and zero additional workers. `price_kind` and row confidence remain unknown; no arithmetic, matching, catalog identity, approval or effect follows. This isolated parser proof does not execute tenant authorization or `GoodsPhotoService` source revalidation; those remain separate reviewed boundaries.

Independent signal-0 checks now find all **six** worker PIDs across attempts1–3 absent. The final four have recorded close/exit evidence, so the success did not leave a worker running. No runtime process was signalled or changed by this review.

## System context and retained failures

- Attempt1 remains **FAIL**: unchanged production worker exited 2 with no stdout; sanitized recognition failure. The separate default and CPU-only diagnostic records both show `Foundation._GenericObjCError` in the sandbox. That does not by itself identify a specific underlying OS service or prove all sandbox contexts unsupported.
- Parent reports that the successful attempts2–3 used an explicitly approved `require_escalated` system-context invocation for native Vision. The production helper/binary remained unchanged. This review did not execute or newly authorize that action. **Preserve the exact approved invocation/approval metadata alongside the package:** the parser JSON does not itself record its sandbox/execution context.
- Attempt2 remains **FAIL**, despite its first actual Russian worker succeeding: the exact unit-label assertion rejected «шТ» versus «шт». Its original launcher is preserved and matches its source map. Attempt3 records the narrow tolerance honestly.
- All 11 source entries for each failed attempt also verify, using that attempt's captured old launcher; fixture hashes/sizes verify. Failed artifacts are not overwritten or relabelled.

The recorded zero unexpected network calls is specifically the **Node fetch/socket guard's observation**. It is not a machine-wide or native-framework network census. The inspected helper has no external API/document transport and receives no credentials; the proof invokes no application model or YCLIENTS provider path. Do not describe that limited guard as OS-enforced native network isolation.

The result is local macOS accurate revision3 RU/EN recognition of three clean, horizontal, five-column synthetic tables plus blank/malformed/concurrency cases. It does not establish arbitrary invoice layout, blur/skew/handwriting, general accuracy, real documents, native RSS limits, Linux Docker/production support, current browser upload, full goods workflow, live model/provider, C10 or website acceptance.

Archive exact successful/failed source maps, old launchers, synthetic SVG/PNG fixtures, build evidence, diagnostic separation and this qualification. Do not substitute diagnostic binary/CPU behavior for the unchanged production helper. Review date: 2026-10-08.
