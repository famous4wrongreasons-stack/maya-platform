import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@prisma/client';

import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findTenantUserByEmail(tenantId: string, email: string) {
    return this.prisma.user.findFirst({
      where: {
        tenantId,
        email: email.toLowerCase(),
      },
      include: {
        tenant: true,
        branch: true,
      },
    });
  }

  async findPlatformOwnerByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: {
        tenantId: null,
        email: email.toLowerCase(),
        role: UserRole.PLATFORM_OWNER,
      },
      include: {
        tenant: true,
        branch: true,
      },
    });
  }

  async ensureEmailIsAvailable(tenantId: string | null, email: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId,
        email: email.toLowerCase(),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
  }

  async createUser(data: {
    tenantId: string | null;
    branchId?: string | null;
    email: string;
    phone?: string | null;
    passwordHash: string;
    role: string;
    status?: string;
  }) {
    return this.prisma.user.create({
      data: {
        tenantId: data.tenantId,
        branchId: data.branchId ?? null,
        email: data.email.toLowerCase(),
        phone: data.phone ?? null,
        passwordHash: data.passwordHash,
        role: data.role,
        status: data.status ?? 'active',
      },
      include: {
        tenant: true,
        branch: true,
      },
    });
  }

  async getUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
        branch: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  serializeUser(
    user: User & {
      tenant?: {
        id: string;
        name: string;
        slug: string;
        status: string;
      } | null;
      branch?: { id: string; name: string } | null;
    },
  ) {
    return {
      id: user.id,
      tenant_id: user.tenantId,
      branch_id: user.branchId,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            name: user.tenant.name,
            slug: user.tenant.slug,
            status: user.tenant.status,
          }
        : null,
      branch: user.branch
        ? {
            id: user.branch.id,
            name: user.branch.name,
          }
        : null,
    };
  }
}
