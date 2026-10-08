# Original attempt 1 source snapshot

Copied before the blurred-price scenario or unknown-unit assertion qualification was added. The three executable-source hashes below match `/tmp/maya-linux-ocr-20261008/actual-attempt1/source-hashes.json` exactly. Files include the parent's pre-run `fs.realpathSync(argv[1])` CLI fixes. The failed actual report and original corpus images remain at their original paths; they were not overwritten or re-evaluated during this task.

```text
52862f81e5af5656298acf88c73ad76000867b048758dd82f987c18c0dd2f536  corpus-plan.mjs
325fb2953710906221ab235406cf6529ba9166805a3f0da45a434838b7505e4f  generate-corpus.mjs
7fd3e8ec4291565ec52927921bbc8bf17fa97c8335680ef92721d1d4f0a9e559  assert-corpus.mjs
66024bf3b87249e49479371696e6a766e10f1caf6981d1dbc5002ad8b6e27c7c  CORPUS-PLAN.md
```

Parent reported real Tesseract unit misreads (`л` → `n`, `кг` → `Kr`) even at high scores. Those incorrect non-null literals remain failures under both old and revised assertions. The revised owner policy may return an unknown unit as null; only a **new actual run** can qualify that as safe manual review, never exact transcription. Original expected unit labels stay unchanged.
