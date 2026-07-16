ALTER TABLE "InternalProvider"
ALTER COLUMN "userId" DROP NOT NULL;

CREATE TABLE "AiOnboardingDraft" (
    "id" TEXT NOT NULL,
    "draftTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "templateId" TEXT NOT NULL,
    "blueprintJson" JSONB NOT NULL,
    "missingFieldsJson" JSONB NOT NULL,
    "inputDigest" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedTenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOnboardingDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiOnboardingDraft_draftTokenHash_key"
ON "AiOnboardingDraft"("draftTokenHash");

CREATE INDEX "AiOnboardingDraft_status_expiresAt_idx"
ON "AiOnboardingDraft"("status", "expiresAt");

CREATE INDEX "AiOnboardingDraft_confirmedTenantId_idx"
ON "AiOnboardingDraft"("confirmedTenantId");

ALTER TABLE "AiOnboardingDraft"
ADD CONSTRAINT "AiOnboardingDraft_confirmedTenantId_fkey"
FOREIGN KEY ("confirmedTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
