# Maya development archive — 2026-09-29 to 2026-10-05

This is a preservation index, not an architecture replacement, release certificate or deploy instruction. Earlier August/September rebuild provenance is included where it explains the current state. Historical failures and decisions remain historical; later receipts do not rewrite them.

Start with [CURRENT-STATE-2026-10-05.md](../../../CURRENT-STATE-2026-10-05.md), [branch inventory](BRANCH-INVENTORY.json), [security/preservation record](SAFETY.md) and [artifact manifest](ARTIFACT-MANIFEST.json).

## Chronology

| Date / stage | Branch | Commit SHA | Artifact | What was proven | What remained open | Superseded by |
|---|---|---|---|---|---|---|
| 2026-08 → 2026-09-14: Rebuild C1–C9 | `codex/maya-brain-systemic-release-20260815` | `7c9da98362dcca755882be451ea3d23c8180708b` | [Rebuild C1–C9](../../../CYCLE-09-FINAL-COMPLETION-REPORT.md) | Chapter-specific closure reports exist; C9 final gate recorded 10/10. | C8 numeric predictions disabled; C10 not started. | Widget release and carrier programmes |
| 2026-09-19 → 2026-09-28: Widget Waves 1–6 / FBE2E | `codex/maya-identity-consent-20260913` | `36fc31d7fa1ba5af758254912fa324093b4d954b` | [Widget Waves 1–6 / FBE2E](../../maya-chat-first-ux/) | Historical contracts, owner decisions, mutations and closure evidence are in Git. | Not equivalent to production activation. | Widget release programme |
| 2026-09-29: Widget release programme | `codex/widget-release-programme-20260929` | `f9e703e3265f31aa6f3e16eb0774b3349abf1fc0` | [Widget release programme](artifacts/current/preintegration/) | 31 false clauses classified; backend decisions/evidence advanced separately from presentation. | HANDOFF and integration/source duties. | Controlled integration |
| 2026-09-29 → 2026-09-30: SB-1 / JSON V2 successor verification | `codex/maya-controlled-integration-20260930` | `f9e703e3265f31aa6f3e16eb0774b3349abf1fc0` | [SB-1 / JSON V2 successor verification](artifacts/current/sb1-v2/) | Immutable successor binding proof contract, exact Client/tenant and atomic consume. | No real OTP or production binding authorized by proof. | Combined profile candidate |
| 2026-09-30: Controlled integration / 9.6 / scope isolation | `codex/maya-controlled-integration-20260930` | `1d519822bb92343f1bf4efdf92cbc4264eace48a` | [Controlled integration / 9.6 / scope isolation](artifacts/current/profile-isolation/) | One persisted user-turn owner; restricted profile; NS-1 and BS-1 source proofs. | Source-carrier defects exposed by integration probes. | Runtime fixes below |
| 2026-09-30: I-SRC-1 CANCEL | `fix/i-src-1-runtime` | `f531367f00d62bbf5e27c4df8c64ba9695f9c968` | [I-SRC-1 CANCEL](artifacts/current/i-src-1-continuation/) | Exact Claude cancel fix retained; integrated provenance also in 977b814e. | NAVIGATE runtime fullscreen. | 6a40575c |
| 2026-09-30: NAVIGATE fullscreen | `codex/maya-controlled-integration-20260930` | `6a40575cc0dc841a84f42367a45364ff7e626f09` | [NAVIGATE fullscreen](artifacts/current/navigate-runtime-fix/) | Server-declared detail resolves progress into fullscreen, not ordinary timeline. | NS-1 parent return. | 98716cd5 |
| 2026-09-30: NS-1 parent return | `fix/ns-1-parent-return` | `98716cd5b9440d01e4272ea0778f93db26f065e6` | [NS-1 parent return](artifacts/current/final-certification-98716cd5/) | Parent/detail/parent probe and authority negatives. | L27 terminal duplication. | fed5f7df |
| 2026-09-30: L27 terminal outcome | `fix/l27-terminal-outcome-duplication` | `fed5f7dfa0a5611dba24b40a8143b354c22151e5` | [L27 terminal outcome](artifacts/current/final-certification-fed5f7df/) | Receipt identity drives one terminal outcome. | Harness baselines and final limitations. | Harness diagnosis / FBE2E owner decisions |
| 2026-10-01 → 2026-10-02: Harness and final FBE2E decisions | `codex/maya-controlled-integration-20260930` | `4509d6f55df62da852740658c69613b113b5a1c1` | [Harness and final FBE2E decisions](artifacts/current/final-fbe2e-decisions-20261002/) | Blocking admission, canonical timezone, UNKNOWN retry proof and render evidence; L23/L26 accepted limits. | Production unlock deliberately absent. | 76df1766 |
| 2026-10-02: AR-1 production-unlock contract | `codex/maya-controlled-integration-20260930` | `76df1766a74212f2c8a06ab879386fc8e4468d73` | [AR-1 production-unlock contract](artifacts/current/ar1-production-unlock-final-20261002/) | Narrow signed production execution path tested in isolation. | Packaging and trust/operator prerequisites. | 77ecb3f5 |
| 2026-10-03: Release packaging | `codex/maya-controlled-integration-20260930` | `77ecb3f5696583389e75592141f46fd0664d33d8` | [Release packaging](artifacts/current/release-packaging-final-20261003/) | AASA manifest; React AChat canonical PWA/iOS payload; parity and packaging. | Two-human governance and operator prerequisites. | Single-operator AR-1 |
| 2026-10-03 → 2026-10-05: Single-operator AR-1 and final certification | `codex/maya-controlled-integration-20260930` | `dff728e85a97841dd72bd290992b888344780780` | [Single-operator AR-1 and final certification](artifacts/current/ar1-single-operator-final-20261005/) | Fresh local/hosted receipts pin DFF; 0 profile-applicable false, 2 global HANDOFF STOP. | Real operator key/custody/session and separate production authorization; iOS signing expiry. | No successor verified in this archive |
| 2026-10-05: Development archival | `archive/maya-development-20261005` | `Archive HEAD (documentation only)` | [Development archival](README.md) | Original commit provenance, WIP snapshots and historical evidence preserved; no release action. | Historical privacy incident remains separately disclosed. | Not a certified product successor |

