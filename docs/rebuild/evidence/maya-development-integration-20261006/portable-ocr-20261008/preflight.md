# Linux-compatible local OCR preflight — 2026-10-08

Recommendation: native Tesseract CLI with two pinned official `tessdata_fast` files. This reuses the existing single-process OCR boundary and avoids another Node worker/dependency layer. Package preparation is now written in the isolated repository, but neither Docker nor native OCR was run by this subagent. Parent separately authorized and downloaded the two models and their license; their checksums below come from that receipt.

## Runtime and exact asset budget

The repository Dockerfile uses `node:24-alpine` for both stages. That tag is mutable. Alpine 3.23 x86_64 is the reference examined here, not a claim about an already built/deployed container. [Official Node Docker source](https://github.com/nodejs/docker-node/blob/main/24/alpine3.23/Dockerfile).

| Component | Download/package bytes | Installed/raw bytes | License |
| --- | ---: | ---: | --- |
| Alpine tesseract-ocr 5.5.1-r0 | 1,993,646 | 4,765,641 | Apache-2.0 |
| Alpine standard eng data 5.5.1-r0 | 10,845,911 | 23,466,654 | Apache-2.0 |
| Alpine standard rus data 5.5.1-r0 | 8,580,956 | 19,920,885 | Apache-2.0 |
| Selected official fast eng | 4,113,088 raw | 4,113,088 | Apache-2.0 |
| Selected official fast rus | 3,861,738 raw | 3,861,738 | Apache-2.0 |
| Selected upstream LICENSE | 11,358 raw | 11,358 | Apache-2.0 |

The Alpine values come from exact official APKINDEX metadata, captured in `preflight-alpine-metadata.json`, not rounded webpage sizes. The standard data packages use upstream `tessdata` 4.1.0; they are deliberately not installed by the prepared Dockerfile. [Alpine package](https://pkgs.alpinelinux.org/package/v3.23/community/x86_64/tesseract-ocr), [official APKBUILD](https://raw.githubusercontent.com/alpinelinux/aports/3.23-stable/community/tesseract-ocr/APKBUILD).

Selected model repository commit: `87416418657359cb625c412a48b6e1d6d41c29bd`.

| File | Git blob SHA-1 | Raw SHA-256 |
| --- | --- | --- |
| eng.traineddata | bbef4675053b5b468cdb477053e28b1c698ba08e | 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2 |
| rus.traineddata | b146cb2263acbc6383f8e92ea0ce759537687bb8 | e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225 |
| LICENSE | d645695673349e3947e8e5ae42332d0ac3164cd7 | cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30 |

Both languages total **7,974,826 bytes (7.61 MiB)**; with license **7,986,184 bytes**. Git blob digests include Git's blob header and must not be confused with raw file SHA-1/SHA-256. [Pinned upstream tree and license](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd).

The native package has 14 direct soname dependencies, including Leptonica, libstdc++, libgomp, ICU, Pango, Cairo, GLib and fontconfig. Alpine includes training tools in the same package. Our exact metadata traversal found 43 unambiguous packages, then explicit `/bin/sh` and ICU alternatives. With BusyBox and `icu-data-en`, package closure is 16,115,345 downloaded / 39,654,687 installed bytes; with `icu-data-full`, 27,432,722 / 68,497,871 bytes. Add the selected models and license. These totals include base libraries already present in the image, are not image-layer deltas, and are not an APK solver or install result. No automatic choice between ICU providers was made. The later actual build must record its selected versions and licenses. All dependency license declarations are retained in metadata; the whole dependency stack is not solely Apache-2.0. Leptonica itself uses BSD-2-Clause. [Leptonica license](https://raw.githubusercontent.com/DanBloomberg/leptonica/master/leptonica-license.txt), [ICU en package](https://pkgs.alpinelinux.org/package/v3.23/main/x86_64/icu-data-en), [ICU full package](https://pkgs.alpinelinux.org/package/v3.23/main/x86_64/icu-data-full).

## Portable WASM alternative

Tesseract.js 7.0.0 is Apache-2.0 and supports Node >=16. The npm registry reports **1,411,341 bytes unpacked** for the JS package. Its required core major is 7: exact `tesseract.js-core@7.0.0` exists and is **45,262,431 bytes unpacked**, Apache-2.0, although the registry `latest` tag observed separately pointed at 6.1.2. The latter's smaller size must not be used in a v7 budget. Direct JS + matching core + selected fast models total **54,648,598 bytes unpacked**, before other dependencies/license. Compressed transfer size and a pinned transitive closure were not resolved; no WASM install was selected. [Official package manifest](https://github.com/naptha/tesseract.js/blob/master/package.json), [core manifest](https://github.com/naptha/tesseract.js-core/blob/master/package.json), [Node support](https://github.com/naptha/tesseract.js#nodejs). Registry metadata, integrity values and dependency names are preserved in the JSON files.

Its dependencies include node-fetch, zlibjs, bmp-js, idb-keyval, is-url, regenerator-runtime, wasm-feature-detect and opencollective-postinstall. The postinstall script is an additional install-time action. An isolated evaluation would require a pinned lock and `--ignore-scripts --no-audit --no-fund`; it has not been performed. Do not assume the MIT declaration on `@tesseract.js-data/*` replaces upstream traineddata Apache licensing; use the directly pinned official files instead.

Node loads worker/core locally, but an omitted langPath triggers CDN downloads. A viable local-only setup must pass fixed local traineddata paths, `gzip:false`, `cacheMethod:'none'`, and image Buffer only; no user-supplied URL/path/language/config. Disabling cache also prevents persistent traineddata cache writes and the cache-refresh retry path. WASM still needs bounded worker lifetime, memory and output checks; portability is not measured Alpine acceptance. [Local installation](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md), [actual language loading implementation](https://github.com/naptha/tesseract.js/blob/master/src/worker-script/index.js), [Node core loading](https://github.com/naptha/tesseract.js/blob/master/src/worker-script/node/getCore.js).

## Native boundary and limits

Proposed fixed CLI input/output: `stdin stdout --tessdata-dir <fixed assets directory> -l rus+eng --oem 1 --psm 6 -c tessedit_create_tsv=1`. No shell, caller paths, caller config, URL input, auto-rotation/OSD, debug output files or runtime asset downloads. Input must first pass the existing single-image Sharp PNG normalization. Capture bounded TSV from stdout; accept only word rows with validated dimensions and convert to the existing normalized top-left word geometry. Retain single in-flight admission, finite deadline, stderr/output caps and child cleanup. [Official 5.5.1 CLI manual](https://raw.githubusercontent.com/tesseract-ocr/tesseract/5.5.1/doc/tesseract.1.asc), [TSV and segmentation documentation](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html).

Fast data is the integer LSTM family and requires OEM 1; it does not support legacy OEM 0/2. Russian and English assets do not imply support for arbitrary alphabets, handwriting, distorted receipts or general document understanding. Accuracy/RSS/latency have not been measured for this proposed path. The five-column deterministic row profile remains conservative: no canonical goods IDs, prices-as-sale-authority, arithmetic or automatic matching. [Official data compatibility](https://tesseract-ocr.github.io/tessdoc/Data-Files.html).

No provider API or paid inference is involved. Costs are local CPU/RAM and one-time build/model transfer. Models and OCR outputs remain suggestions requiring existing explicit review; this work does not grant mutation authority.

## Prepared source and remaining gates

Prepared files: `scripts/goods-photo-ocr-models.json`, `scripts/prepare-goods-photo-ocr-models.mjs`, Dockerfile, backend `.dockerignore`, repo `.gitignore`, package.json. `--fetch` is explicit preparation only: three pinned HTTPS locations, no redirects, 20-second per-file deadline, exact byte/hash verification, exclusive staging and all-files directory publish. Existing invalid assets refuse replacement. `--verify` performs no network access and rejects unexpected files/symlinks/hardlinks. Docker installs native tesseract without large standard language APKs, copies builder-created verified assets, then verifies them again; it does not enable the feature.

Root must run syntax/checksum and negative preparation checks, then actual native synthetic image proof. Actual Linux build/run remains blocked by the absent local Docker/Podman/Colima runtime; neither the prior Vision proof nor a future Mac Tesseract proof is Linux acceptance. Record image digest/architecture, APK resolution, offline behavior, no-photo-files, output bounds, timeout cleanup and genuine image→words→rows before closing that gap. No service, test, OCR, package install or container launch was executed by this subagent.
