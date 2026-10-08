# Independent review — client dossier checkpoint, 2026-10-08

**Qualified PASS. No unresolved blocker within this finite reviewed slice.**

Reviewer: `/root/checkpoint_review`, independent of the dossier implementation. Runtime candidate: `6996a22cfd8b4a25f245bb61344560c6de902b27`. This checkpoint combines prior independent static code review with read/hash verification of existing evidence. The reviewer did not run gates, services, HTTP/browser requests, SSH, model/provider calls, migrations or production operations, and did not edit runtime/worktree files.

## Source and harness binding

- All **1,850** entries in `browser-attempt2/source-hashes.json` match Git blobs at the candidate. Its compact JSON SHA256 matches `manifest.sourceSha256` (`10fd9f142357cb1137df27b8285999ec6db47b3767022b5a81e2acbbc9233d8b`). No source mismatch.
- All **9** source files recorded by `local-attempt3/report.json` match the same candidate; these include TypeScript and browser MJS files. The local gates ran against dirty worktree bytes at parent commit `fbf47a6b`, before the final commit. File hashes bind the executed bytes to `6996a22c`; this is **not** a claim of a post-commit local rerun.
- The browser manifest names the candidate at start/end and records `sourceUnchanged=true`, `harnessUnchanged=true`. The local report records matching start/end source and harness hashes.
- Exact final local launcher is **`local-gates-v2.mjs`**, SHA256 `b536d1475ce6a2890bced35ec65377d35e9a4b02cfd7668d3b3ff425a6e040cb`. The separate `local-gates.mjs` belongs to the earlier attempt and was not substituted for final provenance.
- `native-proof.mjs`, `owned-stage.mjs`, `loopback-only.cjs`, and the committed canonical `scripts/c9-occupancy-proof.mjs` match the recorded browser/local hashes. Verification details and SHA256 of **30 final raw artifacts** are in `independent-artifact-verification.json`.

## Executed evidence verified

`local-attempt3`: **433 tests / 5 suites passed**, zero failed or pending tests. Browser guard: **5 passed**, zero skipped. All eight recorded local commands completed: guard, targeted unit, backend types, widgets-live types, changed TypeScript lint, contract types, contract check and K3. Contract checker is **31 passed / 4 explicitly pending**, not full future-package completion; K3 is **10 passed**.

`browser-attempt2`: **1 Jest test / 1 suite passed**, zero failed or pending; six checkpoints and six PNG artifacts: `ambiguous`, `unique`, `none`, `unavailable`, `reload`, `revoked`. Actual React browser actions traverse real HTTP/PG/C9; source search/history and model selection are explicitly synthetic fixtures.

- The real chat sends `Сколько визитов у 7346`, then `Расскажи про иван петров`. Server execution binds raw `7346` / `иван петров`, overriding the public model placeholder. The fixture asserts private identities, short digits and private history do not enter the scripted model input.
- Ambiguous search performs zero history/loyalty/recency reads. The explicit unique refinement performs exactly one of each; recency invokes the real owner with supplied synthetic history, while loyalty is deliberately unavailable.
- Four current chat reads produce four completed C9 runs/settled dossier READ receipts and four scripted model selections. Total search calls are **4 own chat searches + 1 foreign direct-tool search**; they are not four global searches. Real model calls: zero.
- The unique answer contains qualified source facts; ambiguous, not-found and unavailable results remain distinct blocked responses. No candidate identity/list is returned. Replies have `action=null`, with no mutation widget or extra final-model call.
- `browser.observations.reload.exactUniqueDossierRetained=true`; the exact unique answer is present in the reloaded DOM text. History reload does not repeat model/source/C9 work. This is reload/re-login persistence, **not an application or PG restart proof**.
- Actual CLIENT authorization denies the direct tool with HTTP **403**, before handler/source access. Foreign owner receives HTTP **201** from its own empty synthetic source; own-tenant source and downstream reads remain zero. This proves authenticated principal routing into the domain port, **not native provider identity isolation**.
- After membership suspension the actual chat receives **401**; counts remain four model calls/four own search reads, with no new downstream reads.
- Every checkpoint preserves the business snapshot; the fixture write recorder reports no scoped business writes. Recorded action executions, provider fetches, business effects and outbound notifications are zero. `unexpected=[]`; browser interception error/blocked lists are empty. These are scoped fixture observations, not a measured universal network-call census.

