-- Аудит различает платформенные и арендаторные действия ЯВНО.
--
-- Раньше tenantId был обязателен, поэтому вход владельца платформы, создание и
-- удаление арендатора записать было некуда: у платформенного действия нет
-- арендатора. Подделывать принадлежность через служебного арендатора нельзя —
-- платформенные записи оказались бы в истории чужого салона.
--
-- Инвариант держит база, а не соглашение:
--   scope = 'tenant'   <=> "tenantId" IS NOT NULL
--   scope = 'platform' <=> "tenantId" IS NULL
-- Состояния взаимоисключающие и исчерпывающие. Арендаторной записи без
-- арендатора не существует; платформенная не может нести tenantId и попасть в
-- выборку салона.

CREATE TYPE "AuditScope" AS ENUM ('tenant', 'platform');

-- Существующие строки все до одной арендаторные: колонка была NOT NULL.
-- DEFAULT засыпает их корректно, и CHECK ниже проходит без правки данных.
ALTER TABLE "AuditLog"
  ADD COLUMN "scope" "AuditScope" NOT NULL DEFAULT 'tenant';

ALTER TABLE "AuditLog"
  ALTER COLUMN "tenantId" DROP NOT NULL;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_scope_tenant_check" CHECK (
    ("scope" = 'tenant'   AND "tenantId" IS NOT NULL) OR
    ("scope" = 'platform' AND "tenantId" IS NULL)
  );

CREATE INDEX "AuditLog_scope_createdAt_idx" ON "AuditLog" ("scope", "createdAt");
