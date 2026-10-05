<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: a43026b145c8ebb869e0a279549c2a5f22375127a06c838a117ebf4b5e931099 -->

# L14 — current authoritative evidence, with provenance

Candidate: `2915ab8e7c089e2c1f39848cb795940e5267c119`.

The historical `docs/rebuild/WIDGET-GATE-FBE2E-CLOSURE.md` is retained unchanged. Its L14 description belongs to the earlier implementation; it is not the current contract.

## Canonical persistence boundary

`maya-saas-backend/src/widgets/stores/intent-audit.store.ts` uses tenant + intent-token identity for the receipt upsert. The update branch is empty. A repeated adjudication cannot replace an existing `actionReceiptRef`; terminal publication derives from the durable returned receipt, not retry arguments. Reconciliation permits a one-time transition from ACCEPTED with a null reference, via a tenant-scoped compare-and-set and an AE COMMIT record.

`9085c2bbbe256c670a2836445a2c92265d139cb7` strengthened the terminal publication predicate to exclude a different already-confirmed COMMIT and restricted reconciliation to AE COMMIT ownership. The empty idempotent upsert already existed; this report does not attribute its introduction to that later commit.

## Reachable and defensive proofs are distinct

1. Real HTTP/PostgreSQL: COMMIT followed by canonical CONTROL Dismiss preserves the original confirmed terminal line, receipt reference, appointment and ActionExecution. This is exercised by the full H2 live suite and by the exact compiled-runtime L27 FBE2E in this run.
2. Store-level idempotent retry: `WR-L22 idempotent retries derive the terminal outcome from the existing durable receipt` checks empty update and deliberately contradictory retry fields. It proves immutable retry, not arbitrary-input rejection on first creation.
3. Adversarial persistence: the H2 `[RI]` test explicitly injects a second COMMIT record and attempts to publish a different canonical receipt. This is a defensive database/store proof, not a claim that the current production minter can emit that second COMMIT. The first confirmed terminal line must survive.
4. Claude runtime regression in `maya-chat-shell/test/intents.test.mjs` injects a changed reference through a counting `SubmissionPort` double. Its comment naming L14 does not turn that input into a reachable backend scenario. It is admitted only as a defensive test that distinct canonical identities are not collapsed by text matching. No live re-referencing scenario is manufactured.

## Fresh proof admission

Exact former failing L27: PASS, `receipts/fbe2e-l27-postcommit-dismiss.receipt.json` and `receipts/l27-postcommit-dismiss-observations.json`.

Full backend control: PASS (587 suites / 5603 tests), `receipts/backend-full.json`. Full live control: PASS (37 suites / 406 tests), `receipts/widgets-live-full.json`, including both H2 cases and the explicitly defensive injected-record assertion. WR native mutation result: PASS, 23/23, admitted by the complete fresh canonical assembly. The proof index binds the fresh results and hashes. Historical mutation receipts are not admitted for this candidate.

Fresh exact test titles, report hashes and L27 observations: `receipts/l14-fresh-proofs.json`. The prior report is narrative provenance only; this candidate has independent fresh suite and probe receipts.
