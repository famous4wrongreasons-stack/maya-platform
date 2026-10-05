<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: d8c42594729e61a2d7ff00427b7a1464ff09f357d38bbaa56f20eef6a9ec89d9 -->

# I-SRC-1 NAVIGATE runtime patch

Base: `1d519822bb92343f1bf4efdf92cbc4264eace48a`. Candidate: `6a40575cc0dc841a84f42367a45364ff7e626f09`. Branch: `codex/maya-controlled-integration-20260930`. One atomic commit; clean worktree.

The accepted, server-declared NAVIGATE(detail) response now resolves the existing PROGRESS into `ShellView.fullscreen` using the existing detail controller. It never calls timeline ingest for this path. The same history entry and opener survive the transition. Close, Escape and browser Back remain owned by `closeDetail` / existing shell history handling.

The runtime carries the server's explicit acceptance verdict and checks response correlation: original parent widget, declared route, tenant, opaque principal proof, turn and render profile. It verifies existing H7/conformance and live lifecycle. These checks do not grant authority, validate server HMAC locally or replace current server principal/tenant checks. Refused, substituted or late detail responses cannot fall back to timeline insertion. Ordinary non-detail successors retain their existing timeline behavior.

## Fresh checks on this commit

- Runtime: **392 PASS, 7 declared skips, 0 failures** (399 total). Includes **33 new NAVIGATE regression tests**.
- Carrier: **93/93 PASS**.
- Runtime/carrier builds, type checks and runtime build gate: PASS.
- Existing, unmodified backend source-carrier probe: PASS. Real canonical journal HTTP source yields `fs.calendar`, HTTP 200 and accepted detail; actual runtime transitions `progress → open`, density SHEET, timeline IDs unchanged. The personal create/reschedule/cancel path remains PASS (8 submissions).

| Required proof | Result |
|---|---|
| valid fs.calendar NAVIGATE to fullscreen | PASS; real canonical journal HTTP source + live submission + actual runtime |
| detail never inserted into timeline | PASS; before/after timeline IDs identical in actual source probe |
| PROGRESS resolves correctly | PASS; progress -> open, no history pop/push bounce |
| undeclared or forged route | PASS; 0 submissions |
| substituted detail | PASS; parent, route, turn, profile, self-echo, tampering, expiry and terminal negatives |
| wrong tenant/principal | PASS; runtime opaque correlation checks and canonical refusal propagation; server authority implementation unchanged |
| contradictory or missing server acceptance | PASS; REFUSED/NEEDS_VERIFICATION/expired/missing acceptance cannot open even with an attached envelope |
| late response after close/back/sign-out/replacement | PASS; no reopening, no timeline fallback |
| closeDetail/fullscreen null | PASS; idempotent close and detail token release |
| focus/escape/back | PASS; runtime with DOM double and unchanged carrier suite; no new device/browser certification claimed |
| ordinary non-detail timeline | PASS; successor append and in-place replacement preserved |

[Full canonical source envelope, detail response and observed runtime states](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/navigate-runtime-fix/receipts-6a40575c/source-carrier-observations.json). Spendable tokens are redacted with hashes; raw fixture payloads remain process-local.

[Source probe command and candidate receipt](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/navigate-runtime-fix/receipts-6a40575c/source-carrier.receipt.json) · [Runtime receipt](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/navigate-runtime-fix/receipts-6a40575c/runtime-test.receipt.json) · [Carrier receipt](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/navigate-runtime-fix/receipts-6a40575c/carrier-test.receipt.json) · [Applyable patch with provenance](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/navigate-runtime-fix/I-SRC-1-NAVIGATE.patch)

Changed files:

- `maya-chat-shell/dist/manifest.json`
- `maya-chat-shell/src/shell/intents.ts`
- `maya-chat-shell/src/shell/ports.ts`
- `maya-chat-shell/src/shell/shell.ts`
- `maya-chat-shell/test/dom.test.mjs`
- `maya-chat-shell/test/intents.test.mjs`

Backend files changed: **0**. Carrier source, visual styles, backend authority, HANDOFF scope and registry/profile digest: unchanged. The committed runtime manifest was rebuilt to match the changed runtime modules.

`READY FOR CODEX FINAL CERTIFICATION = YES`. This unit stops after patch/proofs as requested. Full mutation/CI/release certification has not been executed in this unit and no release certificate is claimed. This patch concerns opening detail and existing close/Escape/browser-Back behavior; it does not extend or certify the separate NAVIGATE(w)/resolved_widget transport.

Production migration, deployment, grant, real OTP/YCLIENTS, iPhone reinstall and Chapter 10 effects: **0**.

The `receipts-precommit/` directory contains explicitly labeled diagnostic runs from before the commit. They do not substitute for the fresh committed-candidate receipts linked above.
