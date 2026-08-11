import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import type {
  MembershipStatus as PrismaMembershipStatus,
  User,
  UserRole as PrismaUserRole,
} from '@prisma/client';

import { MembershipStatus, UserRole, UserStatus } from '../common/domain.enums';
import {
  buildPhoneLoginEmail,
  normalizePhoneE164,
  normalizeRussianPhone,
  phonesMatch,
} from '../common/phone.util';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { buildAppAccessContext } from './app-access';
import { UpdateCurrentUserDto } from './dto/update-current-user.dto';
import { UpdateCrmTeamAccessDto } from './dto/update-crm-team-access.dto';

/**
 * Статус пользователя → статус его членства в тенанте.
 *
 * До появления UserStatus.MERGED составы двух перечислений совпадали, и
 * UserStatus передавался в membership напрямую — TypeScript пропускал это
 * структурно. Теперь значения разошлись, и перевод обязан быть явным:
 * MERGED — терминальный статус самого аккаунта, а его членство при слиянии
 * гасится как SUSPENDED (удалять членство нельзя — каскады унесут визиты,
 * баллы и согласия).
 */
function membershipStatusFor(status: UserStatus): PrismaMembershipStatus {
  return status === UserStatus.INVITED
    ? MembershipStatus.INVITED
    : status === UserStatus.ACTIVE
      ? MembershipStatus.ACTIVE
      : MembershipStatus.SUSPENDED;
}

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

export type CrmTeamMemberAssignment = {
  externalStaffId: string;
  displayName: string;
  title?: string | null;
  role: UserRole.ADMINISTRATOR | UserRole.STAFF;
  email?: string | null;
  phone?: string | null;
};

