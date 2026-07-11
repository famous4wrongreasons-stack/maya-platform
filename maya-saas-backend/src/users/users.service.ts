import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@prisma/client';

import { UserRole } from '../common/domain.enums';
import {
  buildPhoneLoginEmail,
  normalizeRussianPhone,
} from '../common/phone.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';

type UserWithRelations = User & {
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  branch?: { id: string; name: string } | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findTenantUserByEmail(tenantId: string, email: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);

    return this.prisma.user.findFirst({
      where: {
        tenantId: scopedTenantId,
        email: email.toLowerCase(),
        memberships: {
          some: {
            tenantId: scopedTenantId,
            status: 'active',
          },
        },
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

  async findTenantUserByPhone(tenantId: string, phone: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const normalizedPhone = normalizeRussianPhone(phone);
    const exact = await this.prisma.user.findFirst({
      where: {
        tenantId: scopedTenantId,
        phone: normalizedPhone,
        memberships: {
          some: {
            tenantId: scopedTenantId,
            status: 'active',
          },
        },
      },
      include: {
        tenant: true,
        branch: true,
      },
    });

    if (exact) {
      return exact;
    }

    const legacyUsers = await this.prisma.user.findMany({
      where: {
        tenantId: scopedTenantId,
        phone: {
          not: null,
        },
        memberships: {
          some: {
            tenantId: scopedTenantId,
            status: 'active',
          },
        },
      },
      include: {
        tenant: true,
        branch: true,
      },
    });

    return (
      legacyUsers.find(
        (user) => this.normalizeStoredPhone(user.phone) === normalizedPhone,
      ) ?? null
    );
  }

  async ensureEmailIsAvailable(tenantId: string | null, email: string) {
    const scopedTenantId = tenantId
      ? this.tenantContext.assertTenantId(tenantId)
      : null;
    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId: scopedTenantId,
        email: email.toLowerCase(),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
  }

  async ensurePhoneIsAvailable(tenantId: string | null, phone: string) {
    const scopedTenantId = tenantId
      ? this.tenantContext.assertTenantId(tenantId)
      : null;
    const normalizedPhone = normalizeRussianPhone(phone);
    const exact = await this.prisma.user.findFirst({
      where: {
        tenantId: scopedTenantId,
        phone: normalizedPhone,
      },
      select: { id: true },
    });

    if (exact) {
      throw new ConflictException('A user with this phone already exists');
    }

    const legacyUsers = await this.prisma.user.findMany({
      where: {
        tenantId: scopedTenantId,
        phone: {
          not: null,
        },
      },
      select: {
        id: true,
        phone: true,
      },
    });

    if (
      legacyUsers.some(
        (user) => this.normalizeStoredPhone(user.phone) === normalizedPhone,
      )
    ) {
      throw new ConflictException('A user with this phone already exists');
    }
  }

  async createUser(data: {
    tenantId: string | null;
    branchId?: string | null;
    email: string;
    phone?: string | null;
    name?: string | null;
    passwordHash: string;
    role: string;
    status?: string;
  }) {
    const tenantId = data.tenantId
      ? this.tenantContext.assertTenantId(data.tenantId)
      : null;
    const normalizedPhone = this.normalizeOptionalPhone(data.phone);
    const normalizedName = this.normalizeOptionalName(data.name);

    return this.prisma.user.create({
      data: {
        tenantId,
        branchId: data.branchId ?? null,
        email: data.email.toLowerCase(),
        phone: normalizedPhone,
        encryptedName: normalizedName
          ? this.encryptionService.encrypt(normalizedName)
          : null,
        passwordHash: data.passwordHash,
        role: data.role,
        status: data.status ?? 'active',
        memberships: tenantId
          ? {
              create: {
                tenantId,
                role: data.role,
                status: data.status ?? 'active',
                joinedAt:
                  (data.status ?? 'active') === 'active'
                    ? new Date()
                    : undefined,
                invitedAt: data.status === 'invited' ? new Date() : undefined,
              },
            }
          : undefined,
      },
      include: {
        tenant: true,
        branch: true,
      },
    });
  }

  async createPhoneFirstClientUser(data: {
    tenantId: string;
    tenantSlug: string;
    branchId?: string | null;
    phone: string;
    name?: string | null;
    passwordHash: string;
  }) {
    const tenantId = this.tenantContext.assertTenantId(data.tenantId);
    const normalizedPhone = normalizeRussianPhone(data.phone);
    const normalizedName = this.normalizeOptionalName(data.name);

    return this.prisma.user.create({
      data: {
        tenantId,
        branchId: data.branchId ?? null,
        email: buildPhoneLoginEmail(data.tenantSlug, normalizedPhone),
        phone: normalizedPhone,
        encryptedName: normalizedName
          ? this.encryptionService.encrypt(normalizedName)
          : null,
        passwordHash: data.passwordHash,
        role: UserRole.CLIENT,
        status: 'active',
        memberships: {
          create: {
            tenantId,
            role: UserRole.CLIENT,
            status: 'active',
            joinedAt: new Date(),
          },
        },
      },
      include: {
        tenant: true,
        branch: true,
      },
    });
  }

  async updateCurrentUserProfile(
    userId: string,
    dto: UpdateCurrentUserDto,
    expectedTenantId?: string | null,
  ) {
    if (dto.name === undefined && dto.phone === undefined) {
      throw new BadRequestException(
        'At least one supported profile field must be provided',
      );
    }

    const scopedTenantId = expectedTenantId
      ? this.tenantContext.assertTenantId(expectedTenantId)
      : null;
    const currentUser = scopedTenantId
      ? await this.getTenantUserOrThrow(userId, scopedTenantId)
      : await this.getUserOrThrow(userId);
    const data: {
      encryptedName?: string | null;
      phone?: string | null;
    } = {};

    if (dto.name !== undefined) {
      const normalizedName = this.normalizeOptionalName(dto.name);

      if (!normalizedName) {
        throw new BadRequestException('Profile name must not be empty');
      }

      data.encryptedName = this.encryptionService.encrypt(normalizedName);
    }

    if (dto.phone !== undefined) {
      const normalizedPhone = normalizeRussianPhone(dto.phone);

      if (currentUser.phone && currentUser.phone !== normalizedPhone) {
        throw new ConflictException(
          'Phone is already set for this user and cannot be changed here',
        );
      }

      if (!currentUser.phone) {
        await this.ensurePhoneIsAvailable(
          scopedTenantId ?? currentUser.tenantId,
          normalizedPhone,
        );
      }

      data.phone = normalizedPhone;
    }

    if (scopedTenantId) {
      const update = await this.prisma.user.updateMany({
        where: {
          id: userId,
          tenantId: scopedTenantId,
          memberships: {
            some: {
              tenantId: scopedTenantId,
              status: 'active',
            },
          },
        },
        data,
      });

      if (update.count !== 1) {
        throw new NotFoundException('User not found');
      }

      return this.serializeUser(
        await this.getTenantUserOrThrow(userId, scopedTenantId),
      );
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: {
        tenant: true,
        branch: true,
      },
    });

    return this.serializeUser(user);
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

  async getTenantUserOrThrow(userId: string, expectedTenantId: string) {
    const tenantId = this.tenantContext.assertTenantId(expectedTenantId);
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        memberships: {
          some: {
            tenantId,
            status: 'active',
          },
        },
      },
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

  getUserName(user: { encryptedName: string | null }): string | null {
    if (!user.encryptedName) {
      return null;
    }

    return this.encryptionService.decrypt(user.encryptedName);
  }

  serializeUser(user: UserWithRelations) {
    const name = this.getUserName(user);
    const missingProfileFields = [
      ...(name ? [] : ['name']),
      ...(user.phone ? [] : ['phone']),
    ];

    return {
      id: user.id,
      tenant_id: user.tenantId,
      branch_id: user.branchId,
      email: user.email,
      phone: user.phone,
      name,
      role: user.role,
      status: user.status,
      profile_completed: missingProfileFields.length === 0,
      missing_profile_fields: missingProfileFields,
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

  private normalizeOptionalPhone(phone?: string | null): string | null {
    if (!phone || phone.trim().length === 0) {
      return null;
    }

    return normalizeRussianPhone(phone);
  }

  private normalizeOptionalName(name?: string | null): string | null {
    if (!name) {
      return null;
    }

    const trimmed = name.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeStoredPhone(phone: string | null): string | null {
    if (!phone) {
      return null;
    }

    try {
      return normalizeRussianPhone(phone);
    } catch {
      return null;
    }
  }
}
