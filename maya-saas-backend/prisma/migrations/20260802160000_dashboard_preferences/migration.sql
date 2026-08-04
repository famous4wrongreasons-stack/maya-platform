CREATE TABLE "DashboardPreference" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "section" TEXT NOT NULL DEFAULT 'finance',
  "configJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DashboardPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardPreference_userId_tenantId_section_key"
  ON "DashboardPreference"("userId", "tenantId", "section");

CREATE INDEX "DashboardPreference_tenantId_section_idx"
  ON "DashboardPreference"("tenantId", "section");

ALTER TABLE "DashboardPreference"
  ADD CONSTRAINT "DashboardPreference_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DashboardPreference"
  ADD CONSTRAINT "DashboardPreference_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
