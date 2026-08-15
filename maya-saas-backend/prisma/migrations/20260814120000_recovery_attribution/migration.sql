CREATE TABLE "RecoveryTouchpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "subjectRef" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "attributionWindowDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryTouchpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecoveryConversion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "touchpointId" TEXT NOT NULL,
    "externalBookingRef" TEXT NOT NULL,
    "crmExternalId" TEXT,
    "subjectRef" TEXT NOT NULL,
    "bookedAt" TIMESTAMP(3) NOT NULL,
    "visitAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'booked',
    "filledWindow" BOOLEAN NOT NULL DEFAULT false,
    "bookedValueKopecks" INTEGER,
    "confirmedRevenueKopecks" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryConversion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecoveryTouchpoint_tenantId_externalEventId_key"
    ON "RecoveryTouchpoint"("tenantId", "externalEventId");
CREATE INDEX "RecoveryTouchpoint_tenantId_occurredAt_idx"
    ON "RecoveryTouchpoint"("tenantId", "occurredAt");
CREATE INDEX "RecoveryTouchpoint_tenantId_subjectRef_occurredAt_idx"
    ON "RecoveryTouchpoint"("tenantId", "subjectRef", "occurredAt");

CREATE UNIQUE INDEX "RecoveryConversion_tenantId_externalBookingRef_key"
    ON "RecoveryConversion"("tenantId", "externalBookingRef");
CREATE INDEX "RecoveryConversion_tenantId_bookedAt_idx"
    ON "RecoveryConversion"("tenantId", "bookedAt");
CREATE INDEX "RecoveryConversion_tenantId_crmExternalId_idx"
    ON "RecoveryConversion"("tenantId", "crmExternalId");
CREATE INDEX "RecoveryConversion_tenantId_subjectRef_bookedAt_idx"
    ON "RecoveryConversion"("tenantId", "subjectRef", "bookedAt");

ALTER TABLE "RecoveryTouchpoint"
    ADD CONSTRAINT "RecoveryTouchpoint_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecoveryConversion"
    ADD CONSTRAINT "RecoveryConversion_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecoveryConversion"
    ADD CONSTRAINT "RecoveryConversion_touchpointId_fkey"
    FOREIGN KEY ("touchpointId") REFERENCES "RecoveryTouchpoint"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
