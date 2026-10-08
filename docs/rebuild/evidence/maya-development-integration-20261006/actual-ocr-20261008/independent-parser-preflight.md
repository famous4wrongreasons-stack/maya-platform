# Independent OCR parser preflight

**Qualified static PASS for the current root-owned parser/config/DI slice; no concrete blocker found before the authorized synthetic-image OCR proof.** No OCR, tests, services, compiler, installs, network or repository writes were performed by this reviewer. Geometry-to-rows work and the final Swift/build freeze are separate review scope; this is not their final acceptance.

The explicit current task permits actual local pixel recognition of a synthetic image. `MAYA-YCLIENTS-MANAGEMENT-DECISION-BRIEF-20261007.md:11–13,19–23` explicitly permits bounded processing without original-photo persistence and treats OCR as suggestion only. `MAYA-WIDGET-CONTRACT-V1.md:590–598` F32b/F74b makes photo hash/line/version provenance, never authority or OCR acceptance. The previous photo checkpoint's unavailable/mock-parser result is a historical evidence limit, not a prohibition against the now-authorized local implementation. No new retention, external transport, financial subtype or approval-origin decision is necessary for this finite local processing edge.

Reviewed bounds and behavior:

- Configuration must explicitly select `apple_vision`; missing/disabled configuration or non-Darwin runtime refuses. A single module-level busy guard covers normalization plus OCR plus row structuring and clears in `finally`. This is one concurrent parse **per Node process**, not a distributed lock.
- Input is at most 2 MiB. Sharp admits only PNG/JPEG/WebP, one page and at most 12 million pixels; it normalizes orientation, flattens/removes alpha and constrains output to 2600×2600 with no enlargement. Processing timeout is 5 seconds; normalized PNG is at most 16 MiB. These are input/work bounds, not a demonstrated OS-level hard RSS limit. Metadata inspection precedes the sharp processing timeout. The earlier inventory's 8 MP/128 KiB numbers were a proposal; final documentation must describe the actual implementation's 12 MP/256 KiB bounds.
- Runtime spawns one fixed local `dist/ocr/goods-photo-vision` executable, with no shell, URL/path argument or inherited credential environment. PNG travels over stdin. Child timeout is 15 seconds, stdout at most 256 KiB and stderr at most 4 KiB. Overflow/error/timeout kills only that child and waits for close; diagnostics are wiped and never logged/returned. Only parsed JSON is handed to the structurer. Input/normalized/output buffers owned here are wiped in `finally`; no photo/raw-OCR file or durable store is introduced. Immutable JS strings/native engine memory are not claimed to be securely erased.
- Existing service checks current policy/source before OCR and revalidates after it, preserving source drift/revocation refusal. The same DI token is re-exported and registered; explicit `@Inject(GoodsPhotoParser)` preserves runtime injection despite the narrower test-facing Pick type. Existing service output projection still strips arbitrary/raw fields, marks every row for review and keeps `recognition_acceptance: NOT_ACCEPTED`.
- No search, item auto-selection, price arithmetic, approval or AE call is introduced by this parser. The future structurer must preserve missing/ambiguous fields as unknown; successful OCR exit/confidence cannot establish a catalog identity, price meaning or financial fact.

Operational qualifications for the first proof: build/record the exact helper binary after any Nest build that clears `dist`; the runtime lookup intentionally depends on backend process working directory. Bind the compiled binary and Swift source hashes in evidence, not merely the TypeScript wrapper. Missing executable must stay a bounded unavailable result. Actual subprocess completion, image decode and geometry extraction remain unproved by this static review. The macOS-specific edge is not Linux Docker/deployment readiness. No real invoice/model/provider, storage retention, receipt effect or broad OCR quality acceptance is implied.

The inspected Swift/build drafts use native local Vision and no image persistence API, but their final code/evidence review is not claimed here. No scope expansion or additional permission request is inferred.

## Root-owned bytes inspected

- `maya-saas-backend/src/ai-tools/goods-photo-parser.service.ts`: `3d2ae04abb77b4600d673b378f1320856f01c7d75492da1c3bcdcdd82285e733`
- `maya-saas-backend/src/ai-tools/goods-photo.service.ts`: `b92edbcb6506e72267eb19aad049ebe42a6ca868ac8649a7c3d5892636cbe68c`
- `maya-saas-backend/src/config/runtime-config.ts`: `907727c496dbfa07930dc9d02559d74c3880365abcf4e19636c9aeca602787e9`

Captured 2026-10-08T12:33:47.111755+00:00; dirty development snapshot, no commit binding yet.
