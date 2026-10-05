# Client readiness fixes — 2026-10-05 UTC

Local development branch `codex/maya-client-readiness-20261005`, isolated from
accepted checkpoint `98dc6121b714c51bedb70e396f5ad35cd0f9c346`.
Frozen website frontend remains `d5b310e9a3dc13051eb7f5ccd1e23bf28e8884d6`.
This is not production, provider or phone acceptance and is not a release approval.
Later reconciliation and the corrected registry-hash diagnosis are recorded in
[READINESS-RECONCILIATION-20261005.md](READINESS-RECONCILIATION-20261005.md).

## Product and owner corrections

- Encrypted restored replies now reach the existing EncryptionService through an
  explicitly bound D-6 owner port. The adapter exposes only encrypt/decrypt, uses
  the existing key/format and creates no second encryption owner. Compatibility
  tests read pre-port ciphertext, reject tampering and pin the prior reply UUID.
- Reply serialization uses the existing H6 canonical serializer. Reply identity
  framing is unchanged, so the change does not re-key persisted history.
- TimelineStore owns the PostgreSQL clock read used for turn age and retention.
  Typed ingress no longer issues raw SQL. It still uses database time, with a
  regression proving it does not substitute the application clock.
- Both current-conversation query predicates apply the existing tenant-scope
  helper explicitly at the query boundary. Principal, erasure and retention
  predicates remain enforced.
- The existing offline conversation runner uses the canonical fixture owner and
  reads `user_turn`, the actual chat response field, so subsequent turns carry
  the returned conversation identity. No additional paid run occurred.
- K1 dossier generation resolves its own repository root instead of writing to
  a different owner's historical checkout. Generated signed documents are byte
  identical after the path correction.

## Test expectation corrections and retained checks

The accepted resume checkpoint in MAYA-FINAL-COMPLETION-MAP and widget contract
§4.4.1 place encrypted completions in the existing erasable timeline text column.
HTTP tests now assert the complete user/widget/completion sequence, encrypted
parent correlation, matching retention, exact read projection, and unchanged
assistant rows after binding conflicts. Atomic rollback and provenance assertions
remain. Restored widget emissions are not presented as actionable chat replies.

The session-revocation shell test now supplies the canonical conversation-history
response and expects the existing restore-before-send request. Refresh, ended
session and token assertions remain. Nine build fixtures now include the already
canonical conversation path; negative fixtures retain their original refusal.

Exact owner-module/token/consumer enumerations register the new narrow cipher
binding. No import check, grant ratchet or test is removed. No release capability
profile, denial taxonomy, migration baseline or frozen website file is changed.

## Verification

Code checkpoint: `2e76a589ff40eb1b503c4ed52339ab3d4125a412`.

| Check | Observed result |
|---|---|
| Documented run-all-checks.sh | 23/27 PASS; exit 1. Remaining: widget-contract-check, K4 exit, wave-3, wave-4 |
| Full unfiltered backend Jest | 5829 PASS / 11 FAIL; 600 suites; zero skips |
| Full configured HTTP/PostgreSQL census | 490 PASS / zero FAIL / zero skips; all 52 suites, across fresh-process partitions and one prerequisite rerun |
| React carrier suite | 93/93 PASS |
| Full shell suite | 430 PASS / zero FAIL / 7 explicit local-API skips |
| Backend production and scripts types, Prisma validate, backend build | PASS |
| Shell check/build/typecheck/artwork and self-test | PASS |
| Backend health e2e | PASS |
| Changed backend TypeScript ESLint | PASS |
| Full backend lint | 22 errors / 9 warnings; output identical to prior baseline after checkout-path normalization |
| D-6 exact import graph / K3 structural | 37/37 PASS / 10/10 PASS |

The 11 backend failures retain the same assertion identities as the prior baseline:
registry/verification-floor/proactive/consent census (5), denial-map coverage (3),
fixed release profile (1), migration census (1), C9 registry fingerprint (1).
No Client or consent prohibition check was removed. The consent-named failure is
its exact catalog-length assertion, not evidence that a consent capability was
registered.

Evidence directory: `pilot-evidence/client-readiness/` in the parent workspace.
Node 24.15.0; existing dependencies; scrubbed environment; no external credentials.

An initial single-process full HTTP run exited 139 (Node segmentation fault),
without a final JSON report; it is not counted as passing. Its log and exit code
are retained. The proof database stopped in the runner's EXIT trap.
The replacement run covers every configured live-spec exactly once in the final
census (`widgets-complete-census.json`). The first partition's eight calendar
failures were missing local `maya-carrier-react/test/.bundle.mjs`; after building
the existing harness and passing React tests, that complete suite passed 8/8.
Both attempts remain in evidence. This is not claimed as one green unpartitioned
process. All HTTP evidence uses synthetic data, scripted model/internal calendar
and local PostgreSQL; it is not real CRM or provider acceptance.

## Remaining canonical baseline blockers

- Certified C9/tool census remains 56/47 while existing `business.rules.read`
  makes runtime census 57/48. The accepted staff-only A22 read must neither be
  silently removed nor admitted to a fixed release profile by changing counts.
- Certified P10 reason map has 118 codes versus 127 runtime codes. Nine existing
  conversation/source-read codes require canonical reconciliation. Unknown codes
  still use the existing UNAVAILABLE/PROVIDER_SILENT limitation fallback.
- The migration census predates four frozen website migrations. The separate
  ARCH-12-11 fingerprint is C9_REGISTRY_HASH (corrected in the reconciliation
  report), not a Prisma schema fingerprint.
- Full lint has pre-existing failures in package5 runtime proof, owner-money
  acceptance tests and the YClients adapter test. Their baseline classification
  and prior identical output are in CHAT-AGGREGATE-READINESS-20261005.md.

The documented runner now passes K1 generation, K3 structural and K3 exit.
K4/widget-contract remain blocked by canonical coverage; wave-3 and wave-4
repeat the unchanged full-lint failures. K5, K6 and F88 mutation battery pass.

Next: reconcile the versioned registry/release/reason-map contract with accepted
owner implementations, then the frozen website schema baseline under its own
approval. Rerun the remaining red gates after those substantive decisions.
Phone UI/login/CRM acceptance still needs owner evidence. Real provider reads,
real CRM mutations, notifications, payments, deployments and paid model calls
were not performed by this task.
