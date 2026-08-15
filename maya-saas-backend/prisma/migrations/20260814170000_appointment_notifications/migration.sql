CREATE TABLE "AppointmentNotificationSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "leadTimesMinutes" JSONB NOT NULL DEFAULT '[1440,120]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentNotificationSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentNotificationSetting_tenantId_key"
    ON "AppointmentNotificationSetting"("tenantId");

CREATE INDEX "AppointmentNotificationSetting_enabled_idx"
    ON "AppointmentNotificationSetting"("enabled");

ALTER TABLE "AppointmentNotificationSetting"
    ADD CONSTRAINT "AppointmentNotificationSetting_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
