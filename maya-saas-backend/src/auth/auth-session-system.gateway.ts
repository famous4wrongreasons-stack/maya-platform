import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthSessionSystemGateway {
  constructor(private readonly prisma: PrismaService) {}

  findRefreshCredentialById(tokenId: string) {
    return this.prisma.authRefreshToken.findUnique({
      where: { id: tokenId },
      include: {
        session: {
          include: {
            user: {
              select: {
                id: true,
                role: true,
                status: true,
              },
            },
          },
        },
      },
    });
  }

  findAccessSessionById(sessionId: string) {
    return this.prisma.authSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }
}
