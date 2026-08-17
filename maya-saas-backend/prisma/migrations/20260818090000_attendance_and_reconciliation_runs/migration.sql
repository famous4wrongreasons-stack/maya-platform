-- Cycle 03 B3.3 — обнаружение изменений: присутствие в зеркале и состояние сверки.
--
-- 🔴 Миграция ТОЛЬКО добавляет. Ни DROP, ни SET NOT NULL, ни одного оператора
-- над существующими данными: все 1940 боевых визитов остаются как есть.
--
-- 🔴 Наполнения присутствия здесь НЕТ и быть не может: значение берётся у
-- провайдера, а миграция к сети не ходит. Существующие строки получают NULL и
-- наполняются первым проходом сверки. Переход NULL → значение событием не
-- является — это первое наблюдение, а не изменение, поэтому наполнение не
-- создаст ни одного исторического события.

-- 1. Присутствие клиента в зеркале.
--    NULL = «доказанного значения нет». Это НЕ `awaiting`: `awaiting` —
--    утверждение провайдера «отметки ещё нет», NULL — отсутствие утверждения.
ALTER TABLE "Appointment" ADD COLUMN "attendance" TEXT;

-- 2. Значение допустимо только каноническое (словарь главы 2) либо неизвестное.
--    Проверка живёт в базе, а не только в коде: писателей у зеркала два —
--    вебхук и сверка, и оба обязаны подчиняться одному словарю.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_attendance_check"
  CHECK ("attendance" IS NULL OR "attendance" IN
    ('awaiting', 'arrived', 'no_show', 'confirmed_by_client'));

-- 3. Состояние прогонов сверки.
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "windowFrom" TIMESTAMP(3) NOT NULL,
    "windowTo" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "completeness" TEXT,
    "truncationReason" TEXT,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "eventsEmitted" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureMessage" TEXT,

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReconciliationRun_tenantId_startedAt_idx"
  ON "ReconciliationRun"("tenantId", "startedAt");

-- Поиск последнего ПОЛНОГО завершённого прогона. Отдельный индекс по значению
-- полноты нужен именно затем, чтобы усечённый и упавший прогоны нельзя было
-- принять за полный: они отбираются тем же запросом и отсеиваются значением.
CREATE INDEX "ReconciliationRun_tenantId_completeness_finishedAt_idx"
  ON "ReconciliationRun"("tenantId", "completeness", "finishedAt");

-- 4. Полнота — закрытый словарь контракта B3.0.
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_completeness_check"
  CHECK ("completeness" IS NULL OR "completeness" IN ('complete', 'truncated'));

-- 5. Прогон принадлежит арендатору. Каскад — как у остальных его записей.
ALTER TABLE "ReconciliationRun" ADD CONSTRAINT "ReconciliationRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
