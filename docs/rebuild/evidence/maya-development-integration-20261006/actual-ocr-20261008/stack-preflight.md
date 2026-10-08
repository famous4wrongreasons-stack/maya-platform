# Goods photo: executable local OCR preflight

Read-only source inspection, 2026-10-08. Repository HEAD: `9553c6beb946f7122e446bd8afc97848d1220287`. Workspace: `/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-development-integration`. No repository changes, package installation, OCR/model invocation, external request, service or gate run was performed by this reviewer. Local binary/language discovery belongs to `branch_http_proof` and is not inferred here.

## Decision

**A real local OCR implementation on synthetic image bytes can fit the already authorized development scope without a new external data transport or retained-photo decision.** The finite path is existing authenticated `GoodsPhotoService.preview` → its existing `GoodsPhotoParser` processing edge → local decoder/OCR → bounded provisional rows → existing explicit owner review. It must not send images or raw OCR through AiCore, team media, cloud storage or a remote OCR service.

This conclusion authorizes no action by itself: it interprets the existing product scope and the parent's present explicit local-development task. This turn is read-only. Local engine/language metadata is now available from the separately assigned agent below; a runnable parser and deployment profile remain facts to establish. A synthetic pixel-to-text proof would close the mocked-extractor gap for the tested format; it would not prove arbitrary invoice quality, production support or provider receipt admission.

## Exact requirements versus interpretation

| Evidence | Exact requirement / observed contract | Consequence for a local implementation |
|---|---|---|
| `docs/product/README.md:35–57` | Goods scope explicitly includes invoice photo → name/quantity/price recognition → matching → owner ambiguity review → YCLIENTS; purchase/sale/line prices and balance/receipt delta remain distinct. The scope does not authorize production data changes. | Implementing extraction is existing product work, not a new feature permission request. Do not silently infer price meaning, catalog units, stock or matching. |
| `docs/rebuild/MAYA-YCLIENTS-MANAGEMENT-DECISION-BRIEF-20261007.md:11–13` | The original-photo visibility/retention decision is conditional on retaining the original. “This decision does **not** block bounded processing without original-photo persistence.” | Memory-only local processing does not require that retained-original decision. This is explicit text, not an exception invented by the reviewer. |
| Same brief, lines 19–22 | “Photo OCR is suggestion only.” Local synthetic fixtures are allowed; real provider/model or production calls need separate admission. Memory-only processing does not waive privacy or draft ownership. | A local deterministic recognizer on synthetic pixels needs no paid-model or CRM transport. All output remains provisional and manually reviewed. |
| `docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md:590–598`, F32b/F74b | The already approved receipt lane is one existing item/company/store and explicit reviewed quantity/unit/cost. Photo hash, source line and review version are provenance only, never authority or OCR acceptance. Existing receipt payload/audit lifecycles apply. | OCR does not widen this lane or authorize any mutation. No new approval origin, second inventory owner or draft store is needed. |
| `docs/rebuild/MAYA-GOODS-PHOTO-REVIEW-CHECKPOINT-20261008.md:9,19–27` | Original/unreviewed fields are not persisted. Current source witness survives preview→search→item→review. The checkpoint demands qualified image/OCR handling, decoder/resource bounds and error behavior; existing text AiCore is not repurposed for images. Current successful tests inject literal rows, not OCR. | Real local decoding plus local OCR can satisfy a new *local synthetic* processing qualification. It does not inherit real-document/provider/model acceptance from the prior checkpoint. |

**Interpretation:** “approved image/OCR transport” in the prior checkpoint is not a blanket prohibition on an explicitly requested, local, memory-only synthetic implementation. The existing multipart upload is already the photo ingress. A local child process communicating over bounded pipes adds no external document recipient and no durable original store. Its exact data path and resource bounds still need implementation and review. If the chosen engine writes originals/temp images, downloads models, sends telemetry or needs external recognition, that is a different design and cannot be silently treated as this memory-only path.

## Existing executable owners and reuse

1. `maya-saas-backend/src/ai-tools/goods-photo.controller.ts:46–64`: authenticated, tenant-scoped `POST /api/ai/goods/photo-preview`; one multipart field `photo`, one file, at most 2 MiB and zero form fields. No new endpoint is necessary.
2. `src/ai-tools/goods-photo.service.ts:14–20`: `GoodsPhotoParser.parse(bytes: Uint8Array): Promise<unknown>` is the existing DI processing edge, registered in `src/ai-tools/ai-tools.module.ts:71–74`. Current default throws `goods_photo_parser_not_configured`. No OCR, SDK, download, credential reader or fallback exists here.
3. `goods-photo.service.ts:58–91`: checks current owner policy/source before parsing, bounded size and PNG/JPEG/WebP signatures, hashes original bytes, then invokes the parser. Current signature tests do not decode pixels or prevent decompression bombs by themselves.
4. `goods-photo.service.ts:92–130`: accepts 1–20 rows; sanitizes labels to 240 characters and decimals through existing `goodsDecimal`; strips arbitrary supplier/raw OCR fields; rechecks current source after parsing; marks every row `review_required`; returns `recognition_acceptance: NOT_ACCEPTED`, `original_stored:false`, `persistent_draft:false`; clears the owned input buffer in `finally`.
5. `goods-photo.controller.ts:75–175` and the existing goods runtime remain the reviewed-proposal/canonical-turn/approval owners. Parsing must not invoke matching, item reads, prepare, approval or AE on its own. Current source drift/revocation must continue to withhold the result.