## How to recover the work

Existing safe branches retain their real names and original commits. Diverged local tips receive archival refs rather than rewriting published history. Unreachable meaningful commit tips receive exact-SHA archival branches; their parents remain intact. Independent WIP topics receive separate snapshot commits based on each original HEAD. These snapshots are not certified candidates and are not merged into any working branch.

`BRANCH-INVENTORY.json` records source worktree, upstream, before-push ahead/behind, intended SHA and purpose. `WORKTREE-INVENTORY.json` records the initial registered worktrees. `WIP-EXCLUSIONS.json` explains every omitted loose file. Internal Codex safety refs, credentials, caches and temporary captures are never publication targets.

The manifest records each original path, SHA256, size, archive location or exact existing Git blob. `ALREADY_IN_GIT` means byte-identical history is preserved without a redundant copy; `DUPLICATE` refers to one archived source hash. `MANIFEST_ONLY` is intentional for large/raw/binary artifacts, not a claim that their bytes were uploaded. Sensitive/unknown raw artifacts stay local. `containsSensitiveData: YES` may be conservative when raw data was not approved for publication.

## Evidence interpretation

[Latest receipt verification](LATEST-CANDIDATE-RECEIPT-VERIFICATION.json) rechecks candidate and receipt relationships. This archival pass did not rerun tests, query production, install trust, issue authorization, apply migrations or grant access. Sanitized receipt copies and this index cannot replace the strict fresh release collector.

Important operator documentation is under [the latest final stage](artifacts/current/ar1-single-operator-final-20261005/). Previous reports remain visible to explain the exact failures, decisions and fixes.

**CERTIFIED != DEPLOYED. DEPLOYED != USER ACCEPTED. CHAPTER COMPLETE != FULL PRODUCT COMPLETE.**

## Related repositories and loose proof sources

[RELATED-REPOSITORIES.json](RELATED-REPOSITORIES.json) distinguishes same-history clones from independent roots. Legacy iOS is preserved in its existing `maya-ios` remote; safe no-remote workspace metadata has an archival branch in this repository. Independent salon website and unrelated gym-video work are inventoried but excluded from the requested website-within-this-repository scope. No separate product history is merged into the integration line.

`proof-sources/` preserves previously loose executable repro/probe sources alongside their source hashes in the manifest. Some contain conservative redactions and must be reviewed before any reuse; their presence does not authorize running production operations. Four additional detached Wave 2 worktree HEADs are protected by exact-SHA archive branches.
