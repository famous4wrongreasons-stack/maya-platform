-- CYCLE 03 B3.1 — РАЗДЕЛЕНИЕ ИДЕНТИЧНОСТЕЙ ВИЗИТА
--
-- Доказано данными: `clientId` у всех 18 боевых визитов — ОДИН пользователь,
-- владелец салона. Поле отвечает «в чьём кабинете это видно», а не «кто
-- пришёл». Бизнес-клиент получает собственную колонку.
--
-- 🔴 Почему связь с членством СНИМАЕТСЯ, а не ослабляется.
-- Требование: удаление пользователя обнуляет ссылку, но НЕ уносит визит салона.
-- Для составного ключа (clientId, tenantId) → Membership это означало бы
-- `ON DELETE SET NULL` только по одной колонке — синтаксис появился в
-- PostgreSQL 15, а прод работает на 14.23. Проверено на сервере.
--
-- Поэтому инвариант «аккаунт указан ⇒ он член этого арендатора» переезжает в
-- ТРИГГЕР. Это не ослабление до уровня приложения: проверка остаётся в базе и
-- срабатывает на любой записи, кем бы она ни была сделана. Приём тот же, что
-- уже применён в этом проекте для сессий (`AuthSession_user_tenant_guard`).
--
-- Разрушающих операций над данными нет: ни одна строка не удаляется, ни одно
-- значение не перезаписывается.

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_clientId_tenantId_fkey";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "mayaClientId" TEXT,
ALTER COLUMN "clientId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_tenantId_mayaClientId_idx" ON "Appointment"("tenantId", "mayaClientId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_mayaClientId_tenantId_fkey" FOREIGN KEY ("mayaClientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Инвариант членства: аккаунт указан ⇒ он член этого арендатора ──────────
--
-- Заменяет снятый составной внешний ключ. Проверяет ровно то же условие и
-- ровно там же — в базе, — но не мешает обнулению ссылки при удалении
-- пользователя.
CREATE OR REPLACE FUNCTION "appointment_account_membership_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Аккаунта нет — проверять нечего: это запись салона без клиента Maya.
  IF NEW."clientId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Membership" m
    WHERE m."userId" = NEW."clientId" AND m."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'appointment_account_not_member_of_tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Appointment_account_membership_guard" ON "Appointment";
CREATE TRIGGER "Appointment_account_membership_guard"
  BEFORE INSERT OR UPDATE OF "clientId", "tenantId" ON "Appointment"
  FOR EACH ROW
  EXECUTE FUNCTION "appointment_account_membership_guard"();