The existing `unknown` parser return can be refined internally into a finite typed extractor result without replacing the public photo preview contract. The public service already projects only recognized provisional fields. A real parser should return `null` for unknown facts; parser confidence must not be fabricated from a successful process exit or used for automatic matching.

## Available stack from repository and installed sources

| Stack | Source evidence | Qualification |
|---|---|---|
| Image decoding | Backend `package.json:92` declares `sharp:^0.35.4`; lockfile pins sharp/platform packages. `src/tenants/tenant-pwa.service.ts:229` already uses in-memory sharp image processing. Installed `node_modules/sharp/lib/index.d.ts:997–1015` documents `failOn`, `limitInputPixels`, `limitInputChannels` and `unlimited`; lines 880–886 document processing timeout. | Reuse the existing package, not branding storage or its public-image workflow. No new dependency is necessary for a bounded decoder. Presence of files was read, native load/decode was not executed here. |
| Process execution pattern | `src/owner-reports/owner-report-download.service.ts:37–108`: configured absolute executable/script; `spawn`, no shell, controlled environment, bounded stdout, timeout/kill and pipe input. | Useful implementation precedent for a finite local OCR process. Do not borrow report data authority or renderer configuration. |
| Team media inspection | `src/package5-wave4/package5-team-object-store.ts:251–299` detects files and uses bounded local ffprobe for audio with file-only protocols. | Demonstrates existing local binary inspection, but is neither OCR nor private invoice storage admission. Do not route invoices into this owner. |
| Paid text model | `src/ai-tools/ai-core.types.ts:9–32` has string message content; `ai-core-model.service.ts:975–997` sends JSON-stringified text input to OpenAI; DeepSeek path likewise uses string messages. | No approved image input contract here. Reusing a key or `store:false` does not authorize document transfer. No model call is needed for the proposed local path. |
| Paid reasoning gate | `src/orchestration/c9.model.ts:29–34,57–60` requires a released allowance and durable bounded work receipts, otherwise unavailable. | Not a shortcut or implied paid OCR grant. Local deterministic extraction need not manufacture a model reservation. |
| Speech | `src/ai-tools/ai-speech.service.ts:60–83` is PCM-specific Yandex speech transport. | Its audio handling/credentials do not authorize invoice images. |

Installed sharp timeout excludes time waiting for a libuv worker, according to its local type documentation. Therefore a decoder timeout alone is not a complete end-to-end resource bound. Use bounded admission/concurrency and a killable processing boundary if full wall time must be enforced. Do not claim guaranteed total RAM isolation from an upload-size or pixel cap alone.

## Why the existing media store is not the OCR scratch owner

`src/package5-wave4/package5-team-object-store.ts:35–36` uses the private **team** namespace. `src/team-communications/team-communications.service.ts:1007–1046` admits a current team member, live `TeamMessage`, bound non-erased attachment and unexpired media. `prisma/migrations/20260908010600_r12_approved_foundation/migration.sql:122–129,219–221` binds upload expiry to one hour and bound media to 48 hours with canonical team retention claims. These are enforced lifecycle/visibility semantics, not a generic private invoice repository.

The current goods photo path deliberately does not create `TeamAttachment`, `TeamMessage` or public branding files. It should remain so. A subprocess can consume image bytes over stdin and return bounded text/TSV over stdout; no document file needs to be introduced. A library or child process may keep private native buffers while working, so “owned input buffer wiped” must not be inflated to a claim of forensic erasure of every native/string allocation.

## Deployment boundary

Repository `maya-saas-backend/Dockerfile:1,17` builds and runs `node:24-alpine`, installs npm dependencies and copies the application. It does not install an OCR executable or language data. `docker-compose.yml:20–25` builds that Dockerfile. The inspected `.env.example` has no OCR/Tesseract configuration; only existing unrelated upload/speech/etc settings. No production/container/SSH inventory was attempted.

Consequently an engine discovered on the developer Mac is not automatically available in the declared Linux image. A server-selected explicit local-engine configuration can fail closed with the existing unavailable result when executable/language resources are absent. Packaging/deployment availability must be reported separately. Do not download/install an engine or language pack during a request, reuse an unrelated Mac-only API as a Linux claim, or silently fall back to paid OCR.

## Local engine metadata supplied by the assigned discovery agent

