-- CreateTable
CREATE TABLE "WidgetTimelineTurn" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "conversationId" UUID NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "principalProofHash" CHAR(64) NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
    "textContent" TEXT,
    "spokenTranscript" TEXT,
    "erasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WidgetTimelineTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetEmission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "widgetId" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "bodyVersion" INTEGER NOT NULL,
    "envelopeSeal" CHAR(64) NOT NULL,
    "bodyHash" CHAR(64) NOT NULL,
    "lifecycleState" TEXT NOT NULL,
    "freshnessClass" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "retentionSec" INTEGER NOT NULL,
    "retentionUntil" TIMESTAMPTZ(3) NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "deliveryChannel" TEXT NOT NULL,
    "supersedesWidgetId" UUID,
    "supersededByWidgetId" UUID,
    "deliveryStateJson" JSONB NOT NULL,
    "terminalLinesJson" JSONB,
    "bodyJson" JSONB,
    "textEquivalentJson" JSONB,
    "a11yJson" JSONB,
    "speechJson" JSONB,
    "bodyDroppedAt" TIMESTAMPTZ(3),
    "erasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WidgetEmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetIntentRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "intentTokenHash" CHAR(64) NOT NULL,
    "widgetId" UUID NOT NULL,
    "principalProofHash" CHAR(64) NOT NULL,
    "widgetKind" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "capabilitySpace" TEXT,
    "capabilityKey" TEXT,
    "handoffSpace" TEXT,
    "handoffKey" TEXT,
    "targetJson" JSONB,
    "verificationFloor" TEXT NOT NULL,
    "confirmationJson" JSONB,
    "inputSchemaHash" CHAR(64),
    "requestedScopeHash" CHAR(64) NOT NULL,
    "bodyHash" CHAR(64) NOT NULL,
    "selectionDomain" TEXT NOT NULL,
    "c9Domain" TEXT,
    "runId" UUID,
    "revisionId" UUID,
    "approvalOfIntentRef" TEXT,
    "confirmationOfKind" TEXT,
    "confirmationOfRef" TEXT,
    "producedByIntentTokenHash" CHAR(64),
    "issuedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "singleUse" BOOLEAN NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "actionReceiptRef" TEXT,
    "frozenNounsJson" JSONB,
    "utteranceTemplate" TEXT,
    "renderedUtterance" TEXT,
    "selectedLabels" TEXT[],
    "selectionDomainLabelsJson" JSONB,
    "spokenTranscript" TEXT,
    "erasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WidgetIntentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetIntentSubmissionAudit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "widgetId" UUID NOT NULL,
    "intentTokenHash" CHAR(64) NOT NULL,
    "clientNonce" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "clientEmittedAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "readbackRef" TEXT,
    "readbackBodyHash" CHAR(64),
    "inputsClosedJson" JSONB,
    "inputsFreeTextJson" JSONB,
    "inputsPiiJson" JSONB,
    "readbackAffirmation" TEXT,
    "spokenTranscript" TEXT,
    "erasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WidgetIntentSubmissionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetIntentReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "widgetId" UUID NOT NULL,
    "intentTokenHash" CHAR(64) NOT NULL,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "refusalCode" TEXT,
    "actionReceiptRef" TEXT,
    "answeringChannel" TEXT NOT NULL,
    "utteranceEcho" TEXT,
    "erasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WidgetIntentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetRenderReceipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "widgetId" UUID NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "renderTier" TEXT NOT NULL,
    "intentsMinted" INTEGER NOT NULL,
    "intentsEmitted" INTEGER NOT NULL,
    "intentsWithheldJson" JSONB NOT NULL,
    "bodyReductionsJson" JSONB NOT NULL,
    "textEquivalentIsCanonical" BOOLEAN NOT NULL,
    "escalationJson" JSONB,
    "degradedAt" TIMESTAMPTZ(3) NOT NULL,
    "deliveryChannel" TEXT NOT NULL,
    "composedEnvelopeJson" JSONB NOT NULL,
    "emittedEnvelopeJson" JSONB NOT NULL,
    "erasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WidgetRenderReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetSuppressedEmission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "moment" TEXT NOT NULL,
    "momentTemplateKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "suppressedAt" TIMESTAMPTZ(3) NOT NULL,
    "unresolvedCells" TEXT[],
    "subjectPrincipalProofHash" CHAR(64),

    CONSTRAINT "WidgetSuppressedEmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetFreeInputLedger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "widgetId" UUID NOT NULL,
    "intentTokenHash" CHAR(64) NOT NULL,
    "capabilitySpace" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "widgetKind" TEXT NOT NULL,
    "fieldKinds" TEXT[],
    "justification" TEXT NOT NULL,
    "boundsSourceRefs" TEXT[],
    "normalizerRefs" TEXT[],
    "mintedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WidgetFreeInputLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetDraft" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "draftRef" TEXT NOT NULL,
    "draftClass" TEXT NOT NULL,
    "ownerCapabilitySpace" TEXT NOT NULL,
    "ownerCapabilityKey" TEXT NOT NULL,
    "principalProofHash" CHAR(64) NOT NULL,
    "diffJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "erasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WidgetDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WidgetErasureTombstone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" TEXT NOT NULL,
    "erasedAt" TIMESTAMPTZ(3) NOT NULL,
    "erasureRequestRef" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "fieldsErased" TEXT[],

    CONSTRAINT "WidgetErasureTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WidgetTimelineTurn_1_idx" ON "WidgetTimelineTurn"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "WidgetTimelineTurn_2_idx" ON "WidgetTimelineTurn"("tenantId", "retentionUntil");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetTimelineTurn_1_key" ON "WidgetTimelineTurn"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetTimelineTurn_2_key" ON "WidgetTimelineTurn"("tenantId", "conversationId", "turnIndex");

