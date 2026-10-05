<!-- REDACTED FOR REPOSITORY. Archival copy, not release-admission evidence. Original SHA256: 464d2c39a660e385dbcc018e120cd34bb3e2358e35c6e5af587f394c85d4e27b -->

# Combined candidate findings

Candidate: `4f479dce32e6e3595516447a5a6bf8cc6278528a`.
Branch: `codex/maya-controlled-integration-20260930`.
Worktree: `/Users/stanislavmosin/Documents/Codex/2026-09-29/referenced-chatgpt-conversation-this-is-an-2/work/maya-controlled-integration`.

## Provenance and ownership

The candidate contains merge `e17b4acf12345bf6d6dcaf3e809ef476ad1b023e`, whose two parents are backend `f9e703e3265f31aa6f3e16eb0774b3349abf1fc0` and presentation `36fc31d7fa1ba5af758254912fa324093b4d954b`. Their merge base is `62bb81b871b772efe43cc566423727b653a9635a`.

Before merging, the backend delta covered 256 files and the presentation delta 30 files. The intersection was empty. `git merge-tree` returned a clean tree, without conflicts. `PRE-MERGE-PROOF.json` records both lists, the prospective tree and the eight presentation commits. The merge preserves every source commit and author. There was no conflict resolution or runtime rewrite. One subsequent backend-test-only commit corrects the static shell census from 37 to 38: approved runtime commit e437e114 added shell/dom-port.js. The strict exact count and all refusal checks remain.

All backend runtime bytes equal the approved backend checkpoint; the only backend delta is the static shell artifact test assertion described above. `maya-carrier-react` and `maya-ios-carrier` equal Claude's committed checkpoint. The untracked presentation migration specification was not copied. Neither source branch nor its checkout was changed. Build products and dependencies were created only in the integration checkout.

## 9.6 — not closed

The existing matched-intent path is already shared: `AiCoreService.routeTypedWidget` calls `TypedStep0Service`, which resolves a currently live server intent and submits it to `IntentGatewayService`. Both typed activation and widget activation therefore reach Gate 9 and `TimelineStore.lowerToUserTurn`. That mechanism must be preserved.

This is narrower than the requested integration proof. The runtime conversation still maintains local display identities and client-carried history; `/ai/chat` returns `request_id`. Ordinary unmatched typed chat does not establish the persisted canonical `WidgetTimelineTurn` identity shared with widget lowering. `AiCoreService.complete` writes an audit event for the request; it is not that canonical user-turn writer. A completed read can establish an assistant timeline turn, which does not prove a persisted user turn. The requested complete identity correlation, retry/error parity and common persisted identity have no fresh combined-candidate acceptance receipt.

No mirror writer was added. 9.6 remains false / INTEGRATION_OWNED. Its implementation was not started after the explicit HANDOFF scope STOP was confirmed. This is unfinished integration work, not an assertion that 9.6 independently needs a new product decision.

## Seven re-evaluated evidence duties

| Clauses | Combined-candidate finding | Result |
|---|---|---|
| G7-5, G7-BOOK1, G11-I9, G13-I3 | Production `refine.booking.cancel@1` and `refine.booking.reschedule@1` references still occur only in their template declarations. The combined presentation adds rendering and detail surfaces; it cannot mint the missing initial appointment-specific server intent. Existing mechanism/fixture tests cannot supply production ancestry. | EVIDENCE_MISSING, unchanged |
| G12-R1b, G12-I11, G13-R2 | Backend projection and routing support detail/w with retained source authority. The merge introduces no new server production minter for those targets. A carrier detail sheet displays canonical results; its presence is not evidence of an authorized detail/w source. The current production schedule recipe remains `navigate.schedule@1`, target s. | EVIDENCE_MISSING, unchanged |

The source boundary receipt also proves the entire backend tree unchanged from `f9e703e3`; no missing producer can have arrived through these presentation-only commits. Existing runtime `resolution` ingestion is present in this combined tree. The earlier carrier integration note's statement that no live envelope can ever be ingested is not used as current authoritative evidence.

## HANDOFF and certification

G6-6 and G13-R8 stay false / accepted STOP, never U. AR-1 V1 rejects this matrix even if all other rows are made green. There is no server-enforced partial release scope today. The exact proposed contract is in `SCOPE-ISOLATION-DECISION.md`.

The fresh checks in this pass describe current code. They are not a signed release certificate and do not inherit old mutation receipts as fresh. The complete mutation/certification run is held at the explicit scope-design STOP. Remaining live/provider acceptance and the runtime's seven local-API skips are disclosed in the checkpoint.