`branch_http_proof` reports macOS 26.5.2 arm64, Swift 6.3.3, installed sharp 0.35.4, Tesseract 5.5.3 with `eng/osd/snum` but **no rus**. This reviewer read the saved `vision-languages.json`, `vision-language-query.json` and `vision-language-inventory.swift` under `/tmp/maya-actual-ocr-20261008/`: Apple Vision `VNRecognizeTextRequest` revision 3 reports `ru-RU` and `en-US` under **accurate**, while **fast** has no Russian. The metadata command exited 0 in 3.064 seconds; the report explicitly records imageInputs=0 and recognitionRequestsPerformed=0. It is language-capability discovery, not an OCR-quality run.

The most direct existing local candidate is bounded sharp normalization followed by a finite compiled Swift/Vision worker, accurate revision 3 and explicit RU/EN. Use image bytes from stdin and bounded JSON containing recognized text/bounding boxes from stdout, not caller file URLs. Build/module-cache files contain code, not documents; no invoice should be embedded into worker source. Tesseract without Russian data cannot substantiate Russian-invoice acceptance and should not trigger an automatic language download. Vision is a Mac-only development profile; the Linux Docker limitation remains unchanged. Framework-level caching/network properties and actual resource behavior still need the implementation's qualification; Node fetch interception alone cannot establish global native-process egress absence.

## Minimal implementable candidate

These are recommended engineering bounds, **not existing numeric normative requirements or accepted configuration**:

1. Keep the existing authenticated upload and 2 MiB/20-line limits. Decode only actual PNG/JPEG/WebP, reject incomplete/corrupt and multi-frame inputs rather than selecting a hidden frame. Set explicit pixel/channel/side bounds and strict decode errors; normalize into bounded in-memory pixels/PNG and discard metadata. A 12-megapixel/6,000-side ceiling is a candidate to evaluate, not an established safe deployment budget.
2. Use one operator-selected local executable and fixed arguments (no shell/caller paths/URL/credentials). Input through stdin, bounded stdout/TSV, stderr discarded or mapped to a finite code. No raw text or document bytes in logs. Explicit overall deadline, kill-and-reap on timeout/overflow, bounded concurrency with fail-closed busy response; do not enqueue unbounded uploads. A single worker, 10-second wall deadline and 256 KiB OCR output are candidate initial limits requiring local verification.
3. Parse only a documented narrow invoice table grammar using recognized header positions/columns. Return at most 20 provisional rows; preserve visible name/quantity/unit/unit-price/line-total only when their columns and decimal syntax are unambiguous. Keep price meaning, currency, unit basis and missing fields unknown. Do not infer values from totals, catalog data, arithmetic or confidence. A clearly printed header is stronger than a bag of numbers but still provisional.
4. Return no rows with a finite `goods_photo_lines_unavailable`/recognition error when the layout/text cannot be qualified. Reject output overflow; do not silently truncate a larger invoice into a complete-looking 20-line result. Unconfigured engine/language support must remain 503 unavailable, not successful empty extraction.
5. Reuse existing current-source recheck and manual review. A changed selection/source/permission after local OCR is not repaired by retrying against another company. No C9 action, matching or proposal is automatic after upload.

## Evidence needed to distinguish real OCR from another mock

- Use the actual production parser via DI without replacing `parse`, the decoder, child process or extraction output. Synthetic images contain visibly rendered invoice text. Keep image SHA256 and the actual bounded output as evidence, with no real documents.
- Two independently rendered images change item text and numeric cells; actual output must track those changed pixels. Do not return a literal table based on image digest or fixture name. A blank/corrupt/unsupported image must refuse rather than return the same rows.
- Verify ambiguous headers/price meaning, decimal comma/point policy, malformed numeric tokens, overflow beyond 20 rows, high-pixel low-byte images, animated input, missing engine/language, process timeout/output overflow and cleanup. Mark tested language/layout explicitly; English-only engine availability is not Russian invoice acceptance.
- Integration: parser failure and late source/authority revocation return no proposal; buffers are cleared; zero provider/model/network calls and zero persistent original/draft changes. No automatic search/detail/approval follows parsing.
- Carry successful actual extracted rows through existing HTTP/current React manual review only in root's separately scheduled proof slot. Existing real receipt-provider permission blocker remains independent.

## Remaining concrete blockers

1. Local Russian/English recognition capability is supported by the saved Vision metadata, but this preflight did not invoke a recognizer or decode an image. A real pixel-to-text result remains unproved.
2. No executable implementation or parser/resource-bound tests were authored or run in this read-only turn. Current production parser still returns 503.
3. Runtime image does not presently declare an OCR engine/language package. Local synthetic functionality can proceed if an installed engine is suitable, but production deployment support is unproved.
4. Real representative documents, external document transport, paid model calls and retained originals are outside current local synthetic proof. No generalized invoice-quality or C10 acceptance should be reported.

No new owner decision was found that blocks the **memory-only, local, synthetic** development candidate. A retained photo, external recipient, paid transport or widened receipt authority would change this conclusion and require its exact separate admission.
