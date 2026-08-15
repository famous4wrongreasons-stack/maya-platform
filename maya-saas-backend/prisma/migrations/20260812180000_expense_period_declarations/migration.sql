CREATE TABLE "ExpensePeriodDeclaration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "declaredById" TEXT,
    "periodFromDay" TEXT NOT NULL,
    "periodToDay" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExpensePeriodDeclaration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpensePeriodDeclaration_tenantId_periodFromDay_periodToDay_key"
ON "ExpensePeriodDeclaration"("tenantId", "periodFromDay", "periodToDay");
CREATE UNIQUE INDEX "ExpensePeriodDeclaration_tenantId_idempotencyKey_key"
ON "ExpensePeriodDeclaration"("tenantId", "idempotencyKey");
CREATE INDEX "ExpensePeriodDeclaration_tenantId_periodFromDay_periodToDay_idx"
ON "ExpensePeriodDeclaration"("tenantId", "periodFromDay", "periodToDay");

ALTER TABLE "ExpensePeriodDeclaration" ADD CONSTRAINT "ExpensePeriodDeclaration_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpensePeriodDeclaration" ADD CONSTRAINT "ExpensePeriodDeclaration_declaredById_fkey"
FOREIGN KEY ("declaredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
