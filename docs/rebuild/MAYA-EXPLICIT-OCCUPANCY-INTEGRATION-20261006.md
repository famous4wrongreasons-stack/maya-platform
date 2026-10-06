# Explicit occupancy integration list relative to c6a35e5

Base: `c6a35e5c61975e9d101326e7b3970331f3c905d8`. Local isolated branch: `codex/maya-explicit-occupancy-20261006`. The original `480d61dc` vertical and `13abc008` gate-preparation commits remain in sequence, followed by the HTTP evidence/fingerprint fix checkpoint. No merge or push was performed. These are file/owner overlap notes against the verified base, not an unperformed merge-conflict resolution against other lanes.

## Existing production files modified

All paths below are relative to `maya-saas-backend/src/`.

| File | Change / integration concern |
| --- | --- |
| `ai-tools/ai-core.service.ts` | Explicit persisted owner-turn fast path and existing semantic-task route. Keep current privacy/context/grounding and ordinary tool-read behavior from the receiving lane; this path makes zero model calls for the exact command. |
| `conversation-intelligence/conversation-taxonomy.ts` | One partial intent `schedule.review_cancellation_windows`; exact taxonomy count changes from 86 to 87. No general registry/capability framework. |
| `crm/opportunity-lifecycle.runner.ts` | Extract/reuse current capacity reader, preserving runner behavior; explicitly mismatching provider branch cannot confirm the interval. Shared CRM reconciliation-owner seam, not a new scheduler. |
| `opportunities/opportunity.lifecycle.ts` | Bounded readCancellationCandidates projection only. Preserve concurrent lifecycle/notification fixes to this owner. No writes added by this method. |
| `orchestration/c9.agents.ts` | Narrow deterministic Occupancy fact presentation. |
| `orchestration/c9.module.ts` | Register projection and its existing policy/entitlement dependencies. Preserve any receiving pricing-lane provider wiring; no second C9 owner. |
| `orchestration/c9.orchestrator.ts` | Explicit single-read request → saved proposal before work settlement → coherent response/replay. Potential shared seam with pricing/work-budget integration; keep one reservation/receipt and current source identity rules. |
| `orchestration/c9.store.ts` | Purpose-discriminated existing conversationReadRun, defaulting ordinary reads unchanged; canonical persisted turn still owns request age. |
| `orchestration/c9.sources.ts` | Shared current-source verifier: narrow native C5 fingerprint projection only for Opportunity/AgentTask, using the same helper as the new reader. Preserve every other source, policy and expiry check. |

New production files: `orchestration/c9.occupancy-source.ts`, `orchestration/c9.occupancy-presentation.ts`.

## Test/harness files

- New backend tests: `src/ai-tools/ai-core.occupancy.spec.ts`; `src/orchestration/c9.occupancy-source.spec.ts`, `c9.occupancy.spec.ts`, `c9.c5-source-fingerprint.spec.ts`.
- Existing `src/conversation-intelligence/conversation-intelligence.service.spec.ts`: exact taxonomy census plus new intent assertion; reconcile its census if another lane independently adds intents, do not loosen the assertion.
- New dedicated HTTP entry: `test/widgets-live/c9-occupancy-restart.probe-spec.ts` and support `c9-occupancy-fixture-edge.ts`. Explicit probe stays outside ordinary widgets-live discovery. Existing AppModule/bootstrap/guards are reused unchanged.
- New backend `scripts/c9-occupancy-proof.mjs` and `.test.mjs`: owned cluster plus serial two-process driver; keeps every attempt and stops only its cluster.
- Current carrier test-only files: new `maya-carrier-react/test/occupancy-probe.mjs`, `occupancy.test.mjs`; existing `test/pipeline.tsx` gains exports of current conversation/projector functions. No shipped carrier or website code changes. Browser acceptance remains pending.

## Documentation/evidence

- Existing shared `docs/rebuild/MAYA-FINAL-COMPLETION-MAP.md`: append-only slice status; preserve parallel lane updates.
- New explicit occupancy checkpoint, HTTP preparation, HTTP result and this integration list under `docs/rebuild/`.
- Evidence under `docs/rebuild/evidence/explicit-occupancy-20261006/` and `explicit-occupancy-http-pg-20261006/`, including every failed attempt and successful actual HTTP/PG/SSR observations. Synthetic credentials/private restart files are excluded.

## Boundaries for receiving lanes

Prisma schema/migrations, C9 registry/contract/budget/work implementation, price manifests, main notification delivery implementations, website/real-booking code and production environment/config are untouched by this branch. No exact intersection with unprovided concurrent branch heads is asserted. Shared files most likely to need conscious reconciliation are AiCore, CRM lifecycle/repository, C9 module/orchestrator/store/sources, semantic census and the completion map; additions may be taken only after checking receiving-file existence.

Take the C5 fingerprint producer and verifier changes together. [Exact source compatibility](MAYA-EXPLICIT-OCCUPANCY-HTTP-PG-RESULT-20261006.md#actual-code-correction-and-source-compatibility): old C5 native prefixes/bytes remain unchanged; fresh C9 references use domain-separated 64-hex digests; raw fallback, schema widening, re-stamping old authority and C7 fabrication are prohibited. Prior failed runs retain existing held/replay rules and are not rewritten.

The targeted gate has passed on this isolated candidate. Full receiving-branch aggregate/typecheck, integration with concurrent lanes and actual browser/provider/model acceptance are separate work, not implied by this checkpoint. No further heavy run is authorized in this lane while main owns the slot.
