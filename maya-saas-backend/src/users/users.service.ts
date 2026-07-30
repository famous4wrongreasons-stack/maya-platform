import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  MembershipStatus as PrismaMembershipStatus,
  User,
  UserRole as PrismaUserRole,
} from '@prisma/client';

import { UserRole, UserStatus } from '../common/domain.enums';
import {
  buildPhoneLoginEmail,
  normalizeRussianPhone,
} from '../common/phone.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type BranchSummary = { id: string; name: string };

type MembershipProjection = {
  id: string;
  tenantId: string;
  branchId: string | null;
  role: PrismaUserRole;
  status: PrismaMembershipStatus;
  tenant: TenantSummary;
  branch: BranchSummary | null;
};

type UserWithRelations = User & {
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  branch?: { id: string; name: string } | null;
  memberships?: MembershipProjection[];
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

    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        memberships: {
          some: {
            tenantId: scopedTenantId,
            status: 'active',
          },
        },
      },
      include: {
        memberships: {
          where: { tenantId: scopedTenantId, status: 'active' },
          include: { tenant: true, branch: true },
        },
      },
    });

    return user ? this.projectTenantMembership(user, scopedTenantId) : null;
  }

  async findEmailLoginCandidates(email: string) {
    // Deliberately narrow cross-tenant lookup for the shared-app auth entry.
    // Callers must not expose these records until the email code is verified.
    const users = await this.prisma.user.findMany({
      where: {
        email: email.toLowerCase(),
        status: 'active',
        memberships: { some: { status: 'active' } },
      },
      include: {
        memberships: {
          where: { status: 'active' },
          include: { tenant: true, branch: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return users.flatMap((user) =>
      user.memberships.map((membership) =>
        this.projectTenantMembership(user, membership.tenantId),
      ),
    );
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
        phone: normalizedPhone,
        memberships: {
          some: {
            tenantId: scopedTenantId,
            status: 'active',
          },
        },
      },
      include: {
        memberships: {
          where: { tenantId: scopedTenantId, status: 'active' },
          include: { tenant: true, branch: true },
        },
      },
    });

    if (exact) {
      return this.projectTenantMembership(exact, scopedTenantId);
    }

    const legacyUsers = await this.prisma.user.findMany({
      where: {
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
        memberships: {
          where: { tenantId: scopedTenantId, status: 'active' },
          include: { tenant: true, branch: true },
        },
      },
    });

    const legacyUser = legacyUsers.find(
      (user) => this.normalizeStoredPhone(user.phone) === normalizedPhone,
    );

    return legacyUser
      ? this.projectTenantMembership(legacyUser, scopedTenantId)
      : null;
  }

  async ensureEmailIsAvailable(tenantId: string | null, email: string) {
    const scopedTenantId = tenantId
      ? this.tenantContext.assertTenantId(tenantId)
      : null;
    const existing = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        ...(scopedTenantId
          ? { memberships: { some: { tenantId: scopedTenantId } } }
          : { tenantId: null, role: UserRole.PLATFORM_OWNER }),
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
        phone: normalizedPhone,
        ...(scopedTenantId
          ? { memberships: { some: { tenantId: scopedTenantId } } }
          : { tenantId: null, role: UserRole.PLATFORM_OWNER }),
      },
      select: { id: true },
    });

    if (exact) {
      throw new ConflictException('A user with this phone already exists');
    }

    const legacyUsers = await this.prisma.user.findMany({
      where: {
        phone: {
          not: null,
        },
        ...(scopedTenantId
          ? { memberships: { some: { tenantId: scopedTenantId } } }
          : { tenantId: null, role: UserRole.PLATFORM_OWNER }),
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
    role: UserRole;
    status?: UserStatus;
  }) {
    const tenantId = data.tenantId
      ? this.tenantContext.assertTenantId(data.tenantId)
      : null;
    const normalizedPhone = this.normalizeOptionalPhone(data.phone);
    const normalizedName = this.normalizeOptionalName(data.name);
    const status = data.status ?? UserStatus.ACTIVE;

    const user = await this.prisma.user.create({
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
        status,
        memberships: tenantId
          ? {
              create: {
                tenantId,
                branchId: data.branchId ?? null,
                role: data.role,
                status,
                joinedAt: status === UserStatus.ACTIVE ? new Date() : undefined,
                invitedAt:
                  status === UserStatus.INVITED ? new Date() : undefined,
              },
            }
          : undefined,
      },
      include: {
        tenant: true,
        branch: true,
        memberships: {
          include: { tenant: true, branch: true },
        },
      },
    });

    return tenantId ? this.projectTenantMembership(user, tenantId) : user;
  }

  async createStaffUserForInternalProvider(data: {
    tenantId: string;
    providerId: string;
    email: string;
    phone?: string | null;
    name?: string | null;
    passwordHash: string;
  }) {
    const tenantId = this.tenantContext.assertTenantId(data.tenantId);
    const normalizedPhone = this.normalizeOptionalPhone(data.phone);
    const normalizedName = this.normalizeOptionalName(data.name);

    return this.prisma.$transaction(async (tx) => {
      const provider = await tx.internalProvider.findFirst({
        where: { id: data.providerId, tenantId },
        select: {
          id: true,
          branchId: true,
          displayName: true,
          userId: true,
          active: true,
        },
      });

      if (!provider) {
        throw new NotFoundException({
          message: 'Internal provider not found.',
          error: { code: 'provider_not_found' },
        });
      }
      if (!provider.active) {
        throw new ConflictException({
          message: 'Inactive provider cannot receive an account.',
          error: { code: 'provider_inactive' },
        });
      }
      if (provider.userId) {
        throw new ConflictException({
          message: 'This provider already has a user account.',
          error: { code: 'provider_account_already_linked' },
        });
      }

      const effectiveName =
        normalizedName ?? this.normalizeOptionalName(provider.displayName);
      const user = await tx.user.create({
        data: {
          tenantId,
          branchId: provider.branchId,
          email: data.email.toLowerCase(),
          phone: normalizedPhone,
          encryptedName: effectiveName
            ? this.encryptionService.encrypt(effectiveName)
            : null,
          passwordHash: data.passwordHash,
          role: UserRole.STAFF,
          status: UserStatus.ACTIVE,
          memberships: {
            create: {
              tenantId,
              branchId: provider.branchId,
              role: UserRole.STAFF,
              status: UserStatus.ACTIVE,
              joinedAt: new Date(),
            },
          },
        },
        include: {
          tenant: true,
          branch: true,
          memberships: {
            include: { tenant: true, branch: true },
          },
        },
      });

      const linked = await tx.internalProvider.updateMany({
        where: {
          id: provider.id,
          tenantId,
          userId: null,
          active: true,
        },
        data: { userId: user.id },
      });
      if (linked.count !== 1) {
        throw new ConflictException({
          message: 'Provider account linking changed during the request.',
          error: { code: 'provider_account_link_conflict' },
        });
      }

      return this.projectTenantMembership(user, tenantId);
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

    const user = await this.prisma.user.create({
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
            branchId: data.branchId ?? null,
            role: UserRole.CLIENT,
            status: 'active',
            joinedAt: new Date(),
          },
        },
      },
      include: {
        memberships: {
          where: { tenantId },
          include: { tenant: true, branch: true },
        },
      },
    });

    return this.projectTenantMembership(user, tenantId);
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
        await this.ensurePhoneIsAvailable(scopedTenantId, normalizedPhone);
      }

      data.phone = normalizedPhone;
    }

    if (scopedTenantId) {
      const update = await this.prisma.user.updateMany({
        where: {
          id: userId,
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
        memberships: {
          some: {
            tenantId,
            status: 'active',
          },
        },
      },
      include: {
        memberships: {
          where: { tenantId, status: 'active' },
          include: { tenant: true, branch: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.projectTenantMembership(user, tenantId);
  }

  getUserName(user: { encryptedName: string | null }): string | null {
    if (!user.encryptedName) {
      return null;
    }

    return this.encryptionService.decrypt(user.encryptedName);
  }

  serializeUser(user: UserWithRelations) {
    if (user.memberships?.length === 1) {
      user = this.projectTenantMembership(user, user.memberships[0].tenantId);
    }

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

  private projectTenantMembership(
    user: UserWithRelations,
    tenantId: string,
  ): UserWithRelations {
    const membership = user.memberships?.find(
      (candidate) => candidate.tenantId === tenantId,
    );

    if (!membership) {
      throw new NotFoundException('Active tenant membership not found');
    }

    return {
      ...user,
      tenantId: membership.tenantId,
      branchId: membership.branchId,
      role: membership.role,
      status: user.status === 'active' ? membership.status : user.status,
      tenant: membership.tenant,
      branch: membership.branch,
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
