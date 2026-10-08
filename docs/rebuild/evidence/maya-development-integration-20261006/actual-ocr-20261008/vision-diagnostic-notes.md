# Scratch Vision diagnostic — no production changes

The failed native worker's 35-byte stderr SHA256 exactly equals `goods_photo_ocr_recognition_failed\n`. No OCR words were returned. This identifies the sanitized recognition error, but not its underlying cause.

The scratch clone `goods-photo-vision-diagnostic.swift` preserves the default request's revision/languages/recognition level/correction settings and adds bounded NSError domain/code/description/underlying output around `perform`. This error detail must never enter production responses or logs. Root compiled the clone separately and owns its run-only driver against the known synthetic image; the unused `vision-diagnostic.mjs` was prepared earlier as compile+run and is not the selected launcher.

The installed SDK supports a possible CPU investigation:

- On macOS 14+, `try request.supportedComputeStageDevices` returns `[VNComputeStage: [MLComputeDevice]]` for the current configured request.
- The SDK's Swift `MLComputeDevice` enum includes `.cpu`, `.gpu`, `.neuralEngine`.
- `request.setComputeDevice(device, for: stage)` is the supported assignment API. Use only a CPU device actually returned for that exact stage, with the full recognition request configuration already applied. The setter does not validate compatibility immediately; request execution validates it.
- To test CPU-only behavior, require a CPU device for every returned stage. Do not silently leave a stage on an automatic GPU/ANE default or choose from global `allComputeDevices` instead of the request's supported list.
- `usesCPUOnly` is documented as exclusive CPU execution but is deprecated from macOS 14 in favor of per-stage assignment. The current host is macOS 26.5.2. No deprecated production fallback is proposed.

The diagnostic clone contains an optional `--cpu` branch implementing this SDK-supported investigation. It has not been run. First collect the unchanged-default underlying NSError. Only if the failure implicates compute-device initialization and a separately authorized CPU diagnostic succeeds should a minimal production diff be considered; preserve revision 3, RU/EN languages, no language correction/auto-detect, bounds and sanitized production errors. A language-list success alone is not OCR execution acceptance.

Exact local primary SDK paths, hashes and line references are in `vision-compute-sdk-refs.json`. No SDK API/network/image execution or compilation was performed by this agent in this diagnostic task. Frozen repository sources remain unchanged.

## Later observed resolution

Parent reran the unchanged production helper in an explicitly approved system context. `actual-attempt2/actual-parser.json` contains a successful real native worker (exit 0) with Russian words, names and numeric cells recognized. The remaining proof assertion differs only in the second provisional unit label: expected `шт`, observed `шТ`. Parent retains the actual OCR literal and adjusts only the unit-label comparison to be case-insensitive. This is not canonical unit resolution, and `price_kind`/row `confidence` remain null. The parent also reports that the optional CPU diagnostic still failed inside the sandbox; no CPU/runtime fix is needed. This diagnostic task made no production changes. Full remaining actual-image proof is owned by the parent.
