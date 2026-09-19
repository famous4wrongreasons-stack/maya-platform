# Independent review disposition on recovered final code

Code reviewed: `df6c3a5a`; comparison base: `a2f98a52`. This is a review of the recovered change, not authorization for new implementation. Execution results are recorded separately; source inspection alone is not a test PASS.

| Finding / recovered change | Independent source assessment | Executable check / limit |
|---|---|---|
| `101040ec` Gate 11 noun applicability | Own-effect set is limited to COMMIT/DRAFT/REQUEST_APPROVAL; empty CONTROL/REFINE uses P, while non-resolving frozen nouns are superseded. It no longer incorrectly borrows the actuating row for every effect. | `gate11.spec.ts`, declared Gate 11 battery; totality table remains binding. |
| `ff6e695d` missing mechanism rendering | `reasonTextOrNull` returns null for `mechanism_absent`; no borrowed PROVIDER_SILENT business assertion. Existing other refusal texts retain the existing mapper. | REN-1/REN-3/REN-3b; original DEV-W1-2 explicitly records this interim response choice. |
| `0b384c38` D-10 AST fence | The fence reaches the actual gate pipeline, including input-validation/lowering seams, instead of trusting a directory name. Its planted negative cases exercise the added seam. | D-10 architecture assertions and declared mutation battery. |
| `8cee26ba` ambient Prisma reads | Gateway's `findProducingRecord` and lowering-source read use the supplied transaction; gateway and Gate 8 pass that transaction. The out-of-transaction fallback remains syntactically visible and is not used as transactional authority. | D-1-TX-a/b/c/d; independent body-only counterfactual in `gateTX-recovery.json`. |
| `4da8954f`, `01240ce1` M7-8 killer/anchor | The killer exercises tenant isolation in the producing record method; the anchor was adapted to the transaction change without changing the intended defect. | M7-8, T7-PRODUCING-SCOPE, load-time unique-anchor verification. |
| `c354a2a4` seal key boundary | Constructor ratchet prevents gateway key-holder injection and pins the single provider site. It does **not** pretend that moving the providers to a distinct module already happened. | SEAL-5c and its injected counterexample; original DEV-W1-3 remains a disclosed Wave 2 P-MINT-CORE duty. |
| `3da48069` dead killer IDs and evidence classification | Runner resolves real test titles (including `it.each`), not a matching describe label. `[RI]` and `[G-SYNTH]` are identified rather than being presented as unknown/live proof. | Battery load and runner self-test; all 19 batteries. HTTP entry by itself still does not prove production mint provenance or a paired BIN claim. |
| `2720435e` G2 independent-session test | The test now submits through the gateway with two actors lacking a transport session and requires Gate 2 refusal. The inaccurate independent-entry claim was removed. | G2-IN live tests; do not promote this into a production-trigger or typed-chat parity proof. |
| `3c5081ae` unknown battery selector | Unknown `--gate` is rejected instead of producing a false EMPTY success. | Runner self-test and exact declared shard inventory. |
| `5eb14456` blind transaction negative | AST assertion examines the production method body. Keeping a `tx` parameter is not enough to satisfy it if the body reads via ambient Prisma. | Independent exact defect reintroduction, retaining signature and call site; D-1-TX-b itself must fail. |
| `6a1349fe` proof database guard | The existing shell/workstream proof database is explicitly denied. Recovery instead owns a new cluster and named databases. | Guard tests; no connections to the pre-existing clusters. |
| `620bfa1b` Gate 6 held clauses | Both 6(d) (`allowedActorRoles`) and 6(e) (EntitlementsService `requiredFeatures`) are disclosed as held pending U6-L3. The held branch still refuses. This is not a conformance promotion. | `gates/gate6.ts` and `gate6.spec.ts`; audit/contract byte comparison and gate audit checker. |
| `df6c3a5a` transaction slot reach | D-1-TX-a derives the last transactional slot from the production pipeline rather than pinning the expected range it should independently verify. | D-1-TX-a source derivation and negative extension tests. |

There are 14 review-fix commits (including two separate corrections for M7-8), plus one earlier U4 constructor correction. The historic “nine fixes” summary is not a reliable commit count. Finding 10 in the recovered original review is missing full post-merge mutation execution: per-unit runs and an incomplete merge battery do not prove the merged tree. Its old “run in this phase” claim must be replaced by the new complete results, never accepted by repetition.

## Non-weakened evidence

The contract, conformance audit, clause inventory, Prisma schema and lockfile are byte-identical to the initial remote checkpoint. No audit clause is promoted by this recovery. Current live conformance remains **0/15**. The earlier “6/15” belonged to an invalid V1 module-presence assessment; Decision Sheet 07 and I-AUD0 already corrected it before this recovery.

The full suite, live tests, BIN tests and mutation runner answer different questions. Neither 530 unit suites nor 10 binary cases makes all gate clauses live-conformant. In particular, fixture-minted HTTP tests are not production-trigger mint evidence. Keep the existing Wave 1 / later-wave boundary intact.

## Disclosed unfinished review duty

Original DEV-W1-6 / original review §4.1 records a Gate 7 mutant for the pipeline-wide `T-SRC-INV30` fence as still owed. On recovered `df6c3a5a`, Gate 8R M21 names `T-SRC-INV30-b`; `gate7.json` does not contain that separate counterfactual. This recovery runs every one of the 19 declared batteries without silently adding a twentieth battery or changing expectations. A clean declared-battery result would not erase this disclosed coverage debt. The unused `ACTUATING` export is also explicitly retained for Gate 8R M2b's live counterfactual, rather than deleted as unreferenced code. Neither item is falsely marked implemented here.
