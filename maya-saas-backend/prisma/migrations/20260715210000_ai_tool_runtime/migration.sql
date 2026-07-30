CREATE TABLE "AiApprovalRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestedByUserId" TEXT,
  "requestedByTenantId" TEXT,
  "decidedByUserId" TEXT,
  "decidedByTenantId" TEXT,
  "toolName" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "riskTier" TEXT NOT NULL,
  "approvalPolicy" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "summary" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payloadPreviewJson" JSONB NOT NULL,
  "encryptedArguments" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  "executedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiToolExecution" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorTenantId" TEXT,
  "approvalRequestId" TEXT,
  "approvalTenantId" TEXT,
  "toolName" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "riskTier" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "encryptedResult" TEXT,
  "errorCode" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiToolExecution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiApprovalRequest_id_tenantId_key"
  ON "AiApprovalRequest"("id", "tenantId");
CREATE UNIQUE INDEX "AiApprovalRequest_tenantId_idempotencyKey_key"
  ON "AiApprovalRequest"("tenantId", "idempotencyKey");
CREATE INDEX "AiApprovalRequest_tenantId_status_expiresAt_idx"
  ON "AiApprovalRequest"("tenantId", "status", "expiresAt");
CREATE INDEX "AiApprovalRequest_tenantId_requestedByUserId_createdAt_idx"
  ON "AiApprovalRequest"("tenantId", "requestedByUserId", "createdAt");

CREATE UNIQUE INDEX "AiToolExecution_approvalRequestId_approvalTenantId_key"
  ON "AiToolExecution"("approvalRequestId", "approvalTenantId");
CREATE UNIQUE INDEX "AiToolExecution_tenantId_idempotencyKey_key"
  ON "AiToolExecution"("tenantId", "idempotencyKey");
CREATE INDEX "AiToolExecution_tenantId_toolName_createdAt_idx"
  ON "AiToolExecution"("tenantId", "toolName", "createdAt");
CREATE INDEX "AiToolExecution_tenantId_actorUserId_createdAt_idx"
  ON "AiToolExecution"("tenantId", "actorUserId", "createdAt");
CREATE INDEX "AiToolExecution_tenantId_status_startedAt_idx"
  ON "AiToolExecution"("tenantId", "status", "startedAt");

ALTER TABLE "AiApprovalRequest"
  ADD CONSTRAINT "AiApprovalRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiApprovalRequest"
  ADD CONSTRAINT "AiApprovalRequest_requestedByUserId_tenantId_fkey"
  FOREIGN KEY ("requestedByUserId", "requestedByTenantId") REFERENCES "User"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiApprovalRequest"
  ADD CONSTRAINT "AiApprovalRequest_decidedByUserId_tenantId_fkey"
  FOREIGN KEY ("decidedByUserId", "decidedByTenantId") REFERENCES "User"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiToolExecution"
  ADD CONSTRAINT "AiToolExecution_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiToolExecution"
  ADD CONSTRAINT "AiToolExecution_actorUserId_tenantId_fkey"
  FOREIGN KEY ("actorUserId", "actorTenantId") REFERENCES "User"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiToolExecution"
  ADD CONSTRAINT "AiToolExecution_approvalRequestId_tenantId_fkey"
  FOREIGN KEY ("approvalRequestId", "approvalTenantId") REFERENCES "AiApprovalRequest"("id", "tenantId") ON DELETE SET NULL ON UPDATE CASCADE;
