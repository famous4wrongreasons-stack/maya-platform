import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';

@Injectable()
export class TenantAuthRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  upsertPhoneChallenge(params: {
    phone: string;
    codeHash: string;
    expiresAt: Date;
  }) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.phoneAuthCode.upsert({
      where: {
        tenantId_phone: {
          tenantId,
          phone: params.phone,
        },
      },
      update: {
        codeHash: params.codeHash,
        attempts: 0,
        expiresAt: params.expiresAt,
        consumedAt: null,
      },
      create: {
        tenantId,
        phone: params.phone,
        codeHash: params.codeHash,
        expiresAt: params.expiresAt,
      },
    });
  }

  findPhoneChallenge(phone: string) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.phoneAuthCode.findUnique({
      where: {
        tenantId_phone: {
          tenantId,
          phone,
        },
      },
    });
  }

  async recordInvalidPhoneAttempt(
    id: string,
    codeHash: string,
    attemptedAt: Date,
    maxAttempts: number,
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.phoneAuthCode.updateMany({
        where: {
          id,
          tenantId,
          codeHash,
          consumedAt: null,
          expiresAt: { gt: attemptedAt },
          attempts: { lt: maxAttempts },
        },
        data: {
          attempts: { increment: 1 },
        },
      });

      if (result.count !== 1) {
        return null;
      }

      const challenge = await transaction.phoneAuthCode.findUnique({
        where: {
          id_tenantId: {
            id,
            tenantId,
          },
        },
        select: { attempts: true },
      });

      return challenge?.attempts ?? null;
    });
  }

  async claimPhoneChallenge(id: string, codeHash: string, consumedAt: Date) {
    const tenantId = this.tenantContext.requireTenantId();
    const result = await this.prisma.phoneAuthCode.updateMany({
      where: {
        id,
        tenantId,
        codeHash,
        consumedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { consumedAt },
    });

    return result.count === 1;
  }

  upsertEmailChallenge(params: {
    email: string;
    codeHash: string;
    expiresAt: Date;
  }) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.emailAuthCode.upsert({
      where: {
        tenantId_email: {
          tenantId,
          email: params.email,
        },
      },
      update: {
        codeHash: params.codeHash,
        attempts: 0,
        expiresAt: params.expiresAt,
        consumedAt: null,
      },
      create: {
        tenantId,
        email: params.email,
        codeHash: params.codeHash,
        expiresAt: params.expiresAt,
      },
    });
  }

  findEmailChallenge(email: string) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.emailAuthCode.findUnique({
      where: {
        tenantId_email: {
          tenantId,
          email,
        },
      },
    });
  }

  async recordInvalidEmailAttempt(
    id: string,
    codeHash: string,
    attemptedAt: Date,
    maxAttempts: number,
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.emailAuthCode.updateMany({
        where: {
          id,
          tenantId,
          codeHash,
          consumedAt: null,
          expiresAt: { gt: attemptedAt },
          attempts: { lt: maxAttempts },
        },
        data: { attempts: { increment: 1 } },
      });

      if (result.count !== 1) return null;

      const challenge = await transaction.emailAuthCode.findUnique({
        where: {
          id_tenantId: {
            id,
            tenantId,
          },
        },
        select: { attempts: true },
      });

      return challenge?.attempts ?? null;
    });
  }

  async claimEmailChallenge(id: string, codeHash: string, consumedAt: Date) {
    const tenantId = this.tenantContext.requireTenantId();
    const result = await this.prisma.emailAuthCode.updateMany({
      where: {
        id,
        tenantId,
        codeHash,
        consumedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { consumedAt },
    });

    return result.count === 1;
  }

  createFlowState(params: {
    provider: string;
    state: string;
    redirectUri: string;
    codeVerifier: string;
    expiresAt: Date;
  }) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.authFlowState.create({
      data: {
        tenantId,
        provider: params.provider,
        state: params.state,
        redirectUri: params.redirectUri,
        codeVerifier: params.codeVerifier,
        expiresAt: params.expiresAt,
      },
    });
  }

  async claimFlowState(id: string, provider: string, consumedAt: Date) {
    const tenantId = this.tenantContext.requireTenantId();
    const result = await this.prisma.authFlowState.updateMany({
      where: {
        id,
        tenantId,
        provider,
        consumedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { consumedAt },
    });

    return result.count === 1;
  }

  findIdentity(provider: string, providerUserId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.authIdentity.findUnique({
      where: {
        tenantId_provider_providerUserId: {
          tenantId,
          provider,
          providerUserId,
        },
      },
      include: {
        user: {
          include: {
            branch: true,
            tenant: true,
          },
        },
      },
    });
  }

  createIdentity(params: {
    userId: string;
    provider: string;
    providerUserId: string;
    email: string | null;
    phone: string | null;
    profileJson: Prisma.InputJsonValue;
  }) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.authIdentity.create({
      data: {
        tenantId,
        userId: params.userId,
        provider: params.provider,
        providerUserId: params.providerUserId,
        email: params.email,
        phone: params.phone,
        profileJson: params.profileJson,
      },
    });
  }

  updateIdentity(
    id: string,
    params: {
      email: string | null;
      phone: string | null;
      profileJson: Prisma.InputJsonValue;
    },
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.authIdentity.update({
      where: {
        id_tenantId: {
          id,
          tenantId,
        },
      },
      data: params,
    });
  }

  reassignIdentity(
    id: string,
    params: {
      userId: string;
      email: string | null;
      phone: string | null;
      profileJson: Prisma.InputJsonValue;
    },
  ) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.authIdentity.update({
      where: {
        id_tenantId: {
          id,
          tenantId,
        },
      },
      data: params,
    });
  }

  listIdentityProvidersForUser(userId: string) {
    const tenantId = this.tenantContext.requireTenantId();

    return this.prisma.authIdentity.findMany({
      where: {
        tenantId,
        userId,
      },
      select: {
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { provider: 'asc' },
    });
  }
}
