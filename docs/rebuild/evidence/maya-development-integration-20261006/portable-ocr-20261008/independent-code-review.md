# Independent static review — portable native OCR

**Qualified static PASS; no concrete blocking defect found in the reviewed snapshot.** Base HEAD `adbe075656138109b00e33ee4c845fddf7aaf60a`; the 12 files below are uncommitted development bytes, not a frozen execution candidate. Read-only review only: no project code, tests, services, OCR, package preparation, network or container execution by this reviewer. Parent owns forthcoming actual proofs.

The fixed Tesseract executable receives normalized PNG through stdin and produces bounded TSV through stdout. There is no shell, user-controlled path/language/config, inherited credential environment, request-time install/download, remote fallback or output-file argument. Existing single-request OCR admission, 2 MiB input / 12 MP / 2600-pixel normalization, 16 MiB PNG, 15-second child deadline, 256 KiB stdout and 4 KiB stderr bounds remain. Raw native diagnostics are discarded; child settlement waits for close, and owned image/output buffers are cleared in finally. This is process-local concurrency and a deadline, not a hard RSS or fleet-wide quota; JavaScript/native internal copies are not securely erased by these buffer clears.

`maya.tesseract.words/1` is explicitly separate from Vision revision 3. Exact TSV header, finite one-page geometry, text/index/score bounds and no truncation are checked before the existing deterministic five-column structurer. Tesseract scores are uncalibrated measurements: weak numeric cells remain null, weak names/headers refuse, weak units remain null. Higher scores do not certify correctness. Row confidence and price_kind remain null; no arithmetic, catalog identity, unit conversion, purchase-price inference, matching or effect authority is added. Synthetic TSV unit cases cover malformed protocol and weak cells; their source was reviewed, but no unit PASS is asserted here.

Model preparation is separate from HTTP: fixed official repository/commit and three names, exact size/SHA-256/Git-blob digests, 20-second per-file bound, no redirect or compressed response, exclusive local staging and whole-directory publication. Existing invalid directories are refused, not silently repaired. Verify mode has no network and rejects extra files, symlinks and hardlinks. The runtime independently checks the two expected model sizes/SHA-256 before spawning. The manifest and runtime pins agree. Assets/license are kept outside Git and copied explicitly from the build stage; image-time verification is present and provider remains disabled by default. No UI/source-authority/AE change is introduced.

**Qualification still open:** Docker/Alpine build and actual Linux image execution have not occurred. `node:24-alpine` and `apk add tesseract-ocr` are mutable; the later Linux checkpoint must record the selected image/architecture/package/dependency versions and real runtime behavior. Mac Tesseract 5.5.3 cannot prove the inspected Alpine package or Linux resource/geometry behavior. This is a packaging candidate, not Linux acceptance or reproducible image evidence. Model verification followed by CLI reopening assumes deployment-owned immutable assets; it is not protection against a concurrent privileged filesystem writer. No blocker is inferred from that existing trusted deployment boundary.

F32b/F74b goods receipt review was already approved; no new permission question is created by this local engineering change. Provider receipt scope, service direct-chat origin/preservation and multi-company migration remain independent as recorded in [authority remainder](authority-remainder.md). Real documents, live YCLIENTS effects, production deployment, external OCR data recipients and original-photo retention are outside this review.

## Reviewed snapshot

Captured UTC: 2026-10-08T13:32:44.927683+00:00

| File | SHA-256 |
| --- | --- |
| `.gitignore` | `1256dc8069e66d99ef0a128a7c46b5d9b581924379cb93fd7f7847298de6dcfa` |
| `maya-saas-backend/.dockerignore` | `8a75dea5abbb58eda8b8d43bdba4f5e517fc40dd7265cb6231c1516fd6fb61a3` |
| `maya-saas-backend/Dockerfile` | `4a306fa5009418a3dddcf538f1c21d5b9dfbc200aaf73cfadd817ddfad83a960` |
| `maya-saas-backend/package.json` | `3de7eb4fd5f53aec13c4cae484dbb23ab3b307283580d7e66b3273ed1ef43201` |
| `maya-saas-backend/scripts/goods-photo-ocr-models.json` | `3115bd341e5c9169ac322ddc99531b4b8cb3689449d5e5f9fd4b54c3efe2c897` |
| `maya-saas-backend/scripts/prepare-goods-photo-ocr-models.mjs` | `3d3d8580e585bf6811d29a429d1449108e03dfb22b8b2e0570d1f88efcb239c3` |
| `maya-saas-backend/src/ai-tools/goods-photo-tesseract.ts` | `b51f2d9c5e20ea0592f3a3b061637985beeec2c9f619e747e7c922c2051be196` |
| `maya-saas-backend/src/ai-tools/goods-photo-tesseract.spec.ts` | `cc27aa0a7a846536d5d9d013d0e8516e882a640e14c9d4603ae95c50ff2e200b` |
| `maya-saas-backend/src/ai-tools/goods-photo-parser.service.ts` | `ca46382274a5431b16babf260221bc2d37f2ede0c1266269c464090d91bd8eb5` |
| `maya-saas-backend/src/ai-tools/goods-photo-ocr-rows.ts` | `ccf6b1e12955e12aae126561cdc27fcf5c7bc93c21221562a746ca7cbedfd164` |
| `maya-saas-backend/src/config/runtime-config.ts` | `58cea2f2b5ed30dc02393b1c9229e6fdb560820d9e79c2fb73ea024da4c2fb90` |
| `maya-saas-backend/src/config/runtime-config.spec.ts` | `f684fcf6db7662f615b706d516d8695907f4cf02bbc77c76d56f9917121cf96a` |
