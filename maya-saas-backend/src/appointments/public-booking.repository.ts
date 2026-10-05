import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  PublicBookingAttempt,
  PublicBookingQuote,
  PublicBookingSession,
} from './public-booking.types';

@Injectable()
export class PublicBookingRepository {
  constructor(private readonly prisma: PrismaService) {}
  async session(secretHash: string) {
    return (
      await this.prisma.$queryRaw<PublicBookingSession[]>(
        Prisma.sql`SELECT * FROM "PublicBookingSession" WHERE "secretHash" = ${secretHash}`,
      )
    )[0];
  }
  async insertSession(s: PublicBookingSession) {
    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "PublicBookingSession" (id,"tenantId","siteKey","configHash","secretHash","expiresAt") VALUES (${s.id},${s.tenantId},${s.siteKey},${s.configHash},${s.secretHash},${s.expiresAt})`,
    );
  }
  async quote(session: PublicBookingSession, id: string) {
    return (
      await this.prisma.$queryRaw<PublicBookingQuote[]>(
        Prisma.sql`SELECT * FROM "PublicBookingQuote" WHERE id=${id} AND "sessionId"=${session.id} AND "tenantId"=${session.tenantId}`,
      )
    )[0];
  }
  async insertQuote(q: PublicBookingQuote) {
    await this.prisma.$executeRaw(
      Prisma.sql`INSERT INTO "PublicBookingQuote" (id,"tenantId","sessionId","snapshotJson","expiresAt") VALUES (${q.id},${q.tenantId},${q.sessionId},${JSON.stringify(q.snapshotJson)}::jsonb,${q.expiresAt})`,
    );
  }
  async attempt(session: PublicBookingSession, nonce: string) {
    return (
      await this.prisma.$queryRaw<PublicBookingAttempt[]>(
        Prisma.sql`SELECT * FROM "PublicBookingAttempt" WHERE "sessionId"=${session.id} AND "tenantId"=${session.tenantId} AND nonce=${nonce}`,
      )
    )[0];
  }
  async insertAttempt(a: PublicBookingAttempt): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`INSERT INTO "PublicBookingAttempt" (id,"tenantId","sessionId","quoteId",nonce,"requestHash","intentHash","normalizedInputHash","targetRef") VALUES (${a.id},${a.tenantId},${a.sessionId},${a.quoteId},${a.nonce},${a.requestHash},${a.intentHash},${a.normalizedInputHash},${a.targetRef}) ON CONFLICT DO NOTHING RETURNING id`,
    );
    return rows.length === 1;
  }
  async rejectBeforeDispatch(id: string) {
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "PublicBookingAttempt" SET "preDispatchFailure"=TRUE WHERE id=${id} AND NOT "preDispatchFailure"`,
    );
  }
}
