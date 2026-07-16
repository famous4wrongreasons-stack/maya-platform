-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingMethodId" TEXT,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
