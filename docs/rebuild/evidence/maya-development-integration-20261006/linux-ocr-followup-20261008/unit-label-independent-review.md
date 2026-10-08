# Independent review: goods photo unit-label availability — 2026-10-08

**Qualified static approval; no blocking finding.** Reviewed only the two-file uncommitted delta over `a80018042f1774a2923ef63d2fded2015765d860`, with read-only checks of its existing headless/source contract. No tests, OCR, services, network or provider actions were executed; repository files were not edited.

The prior expression suppressed the write-off option whenever its ID equalled the sale-unit ID, even when the sale-unit label was null and no sale option had been admitted. The new expression first collects independently available (non-null ID and label) candidates, then deduplicates that available list by exact ID. This exposes the valid write-off label without adding an option with unknown identity or label. When both labels are unknown, no option is shown and preparation remains disabled.

Unit selection remains exclusively the existing button callback `editReview({ unitId })`. Rendering performs no port call, OCR-to-unit conversion, default choice, network read or mutation. Existing lock/disabled handling, explicit purchase-price confirmation, and canonical receipt/approval/source checks are unchanged. The existing headless `knownUnit` predicate already permits either exact catalog ID with its own non-null label; this fixes presentation consistency with that owner.

The two new tests are meaningful for this delta: same-ID/null-sale-label leaves exactly one initially unselected option and no calls until an explicit click; both labels null leave no option, no inferred OCR unit and no calls. They are shallow component/callback regressions, not a new browser, provider or receipt-execution proof. This review did not rerun the parent's tests or independently qualify pending build/type evidence.

| Reviewed file | SHA-256 |
|---|---|
| `maya-carrier-react/src/chat/GoodsPhotoPanel.tsx` | `63c16e72d8de992824b9b675bb2f7442f453f8b0317eb14decbaeb66259fbf2f` |
| `maya-carrier-react/test/goods-photo.test.mjs` | `3a4699ad9de9bf843e7496cbff799bc92a663c7fc3a1549fa64860c6121f191b` |

No authority, schema, retention or provider-write permission is added. F32b/F74b status is unaffected. Linux image execution and existing provider permission blockers remain outside this fix.