const CRM_OWNER_ROLES = [
  UserRole.TENANT_OWNER,
  UserRole.BUSINESS_OWNER,
  UserRole.TENANT_ADMIN,
];

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
    // Лукап личности не имеет права падать 400-й на не-российский номер:
    // подтверждённый провайдером иностранный телефон — это «не нашли», а не
    // «плохой запрос». Строгая валидация остаётся на записи в РФ-салон и SMS.
    const normalizedPhone = normalizePhoneE164(phone);

    if (!normalizedPhone) {
      return null;
    }

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

    const legacyUser = legacyUsers.find((user) =>
      phonesMatch(user.phone, normalizedPhone),
    );

    return legacyUser
      ? this.projectTenantMembership(legacyUser, scopedTenantId)
      : null;
  }

  /**
   * Поиск ЛИЧНОСТИ в тенанте по телефону — в отличие от findTenantUserByPhone
   * НЕ фильтрует по `status: 'active'`.
   *
   * Личность и право входа — разные вещи. Пока лукап требовал активного
   * membership, подавленный сверкой с CRM мастер был невидим, и следующий
   * соц-вход заводил ему второй client-аккаунт вместо понятной ошибки.
   * Сверка идёт по phoneMatchKey, поэтому формат записи в CRM значения не имеет.
   *
   * Возвращает пользователя, его membership в этом тенанте (любого статуса) и
   * признак привязки к карточке сотрудника CRM.
   */
  async findTenantIdentityByPhone(tenantId: string, phone: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const normalizedPhone = normalizePhoneE164(phone);

    if (!normalizedPhone) {
      return null;
    }

    const candidates = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        memberships: { some: { tenantId: scopedTenantId } },
      },
      include: {
        memberships: {
          where: { tenantId: scopedTenantId },
          include: { tenant: true, branch: true },
        },
        crmStaffAccesses: { where: { tenantId: scopedTenantId } },
      },
    });

    const matched = candidates.find((user) =>
      phonesMatch(user.phone, normalizedPhone),
    );

    if (!matched) {
      return null;
    }

    const membership = matched.memberships.find(
      (candidate) => candidate.tenantId === scopedTenantId,
    );

    return {
      user: matched,
      membershipRole: membership?.role ?? null,
      membershipStatus: membership?.status ?? null,
      crmStaffAccess: matched.crmStaffAccesses[0] ?? null,
    };
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
                // Статус членства — своё перечисление. Раньше сюда напрямую
                // передавался UserStatus: составы совпадали, и TypeScript
                // пропускал. С появлением UserStatus.MERGED (терминальный
                // статус погашенного дубля) значения разошлись, и совпадение
                // перестало быть случайно верным — переводим явно.
                status: membershipStatusFor(status),
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

  async provisionCrmTeamAccess(data: {
    tenantId: string;
    tenantSlug: string;
    ownerUserId: string;
    ownerExternalStaffId?: string | null;
    members: CrmTeamMemberAssignment[];
  }) {
    const tenantId = this.tenantContext.assertTenantId(data.tenantId);
    const ownerExternalStaffId = data.ownerExternalStaffId?.trim() || null;
    const seenStaffIds = new Set<string>();
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    const preparedMembers = await Promise.all(
      data.members.map(async (member) => {
        const externalStaffId = member.externalStaffId.trim();
        const displayName = member.displayName.trim();
        const email = member.email?.trim().toLowerCase() || null;
        const phone = this.normalizeOptionalPhone(member.phone);

        if (!externalStaffId || !displayName) {
          throw new BadRequestException({
            message: 'CRM team member identity is incomplete.',
            error: { code: 'crm_team_member_invalid' },
          });
        }
        if (
          member.role !== UserRole.ADMINISTRATOR &&
          member.role !== UserRole.STAFF
        ) {
          throw new BadRequestException({
            message: 'Unsupported onboarding team role.',
            error: { code: 'crm_team_role_invalid' },
          });
        }
        if (
          externalStaffId === ownerExternalStaffId ||
          seenStaffIds.has(externalStaffId)
        ) {
          throw new BadRequestException({
            message: 'Each CRM staff identity can be assigned only once.',
            error: { code: 'crm_team_member_duplicate' },
          });
        }
        seenStaffIds.add(externalStaffId);

        if (email && seenEmails.has(email)) {
          throw new BadRequestException({
            message: 'Each team login email must be unique.',
            error: { code: 'crm_team_email_duplicate' },
          });
        }
        if (phone && seenPhones.has(phone)) {
          throw new BadRequestException({
            message: 'Each team login phone must be unique.',
            error: { code: 'crm_team_phone_duplicate' },
          });
        }
        if (email) seenEmails.add(email);
        if (phone) seenPhones.add(phone);

        const hasLoginChannel = Boolean(email || phone);
        return {
          externalStaffId,
          displayName,
          encryptedDisplayName: this.encryptionService.encrypt(displayName),
          title: member.title?.trim() || null,
          role: member.role,
          email,
          phone,
          loginEmail:
            email ??
            (phone ? buildPhoneLoginEmail(data.tenantSlug, phone) : null),
          passwordHash: hasLoginChannel
            ? await bcrypt.hash(randomBytes(24).toString('base64url'), 10)
            : null,
        };
      }),
    );

    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({
        where: {
          id: data.ownerUserId,
          memberships: { some: { tenantId, status: 'active' } },
        },
        select: { id: true, email: true, phone: true, encryptedName: true },
      });
      if (!owner) {
        throw new NotFoundException({
          message: 'Tenant owner was not found.',
          error: { code: 'crm_team_owner_not_found' },
        });
      }

      const branch = await tx.branch.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const ownerEmail = owner.email.toLowerCase();
      const ownerPhone = this.normalizeStoredPhone(owner.phone);
      if (
        seenEmails.has(ownerEmail) ||
        (ownerPhone && seenPhones.has(ownerPhone))
      ) {
        throw new BadRequestException({
          message:
            'The owner login channel cannot be reused by another member.',
          error: { code: 'crm_team_owner_contact_duplicate' },
        });
      }

      if (ownerExternalStaffId) {
        await tx.crmStaffAccess.create({
          data: {
            tenantId,
            externalStaffId: ownerExternalStaffId,
            userId: owner.id,
            encryptedDisplayName:
              owner.encryptedName ?? this.encryptionService.encrypt('Owner'),
            role: UserRole.TENANT_ADMIN,
            status: 'active',
          },
        });
      }

      const assignments = [];
      for (const member of preparedMembers) {
        let userId: string | null = null;
        let status: 'pending_contact' | 'active' = 'pending_contact';

        if (member.loginEmail && member.passwordHash) {
          const contactConflict = await tx.user.findFirst({
            where: {
              memberships: { some: { tenantId } },
              OR: [
                { email: member.loginEmail },
                ...(member.phone ? [{ phone: member.phone }] : []),
              ],
            },
            select: { id: true },
          });
          if (contactConflict) {
            throw new ConflictException({
              message: 'A team login channel is already used in this business.',
              error: { code: 'crm_team_contact_already_used' },
            });
          }

          const user = await tx.user.create({
            data: {
              tenantId,
              branchId: branch?.id ?? null,
              email: member.loginEmail,
              phone: member.phone,
              encryptedName: member.encryptedDisplayName,
              passwordHash: member.passwordHash,
              role: member.role,
              status: UserStatus.ACTIVE,
              memberships: {
                create: {
                  tenantId,
                  branchId: branch?.id ?? null,
                  role: member.role,
                  status: 'active',
                  joinedAt: new Date(),
                },
              },
            },
            select: { id: true },
          });
          userId = user.id;
          status = 'active';
        }

        await tx.crmStaffAccess.create({
          data: {
            tenantId,
            externalStaffId: member.externalStaffId,
            userId,
            encryptedDisplayName: member.encryptedDisplayName,
            title: member.title,
            role: member.role,
            status,
          },
        });
        assignments.push({
          external_staff_id: member.externalStaffId,
          role: member.role,
          access_status: status,
          login_channel: member.email ? 'email' : member.phone ? 'phone' : null,
        });
      }

      return {
        owner_linked_to_crm_staff: Boolean(ownerExternalStaffId),
        assignments,
        active_accounts: assignments.filter(
          (assignment) => assignment.access_status === 'active',
        ).length,
        pending_contacts: assignments.filter(
          (assignment) => assignment.access_status === 'pending_contact',
        ).length,
      };
    });
  }

  async listCrmTeamAccess(tenantId: string, currentUserId: string) {
    const scopedTenantId = this.tenantContext.assertTenantId(tenantId);
    const accesses = await this.prisma.crmStaffAccess.findMany({
      where: { tenantId: scopedTenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    const items = accesses
      .map((access) => {
        const email = this.publicLoginEmail(access.user?.email ?? null);
        const phone = access.user?.phone ?? null;
        const isOwner =
          access.userId === currentUserId ||
          this.isOwnerAccessRole(access.role);

        return {
          external_staff_id: access.externalStaffId,
          display_name: this.encryptionService.decrypt(
            access.encryptedDisplayName,
          ),
          title: access.title,
          role: access.role,
          access_status: access.status,
          email,
          phone,
          login_channels: [
            ...(email ? ['email'] : []),
            ...(phone ? ['phone'] : []),
          ],
          can_login: access.status === 'active' && Boolean(email || phone),
          is_owner: isOwner,
        };
      })
      .sort((left, right) => {
        if (left.is_owner !== right.is_owner) return left.is_owner ? -1 : 1;
        if (left.role !== right.role) {
          return String(left.role) === 'administrator' ? -1 : 1;
        }
        return left.display_name.localeCompare(right.display_name, 'ru');
      });

    return {
      items,
      total: items.length,
      active_accounts: items.filter((item) => item.can_login).length,
      pending_contacts: items.filter(
        (item) => item.access_status === 'pending_contact',
      ).length,
      disabled_accounts: items.filter(
        (item) => item.access_status === 'disabled',
      ).length,
    };
  }

  async updateCrmTeamAccess(data: {
    tenantId: string;
    actorUserId: string;
    externalStaffId: string;
    update: UpdateCrmTeamAccessDto;
  }) {
    const tenantId = this.tenantContext.assertTenantId(data.tenantId);
    const externalStaffId = data.externalStaffId.trim();
    const email = data.update.email?.trim().toLowerCase() || null;
    const phone = this.normalizeOptionalPhone(data.update.phone);
    const requestedRole = data.update.role;

    if (!externalStaffId) {
      throw new BadRequestException({
        message: 'CRM staff identity is required.',
        error: { code: 'crm_team_member_invalid' },
      });
    }
    if (!requestedRole && !email && !phone) {
      throw new BadRequestException({
        message: 'Provide a role, email or phone to update team access.',
        error: { code: 'crm_team_access_update_empty' },
      });
    }

    const fallbackPasswordHash =
      email || phone
        ? await bcrypt.hash(randomBytes(24).toString('base64url'), 10)
        : null;

    await this.prisma.$transaction(async (tx) => {
      const access = await tx.crmStaffAccess.findFirst({
        where: { tenantId, externalStaffId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              role: true,
            },
          },
        },
      });
      if (!access) {
        throw new NotFoundException({
          message: 'CRM team member access was not found.',
          error: { code: 'crm_team_access_not_found' },
        });
      }
      if (
        access.userId === data.actorUserId ||
        this.isOwnerAccessRole(access.role)
      ) {
        throw new ForbiddenException({
          message: 'Owner access is managed from the owner profile.',
          error: { code: 'crm_team_owner_access_read_only' },
        });
      }
      if (access.status === 'disabled') {
        throw new ConflictException({
          message: 'This employee is no longer active in CRM.',
          error: { code: 'crm_staff_access_disabled' },
        });
      }

      const role = requestedRole ?? access.role;
      if (role !== UserRole.ADMINISTRATOR && role !== UserRole.STAFF) {
        throw new BadRequestException({
          message: 'Unsupported team access role.',
          error: { code: 'crm_team_role_invalid' },
        });
      }

      const contactClauses = [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ];

      let userId = access.userId;
      let priorRole = access.user?.role ?? null;
      let contactChanged = false;

      if (userId && access.user) {
        contactChanged = Boolean(
          (email && email !== access.user.email) ||
          (phone && phone !== access.user.phone),
        );
        if (contactClauses.length) {
          const conflict = await tx.user.findFirst({
            where: {
              id: { not: userId },
              memberships: { some: { tenantId } },
              OR: contactClauses,
            },
            select: { id: true },
          });
          if (conflict) this.throwCrmTeamContactConflict();
        }

        await tx.user.update({
          where: { id: userId },
          data: {
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            role,
            status: UserStatus.ACTIVE,
          },
        });
        await tx.membership.updateMany({
          where: { tenantId, userId },
          data: { role, status: 'active' },
        });
      } else if (contactClauses.length) {
        const matches = await tx.user.findMany({
          where: {
            memberships: { some: { tenantId } },
            OR: contactClauses,
          },
          select: {
            id: true,
            email: true,
            phone: true,
            role: true,
          },
          take: 2,
        });
        if (matches.length > 1) this.throwCrmTeamContactConflict();

        const existingUser = matches[0] ?? null;
        if (existingUser) {
          const existingAccess = await tx.crmStaffAccess.findFirst({
            where: {
              tenantId,
              userId: existingUser.id,
              id: { not: access.id },
            },
            select: { id: true },
          });
          if (existingAccess) this.throwCrmTeamContactConflict();

          userId = existingUser.id;
          priorRole = existingUser.role;
          contactChanged = Boolean(
            (email && email !== existingUser.email) ||
            (phone && phone !== existingUser.phone),
          );
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              ...(email ? { email } : {}),
              ...(phone ? { phone } : {}),
              role,
              status: UserStatus.ACTIVE,
            },
          });
          await tx.membership.updateMany({
            where: { tenantId, userId: existingUser.id },
            data: { role, status: 'active' },
          });
        } else {
          const [tenant, branch] = await Promise.all([
            tx.tenant.findUnique({
              where: { id: tenantId },
              select: { slug: true },
            }),
            tx.branch.findFirst({
              where: { tenantId },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            }),
          ]);
          if (!tenant || !fallbackPasswordHash) {
            throw new NotFoundException({
              message: 'Tenant was not found.',
              error: { code: 'tenant_not_found' },
            });
          }

          const user = await tx.user.create({
            data: {
              tenantId,
              branchId: branch?.id ?? null,
              email: email ?? buildPhoneLoginEmail(tenant.slug, phone!),
              phone,
              encryptedName: access.encryptedDisplayName,
              passwordHash: fallbackPasswordHash,
              role,
              status: UserStatus.ACTIVE,
              memberships: {
                create: {
                  tenantId,
                  branchId: branch?.id ?? null,
                  role,
                  status: 'active',
                  joinedAt: new Date(),
                },
              },
            },
            select: { id: true },
          });
          userId = user.id;
        }
      }

      await tx.crmStaffAccess.update({
        where: { id: access.id },
        data: {
          role,
          userId,
          status: userId ? 'active' : 'pending_contact',
        },
      });

      if (userId && contactChanged) {
        await tx.authIdentity.deleteMany({
          where: { tenantId, userId },
        });
      }
      if (userId && (contactChanged || (priorRole && priorRole !== role))) {
        await tx.authSession.updateMany({
          where: { tenantId, userId, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revokeReason: contactChanged
              ? 'crm_staff_login_changed'
              : 'crm_staff_role_changed',
          },
        });
      }
    });

    const snapshot = await this.listCrmTeamAccess(tenantId, data.actorUserId);
    return snapshot.items.find(
      (item) => item.external_staff_id === externalStaffId,
    );
  }

  async claimCrmTeamOwner(data: {
    tenantId: string;
    actorUserId: string;
    externalStaffId: string;
  }) {
    const tenantId = this.tenantContext.assertTenantId(data.tenantId);
    const externalStaffId = data.externalStaffId.trim();

    if (!externalStaffId) {
      throw new BadRequestException({
        message: 'CRM staff identity is required.',
        error: { code: 'crm_team_member_invalid' },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const ownerMembership = await tx.membership.findFirst({
        where: {
          tenantId,
          userId: data.actorUserId,
          status: 'active',
          role: { in: CRM_OWNER_ROLES },
        },
        select: { role: true },
      });
      if (!ownerMembership) {
        throw new ForbiddenException({
          message: 'Only the tenant owner can claim the CRM owner identity.',
          error: { code: 'crm_team_owner_claim_forbidden' },
        });
      }

      const access = await tx.crmStaffAccess.findFirst({
        where: { tenantId, externalStaffId },
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
        },
      });
      if (!access) {
        throw new NotFoundException({
          message: 'CRM team member access was not found.',
          error: { code: 'crm_team_access_not_found' },
        });
      }
      if (access.status === 'disabled') {
        throw new ConflictException({
          message: 'This employee is no longer active in CRM.',
          error: { code: 'crm_staff_access_disabled' },
        });
      }
      if (access.userId && access.userId !== data.actorUserId) {
        throw new ConflictException({
          message: 'This CRM employee is already linked to another account.',
          error: { code: 'crm_team_owner_claim_assigned' },
        });
      }

      const existingOwnerLink = await tx.crmStaffAccess.findFirst({
        where: {
          tenantId,
          id: { not: access.id },
          OR: [{ userId: data.actorUserId }, { role: { in: CRM_OWNER_ROLES } }],
        },
        select: { id: true },
      });
      if (existingOwnerLink) {
        throw new ConflictException({
          message: 'The tenant owner is already linked to a CRM employee.',
          error: { code: 'crm_team_owner_already_linked' },
        });
      }

      await tx.crmStaffAccess.update({
        where: { id: access.id },
        data: {
          userId: data.actorUserId,
          role: ownerMembership.role,
          status: 'active',
        },
      });
    });

    const snapshot = await this.listCrmTeamAccess(tenantId, data.actorUserId);
    return snapshot.items.find(
      (item) => item.external_staff_id === externalStaffId,
    );
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

      if (currentUser.phone !== normalizedPhone) {
        throw new ForbiddenException({
          message: 'Phone can only be added through a verified login provider.',
          error: { code: 'phone_verification_required' },
        });
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

  async attachVerifiedSocialPhone(
    userId: string,
    expectedTenantId: string,
    phone: string,
  ) {
    const tenantId = this.tenantContext.assertTenantId(expectedTenantId);
    const normalizedPhone = normalizeRussianPhone(phone);
    const currentUser = await this.getTenantUserOrThrow(userId, tenantId);

    if (currentUser.phone) {
      if (currentUser.phone !== normalizedPhone) {
        throw new ConflictException({
          message: 'The verified social phone conflicts with this account.',
          error: { code: 'social_identity_conflict' },
        });
      }
      return currentUser;
    }

    const verifiedIdentity = await this.prisma.authIdentity.findFirst({
      where: {
        tenantId,
        userId,
        phone: normalizedPhone,
      },
      select: { id: true },
    });

    if (!verifiedIdentity) {
      throw new ForbiddenException({
        message: 'The social provider did not verify this phone.',
        error: { code: 'phone_verification_required' },
      });
    }

    await this.ensurePhoneIsAvailable(tenantId, normalizedPhone);
    const update = await this.prisma.user.updateMany({
      where: {
        id: userId,
        phone: null,
        memberships: {
          some: {
            tenantId,
            status: 'active',
          },
        },
      },
      data: { phone: normalizedPhone },
    });

    if (update.count !== 1) {
      throw new ConflictException({
        message: 'The verified phone could not be attached to this account.',
        error: { code: 'social_identity_conflict' },
      });
    }

    return this.getTenantUserOrThrow(userId, tenantId);
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

  /**
   * Основатель платформы MAYA.
   *
   * 🔴 Это НЕ «владелец с полным доступом». Владелец салона распоряжается своим
   * бизнесом целиком, но GOD-режим и затраты на ИИ — это метрики и деньги ВСЕЙ
   * платформы, то есть данные всех тенантов сразу. Признак задаётся списком
   * MAYA_FOUNDER_IDS / MAYA_FOUNDER_EMAILS в окружении и никак не выводится из
   * роли внутри тенанта.
   */
  private isPlatformFounder(serialized: {
    id: string;
    email: string | null;
    role: string;
  }): boolean {
    if (serialized.role === 'platform_owner') {
      return true;
    }

    const parse = (raw?: string) =>
      String(raw || '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
    const ids = parse(process.env.MAYA_FOUNDER_IDS);
    const emails = parse(process.env.MAYA_FOUNDER_EMAILS);
    const email = String(serialized.email || '').toLowerCase();

    return (
      ids.includes(String(serialized.id).toLowerCase()) ||
      (email.length > 0 && emails.includes(email))
    );
  }

  async serializeCurrentUser(user: UserWithRelations) {
    const serialized = {
      ...this.serializeUser(user),
      is_platform_owner: false,
    };
    serialized.is_platform_owner = this.isPlatformFounder(serialized);
    const tenantId = serialized.tenant_id;

    if (!tenantId) {
      return {
        ...serialized,
        staff_profile: { linked: false, source: null, title: null },
        app_access: buildAppAccessContext({
          tenantId: null,
          role: serialized.role as UserRole,
          staffProfileLinked: false,
          customerProfileLinked: false,
          clientLookupPhoneLinked: false,
        }),
      };
    }

    const [crmStaffProfile, customerProfile] = await Promise.all([
      this.prisma.crmStaffAccess.findFirst({
        where: {
          tenantId,
          userId: serialized.id,
          status: 'active',
        },
        select: { title: true, externalStaffId: true },
      }),
      this.prisma.customerProfile.findFirst({
        where: {
          tenantId,
          userId: serialized.id,
        },
        select: { id: true },
      }),
    ]);

    if (crmStaffProfile) {
      const staffProfile = {
        linked: true,
        source: 'crm' as const,
        title: crmStaffProfile.title,
        // Свой идентификатор в CRM: по нему кабинет отбирает из журнала дня
        // ИМЕННО свои визиты. Это собственный id пользователя, не чужие ПД.
        external_staff_id: crmStaffProfile.externalStaffId,
      };

      return {
        ...serialized,
        staff_profile: staffProfile,
        app_access: buildAppAccessContext({
          tenantId,
          role: serialized.role as UserRole,
          staffProfileLinked: true,
          customerProfileLinked: Boolean(customerProfile),
          clientLookupPhoneLinked: Boolean(serialized.phone),
        }),
      };
    }

    const internalStaffProfile = await this.prisma.internalProvider.findFirst({
      where: {
        tenantId,
        userId: serialized.id,
        active: true,
      },
      select: { title: true },
    });

    const staffProfile = internalStaffProfile
      ? {
          linked: true,
          source: 'internal' as const,
          title: internalStaffProfile.title,
        }
      : { linked: false, source: null, title: null };

    return {
      ...serialized,
      staff_profile: staffProfile,
      app_access: buildAppAccessContext({
        tenantId,
        role: serialized.role as UserRole,
        staffProfileLinked: staffProfile.linked,
        customerProfileLinked: Boolean(customerProfile),
        clientLookupPhoneLinked: Boolean(serialized.phone),
      }),
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

  // Раньше здесь стоял строгий российский нормализатор в try/catch: сохранённый
  // не-российский номер превращался в null и не совпадал ни с чем.
  private normalizeStoredPhone(phone: string | null): string | null {
    return normalizePhoneE164(phone);
  }

  private publicLoginEmail(email: string | null): string | null {
    if (!email || /^phone-\d+@.+\.client\.local$/i.test(email)) return null;
    return email;
  }

  private isOwnerAccessRole(role: string): boolean {
    return CRM_OWNER_ROLES.includes(role as UserRole);
  }

  private throwCrmTeamContactConflict(): never {
    throw new ConflictException({
      message: 'This email or phone is already used in this business.',
      error: { code: 'crm_team_contact_already_used' },
    });
  }
}
