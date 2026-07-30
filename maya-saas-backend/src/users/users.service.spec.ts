import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
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
    const encryptMock: jest.MockedFunction<(value: string) => string> = jest
      .fn()
      .mockImplementation((value: string) => `enc:${value}`);
    const decryptMock: jest.MockedFunction<(value: string) => string> = jest
      .fn()
      .mockImplementation((value: string) => value.replace(/^enc:/, ''));

    const prisma: Pick<PrismaService, 'user'> = {
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

    return {
      service: new UsersService(
        prisma as PrismaService,
        encryptionService as EncryptionService,
        tenantContext,
      ),
      tenantContext,
      mocks: {
        decryptMock,
        encryptMock,
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

  it('allows completing the current user phone when it is still missing', async () => {
    const {
      service,
      tenantContext,
      mocks: { userFindFirstMock, userFindUniqueMock, userUpdateMock },
    } = createService();
    const userWithoutPhone = {
      ...baseUser(),
      phone: null,
    };

    userFindUniqueMock.mockResolvedValue(userWithoutPhone);
    userFindFirstMock.mockResolvedValueOnce(null);
    userUpdateMock.mockResolvedValue({
      ...userWithoutPhone,
      phone: '+79991112233',
    });

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.updateCurrentUserProfile('user-1', {
        phone: '8 (999) 111-22-33',
      }),
    );

    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        phone: '+79991112233',
      },
      include: {
        tenant: true,
        branch: true,
      },
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
});
