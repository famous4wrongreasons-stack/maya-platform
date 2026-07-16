CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Tenant"
ADD COLUMN "calendarSource" TEXT NOT NULL DEFAULT 'external';

ALTER TABLE "Appointment"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'external',
ADD COLUMN "endAt" TIMESTAMP(3),
ADD COLUMN "blockedStartAt" TIMESTAMP(3),
ADD COLUMN "blockedEndAt" TIMESTAMP(3);

UPDATE "Appointment"
SET "endAt" = "startAt" + INTERVAL '1 hour'
WHERE "endAt" IS NULL;

UPDATE "Appointment"
SET
    "blockedStartAt" = "startAt",
    "blockedEndAt" = "endAt"
WHERE "blockedStartAt" IS NULL OR "blockedEndAt" IS NULL;

ALTER TABLE "Appointment"
ALTER COLUMN "endAt" SET NOT NULL,
ALTER COLUMN "blockedStartAt" SET NOT NULL,
ALTER COLUMN "blockedEndAt" SET NOT NULL;

CREATE TABLE "InternalService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "durationMinutes" INTEGER NOT NULL,
    "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalProvider" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    "displayName" TEXT NOT NULL,
    "title" TEXT,
    "specialization" TEXT,
    "avatarUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalProviderService" (
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalProviderService_pkey" PRIMARY KEY ("tenantId", "providerId", "serviceId")
);

CREATE TABLE "InternalAvailabilityRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalAvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalAvailabilityException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'unavailable',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalAvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InternalService_id_tenantId_key"
ON "InternalService"("id", "tenantId");

CREATE INDEX "InternalService_tenantId_active_sortOrder_idx"
ON "InternalService"("tenantId", "active", "sortOrder");

CREATE UNIQUE INDEX "InternalProvider_id_tenantId_key"
ON "InternalProvider"("id", "tenantId");

CREATE UNIQUE INDEX "InternalProvider_tenantId_userId_key"
ON "InternalProvider"("tenantId", "userId");

CREATE INDEX "InternalProvider_tenantId_active_idx"
ON "InternalProvider"("tenantId", "active");

CREATE INDEX "InternalProvider_branchId_idx"
ON "InternalProvider"("branchId");

CREATE INDEX "InternalProviderService_tenantId_serviceId_active_idx"
ON "InternalProviderService"("tenantId", "serviceId", "active");

CREATE UNIQUE INDEX "InternalAvailabilityRule_tenant_provider_weekday_range_key"
ON "InternalAvailabilityRule"("tenantId", "providerId", "weekday", "startMinute", "endMinute");

CREATE INDEX "InternalAvailabilityRule_tenant_provider_weekday_active_idx"
ON "InternalAvailabilityRule"("tenantId", "providerId", "weekday", "active");

CREATE INDEX "InternalAvailabilityException_tenant_provider_range_idx"
ON "InternalAvailabilityException"("tenantId", "providerId", "startAt", "endAt");

CREATE INDEX "Appointment_tenantId_staffExternalId_startAt_idx"
ON "Appointment"("tenantId", "staffExternalId", "startAt");

ALTER TABLE "InternalService"
ADD CONSTRAINT "InternalService_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalProvider"
ADD CONSTRAINT "InternalProvider_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalProvider"
ADD CONSTRAINT "InternalProvider_userId_tenantId_fkey"
FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalProvider"
ADD CONSTRAINT "InternalProvider_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InternalProviderService"
ADD CONSTRAINT "InternalProviderService_providerId_tenantId_fkey"
FOREIGN KEY ("providerId", "tenantId") REFERENCES "InternalProvider"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalProviderService"
ADD CONSTRAINT "InternalProviderService_serviceId_tenantId_fkey"
FOREIGN KEY ("serviceId", "tenantId") REFERENCES "InternalService"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalAvailabilityRule"
ADD CONSTRAINT "InternalAvailabilityRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalAvailabilityRule"
ADD CONSTRAINT "InternalAvailabilityRule_providerId_tenantId_fkey"
FOREIGN KEY ("providerId", "tenantId") REFERENCES "InternalProvider"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalAvailabilityException"
ADD CONSTRAINT "InternalAvailabilityException_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InternalAvailabilityException"
ADD CONSTRAINT "InternalAvailabilityException_providerId_tenantId_fkey"
FOREIGN KEY ("providerId", "tenantId") REFERENCES "InternalProvider"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appointment"
ADD CONSTRAINT "Appointment_internal_no_overlap"
EXCLUDE USING gist (
    "tenantId" WITH =,
    "staffExternalId" WITH =,
    tsrange("blockedStartAt", "blockedEndAt", '[)') WITH &&
)
WHERE (
    "source" = 'internal'
    AND "status" NOT IN ('canceled', 'cancelled')
);
