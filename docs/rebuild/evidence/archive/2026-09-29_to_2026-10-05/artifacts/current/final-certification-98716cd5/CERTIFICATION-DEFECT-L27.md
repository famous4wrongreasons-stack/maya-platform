<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: ee2d87cd7eb0789cf1d25f79212c9eb2c32b1a7f9e8864ac9184b8c7c837f1f1 -->

# Certification STOP — FBE2E L27

Candidate: `98716cd5b9440d01e4272ea0778f93db26f065e6`. Profile: `closed-input.no-handoff@1`.

The exact approved NS-1 commit was integrated by fast-forward with its parent `6a40575cc0dc841a84f42367a45364ff7e626f09` and provenance intact. NS-1 is PASS. This finding is a separate, pre-existing runtime defect. No candidate source was edited.

## Exact failure

Fresh compiled runtime JavaScript → unchanged canonical `createNet()`/session/client → actual `dist/src/main` binary → guarded local PostgreSQL/internal calendar fixture. No external provider or production path.

1. The actual drawn service/staff/slot/COMMIT controls create one confirmed fixture appointment through the canonical Action Engine.
2. Conversation contains one assistant item: `a1`, «Запись подтверждена.».
3. Activate the same confirmation's server-declared CONTROL escape (Dismiss).
4. Server still returns exactly the same single `CONFIRMED` terminal line and `action_receipt_ref`; durable state remains one appointment and one ActionExecution.
5. Conversation now contains `a1` **and** `a2`, both «Запись подтверждена.».

Fresh assertion: `L27: Dismiss must not append the same canonical booking receipt twice to conversation`, **`2 !== 1`**, binary proof exit **1**. This is duplicate presentation of one successful booking, not a second booking or overwritten receipt.

## Owner and root cause

Runtime owner. `maya-chat-shell/src/shell/intents.ts` reads terminal lines again after the accepted Dismiss (`createLiveSubmission`, around lines 121–126); the `settled` path unconditionally appends each line (line 672). `maya-chat-shell/src/shell/conversation.ts` `appendServerLine` creates a fresh assistant item each time (around lines 409–412). No backend defect is established here.

The older FBE2E closure report already disclosed this as **L27**. `outputs/source-certification/FBE2E-DISPOSITION.json` subsequently marked L27 CLOSED using `TURN-CANONICAL` evidence. That proves persisted **USER-turn** identity, not deduplication of an **assistant receipt**. The old artifact remains unchanged; the new disposition reopens L27 with current executable evidence. `9.6` remains PASS.

## Scope of STOP

The user requested STOP on a genuine certification defect. The mutation runners were terminated after this reproducible failure; interrupted work is not PASS. No repair, waiver, registry/profile change, visual redesign or production action was made.

A narrow runtime correction or explicit named owner acceptance of this limitation is required before certification can complete. Any correction should preserve distinct legitimate receipts and avoid text-based identity; the canonical action receipt already supplies identity. This is a repair boundary, not an implemented contract change.

## Reviewable receipts and harness

- [Observed server, timeline and durable state](receipts/l27-postcommit-dismiss-observations.json)
- [Failing binary proof](receipts/fbe2e-l27-postcommit-dismiss.log)
- [Exact command, candidate and exit](receipts/fbe2e-l27-postcommit-dismiss.receipt.json)
- [Runtime probe](repro/compiled-postcommit-dismiss.mjs)
- [Guarded BIN case](repro/gateL27.cases.ts)
- [Runner](repro/run-postcommit-bin.py)
- [Positive compiled booking/receipt/chat proof](receipts/compiled-receipt-net-bin-observations.json)
- [Interrupted programme receipt](receipts/CERTIFICATION-STOP.json)

Original reproducible invocation, from this task directory: `python3 work/final-certification-98716cd5/run-postcommit-bin.py all`. It uses only the existing guarded local synthetic proof database and public CI environment literals. The copies above preserve the exact harness; their absolute imports identify the tested checkout and built artifacts.
