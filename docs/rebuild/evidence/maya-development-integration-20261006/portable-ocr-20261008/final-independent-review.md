# Independent portable OCR review — 2026-10-08

**Disposition: qualified; no remaining production blocker in the reviewed source.** Review was repository-read-only: no tests, OCR, services, containers or network were executed. Only this report and its JSON companion were written in `/tmp`.

The selected source overlay is recorded in [final-independent-review.json](final-independent-review.json). HEAD at review: `7fe7bab96295bb459a037dade2fc7a6ca5c379fd`. Actual-attempt3 is bound to the current selected source bytes; earlier attempts remain historical at their original hashes. Final candidate `7fe7bab96295bb459a037dade2fc7a6ca5c379fd` independently matches all **13** selected source bindings via `git show`.

## Findings and closure

- **P2 closed:** model `openSync` could block on a FIFO before the native timer. Runtime and preparation now use `O_NONBLOCK` while retaining no-follow, regular-file, size and hash checks. The new unit checks exact flags and no read/spawn. Saved actual-owned-FIFO observation reports refusal in 0.284 ms, zero workers, and removal of the owned FIFO; its source hash matches.
- **Harness guard corrected:** `/auth/email/verify` now requires a string code before the finite regex; negative array/number/null/object cases are present. This is static review, not another guard-test execution.

The production port has a fixed executable/argv/languages, clean environment, bounded image/TSV/output/diagnostic paths and waits for child close before settlement. The structurer preserves measured geometry and independent literal fields. Unknown units are null rather than repaired into Cyrillic/catalog units; weak numeric cells are null; weak names/headers refuse. Existing tenant/actor/source checks before and after extraction, mandatory owner review and no original-document persistence remain in the existing owner. No new mutation or identity authority was found.

## Independent byte verification

- **Actual-attempt3:** all **15** recorded source/model/binary/harness hashes match current files; all **4** frozen harness copies match their recorded hashes. **11** image/SVG pairs match sizes and hashes, and all **11** saved TSV byte lengths/SHA-256 values match the native observations. All 11 workers are recorded closed with exit 0.
- Result is exactly **2 exact-provisional**, **6 unknown-unit manual-review**, **1 blurred-price partial-manual-review**, **2 refusal** cases. It is not “11 exact recognitions”. Mac binary hash is `16020f485da1f534089d82608797d98f71322c67dee772438fb755ad9b4f79b5`; recorded engine is Tesseract 5.5.3.
- **Models/license:** six physical copies (two model files plus LICENSE in each of backend/assets and downloaded-models) match exact sizes, SHA-256 and Git blob hashes. Models total **7,974,826 bytes**, plus **11,358** license bytes.
- **History preserved:** attempt1 remains FAIL, with 10 actual inputs and six incorrect non-null unit transcriptions. Its original plan/generator/assertion snapshots match the original source hashes. The original ten expected cases are unchanged; attempt2 adds only the blurred-price case and explicitly permits unknown units as incomplete manual results. Attempt2's seven tracked production/package source bindings match commit `dc6684cba67659664910578ef96afe06781f7551`. Old runtime hashes are historical, not a claim of current-source execution.
- **Assets guards:** attempts1 and2 each record ten offline cases; attempt2 script/manifest hashes match current files. These cases qualify local file verification/refusals, not an independently repeated network download.

## Existing local gate evidence

Attempt2 records 233 tests / 9 suites passed before the FIFO correction. Attempt4 records **234 tests / 9 suites** plus backend/widgets types passed, then remains FAIL on one unnecessary test-only type assertion. Attempt5 records final scoped lint and the remaining contract/K3, shell/carrier type/build/photo, offline-assets and syntax stages passed. Its 13 selected source hashes match current files. Repeated cohorts are not added together. Attempt1's platform-mocking suite failure remains preserved. The JSON retains each run's actual status and owned-group closure observations.

## Prepared HTTP/current React harness

Static review finds real parser/native call-through and comparison-only expected rows: no expectation injection into OCR, HTTP responses or page state. Anonymous/revoked requests must start no worker; exactly three native workers are expected for two successful uploads and one unsupported table. Five explicit browser uploads, closed response fields and the selected tenant/business-write recorder are asserted. The harness must bind the fresh native attempt3 before running. This report grants **no HTTP/browser/restart acceptance**; that requires subsequent actual reports. Write counters are a named observed perimeter, not a machine-wide no-effect census.

## Limits and decisions

Docker packaging is authored, **not executed**. Mac 5.5.3 does not qualify Linux/APK 5.5.1 or an image digest. The mutable `node:24-alpine`/APK resolution, native memory/resources and actual Linux recognition/cleanup remain unqualified. Assets must stay immutable after validation. Worker bounds are not a hard native RSS quota, distributed queue or measured machine-wide egress fence.

Synthetic horizontal five-column tables do not prove general invoice accuracy or real customer-document handling. Every field and purchase-price meaning still needs owner review; `recognition_acceptance: NOT_ACCEPTED` remains. No live provider/model, production, migration, new retention, C10 completion or certificate is claimed. F32b/F74b already approve the exact goods UI lane (contract clauses 590–596); provider permission semantics and multi-company identity/schema remain separate open boundaries. The checkpoint's validation paragraph is still a draft and must be filled from these preserved statuses, not upgraded wholesale.
