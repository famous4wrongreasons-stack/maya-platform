ALTER TABLE "Tenant"
ADD COLUMN "trialFullAccess" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TrialActivation" (
    "id" TEXT NOT NULL,
    "activationTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'maya_os',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialActivation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AiOnboardingDraft"
ADD COLUMN "lastAssistantMessage" TEXT,
ADD COLUMN "quickRepliesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "lastConfidence" DOUBLE PRECISION,
ADD COLUMN "needsClarification" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "interpreterSource" TEXT NOT NULL DEFAULT 'safe_fallback',
ADD COLUMN "turnCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "trialActivationId" TEXT;

CREATE UNIQUE INDEX "TrialActivation_activationTokenHash_key"
ON "TrialActivation"("activationTokenHash");

CREATE UNIQUE INDEX "TrialActivation_tenantId_key"
ON "TrialActivation"("tenantId");

CREATE INDEX "TrialActivation_status_expiresAt_idx"
ON "TrialActivation"("status", "expiresAt");

CREATE INDEX "TrialActivation_completedAt_idx"
ON "TrialActivation"("completedAt");

CREATE UNIQUE INDEX "AiOnboardingDraft_trialActivationId_key"
ON "AiOnboardingDraft"("trialActivationId");

ALTER TABLE "TrialActivation"
ADD CONSTRAINT "TrialActivation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiOnboardingDraft"
ADD CONSTRAINT "AiOnboardingDraft_trialActivationId_fkey"
FOREIGN KEY ("trialActivationId") REFERENCES "TrialActivation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
