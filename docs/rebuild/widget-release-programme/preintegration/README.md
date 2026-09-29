# Widget Release Programme — pre-integration evidence

Current result: **19 false clauses** (12 evidence, 1 implementation/presentation dependency, 6 owner decisions); **4/15 strict, 7/15 with U**. This overlay does not accept OD-3, authorize release, change planned/readiness, or grant `widgets.runtime`.

- `CLAUSE-MATRIX.md` / `clause-disposition.json`: all 31 original false clauses, implementation owners, added proofs and exact remaining boundaries.
- `current-audit.json`: current schema-/2 overlay. The historical audit and its builder are unchanged. Inherited admissions retain their historical provenance and are not freshly recertified by this overlay.
- `NAVIGATE-CURRENT-EVIDENCE.md`: current implementation evidence for the three stale `built:false` annotations. All three still lack whole-clause L proof.
- `DECISIONS.md`: final OD-3/4/5, self-booking and authority dependency packets. Recommendations are not selections.
- `owner-identity.json`: sanitized read-only production observation. The explicit same-human link is historical and revoked; no current verified booking binding exists.
- `fbe2e-disposition.json`: 13 closed, 6 partial, 9 open. No presentation acceptance is claimed.

## Recompute from captured evidence

From the repository root, using the exact backend source target recorded in the receipts:

```sh
node docs/rebuild/widget-release-programme/check.mjs
node --test docs/rebuild/widget-release-programme/preintegration/current-audit.test.mjs
node docs/rebuild/widget-release-programme/preintegration/current-audit.mjs \
  --evidence docs/rebuild/widget-release-programme/preintegration/evidence \
  --mutations docs/rebuild/widget-release-programme/preintegration/mutation-receipts \
  --source-head 000ed08f3769f8ec78f634c7c10f4643e2d3fe11 \
  --out /tmp/widget-current-audit.json
```

The first command pins the historical baseline and checks the complete branch against current Claude ownership (including his uncommitted paths). It intentionally continues to report that historical baseline's 31 false clauses. The third command recomputes the current 19-clause overlay; it runs the evidence verifier itself and refuses backend source drift, altered manifest/declarations, wrong-target or red-baseline receipts, missing pairs and undeclared promotions.

`current-audit.test.mjs` uses fabricated in-memory inputs only to prove rejection logic. Those inputs are never release evidence. Actual proof lives in `evidence/` and the green, scoped mutation receipts.

## Reproduce the executable journey

Use Node 22 and an empty evidence directory with the guarded disposable loopback proof database. Replay only existing migrations. Never use a production URL or production credentials. The only entitlement grant remains `Fixtures.grantFeature` inside the proof-DB guard.

From `maya-saas-backend`, set `DATABASE_URL`, `WIDGETS_EVIDENCE=1` and `WIDGETS_EVIDENCE_DIR` to that empty directory, then run:

```sh
npm run test:widgets:live -- --testPathPatterns='(wr-release|e1-production-trigger)' --testNamePattern='(WR-CREATE|E1-T2B-CLEAN)'
npm run build
npm run test:widgets:http
node scripts/widgets-evidence-verify.mjs --dir "$WIDGETS_EVIDENCE_DIR"
```

HTTP and BIN are separate processes with independent server-minted records. Source fixtures create only internal-calendar business source data and identity facts. The real catalog route mints the root; successive actual widget requests mint successors. The new log records the persisted predecessor relation. The verifier requires unique, durable, same-entry/process lineage to a production trigger, and rejects orphan, self, cyclic, cross-process or duplicate lineage. Logging changes no admission, policy, entitlement or lifecycle result.

The proof covers create DRAFT/COMMIT and canonical ActionExecution persistence. It does not certify reschedule/cancel, all effect/tier combinations, external YCLIENTS effects, voice, the React renderer or carrier acceptance.

## Verification boundaries

`npm test` retains every regression check. `npm run test:backend` excludes only the explicitly tagged static-shell integration check. `npm run test:integration` retains that check and currently fails with ENOENT for the separate `maya-chat-shell/dist/web` artifact. It is an **INTEGRATION-ONLY CHECK**, not a backend failure. No shell artifact was copied or built and no shell source/assertion was changed.

All 398 mutation declarations were exercised against their declared killers and unchanged per-mutant steps. Each scoped receipt discloses its filters. The canonical CI assembler rejects those restricted receipts as full CI certification, as proven by its counterfactual tests. Two Gate-6 declarations remain intentionally `pending` (M17b/M18b), and one Gate-10 declaration is equivalent; these must never be reported as observed kills. Final counts and statuses are in the checkpoint/verification receipt.

The Widget Contract CI repair adds Prisma generation before compilation. Its advisory/blocking policy is unchanged. Local success is not a fresh GitHub Actions receipt.

Historical receiver/activation policy, date/window ownership, tap-as-delivery, and historical evidence admission remain owner decisions. No new schema, authority, production grant or Chapter 10 work was introduced.
