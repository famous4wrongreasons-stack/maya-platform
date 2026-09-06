import { ClientProfileReadService } from '../crm/client-profile-read.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { UserRole } from '../common/domain.enums';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { Package5Wave2CanonicalCutoverService } from '../package5-wave2/package5-wave2-canonical-cutover.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsersService } from './users.service';

type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

type BranchRecord = {
  id: string;
  name: string;
};

type MembershipRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  role: string;
  status: string;
  tenant: TenantRecord;
  branch: BranchRecord | null;
};

type UserRecord = {
  id: string;
  tenantId: string | null;
  branchId: string | null;
  email: string;
  phone: string | null;
  encryptedName: string | null;
  passwordHash: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  tenant: TenantRecord | null;
  branch: BranchRecord | null;
  memberships?: MembershipRecord[];
};

describe('UsersService', () => {
  const baseUser = (): UserRecord => ({
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    email: 'client@example.com',
    phone: '+79990000000',
    encryptedName: 'enc:Станислав',
    passwordHash: 'hash',
    role: 'client',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    tenant: null,
    branch: null,
  });

  const tenantUser = (overrides: Partial<UserRecord> = {}): UserRecord => ({
    ...baseUser(),
    ...overrides,
    memberships: [
      {
        id: 'membership-1',
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        role: 'client',
        status: 'active',
        tenant: {
          id: 'tenant-1',
          name: 'Tenant One',
          slug: 'tenant-one',
          status: 'active',
        },
        branch: { id: 'branch-1', name: 'Main branch' },
      },
    ],
  });

  const createService = () => {
    const userFindFirstMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord | null>
    > = jest.fn().mockResolvedValue(null);
    const userFindUniqueMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord | null>
    > = jest.fn().mockResolvedValue(baseUser());
    const userFindManyMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord[]>
    > = jest.fn().mockResolvedValue([]);
    const userUpdateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord>
    > = jest.fn().mockResolvedValue(baseUser());
    const userUpdateManyMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<{ count: number }>
    > = jest.fn().mockResolvedValue({ count: 1 });
    const authIdentityFindFirstMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<{
        id?: string;
        provider?: string;
        profileJson?: Record<string, unknown> | null;
      } | null>
    > = jest.fn().mockResolvedValue(null);
    const crmStaffAccessFindFirstMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<{
        title: string | null;
        externalStaffId: string;
      } | null>
    > = jest.fn().mockResolvedValue(null);
    const customerProfileFindFirstMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<{ id: string } | null>
    > = jest.fn().mockResolvedValue(null);
    const internalProviderFindFirstMock: jest.MockedFunction<
      (
        args: Record<string, unknown>,
      ) => Promise<{ title: string | null } | null>
    > = jest.fn().mockResolvedValue(null);
    const encryptMock: jest.MockedFunction<(value: string) => string> = jest
      .fn()
      .mockImplementation((value: string) => `enc:${value}`);
    const decryptMock: jest.MockedFunction<(value: string) => string> = jest
      .fn()
      .mockImplementation((value: string) => value.replace(/^enc:/, ''));

    const prisma: Pick<
      PrismaService,
      | 'authIdentity'
      | 'crmStaffAccess'
      | 'customerProfile'
      | 'internalProvider'
      | 'user'
    > = {
      authIdentity: {
        findFirst: authIdentityFindFirstMock,
      } as PrismaService['authIdentity'],
      crmIntegration: {
        findUnique: jest.fn(() => Promise.resolve({ provider: 'yclients' })),
      },
      staffProviderLink: {
        findFirst: jest.fn(() =>
          Promise.resolve({ staffId: 'staff-existing' }),
        ),
        create: jest.fn(() => Promise.resolve({ id: 'link-1' })),
      },
      staff: {
        create: jest.fn(() => Promise.resolve({ id: 'staff-new' })),
      },
      crmStaffAccess: {
        findFirst: crmStaffAccessFindFirstMock,
      } as PrismaService['crmStaffAccess'],
      customerProfile: {
        findFirst: customerProfileFindFirstMock,
      } as PrismaService['customerProfile'],
      internalProvider: {
        findFirst: internalProviderFindFirstMock,
      } as PrismaService['internalProvider'],
      user: {
        findFirst: userFindFirstMock,
        findUnique: userFindUniqueMock,
        findMany: userFindManyMock,
        update: userUpdateMock,
        updateMany: userUpdateManyMock,
      } as PrismaService['user'],
    };
    const encryptionService: Pick<EncryptionService, 'encrypt' | 'decrypt'> = {
      encrypt: encryptMock,
      decrypt: decryptMock,
    };
    const tenantContext = new TenantContextService();
    const verifiedProfileReadMock = jest
      .fn()
      .mockResolvedValue({
        clientId: 'client-1',
        profile: { profile_id: null },
      });

    return {
      service: new UsersService(
        prisma as PrismaService,
        encryptionService as EncryptionService,
        tenantContext,
        undefined as never,
        {
          forAccount: verifiedProfileReadMock,
        } as unknown as ClientProfileReadService,
      ),
      tenantContext,
      mocks: {
        verifiedProfileReadMock,
        decryptMock,
        encryptMock,
        authIdentityFindFirstMock,
        crmStaffAccessFindFirstMock,
        customerProfileFindFirstMock,
        internalProviderFindFirstMock,
        userFindFirstMock,
        userFindUniqueMock,
        userFindManyMock,
        userUpdateMock,
        userUpdateManyMock,
      },
    };
  };

  it('serializes a decrypted profile name and completion flags', () => {
    const {
      service,
      mocks: { decryptMock },
    } = createService();

    const result = service.serializeUser(baseUser());

    expect(decryptMock).toHaveBeenCalledWith('enc:Станислав');
    expect(result.name).toBe('Станислав');
    expect(result.profile_completed).toBe(true);
    expect(result.missing_profile_fields).toEqual([]);
  });

  it('marks an owner linked to CRM staff as a hybrid staff profile', async () => {
    const {
      service,
      mocks: { crmStaffAccessFindFirstMock, internalProviderFindFirstMock },
    } = createService();

    crmStaffAccessFindFirstMock.mockResolvedValue({
      title: 'Барбер',
      externalStaffId: 'staff-1',
    });
    const owner = tenantUser({ role: UserRole.TENANT_OWNER });
    owner.memberships![0].role = UserRole.TENANT_OWNER;

    const result = await service.serializeCurrentUser(owner);

    expect(result.role).toBe(UserRole.TENANT_OWNER);
    expect(result.staff_profile).toEqual({
      linked: true,
      source: 'crm',
      title: 'Барбер',
      external_staff_id: 'staff-1',
    });
    expect(result.app_access).toEqual({
      schema_version: 1,
      default_mode: 'owner',
      available_modes: [
        {
          mode: 'owner',
          access: 'granted',
          tenant_id: 'tenant-1',
          role: UserRole.TENANT_OWNER,
          profile_linked: true,
        },
        {
          mode: 'staff',
          access: 'granted',
          tenant_id: 'tenant-1',
          role: UserRole.TENANT_OWNER,
          profile_linked: true,
        },
        {
          mode: 'client',
          access: 'preview',
          tenant_id: 'tenant-1',
          role: UserRole.TENANT_OWNER,
          profile_linked: false,
        },
      ],
      can_switch_mode: true,
      chooser_required: true,
    });
    expect(internalProviderFindFirstMock).not.toHaveBeenCalled();
  });

  it('does not invent a staff profile for an unlinked owner', async () => {
    const { service } = createService();
    const owner = tenantUser({ role: UserRole.TENANT_OWNER });
    owner.memberships![0].role = UserRole.TENANT_OWNER;

    const result = await service.serializeCurrentUser(owner);

    expect(result.role).toBe(UserRole.TENANT_OWNER);
    expect(result.staff_profile).toEqual({
      linked: false,
      source: null,
      title: null,
      staff_id: null,
    });
    expect(result.app_access.default_mode).toBe('owner');
    expect(result.app_access.available_modes).toEqual([
      expect.objectContaining({ mode: 'owner', access: 'granted' }),
      expect.objectContaining({ mode: 'client', access: 'preview' }),
    ]);
  });

  it('grants a linked client one client mode without a chooser', async () => {
    const {
      service,
      mocks: { verifiedProfileReadMock },
    } = createService();
    verifiedProfileReadMock.mockResolvedValue({
      clientId: 'client-1',
      profile: { profile_id: 'customer-1' },
    });

    const result = await service.serializeCurrentUser(tenantUser());

    expect(result.app_access).toEqual({
      schema_version: 1,
      default_mode: 'client',
      available_modes: [
        {
          mode: 'client',
          access: 'granted',
          tenant_id: 'tenant-1',
          role: UserRole.CLIENT,
          profile_linked: true,
        },
      ],
      can_switch_mode: false,
      chooser_required: false,
    });
  });

  it('returns a tenant-scoped Telegram avatar from the verified identity', async () => {
    const {
      service,
      mocks: { authIdentityFindFirstMock },
    } = createService();
    authIdentityFindFirstMock.mockResolvedValue({
      provider: 'telegram',
      profileJson: {
        photo_url: 'https://cdn.example.test/telegram/user-1.jpg',
      },
    });

    const result = await service.serializeCurrentUser(tenantUser());

    expect(result.auth_provider).toBe('telegram');
    expect(result.avatar_url).toBe(
      'https://cdn.example.test/telegram/user-1.jpg',
    );
    expect(authIdentityFindFirstMock).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        provider: 'telegram',
      },
      select: { provider: true, profileJson: true },
    });
  });

  it('does not expose an insecure social avatar URL', async () => {
    const {
      service,
      mocks: { authIdentityFindFirstMock },
    } = createService();
    authIdentityFindFirstMock.mockResolvedValue({
      provider: 'telegram',
      profileJson: { photo_url: 'http://example.test/avatar.jpg' },
    });

    const result = await service.serializeCurrentUser(tenantUser());

    expect(result.auth_provider).toBe('telegram');
    expect(result.avatar_url).toBeNull();
  });

  it('keeps tenant and user fences on linked app profiles', async () => {
    const {
      service,
      mocks: {
        crmStaffAccessFindFirstMock,
        customerProfileFindFirstMock,
        verifiedProfileReadMock,
      },
    } = createService();
    const owner = tenantUser({ role: UserRole.TENANT_OWNER });
    owner.memberships![0].role = UserRole.TENANT_OWNER;

    await service.serializeCurrentUser(owner);

    expect(crmStaffAccessFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 'tenant-1',
          userId: 'user-1',
          status: 'active',
        },
      }),
    );
    expect(customerProfileFindFirstMock).not.toHaveBeenCalled();
    expect(verifiedProfileReadMock).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('returns a platform-only mode outside tenant context', async () => {
    const { service } = createService();
    const platformOwner = baseUser();
    platformOwner.tenantId = null;
    platformOwner.role = UserRole.PLATFORM_OWNER;

    const result = await service.serializeCurrentUser(platformOwner);

    expect(result.app_access).toEqual({
      schema_version: 1,
      default_mode: 'platform',
      available_modes: [
        {
          mode: 'platform',
          access: 'granted',
          tenant_id: null,
          role: UserRole.PLATFORM_OWNER,
          profile_linked: true,
        },
      ],
      can_switch_mode: false,
      chooser_required: false,
    });
    expect(result.is_platform_owner).toBe(false);
  });

  it('grants founder surfaces only through the explicit server allowlist', async () => {
    const previousIds = process.env.MAYA_FOUNDER_IDS;
    const previousEmails = process.env.MAYA_FOUNDER_EMAILS;
    process.env.MAYA_FOUNDER_IDS = 'user-1';
    process.env.MAYA_FOUNDER_EMAILS = '';

    try {
      const { service } = createService();
      const result = await service.serializeCurrentUser(tenantUser());

      expect(result.is_platform_owner).toBe(true);
    } finally {
      if (previousIds === undefined) delete process.env.MAYA_FOUNDER_IDS;
      else process.env.MAYA_FOUNDER_IDS = previousIds;
      if (previousEmails === undefined) delete process.env.MAYA_FOUNDER_EMAILS;
      else process.env.MAYA_FOUNDER_EMAILS = previousEmails;
    }
  });

  it('updates the current user profile with an encrypted name', async () => {
    const {
      service,
      mocks: { encryptMock, userUpdateMock },
    } = createService();

    userUpdateMock.mockResolvedValue({
      ...baseUser(),
      encryptedName: 'enc:Алексей',
    });

    const result = await service.updateCurrentUserProfile('user-1', {
      name: '  Алексей  ',
    });

    expect(encryptMock).toHaveBeenCalledWith('Алексей');
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        encryptedName: 'enc:Алексей',
      },
      include: {
        tenant: true,
        branch: true,
      },
    });
    expect(result.name).toBe('Алексей');
  });

  it('rejects an unverified phone added through the profile endpoint', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock, userUpdateMock },
    } = createService();
    const userWithoutPhone = {
      ...baseUser(),
      phone: null,
    };

    userFindFirstMock.mockResolvedValueOnce(userWithoutPhone);

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.updateCurrentUserProfile('user-1', {
          phone: '8 (999) 111-22-33',
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: { code: 'phone_verification_required' },
      },
    });

    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('attaches a phone verified by a social identity in the same tenant', async () => {
    const {
      service,
      tenantContext,
      mocks: {
        authIdentityFindFirstMock,
        userFindFirstMock,
        userFindManyMock,
        userUpdateManyMock,
      },
    } = createService();
    const userWithoutPhone = tenantUser({ phone: null });
    const userWithPhone = tenantUser({ phone: '+79991112233' });

    userFindFirstMock
      .mockResolvedValueOnce(userWithoutPhone)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(userWithPhone);
    userFindManyMock.mockResolvedValueOnce([]);
    authIdentityFindFirstMock.mockResolvedValueOnce({ id: 'identity-1' });

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.attachVerifiedSocialPhone(
        'user-1',
        'tenant-1',
        '8 (999) 111-22-33',
      ),
    );

    expect(authIdentityFindFirstMock).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        phone: '+79991112233',
      },
      select: { id: true },
    });
    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        phone: null,
        memberships: {
          some: {
            tenantId: 'tenant-1',
            status: 'active',
          },
        },
      },
      data: { phone: '+79991112233' },
    });
    expect(result.phone).toBe('+79991112233');
  });

  it('loads a tenant user through tenant and active membership predicates', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock },
    } = createService();
    userFindFirstMock.mockResolvedValue(tenantUser());

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.getTenantUserOrThrow('user-1', 'tenant-1'),
    );

    expect(result.id).toBe('user-1');
    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      role: 'client',
    });
    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        memberships: {
          some: {
            tenantId: 'tenant-1',
            status: 'active',
          },
        },
      },
      include: {
        memberships: {
          where: { tenantId: 'tenant-1', status: 'active' },
          include: { tenant: true, branch: true },
        },
      },
    });
  });

  it('projects tenant authority from membership instead of stale user fields', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock },
    } = createService();
    userFindFirstMock.mockResolvedValue(
      tenantUser({
        tenantId: 'legacy-tenant',
        branchId: 'legacy-branch',
        role: 'tenant_admin',
      }),
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.getTenantUserOrThrow('user-1', 'tenant-1'),
    );

    expect(result).toMatchObject({
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      role: 'client',
    });
  });

  it('rejects a foreign tenant before reading a user', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock },
    } = createService();

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.getTenantUserOrThrow('known-user-b', 'tenant-b'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userFindFirstMock).not.toHaveBeenCalled();
  });

  it('fails closed before reading a tenant user without context', async () => {
    const {
      service,
      mocks: { userFindFirstMock },
    } = createService();

    await expect(
      service.getTenantUserOrThrow('user-1', 'tenant-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userFindFirstMock).not.toHaveBeenCalled();
  });

  it('updates a tenant profile with tenant and membership predicates', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock, userUpdateManyMock, userUpdateMock },
    } = createService();
    userFindFirstMock
      .mockResolvedValueOnce(tenantUser())
      .mockResolvedValueOnce(tenantUser({ encryptedName: 'enc:Алексей' }));

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.updateCurrentUserProfile(
        'user-1',
        { name: 'Алексей' },
        'tenant-1',
      ),
    );

    expect(userUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        memberships: {
          some: {
            tenantId: 'tenant-1',
            status: 'active',
          },
        },
      },
      data: {
        encryptedName: 'enc:Алексей',
      },
    });
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(result.name).toBe('Алексей');
  });

  it('does not mutate a known user id outside the current tenant', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock, userUpdateManyMock },
    } = createService();
    userFindFirstMock.mockResolvedValue(null);

    await expect(
      tenantContext.runAsSystemTenant('tenant-a', () =>
        service.updateCurrentUserProfile(
          'known-user-b',
          { name: 'Blocked' },
          'tenant-a',
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(userUpdateManyMock).not.toHaveBeenCalled();
  });

  it('finds legacy users by phone after normalizing stored values', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock, userFindManyMock },
    } = createService();

    const legacyUser = tenantUser({ phone: '8 (999) 000-00-00' });

    userFindFirstMock.mockResolvedValue(null);
    userFindManyMock.mockResolvedValue([legacyUser]);

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.findTenantUserByPhone('tenant-1', '+79990000000'),
    );

    expect(result?.id).toBe('user-1');
    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: {
        phone: '+79990000000',
        memberships: {
          some: {
            tenantId: 'tenant-1',
            status: 'active',
          },
        },
      },
      include: {
        memberships: {
          where: { tenantId: 'tenant-1', status: 'active' },
          include: { tenant: true, branch: true },
        },
      },
    });
  });

  it('creates and links a staff account to the exact tenant provider atomically', async () => {
    const providerFindFirstMock = jest.fn().mockResolvedValue({
      id: 'provider-2',
      branchId: 'branch-1',
      displayName: 'Илья',
      userId: null,
      active: true,
    });
    const providerUpdateManyMock = jest.fn().mockResolvedValue({ count: 1 });
    const createdUser = tenantUser({
      id: 'staff-user-1',
      email: 'barber@example.test',
      phone: '+79990000000',
      branchId: 'branch-1',
      role: 'staff',
      encryptedName: 'enc:Илья',
    });
    createdUser.memberships![0] = {
      ...createdUser.memberships![0],
      branchId: 'branch-1',
      role: 'staff',
      branch: { id: 'branch-1', name: 'Main branch' },
    };
    const userCreateMock: jest.MockedFunction<
      (args: Record<string, unknown>) => Promise<UserRecord>
    > = jest.fn().mockResolvedValue(createdUser);
    const transactionMock = jest.fn(
      async (run: (tx: Record<string, unknown>) => Promise<unknown>) =>
        run({
          internalProvider: {
            findFirst: providerFindFirstMock,
            updateMany: providerUpdateManyMock,
          },
          user: { create: userCreateMock },
        }),
    );
    const tenantContext = new TenantContextService();
    const encryptionService = {
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
    } as unknown as EncryptionService;
    const service = new UsersService(
      { $transaction: transactionMock } as unknown as PrismaService,
      encryptionService,
      tenantContext,
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.createStaffUserForInternalProvider({
        tenantId: 'tenant-1',
        providerId: 'provider-2',
        email: 'BARBER@example.test',
        phone: '+7 (999) 000-00-00',
        passwordHash: 'hash',
      }),
    );

    const createArgs = userCreateMock.mock.calls[0][0];
    expect(createArgs.data).toEqual(
      expect.objectContaining({
        tenantId: 'tenant-1',
        branchId: 'branch-1',
        email: 'barber@example.test',
        role: 'staff',
      }),
    );
    expect(providerUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: 'provider-2',
        tenantId: 'tenant-1',
        userId: null,
        active: true,
      },
      data: { userId: 'staff-user-1' },
    });
    expect(result.role).toBe('staff');
  });

  it('rolls back provider-account creation when a concurrent link wins', async () => {
    const transactionMock = jest.fn(
      async (run: (tx: Record<string, unknown>) => Promise<unknown>) =>
        run({
          internalProvider: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'provider-2',
              branchId: null,
              displayName: 'Илья',
              userId: null,
              active: true,
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          user: {
            create: jest.fn().mockResolvedValue(
              tenantUser({
                id: 'staff-user-1',
                email: 'barber@example.test',
                role: 'staff',
              }),
            ),
          },
        }),
    );
    const tenantContext = new TenantContextService();
    const service = new UsersService(
      { $transaction: transactionMock } as unknown as PrismaService,
      {
        encrypt: (value: string) => `enc:${value}`,
        decrypt: (value: string) => value.replace(/^enc:/, ''),
      } as EncryptionService,
      tenantContext,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.createStaffUserForInternalProvider({
          tenantId: 'tenant-1',
          providerId: 'provider-2',
          email: 'barber@example.test',
          passwordHash: 'hash',
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('legacy CRM provisioning cannot create staff identities or access', async () => {
    const service = Object.create(UsersService.prototype) as UsersService;
    await expect(
      service.provisionCrmTeamAccess({
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-one',
        ownerUserId: 'owner',
        members: [],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects CRM role provisioning outside the active tenant context', async () => {
    const transaction = jest.fn();
    const service = new UsersService(
      { $transaction: transaction } as unknown as PrismaService,
      {
        encrypt: (value: string) => `enc:${value}`,
        decrypt: (value: string) => value.replace(/^enc:/, ''),
      } as EncryptionService,
      new TenantContextService(),
    );

    await expect(
      service.provisionCrmTeamAccess({
        tenantId: 'tenant-b',
        tenantSlug: 'tenant-b',
        ownerUserId: 'owner-b',
        members: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('lists owner, active and pending CRM access without exposing synthetic phone emails', async () => {
    const tenantContext = new TenantContextService();
    const service = new UsersService(
      {
        crmIntegration: {
          findUnique: jest.fn(() => Promise.resolve({ provider: 'yclients' })),
        },
        staffProviderLink: {
          findFirst: jest.fn(() =>
            Promise.resolve({ staffId: 'staff-existing' }),
          ),
          create: jest.fn(() => Promise.resolve({ id: 'link-1' })),
        },
        staff: {
          create: jest.fn(() => Promise.resolve({ id: 'staff-new' })),
        },
        crmStaffAccess: {
          findMany: jest.fn().mockResolvedValue([
            {
              externalStaffId: 'crm-owner',
              userId: 'owner-1',
              encryptedDisplayName: 'enc:Владелец',
              title: 'Владелец',
              role: UserRole.TENANT_ADMIN,
              status: 'active',
              user: {
                id: 'owner-1',
                email: 'owner@example.test',
                phone: '+79990000000',
              },
            },
            {
              externalStaffId: 'crm-admin',
              userId: 'admin-1',
              encryptedDisplayName: 'enc:Антон',
              title: 'Администратор',
              role: UserRole.ADMINISTRATOR,
              status: 'active',
              user: {
                id: 'admin-1',
                email: 'phone-79991112233@tenant-one.client.local',
                phone: '+79991112233',
              },
            },
            {
              externalStaffId: 'crm-master',
              userId: null,
              encryptedDisplayName: 'enc:Илья',
              title: 'Барбер',
              role: UserRole.STAFF,
              status: 'pending_contact',
              user: null,
            },
          ]),
        },
      } as unknown as PrismaService,
      {
        encrypt: (value: string) => `enc:${value}`,
        decrypt: (value: string) => value.replace(/^enc:/, ''),
      } as EncryptionService,
      tenantContext,
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.listCrmTeamAccess('tenant-1', 'owner-1'),
    );

    expect(result).toMatchObject({
      total: 3,
      active_accounts: 2,
      pending_contacts: 1,
      disabled_accounts: 0,
    });
    expect(result.items[0]).toMatchObject({
      display_name: 'Владелец',
      is_owner: true,
      email: 'owner@example.test',
    });
    expect(
      result.items.find((item) => item.external_staff_id === 'crm-admin'),
    ).toMatchObject({
      display_name: 'Антон',
      email: null,
      phone: '+79991112233',
      can_login: true,
    });
  });

  it('activates pending CRM staff access when the owner adds an email', async () => {
    const accessUpdate = jest.fn().mockResolvedValue({});
    type UserCreateArgs = {
      data: {
        tenantId: string;
        branchId: string | null;
        email: string;
        role: UserRole;
        [key: string]: unknown;
      };
      select: { id: boolean };
    };
    const userCreate: jest.MockedFunction<
      (args: UserCreateArgs) => Promise<{ id: string }>
    > = jest.fn().mockResolvedValue({ id: 'staff-user-1' });
    const transaction = jest.fn(
      async (run: (tx: Record<string, unknown>) => Promise<unknown>) =>
        run({
          crmIntegration: {
            findUnique: jest.fn(() =>
              Promise.resolve({ provider: 'yclients' }),
            ),
          },
          staffProviderLink: {
            findFirst: jest.fn(() =>
              Promise.resolve({ staffId: 'staff-existing' }),
            ),
            create: jest.fn(() => Promise.resolve({ id: 'link-1' })),
          },
          staff: {
            create: jest.fn(() => Promise.resolve({ id: 'staff-new' })),
          },
          crmStaffAccess: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'access-1',
              externalStaffId: 'crm-master',
              userId: null,
              encryptedDisplayName: 'enc:Илья',
              title: 'Барбер',
              role: UserRole.STAFF,
              status: 'pending_contact',
              user: null,
            }),
            update: accessUpdate,
          },
          user: {
            findMany: jest.fn().mockResolvedValue([]),
            create: userCreate,
          },
          tenant: {
            findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-one' }),
          },
          branch: {
            findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }),
          },
          membership: { updateMany: jest.fn() },
          authSession: { updateMany: jest.fn() },
        }),
    );
    const tenantContext = new TenantContextService();
    const canonicalExecute = jest.fn().mockResolvedValue({});
    const service = new UsersService(
      {
        $transaction: transaction,
        crmIntegration: {
          findUnique: jest.fn(() => Promise.resolve({ provider: 'yclients' })),
        },
        staffProviderLink: {
          findFirst: jest.fn(() =>
            Promise.resolve({ staffId: 'staff-existing' }),
          ),
          create: jest.fn(() => Promise.resolve({ id: 'link-1' })),
        },
        staff: {
          create: jest.fn(() => Promise.resolve({ id: 'staff-new' })),
        },
        crmStaffAccess: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'access-1',
            externalStaffId: 'crm-master',
            userId: null,
            role: UserRole.STAFF,
            status: 'pending_contact',
            user: null,
          }),
          findMany: jest.fn().mockResolvedValue([
            {
              externalStaffId: 'crm-master',
              userId: 'staff-user-1',
              encryptedDisplayName: 'enc:Илья',
              title: 'Барбер',
              role: UserRole.STAFF,
              status: 'active',
              user: {
                id: 'staff-user-1',
                email: 'ilya@example.test',
                phone: null,
              },
            },
          ]),
        },
        user: { findMany: jest.fn().mockResolvedValue([]) },
        tenant: {
          findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-one' }),
        },
        branch: {
          findFirst: jest.fn().mockResolvedValue({ id: 'branch-1' }),
        },
      } as unknown as PrismaService,
      {
        encrypt: (value: string) => `enc:${value}`,
        decrypt: (value: string) => value.replace(/^enc:/, ''),
        opaqueReference: (_purpose: string, value: string) => `ref:${value}`,
      } as EncryptionService,
      tenantContext,
      {
        intentRef: jest.fn().mockReturnValue('request-crm-access'),
        deterministicTargetId: jest.fn().mockReturnValue('staff-user-1'),
        execute: canonicalExecute,
      } as unknown as Package5Wave2CanonicalCutoverService,
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.updateCrmTeamAccess({
        tenantId: 'tenant-1',
        actorUserId: 'owner-1',
        externalStaffId: 'crm-master',
        update: { role: UserRole.STAFF, email: 'ILYA@example.test' },
      }),
    );

    expect(canonicalExecute).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'owner-1' },
      expect.objectContaining({
        operation: 'configure_staff_access',
        accessId: 'access-1',
        role: UserRole.STAFF,
        // Jest asymmetric matchers are intentionally nested here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        login: expect.objectContaining({
          userId: 'staff-user-1',
          branchId: 'branch-1',
          email: 'ilya@example.test',
        }),
      }),
      'request-crm-access',
    );
    expect(userCreate).not.toHaveBeenCalled();
    expect(accessUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      external_staff_id: 'crm-master',
      email: 'ilya@example.test',
      can_login: true,
    });
  });

  it('links the authenticated tenant owner to an unclaimed CRM employee', async () => {
    const accessUpdate = jest.fn().mockResolvedValue({});
    const accessFindFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'access-owner',
        externalStaffId: 'crm-owner',
        userId: null,
        role: UserRole.STAFF,
        status: 'pending_contact',
      })
      .mockResolvedValueOnce(null);
    const transaction = jest.fn(
      async (run: (tx: Record<string, unknown>) => Promise<unknown>) =>
        run({
          membership: {
            findFirst: jest
              .fn()
              .mockResolvedValue({ role: UserRole.TENANT_ADMIN }),
          },
          crmIntegration: {
            findUnique: jest.fn(() =>
              Promise.resolve({ provider: 'yclients' }),
            ),
          },
          staffProviderLink: {
            findFirst: jest.fn(() =>
              Promise.resolve({ staffId: 'staff-existing' }),
            ),
            create: jest.fn(() => Promise.resolve({ id: 'link-1' })),
          },
          staff: {
            create: jest.fn(() => Promise.resolve({ id: 'staff-new' })),
          },
          crmStaffAccess: {
            findFirst: accessFindFirst,
            update: accessUpdate,
          },
        }),
    );
    const tenantContext = new TenantContextService();
    const canonicalExecute = jest.fn().mockResolvedValue({});
    const service = new UsersService(
      {
        $transaction: transaction,
        crmIntegration: {
          findUnique: jest.fn(() => Promise.resolve({ provider: 'yclients' })),
        },
        staffProviderLink: {
          findFirst: jest.fn(() =>
            Promise.resolve({ staffId: 'staff-existing' }),
          ),
          create: jest.fn(() => Promise.resolve({ id: 'link-1' })),
        },
        staff: {
          create: jest.fn(() => Promise.resolve({ id: 'staff-new' })),
        },
        crmStaffAccess: {
          findFirst: jest.fn().mockResolvedValue({ id: 'access-owner' }),
          findMany: jest.fn().mockResolvedValue([
            {
              externalStaffId: 'crm-owner',
              userId: 'owner-1',
              encryptedDisplayName: 'enc:Стас Мосин',
              title: 'Барбер',
              role: UserRole.TENANT_ADMIN,
              status: 'active',
              user: {
                id: 'owner-1',
                email: 'owner@example.test',
                phone: '+79990000000',
              },
            },
          ]),
        },
      } as unknown as PrismaService,
      {
        encrypt: (value: string) => `enc:${value}`,
        decrypt: (value: string) => value.replace(/^enc:/, ''),
      } as EncryptionService,
      tenantContext,
      {
        execute: canonicalExecute,
      } as unknown as Package5Wave2CanonicalCutoverService,
    );

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.claimCrmTeamOwner({
        tenantId: 'tenant-1',
        actorUserId: 'owner-1',
        externalStaffId: 'crm-owner',
      }),
    );

    expect(canonicalExecute).toHaveBeenCalledWith(
      'tenant-1',
      { userId: 'owner-1' },
      { operation: 'claim_team_owner', accessId: 'access-owner' },
    );
    expect(accessUpdate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      external_staff_id: 'crm-owner',
      is_owner: true,
      can_login: true,
    });
  });

  it('does not let a non-owner claim the CRM owner identity', async () => {
    const transaction = jest.fn(
      async (run: (tx: Record<string, unknown>) => Promise<unknown>) =>
        run({
          membership: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
    );
    const tenantContext = new TenantContextService();
    const canonicalExecute = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('Owner role required'));
    const service = new UsersService(
      {
        $transaction: transaction,
        crmIntegration: {
          findUnique: jest.fn().mockResolvedValue({ provider: 'yclients' }),
        },
        staffProviderLink: {
          findFirst: jest.fn().mockResolvedValue({ staffId: 'staff-existing' }),
        },
        crmStaffAccess: {
          findFirst: jest.fn().mockResolvedValue({ id: 'access-owner' }),
        },
      } as unknown as PrismaService,
      {
        encrypt: (value: string) => `enc:${value}`,
        decrypt: (value: string) => value.replace(/^enc:/, ''),
      } as EncryptionService,
      tenantContext,
      {
        execute: canonicalExecute,
      } as unknown as Package5Wave2CanonicalCutoverService,
    );

    await expect(
      tenantContext.runAsSystemTenant('tenant-1', () =>
        service.claimCrmTeamOwner({
          tenantId: 'tenant-1',
          actorUserId: 'staff-1',
          externalStaffId: 'crm-owner',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
