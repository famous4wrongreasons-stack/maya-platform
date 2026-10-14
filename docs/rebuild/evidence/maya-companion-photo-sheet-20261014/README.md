# Companion photo sheet — scoped local evidence

Final tested candidate: `bdba69cdf583ac8970cec699a60a0cd6aa33e376`.
Source branch: `codex/maya-local-crm-setup-20261010`.
Product change: `b3c9ad3fc33960ab2e83296b3d32e376e087269c`.
Parent: `32bbed680b6c50319b52e74a0404aaef0f992d2e`.

[Checkpoint](../../MAYA-COMPANION-PHOTO-SHEET-CHECKPOINT-20261014.md) explains scope,
the existing owners, verified behavior and remaining work.

- `summary.json`, `runner.py`, `logs/`: fresh final-HEAD commands, status, timings
  and original log hashes; clean at start/end, no code change during the run.
- `RESULTS.json`: precise counts and limits. Runtime 846 pass + 7 skip; carrier
  198 pass; five browser suites 386 checks; packaging 18; NS-1 16.
- `browsers/`: isolated Chrome receipts using actual emitted React/runtime and
  intercepted finite synthetic HTTP. No real backend/provider/OCR/document.
- `screenshots/`: synthetic final payload at 320/393/1280px, review and increased
  text. They contain only owned fixtures, not salon/user data.
- `mutations/`: separate clone baseline → removed Escape abort → restored proof.
  Baseline/restored 38 pass; mutant fails the expected close/cleanup assertion.
- `development/`: initial harness failures and following developmental receipts.
  The first final run failed on loopback request ordering after 48 schedule checks;
  the final committed test waits for actual server receipt. No product timeout or
  authority change, and no previous partial pass substitutes for final results.
- `MANIFEST.json`: original local paths, sizes, source SHA-256, normalized archive
  SHA-256 and omitted-artifact reasons. Original files remain untouched. Text copies
  have trailing whitespace normalized; screenshots are byte-identical.
- `SCAN.json`: bounded secret/PII scan and explicitly reviewed synthetic matches.

The synthetic PNG-shaped upload bytes exercise transport only. They are not a
real invoice and are never decoded by OCR; only their hashes are retained here.
No copied dependencies, build directory, browser profile, auth wire dump or real
customer record is archived.

## Visual source lock

| Reference | Reused visual contract | Existing functional owner |
| --- | --- | --- |
| Owner package `screens/19-attachments.png` | White bottom sheet, 22px upper corners, handle, title, backdrop | `GoodsPhotoPort` / `GoodsPhotoView` |
| Current `VoiceSheet` / viewport rules | Native dialog, visible viewport, focus return, safe area | Carrier presentation only |
| Existing `GoodsPhotoPanel` / picker | Manual validation, bounded image input, uncertainty copy, explicit clear | Runtime GoodsPhoto + finite goods transport |

Generic file/media store and prototype demo options are not derived from this
visual reference. Approval and Action Engine remain in the canonical chat path.

This is not a release certificate, full backend/Platform CI run, complete mutation
corpus, actual OCR/provider acceptance, native-device proof or production deploy.
All real external effects, retained DB access, Keychain access and iPhone changes: 0.
