# Goods photo review — qualified local evidence

Runtime: `3829590932f7efb456438a0d94446f9e6eb6fca1`, based on `071a825a4c1ed8ef615ed3024ba09b6e9a78be7b`. [Useful behavior and limits](../../../MAYA-GOODS-PHOTO-REVIEW-CHECKPOINT-20261008.md).

The successful proof uses the actual current React build, existing HTTP controllers, C9 READ owner, persisted canonical approval and AE, on fresh owned local PostgreSQL. Extraction, provider transport and receipt context/dispatch are explicitly synthetic. Default OCR remains unconfigured. No real document, model, provider, A17 activation, production or website acceptance is asserted.

## Executed checks

| Evidence | Result and qualification |
| --- | --- |
| `local-attempt2/` + `local-attempt3/` | PASS union: backend 171/171 (8 suites), shell 143/143, presentation 13/13; types/lint/builds, ratchets 61 refuse / 43 admit; contracts 31 pass / 4 pending; K3 10/10. Runtime hashes shared by both runs match. Attempt2 itself remains failed. |
| `guard-tests.log` | 5/5 finite browser network guard tests. |
| `proof-types-03.log` | Exit 0, empty log; standalone proof typecheck after exact rejection-READ fixture correction. |
| `browser-attempt4/` | PASS, 20 named checkpoints. Four native GETs, three injected parser calls, three approval records, one synthetic effect after explicit canonical approval. Zero outbound/unrelated writes. Actual HTTP 201 review response loss leaves a pending proposal, not AE UNKNOWN. Cancellation, late result suppression, reload and current revocation checked. |
| `http-attempt1/` | PASS, 10 named checkpoints. Default parser 503, source drift 409 before C9/source/approval, revocation during parser and byte clearing. Two native GETs; one synthetic effect, including explicit approval replay with no second effect. |
| `independent-review.md` + hashes | Qualified independent code review of 39 source/test/build files. Generated tracked manifest separately build-verified. Review fixes include AST ratchet and shell lifecycle races. |
| `independent-proof-review.md` | Separate read-only audit of successful proof, source binding and cleanup; see stated coverage and limits. |
| `final-source-audit.json` | Current and committed source bytes match both successful proof manifests. All 18 owned proof groups absent, all five owned clusters stopped. |
| `archive-sha256.json` | SHA-256 for every archived file except itself. |

The browser and HTTP manifests bind launch-time source bytes and an unchanged committed HEAD. Their `harness/` directories preserve exact scratch scripts/configuration and tiny synthetic input images. Scripts retain original absolute paths for auditability; they are not a portable runner or a grant to start services. `proof-plan.json` is the unchanged preparation plan, not the final result. The result lives in each manifest and observations report.

Current React screenshots are in `browser-attempt4/output/playwright/`. Screenshots were inspected. They prove rendered controls/results, not visual polish: existing floating header/composer overlap and the plain draft form remain for the paused design lane. `reload.png` concerns browser reload/re-login only; no backend/PG restart claim in this slice.

## Preserved failures

- `launch-noop.json`: `/tmp` versus `/private/tmp` entry guard caused a no-op before any service. NOT EXECUTED, never a pass.
- `local-attempt1/`: lint failure (unnecessary casts / typed Jest assertions), despite passed backend tests/types. Corrected without lint suppression.
- `local-attempt2/`: outdated exact path/member list assertions failed after the finite transport extension. Updated only the two bounded test lists; zero-chat/sole-fetch negatives remain.
- `maya-goods-photo-shell-net-01.log`: earlier test fixture mutation failure, preserved as a failure.
- `proof-types.log`: initial scratch alias resolution and IPC typing failures; corrected narrowly, then `proof-types-02.log` and `-03.log` exit 0.
- `browser-attempt1/`: browser child entry guard had the same macOS realpath issue; zero actual UI checkpoints. Fixed the entry guard.
- `browser-attempt2/`: harness selected a visible button before existing history restoration enabled it. Added bounded enabled-control readiness; no UI state bypass.
- `browser-attempt3/`: first six checkpoints reached canonical approval with zero effects. The fixture incorrectly rejected the legitimate source READ during Gate 11 rejection. Added only the `reject` READ phase; mutation permission remains `approve` plus explicit synthetic opt-in. Also awaited enabled inputs/picker. Runtime code was unchanged across all browser attempts.

All failures retain their original logs/status and the applicable exact harness copies. None is renamed PASS. No private PG directory, auth response, original real invoice or production secret is archived. Synthetic fixtures, generated test IDs and local process coordinates are evidence only.

The full archival `git diff --check` reports original trailing/EOF whitespace in raw runner logs and exact `owned-stage.mjs` copies. Those bytes are preserved to retain their executed hashes. Authored checkpoint/map/README Markdown passes its scoped whitespace check; no runtime source is changed in the evidence commit.
