import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

interface SessionPrincipal {
  tenantId: string | null;
  userId: string;
}

interface RefreshCredential {
  expiresAt: Date;
  id: string;
  tokenHash: string;
}

@Injectable()
export class AuthSessionRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  createSession(
    principal: SessionPrincipal,
    params: {
      deviceLabel: string;
      expiresAt: Date;
      id: string;
      ipHash: string | null;
      refreshCredential: RefreshCredential;
    },
  ) {
    this.assertPrincipal(principal);

    return this.prisma.authSession.create({
      data: {
        id: params.id,
        tenantId: principal.tenantId,
        userId: principal.userId,
        deviceLabel: params.deviceLabel,
        ipHash: params.ipHash,
        expiresAt: params.expiresAt,
        refreshTokens: {
          create: params.refreshCredential,
        },
      },
    });
  }

  async rotateRefreshToken(
    principal: SessionPrincipal,
    params: {
      currentTokenHash: string;
      currentTokenId: string;
      nextCredential: RefreshCredential;
      now: Date;
      sessionId: string;
    },
  ): Promise<'rotated' | 'reused' | 'invalid'> {
    this.assertPrincipal(principal);

    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.authRefreshToken.updateMany({
        where: {
          id: params.currentTokenId,
          sessionId: params.sessionId,
          tokenHash: params.currentTokenHash,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: params.now },
          session: {
            userId: principal.userId,
            tenantId: principal.tenantId,
            revokedAt: null,
            expiresAt: { gt: params.now },
          },
        },
        data: { consumedAt: params.now },
      });

      if (consumed.count !== 1) {
        const previous = await transaction.authRefreshToken.findUnique({
          where: { id: params.currentTokenId },
          select: {
            tokenHash: true,
            consumedAt: true,
            session: {
              select: {
                id: true,
                tenantId: true,
                userId: true,
              },
            },
          },
        });

        const isReplay =
          previous?.tokenHash === params.currentTokenHash &&
          previous.consumedAt !== null &&
          previous.session.id === params.sessionId &&
          previous.session.userId === principal.userId &&
          previous.session.tenantId === principal.tenantId;

        if (!isReplay) {
          return 'invalid';
        }

        await this.revokeSessionInTransaction(
          transaction,
          principal,
          params.sessionId,
          params.now,
          'refresh_token_reuse',
        );
        return 'reused';
      }

      const touched = await transaction.authSession.updateMany({
        where: {
          id: params.sessionId,
          userId: principal.userId,
          tenantId: principal.tenantId,
          revokedAt: null,
          expiresAt: { gt: params.now },
        },
        data: { lastUsedAt: params.now },
      });

      if (touched.count !== 1) {
        throw new Error('Auth session changed during refresh rotation');
      }

      await transaction.authRefreshToken.create({
        data: {
          ...params.nextCredential,
          sessionId: params.sessionId,
        },
      });

      return 'rotated';
    });
  }

  listSessions(principal: SessionPrincipal) {
    this.assertPrincipal(principal);

    return this.prisma.authSession.findMany({
      where: {
        userId: principal.userId,
        tenantId: principal.tenantId,
      },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        deviceLabel: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        revokeReason: true,
      },
    });
  }

  async revokeSession(
    principal: SessionPrincipal,
    sessionId: string,
    now: Date,
    reason: string,
  ) {
    this.assertPrincipal(principal);

    return this.prisma.$transaction((transaction) =>
      this.revokeSessionInTransaction(
        transaction,
        principal,
        sessionId,
        now,
        reason,
      ),
    );
  }

  async revokeAllSessions(
    principal: SessionPrincipal,
    now: Date,
    reason: string,
  ) {
    this.assertPrincipal(principal);

    return this.prisma.$transaction(async (transaction) => {
      const sessions = await transaction.authSession.findMany({
        where: {
          userId: principal.userId,
          tenantId: principal.tenantId,
          revokedAt: null,
        },
        select: { id: true },
      });
      const sessionIds = sessions.map((session) => session.id);

      if (sessionIds.length === 0) {
        return 0;
      }

      await transaction.authSession.updateMany({
        where: { id: { in: sessionIds } },
        data: { revokedAt: now, revokeReason: reason },
      });
      await transaction.authRefreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: now },
      });

      return sessionIds.length;
    });
  }

  private async revokeSessionInTransaction(
    transaction: Prisma.TransactionClient,
    principal: SessionPrincipal,
    sessionId: string,
    now: Date,
    reason: string,
  ) {
    const revoked = await transaction.authSession.updateMany({
      where: {
        id: sessionId,
        userId: principal.userId,
        tenantId: principal.tenantId,
        revokedAt: null,
      },
      data: { revokedAt: now, revokeReason: reason },
    });

    if (revoked.count === 1) {
      await transaction.authRefreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
    }

    return revoked.count;
  }

  private assertPrincipal(principal: SessionPrincipal): void {
    this.tenantContext.assertAuthPrincipal(
      principal.userId,
      principal.tenantId,
    );
  }
}
