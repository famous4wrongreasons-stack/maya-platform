# MAYA Conversation Intelligence

This directory documents the versioned conversational layer used by AI Core.
The implementation is semantic rather than phrase-routed:

`Natural language -> intent -> entities -> context -> permission -> tool -> reasoning -> response`

## Current Contract

- 33 product domains and 83 canonical intents.
- 69 entity slots with Russian normalization guidance.
- Role-aware routing for owner, administrator, employee and client roles.
- Data classes A-F, risk levels and immutable runtime approval policies.
- Compound requests with up to five ordered tasks and explicit dependencies.
- Context carry-over, correction, ambiguity and clarification rules.
- Server-enforced tool allow-list and tenant-scoped permission checks.
- Capability readiness (`ready`, `partial`, `planned`) propagated to the final response.

Generated artifacts live in `datasets/conversation-intelligence/` and are
recreated with:

```bash
npm run ci:dataset:generate
npm run ci:dataset:validate
```

The generated `capability-matrix.json` is the source for product-readiness
reporting. `ready` means an implementation path exists, not that every tenant
has the required feature, role, integration or live data.

## Runtime Files

- `src/conversation-intelligence/conversation-taxonomy.ts`
- `src/conversation-intelligence/conversation-language-pack.ts`
- `src/conversation-intelligence/conversation-policies.ts`
- `src/conversation-intelligence/conversation-intelligence.service.ts`
- `src/ai-tools/ai-core-model.service.ts`
- `src/ai-tools/ai-core.service.ts`

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DATASETS.md](./DATASETS.md),
[EVALUATION.md](./EVALUATION.md) and
[CAPABILITY_MATRIX.md](./CAPABILITY_MATRIX.md).
