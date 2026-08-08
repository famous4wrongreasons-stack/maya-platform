-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "payloadJson" JSONB,
    "deepLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxItem_tenantId_userId_createdAt_idx" ON "InboxItem"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "InboxItem_tenantId_type_createdAt_idx" ON "InboxItem"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboxItem_tenantId_userId_type_sourceEventId_key" ON "InboxItem"("tenantId", "userId", "type", "sourceEventId");

-- CreateIndex
CREATE INDEX "DevicePushToken_tenantId_userId_idx" ON "DevicePushToken"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePushToken_tenantId_token_key" ON "DevicePushToken"("tenantId", "token");

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
