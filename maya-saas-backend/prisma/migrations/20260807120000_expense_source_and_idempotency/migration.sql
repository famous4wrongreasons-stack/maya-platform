-- Расход получает источник, внешний идентификатор и ключ идемпотентности.
--
-- source: 'manual' — завёл человек (кабинет или MAYA), 'crm' — приехало из
-- внешней CRM. Без этого поля один и тот же платёж, проведённый и там и там,
-- складывается дважды.
--
-- externalId: идентификатор записи в CRM. Уникален в паре с тенантом, поэтому
-- повторный импорт того же платежа упирается в индекс, а не создаёт дубль.
-- NULL не участвует в уникальности (Postgres NULLS DISTINCT по умолчанию),
-- так что ручных расходов это не касается.
--
-- idempotencyKey: ключ подтверждения из AI-рантайма. Повторное подтверждение
-- одной и той же карточки не создаёт вторую строку.
ALTER TABLE "Expense" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Expense" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Expense_tenantId_externalId_key" ON "Expense"("tenantId", "externalId");
CREATE UNIQUE INDEX "Expense_tenantId_idempotencyKey_key" ON "Expense"("tenantId", "idempotencyKey");
CREATE INDEX "Expense_tenantId_source_occurredAt_idx" ON "Expense"("tenantId", "source", "occurredAt");
