-- CreateTable
CREATE TABLE "WidgetCapabilityGap" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gapKey" TEXT NOT NULL,
    "act" TEXT NOT NULL,
    "ownerState" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "closingCommit" TEXT,

    CONSTRAINT "WidgetCapabilityGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetMechanismGap" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gapKey" TEXT NOT NULL,
    "pRef" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "blockingRules" TEXT[],

    CONSTRAINT "WidgetMechanismGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetCapabilityPolicy" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "capabilitySpace" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "minVerification" TEXT NOT NULL,
    "consentClass" TEXT NOT NULL,
    "dispatchIsSynchronous" BOOLEAN NOT NULL,
    "contractVersion" INTEGER NOT NULL,

    CONSTRAINT "WidgetCapabilityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WidgetCapabilityGap_1_idx" ON "WidgetCapabilityGap"("ownerState", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetCapabilityGap_1_key" ON "WidgetCapabilityGap"("gapKey");

-- CreateIndex
CREATE INDEX "WidgetMechanismGap_1_idx" ON "WidgetMechanismGap"("status", "packageKey");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetMechanismGap_1_key" ON "WidgetMechanismGap"("gapKey");

-- CreateIndex
CREATE INDEX "WidgetCapabilityPolicy_1_idx" ON "WidgetCapabilityPolicy"("consentClass", "minVerification");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetCapabilityPolicy_1_key" ON "WidgetCapabilityPolicy"("capabilitySpace", "capabilityKey");

