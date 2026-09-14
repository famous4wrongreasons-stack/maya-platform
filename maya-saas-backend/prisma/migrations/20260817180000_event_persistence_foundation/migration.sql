-- CYCLE 03 B1 — EVENT PERSISTENCE FOUNDATION
--
-- Только добавление. DROP — 0, SET NOT NULL на существующих данных — 0.
--
-- Порядок в этом файле обязателен и каждый шаг умеет провалить миграцию:
--   1. колонки           2. наполнение провайдера   3. CHECK
--   4. отметка наблюдения 5. новые таблицы          6. индексы и ключи
--
-- 🔴 Почему наполнение ДО уникального индекса. Ключ визита квалифицирован
-- провайдером; если оставить `crmProvider` пустым у существующих строк, NULL в
-- составе ключа молча отключит уникальность ровно для тех записей, ради
-- которых она вводится.

-- ─── 1. Колонки ─────────────────────────────────────────────────────────────
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "crmProvider" TEXT;

-- AlterTable
ALTER TABLE "CrmIntegration" ADD COLUMN     "watchStartedAt" TIMESTAMP(3);

-- ─── 2. Наполнение провайдера у существующих визитов ────────────────────────
--
-- Провайдер берётся из интеграции арендатора: другого места, где он записан,
-- в системе нет. Строки без внешнего идентификатора не трогаются — у них и
-- провайдера быть не должно (это визиты внутреннего календаря).
UPDATE "Appointment" a
SET "crmProvider" = i."provider"
FROM "CrmIntegration" i
WHERE i."tenantId" = a."tenantId"
  AND a."crmExternalId" IS NOT NULL
  AND a."crmProvider" IS NULL;

-- ─── 3. Половина ключа не может быть пустой ─────────────────────────────────
--
-- Заполнено ⟺ заполнено. Без этого писатель однажды поставит внешний
-- идентификатор без провайдера, уникальность для этой строки отключится, и
-- дубликат визита пройдёт незамеченным.
ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_crm_identity_pair_check"
  CHECK (("crmExternalId" IS NULL) = ("crmProvider" IS NULL));

-- ─── 4. Момент начала наблюдения ────────────────────────────────────────────
--
-- Всё, что старше этой отметки, — уже существовавший бизнес, а не «создано
-- сегодня». Для действующих интеграций отметка ставится СЕЙЧАС: раньше Maya за
-- ними не наблюдала, и утверждать обратное было бы выдумкой.
UPDATE "CrmIntegration"
SET "watchStartedAt" = CURRENT_TIMESTAMP
WHERE "watchStartedAt" IS NULL;


-- ─── 5–6. Новые таблицы, индексы, внешние ключи ─────────────────────────────
-- CreateTable
CREATE TABLE "DomainEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entitySequence" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "ingestionMethod" TEXT NOT NULL DEFAULT 'webhook',
    "sourceRef" TEXT,
    "observation" TEXT NOT NULL DEFAULT 'after_watch_started',
    "dedupFingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionQuarantine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "source" TEXT NOT NULL,
    "discriminator" TEXT,
    "fingerprint" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "diagnostic" JSONB,
    "resolution" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DomainEvent_tenantId_entityType_entityId_occurredAt_idx" ON "DomainEvent"("tenantId", "entityType", "entityId", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_status_leaseUntil_idx" ON "DomainEvent"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "DomainEvent_tenantId_type_occurredAt_idx" ON "DomainEvent"("tenantId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "DomainEvent_tenantId_receivedAt_idx" ON "DomainEvent"("tenantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainEvent_tenantId_dedupFingerprint_key" ON "DomainEvent"("tenantId", "dedupFingerprint");

-- CreateIndex
CREATE INDEX "IngestionQuarantine_receivedAt_idx" ON "IngestionQuarantine"("receivedAt");

-- CreateIndex
CREATE INDEX "IngestionQuarantine_expiresAt_idx" ON "IngestionQuarantine"("expiresAt");

-- CreateIndex
CREATE INDEX "IngestionQuarantine_tenantId_receivedAt_idx" ON "IngestionQuarantine"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "IngestionQuarantine_resolution_receivedAt_idx" ON "IngestionQuarantine"("resolution", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IngestionQuarantine_source_fingerprint_key" ON "IngestionQuarantine"("source", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_tenantId_crmProvider_crmExternalId_key" ON "Appointment"("tenantId", "crmProvider", "crmExternalId");

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionQuarantine" ADD CONSTRAINT "IngestionQuarantine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

