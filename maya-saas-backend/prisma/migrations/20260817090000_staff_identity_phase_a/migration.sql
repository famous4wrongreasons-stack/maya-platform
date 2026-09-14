-- Cycle 02 · STAFF IDENTITY · PHASE A — ADD ONLY
--
-- 🔴 Что эта миграция НЕ делает, и это главное:
--   * не удаляет НИ ОДНОЙ существующей колонки;
--   * не трогает CrmStaffAccess.externalStaffId и Appointment.staffExternalId;
--   * не удаляет и не переименовывает InternalProvider;
--   * не ставит NOT NULL — ни одного;
--   * не переносит данные: backfill выполняет отдельный скрипт приложения,
--     потому что имя мастера обязано быть ЗАШИФРОВАНО, а ключ у приложения.
--
-- Почему появилась. Идентичность мастера жила в двух несовместимых видах:
-- InternalProvider.id (cuid Maya) и CrmStaffAccess.externalStaffId (id чужой
-- системы), причём второй был ключом выдачи роли и отзыва сессий. Внешний
-- идентификатор провайдера решал, кто входит в систему.
--
-- Staff.encryptedDisplayName СОЗНАТЕЛЬНО nullable: открытым текстом имя здесь
-- не появится даже временно.
--
-- Порядок объектов не произвольный: таблицы → колонки → уникальности и индексы
-- → внешние ключи. Составной FK требует уже существующего уникального индекса
-- (Staff_id_tenantId_key) — обратный порядок падает на
-- «there is no unique constraint matching given keys».

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "CrmStaffAccess" ADD COLUMN     "staffId" TEXT;

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "branchId" TEXT,
    "encryptedDisplayName" TEXT,
    "title" TEXT,
    "specialization" TEXT,
    "avatarUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProviderLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProviderLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Staff_tenantId_active_idx" ON "Staff"("tenantId", "active");

-- CreateIndex
CREATE INDEX "Staff_branchId_idx" ON "Staff"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_id_tenantId_key" ON "Staff"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_tenantId_userId_key" ON "Staff"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "StaffProviderLink_tenantId_staffId_idx" ON "StaffProviderLink"("tenantId", "staffId");

-- CreateIndex
CREATE INDEX "StaffProviderLink_tenantId_provider_syncedAt_idx" ON "StaffProviderLink"("tenantId", "provider", "syncedAt");

-- CreateIndex
CREATE INDEX "StaffProviderLink_tenantId_provider_externalId_unlinkedAt_idx" ON "StaffProviderLink"("tenantId", "provider", "externalId", "unlinkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProviderLink_tenantId_provider_externalId_key" ON "StaffProviderLink"("tenantId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_staffId_startAt_idx" ON "Appointment"("tenantId", "staffId", "startAt");

-- CreateIndex
CREATE INDEX "CrmStaffAccess_staffId_idx" ON "CrmStaffAccess"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmStaffAccess_staffId_tenantId_key" ON "CrmStaffAccess"("staffId", "tenantId");

-- AddForeignKey
ALTER TABLE "CrmStaffAccess" ADD CONSTRAINT "CrmStaffAccess_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_branchId_tenantId_fkey" FOREIGN KEY ("branchId", "tenantId") REFERENCES "Branch"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProviderLink" ADD CONSTRAINT "StaffProviderLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProviderLink" ADD CONSTRAINT "StaffProviderLink_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_tenantId_fkey" FOREIGN KEY ("staffId", "tenantId") REFERENCES "Staff"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
