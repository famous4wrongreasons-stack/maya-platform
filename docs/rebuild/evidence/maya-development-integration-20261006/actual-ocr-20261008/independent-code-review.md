# Independent local OCR code review

Verdict: **qualified static PASS** for the frozen geometry structurer, Swift helper/build script and their integration with the root-owned parser. No concrete blocking defect found in this finite synthetic-image development scope. This review executes no OCR, test, compiler, image generation, service or network request and changes no repository file. Actual pixel-to-text-to-row evidence remains pending.

The preceding `independent-parser-preflight.md` establishes the canonical scope and root parser/process/privacy boundaries. Formatting and explicit DI on the current bytes preserve that behavior. This addendum covers the now-complete geometry/helper code; the hashes below identify the dirty snapshot, not a committed candidate.

## Geometry and field meaning

- Input has an exact root/word schema, bounded arrays and text, finite normalized boxes and confidence. Sparse arrays, extra fields, accessors, control characters, invalid dimensions and out-of-image boxes fail closed. Native dimensions/pixels are independently bounded by the helper; the structurer itself checks positive integer dimensions rather than repeating the pixel ceiling.
- Vertical grouping is anchored to an existing line, avoiding transitive drift through successively lower words. Horizontally overlapping words, ambiguous line membership and cells crossing inferred column boundaries refuse. It accepts only one literal five-column header in registered order and 1–20 single-line item rows. Wrapped names, an extra index column, repeated recognized headers and content after the optional final footer refuse. This is a narrow aligned-table parser, not general document/table understanding.
- Cells are assigned by measured boxes; no text-model inference or nearest-product selection is used. Unknown numeric cells stay null. Decimal commas are normalized literally, without floating-point arithmetic; ambiguous three-digit comma grouping, currency suffixes, signs, spacing/grouping and OCR substitutions are not repaired. Source quantity, unit-price and line-total cells stay distinct, including an inconsistent total. Quantity is never derived from price/total. Unit labels remain provisional document text, not catalog-unit authority.
- Names must be bounded and contain a letter. Name-only continuation lines refuse. Footer words are not returned as products. `price_kind` and row `confidence` are always null, preserving unknown purchase/sale meaning and avoiding a fabricated whole-row probability. Public service projection retains mandatory review and NOT_ACCEPTED recognition status; no source lookup, match, approval or effect is triggered.
- Unit tests inspected are explicitly handcrafted word-box fixtures. They cover registered RU/EN headers, geometry refusal, absent/unreadable values, row/count bounds, literal precision, no arithmetic, schema/accessor rejection and unchanged input. They do not prove the real OCR engine finds those words or boxes.

## Swift helper and build

The helper accepts no command arguments and reads bounded PNG bytes only from stdin. It validates complete single-image PNG decoding, positive dimensions, a 12-million-pixel ceiling and normalized orientation before Vision. Vision uses explicit accurate revision 3 with ru-RU/en-US, no custom dictionary, automatic language detection or language correction. It verifies language support and returns each actual non-whitespace substring with its native word-range box; absent boxes refuse rather than manufacturing word coordinates. Bottom-left coordinates are transformed to top-left, with only tiny edge noise clipped.

Recognized observations/words, text lengths, numeric coordinates/confidence and final serialized output are bounded. Errors emit only finite diagnostic codes. The helper introduces no URL, image-file path, network, image persistence or credential reader. Its timeout/concurrency owner is the TypeScript wrapper: the native helper alone does not claim a standalone wall-time or OS RSS cap. Memory wiping is best effort, not cryptographic erasure of all native/String copies.

The explicit build invokes fixed `/usr/bin/swiftc` with fixed reviewed source/output paths, no install/download or image input. It rejects symlinked source/output and parent output directories, limits compiler time/output, controls only its own detached compiler group, and reaps descendants after compiler close. Source is hashed before/after compilation; the binary is atomically published from the fixed temporary file and hashed. This is an explicit operator build, not a compiler launched by an upload request.

Read `build-attempt1.log`: compiled source hash and on-disk binary hash match the reviewed Swift source and binary below. The recorded compiler group is absent and imageRecognitionExecuted is false. This confirms recorded compilation plus current hash binding, not an independent compiler rerun or process census.

## Qualification and next proof

No new product/retention/approval permission is inferred. Existing canonical allowance for memory-only processing applies to the explicitly authorized synthetic image; original/raw OCR still does not enter durable approval/effect or the text-model channel. F32b/F74b review and AE authority remain unchanged.

Actual proof must bind the compiled binary, source and scratch harness, demonstrate real generated pixels becoming native words and structured rows, and distinguish current source/revocation checks from OCR quality. It must not stub the parser/native output or relabel unit word-box fixtures as OCR. Preserve any failed recognition attempt; keep unknown/ambiguous outcomes. No real invoice, broad invoice accuracy, real model/provider, Linux Docker/deployment, receipt effect or C10 completion follows from compilation or this review. When the actual proof is ready, its artifacts require separate read-only qualification.

## Reviewed SHA-256

| File | SHA-256 |
|---|---|
| `src/ai-tools/goods-photo-ocr-rows.ts` | `7570adbcb5bc66940d9134228e55ad63cc45c9c2a85daa9eca4b2fa2921c8f42` |
| `src/ai-tools/goods-photo-ocr-rows.spec.ts` | `e0d2aadb7bddc1ea34dde0e04c1407aacce6d9820fae547b2449e703e01cb7c1` |
| `scripts/goods-photo-vision.swift` | `342062af23e3d8288a02e599806472ff1c81c2b1b8742943ff85e75b46cc6281` |
| `scripts/build-goods-photo-ocr.mjs` | `39e20e6de5d9ab8623598d98eb175d2734ddd603468097f86dc30421f5a470eb` |
| `src/ai-tools/goods-photo-parser.service.ts` | `3d2ae04abb77b4600d673b378f1320856f01c7d75492da1c3bcdcdd82285e733` |
| `src/ai-tools/goods-photo.service.ts` | `b92edbcb6506e72267eb19aad049ebe42a6ca868ac8649a7c3d5892636cbe68c` |
| `src/config/runtime-config.ts` | `907727c496dbfa07930dc9d02559d74c3880365abcf4e19636c9aeca602787e9` |
| Built `dist/ocr/goods-photo-vision` | `a5b6069f56ca6433a6fb8c0dc778a57da7e1b8d40c274a146ed44530d434217b` |

Paths above are relative to `maya-saas-backend`. Review date: 2026-10-08. No test/pass totals are claimed by this static report.
