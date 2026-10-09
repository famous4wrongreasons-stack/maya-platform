# MAYA: approved fixed-price chat integration, 2026-10-09

В отдельном общем кандидате backend + React устранён входной разрыв: проверенный
semantic plan теперь может подготовить существующее YC-SP1 предложение изменения
фиксированной цены. Реальный локальный HTTP/auth/PG/AE сценарий проходит после
точного уточнения услуги: 1500 RUB → correction 1600 RUB → новая canonical approval
→ одна подтверждённая запись в synthetic provider. До подтверждения записей нет.

Это локальный development checkpoint, не завершение всей MAYA/C10 и не допуск
реальной модели, настоящего YCLIENTS или deployment.

## Candidate and scope

- Branch: `codex/maya-pricing-semantic-integration-20261009`.
- Worktree: `/Users/stanislavmosin/Documents/Codex/2026-10-06/task-2/maya-pricing-semantic-integration`.
- Base: `97624aa633f4c2cd1d3b5412ec27e6d18f48dc07`.
- Frozen code/proof commit: `0fce103491de3e1fc5125a4db47312874a0aa4b5`.
- Approved pricing checkpoint `4c8141e0d29e41df74fc7adfbfae9438d735d626`
  already belongs to this history; no foreign pricing worktree was merged or edited.
- Approved scope: **YC-SP1-WIDGET-1/v1.4 fixed RUB price, F32a and F74a pricing
  provenance**. No service rename/YC-SR1/F74c extension was authorized or added.

The gap was semantic routing: the old READ intent `services.price` could not
authorize a `catalog.service.price.update` tool call through the strict parser.
The earlier pricing HTTP fixtures supplied direct model decisions and bypassed
that parser. Existing pricing tool, approval, CRM adapter and AE owners remain.

Runtime delta is limited to two files:

1. `conversation-taxonomy.ts`: `services.price_update`, write/E/high, exactly
   TENANT_OWNER and BUSINESS_OWNER, existing permission/tool, required `service`
   and `requested_price`. READ price lookup remains READ.
2. `service-price-chat-binding.ts`: accepts the finite preparation grammar
   `Подготовь изменение цены` with the literal current service title and exact
   amount. No inflection matching, model-derived authority, price arithmetic,
   role widening or currency expansion.

The existing server rereads the catalog, binds original user text, replaces forged
model arguments, supersedes pending proposals and requires the exact actor/payload
bound approval. F32a MONEY/high/financial, current permissions, non-price fields,
UNKNOWN/no-retry and one AE execution remain under their existing owners.
F74a is evidenced by `ai.service_price_chat_approval_bound` linked to the persisted
`chat.user_turn_bound`, not by a new presentation-authorized path.

## What actually passed

Evidence directory: [maya-pricing-semantic-20261009](evidence/maya-pricing-semantic-20261009/).

- New tests against baseline runtime: **26 failed / 1 passed**, exposing the
  missing canonical intent. Baseline files were restored to the working patch
  immediately after that run.
- Final targeted parser/CI/AiCore/binding tests: **91/91**, three suites.
  The first combined run retained one failure because the additional intent
  exceeded the old 60 KB planner test budget (60,559 bytes); the bounded assertion
  is now 61 KB. No production transport limit was changed.
- Backend types, widgets-live types and lint of every changed TypeScript file: PASS.
- Actual local HTTP/auth/PostgreSQL/Action Engine: **24/24**, no skipped tests.
- Current headless runtime + React drawer from untouched actual HTTP exports:
  **5/5**, including the parent test for confirmed/rejected/UNKNOWN/detail.
- React typecheck and web build: PASS. Backend Nest and preflight script builds: PASS.
  The first preflight build exceeded its 1536 MB heap; the serial rerun with
  3072 MB passed. Both logs are retained; no source change was required.
- Independent code and evidence review: no blocking findings. Scope qualifications
  are retained in [independent-review.md](evidence/maya-pricing-semantic-20261009/independent-review.md).

The new HTTP scenario preserves both original corpus utterances unchanged:

1. `Подготовь изменение цены мужской стрижки на 1500 рублей.` → clarification.
2. `Нет, на 1600 рублей.` → clarification; still zero approvals, AE or PATCH.
3. Supplemental user clarification:
   `Подготовь изменение цены услуги «Мужская стрижка» на 1500 рублей.` → proposal.
4. `Нет, на 1600 рублей.` → distinct replacement proposal; old card cannot execute.
5. Canonical widget confirmation → one SUCCEEDED AE receipt, one PATCH and provider
   readback of 1600; replay adds no PATCH.

All scripted widget decisions now pass the actual model-response parser and CI.
Deliberately false model service/company/amount arguments never become authority.
Owner permissions, foreign tenant, membership revocation, stale provider/non-price
state, rejection, concurrent requests and UNKNOWN/no-resend have retained coverage.

## Evidence boundaries and remaining work

- Semantic decisions are **scripted/synthetic**. The script explicitly carries
  service preference on correction. No real-model understanding or new server-side
  carry mechanism is claimed.
- The original inflected service name does not satisfy the exact-title contract.
  The two frozen cases were neither rewritten nor reclassified as completed goals.
  The frozen corpus/model fixture/evaluator remain unchanged.
- HTTP uses the real application/approval/adapter/AE/PG with an owned loopback
  synthetic YCLIENTS server. External fetch targets are refused by the fixture.
- Restart coverage means closing and recreating the Nest application in the same
  Jest process with PG retained; it is not a process or PG restart proof.
- Carrier checks replay four actual HTTP envelopes from the standard 2500-price
  cases. They do not exercise a browser or specifically render the supplemental
  1600 conversation. React and backend are built together at the frozen source.
- No actual YCLIENTS branch binding, paid model, notification, production, website,
  phone, push/merge or background autonomy was executed in this integration slice.
- HTTP attempt r1 was blocked by sandbox EPERM at the loopback port probe before
  any cluster started. The authorized r2 succeeded. Both records are retained.
- The private r2 PG cluster stopped successfully: `pg_ctl status` exit 3 and no
  `postmaster.pid`. Source hashes remained unchanged throughout proof.
- Protected source worktrees and the existing direct-launch file retain their
  previous HEADs/hash: [protected-state.json](evidence/maya-pricing-semantic-20261009/protected-state.json).

Reproduction after assigning the serial local heavy slot, from this clean source:

```sh
node maya-saas-backend/scripts/service-price-semantic-proof.mjs /absolute/new/evidence-directory
```

The runner refuses existing evidence/carrier export directories, developer env
files and tracked source changes. It owns a fresh loopback-only PG cluster and
stops that cluster in cleanup. Raw envelopes contain only synthetic proof data.
