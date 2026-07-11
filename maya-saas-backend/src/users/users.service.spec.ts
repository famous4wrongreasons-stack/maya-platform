import { ForbiddenException, NotFoundException } from '@nestjs/common';

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

    const result = await service.updateCurrentUserProfile('user-1', {
      phone: '8 (999) 111-22-33',
    });

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
    userFindFirstMock.mockResolvedValue(baseUser());

    const result = await tenantContext.runAsSystemTenant('tenant-1', () =>
      service.getTenantUserOrThrow('user-1', 'tenant-1'),
    );

    expect(result.id).toBe('user-1');
    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        tenantId: 'tenant-1',
        memberships: {
          some: {
            tenantId: 'tenant-1',
            status: 'active',
          },
        },
      },
      include: {
        tenant: true,
        branch: true,
      },
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
    userFindFirstMock.mockResolvedValueOnce(baseUser()).mockResolvedValueOnce({
      ...baseUser(),
      encryptedName: 'enc:Алексей',
    });

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
        tenantId: 'tenant-1',
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
      mocks: { userFindFirstMock, userFindManyMock },
    } = createService();

    const legacyUser = {
      ...baseUser(),
      phone: '8 (999) 000-00-00',
    };

    userFindFirstMock.mockResolvedValue(null);
    userFindManyMock.mockResolvedValue([legacyUser]);

    const result = await service.findTenantUserByPhone(
      'tenant-1',
      '+79990000000',
    );

    expect(result?.id).toBe('user-1');
    expect(userFindFirstMock).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        phone: '+79990000000',
        memberships: {
          some: {
            tenantId: 'tenant-1',
            status: 'active',
          },
        },
      },
      include: {
        tenant: true,
        branch: true,
      },
    });
  });
});
