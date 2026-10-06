Loaded Prisma config from prisma.config.ts.

-- DropForeignKey
ALTER TABLE "PublicBookingAttempt" DROP CONSTRAINT "PublicBookingAttempt_quoteId_sessionId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PublicBookingQuote" DROP CONSTRAINT "PublicBookingQuote_sessionId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PublicBookingSession" DROP CONSTRAINT "PublicBookingSession_tenantId_fkey";

-- AddForeignKey
ALTER TABLE "PublicBookingSession" ADD CONSTRAINT "PublicBookingSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PublicBookingQuote" ADD CONSTRAINT "PublicBookingQuote_sessionId_tenantId_fkey" FOREIGN KEY ("sessionId", "tenantId") REFERENCES "PublicBookingSession"("id", "tenantId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "PublicBookingAttempt" ADD CONSTRAINT "PublicBookingAttempt_quoteId_sessionId_tenantId_fkey" FOREIGN KEY ("quoteId", "sessionId", "tenantId") REFERENCES "PublicBookingQuote"("id", "sessionId", "tenantId") ON DELETE RESTRICT ON UPDATE NO ACTION;

