# Current disposition after final owner decisions

Prior checkpoint: 16 false = 9 EVIDENCE_MISSING + 6 OWNER_DECISION_REQUIRED + 1 INTEGRATION_OWNED. The new matrix is computed by `recompute.mjs` only after receipt validation; historical snapshots are unchanged.

| Clause | Existing implementation owner | Current proof / disposition |
|---|---|---|
| G6-13 | Gate 6; CommitBookingAdapter; EntitlementsService; EffectRouterService; Gate14DisagreementMetric | AR-G6-REVOCATION follows a production catalog → selectors → draft → COMMIT lineage. A guarded proof fixture stages a real entitlement revoke under the same tenant lock, observes the real request waiting at canonical admission, then commits the revoke. HTTP and independent BIN both refuse at Gate 14, record exactly one metric increment and no appointment/ActionExecution. AR-M17/18/19 kill lost serialization, metric and admission fences. Eligible for L after paired provenance verification. |
| G7-FR6d | Gate 7 C9a/C9b/C6a; allowlist startup owner; K20 emittable | AR-FR6D-NONMONEY is a genuine production COMMIT positive. AR-FR6D-SCOPE checks all ten live allowlist rows and the PAYMENT_HANDOFF gap. Gate 7 M7-21/24/25/40 cover gap-block, MONEY predicate and F80 consent/pairing duties; AL-M1 covers the startup MONEY veto; TAB-M6 covers payment emission. The full relevant batteries must pass. Programme §4.5 Money explicitly says “Evidence for FR-6d is E-INDEP or mutation only.” The former report incorrectly made E-INDEP the only possible closure. Current admission retains BUILD/RI classification for those negatives; it does not claim a live financial transfer or invented financial producer. |
| G7-5 | Gate 7 producing-record loader; confirmation minter | EVIDENCE_MISSING: non-draft cancel/reschedule requires a qualifying initial production action and its consumed predecessor, absent from this checkout's source inventory. Existing direct-emitter tests remain RI. |
| G7-BOOK1 | Gate 7 canonical subject derivation | EVIDENCE_MISSING: create is proven; no qualifying paired production-minted cancel/reschedule journey. |
| G11-I9 | Booking noun owner adapters; Gate 11 BOOK.4 | EVIDENCE_MISSING: exact appointment reread on the same missing non-draft production ancestry. |
| G13-I3 | Canonical intent consumption and F74/F75 producing-record identity | EVIDENCE_MISSING: create single-use/replay is proven; non-draft producing identity needs the production source above. |
| G12-R1b | WidgetProjectorService.composeNavigate / ThreadPageService | EVIDENCE_MISSING: detail/w mechanics exist; current schedule/account production recipes target s. No new product destination or trigger was invented. |
| G12-I11 | Projector retained canonical read capability and erasure owner | EVIDENCE_MISSING: needs the same qualifying detail/w production mint; RI source rows do not establish it. |
| G13-R2 | EffectRouterService.navigate → canonical projection/resolution | EVIDENCE_MISSING: same detail/w production-source dependency. |

## Owner-settled scope duties

G8-3 A, G8-4 A, G8-5t A and G8-DENY A permit U acceptance for the current closed-input scope. The complete production input recipe inventory remains enum/ref/boolean, with empty canonical bounds/normalizer registries. D8-ABSENCE and D8-MINT pin that absence; D8-BOUNDS, D8-NORMALIZER and D8-SAFE-TEXT demonstrate refusal without exposing the submitted value; D8-MECHANISM and the D8 mutation battery exercise the retained mechanisms. D8-U is explicitly an RI ledger, with no fabricated record, trace or HTTP traversal claim. The four duties and exact owner basis are recorded in `u-proofs.json`.

G6-6/G13-R8 remain false as ACCEPTED_STOP under D-H A. HANDOFF is not silently excluded from the 165-clause denominator. No receiving endpoint is added. 9.6 remains false as INTEGRATION_OWNED; no second conversation writer is added. There is no unchosen owner option in this packet.

## Verification scope

The new source inventory rechecks the actual production files. Booking source and NAVIGATE source/projection files are unchanged from the previous inventory; their missing production ancestry is still real. Entitlement/revocation runtime changes are explicitly identified. Fresh backend regression and new proof receipts validate this branch's work; unrefreshed historical gate claims are not represented as a fresh full-release certificate. Remote CI, the combined carrier artifact and real external effects remain outside this checkpoint.
