<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 404d5ce8dfac3037f79d7954f2d512c382eba82ea87512c8dddf4fa2df221ad4 -->

# I-SRC-1-RETURN — final certification STOP

Exact candidate: `6a40575cc0dc841a84f42367a45364ff7e626f09`. Its parent is exactly `1d519822bb92343f1bf4efdf92cbc4264eace48a`. The requested NAVIGATE opening patch was already integrated at HEAD; no duplicate cherry-pick or product edit was made. Worktree remains clean.

## Observed defect

The canonical journal source opens fullscreen correctly. Its server-declared `navigate.journal.parent@1` control is present in the actual runtime reading order and rendered by the actual React DetailSheet. Activating that exact control reaches the real local HTTP gateway. The server authorizes and resolves the exact parent, but the runtime drops the result and leaves the same detail open while reporting the activation as dismissed/successful.

```json
{
  "sourceWidgetId": "1b4f3bdf-d03e-4695-b1ea-523d3f1966f8",
  "detailWidgetId": "ae3d58c6-6a1f-43a4-bad1-cc8edf58a01f",
  "returnControl": "intent:i4",
  "serverTarget": {
    "class": "w",
    "ref": "1b4f3bdf-d03e-4695-b1ea-523d3f1966f8"
  },
  "http": 200,
  "receipt_outcome": "ACCEPTED",
  "serverResolvedWidgetId": "1b4f3bdf-d03e-4695-b1ea-523d3f1966f8",
  "projectedKeys": [
    "outcome",
    "code",
    "next_envelope",
    "receipt_outcome"
  ],
  "submissionOutcomes": [
    {
      "status": "advanced",
      "widgetId": "ae3d58c6-6a1f-43a4-bad1-cc8edf58a01f"
    },
    {
      "status": "accepted",
      "widgetId": null
    }
  ],
  "fullscreenAfter": "open",
  "sameDetailStillOpen": true,
  "timelineUnchanged": true
}
```

This is the canonical NAVIGATE(w) **server return control**, not Escape, browser Back or the chrome close button. Those close paths were the subject of the preceding patch; they do not substitute for this round trip.

## Exact failure points

- `maya-saas-backend/src/widgets/routing/effect-router.service.ts:225`: the journal child/parent relationship and current parent are resolved using the current tenant/principal. At line 251 the server returns the parent envelope as `resolvedWidget`; the HTTP receipt exposes it as `resolved_widget`. This fresh response is HTTP 200 / ACCEPTED, and its widget ID exactly equals the server-minted return target.
- `maya-chat-shell/src/net/types.ts:215`: `WidgetIntentProjection` has no `resolved_widget` member.
- `maya-chat-shell/src/net/project.ts:268`: `projectWidgetIntent` returns only outcome, code, next_envelope and receipt_outcome. The captured projected response has exactly those four keys; `resolved_widget` is lost here.
- `maya-chat-shell/src/shell/intents.ts:108`: with no next_envelope the live submission reads terminal receipts, then returns `accepted` for this response. No canonical parent reaches the shell.
- `maya-chat-shell/src/shell/intents.ts:597`: the accepted branch marks the current detail entry terminal and republishes it. It neither resolves a parent return nor closes the detail. The final ShellView still names the same `d2` detail in phase `open`.

Fix owner: **RUNTIME**. No backend emission defect was observed in this round trip. No generic navigation policy or HANDOFF implementation is called for. The missing transport/lifecycle path must carry the validated server-resolved parent and use the existing shell return/close ownership, preserving current tenant/principal/release and exact-parent binding. No fix was implemented in this certification pass, in accordance with the explicit STOP instruction.

## Fresh evidence and reproduction

[Full raw-shape source/detail/return payloads, projections and runtime observations](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/receipts/source-roundtrip-observations.json) · [Failing executable receipt](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/receipts/fbe2e-source-roundtrip.receipt.json) · [Jest result](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/receipts/fbe2e-source-roundtrip.json) · [Harness diff](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/HARNESS-DIFF.txt) · [Harness hashes and candidate provenance](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/CANDIDATE.json).

Spendable tokens are redacted using SHA-256 markers. Payload JSON hashes are captured before redaction. Credentials remain process-local. All data comes from guarded synthetic INTERNAL-calendar fixtures on loopback PostgreSQL; there is no production/provider effect.

The verification harness is an external copy of the existing source-carrier probe. It adds only the actual drawn parent-return activation and a round-trip assertion; production modules, envelopes and the candidate checkout are unchanged. It does not mock or repair the HTTP response. The raw parent response and the lost typed projection are recorded independently of the final fullscreen assertion.

From the task directory, the saved reproduction scripts recreate and run this external harness:

```bash
python3 outputs/final-release-certification/reproduce/prepare.py
python3 outputs/final-release-certification/reproduce/run-preflight.py
```

Requires the existing Node 22.23.2 runtime, local guarded proof PostgreSQL with the approved NS-1 test migration, and installed dependencies. The scripts require the exact candidate and a clean worktree. No production connection is used.

## Certification disposition

Fresh runtime build, carrier build and carrier harness build: PASS. Fresh personal create/reschedule/cancel: PASS (8 submissions). Fresh NAVIGATE(detail) opening: PASS. Fresh canonical parent return: **FAIL**. The FBE2E assertion is red and is not waived.

Full mutation execution and remaining suites were **not run after this defect**. The complete programme is listed in [PROGRAMME.json](/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/outputs/final-release-certification/PROGRAMME.json); no historical or partial receipt is counted as full certification.

The backend progress matrix remains 0 profile-applicable false / 2 global false (`G6-6`, `G13-R8` STOP); this is explicitly an inherited progress disposition, not a fresh certification audit. The separate mandatory integration duty fails. `closed-input.no-handoff@1` and `full165.closed-input` are unchanged. No profile or full-contract certificate is issued. Release authorization readiness: NO.
