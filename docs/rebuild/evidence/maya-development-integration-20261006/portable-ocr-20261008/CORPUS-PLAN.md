# Prepared synthetic raster corpus

These files prepare eleven synthetic input images and independently declared facts to check against real OCR observations. They contain no parser substitute, prebuilt OCR word boxes, LLM result or real document. Parent ran the original ten images and retained the failed unit-transcription evidence in `actual-attempt1`; this revision has not been generated or executed by its author.

The original plan, generator (including the parent's realpath CLI fix), assertions and this document are preserved byte-for-byte in `attempt1-provenance`. Their hashes match the source bindings of the first actual attempt. Original expected text and numbers for all ten cases remain unchanged; a new blurred-price case is appended. Historical evidence must be evaluated with its preserved sources, not relabeled by the revised assertion policy.

| Case | Raster | Expected evidence |
| --- | --- | --- |
| ru-fractions-dot | PNG | Cyrillic names, 2.5 and 0.75, independent unit prices and totals |
| ru-changed-pixels | lossless WebP | Changed Cyrillic name and changed digits produce changed rows |
| ru-fractions-comma | JPEG | Unambiguous comma decimals normalize to dots with digits preserved |
| ru-ambiguous-comma | PNG | Quantity `1,250` stays null, or a qualified table refusal |
| english-webp | lossless WebP | English aliases, multiword names and fractional quantity |
| printed-total-disagrees | PNG | Quantity 2, price 300.00, printed total 950.00 remain independent |
| jpeg-exif-rotation | JPEG | Actual pixels rotated 90°, EXIF 8; decoder restores upright table |
| occluded-price | PNG | Opaque cover makes price unreadable: null or qualified refusal |
| missing-price | lossless WebP | Empty price remains null, or a qualified refusal; no division from total |
| unsupported-price-header | JPEG | Multiword `Закупочная цена` is outside current exact header grammar and must refuse |
| blurred-price | PNG | Price-cell raster pixels receive strong Gaussian blur; price must be null or the table must refuse |

Every accepted row remains provisional. `price_kind` and row `confidence` must be null. No currency, goods ID, store, matching, arithmetic or purchase-price meaning is inferred. All cases require explicit owner review; incomplete/ambiguous cases require manual input. Exact names and numeric fields must still match their original expectations. A wrong non-null unit (for example Latin `n` for Cyrillic `л`, or `Kr` for `кг`) fails. Only a unit returned as `null` may instead produce **safe-manual-review**, with the row number and original expected literal recorded; it has `exactTranscription: false` and is excluded from `exactProvisionalCases`. No comparison maps those strings to Russian units or modifies the observed result.

The report separates exact provisional transcription, safe unknown-unit manual review, pre-existing incomplete/ambiguous-cell manual review and qualified refusal. A refusal on an otherwise exact fixture still fails. Unknown numeric fields on exact fixtures also still fail. `exactOcrAcceptance` is always false; a qualified corpus result does not establish general OCR accuracy. No accuracy percentage or general invoice acceptance is claimed.

For `blurred-price`, the source SVG initially renders an ordinary literal price. The generator rasterizes it, extracts the 315×110 price region, applies Sharp Gaussian blur with sigma 24 to those actual pixels, and composites the blurred region into the final PNG. The manifest records the region, sigma and distinct before/after cell and raster hashes. This does not blur or replace OCR text. The expected output keeps the price null even though the source SVG records what was rendered before degradation. The actual image and outcome still require inspection in the next run; no guessed unreadable digit can pass.

The supported geometry remains one flat horizontal five-column table with single-line names. EXIF orientation is the only rotation qualification in this bounded corpus. Perspective, arbitrary skew, wrapped rows, multiple tables, real invoices and non-synthetic images remain unqualified.

## Parent-only serial invocation

The generator imports the already installed Sharp from the backend package; it never installs dependencies or calls OCR. Default backend path is the current Mac worktree. `--backend` permits an existing Linux checkout with Sharp installed. On Linux the local rasterizer must have a Cyrillic font (the source requests DejaVu Sans, then Arial, then local sans-serif); font availability and the generated pixels need checking in the actual run. No font download is part of the generator.

```sh
node /tmp/maya-linux-ocr-20261008/generate-corpus.mjs --generate --output=/private/tmp/maya-linux-ocr-20261008/corpus-attempt2 --backend=/absolute/path/to/maya-saas-backend
```

The output directory must not already exist. Use `/private/tmp` on this Mac because Node resolves the module through that real path; on Linux use the actual scratch path `/tmp`. It receives eleven raster files, eleven source SVGs for provenance, and a hash-bound manifest. OCR must read each raster, not SVG or `expectedLines`. Raster dimensions are 2200×760 (stored 760×2200 for the rotated JPEG), under 2 MiB each; generated metadata is checked before recording the fixture.

The parent harness records the actual processor, image hashes and actual parser results in this shape:

```text
{
  contract: 'maya.synthetic-goods-photo-observations/1',
  actualProcessor: { engine: <actual engine>, platform: <actual platform>, executionMode: 'actual-image-bytes' },
  cases: [
    { key: <fixture key>, imageSha256: <hash of consumed raster>,
      outcome: { status: 'parsed', lines: <actual production parser lines> } },
    ... or outcome: { status: 'refused', errorCode: <actual sanitized code> }
  ]
}
```

No example rows are supplied here for copying into observations. The expected rows in `corpus-plan.mjs` are assertion data only. The harness must separately retain call-through evidence of actual OCR execution, worker version/source hashes, input image hashes, stdout/word-box hashes where available, bounded worker completion and zero external calls. The assertion module cannot establish execution provenance by itself.

```sh
node /tmp/maya-linux-ocr-20261008/assert-corpus.mjs --manifest=/tmp/maya-linux-ocr-20261008/corpus-attempt2/manifest.json --observations=/tmp/maya-linux-ocr-20261008/actual-observations2.json --output=/tmp/maya-linux-ocr-20261008/corpus-evaluation2.json
```

The assertion CLI checks on-disk image hashes and all eleven unique cases. It refuses to overwrite evidence. Worker, decoder, unavailable-language or configuration errors are failures, not supported table refusals. If the actual service preview is also exercised, call `assertPreviewRemainsUnaccepted(actualPreview)` to check real `review_required` and `recognition_acceptance` flags; the pure parser does not invent those fields.

No generator, OCR, test, browser, service or network process was run by the author while preparing this revision. Root owns all execution and qualification. Parent's original ten-worker run and its failures remain preserved separately.
