-- Карта слияния дублей аккаунта.
--
-- Зачем отдельная таблица, а не флаг на User:
--   1. @@unique([tenantId, duplicateUserId]) — замок идемпотентности: повторный
--      commit не может создать вторую запись и возвращает исходный отчёт.
--   2. reportJson хранит, что именно было перенесено (счётчики и id, без ПД) —
--      без этого разобрать последствия слияния постфактум невозможно.
--
-- FK на User намеренно НЕТ: карта должна пережить любое будущее удаление
-- пользователя, иначе она обезличится ровно тогда, когда понадобится.
CREATE TABLE "UserMerge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "primaryUserId" TEXT NOT NULL,
    "duplicateUserId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "evidence" TEXT NOT NULL,
    "reportJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMerge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMerge_tenantId_duplicateUserId_key"
    ON "UserMerge"("tenantId", "duplicateUserId");

CREATE INDEX "UserMerge_tenantId_primaryUserId_idx"
    ON "UserMerge"("tenantId", "primaryUserId");

ALTER TABLE "UserMerge" ADD CONSTRAINT "UserMerge_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
