CREATE TABLE "AiBrainSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "sessionKeyHash" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "profile" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "planJson" JSONB NOT NULL DEFAULT '{}',
  "lastRequestId" TEXT NOT NULL,
  "turnCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiBrainSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiMemoryFact" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subjectUserId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "valueHash" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "confidence" INTEGER NOT NULL,
  "retentionDays" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiMemoryFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiKnowledgeSource" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdByTenantId" TEXT,
  "encryptedTitle" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'ru-RU',
  "status" TEXT NOT NULL DEFAULT 'active',
  "audienceRolesJson" JSONB NOT NULL DEFAULT '[]',
  "contentHash" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiKnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiKnowledgeChunk" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "encryptedContent" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiBrainSession_tenantId_actorUserId_sessionKeyHash_key"
  ON "AiBrainSession"("tenantId", "actorUserId", "sessionKeyHash");
CREATE INDEX "AiBrainSession_tenantId_expiresAt_idx"
  ON "AiBrainSession"("tenantId", "expiresAt");
CREATE INDEX "AiBrainSession_tenantId_actorUserId_updatedAt_idx"
  ON "AiBrainSession"("tenantId", "actorUserId", "updatedAt");

CREATE UNIQUE INDEX "AiMemoryFact_tenantId_subjectUserId_scope_key_key"
  ON "AiMemoryFact"("tenantId", "subjectUserId", "scope", "key");
CREATE INDEX "AiMemoryFact_tenantId_subjectUserId_expiresAt_idx"
  ON "AiMemoryFact"("tenantId", "subjectUserId", "expiresAt");
CREATE INDEX "AiMemoryFact_tenantId_expiresAt_deletedAt_idx"
  ON "AiMemoryFact"("tenantId", "expiresAt", "deletedAt");

CREATE UNIQUE INDEX "AiKnowledgeSource_id_tenantId_key"
  ON "AiKnowledgeSource"("id", "tenantId");
CREATE UNIQUE INDEX "AiKnowledgeSource_tenantId_contentHash_key"
  ON "AiKnowledgeSource"("tenantId", "contentHash");
CREATE INDEX "AiKnowledgeSource_tenantId_status_effectiveAt_idx"
  ON "AiKnowledgeSource"("tenantId", "status", "effectiveAt");
CREATE INDEX "AiKnowledgeSource_tenantId_expiresAt_idx"
  ON "AiKnowledgeSource"("tenantId", "expiresAt");

CREATE UNIQUE INDEX "AiKnowledgeChunk_sourceId_tenantId_ordinal_key"
  ON "AiKnowledgeChunk"("sourceId", "tenantId", "ordinal");
CREATE INDEX "AiKnowledgeChunk_tenantId_sourceId_idx"
  ON "AiKnowledgeChunk"("tenantId", "sourceId");

ALTER TABLE "AiBrainSession"
  ADD CONSTRAINT "AiBrainSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiBrainSession"
  ADD CONSTRAINT "AiBrainSession_actorUserId_tenantId_fkey"
  FOREIGN KEY ("actorUserId", "tenantId") REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiMemoryFact"
  ADD CONSTRAINT "AiMemoryFact_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiMemoryFact"
  ADD CONSTRAINT "AiMemoryFact_subjectUserId_tenantId_fkey"
  FOREIGN KEY ("subjectUserId", "tenantId") REFERENCES "Membership"("userId", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiKnowledgeSource"
  ADD CONSTRAINT "AiKnowledgeSource_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiKnowledgeSource"
  ADD CONSTRAINT "AiKnowledgeSource_createdByUserId_createdByTenantId_fkey"
  FOREIGN KEY ("createdByUserId", "createdByTenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiKnowledgeChunk"
  ADD CONSTRAINT "AiKnowledgeChunk_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiKnowledgeChunk"
  ADD CONSTRAINT "AiKnowledgeChunk_sourceId_tenantId_fkey"
  FOREIGN KEY ("sourceId", "tenantId") REFERENCES "AiKnowledgeSource"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;