## Independent review findings closed

1. **Supported-form privacy gap.** The initial masker covered only “Досье…” / “Что за клиент…”, while the server accepted “Сколько визитов у 7346” and generic recognized-name requests. This exposed a short private query / unknown surname to model input. The final shared `clientDossierSelection` owns both the query and its private span; supported client-specific forms and recognized generic client forms are masked consistently. Model-supplied queries cannot select a client without a server-established query. General weather/time-management requests retain their text and do not acquire a client preset/hint. Existing name recognition is explicitly finite, not universal PII detection.
2. **Long-capture fallback privacy gap.** An over-80-character captured description with a valid phone fragment formerly fell through to masking only that phone. The final selection retains the complete captured private span independently of query validity. It selects valid phone digits within that span; an invalid name without a valid phone has `query=null`, is still masked, and produces clarification without runtime execution. The added long-phone and overlong-no-phone regressions are part of the candidate and final local gate.
3. The initial browser reload check covered only the last source-unavailable reply. The final fixture additionally verifies the exact successful dossier reply after reload.

The ambiguity check precedes all candidate history/loyalty/recency reads. Old first-match evidence with multiple matches, stale evidence and evidence missing a unique-match count are blocked by the presenter. The completed private READ returns through server composition before any subsequent model call. Existing roles/tenant policy, C9 and mutation ownership are preserved; presentation grants no authority.

## Multi-company proposal review

Reviewed `docs/rebuild/MAYA-YCLIENTS-MULTI-COMPANY-SCHEMA-DELTA-20261008.md` as a **proposal only**, including the final nullable-integration clarification. It preserves one tenant A17 credential owner, tenant-wide generation and global disconnect. Company-qualified identity and separate source access grounds address the documented cross-company reconciliation/identity problem; unresolved legacy identity is not silently attributed or merged.

Current `package5-wave3.service.ts:1376–1405` globally unlinks provider staff, disables non-owner derived access, revokes related sessions and physically deletes `CrmIntegration`. The proposed same-transaction closure of all child sources/access grounds, detachment of only revoked historical source rows, then deletion of the integration/secret is compatible with that lifecycle at the proposal level. Active source rows must retain the exact current integration. Historical identity links must not be cascade-deleted or automatically revived on reinstall.

This review **does not approve the schema or migration**. FK/delete mechanics, tenant-qualified nullable relations, final consumer inventory, legacy attribution/cutover and relevant negative checks still require the stated exact schema gate. No new retention/purge policy, partial disconnect, independent credential owners or multi-company runtime is accepted by this checkpoint.

## Cleanup and limits

All **8 local** and **4 browser** owned process-group records are closed, absent and exit-zero, without recorded errors. The browser manifest records `clusterStopped=true`; `pg-stop.log` reports successful shutdown, and the recorded owned cluster has no `postmaster.pid` when read during review. No shared service was started or stopped by this reviewer.

Remaining limits: synthetic CRM domain-port search/history, unavailable-loyalty fixture and scripted model only; no native YCLIENTS adapter/A17 identity acceptance, real model/provider acceptance, production/site acceptance, broader branch/actor matrix, restart proof, universal PII recognition, visual/design acceptance or C10/autonomy completion. The existing native YCLIENTS search-error swallowing gap is explicitly outside this domain-port proof. The earlier browser attempt is intermediate and does not substitute for the final candidate evidence.

Reviewed proposal SHA256: `2b5a59f8cf44c9ad7ae8571b55a7398ddfe3927140abbf5e403de3befc1c4476`.

Supporting verification SHA256: `eb7f2d31b8374968526d88137da38014775d7a012ae1033fe4c5e302c70a948c`.
