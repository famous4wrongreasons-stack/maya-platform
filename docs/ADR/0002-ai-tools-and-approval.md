# ADR 0002 - AI Tools And Human Approval

Дата: 2026-07-08
Статус: accepted

Implementation note: the first platform slice is implemented by migration
`20260715210000_ai_tool_runtime` and the typed registry under
`maya-saas-backend/src/ai-tools`. The channel-agnostic, privacy-redacted server
orchestrator is available at `POST /api/ai/chat`; final channel UI binding is a
separate acceptance gate.

## Контекст

Maya OS должна управлять записью, маркетингом, финансами, уведомлениями,
сотрудниками и аналитикой через диалог. Ошибка AI может затронуть деньги, ПД,
расписание и репутацию tenant.

## Решение

AI не получает прямой доступ к БД или внешним системам. AI может только:

1. получать безопасный контекст;
2. выбирать backend tool из разрешенного registry;
3. получать результат tool;
4. формировать объяснение и action draft;
5. для risky actions создавать approval request.

High-risk actions исполняет Action Engine только после human approval.

## Tool Risk Tiers

- read: direct execution;
- low write: execution + audit;
- medium write: policy confirmation or approval;
- high write: mandatory approval;
- restricted: never exposed to AI.

## Последствия

Плюсы:

- AI remains useful without becoming unsafe;
- audit and explainability are built-in;
- prompt injection cannot directly execute hidden writes;
- same tool contracts work across channels and models.

Минусы:

- больше backend metadata;
- медленнее запуск dangerous automation;
- требуется UI/action-card слой для approvals.

## Альтернативы

1. Let AI call database/CRM directly. Отклонено: unsafe, unauditable,
   non-compliant.
2. Disable writes entirely. Отклонено: Maya OS должна действовать, иначе это
   аналитический чат, не operating system.

## Guardrails

- Tool Registry stores role, tenant scope, risk tier and approval rules.
- Tool Engine authorizes again even if tool was exposed to model.
- Approval payload is validated by backend, not trusted from LLM.
- Every tool invocation is audited.