-- CreateIndex
CREATE INDEX "WidgetEmission_1_idx" ON "WidgetEmission"("tenantId", "turnId");

-- CreateIndex
CREATE INDEX "WidgetEmission_2_idx" ON "WidgetEmission"("tenantId", "dedupeKey", "lifecycleState");

-- CreateIndex
CREATE INDEX "WidgetEmission_3_idx" ON "WidgetEmission"("tenantId", "retentionUntil", "bodyDroppedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetEmission_1_key" ON "WidgetEmission"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetEmission_2_key" ON "WidgetEmission"("widgetId", "tenantId");

-- CreateIndex
CREATE INDEX "WidgetIntentRecord_1_idx" ON "WidgetIntentRecord"("tenantId", "widgetId");

-- CreateIndex
CREATE INDEX "WidgetIntentRecord_2_idx" ON "WidgetIntentRecord"("tenantId", "expiresAt", "consumedAt");

-- CreateIndex
CREATE INDEX "WidgetIntentRecord_3_idx" ON "WidgetIntentRecord"("tenantId", "principalProofHash", "issuedAt");

-- CreateIndex
CREATE INDEX "WidgetIntentRecord_4_idx" ON "WidgetIntentRecord"("tenantId", "capabilityKey", "effect");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetIntentRecord_1_key" ON "WidgetIntentRecord"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetIntentRecord_2_key" ON "WidgetIntentRecord"("intentTokenHash", "tenantId");

-- CreateIndex
CREATE INDEX "WidgetIntentSubmissionAudit_1_idx" ON "WidgetIntentSubmissionAudit"("tenantId", "intentTokenHash");

-- CreateIndex
CREATE INDEX "WidgetIntentSubmissionAudit_2_idx" ON "WidgetIntentSubmissionAudit"("tenantId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetIntentSubmissionAudit_1_key" ON "WidgetIntentSubmissionAudit"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WidgetIntentReceipt_1_idx" ON "WidgetIntentReceipt"("tenantId", "widgetId");

-- CreateIndex
CREATE INDEX "WidgetIntentReceipt_2_idx" ON "WidgetIntentReceipt"("tenantId", "outcome", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetIntentReceipt_1_key" ON "WidgetIntentReceipt"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetIntentReceipt_2_key" ON "WidgetIntentReceipt"("tenantId", "intentTokenHash");

-- CreateIndex
CREATE INDEX "WidgetRenderReceipt_1_idx" ON "WidgetRenderReceipt"("tenantId", "degradedAt");

-- CreateIndex
CREATE INDEX "WidgetRenderReceipt_2_idx" ON "WidgetRenderReceipt"("tenantId", "renderTier");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetRenderReceipt_1_key" ON "WidgetRenderReceipt"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetRenderReceipt_2_key" ON "WidgetRenderReceipt"("tenantId", "widgetId", "deliveryChannel");

-- CreateIndex
CREATE INDEX "WidgetSuppressedEmission_1_idx" ON "WidgetSuppressedEmission"("tenantId", "moment", "suppressedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetSuppressedEmission_1_key" ON "WidgetSuppressedEmission"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetSuppressedEmission_2_key" ON "WidgetSuppressedEmission"("tenantId", "dedupeKey", "moment");

-- CreateIndex
CREATE INDEX "WidgetFreeInputLedger_1_idx" ON "WidgetFreeInputLedger"("tenantId", "capabilityKey", "mintedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetFreeInputLedger_1_key" ON "WidgetFreeInputLedger"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetFreeInputLedger_2_key" ON "WidgetFreeInputLedger"("tenantId", "intentTokenHash");

-- CreateIndex
CREATE INDEX "WidgetDraft_1_idx" ON "WidgetDraft"("tenantId", "expiresAt", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetDraft_1_key" ON "WidgetDraft"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetDraft_2_key" ON "WidgetDraft"("tenantId", "draftRef");

-- CreateIndex
CREATE INDEX "WidgetErasureTombstone_1_idx" ON "WidgetErasureTombstone"("tenantId", "erasureRequestRef");

-- CreateIndex
CREATE INDEX "WidgetErasureTombstone_2_idx" ON "WidgetErasureTombstone"("tenantId", "erasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WidgetErasureTombstone_1_key" ON "WidgetErasureTombstone"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "WidgetTimelineTurn" ADD CONSTRAINT "WidgetTimelineTurn_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetEmission" ADD CONSTRAINT "WidgetEmission_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetEmission" ADD CONSTRAINT "WidgetEmission_2_fkey" FOREIGN KEY ("turnId", "tenantId") REFERENCES "WidgetTimelineTurn"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetIntentRecord" ADD CONSTRAINT "WidgetIntentRecord_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetIntentRecord" ADD CONSTRAINT "WidgetIntentRecord_2_fkey" FOREIGN KEY ("widgetId", "tenantId") REFERENCES "WidgetEmission"("widgetId", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetIntentSubmissionAudit" ADD CONSTRAINT "WidgetIntentSubmissionAudit_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetIntentSubmissionAudit" ADD CONSTRAINT "WidgetIntentSubmissionAudit_2_fkey" FOREIGN KEY ("intentTokenHash", "tenantId") REFERENCES "WidgetIntentRecord"("intentTokenHash", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetIntentReceipt" ADD CONSTRAINT "WidgetIntentReceipt_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetIntentReceipt" ADD CONSTRAINT "WidgetIntentReceipt_2_fkey" FOREIGN KEY ("intentTokenHash", "tenantId") REFERENCES "WidgetIntentRecord"("intentTokenHash", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetRenderReceipt" ADD CONSTRAINT "WidgetRenderReceipt_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetRenderReceipt" ADD CONSTRAINT "WidgetRenderReceipt_2_fkey" FOREIGN KEY ("widgetId", "tenantId") REFERENCES "WidgetEmission"("widgetId", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetSuppressedEmission" ADD CONSTRAINT "WidgetSuppressedEmission_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetFreeInputLedger" ADD CONSTRAINT "WidgetFreeInputLedger_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetFreeInputLedger" ADD CONSTRAINT "WidgetFreeInputLedger_2_fkey" FOREIGN KEY ("intentTokenHash", "tenantId") REFERENCES "WidgetIntentRecord"("intentTokenHash", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetDraft" ADD CONSTRAINT "WidgetDraft_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WidgetErasureTombstone" ADD CONSTRAINT "WidgetErasureTombstone_1_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

